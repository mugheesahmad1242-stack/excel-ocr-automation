import formidable from "formidable";
import fs from "fs";
import axios from "axios";
import * as XLSX from "xlsx";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fields, files } = await parseForm(req);

    const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;
    if (!imageFile) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    // 1. OCR the image
    const ocrText = await runOcr(imageFile);
    if (!ocrText || ocrText.trim() === "") {
      return res.status(400).json({ error: "OCR could not read any text from the image" });
    }

    // 2. Load existing Excel (if provided) or set up columns for a new one
    const excelFile = Array.isArray(files.excel) ? files.excel[0] : files.excel;
    let workbook, sheetName, headers = [];

    if (excelFile) {
      const buffer = fs.readFileSync(excelFile.filepath);
      workbook = XLSX.read(buffer, { type: "buffer" });
      sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      headers = rows[0] || [];
    } else {
      const columnsField = Array.isArray(fields.columns) ? fields.columns[0] : fields.columns;
      headers = columnsField
        ? columnsField.split(",").map((c) => c.trim()).filter(Boolean)
        : [];
      if (headers.length === 0) {
        return res.status(400).json({
          error: "Please provide column names or upload an existing Excel file",
        });
      }
      workbook = XLSX.utils.book_new();
      sheetName = "Sheet1";
      const sheet = XLSX.utils.aoa_to_sheet([headers]);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    }

    // 3. Ask Groq to map the OCR text onto the Excel columns
    const rowData = await runGroq(ocrText, headers);

    // 4. Append the new row
    const sheet = workbook.Sheets[sheetName];
    const existingRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const newRow = headers.map((h) => rowData[h] ?? "");
    existingRows.push(newRow);
    workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(existingRows);

    // 5. Send the updated file back for download
    const outBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=updated_data.xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.status(200).send(outBuffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: false, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

async function runOcr(imageFile) {
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("apikey", process.env.OCR_SPACE_API_KEY);
  form.append("language", "eng");
  form.append("OCREngine", "2");
  form.append("isOverlayRequired", "false");
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

async function runGroq(ocrText, headers) {
  const systemPrompt = `You are a data extraction assistant. You will receive raw OCR text from a scanned document (receipt, form, invoice, etc.) and a list of Excel column names. Extract the correct value for each column from the OCR text. Respond ONLY with a valid JSON object whose keys are exactly the given column names and whose values are the extracted data as plain strings. If a value isn't found, use an empty string. No explanations, no markdown — JSON only.`;

  const userPrompt = `Column names: ${JSON.stringify(headers)}\n\nOCR extracted text:\n${ocrText}`;

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
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
  return JSON.parse(content);
}