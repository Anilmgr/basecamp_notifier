import { getTokens } from "./db.js";
import axios from "axios";
import 'dotenv/config.js';

async function getProjects(access_token, account_id) {
    const response = await axios.get(`https://3.basecampapi.com/${account_id}/projects.json`, {
        headers: {
            Authorization: `Bearer ${access_token}`
        }
    });
    const clientProjects = response.data.filter(project => project.name.match(/^K6\d{3}_EXTERNAL.*/i));
    return clientProjects;
}

async function getMessageBoard(access_token,url) {
    const response = await axios.get(url, {
        headers: {
            Authorization: `Bearer ${access_token}`
        }
    });
    return response.data;
}

try {
    const account_id = process.env.ACCOUNT_ID;
    const {access_token, refresh_token} = await getTokens();
    const projects = await getProjects(access_token, account_id);
    const message_board = projects[0].dock.filter(dock => dock.name === 'message_board')[0];
    const message_boards = await getMessageBoard(access_token, message_board.url);
    console.log(message_boards);
    
} catch (error) {
    console.log(error);
}