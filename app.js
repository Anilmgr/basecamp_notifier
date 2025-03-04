import "dotenv/config";
import express from "express";
import axios from "axios";

const app = express();

const client_id = process.env.CLIENT_ID;
const redirect_uri = process.env.REDIRECT_URI;
const client_secret = process.env.CLIENT_SECRET;
const account_id = '5924933';

console.log(account_id);


app.get("/auth", (req, res) => {
    const authUrl = `https://launchpad.37signals.com/authorization/new?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&type=web_server`;
    res.redirect(authUrl);
});

app.get("/callback", async (req, res) => {
    const authCode = req.query.code;
    if (!authCode) {
        return res.status(400).send("Authorization code not received.");
    }
    try {
        const tokenResponse = await axios.post(
            "https://launchpad.37signals.com/authorization/token",
            {
                type: "web_server",
                client_id: client_id,
                client_secret: client_secret,
                code: authCode,
                redirect_uri: redirect_uri,
            }
        );
    
        const accessToken = tokenResponse.data.access_token;
        const refreshToken = tokenResponse.data.refresh_token;
        res.send(`Access Token: ${accessToken}<br>Refresh Token: ${refreshToken}`);
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        res.status(500).send('Failed to obtain access token.');
    }
    
});

// Function to refresh the access token
const refreshToken = async (refreshToken) => {
    try {
      const response = await axios.post('https://launchpad.37signals.com/authorization/token', {
        type: 'refresh',
        client_id,
        client_secret,
        refresh_token: refreshToken
      });
      return response.data.access_token;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error; // Propagate the error for handling
    }
  };

  app.get('/profile', async (req, res) => {
    const accessToken = "BAhbB0kiAbB7ImNsaWVudF9pZCI6Ijk2YTQ0NjQ4NmZlZDdlZWViN2RmMGViZWZjMWMyMmE5NDFhZTE3OTYiLCJleHBpcmVzX2F0IjoiMjAyNS0wMy0xOFQxMDoxNDo1OVoiLCJ1c2VyX2lkcyI6WzUwNjI3MjgxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiYWMyNzQyMTBhYjQyMTMzNDE0Y2JkNzdjMjE3ZmJkOTcifQY6BkVUSXU6CVRpbWUNSkofwCxktTsJOg1uYW5vX251bWkCEQM6DW5hbm9fZGVuaQY6DXN1Ym1pY3JvIgd4UDoJem9uZUkiCFVUQwY7AEY=--2c6937444cca6f7fe8357b6cc6f2d2d875ca76df"    
    try {
        const response = await axios.get(`https://3.basecampapi.com/${account_id}/my/profile.json`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        res.json(response.data);
    } catch (error) {
        if (error.response && error.response.status === 401) {
            // Token might be expired, try refreshing
            try {
                // TODO: Retrieve refresh token from secure storage
                const refresh_token = "BAhbB0kiAbB7ImNsaWVudF9pZCI6Ijk2YTQ0NjQ4NmZlZDdlZWViN2RmMGViZWZjMWMyMmE5NDFhZTE3OTYiLCJleHBpcmVzX2F0IjoiMjAzNS0wMy0wNFQxMDoxNDo1OVoiLCJ1c2VyX2lkcyI6WzUwNjI3MjgxXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiYWMyNzQyMTBhYjQyMTMzNDE0Y2JkNzdjMjE3ZmJkOTcifQY6BkVUSXU6CVRpbWUNisghwJtwtTsJOg1uYW5vX251bWkC5wE6DW5hbm9fZGVuaQY6DXN1Ym1pY3JvIgdIcDoJem9uZUkiCFVUQwY7AEY=--eb4ae16123e37ecb4e392c6079065af9c74bc50f"
                const newAccessToken = await refreshToken(refresh_token);
                // TODO: Store the new access token securely
                // Retry the request with the new token
                const retryResponse = await axios.get(`https://3.basecampapi.com/${account_id}/my/profile.json`, {
                    headers: {
                        'Authorization': `Bearer ${newAccessToken}`
                    }
                });
                res.json(retryResponse.data);
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                res.status(401).send('Authentication failed. Please re-authorize.');
            }
        } else {
            console.error('Error fetching profile:', error);
            res.status(500).send('Failed to fetch profile data.');
        }
    }
});

app.listen(8000, () => {
    console.log("Server running on port 8000");
});


