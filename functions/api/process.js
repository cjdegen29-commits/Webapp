// webapp/functions/api/process.js

const EXTRACTION_PROMPT = `
  You are a non-verbal specialized receipt parser.
  Identify if each receipt is 'summary', 'gross_profit', or 'payments'.
  
  Return ONLY a JSON object with a "receipts" key containing an array of objects:
  {
    "receipts": [
      {
        "receipt_type": "summary" | "gross_profit" | "payments",
        "date": "MM/DD/YYYY",
        "gst_hst_charged": 0.0,
        "total_absorptions_odf": 0.0,
        "total_absorptions_dist": 0.0,
        "total_old_dutch_credits": 0.0,
        "distributor_gross_profit": 0.0,
        "total_cash": 0.0,
        "total_check": 0.0
      }
    ]
  }

  Rules:
  - Use null for missing values.
  - 'total_absorptions' must come from the TOTAL row.
  - Output ONLY raw JSON. No markdown, no conversational text.
`;

/**
 * Helper to convert ArrayBuffer to Base64 without using Node.js 'Buffer'
 * This is compatible with standard Cloudflare Workers environment.
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCodePoint(bytes[i]);
  }
  return btoa(binary);
}

async function extractBatch(imageFiles, context) {
  const messages = [
    {
      role: "system",
      content: "You are a specialized financial OCR assistant. Return only raw JSON."
    },
    {
      role: "user",
      content: [{ type: "text", text: EXTRACTION_PROMPT }]
    }
  ];

  // Process each image file into the message sequence
  for (const file of imageFiles) {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    
    messages[1].content.push({
      type: "image_url",
      image_url: { url: `data:${file.type};base64,${base64}` }
    });
  }

  // AI Run with increased max_tokens and explicit JSON format
  const aiResponse = await context.env.AI.run("@cf/moonshotai/kimi-k2.5", {
    messages,
    max_tokens: 1800, 
    response_format: { type: "json_object" } 
  });

  return { raw: aiResponse.response };
}

function aggregateExtractions(validExtractions, rawOutput) {
  let masterRecord = {
    distributor_summary: null,
    gross_profit: null,
    payments_received: null,
    metadata: { dates_consistent: true },
    debug: []
  };

  let referenceDate = null;

  validExtractions.forEach((data, index) => {
    masterRecord.debug.push({
      file: `Image_${index + 1}`,
      raw_ai_output: rawOutput
    });

    if (!data) return;

    // Date Consistency Check
    if (data.date) {
      if (!referenceDate) referenceDate = data.date;
      else if (referenceDate !== data.date) {
        masterRecord.metadata.dates_consistent = false;
      }
    }

    // Map by receipt type
    if (data.receipt_type === 'summary') masterRecord.distributor_summary = data;
    if (data.receipt_type === 'gross_profit') masterRecord.gross_profit = data;
    if (data.receipt_type === 'payments') masterRecord.payments_received = data;
  });

  return masterRecord;
}

function applyDestructiveRule(masterRecord) {
  if (!masterRecord.metadata.dates_consistent) {
    masterRecord.distributor_summary = null;
    masterRecord.gross_profit = null;
    masterRecord.payments_received = null;
  }
  return masterRecord;
}

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const imageFiles = formData.getAll('receipts');

    if (!imageFiles || imageFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided." }), { status: 400 });
    }

    const { raw } = await extractBatch(imageFiles, context);
    
    let extractedArray = [];
    try {
      // Robust Parsing: Handle string responses or direct objects
      let parsed = typeof raw === 'string' ? JSON.parse(new RegExp(/\{[\s\S]*\}/).exec(raw)[0]) : raw;
      
      // Unwrap the 'receipts' key we requested in the prompt
      extractedArray = parsed.receipts || (Array.isArray(parsed) ? parsed : [parsed]);
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return new Response(JSON.stringify({ error: "AI failed to return valid JSON", raw }), { status: 500 });
    }

    let masterRecord = aggregateExtractions(extractedArray, raw);
    masterRecord = applyDestructiveRule(masterRecord);

    return new Response(JSON.stringify(masterRecord), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Worker Error: ${err.message}` }), { status: 500 });
  }
}

// Warmup/License check
export async function onRequestGet(context) {
  return new Response("Model endpoint active.");
}