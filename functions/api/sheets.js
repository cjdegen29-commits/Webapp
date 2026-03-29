// webapp/functions/api/sheets.js

function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie');
    if (!cookieString) return null;
    const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}

export async function onRequestPost(context) {
    try {
        const payload = await context.request.json();
        
        // 1. Session & Auth Check
        const sessionId = getCookie(context.request, 'session_id');
        if (!sessionId) {
            return new Response(JSON.stringify({ error: "Unauthorized. Please log in first." }), { status: 401 });
        }

        const accessToken = await context.env.AUTH_KV.get(`session:${sessionId}`);
        if (!accessToken) {
            return new Response(JSON.stringify({ error: "Session expired. Please log in again." }), { status: 401 });
        }

        // 2. Parse date for Sheet Name and Row
        const dateStr = payload.distributor_summary?.date || payload.gross_profit?.date || payload.payments_received?.date;
        if (!dateStr) throw new Error("No date found in OCR results.");

        const [mStr, dStr, yStr] = dateStr.split('/');
        const monthIndex = parseInt(mStr) - 1;
        const day = parseInt(dStr);
        const year = yStr;

        const monthNames = [
            "January", "Febuary", "March", "April", "May", "June", 
            "July", "August", "September", "October", "November", "December"
        ];
        
        // Construct target: e.g., "March 2026" and Row 6 for Day 4
        const sheetName = `${monthNames[monthIndex]} ${year}`;
        const targetRow = day + 2; 

        // 3. Mapping strictly for Columns J through P (7 columns total)
        const range = `${sheetName}!J${targetRow}:P${targetRow}`;

        const rowValues = [
            payload.gross_profit?.distributor_gross_profit || 0,       // Col J: Gross Sales
            payload.distributor_summary?.total_absorptions_odf || 0,   // Col K: Total Abs (OD)
            payload.distributor_summary?.total_absorptions_dist || 0,  // Col L: Total Abs (Dist)
            payload.distributor_summary?.gst_hst_charged || 0,         // Col M: GST/HST
            payload.payments_received?.total_cash || 0,                // Col N: Cash Collected
            payload.payments_received?.total_check || 0,               // Col O: Total Chq.
            payload.distributor_summary?.total_old_dutch_credits || 0  // Col P: Total OD Credits
        ];

        // 4. Update via PUT to avoid creating new rows
        const spreadsheetId = context.env.TARGET_SPREADSHEET_ID;
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