/**
 * @file db.js
 * @description This module handles database operations using SQLite.
 */

import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Open a connection to the SQLite database
const dbPromise = open({
    filename: "basecamp.db",
    driver: sqlite3.Database,
});

/**
 * Generates an Australian timestamp string in the format YYYY-MM-DD HH:MM:SS.
 * @returns {string} The Australian timestamp string.
 */
function getAustralianTimestamp() {
    const options = {
        timeZone: "Australia/Sydney",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    };
    return new Intl.DateTimeFormat("en-CA", options)
        .format(new Date())
        .replace(",", "")
        .replace(/\//g, "-");
}

/**
 * Setup the database by creating the necessary tables if they do not exist.
 * @async
 * @throws {Error} If there's an issue executing the SQL commands.
 */
export async function setupDatabase() {
    try {
        const db = await dbPromise;
        // Create the tokens table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                access_token TEXT NOT NULL,
                refresh_token TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create the notification_history table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS notification_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                item_type TEXT NOT NULL,
                project_id INTEGER NOT NULL,
                notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (error) {
        console.error("Error setting up the database:", error.message);
        throw error;
    }
}

/**
 * Save the access and refresh tokens to the database.
 * @async
 * @param {string} accessToken - The access token to save.
 * @param {string} refreshToken - The refresh token to save.
 * @param {string} [type="new"] - The type of token operation ("new" or "refresh").
 * @throws {Error} If there's an issue executing the SQL command.
 */
export async function saveTokens(accessToken, refreshToken, type = "new") {
    try {
        const db = await dbPromise;
        const [existingToken] = await db.all("SELECT * FROM tokens WHERE id = 1");

        if (existingToken) {
            // If the token exists, update it
            if (type === "refresh") {
                await db.run(
                    "UPDATE tokens SET access_token = ?, updated_at = ? WHERE id = 1",
                    accessToken,
                    getAustralianTimestamp()
                );
            } else {
                await db.run(
                    "UPDATE tokens SET access_token = ?, refresh_token = ?, updated_at = ? WHERE id = 1",
                    accessToken,
                    refreshToken,
                    getAustralianTimestamp()
                );
            }
        } else {
            // If the token does not exist, insert a new one
            await db.run(
                "INSERT INTO tokens (id, access_token, refresh_token, updated_at) VALUES (1, ?, ?, ?)",
                accessToken,
                refreshToken,
                getAustralianTimestamp()
            );
        }
    } catch (error) {
        console.error("Error saving tokens:", error.message);
        throw error;
    }
}

/**
 * Retrieve the access and refresh tokens from the database.
 * @async
 * @returns {Promise<object>} - The tokens from the database.
 * @throws {Error} If there's an issue executing the SQL command.
 */
export async function getTokens() {
    try {
        const db = await dbPromise;
        return db.get("SELECT access_token, refresh_token FROM tokens WHERE id = 1");
    } catch (error) {
        console.error("Error getting tokens:", error.message);
        throw error;
    }
}

/**
 * Retrieve the age of the token from the database.
 * @async
 * @returns {Promise<object>} - The timestamp of the last update.
 * @throws {Error} If there's an issue executing the SQL command.
 */
export async function getTokenAge() {
    try {
        const db = await dbPromise;
        const [token] = await db.all("SELECT updated_at FROM tokens WHERE id = 1");
        return token;
    } catch (error) {
        console.error("Error getting token age:", error.message);
        throw error;
    }
}

/**
 * Retrieve the notification history from the database.
 * @async
 * @returns {Promise<Array<object>>} - The notification history records.
 * @throws {Error} If there's an issue executing the SQL command.
 */
export async function getNotificationHistory() {
    try {
        const db = await dbPromise;
        return db.all("SELECT * FROM notification_history");
    } catch (error) {
        console.error("Error getting notification history:", error.message);
        throw error;
    }
}

/**
 * Save the notification history to the database.
 * @async
 * @param {object} item - The item to save to the notification history.
 * @param {number} item.id - The ID of the item.
 * @param {string} item.type - The type of the item.
 * @param {number} item.project_id - The ID of the project.
 * @throws {Error} If there's an issue executing the SQL command.
 */
export async function saveNotificationHistory(item) {
    try {
        const db = await dbPromise;
        // Check if this item already exists in the history
        const existingRecord = await db.get(
            "SELECT * FROM notification_history WHERE item_id = ? AND item_type = ?",
            item.id,
            item.type
        );

        if (existingRecord) {
            // If the record exists, update the notified_at timestamp
            await db.run(
                "UPDATE notification_history SET notified_at = ? WHERE item_id = ? AND item_type = ?",
                getAustralianTimestamp(),
                item.id,
                item.type
            );
        } else {
            // If the record does not exist, insert a new one
            await db.run(
                "INSERT INTO notification_history (item_id, item_type, project_id, notified_at) VALUES (?, ?, ?, ?)",
                item.id,
                item.type,
                item.project_id,
                getAustralianTimestamp()
            );
        }
    } catch (error) {
        console.error("Error saving notification history:", error.message);
        throw error;
    }
}
