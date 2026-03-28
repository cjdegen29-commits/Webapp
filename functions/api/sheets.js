// webapp/functions/api/sheets.js

// Helper to parse cookies
function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie');
    if (!cookieString) return null;
    const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}

export async function onRequestPost(context) {
    try {
        const payload = await context.request.json();
        
        // 1. Get the session ID from the cookie
        const sessionId = getCookie(context.request, 'session_id');
        if (!sessionId) {
            return new Response(JSON.stringify({ error: "Unauthorized. Please log in first." }), { status: 401 });
        }

        // 2. Retrieve the Google Access Token from KV
        const accessToken = await context.env.AUTH_KV.get(`session:${sessionId}`);
        if (!accessToken) {
            return new Response(JSON.stringify({ error: "Session expired. Please log in again." }), { status: 401 });
        }

        const spreadsheetId = context.env.TARGET_SPREADSHEET_ID;
        const range = "Sheet1!A:E"; // Change 'Sheet1' if their tab is named differently

        // 3. Flatten the JSON payload into a Google Sheets row array
        const rowData = [
            payload.distributor_summary?.date || "N/A",
            payload.distributor_summary?.total_absorptions_odf || 0,
            payload.distributor_summary?.total_absorptions_dist || 0,
            payload.gross_profit?.distributor_gross_profit || 0,
            payload.payments_received?.total_cash || 0
        ];

        // 4. Send to Google Sheets API
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [rowData]
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