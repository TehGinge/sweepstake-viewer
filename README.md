# Sweepstake Viewer

A minimalist web app for running friends-and-family football sweepstakes. Assign teams, enter match results, follow group tables, and watch the leaderboard update live as the tournament progresses.

## Features

- **Local & Offline Mode**: Run entirely in the browser using local state.
- **Live Sharing**: Sync game state instantly with friends using Firebase Realtime Database.
- **Host Controls**: Create games, manage scores, and safely delete your hosted games.
- **Dynamic Leaderboard**: Automatically calculates points based on match results.
- **PWA & SEO Ready**: Includes standard metadata, social preview images (Open Graph), and webmanifest.

## Setup & Run Locally

Prerequisite: [Node.js](https://nodejs.org/)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open the local Vite URL shown in your terminal.

*Note: You can run the app locally without any Firebase configuration. It will default to Local Mode.*

## Live Sharing (Firebase Configuration)

To enable live, sharable links (`#game=<id>`), you'll need to connect the app to a Firebase project.

### 1. Firebase Project Setup
- Go to the [Firebase Console](https://console.firebase.google.com/) and create a project.
- **Authentication**: Enable **Anonymous** sign-in (Build > Authentication > Sign-in method).
- **Realtime Database**: Create a database (Build > Realtime Database).

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your app's Firebase configuration values:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.europe-west1.firebasedatabase.app/
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Database Rules
Copy the rules from `firebase.database.rules.json` into your Realtime Database Rules tab in the Firebase console.
These rules ensure that:
- Anyone can read the games (so viewers can see the scores).
- Only the anonymous user who originally created the game (the Host) can update or delete it.

## Automatic Score Sync (Optional)

The app can automatically pull finished match scores from football-data.org and apply them to unfinished matches.

How it works:
- In local mode, your browser fetches and applies updates.
- In live mode, only the Host fetches; viewers receive updates through existing Firebase realtime sync.
- Finished matches remain locked and are not overwritten.

Add these values to `.env` to enable it:

```env
# Use live provider (default) or mock provider for testing
VITE_SCORE_FEED_MODE=live

VITE_FOOTBALL_DATA_API_TOKEN=your_token_here

# Optional overrides (defaults shown)
# In local development, the app defaults to /api/football-data (Vite proxy) to avoid CORS.
# You can still override explicitly if needed:
VITE_FOOTBALL_DATA_API_BASE_URL=https://api.football-data.org/v4
VITE_SCORE_FEED_WC26_COMPETITION=WC
VITE_SCORE_FEED_WC26_SEASON=2026
VITE_SCORE_FEED_EURO28_COMPETITION=EC
VITE_SCORE_FEED_EURO28_SEASON=2028

# Optional for mock mode
VITE_SCORE_FEED_MOCK_LIMIT=6
```

Notes:
- Automatic sync is disabled if `VITE_FOOTBALL_DATA_API_TOKEN` is missing.
- Polling cadence is adaptive and increases around active fixtures.
- A single fetch cycle covers all users in a live game because only the Host writes updates.
- Local development uses the built-in Vite proxy path (`/api/football-data`) by default to bypass browser CORS restrictions.
- After changing `.env` or proxy settings, restart `npm run dev`.
- The client enforces a minimum delay between API calls (~6.6s) with jitter to stay within the free-tier 10 calls/minute ceiling per browser session.

### Testing Before Fixtures Are Played

Use mock mode to validate the full end-to-end flow right now:

1. Set `VITE_SCORE_FEED_MODE=mock` in `.env`.
2. Restart the Vite dev server.
3. Open a host session and (optionally) a viewer session with the same live game URL.
4. Wait for the next auto-sync cycle. The app will apply deterministic mock scores to unfinished matches.
5. Confirm the viewer updates in realtime through Firebase.

When you're done testing, switch back to live mode:

```env
VITE_SCORE_FEED_MODE=live
```

## Deployment (e.g. GitHub Pages)

Sweepstake Viewer is a static Vite application, making it easy to deploy.

**Important for Deployments:**
Firebase relies on environment variables (`VITE_FIREBASE_...`) at build time. Ensure you add your Firebase credentials to your deployment platform's Secrets/Environment Variables setting (e.g. GitHub Repository Secrets) so they are injected when `npm run build` runs.

**Authorizing your Domain:**
If deploying to a domain other than `localhost`, you must add that domain to your Firebase Authorized Domains so Authentication succeeds:
1. Firebase Console > Authentication > Settings > Authorized domains.
2. Click **Add domain** and enter your deployment URL (e.g., `yourusername.github.io`).

## How to Use

1. **Setup**: Add players, assign teams (manually or randomly), and tweak scoring rules.
2. **Start Live Game**: In the Setup tab, click *Start Live Game* to generate a shareable `#game=...` URL. Your browser profile becomes the Host.
3. **Groups / Knockouts**: Enter match results as the tournament unfolds.
4. **Home**: View the live-updating leaderboard and team assignments.
5. **Manage**: As the Host, you can update settings or completely delete the live game from the cloud from the Setup tab.
