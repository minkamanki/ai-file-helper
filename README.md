# AI file helper

A JavaScript proof-of-concept project for testing the OpenAI library.  
The goal of this project is to connect with cloud storage services (Microsoft OneDrive and/or Google Drive) and use OpenAI models to provide assistance with specific files.

---

## Features

- **Cloud Integration**  
  Connect to OneDrive or Google Drive to access user files.

- **AI-Powered File Assistance**  
  Ask questions about connected files, such as Excel spreadsheets or Google Sheets.

- **Automatic File Sync**  
  Each time the user asks a question, the app fetches the latest version of the file so the AI assistant always works with the most up-to-date content.

- **Frontend Chat Interface**  
  Provides an easy-to-use chat UI where users interact with their files via natural language.

---

## Example Use Case

1. User connects an Excel or Google Sheets file.  
2. In the chat interface, the user asks:  
   > *"What is the total sales for last quarter, and can you add that value as a new row in the table?*  
3. The app retrieves the latest version of the file, sends it to the AI model, and returns an accurate answer.

---

## Tech Stack

- **Next.js** (React + TypeScript) 
- **OpenAI library** (for AI-powered analysis and responses)  
- **Cloud APIs** (Microsoft Graph API for OneDrive, Google Drive API for Google Drive)  
- **Frontend Chat UI** (to interact with files and AI assistant)
