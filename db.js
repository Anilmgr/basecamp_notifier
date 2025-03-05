import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const dbPromise = open({
    filename: "basecamp.db",
    driver: sqlite3.Database,
});

export async function setupDatabase() {
    const db = await dbPromise;
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

export async function saveTokens(accessToken, refreshToken) {
    const db = await dbPromise;
    const [existingToken] = await db.all("SELECT * FROM tokens WHERE id = 1");
    if (existingToken) {
        await db.run(
            "UPDATE tokens SET access_token = ?, refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
            accessToken,
            refreshToken
        );
    } else {
        await db.run(
            "INSERT INTO tokens (id, access_token, refresh_token) VALUES (1,?, ?)",
            accessToken,
            refreshToken
        );
    }
}

export async function getTokens() {
    const db = await dbPromise;
    return db.get(
        "SELECT access_token, refresh_token FROM tokens WHERE id = 1"
    );
}