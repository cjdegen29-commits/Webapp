// webapp/functions/api/auth/login.js

// Authorization Endpoint: GET /api/auth/login
// Usage: redirect user to a direct link in the HTML (e.g., <a href="/api/auth/login">). 
// Description: Initiates the Google OAuth2 flow by redirecting the user to Google's consent screen.
// Note: The actual handling of the OAuth callback and token exchange is done in /api/auth/callback.js.

export async function onRequestGet(context) {
    const clientId = context.env.GOOGLE_CLIENT_ID;
    const redirectUri = context.env.GOOGLE_REDIRECT_URI;
    
    // Requesting offline access so we get a refresh token, and prompt=consent to ensure it shows the screen
    // Add a space and the drive.readonly scope
    const scope = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
    
    return Response.redirect(authUrl, 302);
}