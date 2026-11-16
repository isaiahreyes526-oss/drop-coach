# Drop Coach

A personal Fortnite improvement tracker with a Node.js AI backend.

## Features
- Overview dashboard for clip reviews, weaknesses, training minutes, and tournament results
- Clip-review form with local preview and saved mistake/correction notes
- Weakness tracker with severity and progress status
- Adjustable training routine
- AI coaching endpoint that uses the player's tracker and question
- AI Fortnite clip analysis: uploads a short video, extracts up to 7 sampled frames with FFmpeg, and sends those images for vision analysis
- Tournament log
- Browser-local tracker persistence with JSON export/import

## Frontend
Open \`index.html\` in a modern browser, or publish it with GitHub Pages / another static host. Tracker data stays in the browser's local storage.

After deploying the API, open the Coach tab, enter the API URL (for example, \`https://drop-coach-api.onrender.com\`), and click **Save backend URL**. Both AI coaching and clip analysis use that address.

## Backend: run locally
Requirements: Node.js 20+ and FFmpeg / ffprobe installed and available on PATH.

1. Copy \`backend/.env.example\` to \`backend/.env\`.
2. Add your OpenAI API key to \`backend/.env\`.
3. From the \`backend\` folder, run:

\`\`\`bash
npm install
npm start
\`\`\`

The API listens on port 10000 by default. Check \`http://localhost:10000/api/health\`.

## Deploy the backend on Render
The repository includes \`render.yaml\` and \`backend/Dockerfile\`. The Docker image installs FFmpeg, which the clip-analysis endpoint needs.

1. In Render, create a new Blueprint and connect this repository, or create a Docker Web Service from the repository.
2. For a manual service, set the Dockerfile path to \`backend/Dockerfile\` and the Docker context to the repository root.
3. Add \`OPENAI_API_KEY\` as a secret environment variable in Render.
4. Set \`OPENAI_MODEL\` to a vision-capable model available to your API account (the default is \`gpt-4.1-mini\`).
5. Set \`FRONTEND_ORIGIN\` to the exact origin of your published website. During initial testing, the Blueprint uses \`*\`; replace it before using the API publicly.
6. Deploy, then open \`/api/health\` on the service URL. Copy that URL into the frontend's Backend API URL field.

Do not put the OpenAI API key in \`index.html\`, browser JavaScript, or any GitHub file. Only store it in the backend environment.

## API endpoints
- \`GET /api/health\` — service health and configuration status
- \`POST /api/coach\` — JSON body: \`{ "question": "...", "context": "..." }\`
- \`POST /api/analyze-clip\` — multipart form with a \`video\` file and optional \`notes\` / \`context\` text fields

Clip analysis currently accepts MP4, MOV, M4V, WEBM, MKV, and AVI; maximum 80 MB and 3 minutes. It extracts 7 still frames across the clip. The model analyzes those snapshots, not continuous video, so actions between sampled frames may be missed. Temporary upload and extracted frames are deleted after the request finishes.

## Costs and safety
OpenAI API usage is billed separately from a ChatGPT subscription. Set a usage budget in your API provider account and monitor usage. The API has basic per-IP rate limits, but rate limiting and CORS are not full authentication; add user authentication or an access-control layer before exposing a paid AI endpoint to a large public audience.

The server does not store uploaded videos or tracker data. The tracker itself remains in each user's browser. API requests are sent to your configured backend, and video frames are sent to the configured AI provider for analysis.

## Current limitations
There are no user accounts, database, cloud sync, Epic account integration, or persistent server-side history yet. The app is still intended as a personal-use coaching tool.
