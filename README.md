# YT Downloader

This project is a simple YouTube downloader web app built with Node.js, Express, `youtube-dl-exec`, and `ffmpeg-static`.

## What this project does

It starts a local server, opens a frontend in the browser, accepts a YouTube URL, fetches available formats, and lets the user download video or audio.

## Requirements

Before running the project on another local machine, make sure these are installed:

- Git
- Node.js
- npm

Recommended:

- Node.js 18 or newer

## How to clone and run on another local machine

Follow these steps one by one.

### 1. Copy the repository link

From GitHub, copy the repository URL.

It usually looks like this:

```bash
https://github.com/your-username/your-repo-name.git
```

### 2. Open a terminal

Open one of these on your computer:

- PowerShell
- Command Prompt
- Terminal

### 3. Move to the folder where you want the project

Example:

```bash
cd Desktop
```

Or:

```bash
cd Documents
```

### 4. Clone the project

Run:

```bash
git clone https://github.com/your-username/your-repo-name.git
```

### 5. Open the project folder

Run:

```bash
cd your-repo-name
```

### 6. Install all required packages

Run:

```bash
npm install
```

This installs all dependencies listed in `package.json`, including:

- `express`
- `cors`
- `youtube-dl-exec`
- `ffmpeg-static`
- `nodemon`

### 7. Start the project

For normal run:

```bash
npm start
```

For development mode:

```bash
npm run dev
```

### 8. Open the app in your browser

When the server starts, open:

```text
http://localhost:3880
```

## Full quick setup example

If Git and Node.js are already installed, the full flow is:

```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
npm install
npm start
```

Then open:

```text
http://localhost:3880
```

## Available scripts

- `npm start` - runs the app with Node
- `npm run dev` - runs the app with Nodemon

## Project structure

```text
YT_Downloader/
|-- public/
|   |-- index.html
|   |-- script.js
|   |-- style.css
|-- server.js
|-- package.json
|-- package-lock.json
|-- .gitignore
|-- README.md
```

## Notes

- The app runs locally on port `3880` by default.
- If dependencies are missing, run `npm install` again.
- If the browser does not open automatically, manually visit `http://localhost:3880`.
- `node_modules` should not be committed because it can always be recreated with `npm install`.

## Troubleshooting

### `npm` is not recognized

Node.js is not installed correctly, or it is not added to `PATH`.

Install Node.js from the official website, then reopen the terminal.

### Port `3880` is already in use

Close the process using that port, or set a different port before starting the app.

PowerShell example:

```powershell
$env:PORT=4000
npm start
```

Then open:

```text
http://localhost:4000
```

### `git` is not recognized

Git is not installed correctly, or it is not added to `PATH`.

Install Git, then reopen the terminal.
