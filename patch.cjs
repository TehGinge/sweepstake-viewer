const fs = require('fs');
let code = fs.readFileSync('src/services/scoreSync.ts', 'utf8');

code = code.replace(
  `homeScore: typeof match?.score?.fullTime?.home === 'number' ? match.score.fullTime.home : null,
    awayScore: typeof match?.score?.fullTime?.away === 'number' ? match.score.fullTime.away : null,`,
  `homeScore: match?.score?.fullTime?.home != null ? Number(match.score.fullTime.home) : null,
    awayScore: match?.score?.fullTime?.away != null ? Number(match.score.fullTime.away) : null,`
);

code = code.replace(
  `const pendingMatches = matches.filter(
    (match) => Boolean(match.homeTeamId && match.awayTeamId) && isUnfinishedMatch(match),
  );`,
  `const pendingMatches = matches.filter(
    (match) => Boolean(match.homeTeamId && match.awayTeamId),
  );`
);

code = code.replace(
  `    if (!isUnfinishedMatch(match)) {
      return match;
    }`,
  ``
);

code = code.replace(
  `const pickBestMatch = (candidates: Match[], kickoffUtc: string | null): Match | null => {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const kickoffMs = parseDateMs(kickoffUtc || undefined);
  if (kickoffMs === null) {
    return null;
  }`,
  `const pickBestMatch = (candidates: Match[], kickoffUtc: string | null): Match | null => {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const kickoffMs = parseDateMs(kickoffUtc || undefined);
  if (kickoffMs === null) {
    return candidates[0];
  }`
);

code = code.replace(
  `const TEAM_CODE_ALIASES: Record<string, string> = {
  SAU: 'KSA',
  UKR: 'UKR',
};`,
  `const TEAM_CODE_ALIASES: Record<string, string> = {
  SAU: 'KSA',
  UKR: 'UKR',
  ZAF: 'RSA',
};`
);

code = code.replace(
  `const TEAM_NAME_ALIASES: Record<string, string> = {
  coteivoire: 'CIV',`,
  `const TEAM_NAME_ALIASES: Record<string, string> = {
  coteivoire: 'CIV',
  cotedivoire: 'CIV',
  southafrica: 'RSA',
  czechia: 'CZE',`
);

fs.writeFileSync('src/services/scoreSync.ts', code);
