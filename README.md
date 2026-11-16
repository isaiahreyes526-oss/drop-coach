# Drop Coach

Two editions of the personal Fortnite improvement tracker.

## Choose your version
- **Drop Coach Lite (no API):** [Open Lite](./versions/lite/index.html) — tracker, training plans, and built-in offline coaching suggestions. No API key or AI usage fees.
- **Drop Coach AI:** [Open AI edition](./versions/ai/index.html) — uses the backend for AI coaching and sampled-frame clip analysis. Requires an OpenAI API key and a deployed backend.

The root `index.html` is the AI edition.

## Backend setup
Requires Node.js 20+ and FFmpeg / ffprobe (included in the Docker image).

1. Deploy this repository on Render using the included `render.yaml`.
2. Set `OPENAI_API_KEY` as a secret.
3. Set `API_ACCESS_TOKEN` as a long random secret.
4. Set `OPENAI_MODEL` to `gpt-6-luna` (the current default).
5. Set `FRONTEND_ORIGIN` to your deployed website origin.
6. Open the AI edition, then enter the backend URL and the API access token in the Coach tab.

Do not put the OpenAI API key in frontend files or GitHub. API billing is separate from ChatGPT.

## AI features
- `POST /api/coach`: personalized coaching based on the player's tracker notes.
- `POST /api/analyze-clip`: extracts up to seven still frames from a video (maximum 80 MB / 3 minutes) and asks the vision model to analyze those snapshots. This is not continuous video understanding; actions between sampled frames can be missed.
- `GET /api/health`: backend health check.

Temporary uploaded videos and extracted frames are deleted after processing. Tracker data remains in browser local storage; there are no accounts or cloud sync yet.

## Local backend
```bash
cd backend
npm install
npm start
```
