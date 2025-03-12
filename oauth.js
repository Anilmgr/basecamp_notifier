import axios from "axios";
import { saveTokens } from "./db.js";

// Retrieve client credentials and redirect URI from environment variables
const client_id = process.env.CLIENT_ID;
const redirect_uri = process.env.REDIRECT_URI;
const client_secret = process.env.CLIENT_SECRET;

/**
 * Authorize the user by exchanging the authorization code for an access token.
 * @param {string} authCode - The authorization code received from the OAuth2 provider.
 * @returns {Promise<Object>} - The response data containing the access token and other information.
 */
export async function authorize(authCode) {
    const response = await axios.post(
        "https://launchpad.37signals.com/authorization/token",
        {
            type: "web_server",
            client_id,
            client_secret,
            code: authCode,
            redirect_uri,
        }
    );
    return response.data;
}

/**
 * Refresh the access token using the refresh token.
 * @param {string} refreshToken - The refresh token received from the OAuth2 provider.
 * @returns {Promise<string>} - The new access token.
 */
export async function refreshToken(refreshToken) {
    const response = await axios.post(
        "https://launchpad.37signals.com/authorization/token",
        {
            type: "refresh",
            client_id,
            client_secret,
            refresh_token: refreshToken,
        }
    );    
    
    const newAccessToken = response.data.access_token;
    await saveTokens(newAccessToken, 'refresh');
    return newAccessToken;
}