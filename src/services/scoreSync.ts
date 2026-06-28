import { Match, Team, TournamentId } from '../types';

const LIVE_SOURCE_NAME = 'football-data.org';
const MOCK_SOURCE_NAME = 'mock-score-feed';
const STATIC_SOURCE_NAME = 'score-feed-snapshot';

const FINISHED_PROVIDER_STATUSES = new Set([
  'FINISHED',
  'AWARDED',
  'AFTER_EXTRA_TIME',
  'PENALTY_SHOOTOUT',
]);

const LIVE_PROVIDER_STATUSES = new Set([
  'IN_PLAY',
  'PAUSED',
]);

const SCHEDULED_PROVIDER_STATUSES = new Set([
  'SCHEDULED',
  'TIMED',
]);

const FIXTURE_SYNC_MAX_KICKOFF_DELTA_MS = 18 * 60 * 60 * 1000;

const TEAM_CODE_ALIASES: Record<string, string> = {
  SAU: 'KSA',
  UKR: 'UKR',
  ZAF: 'RSA',
};

const TEAM_NAME_ALIASES: Record<string, string> = {
  coteivoire: 'CIV',
  cotedivoire: 'CIV',
  southafrica: 'RSA',
  czechia: 'CZE',
  ivorycoast: 'CIV',
  republicofireland: 'IRL',
  ireland: 'IRL',
  southkorea: 'KOR',
  korea: 'KOR',
  unitedstates: 'USA',
  usa: 'USA',
  turkey: 'TUR',
  turkiye: 'TUR',
  czechrepublic: 'CZE',
  drcongo: 'COD',
  democraticrepublicofthecongo: 'COD',
};

const ACTIVE_WINDOW_BEFORE_KICKOFF_MS = 10 * 60 * 1000;
const ACTIVE_WINDOW_AFTER_KICKOFF_MS = 140 * 60 * 1000;
const ACTIVE_SYNC_DELAY_MS = 30 * 1000;
const RECENTLY_DUE_SYNC_DELAY_MS = 10 * 60 * 1000;
const UPCOMING_SYNC_DELAY_MS = 15 * 60 * 1000;
const IDLE_SYNC_DELAY_MS = 30 * 60 * 1000;
const NO_PENDING_SYNC_DELAY_MS = 60 * 60 * 1000;
const DEV_PROXY_BASE_URL = '/api/football-data';

type ScoreFeedMode = 'live' | 'mock' | 'static';

type ProviderMatch = {
  id: string | null;
  kickoffUtc: string | null;
  stage: string | null;
  homeCode: string | null;
  awayCode: string | null;
  homeName: string | null;
  awayName: string | null;
  status: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export interface ScoreUpdate {
  matchId: string;
  homeScore: number;
  awayScore: number;
  status: 'FINISHED' | 'LIVE';
  source: string;
}

export interface FixtureUpdate {
  matchId: string;
  providerMatchId?: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
}

export interface FetchScoreUpdatesParams {
  tournamentId: TournamentId;
  matches: Match[];
  teams: Team[];
}

export type FetchScoreUpdatesResult =
  | {
      status: 'ok';
      source: string;
      fetchedAt: number;
      fixtureUpdates: FixtureUpdate[];
      updates: ScoreUpdate[];
    }
  | {
      status: 'disabled';
      source: string;
      fetchedAt: number;
      fixtureUpdates: [];
      updates: [];
      reason: string;
    };

export interface ApplyScoreUpdatesResult {
  matches: Match[];
  appliedCount: number;
}

export interface ApplyFixtureUpdatesResult {
  matches: Match[];
  appliedCount: number;
}

const normalizeText = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
};

const parseDateMs = (value?: string): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

const isUnfinishedMatch = (match: Match): boolean => {
  return !(match.homeScore !== null && match.awayScore !== null && match.status === 'FINISHED');
};

const isKnockoutProviderMatch = (providerMatch: ProviderMatch): boolean => {
  if (!providerMatch.stage) return true;
  return !providerMatch.stage.toUpperCase().includes('GROUP');
};

const PROVIDER_STAGE_TO_LOCAL: Record<string, Match['stage']> = {
  LAST_32: 'R32',
  ROUND_OF_32: 'R32',
  LAST_16: 'R16',
  ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF',
  THIRD_PLACE: '3RD',
  FINAL: 'FINAL',
};

const mapProviderStageToLocal = (stage: string | null): Match['stage'] | null => {
  if (!stage) return null;
  return PROVIDER_STAGE_TO_LOCAL[stage.toUpperCase()] ?? null;
};

const getCompetitionCode = (tournamentId: TournamentId): string => {
  if (tournamentId === 'WC26') {
    return (import.meta.env.VITE_SCORE_FEED_WC26_COMPETITION as string | undefined)?.trim() || 'WC';
  }

  // return (import.meta.env.VITE_SCORE_FEED_EURO28_COMPETITION as string | undefined)?.trim() || 'EC';
  return (import.meta.env.VITE_SCORE_FEED_WC26_COMPETITION as string | undefined)?.trim() || 'WC';
};

const getScoreFeedMode = (): ScoreFeedMode => {
  const configured = (import.meta.env.VITE_SCORE_FEED_MODE as string | undefined)?.trim().toLowerCase();
  if (configured === 'static') return 'static';
  return configured === 'mock' ? 'mock' : 'live';
};

const getStaticScoreFeedUrl = (tournamentId: TournamentId): string => {
  const configured = (import.meta.env.VITE_SCORE_FEED_STATIC_URL as string | undefined)?.trim();
  if (configured) {
    return configured;
  }

  const baseUrl = ((import.meta.env.BASE_URL as string | undefined) || '/').trim();
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  if (tournamentId === 'WC26') {
    return `${normalizedBaseUrl}score-feed/wc26.json`;
  }

  return `${normalizedBaseUrl}score-feed/wc26.json`;
};

const getMockUpdateLimit = (): number => {
  const configured = Number.parseInt((import.meta.env.VITE_SCORE_FEED_MOCK_LIMIT as string | undefined) || '6', 10);
  if (Number.isNaN(configured)) return 6;
  return Math.max(1, Math.min(32, configured));
};

const createDeterministicScore = (matchId: string): { homeScore: number; awayScore: number } => {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = (hash * 31 + matchId.charCodeAt(i)) >>> 0;
  }

  const homeScore = hash % 4;
  let awayScore = Math.floor(hash / 7) % 4;

  if (homeScore === awayScore) {
    awayScore = (awayScore + 1) % 5;
  }

  return { homeScore, awayScore };
};

const deriveMockScoreUpdates = (matches: Match[]): ScoreUpdate[] => {
  const maxUpdates = getMockUpdateLimit();

  const unfinished = matches
    .filter((match) => Boolean(match.homeTeamId && match.awayTeamId) && isUnfinishedMatch(match))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, maxUpdates);

  return unfinished.map((match) => {
    const { homeScore, awayScore } = createDeterministicScore(match.id);

    return {
      matchId: match.id,
      homeScore,
      awayScore,
      status: 'FINISHED',
      source: MOCK_SOURCE_NAME,
    };
  });
};

const getSeasonYear = (tournamentId: TournamentId): string => {
  if (tournamentId === 'WC26') {
    return (import.meta.env.VITE_SCORE_FEED_WC26_SEASON as string | undefined)?.trim() || '2026';
  }

  // return (import.meta.env.VITE_SCORE_FEED_EURO28_SEASON as string | undefined)?.trim() || '2028';
  return (import.meta.env.VITE_SCORE_FEED_WC26_SEASON as string | undefined)?.trim() || '2026';
};

const resolveTeamId = (
  homeOrAwayCode: string | null,
  homeOrAwayName: string | null,
  teamByCode: Map<string, string>,
  teamByName: Map<string, string>,
): string | null => {
  if (homeOrAwayCode) {
    const code = homeOrAwayCode.toUpperCase();
    if (teamByCode.has(code)) {
      return teamByCode.get(code) || null;
    }

    const alias = TEAM_CODE_ALIASES[code];
    if (alias && teamByCode.has(alias)) {
      return teamByCode.get(alias) || null;
    }
  }

  if (homeOrAwayName) {
    const normalized = normalizeText(homeOrAwayName);
    if (teamByName.has(normalized)) {
      return teamByName.get(normalized) || null;
    }

    const aliasId = TEAM_NAME_ALIASES[normalized];
    if (aliasId && teamByCode.has(aliasId)) {
      return teamByCode.get(aliasId) || null;
    }
  }

  return null;
};

const pickBestMatch = (candidates: Match[], kickoffUtc: string | null): Match | null => {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const kickoffMs = parseDateMs(kickoffUtc || undefined);
  if (kickoffMs === null) {
    return candidates[0];
  }

  let best: Match | null = null;
  let smallestDelta = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateMs = parseDateMs(candidate.date);
    if (candidateMs === null) continue;

    const delta = Math.abs(candidateMs - kickoffMs);
    if (delta < smallestDelta) {
      best = candidate;
      smallestDelta = delta;
    }
  }

  // Ignore ambiguous matches that are too far from the provider kickoff.
  if (smallestDelta > 36 * 60 * 60 * 1000) {
    return null;
  }

  return best;
};

const toProviderMatches = (payload: any): ProviderMatch[] => {
  if (!payload || !Array.isArray(payload.matches)) {
    return [];
  }

  return payload.matches.map((match: any) => ({
    id: match?.id != null ? String(match.id) : null,
    kickoffUtc: typeof match?.utcDate === 'string' ? match.utcDate : null,
    stage: typeof match?.stage === 'string' ? match.stage : null,
    homeCode: typeof match?.homeTeam?.tla === 'string' ? match.homeTeam.tla : null,
    awayCode: typeof match?.awayTeam?.tla === 'string' ? match.awayTeam.tla : null,
    homeName: typeof match?.homeTeam?.name === 'string'
      ? match.homeTeam.name
      : typeof match?.homeTeam?.shortName === 'string'
        ? match.homeTeam.shortName
        : null,
    awayName: typeof match?.awayTeam?.name === 'string'
      ? match.awayTeam.name
      : typeof match?.awayTeam?.shortName === 'string'
        ? match.awayTeam.shortName
        : null,
    status: typeof match?.status === 'string' ? match.status : null,
    homeScore: match?.score?.fullTime?.home != null ? Number(match.score.fullTime.home) : null,
    awayScore: match?.score?.fullTime?.away != null ? Number(match.score.fullTime.away) : null,
  }));
};

const createTeamLookup = (teams: Team[]): { teamByCode: Map<string, string>; teamByName: Map<string, string> } => {
  const teamByCode = new Map<string, string>();
  const teamByName = new Map<string, string>();

  for (const team of teams) {
    teamByCode.set(team.id.toUpperCase(), team.id);
    teamByName.set(normalizeText(team.name), team.id);
  }

  return { teamByCode, teamByName };
};

const deriveFixtureUpdates = (providerMatches: ProviderMatch[], matches: Match[], teams: Team[]): FixtureUpdate[] => {
  const fixtureUpdates: FixtureUpdate[] = [];
  const { teamByCode, teamByName } = createTeamLookup(teams);

  const pendingKnockoutMatches = matches
    .filter((match) => match.stage !== 'GROUP' && isUnfinishedMatch(match))
    .map((match) => ({ match, kickoffMs: parseDateMs(match.date) }))
    .filter((entry): entry is { match: Match; kickoffMs: number } => entry.kickoffMs !== null);

  const pendingByProviderMatchId = new Map<string, Match>();
  for (const entry of pendingKnockoutMatches) {
    if (entry.match.providerMatchId) {
      pendingByProviderMatchId.set(entry.match.providerMatchId, entry.match);
    }
  }

  const consumedMatchIds = new Set<string>();

  for (const providerMatch of providerMatches) {
    if (!providerMatch.status) continue;
    if (!isKnockoutProviderMatch(providerMatch)) continue;
    if (
      !SCHEDULED_PROVIDER_STATUSES.has(providerMatch.status) &&
      !LIVE_PROVIDER_STATUSES.has(providerMatch.status) &&
      !FINISHED_PROVIDER_STATUSES.has(providerMatch.status)
    ) {
      continue;
    }

    const kickoffMs = parseDateMs(providerMatch.kickoffUtc || undefined);
    if (kickoffMs === null) continue;

    const homeTeamId = resolveTeamId(providerMatch.homeCode, providerMatch.homeName, teamByCode, teamByName);
    const awayTeamId = resolveTeamId(providerMatch.awayCode, providerMatch.awayName, teamByCode, teamByName);
    const shouldClearUnresolvedTeams = SCHEDULED_PROVIDER_STATUSES.has(providerMatch.status);
    const providerStage = mapProviderStageToLocal(providerMatch.stage);

    let bestMatch: Match | null = null;
    let bestDeltaMs = Number.POSITIVE_INFINITY;

    if (providerMatch.id) {
      const mapped = pendingByProviderMatchId.get(providerMatch.id);
      if (mapped && !consumedMatchIds.has(mapped.id)) {
        bestMatch = mapped;
      }
    }

    const candidates = providerStage
      ? pendingKnockoutMatches.filter((candidate) => candidate.match.stage === providerStage)
      : pendingKnockoutMatches;

    for (const candidate of candidates) {
      if (bestMatch) break;
      if (consumedMatchIds.has(candidate.match.id)) continue;

      const deltaMs = Math.abs(candidate.kickoffMs - kickoffMs);
      if (deltaMs > FIXTURE_SYNC_MAX_KICKOFF_DELTA_MS) continue;

      if (deltaMs < bestDeltaMs) {
        bestDeltaMs = deltaMs;
        bestMatch = candidate.match;
      }
    }

    if (!bestMatch) continue;

    consumedMatchIds.add(bestMatch.id);

    const nextHomeTeamId = homeTeamId ?? (shouldClearUnresolvedTeams ? null : bestMatch.homeTeamId);
    const nextAwayTeamId = awayTeamId ?? (shouldClearUnresolvedTeams ? null : bestMatch.awayTeamId);
    const nextProviderMatchId = providerMatch.id ?? bestMatch.providerMatchId;

    if (
      bestMatch.homeTeamId === nextHomeTeamId &&
      bestMatch.awayTeamId === nextAwayTeamId &&
      bestMatch.providerMatchId === nextProviderMatchId
    ) {
      continue;
    }

    fixtureUpdates.push({
      matchId: bestMatch.id,
      providerMatchId: nextProviderMatchId,
      homeTeamId: nextHomeTeamId,
      awayTeamId: nextAwayTeamId,
    });
  }

  return fixtureUpdates;
};

const deriveScoreUpdates = (providerMatches: ProviderMatch[], matches: Match[], teams: Team[]): ScoreUpdate[] => {
  const updates: ScoreUpdate[] = [];

  const pendingMatches = matches.filter(
    (match) => Boolean(match.homeTeamId && match.awayTeamId),
  );

  const { teamByCode, teamByName } = createTeamLookup(teams);

  const pendingByPair = new Map<string, Match[]>();

  for (const match of pendingMatches) {
    const key = `${match.homeTeamId}-${match.awayTeamId}`;
    const existing = pendingByPair.get(key) || [];
    existing.push(match);
    pendingByPair.set(key, existing);
  }

  const consumedMatchIds = new Set<string>();

  for (const providerMatch of providerMatches) {
    if (!providerMatch.status || (!FINISHED_PROVIDER_STATUSES.has(providerMatch.status) && !LIVE_PROVIDER_STATUSES.has(providerMatch.status))) {
      continue;
    }

    if (providerMatch.homeScore === null || providerMatch.awayScore === null) {
      continue;
    }

    const homeTeamId = resolveTeamId(providerMatch.homeCode, providerMatch.homeName, teamByCode, teamByName);
    const awayTeamId = resolveTeamId(providerMatch.awayCode, providerMatch.awayName, teamByCode, teamByName);

    if (!homeTeamId || !awayTeamId) {
      continue;
    }

    const forwardCandidates = pendingByPair.get(`${homeTeamId}-${awayTeamId}`) || [];
    const reverseCandidates = pendingByPair.get(`${awayTeamId}-${homeTeamId}`) || [];

    let chosenMatch = pickBestMatch(forwardCandidates.filter(c => !consumedMatchIds.has(c.id)), providerMatch.kickoffUtc);
    let shouldSwapScores = false;

    if (!chosenMatch) {
      chosenMatch = pickBestMatch(reverseCandidates.filter(c => !consumedMatchIds.has(c.id)), providerMatch.kickoffUtc);
      shouldSwapScores = Boolean(chosenMatch);
    }

    if (!chosenMatch) {
      continue;
    }

    consumedMatchIds.add(chosenMatch.id);

    const homeScore = shouldSwapScores ? providerMatch.awayScore : providerMatch.homeScore;
    const awayScore = shouldSwapScores ? providerMatch.homeScore : providerMatch.awayScore;

    if (homeScore === null || awayScore === null) {
      continue;
    }

    const matchStatus = FINISHED_PROVIDER_STATUSES.has(providerMatch.status) ? 'FINISHED' : 'LIVE';

    updates.push({
      matchId: chosenMatch.id,
      homeScore,
      awayScore,
      status: matchStatus,
      source: LIVE_SOURCE_NAME,
    });
  }

  return updates;
};

const getFootballDataBaseUrl = (): string => {
  const configured = (import.meta.env.VITE_FOOTBALL_DATA_API_BASE_URL as string | undefined)?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  if (import.meta.env.DEV) {
    return DEV_PROXY_BASE_URL;
  }

  return 'https://api.football-data.org/v4';
};

const isDirectFootballDataUrl = (baseUrl: string): boolean => {
  return /^https?:\/\/api\.football-data\.org(?:\/v4)?$/i.test(baseUrl.replace(/\/+$/, ''));
};

export const fetchTournamentScoreUpdates = async ({
  tournamentId,
  matches,
  teams,
}: FetchScoreUpdatesParams): Promise<FetchScoreUpdatesResult> => {
  const fetchedAt = Date.now();
  const scoreFeedMode = getScoreFeedMode();

  if (scoreFeedMode === 'mock') {
    return {
      status: 'ok',
      source: MOCK_SOURCE_NAME,
      fetchedAt,
      fixtureUpdates: [],
      updates: deriveMockScoreUpdates(matches),
    };
  }

  if (scoreFeedMode === 'static') {
    const snapshotUrl = getStaticScoreFeedUrl(tournamentId);
    const response = await fetch(snapshotUrl);

    if (!response.ok) {
      throw new Error(`Static score feed request failed (${response.status} ${response.statusText}) at ${snapshotUrl}.`);
    }

    const payload = await response.json();
    const providerMatches = toProviderMatches(payload);
    const fixtureUpdates = deriveFixtureUpdates(providerMatches, matches, teams);
    const fixtureApplied = applyFixtureUpdates(matches, fixtureUpdates);
    const updates = deriveScoreUpdates(providerMatches, fixtureApplied.matches, teams);

    return {
      status: 'ok',
      source: STATIC_SOURCE_NAME,
      fetchedAt,
      fixtureUpdates,
      updates,
    };
  }

  const apiToken = (import.meta.env.VITE_FOOTBALL_DATA_API_TOKEN as string | undefined)?.trim();

  if (!apiToken) {
    return {
      status: 'disabled',
      source: LIVE_SOURCE_NAME,
      fetchedAt,
      fixtureUpdates: [],
      updates: [],
      reason: 'Automatic score sync is disabled. Set VITE_FOOTBALL_DATA_API_TOKEN in your .env file.',
    };
  }

  const competition = getCompetitionCode(tournamentId);
  const season = getSeasonYear(tournamentId);
  const baseUrl = getFootballDataBaseUrl();
  const endpoint = `${baseUrl}/competitions/${encodeURIComponent(competition)}/matches?season=${encodeURIComponent(season)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        'X-Auth-Token': apiToken,
      },
    });
  } catch (error: any) {
    const reason = error?.message || 'Failed to fetch';

    if (!import.meta.env.DEV && isDirectFootballDataUrl(baseUrl)) {
      throw new Error(
        `Score sync request could not be sent (${reason}). Production browsers often block direct football-data.org calls due to CORS. ` +
        `Use a backend proxy and set VITE_FOOTBALL_DATA_API_BASE_URL to that proxy URL.`,
      );
    }

    throw new Error(`Score sync request could not be sent (${reason}). Endpoint: ${endpoint}`);
  }

  if (!response.ok) {
    let details = '';
    try {
      const text = (await response.text()).trim();
      if (text) {
        details = ` Response: ${text.slice(0, 200)}`;
      }
    } catch {
      // Ignore response body parsing failures.
    }

    throw new Error(`Score sync request failed (${response.status} ${response.statusText}) at ${endpoint}.${details}`);
  }

  const payload = await response.json();
  const providerMatches = toProviderMatches(payload);
  const fixtureUpdates = deriveFixtureUpdates(providerMatches, matches, teams);
  const fixtureApplied = applyFixtureUpdates(matches, fixtureUpdates);
  const updates = deriveScoreUpdates(providerMatches, fixtureApplied.matches, teams);

  return {
    status: 'ok',
    source: LIVE_SOURCE_NAME,
    fetchedAt,
    fixtureUpdates,
    updates,
  };
};

export const applyFixtureUpdates = (matches: Match[], updates: FixtureUpdate[]): ApplyFixtureUpdatesResult => {
  if (updates.length === 0) {
    return { matches, appliedCount: 0 };
  }

  const updatesByMatchId = new Map<string, FixtureUpdate>();
  for (const update of updates) {
    updatesByMatchId.set(update.matchId, update);
  }

  let appliedCount = 0;
  let hasAnyChange = false;

  const nextMatches = matches.map((match) => {
    const update = updatesByMatchId.get(match.id);
    if (!update) return match;

    if (
      match.homeTeamId === update.homeTeamId &&
      match.awayTeamId === update.awayTeamId &&
      match.providerMatchId === update.providerMatchId
    ) {
      return match;
    }

    hasAnyChange = true;
    appliedCount += 1;

    return {
      ...match,
      providerMatchId: update.providerMatchId,
      homeTeamId: update.homeTeamId,
      awayTeamId: update.awayTeamId,
    };
  });

  if (!hasAnyChange) {
    return { matches, appliedCount: 0 };
  }

  return {
    matches: nextMatches,
    appliedCount,
  };
};

export const applyScoreUpdates = (matches: Match[], updates: ScoreUpdate[]): ApplyScoreUpdatesResult => {
  if (updates.length === 0) {
    return { matches, appliedCount: 0 };
  }

  const updatesByMatchId = new Map<string, ScoreUpdate>();
  for (const update of updates) {
    updatesByMatchId.set(update.matchId, update);
  }

  let appliedCount = 0;
  let hasAnyChange = false;

  const nextMatches = matches.map((match) => {
    const update = updatesByMatchId.get(match.id);
    if (!update) {
      return match;
    }



    if (match.homeScore === update.homeScore && match.awayScore === update.awayScore && match.status === update.status) {
      return match;
    }

    hasAnyChange = true;
    appliedCount += 1;

    return {
      ...match,
      homeScore: update.homeScore,
      awayScore: update.awayScore,
      status: update.status,
    };
  });

  if (!hasAnyChange) {
    return { matches, appliedCount: 0 };
  }

  return {
    matches: nextMatches,
    appliedCount,
  };
};

export const getNextScoreSyncDelayMs = (matches: Match[], nowMs: number = Date.now()): number => {
  const pending = matches.filter(
    (match) => Boolean(match.homeTeamId && match.awayTeamId) && isUnfinishedMatch(match),
  );

  if (pending.length === 0) {
    return NO_PENDING_SYNC_DELAY_MS;
  }

  const pendingKickoffMs = pending
    .map((match) => parseDateMs(match.date))
    .filter((value): value is number => value !== null);

  if (pendingKickoffMs.length === 0) {
    return IDLE_SYNC_DELAY_MS;
  }

  const hasActiveWindow = pendingKickoffMs.some((kickoffMs) => {
    const activeFrom = kickoffMs - ACTIVE_WINDOW_BEFORE_KICKOFF_MS;
    const activeUntil = kickoffMs + ACTIVE_WINDOW_AFTER_KICKOFF_MS;
    return nowMs >= activeFrom && nowMs <= activeUntil;
  });

  if (hasActiveWindow) {
    return ACTIVE_SYNC_DELAY_MS;
  }

  const hasRecentlyDueMatch = pendingKickoffMs.some((kickoffMs) => {
    const finishedWindowStart = kickoffMs + ACTIVE_WINDOW_AFTER_KICKOFF_MS;
    const finishedWindowEnd = kickoffMs + 12 * 60 * 60 * 1000;
    return nowMs >= finishedWindowStart && nowMs <= finishedWindowEnd;
  });

  if (hasRecentlyDueMatch) {
    return RECENTLY_DUE_SYNC_DELAY_MS;
  }

  const hasUpcomingMatchSoon = pendingKickoffMs.some((kickoffMs) => {
    return kickoffMs > nowMs && kickoffMs - nowMs <= 6 * 60 * 60 * 1000;
  });

  if (hasUpcomingMatchSoon) {
    return UPCOMING_SYNC_DELAY_MS;
  }

  return IDLE_SYNC_DELAY_MS;
};
