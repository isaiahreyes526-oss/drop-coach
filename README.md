# Drop Coach

A personal Fortnite improvement tracker and coaching dashboard.

## Features
- Overview dashboard for clip reviews, weaknesses, training minutes, and tournament results
- Clip-review form with temporary local video preview and mistake/correction notes
- Weakness tracker with severity and progress status
- Adjustable training routine
- Rule-based coaching prompts and exportable context for deeper AI review in ChatGPT
- Tournament log
- Browser-local persistence with JSON export/import

## Run locally
Open `index.html` in a modern browser. No build step is required.

## Current limitations
This is a static, browser-only starter. It does **not** currently include a hosted AI model, server-side video analysis, user accounts, or cloud sync. Uploaded clips are previewed locally and are not automatically analyzed or uploaded. The Coach tab uses rule-based suggestions; use the context-export button to bring logged evidence into an AI chat for deeper review.

## Privacy
The app stores its tracker data in the current browser's local storage. Export a backup before clearing browser data or changing devices.
