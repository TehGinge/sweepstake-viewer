export type MatchStage = 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'FINAL';
export type TournamentId = 'WC26';
// export type TournamentId = 'WC26' | 'EURO28'; // Archived until official Euro 2028 groups are confirmed.

export interface Team {
  id: string; // 3-letter code
  name: string;
  group: string; // A - L
  iso2: string;
  fifaRanking: number;
}

export type MatchStatus = 'SCHEDULED' | 'FINISHED';

export interface Match {
  id: string;
  stage: MatchStage;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  group?: string; // Only for GROUP stage
  date?: string;
  location?: string;
  placeholderHome?: string;
  placeholderAway?: string;
}

export interface Player {
  id: string;
  name: string;
  teamIds: string[];
}

export interface ScoreConfig {
  matchWin: number;
  matchDraw: number;
}

export interface AppSettings {
  isDarkMode: boolean;
  allowRandomize: boolean;
  allowSimulate: boolean;
  customTitle: string;
}

export type ScoreSyncState = 'idle' | 'syncing' | 'disabled' | 'error';

export interface ScoreSyncStatus {
  state: ScoreSyncState;
  source: string | null;
  lastSyncedAt: number | null;
  lastAppliedCount: number;
  lastError: string | null;
}

export interface PersistedAppState {
  tournamentId: TournamentId;
  players: Player[];
  matches: Match[];
  config: ScoreConfig;
  settings: AppSettings;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  points: number;
  teams: Team[];
}
