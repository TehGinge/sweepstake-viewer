import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const token = process.env.FOOTBALL_DATA_API_TOKEN || process.env.VITE_FOOTBALL_DATA_API_TOKEN;
if (!token) {
  throw new Error('Missing FOOTBALL_DATA_API_TOKEN (or VITE_FOOTBALL_DATA_API_TOKEN).');
}

const competition = (process.env.SCORE_FEED_WC26_COMPETITION || 'WC').trim();
const season = (process.env.SCORE_FEED_WC26_SEASON || '2026').trim();
const endpoint = `https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/matches?season=${encodeURIComponent(season)}`;

const response = await fetch(endpoint, {
  headers: {
    'X-Auth-Token': token,
  },
});

if (!response.ok) {
  const details = (await response.text()).slice(0, 300);
  throw new Error(`football-data request failed (${response.status} ${response.statusText}). ${details}`);
}

const payload = await response.json();
const matches = Array.isArray(payload?.matches) ? payload.matches : [];

const output = {
  fetchedAt: new Date().toISOString(),
  source: 'football-data.org',
  competition,
  season,
  matches,
};

const outputDir = path.join(repoRoot, 'public', 'score-feed');
const outputPath = path.join(outputDir, 'wc26.json');

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(`Wrote ${matches.length} matches to ${outputPath}`);
