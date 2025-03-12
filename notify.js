import axios from "axios";
import { getTokens, getTokenAge } from "./db.js";
import { refreshToken } from "./api.js";
import "dotenv/config.js";

const account_id = process.env.ACCOUNT_ID;

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
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - lastUpdated.getTime() > sevenDaysMs) {
            const newAccessToken = await refreshToken(refresh_token);
            if (newAccessToken) access_token = newAccessToken;
        }
    } catch (error) {
        console.error("Error refreshing token:", error.message);
    }
}

await updateTokenIfNeeded();

const apiClient = axios.create({
    baseURL: `https://3.basecampapi.com/${account_id}/`,
    headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
    },
});

/**
 * Fetches projects that match the client project naming pattern.
 */
async function getProjects() {
    try {
        const PROJECTS = [];
        const response = await apiClient.get("/projects.json");
        const projects = response.data || [];
        const clientProjects = projects.filter((project) =>
            project.name.match(/^K6\d{3}_EXTERNAL.*/i)
        );
        return clientProjects.map((project) => ({
            project_id: project.id,
            message_board_id: project.dock.find(
                (dock) => dock.name === "message_board"
            )?.id,
        }));
    } catch (error) {
        console.error(
            "❌ Error fetching projects:",
            error.response?.status,
            error.response?.data
        );
        return [];
    }
}

/**
 * Fetches messages from a project's message board.
 */
async function getMessages(project) {
    try {
        const response = await apiClient.get(
            `/buckets/${project.project_id}/message_boards/${project.message_board_id}/messages.json`
        );
        return response.data || [];
    } catch (error) {
        console.error(
            `❌ Error fetching messages for project ${project.project_id}:`,
            error.message
        );
        return [];
    }
}

/**
 * Fetches the latest comment on a message.
 */
async function getLatestComment(projectId, messageId) {
    try {
        const response = await apiClient.get(
            `/buckets/${projectId}/recordings/${messageId}/comments.json`
        );
        return response.data?.slice(-1)[0] || null;
    } catch (error) {
        console.error(
            `❌ Error fetching latest comment for message ${messageId}:`,
            error.message
        );
        return null;
    }
}

/**
 * Determines if content was created by a client.
 */
function isClientContent(content) {
    return content?.creator?.client === true;
}

/**
 * Checks if content is older than 7 days and has no replies (for messages).
 */
function isOldAndUnreplied(content, contentType = "message") {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return (
        new Date(content.created_at) < sevenDaysAgo &&
        (contentType === "message" ? content.comments_count === 0 : true)
    );
}

/**
 * Checks for unread client messages and comments.
 */
async function checkClientContent() {
    const unreadItems = [];
    const projects = await getProjects();
    for (const project of projects) {
        const messages = await getMessages(project);
        for (const message of messages) {
            if (isClientContent(message) && isOldAndUnreplied(message)) {
                unreadItems.push({
                    type: "Message",
                    project_id: project.project_id,
                    message_board_id: project.message_board_id,
                    subject: message.subject,
                    url: message.url,
                    app_url: message.app_url,
                });
            }
            const lastComment = await getLatestComment(
                project.project_id,
                message.id
            );
            if (
                lastComment &&
                isClientContent(lastComment) &&
                isOldAndUnreplied(lastComment, "comment")
            ) {
                unreadItems.push({
                    type: "Comment",
                    project_id: project.project_id,
                    message_board_id: project.message_board_id,
                    subject: `Comment on: ${message.subject}`,
                    url: message.url,
                    app_url: lastComment.app_url,
                });
            }
        }
    }
    console.log(
        `🔍 Found ${unreadItems.length} unread client messages/comments.`
    );
    if (unreadItems.length > 0) await sendNotification(unreadItems);
}

/**
 * Sends notification for unread client messages/comments.
 */
async function sendNotification(contents) {
    const projects = await getProjects();
    const itemsByProject = contents.reduce((acc, content) => {
        if (!acc[content.project_id]) {
            acc[content.project_id] = [];
        }
        acc[content.project_id].push(content);
        return acc;
    }, {});
    for (const [projectId, projectItems] of Object.entries(itemsByProject)) {
        const notifyProject = projects.find(
            (project) => project.project_id === parseInt(projectId)
        );
        if (!notifyProject) continue;
        const messageContent = projectItems
            .map(
                (item, i) =>
                    `${i + 1}. **[${item.type}]** [${item.subject}](<a href="${
                        item.app_url
                    }">Check</a>)`
            )
            .join("<br/>");

        try {
            const response = await apiClient.get(
                `/buckets/${projectId}/message_boards/${notifyProject.message_board_id}/messages.json`
            );
            const existingNotification = response.data.find(
                (message) =>
                    message.title.includes(
                        "Unread Client Messages & Comments Notification"
                    ) && message.status === "active"
            );

            if (existingNotification) {
                console.log(
                    `📢 Updating existing notification for project ${projectId}...`
                );
                await apiClient.post(
                    `/buckets/${projectId}/recordings/${existingNotification.id}/comments.json`,
                    {
                        content: `🚨 Unread client messages/comments older than 7 days:<br/>${messageContent}`,
                    }
                );
            } else {
                console.log(
                    `📢 Posting new notification for project ${projectId}...`
                );
                const { data: createdMessage } = await apiClient.post(
                    `/buckets/${projectId}/message_boards/${notifyProject.message_board_id}/messages.json`,
                    {
                        subject:
                            "📢 Unread Client Messages & Comments Notification",
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
            console.log(
                `✅ Notification updated on Basecamp for project ${projectId}!`
            );
        } catch (error) {
            console.error(
                `❌ Error posting notification for project ${projectId}:`,
                error.response?.status,
                error.response?.data
            );
        }
    }
}

await checkClientContent();
