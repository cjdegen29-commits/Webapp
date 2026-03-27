import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';

dotenv.config();

/**
 * CORE LOGIC: Processes an array of images for cross-receipt validation
 */
async function processReceipts(images) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `
    You will receive images of three types of receipts: 'Distributor's Summary', 'Distributor's Gross Profit', and 'Payments Received'.
    
    Extract the data into the following JSON format. Ensure all currency values are Numbers (not strings) and dates are MM/DD/YYYY.

    JSON Structure:
    {
      "distributor_summary": {
        "date": "MM/DD/YYYY",
        "gst_hst_charged": 0.0,
        "total_absorptions_odf": 0.0, 
        "total_absorptions_dist": 0.0,
        "total_old_dutch_credits": 0.0
      },
      "gross_profit": {
        "date": "MM/DD/YYYY",
        "distributor_gross_profit": 0.0
      },
      "payments_received": {
        "date": "MM/DD/YYYY",
        "total_cash": 0.0,
        "total_check": 0.0
      },
      "metadata": {
        "dates_consistent": boolean
      }
    }

    Specific Extraction Rules:
    1. For 'Distributor's Summary':
       - 'total_absorptions_odf' is the value in the 'TOTAL' row under the 'ODF' column.
       - 'total_absorptions_dist' is the value in the 'TOTAL' row under the 'DIST' column.
       - 'total_old_dutch_credits' is found next to 'TOTAL OLD DUTCH CREDITS'.
    2. For 'Distributor's Gross Profit':
       - 'distributor_gross_profit' is the final value labeled 'DISTRIBUTOR'S GROSS PROFIT'.
    3. Date Validation:
       - Compare the dates across all provided receipts. 
       - Set 'dates_consistent' to true only if all extracted dates match exactly.
       - If dates do NOT match, set 'dates_consistent' to false and return null for ALL other fields.
    4. General:
       - If a receipt type or specific field is not found, return null for that field.
  `;

  // Convert images to the base64 format expected by the Gemini 3 Flash model
  const imageParts = images.map(img => ({
    inlineData: { data: img.base64, mimeType: img.mimeType }
  }));

  // Send the prompt and images to the Gemini 3 Flash model
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    config: { responseMimeType: "application/json" },
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          ...imageParts
        ]
      }
    ]
  });

  // Parse and return the JSON response from the model
  return JSON.parse(response.text);
}

/**
 * VERCEL HANDLER
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send("Method Not Allowed");
  
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: "Expected an array of images" });
    }
    
    const data = await processReceipts(images);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * TERMINAL TESTING
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filePaths = process.argv.slice(2);
  
  if (filePaths.length === 0) {
    console.error("Please provide at least one image file path.");
    process.exit(1);
  }

  console.log(`--- Testing Gemini 3 Flash on ${filePaths.length} files ---`);

  const imagesForAI = filePaths.map(filePath => {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).replace('.', '').toLowerCase();
    
    // Correctly map the extension to the full MIME type string
    const mimeType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';

    return {
      base64: buffer.toString('base64'),
      mimeType: mimeType
    };
  });

  processReceipts(imagesForAI)
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(err => console.error("Extraction Error:", err));
}