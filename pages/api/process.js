import formidable from "formidable";
import fs from "fs";
import axios from "axios";
import ExcelJS from "exceljs";

export const config = {
  api: {
    bodyParser: false,
  },
    maxDuration: 60,
};

const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = await parseForm(req);
console.log("FILES:", files);
    let imageFiles = files.images;
    if (!imageFiles) {
      return res.status(400).json({ error: "Please upload at least one image" });
    }
    if (!Array.isArray(imageFiles)) imageFiles = [imageFiles];

    // 1. Extract entries from every image — Gemini first, OCR.space+Groq as fallback
    const geminiEntries = [];
    const fallbackOcrChunks = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const result = await extractEntriesForImage(imageFiles[i]);
      if (result.entries) {
        geminiEntries.push(...result.entries);
      } else if (result.ocrText) {
        fallbackOcrChunks.push(`--- Image ${i + 1} ---\n${result.ocrText}`);
      }
    }

    let fallbackEntries = [];
    if (fallbackOcrChunks.length) {
      fallbackEntries = await runGroq(fallbackOcrChunks.join("\n\n"));
    }

    const rawEntries = [...geminiEntries, ...fallbackEntries];
    if (!rawEntries.length) {
      return res.status(400).json({
        error: "Could not find any phone entries in the uploaded images. Try clearer, well-lit photos.",
      });
    }

    // 2. Normalize into clean rows (used for both the Excel file and the dashboard)
    const cleanRows = rawEntries.map((e) => {
      const purchase = parseNumber(e["Phone Purchased Price"]);
      const selling = parseNumber(e["Phone Selling Price"]);
      let profit = parseNumber(e["Profit"]);
      if (isNaN(profit) && !isNaN(purchase) && !isNaN(selling)) {
        profit = selling - purchase;
      }
      return {
        name: e["Phone Name"] || "",
        imei: e["Phone IMEI"] || "",
        purchase: isNaN(purchase) ? 0 : purchase,
        selling: isNaN(selling) ? 0 : selling,
        profit: isNaN(profit) ? 0 : profit,
      };
    });

    // 3. Load an existing workbook, or create a new one
    const excelFile = files.excel;
    const workbook = new ExcelJS.Workbook();
    let sheet;
    const COLUMNS = [
      "Phone Name",
      "Phone IMEI",
      "Phone Purchased Price",
      "Phone Selling Price",
      "Profit",
    ];

    if (excelFile) {
      const buffer = fs.readFileSync(excelFile.filepath);
      await workbook.xlsx.load(buffer);
      sheet = workbook.worksheets[0];
      if (sheet.rowCount === 0) {
        sheet.addRow(COLUMNS);
        styleHeader(sheet);
      }
    } else {
      sheet = workbook.addWorksheet("Phone Inventory");
      sheet.addRow(COLUMNS);
      styleHeader(sheet);
    }

    cleanRows.forEach((row) => {
      const excelRow = sheet.addRow([row.name, row.imei, row.purchase, row.selling, row.profit]);
      styleDataRow(excelRow, sheet.rowCount);
    });

    setColumnWidths(sheet);
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // 4. Send back JSON: the file (as base64) + the structured data for the dashboard
    const outBuffer = await workbook.xlsx.writeBuffer();
    const fileBase64 = Buffer.from(outBuffer).toString("base64");

    return res.status(200).json({
      fileBase64,
      fileName: "phone_inventory.xlsx",
      entries: cleanRows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function parseNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return NaN;
  const cleaned = String(val).replace(/[,\s]/g, "");
  return cleaned === "" ? NaN : parseFloat(cleaned);
}

// ---------- Extraction: Gemini first, OCR.space+Groq fallback ----------

async function extractEntriesForImage(imageFile) {
  let lastGeminiError;

  for (const model of GEMINI_MODELS) {
    try {
      const entries = await extractEntriesFromImageWithGemini(imageFile, model);
      if (entries.length) return { entries, source: `Gemini (${model})` };
      lastGeminiError = `Gemini (${model}) returned no entries`;
    } catch (err) {
      lastGeminiError = describeApiError(`Gemini (${model})`, err);
      console.warn(lastGeminiError);
    }
  }

  // Both Gemini models failed or found nothing — fall back to OCR.space
  try {
    const text = await runOcr(imageFile);
    return { ocrText: text, source: "OCR.space (fallback)" };
  } catch (err) {
    throw new Error(
      `Could not process one of the images. ${lastGeminiError || ""} Also, OCR.space fallback failed: ${describeApiError(
        "OCR.space",
        err
      )}`
    );
  }
}

async function extractEntriesFromImageWithGemini(imageFile, model) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment variables");

  const imageBuffer = fs.readFileSync(imageFile.filepath);
  const base64Image = imageBuffer.toString("base64");
  const mimeType = imageFile.mimetype || "image/jpeg";

  const prompt = `You are reading a photo of a handwritten mobile phone shop ledger page. The ledger has Urdu column headers, but entries are handwritten in Latin script/numbers, one phone per line. The visual order left to right is generally:
serial number + Phone Model name, then a 4-digit number (this is an IMEI identifier, NOT a running balance), then Purchased Price, then Selling Price, then further right, the Profit.
Carefully read every row on the page, even faint or cramped handwriting, and extract for EACH phone entry:
- "Phone Name": the phone model/label (e.g. "NOTE50", "Y200", "Redmi A3")
- "Phone IMEI": the 4-digit number right after the phone name
- "Phone Purchased Price": the purchase/cost amount for that phone
- "Phone Selling Price": the sale amount for that phone
- "Profit": the profit amount. If not clearly written, calculate it as Selling Price minus Purchased Price.
Skip section headers, dates, and page numbers — only actual phone entries.
Respond ONLY with a JSON object of this exact shape, nothing else:
{"entries": [{"Phone Name": "...", "Phone IMEI": "...", "Phone Purchased Price": 0, "Phone Selling Price": 0, "Profit": 0}]}`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Image } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        response_mime_type: "application/json",
      },
    },
    { headers: { "Content-Type": "application/json" } }
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini (${model}) returned an empty response`);
  const parsed = JSON.parse(text);
  return Array.isArray(parsed.entries) ? parsed.entries : [];
}

// ---------- OCR.space fallback ----------

async function runOcr(imageFile) {
  const apiKey = (process.env.OCR_SPACE_API_KEY || "").trim();
  if (!apiKey) throw new Error("OCR_SPACE_API_KEY is not set in environment variables");

  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("language", "eng");
  form.append("OCREngine", "2");
  form.append("isOverlayRequired", "false");
  form.append("isTable", "true");
  form.append("scale", "true");
  form.append("detectOrientation", "true");
  form.append("file", fs.createReadStream(imageFile.filepath), imageFile.originalFilename);

  const response = await axios.post("https://api.ocr.space/parse/image", form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
  });

  const data = response.data;
  if (data.IsErroredOnProcessing) {
    throw new Error(data.ErrorMessage?.[0] || "OCR.space processing failed");
  }
  return data.ParsedResults?.[0]?.ParsedText || "";
}

// ---------- Groq fallback structuring ----------

async function runGroq(ocrText) {
  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is not set in environment variables");

  const systemPrompt = `You are given OCR text extracted from photos of a handwritten mobile phone shop ledger. The ledger has Urdu column headers, but entries are handwritten in Latin script/numbers. Each line typically looks like:
"<serial>) <PhoneModel>   <4-digit IMEI>   <PurchasedPrice>   <SellingPrice>   ...   <Profit>"
For every distinct phone entry, extract:
- "Phone Name": the phone model/label
- "Phone IMEI": the 4-digit number right after the phone name
- "Phone Purchased Price": the purchase amount
- "Phone Selling Price": the sale amount
- "Profit": if not explicit, calculate Selling Price minus Purchased Price
Skip section headers, dates, and page numbers.
Respond ONLY with: {"entries": [{"Phone Name": "...", "Phone IMEI": "...", "Phone Purchased Price": 0, "Phone Selling Price": 0, "Profit": 0}]}
No explanations, no markdown.`;

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: ocrText },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  const content = response.data.choices[0].message.content;
  const parsed = JSON.parse(content);
  return Array.isArray(parsed.entries) ? parsed.entries : [];
}

// ---------- Error description helper (this is what kills the mystery 401s) ----------

function describeApiError(service, err) {
  if (err.response) {
    const status = err.response.status;
    const detail =
      err.response.data?.error?.message ||
      err.response.data?.ErrorMessage?.[0] ||
      JSON.stringify(err.response.data || {}).slice(0, 200);
    if (status === 401 || status === 403) {
      return `${service} rejected the API key (HTTP ${status}). Check the key value in your env vars — no stray spaces/quotes — and confirm it's set for the environment you're testing (Production/Preview/Development on Vercel). Detail: ${detail}`;
    }
    return `${service} error (HTTP ${status}): ${detail}`;
  }
  return `${service} error: ${err.message}`;
}

// ---------- Excel styling ----------

function styleHeader(sheet) {
  const header = sheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF4C1D95" } } };
  });
}

function styleDataRow(row, rowNumber) {
  const isEven = rowNumber % 2 === 0;
  row.eachCell((cell, colNumber) => {
    cell.alignment = { vertical: "middle", horizontal: colNumber === 1 ? "left" : "center" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isEven ? "FFF5F3FF" : "FFFFFFFF" },
    };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
    if (colNumber === 3 || colNumber === 4 || colNumber === 5) {
      cell.numFmt = '"Rs" #,##0';
    }
  });
}

function setColumnWidths(sheet) {
  sheet.columns = [{ width: 26 }, { width: 16 }, { width: 20 }, { width: 20 }, { width: 16 }];
}