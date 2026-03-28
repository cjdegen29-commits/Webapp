// webapp/functions/api/auth/login.js

export async function onRequestGet(context) {
    const clientId = context.env.GOOGLE_CLIENT_ID;
    const redirectUri = context.env.GOOGLE_REDIRECT_URI;
    
    // Requesting offline access so we get a refresh token, and prompt=consent to ensure it shows the screen
    const scope = 'https://www.googleapis.com/auth/spreadsheets';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
    
    return Response.redirect(authUrl, 302);
}