/**
 * Basecamp Client Content Notification System
 *
 * This script checks for unread client messages and comments in Basecamp projects,
 * and sends notifications for items that haven't been addressed in 7 days.
 */

import axios from "axios";
import {
    getTokens,
    getTokenAge,
    getNotificationHistory,
    saveNotificationHistory,
} from "./db.js";
import { refreshToken } from "./oauth.js";
import "dotenv/config";

// Configuration constants
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const CLIENT_PROJECT_REGEX = /^K6\d{3}_EXTERNAL.*/i;
const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Fetch initial tokens
let { access_token, refresh_token } = await getTokens();

/**
 * Updates the access token if it is older than 7 days.
 */
async function updateTokenIfNeeded() {
    try {
        const { updated_at } = await getTokenAge();
        const lastUpdated = new Date(
            updated_at.includes("T") ? updated_at : updated_at.replace(" ", "T")
        );

        if (Date.now() - lastUpdated.getTime() > SEVEN_DAYS_MS) {
            const newAccessToken = await refreshToken(refresh_token);
            if (newAccessToken) access_token = newAccessToken;
        }
    } catch (error) {
        console.error("Error refreshing token:", error.message);
    }
}

// Update token if needed before proceeding
await updateTokenIfNeeded();

// Create an axios instance for Basecamp API requests
const apiClient = axios.create({
    baseURL: `https://3.basecampapi.com/${ACCOUNT_ID}/`,
    headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
    },
});

/**
 * Fetches projects that match the client project naming pattern.
 * @returns {Array} Array of client projects
 */
async function fetchClientProjects() {
    try {
        const response = await apiClient.get("/projects.json");
        const projects = response.data || [];
        const now = Date.now();

        const clientProjects = projects.filter((project) => {
            const createdAt = new Date(project.created_at).getTime();
            const updatedAt = new Date(project.updated_at).getTime();
            return (
                project.name.match(CLIENT_PROJECT_REGEX) &&
                now - createdAt <= FIVE_YEARS_MS &&
                now - updatedAt <= ONE_YEAR_MS
            );
        });
        return clientProjects.map((project) => ({
            project_id: project.id,
            message_board_id: project.dock.find(
                (dock) => dock.name === "message_board"
            )?.id,
        }));
    } catch (error) {
        console.error(
            "Error fetching projects:",
            error.response?.status,
            error.response?.data
        );
        return [];
    }
}

/**
 * Fetches messages from a project's message board.
 * @param {Object} project - Project object containing project_id and message_board_id
 * @returns {Array} Array of messages
 */
async function fetchMessages(project) {
    try {
        const response = await apiClient.get(
            `/buckets/${project.project_id}/message_boards/${project.message_board_id}/messages.json`
        );
        return response.data || [];
    } catch (error) {
        console.error(
            `Error fetching messages for project ${project.project_id}:`,
            error.message
        );
        return [];
    }
}

/**
 * Fetches the latest comment on a message.
 * @param {number} projectId - ID of the project
 * @param {number} messageId - ID of the message
 * @returns {Object|null} Latest comment or null if none found
 */
async function fetchLatestComment(projectId, messageId) {
    try {
        const response = await apiClient.get(
            `/buckets/${projectId}/recordings/${messageId}/comments.json`
        );
        return response.data?.slice(-1)[0] || null;
    } catch (error) {
        console.error(
            `Error fetching latest comment for message ${messageId}:`,
            error.message
        );
        return null;
    }
}

/**
 * Determines if content was created by a client.
 * @param {Object} content - Content object to check
 * @returns {boolean} True if content was created by a client
 */
function isClientContent(content) {
    return content?.creator?.client === true;
}

/**
 * Checks if content is older than 7 days and has no replies (for messages).
 * @param {Object} content - Content object to check
 * @param {string} contentType - Type of content ("message" or "comment")
 * @returns {boolean} True if content is old and unreplied
 */
function isOldAndNotReplied(content, contentType = "message") {
    const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;
    return (
        new Date(content.created_at).getTime() < sevenDaysAgo &&
        (contentType === "message" ? content.comments_count === 0 : true)
    );
}

/**
 * Determines if a notification should be sent for an item.
 * @param {Object} item - Item to check for notification
 * @param {Array} notificationHistory - History of previous notifications
 * @returns {boolean} True if notification should be sent
 */
function shouldNotify(item, notificationHistory) {
    const previousNotification = notificationHistory.find(
        (history) =>
            history.item_id === item.id && history.item_type === item.type
    );
    if (!previousNotification) return true;
    const lastNotified = new Date(previousNotification.notified_at);
    const daysSinceNotification =
        (Date.now() - lastNotified.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceNotification >= 7;
}

/**
 * Sends notification for unread client messages/comments.
 * @param {Array} contents - Array of unread items to notify about
 */
async function sendNotifications(contents) {
    const projects = await fetchClientProjects();
    const notificationHistory = await getNotificationHistory();

    // Filter items to only those that should be notified (not recently notified)
    const itemsToNotify = contents.filter((item) =>
        shouldNotify(item, notificationHistory)
    );

    if (itemsToNotify.length === 0) {
        console.log("No new items to notify about after filtering recently notified items");
        return;
    }

    console.log(
        `Notifying about ${itemsToNotify.length} unread messages/comments.`
    );

    const itemsByProject = itemsToNotify.reduce((acc, item) => {
        if (!acc[item.project_id]) {
            acc[item.project_id] = [];
        }
        acc[item.project_id].push(item);
        return acc;
    }, {});

    for (const [projectId, items] of Object.entries(itemsByProject)) {
        const notifyProject = projects.find((project) => project.project_id === parseInt(projectId));
        if (!notifyProject) continue;
        await postNotification(notifyProject, projectId, items);
    }
}

/** 
 * Posts a notification for unread items in a project.
 * @param {Object} notifyProject - The project details to notify about.
 * @param {number} projectId - The ID of the project.
 * @param {Array} unreadItems - Array of unread items to include in the notification.
 */
async function postNotification(notifyProject, projectId, unreadItems) {
    try {
        const messageContent = unreadItems
            .map(
                (item, i) =>
                    `${i + 1}. **[${item.type}]** [${item.subject}](<a href="${
                        item.app_url
                    }">Read</a>)`
            )
            .join(" <br/>");

        const response = await apiClient.get(
            `/buckets/${projectId}/message_boards/${notifyProject.message_board_id}/messages.json`
        );

        const existingNotification = response.data.find(
            (message) =>
                message.title.includes("Unread Client Messages & Comments Notification") &&
                message.status === "active"
        );

        if (existingNotification) {
            console.log(`Updating existing notification for project ${projectId}...`);
            await apiClient.post(
                `/buckets/${projectId}/recordings/${existingNotification.id}/comments.json`,
                {
                    content: `🚨 Unread client messages/comments older than 7 days:<br/>${messageContent}`,
                }
            );
        } else {
            console.log(`Posting new notification for project ${projectId}...`);
            const { data: createdMessage } = await apiClient.post(
                `/buckets/${projectId}/message_boards/${notifyProject.message_board_id}/messages.json`,
                {
                    subject: "📢 Unread Client Messages & Comments Notification",
                    status: "active",
                    content: "",
                }
            );

            await apiClient.post(
                `/buckets/${projectId}/recordings/${createdMessage.id}/comments.json`,
                {
                    content: `🚨 Unread client messages/comments older than 7 days:<br/>${messageContent}`,
                }
            );
        }

        console.log(`Notification posted for project ${projectId}.`);

        // Save notification history
        for (const item of unreadItems) await saveNotificationHistory(item);

    } catch (error) {
        console.error(
            `Error posting notification for project ${projectId}:`,
            error.message
        );
    }
}

/**
 * Checks for unread client messages and comments.
 */
async function checkClientContent() {
    const projects = await fetchClientProjects();
    const unreadItemsPromises = projects.map(async (project) => {
        const messages = await fetchMessages(project);
        const unreadItems = []
        for (const message of messages){
            if( isClientContent(message) && isOldAndNotReplied(message)){
                unreadItems.push({
                    id: message.id,
                    type: "Message",
                    project_id: project.project_id,
                    message_board_id: project.message_board_id,
                    subject: message.subject,
                    url: message.url,
                    app_url: message.app_url,
                });
            }
            const lastComment = await fetchLatestComment(project.project_id, message.id);
            if(lastComment && isClientContent(lastComment) && isOldAndNotReplied(lastComment, "comment")){
                unreadItems.push({
                    id: lastComment.id,
                    type: "Comment",
                    subject: `Comment on: ${message.subject}`,
                    app_url: lastComment.app_url,
                    project_id: project.project_id,
                });
            }
        }
        return unreadItems;
    })

    const unreadItems = (await Promise.all(unreadItemsPromises)).flat();

    if (unreadItems.length > 0) await sendNotifications(unreadItems);
}

// Main execution
await checkClientContent();
