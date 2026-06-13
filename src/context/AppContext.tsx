import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, Match, PersistedAppState, Player, ScoreConfig, ScoreSyncStatus, Team, TournamentId } from '../types';
import { generateInitialMatches } from '../data/matches';
import { TEAMS as WC26_TEAMS, GROUPS as WC26_GROUPS } from '../data/teams';
// import { EURO28_TEAMS, EURO28_GROUPS, generateEuro28Matches } from '../data/euro28';
import { CloudGameStatus, createCloudGame, deleteCloudGame, subscribeToCloudGame, updateCloudGameState, claimCloudGame, getCloudGameSecret } from '../firebase/gameStore';
import { ensureAnonymousAuth, isFirebaseConfigured } from '../firebase/client';
import { ScoreUpdate, applyScoreUpdates, fetchTournamentScoreUpdates, getNextScoreSyncDelayMs } from '../services/scoreSync';
import { publishCentralScoreUpdates, subscribeToCentralScoreFeed } from '../firebase/scoreFeedStore';

const isValidTournamentId = (id: string): id is TournamentId => {
  return id === 'WC26';
  // return id === 'WC26' || id === 'EURO28';
};

const getTeams = (id: TournamentId) => {
  switch (id) {
    case 'WC26': return WC26_TEAMS;
    // case 'EURO28': return EURO28_TEAMS;
    default: return WC26_TEAMS;
  }
};

const getGroups = (id: TournamentId) => {
  switch (id) {
    case 'WC26': return WC26_GROUPS;
    // case 'EURO28': return EURO28_GROUPS;
    default: return WC26_GROUPS;
  }
};

const getDefaultPlayers = () => {
  return INITIAL_PLAYERS.map(p => ({ ...p, teamIds: [] }));
};

const getDefaultMatches = (id: TournamentId) => {
  switch (id) {
    case 'WC26': return generateInitialMatches();
    // case 'EURO28': return generateEuro28Matches();
    default: return generateInitialMatches();
  }
};

interface AppState {
  tournamentId: TournamentId;
  teams: Team[];
  groups: string[];
  players: Player[];
  matches: Match[];
  setMatches: React.Dispatch<React.SetStateAction<Match[]>>;
  config: ScoreConfig;
  settings: AppSettings;
  scoreSyncStatus: ScoreSyncStatus;
  scoreSyncLogs: ScoreSyncLogEntry[];
  clearScoreSyncLogs: () => void;
  triggerScoreSync: () => Promise<void>;
  isReadOnly: boolean;
  cloudGameId: string | null;
  cloudStatus: CloudGameStatus;
  cloudError: string | null;
  isCloudOwner: boolean;
  createLiveGame: () => Promise<{ url?: string; error?: string; gameId?: string }>;
  deleteLiveGame: () => Promise<{ success?: boolean; error?: string }>;
  getLiveGameUrl: () => string | null;
  setTournamentId: (id: TournamentId) => void;
  setPlayers: (players: Player[]) => void;
  updateMatch: (id: string, homeScore: number | null, awayScore: number | null, homeTeamId?: string | null, awayTeamId?: string | null) => void;
  assignTeamsRandomly: () => void;
  clearAllAssignments: () => void;
  resetTournament: () => void;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
}

const DEFAULT_CONFIG: ScoreConfig = {
  matchWin: 3,
  matchDraw: 1,
};

const INITIAL_PLAYERS: Player[] = Array.from({ length: 8 }, (_, i) => ({
  id: `P${i + 1}`,
  name: `Player ${i + 1}`,
  teamIds: [],
}));

const DEFAULT_SETTINGS: AppSettings = {
  isDarkMode: false,
  allowRandomize: false,
  allowSimulate: false,
  customTitle: 'SWEEPSTAKE',
};

const DEFAULT_SCORE_SYNC_STATUS: ScoreSyncStatus = {
  state: 'idle',
  source: null,
  lastSyncedAt: null,
  lastAppliedCount: 0,
  lastError: null,
};

const SCORE_SYNC_MAX_CALLS_PER_MINUTE = 10;
const SCORE_SYNC_MIN_GAP_MS = Math.ceil((60_000 / SCORE_SYNC_MAX_CALLS_PER_MINUTE) * 1.1);
const SCORE_SYNC_JITTER_MS = 2_000;
const SCORE_SYNC_LAST_REQUEST_KEY = 'scoreSync:lastRequestAt';
const SCORE_SYNC_LOG_LIMIT = 40;

type ScoreSyncTrigger = 'auto' | 'manual';
type ScoreSyncLogLevel = 'info' | 'success' | 'warn' | 'error';

interface ScoreSyncLogEntry {
  id: string;
  timestamp: number;
  trigger: ScoreSyncTrigger;
  level: ScoreSyncLogLevel;
  message: string;
}

const getScoreSyncCooldownRemainingMs = (nowMs: number = Date.now()): number => {
  try {
    const lastRequestRaw = localStorage.getItem(SCORE_SYNC_LAST_REQUEST_KEY);
    if (!lastRequestRaw) return 0;

    const lastRequestMs = Number.parseInt(lastRequestRaw, 10);
    if (Number.isNaN(lastRequestMs) || lastRequestMs <= 0) return 0;

    const elapsed = nowMs - lastRequestMs;
    if (elapsed >= SCORE_SYNC_MIN_GAP_MS) return 0;

    return SCORE_SYNC_MIN_GAP_MS - elapsed;
  } catch {
    return 0;
  }
};

const markScoreSyncRequest = (nowMs: number = Date.now()): void => {
  try {
    localStorage.setItem(SCORE_SYNC_LAST_REQUEST_KEY, `${nowMs}`);
  } catch {
    // Ignore storage failures; sync can still continue.
  }
};

const AppContext = createContext<AppState | undefined>(undefined);

const resolveIncomingMatchStatus = (match: Match): Match['status'] => {
  if (match.status === 'LIVE' || match.status === 'FINISHED' || match.status === 'SCHEDULED') {
    return match.status;
  }

  return match.homeScore !== null && match.awayScore !== null ? 'FINISHED' : 'SCHEDULED';
};

const mergeMatchesWithTemplate = (id: TournamentId, savedMatches?: Match[]): Match[] => {
  const defaultMatches = getDefaultMatches(id);
  if (!savedMatches) return defaultMatches;

  let loadedMatches = defaultMatches.map((templateMatch: Match) => {
    const incomingMatch = savedMatches.find((match: Match) => match.id === templateMatch.id);
    if (!incomingMatch) return templateMatch;

    return {
      ...templateMatch,
      homeScore: incomingMatch.homeScore,
      awayScore: incomingMatch.awayScore,
      status: resolveIncomingMatchStatus(incomingMatch),
      homeTeamId: templateMatch.stage === 'GROUP' ? templateMatch.homeTeamId : incomingMatch.homeTeamId,
      awayTeamId: templateMatch.stage === 'GROUP' ? templateMatch.awayTeamId : incomingMatch.awayTeamId,
    };
  });

  const activeTeams = getTeams(id);
  const firstGroupMatch = loadedMatches.find((match: Match) => match.stage === 'GROUP');
  if (firstGroupMatch && firstGroupMatch.homeTeamId && !activeTeams.some(team => team.id === firstGroupMatch.homeTeamId)) {
    loadedMatches = defaultMatches;
  }

  return loadedMatches;
};

const getHashParams = (hash: string): URLSearchParams => {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(normalized);
};

const buildLiveGameHash = (gameId: string): string => {
  const params = getHashParams(window.location.hash);
  params.set('game', gameId);
  params.delete('viewer');
  return params.toString();
};

const buildLiveGameUrl = (gameId: string): string => {
  const url = new URL(window.location.href);
  url.hash = buildLiveGameHash(gameId);
  return url.toString();
};

const clearLiveGameHash = (): void => {
  const params = getHashParams(window.location.hash);
  params.delete('game');
  params.delete('viewer');

  const nextHash = params.toString();
  window.location.hash = nextHash;
};

interface AppProviderProps {
  children: React.ReactNode;
  cloudGameId?: string | null;
  hostSecret?: string | null;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children, cloudGameId = null, hostSecret = null }) => {
  const [tournamentId, setTournamentIdState] = useState<TournamentId>('WC26');
  const [players, setPlayersState] = useState<Player[]>(INITIAL_PLAYERS);
  const [matchesState, setMatchesState] = useState<Match[]>([]);
  const [config, setConfig] = useState<ScoreConfig>(DEFAULT_CONFIG);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  const [cloudStatus, setCloudStatus] = useState<CloudGameStatus>('disabled');
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudCurrentUid, setCloudCurrentUid] = useState<string | null>(null);
  const [cloudOwnerUid, setCloudOwnerUid] = useState<string | null>(null);
  const [scoreSyncStatus, setScoreSyncStatus] = useState<ScoreSyncStatus>(DEFAULT_SCORE_SYNC_STATUS);
  const [scoreSyncLogs, setScoreSyncLogs] = useState<ScoreSyncLogEntry[]>([]);

  const teams = getTeams(tournamentId);
  const groups = getGroups(tournamentId);

  const isCloudOwner = Boolean(cloudGameId && cloudCurrentUid && cloudOwnerUid && cloudCurrentUid === cloudOwnerUid);
  const computedReadOnly = Boolean(cloudGameId && !isCloudOwner);

  const persistedState = useMemo<PersistedAppState>(() => ({
    tournamentId,
    players,
    matches: matchesState,
    config,
    settings,
  }), [tournamentId, players, matchesState, config, settings]);

  const persistedStateSignature = useMemo(() => JSON.stringify(persistedState), [persistedState]);
  const lastRemoteSignatureRef = useRef<string | null>(null);
  const scoreSyncTimerRef = useRef<number | null>(null);
  const scoreSyncInFlightRef = useRef(false);
  const latestSyncInputsRef = useRef<{ tournamentId: TournamentId; teams: Team[]; matches: Match[] }>({
    tournamentId,
    teams,
    matches: matchesState,
  });
  const latestCentralScoreUpdatesRef = useRef<Map<string, ScoreUpdate>>(new Map());

  const setMatches: React.Dispatch<React.SetStateAction<Match[]>> = (nextState) => {
    if (computedReadOnly) return;

    setMatchesState(prevMatches => {
      if (typeof nextState === 'function') {
        return (nextState as (prevState: Match[]) => Match[])(prevMatches);
      }
      return nextState;
    });
  };

  const appendScoreSyncLog = useCallback((trigger: ScoreSyncTrigger, level: ScoreSyncLogLevel, message: string) => {
    const entry: ScoreSyncLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now(),
      trigger,
      level,
      message,
    };

    setScoreSyncLogs((prev) => [entry, ...prev].slice(0, SCORE_SYNC_LOG_LIMIT));
  }, []);

  const clearScoreSyncLogs = useCallback(() => {
    setScoreSyncLogs([]);
  }, []);

  const executeScoreSync = useCallback(async (trigger: ScoreSyncTrigger) => {
    if (scoreSyncInFlightRef.current) {
      if (trigger === 'manual') {
        appendScoreSyncLog(trigger, 'warn', 'Manual sync skipped because another sync is already running.');
      }
      return;
    }

    const startedAt = Date.now();

    if (trigger === 'manual') {
      appendScoreSyncLog(trigger, 'info', 'Manual sync started.');
    }

    scoreSyncInFlightRef.current = true;
    markScoreSyncRequest(startedAt);

    setScoreSyncStatus((prev) => ({
      ...prev,
      state: 'syncing',
      lastError: null,
    }));

    try {
      const syncInputs = latestSyncInputsRef.current;
      const result = await fetchTournamentScoreUpdates(syncInputs);

      if (result.status === 'disabled') {
        setScoreSyncStatus((prev) => ({
          ...prev,
          state: 'disabled',
          source: result.source,
          lastError: result.reason,
        }));

        if (trigger === 'manual') {
          appendScoreSyncLog(trigger, 'error', `Manual sync disabled: ${result.reason}`);
        }
        return;
      }

      let appliedCount = 0;

      if (result.updates.length > 0) {
        setMatchesState((prevMatches) => {
          const applied = applyScoreUpdates(prevMatches, result.updates);
          appliedCount = applied.appliedCount;
          return applied.matches;
        });

        if (cloudGameId && isCloudOwner) {
          await publishCentralScoreUpdates(syncInputs.tournamentId, result.updates);
        }
      }

      setScoreSyncStatus((prev) => ({
        ...prev,
        state: 'idle',
        source: result.source,
        lastSyncedAt: result.fetchedAt,
        lastAppliedCount: appliedCount,
        lastError: null,
      }));

      if (trigger === 'manual') {
        appendScoreSyncLog(
          trigger,
          'success',
          `Manual sync complete via ${result.source}. Provider updates: ${result.updates.length}, applied: ${appliedCount}.`,
        );
      }
    } catch (error: any) {
      const message = error?.message || 'Automatic score sync failed.';
      setScoreSyncStatus((prev) => ({
        ...prev,
        state: 'error',
        lastError: message,
      }));

      if (trigger === 'manual') {
        appendScoreSyncLog(trigger, 'error', `Manual sync failed: ${message}`);
      }
    } finally {
      scoreSyncInFlightRef.current = false;
    }
  }, [appendScoreSyncLog, cloudGameId, isCloudOwner]);

  const triggerScoreSync = useCallback(async () => {
    if (!isLoaded) {
      appendScoreSyncLog('manual', 'warn', 'Manual sync skipped because the app is still loading.');
      return;
    }

    await executeScoreSync('manual');
  }, [appendScoreSyncLog, executeScoreSync, isLoaded]);

  useEffect(() => {
    latestSyncInputsRef.current = {
      tournamentId,
      teams,
      matches: matchesState,
    };
  }, [tournamentId, teams, matchesState]);

  useEffect(() => {
    if (!cloudGameId || !isFirebaseConfigured()) {
      latestCentralScoreUpdatesRef.current.clear();
      return;
    }

    return subscribeToCentralScoreFeed(
      tournamentId,
      (updates) => {
        latestCentralScoreUpdatesRef.current = new Map<string, ScoreUpdate>(
          updates.map((update) => [update.matchId, update]),
        );

        if (updates.length === 0) return;

        setMatchesState((prevMatches) => {
          return applyScoreUpdates(prevMatches, updates).matches;
        });
      },
      () => {},
    );
  }, [cloudGameId, tournamentId]);

  useEffect(() => {
    if (cloudGameId) {
      return;
    }

    const saved = localStorage.getItem('worldCupAppState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const savedTournamentId = isValidTournamentId(parsed.tournamentId) ? parsed.tournamentId : 'WC26';
        if (isValidTournamentId(parsed.tournamentId)) {
          setTournamentIdState(savedTournamentId);
        }

        let loadedPlayers = parsed.players || getDefaultPlayers();
        const activeTeams = getTeams(savedTournamentId);

        if (loadedPlayers.length > 0 && loadedPlayers[0].teamIds.length > 0) {
          const someTeamId = loadedPlayers[0].teamIds[0];
          if (!activeTeams.some(team => team.id === someTeamId)) {
            loadedPlayers = getDefaultPlayers();
          }
        }

        setPlayersState(loadedPlayers);
        setMatchesState(mergeMatchesWithTemplate(savedTournamentId, parsed.matches));

        let loadedConfig = parsed.config;
        if (loadedConfig && typeof loadedConfig.matchWin === 'undefined') {
          loadedConfig = {
            matchWin: loadedConfig.groupWin ?? DEFAULT_CONFIG.matchWin,
            matchDraw: loadedConfig.groupDraw ?? DEFAULT_CONFIG.matchDraw,
          };
        }

        setConfig(loadedConfig || DEFAULT_CONFIG);
        setSettings({ ...DEFAULT_SETTINGS, ...(parsed.settings || {}) });
      } catch {
        setMatchesState(getDefaultMatches('WC26'));
      }
    } else {
      setMatchesState(getDefaultMatches('WC26'));
    }

    setIsLoaded(true);
  }, [cloudGameId]);

  useEffect(() => {
    if (!cloudGameId) {
      setCloudStatus('disabled');
      setCloudError(null);
      setCloudCurrentUid(null);
      setCloudOwnerUid(null);
      return;
    }

    if (!isFirebaseConfigured()) {
      setCloudStatus('error');
      setCloudError('Firebase is not configured. Add VITE_FIREBASE_* values to use live sharing.');
      setIsLoaded(true);
      return;
    }

    let isCancelled = false;
    let unsubscribe = () => {};

    setCloudStatus('connecting');
    setCloudError(null);
    setIsLoaded(false);

    ensureAnonymousAuth()
      .then(async (user) => {
        if (isCancelled) return;
        if (!user) {
          throw new Error('Could not authenticate with Firebase.');
        }

        setCloudCurrentUid(user.uid);

        if (hostSecret) {
          try {
            await claimCloudGame(cloudGameId, hostSecret, user.uid);
            
            // Remove hostSecret from URL so it doesn't leak if the user copies the URL
            const hashParams = new URLSearchParams(window.location.hash.slice(1));
            hashParams.delete('hostSecret');
            const newHash = hashParams.toString();
            window.history.replaceState(null, '', newHash ? `#${newHash}` : window.location.pathname);
          } catch (e) {
            console.error('Failed to claim game with secret', e);
          }
        }

        if (isCancelled) return;

        unsubscribe = subscribeToCloudGame(
          cloudGameId,
          (record) => {
            if (isCancelled) return;

            if (!record) {
              setCloudStatus('error');
              setCloudError('This live game is no longer available. It may have been deleted by the host.');
              setIsLoaded(true);
              return;
            }

            const incomingState: PersistedAppState = {
              ...record.state,
              matches: mergeMatchesWithTemplate(record.state.tournamentId, record.state.matches),
              settings: { ...DEFAULT_SETTINGS, ...record.state.settings },
            };
            const centralScoreUpdates: ScoreUpdate[] = Array.from(latestCentralScoreUpdatesRef.current.values());
            const nextMatches = centralScoreUpdates.length > 0
              ? applyScoreUpdates(incomingState.matches, centralScoreUpdates).matches
              : incomingState.matches;

            lastRemoteSignatureRef.current = JSON.stringify(incomingState);
            setCloudOwnerUid(record.meta.ownerUid);

            setTournamentIdState(incomingState.tournamentId);
            setPlayersState(incomingState.players);
            setMatchesState(nextMatches);
            setConfig(incomingState.config);
            setSettings(incomingState.settings);

            setCloudStatus('ready');
            setCloudError(null);
            setIsLoaded(true);
          },
          (error) => {
            if (isCancelled) return;
            setCloudStatus('error');
            setCloudError(error.message || 'Failed to load live game.');
            setIsLoaded(true);
          },
        );
      })
      .catch((error) => {
        if (isCancelled) return;
        setCloudStatus('error');
        setCloudError(error.message || 'Failed to connect to Firebase.');
        setIsLoaded(true);
      });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [cloudGameId]);

  useEffect(() => {
    if (!cloudGameId || !isCloudOwner || cloudStatus !== 'ready' || !isLoaded) {
      return;
    }

    if (persistedStateSignature === lastRemoteSignatureRef.current) {
      return;
    }

    updateCloudGameState(cloudGameId, persistedState)
      .then(() => {
        lastRemoteSignatureRef.current = persistedStateSignature;
      })
      .catch((error) => {
        setCloudStatus('error');
        setCloudError(error.message || 'Failed to save live game changes.');
      });
  }, [cloudGameId, isCloudOwner, cloudStatus, isLoaded, persistedState, persistedStateSignature]);

  useEffect(() => {
    const clearSyncTimer = () => {
      if (scoreSyncTimerRef.current !== null) {
        window.clearTimeout(scoreSyncTimerRef.current);
        scoreSyncTimerRef.current = null;
      }
    };

    const scheduleSyncAfter = (delayMs: number) => {
      const safeDelayMs = Math.max(0, delayMs);
      const jitterMs = Math.floor(Math.random() * SCORE_SYNC_JITTER_MS);

      clearSyncTimer();
      scoreSyncTimerRef.current = window.setTimeout(() => {
        void runSyncCycle();
      }, safeDelayMs + jitterMs);
    };

    if (!isLoaded) {
      clearSyncTimer();
      return;
    }

    if (computedReadOnly) {
      clearSyncTimer();
      scoreSyncInFlightRef.current = false;
      setScoreSyncStatus((prev) => ({
        ...prev,
        state: 'disabled',
        lastError: 'Viewer mode: automatic score updates are handled by the host.',
      }));
      return;
    }

    let isCancelled = false;

    const scheduleNextSync = () => {
      if (isCancelled) return;

      const delayMs = getNextScoreSyncDelayMs(latestSyncInputsRef.current.matches);
      scheduleSyncAfter(delayMs);
    };

    const runSyncCycle = async () => {
      if (isCancelled || scoreSyncInFlightRef.current) {
        scheduleNextSync();
        return;
      }

      const nowMs = Date.now();
      const remainingCooldownMs = getScoreSyncCooldownRemainingMs(nowMs);
      if (remainingCooldownMs > 0) {
        setScoreSyncStatus((prev) => ({
          ...prev,
          state: 'idle',
          lastError: null,
        }));
        scheduleSyncAfter(remainingCooldownMs);
        return;
      }

      await executeScoreSync('auto');

      if (isCancelled) return;
      scheduleNextSync();
    };

    void runSyncCycle();

    return () => {
      isCancelled = true;
      clearSyncTimer();
    };
  }, [computedReadOnly, executeScoreSync, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      import('../utils/knockouts').then(({ autoPopulateKnockouts }) => {
        setMatchesState(prevMatches => {
          const nextMatches = autoPopulateKnockouts(prevMatches, teams);

          let changed = false;
          for (let i = 0; i < prevMatches.length; i++) {
            if (prevMatches[i].homeTeamId !== nextMatches[i].homeTeamId || prevMatches[i].awayTeamId !== nextMatches[i].awayTeamId) {
              changed = true;
              break;
            }
          }

          return changed ? nextMatches : prevMatches;
        });
      });
    }
  }, [matchesState, teams, isLoaded]);

  // the local dark mode effect is now managed in App.tsx

  useEffect(() => {
    if (isLoaded && !computedReadOnly && !cloudGameId) {
      localStorage.setItem('worldCupAppState', JSON.stringify({
        tournamentId,
        players,
        matches: matchesState,
        config,
        settings,
      }));
    }
  }, [tournamentId, players, matchesState, config, settings, isLoaded, computedReadOnly, cloudGameId]);

  const createLiveGameLink = async (): Promise<{ url?: string; error?: string; gameId?: string }> => {
    if (cloudGameId) {
      return {
        url: buildLiveGameUrl(cloudGameId),
        gameId: cloudGameId,
      };
    }

    if (!isFirebaseConfigured()) {
      return {
        error: 'Firebase is not configured. Add VITE_FIREBASE_* environment variables first.',
      };
    }

    try {
      setCloudStatus('connecting');
      setCloudError(null);

      const user = await ensureAnonymousAuth();
      if (!user) {
        throw new Error('Could not authenticate with Firebase.');
      }

      const gameId = await createCloudGame(user.uid, persistedState);
      const url = buildLiveGameUrl(gameId);
      window.location.hash = buildLiveGameHash(gameId);

      return { gameId, url };
    } catch (error: any) {
      const message = error?.message || 'Could not create a live game.';
      setCloudStatus('error');
      setCloudError(message);
      return { error: message };
    }
  };

  const getLiveGameUrl = (): string | null => {
    if (!cloudGameId) return null;
    return buildLiveGameUrl(cloudGameId);
  };

  const deleteLiveGameLink = async (): Promise<{ success?: boolean; error?: string }> => {
    if (!cloudGameId) {
      return { error: 'No live game is active.' };
    }

    if (!isCloudOwner) {
      return { error: 'Only the host can delete this live game.' };
    }

    try {
      setCloudStatus('connecting');
      setCloudError(null);

      await deleteCloudGame(cloudGameId);

      // Preserve current live state before switching back to local mode.
      localStorage.setItem('worldCupAppState', JSON.stringify(persistedState));
      clearLiveGameHash();

      return { success: true };
    } catch (error: any) {
      const message = error?.message || 'Could not delete live game.';
      setCloudStatus('error');
      setCloudError(message);
      return { error: message };
    }
  };

  const setTournamentId = (id: TournamentId) => {
    if (computedReadOnly) return;
    setTournamentIdState(id);
    setMatchesState(getDefaultMatches(id));
    setPlayersState(getDefaultPlayers());
  };

  const setPlayers = (newPlayers: Player[]) => {
    if (computedReadOnly) return;
    setPlayersState(newPlayers);
  };

  const updateMatch = (id: string, homeScore: number | null, awayScore: number | null, homeTeamId?: string | null, awayTeamId?: string | null) => {
    if (computedReadOnly) return;

    setMatchesState(prevMatches => prevMatches.map(match => {
      if (match.id === id) {
        const updatedMatch = { ...match, homeScore, awayScore };

        if (homeScore !== null && awayScore !== null) {
          updatedMatch.status = 'FINISHED';
        } else {
          updatedMatch.status = 'SCHEDULED';
        }

        if (homeTeamId !== undefined) updatedMatch.homeTeamId = homeTeamId;
        if (awayTeamId !== undefined) updatedMatch.awayTeamId = awayTeamId;
        return updatedMatch;
      }
      return match;
    }));
  };

  const assignTeamsRandomly = () => {
    if (computedReadOnly || players.length === 0) return;

    const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
    const randomizedPlayers = players.map(player => ({ ...player, teamIds: [] as string[] }));

    shuffledTeams.forEach((team, index) => {
      const playerIndex = index % players.length;
      randomizedPlayers[playerIndex].teamIds.push(team.id);
    });

    setPlayersState(randomizedPlayers);
  };

  const clearAllAssignments = () => {
    if (computedReadOnly) return;
    setPlayersState(prevPlayers => prevPlayers.map(player => ({ ...player, teamIds: [] })));
  };

  const resetTournament = () => {
    if (computedReadOnly) return;
    setMatchesState(getDefaultMatches(tournamentId));
  };

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    if (computedReadOnly) return;
    setSettings(prevSettings => ({ ...prevSettings, ...newSettings }));
  };

  if (!isLoaded) return null;

  return (
    <AppContext.Provider value={{
      tournamentId,
      teams,
      groups,
      players,
      matches: matchesState,
      setMatches,
      config,
      settings,
      scoreSyncStatus,
      scoreSyncLogs,
      clearScoreSyncLogs,
      triggerScoreSync,
      isReadOnly: computedReadOnly,
      cloudGameId,
      cloudStatus,
      cloudError,
      isCloudOwner,
      createLiveGame: createLiveGameLink,
      deleteLiveGame: deleteLiveGameLink,
      getLiveGameUrl,
      setTournamentId,
      setPlayers,
      updateMatch,
      assignTeamsRandomly,
      clearAllAssignments,
      resetTournament,
      updateSettings,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
