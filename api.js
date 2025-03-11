import axios from "axios";
import { saveTokens } from "./db.js";

const client_id = process.env.CLIENT_ID;
const redirect_uri = process.env.REDIRECT_URI;
const client_secret = process.env.CLIENT_SECRET;

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
