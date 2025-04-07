# Basecamp Notifier

This system checks for unread client messages and comments in Basecamp projects and sends notifications for items that haven't been addressed in a specified time (default is 7 days).

## Features

*   **Automated Notifications:** Sends notifications for unread client messages and comments.
*   **Configurable:** Adjust project scope using environment variables.
*   **Database Storage:** Uses SQLite to store token and notification history.
*   **Token Refreshing:** Automatically refreshes access tokens to maintain continuous operation.

## Getting Started

### Prerequisites

*   Node.js
*   npm or yarn
*   Basecamp 3 API Access

### Installation

1.  Clone the repository:

    ```
    git clone https://github.com/Anilmgr/basecamp_notifier.git
    ```
2.  Install dependencies:

    ```
    npm install # or yarn install
    ```
3.  Set up environment variables:

    *   Create a `.env` file in the root directory.
    *   Add the required environment variables (see `.env.example` for details).

    ```
    CLIENT_ID=your_basecamp_client_id
    CLIENT_SECRET=your_basecamp_client_secret
    ACCOUNT_ID=your_basecamp_account_id
    REDIRECT_URI=http://localhost:8000/callback
    PORT=8000
    ```

### Usage

1.  **Authorization:**

    *   Run the `app.js` file to start the server.
    *   Open your browser and go to the root URL (e.g., `http://localhost:8000`).
    *   You will be redirected to the Basecamp authorization page.
    *   Authorize the application to access your Basecamp account.
    *   After authorization, you will be redirected back to your application with a success message.
2.  **Running the Notifier:**

    *   Run the `notify.js` script to check for unread messages and send notifications.

    ```
    node notify.js
    ```

    *   This script is intended to be run as a scheduled task (e.g., using cron) to periodically check for new notifications.

## Environment Variables

*   `CLIENT_ID`: Your Basecamp API client ID.
*   `CLIENT_SECRET`: Your Basecamp API client secret.
*   `ACCOUNT_ID`: Your Basecamp account ID.
*   `REDIRECT_URI`: The redirect URI registered in your Basecamp application.
*   `PORT`: The port the Express server will listen on (default: 8000).

## File Descriptions

*   `app.js`: Handles OAuth2 authorization flow and token management.
*   `db.js`: Manages the SQLite database for storing tokens and notification history.
*   `notify.js`: Fetches and sends notifications for unread client messages and comments.
*   `.env.example`: Example environment variables file.

## Database Structure

The application uses an SQLite database (`basecamp.db`) with the following tables:

*   `tokens`: Stores access and refresh tokens.
*   `notification_history`: Stores a history of sent notifications to prevent duplicate alerts.

