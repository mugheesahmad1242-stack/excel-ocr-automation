import formidable from "formidable";
import fs from "fs";
import axios from "axios";
import ExcelJS from "exceljs";

export const config = {
  api: {
    bodyParser: false,
  },
};

const COLUMNS = [
  "Phone Name",
  "Phone IMEI",
  "Phone Purchased Price",
  "Phone Selling Price",
  "Profit",
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = await parseForm(req);

    let imageFiles = files.images;
    if (!imageFiles) {
      return res.status(400).json({ error: "Please upload at least one image" });
    }
    if (!Array.isArray(imageFiles)) imageFiles = [imageFiles];

    // 1. OCR every image
    const ocrChunks = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const text = await runOcr(imageFiles[i]);
      ocrChunks.push(`--- Image ${i + 1} ---\n${text}`);
    }
    const combinedText = ocrChunks.join("\n\n");

    // 2. Ask Groq to extract every phone entry across all images
    const entries = await runGroq(combinedText);
    if (!entries.length) {
      return res.status(400).json({
        error: "Could not find any phone entries in the uploaded images. Try clearer photos.",
      });
    }

    // 3. Load an existing workbook, or create a new one
    const excelFile = files.excel;
    const workbook = new ExcelJS.Workbook();
    let sheet;

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

    // 4. Append rows with formatting
    entries.forEach((e) => {
      const purchase = parseNumber(e["Phone Purchased Price"]);
      const selling = parseNumber(e["Phone Selling Price"]);
      let profit = parseNumber(e["Profit"]);
      if (isNaN(profit) && !isNaN(purchase) && !isNaN(selling)) {
        profit = selling - purchase;
      }

      const row = sheet.addRow([
        e["Phone Name"] || "",
        e["Phone IMEI"] || "",
        isNaN(purchase) ? "" : purchase,
        isNaN(selling) ? "" : selling,
        isNaN(profit) ? "" : profit,
      ]);
      styleDataRow(row, sheet.rowCount);
    });

    setColumnWidths(sheet);
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // 5. Send the file back
    const outBuffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Disposition", "attachment; filename=phone_inventory.xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.status(200).send(Buffer.from(outBuffer));
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

async function runOcr(imageFile) {
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("apikey", process.env.OCR_SPACE_API_KEY);
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
    throw new Error(data.ErrorMessage?.[0] || "OCR processing failed");
  }
  return data.ParsedResults?.[0]?.ParsedText || "";
}

async function runGroq(ocrText) {
  const systemPrompt = `You are given OCR text extracted from one or more photos of a handwritten mobile phone shop ledger. The ledger has Urdu column headers, but entries are handwritten in Latin script/numbers. Each line typically follows a pattern like:
"<serial>) <PhoneModel>   <runningBalance>   <PurchasedPrice>   <SellingPrice>   ...   <Profit>"
Handwriting and OCR noise can cause slight misalignment — use context and typical price ranges to identify fields correctly. For every distinct phone entry found across ALL the provided images, extract:
- "Phone Name": the phone model/label next to the serial number (e.g. "NOTE50", "Y200", "Redmi A3")
- "Phone IMEI": an empty string "" unless a clear IMEI-like 14-16 digit number appears near the entry
- "Phone Purchased Price": the purchase/cost amount for that phone
- "Phone Selling Price": the sale amount for that phone
- "Profit": the profit for that phone. If not explicitly written, calculate it as Selling Price minus Purchased Price.
Ignore running-balance/ledger-total numbers that don't represent an actual purchase or sale amount for a specific phone entry. Skip section headers, dates, and page numbers — only output actual phone entries.
Respond ONLY with a JSON object of this exact shape:
{"entries": [{"Phone Name": "...", "Phone IMEI": "...", "Phone Purchased Price": 0, "Phone Selling Price": 0, "Profit": 0}]}
Numbers must be plain numbers (no commas, no currency symbols, no quotes around numbers). No explanations, no markdown, no extra text.`;

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
   model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: ocrText },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const content = response.data.choices[0].message.content;
  const parsed = JSON.parse(content);
  return Array.isArray(parsed.entries) ? parsed.entries : [];
}

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
  sheet.columns = [
    { width: 26 },
    { width: 22 },
    { width: 20 },
    { width: 20 },
    { width: 16 },
  ];
}