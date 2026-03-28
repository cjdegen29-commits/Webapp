// webapp/functions/api/auth/callback.js

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const code = url.searchParams.get('code');

    if (!code) {
        return new Response("Missing authorization code", { status: 400 });
    }

    try {
        // 1. Exchange the code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: context.env.GOOGLE_CLIENT_ID,
                client_secret: context.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: context.env.GOOGLE_REDIRECT_URI,
                grant_type: 'authorization_code'
            })
        });

        const tokens = await tokenResponse.json();

        if (tokens.error) {
            throw new Error(tokens.error_description || tokens.error);
        }

        // 2. Generate a random session ID
        const sessionId = crypto.randomUUID();

        // 3. Store the access token in Cloudflare KV (expires automatically based on Google's token expiry, usually 3600s)
        await context.env.AUTH_KV.put(`session:${sessionId}`, tokens.access_token, {
            expirationTtl: tokens.expires_in
        });

        // 4. Set the session cookie and redirect back to the main app
        const headers = new Headers();
        headers.append('Set-Cookie', `session_id=${sessionId}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${tokens.expires_in}`);
        headers.append('Location', '/');

        return new Response(null, {
            status: 302,
            headers: headers
        });

    } catch (error) {
        return new Response(`Authentication Error: ${error.message}`, { status: 500 });
    }
}