// webapp/functions/api/auth/callback.js

// Helper function to extract cookies
function getCookie(request, name) {
    const cookieString = request.headers.get('Cookie');
    if (!cookieString) return null;
    const match = cookieString.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}

// Callback Endpoint: GET /api/auth/callback
// Usage: This is the redirect URI set in the Google Cloud Console for your OAuth credentials. Google will send users here after they authorize the app.
// Description: The return destination for Google OAuth. Validates the code, fetches the access token, and sets the HTTP-Only cookie to establish the session.
// Note: This endpoint is not meant to be called directly from the frontend. Instead, users are redirected here by Google after they complete the OAuth flow initiated at /api/auth/login.
// Security: We verify the state parameter to protect against CSRF attacks. We also ensure that the session cookie is HttpOnly and Secure to prevent XSS attacks and ensure it is only sent over HTTPS.
export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');

    // 1. Retrieve the state we saved in the user's cookie during login
    const savedState = getCookie(context.request, 'oauth_state');

    // 2. Verify the state matches exactly
    if (!returnedState || !savedState || returnedState !== savedState) {
        return new Response("Security Error: State mismatch. Possible CSRF attack.", { status: 403 });
    }

    if (!code) {
        return new Response("Missing authorization code", { status: 400 });
    }

    try {
        // Exchange the code for tokens
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

        // Generate a random session ID
        const sessionId = crypto.randomUUID();

        // Store the access token in Cloudflare KV 
        await context.env.AUTH_KV.put(`session:${sessionId}`, tokens.access_token, {
            expirationTtl: tokens.expires_in
        });

        const headers = new Headers();
        // Set the new session cookie
        headers.append('Set-Cookie', `session_id=${sessionId}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${tokens.expires_in}`);
        
        // 3. IMPORTANT: Clear the temporary state cookie now that we are done with it
        headers.append('Set-Cookie', `oauth_state=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`);
        
        // Redirect back to the main app
        headers.append('Location', '/');

        return new Response(null, {
            status: 302,
            headers: headers
        });

    } catch (error) {
        return new Response(`Authentication Error: ${error.message}`, { status: 500 });
    }
}