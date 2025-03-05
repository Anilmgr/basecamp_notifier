import "dotenv/config";
import express from "express";
import axios from "axios";
import { saveTokens, getTokens, setupDatabase } from "./db.js";

const app = express();

const client_id = process.env.CLIENT_ID;
const redirect_uri = process.env.REDIRECT_URI;
const client_secret = process.env.CLIENT_SECRET;
const account_id = process.env.ACCOUNT_ID;
const port = process.env.PORT || 8000;

app.get("/auth", (req, res) => {
    const authUrl = `https://launchpad.37signals.com/authorization/new?client_id=${client_id}&redirect_uri=${encodeURIComponent(
        redirect_uri
    )}&type=web_server`;
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
        await saveTokens(accessToken, refreshToken);
        res.send(
            `<p>Token synced successfully. You can now use the app. </p><a href="/profile">View profile</a>`
        );
    } catch (error) {
        console.error("Error exchanging code for token:", error);
        res.status(500).send("Failed to obtain access token.");
    }
});

const refreshToken = async (refreshToken) => {
    try {
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
        const newRefreshToken = response.data.refresh_token;

        await saveTokens(newAccessToken, newRefreshToken);
        return newAccessToken;
    } catch (error) {
        console.error("Error refreshing token:", error);
        throw error; // Propagate the error for handling
    }
};

app.get("/profile", async (req, res) => {
    try {
        const { access_token, refresh_token } = await getTokens();
        if (!access_token || !refresh_token) {
            return res
                .status(401)
                .send("No tokens found. Please authorize first.");
        }
        const fetchProfile = (access_token) =>
            axios.get(
                `https://3.basecampapi.com/${account_id}/my/profile.json`,
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                }
            );
        try {
            const response = await fetchProfile(access_token);
            res.json(response.data);
        } catch (error) {
            if (error.response && error.response.status === 401) {
                try {
                    const newAccessToken = await refreshToken(refresh_token);
                    const retryResponse = await fetchProfile(newAccessToken);
                    res.json(retryResponse.data);
                } catch (refreshError) {
                    console.error("Error refreshing token:", refreshError);
                    res.status(401).send(
                        "Authentication failed. Please re-authorize."
                    );
                }
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error("Error fetching tokens:", error);
        res.status(500).send("Failed to fetch tokens.");
    }
});

const startServer = async () => {
    await setupDatabase();
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
};

startServer().catch((error) => {
    console.error("Error starting server:", error);
});
