// webapp/functions/api/sheets.js

function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie');
    if (!cookieString) return null;
    const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}

async function getSessionAndToken(context) {
    const sessionId = getCookie(context.request, 'session_id');
    if (!sessionId) {
        return { error: new Response(JSON.stringify({ error: "Unauthorized. Please log in first." }), { status: 401 }) };
    }
    const accessToken = await context.env.AUTH_KV.get(`session:${sessionId}`);
    if (!accessToken) {
        return { error: new Response(JSON.stringify({ error: "Session expired. Please log in again." }), { status: 401 }) };
    }
    return { sessionId, accessToken };
}

function parseDateFromPayload(payload) {
    const dateStr = payload.distributor_summary?.date || payload.gross_profit?.date || payload.payments_received?.date;
    if (!dateStr) throw new Error("No date found in OCR results.");
    const [mStr, dStr, yStr] = dateStr.split('/');
    const monthIndex = Number.parseInt(mStr) - 1;
    const day = Number.parseInt(dStr);
    const year = yStr;
    const monthNames = [
        "January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"
    ];
    const sheetName = `${monthNames[monthIndex]} ${year}`;
    const targetRow = day + 2;
    return { sheetName, targetRow, monthIndex, year };
}

async function ensureSheetExists(spreadsheetId, sheetName, monthIndex, year, accessToken) {
    // Fetch Spreadsheet Metadata
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metaResponse = await fetch(metaUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!metaResponse.ok) {
        throw new Error(`Failed to fetch spreadsheet metadata: ${await metaResponse.text()}`);
    }
    const metaData = await metaResponse.json();
    let sheetExists = false;
    let templateSheetId = null;
    let templateSheetIndex = null;
    for (const sheet of metaData.sheets) {
        if (sheet.properties.title === sheetName) sheetExists = true;
        if (sheet.properties.title === "Template") {
            templateSheetId = sheet.properties.sheetId;
            templateSheetIndex = sheet.properties.index;
        }
    }
    if (!sheetExists) {
        if (templateSheetId === null) {
            throw new Error("A sheet named 'Template' was not found in the workbook.");
        }
        // Duplicate the template
        const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
        const duplicateReq = await fetch(batchUpdateUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [{
                    duplicateSheet: {
                        sourceSheetId: templateSheetId,
                        insertSheetIndex: templateSheetIndex,
                        newSheetName: sheetName
                    }
                }]
            })
        });
        if (!duplicateReq.ok) {
            throw new Error(`Failed to create new month sheet: ${await duplicateReq.text()}`);
        }
        // Set cell A2 to the first of the month
        const firstOfMonth = `${monthIndex + 1}/1/${year}`;
        const updateA2Url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A2?valueInputOption=USER_ENTERED`;
        await fetch(updateA2Url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [[firstOfMonth]]
            })
        });
    }
}

function buildRowValues(payload) {
    return [
        payload.distributor_summary?.gross_sales || 0,             // Col J: Gross Sales (from Summary)
        payload.distributor_summary?.total_absorptions_odf || 0,   // Col K: Total Abs (OD)
        payload.distributor_summary?.total_absorptions_dist || 0,  // Col L: Total Abs (Dist)
        payload.distributor_summary?.gst_hst_charged || 0,         // Col M: GST/HST
        payload.payments_received?.total_cash || 0,                // Col N: Cash Collected
        payload.payments_received?.total_check || 0,               // Col O: Total Chq.
        payload.distributor_summary?.total_old_dutch_credits || 0, // Col P: Total OD Credits
        null,                                                        // Col Q: Kristi's Magic (Empty)
        payload.gross_profit?.distributor_gross_profit || 0        // Col R: Gross Profit
    ];
}

export async function onRequestPost(context) {
    try {
        const payload = await context.request.json();

        // 1. Session & Auth Check
        const sessionResult = await getSessionAndToken(context);
        if (sessionResult.error) return sessionResult.error;
        const accessToken = sessionResult.accessToken;

        // 2. Parse date for Sheet Name and Row
        const { sheetName, targetRow, monthIndex, year } = parseDateFromPayload(payload);
        const spreadsheetId = payload.target_spreadsheet_id;
        if (!spreadsheetId) throw new Error("No target spreadsheet ID provided.");

        // 3. Ensure sheet exists
        await ensureSheetExists(spreadsheetId, sheetName, monthIndex, year, accessToken);

        // 4. Write the daily data row
        const range = `${encodeURIComponent(sheetName)}!J${targetRow}:R${targetRow}`;
        const rowValues = buildRowValues(payload);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [rowValues]
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google API Error: ${errorText}`);
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}