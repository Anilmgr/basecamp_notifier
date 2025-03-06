import { getTokens } from "./db.js";
import axios from "axios";
import "dotenv/config.js";

const account_id = process.env.ACCOUNT_ID;
const { access_token, refresh_token } = await getTokens();
const apiClient = axios.create({
    baseURL: `https://3.basecampapi.com/${account_id}/`,
    headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
    },
});

async function getProjects() {
    try {
        const response = await apiClient.get("/projects.json");
        if (!response.data || response.data.length === 0) {
            throw new Error("No projects found.");
        }
        const clientProjects = response.data.filter((project) =>
            project.name.match(/^K6\d{3}_EXTERNAL.*/i)
        );

        if (clientProjects.length === 0) {
            throw new Error("No matching projects found.");
        }

        return clientProjects;
    } catch (error) {
        console.error(
            "Error fetching projects:",
            error.response?.data || error.message
        );
        throw error;
    }
}
// Fetch messages from a Basecamp message board
async function fetchMessages(project) {
    try {
        const url = `/buckets/${project.project_id}/message_boards/${project.message_board_id}/messages.json`;
        const response = await apiClient.get(url);
        return response.data;
    } catch (error) {
        console.error(`❌ Error fetching messages for Project ${project.project_id}:`, error.response?.status, error.response?.data);
        return [];
    }
}

// Fetch comments for a message
async function fetchComments(projectId, messageId) {
    try {
        const url = `/buckets/${projectId}/messages/${messageId}/comments.json`;
        const response = await apiClient.get(url);
        return response.data;
    } catch (error) {
        console.error(`❌ Error fetching comments for Message ${messageId}:`, error.response?.status, error.response?.data);
        return [];
    }
}

// Check if a message or comment is from a client
function isClientContent(content) {
    return content.creator?.client === true;
}

// Check if a message or comment is older than 7 days and has no replies or boosts
function isOldAndUnreplied(content) {
    const contentDate = new Date(content.created_at);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return contentDate < sevenDaysAgo && content.comments_count === 0 && content.boosts_count === 0;
}

// Fetch and filter messages & comments from multiple projects
async function checkClientContent() {
    let unreadItems = [];
    const PROJECTS = [] 
    const projects = await getProjects();
    projects.forEach((project) => {
        PROJECTS.push({
            project_id: project.id,
            message_board_id: project.dock.filter((dock) => dock.name === "message_board")[0].id,
        });
    });// Assume this function is defined elsewhere
    for (const project of PROJECTS) {
        const messages = await fetchMessages(project);
        for (const msg of messages) {
            // Check if the message itself is from a client and needs attention
            if (isClientContent(msg) && isOldAndUnreplied(msg)) {
                unreadItems.push({
                    type: "Message",
                    project_id: project.project_id,
                    subject: msg.subject,
                    url: msg.url,
                });
            }

            // Fetch comments for this message
            const comments = await fetchComments(project.project_id, msg.id);
            for (const comment of comments) {
                if (isClientContent(comment) && isOldAndUnreplied(comment)) {
                    unreadItems.push({
                        type: "Comment",
                        project_id: project.project_id,
                        subject: `Comment on: ${msg.subject}`,
                        url: msg.url, // Same message URL since comments don't have direct links
                    });
                }
            }
        }
    }

    console.log(`🔍 Found ${unreadItems.length} unread client messages/comments.`);

    if (unreadItems.length > 0) {
        await sendNotification(unreadItems);
    }
}

// Send a notification to Basecamp
async function sendNotification(items) {
    const notifyProject = PROJECTS[0]; // Send the notification to the first project's message board
    const notifyUrl = `/buckets/${notifyProject.project_id}/message_boards/${notifyProject.message_board_id}/messages.json`;

    const messageContent = items.map(item => `- **[${item.type}]** [${item.subject}](${item.url}) (Project ID: ${item.project_id})`).join("\n");

    const data = {
        subject: "📢 Unread Client Messages & Comments Notification",
        status: "active",
        content: `🚨 The following client messages and comments are older than 7 days and need attention:\n\n${messageContent}`,
    };

    try {
        await apiClient.post(notifyUrl, data);
        console.log("✅ Notification posted to Basecamp!");
    } catch (error) {
        console.error(`❌ Error posting notification:`, error.response?.status, error.response?.data);
    }
}

// Run the check
checkClientContent();