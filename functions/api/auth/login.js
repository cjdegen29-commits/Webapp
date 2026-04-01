// webapp/functions/api/auth/login.js

// Authorization Endpoint: GET /api/auth/login
// Usage: redirect user to a direct link in the HTML (e.g., <a href="/api/auth/login">). 
// Description: Initiates the Google OAuth2 flow by redirecting the user to Google's consent screen.
// Note: The actual handling of the OAuth callback and token exchange is done in /api/auth/callback.js.
// Security: We generate a random state parameter to protect against CSRF attacks and store it in an HttpOnly cookie for later verification in the callback.
// (Required for verification in Google API Console)

export async function onRequestGet(context) {
    const clientId = context.env.GOOGLE_CLIENT_ID;
    const redirectUri = context.env.GOOGLE_REDIRECT_URI;
    
    // 1. Generate a secure, random state string
    const state = crypto.randomUUID();
    
    const scope = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly';
    
    // 2. Append the state parameter to the auth URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
    
    const headers = new Headers();
    headers.append('Location', authUrl);
    
    // 3. Set the state in an HttpOnly cookie so we can verify it in the callback
    // We give it a short 10-minute lifespan since login should be relatively quick
    headers.append('Set-Cookie', `oauth_state=${state}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`);

    return new Response(null, {
        status: 302,
        headers: headers
    });
}