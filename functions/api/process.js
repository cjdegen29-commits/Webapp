// webapp/functions/api/process.js

const SYSTEM_PROMPT = `
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
       - Do not return ANYTHING other than a .json string.
       - Use raw text strings without markdown or other formatting.
`;

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk_size = 8192;
  for (let i = 0; i < bytes.length; i += chunk_size) {
    const chunk = bytes.subarray(i, i + chunk_size);
    binary += String.fromCodePoint(...chunk);
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const imageFiles = formData.getAll('receipts');

    if (!imageFiles || imageFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No valid images provided." }), { status: 400 });
    }

    // Build the dynamic content array for Gemini
    const parts = [];

    for (const file of imageFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const base64Image = arrayBufferToBase64(arrayBuffer);
        const mediaType = file.type || "image/jpeg"; 

        parts.push({
            inlineData: {
                mimeType: mediaType,
                data: base64Image
            }
        });
    }

    // Add the final text instruction to the content array
    parts.push({
        text: "Extract the data from these receipts according to your system instructions."
    });

    // Call the Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${context.env.GEMINI_API_KEY}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: parts
          }
        ],
        generationConfig: {
          responseMimeType: "application/json", // Forces Gemini to output strictly parsable JSON
          temperature: 0.1 // Low temperature for factual OCR extraction
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text();
      throw new Error(`Gemini API Error: ${geminiResponse.status} - ${errorData}`);
    }

    const data = await geminiResponse.json();
    
    // Extract the text response from Gemini's payload structure
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
       throw new Error("No content returned from Gemini.");
    }

    let parsed = null;
    let errorMessage = null;

    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      errorMessage = e.message + ": Failed to parse JSON from Gemini's response.";
    }

    const finalResponse = parsed || { error: errorMessage, raw: rawText };

    return new Response(JSON.stringify(finalResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Worker Error: ${err.message}` }), { status: 500 });
  }
}