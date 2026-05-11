import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, Match, PersistedAppState, Player, ScoreConfig, Team, TournamentId } from '../types';
import { generateInitialMatches } from '../data/matches';
import { TEAMS as WC26_TEAMS, GROUPS as WC26_GROUPS } from '../data/teams';
import { EURO28_TEAMS, EURO28_GROUPS, generateEuro28Matches } from '../data/euro28';
import { CloudGameStatus, createCloudGame, deleteCloudGame, subscribeToCloudGame, updateCloudGameState } from '../firebase/gameStore';
import { ensureAnonymousAuth, isFirebaseConfigured } from '../firebase/client';

const isValidTournamentId = (id: string): id is TournamentId => {
  return id === 'WC26' || id === 'EURO28';
};

const getTeams = (id: TournamentId) => {
  switch (id) {
    case 'WC26': return WC26_TEAMS;
    case 'EURO28': return EURO28_TEAMS;
    default: return WC26_TEAMS;
  }
};

const getGroups = (id: TournamentId) => {
  switch (id) {
    case 'WC26': return WC26_GROUPS;
    case 'EURO28': return EURO28_GROUPS;
    default: return WC26_GROUPS;
  }
};

const getDefaultPlayers = () => {
  return INITIAL_PLAYERS.map(p => ({ ...p, teamIds: [] }));
};

const getDefaultMatches = (id: TournamentId) => {
  switch (id) {
    case 'WC26': return generateInitialMatches();
    case 'EURO28': return generateEuro28Matches();
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

const AppContext = createContext<AppState | undefined>(undefined);

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
      status: (incomingMatch.homeScore !== null && incomingMatch.awayScore !== null ? 'FINISHED' : 'SCHEDULED') as 'FINISHED' | 'SCHEDULED',
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
}

export const AppProvider: React.FC<AppProviderProps> = ({ children, cloudGameId = null }) => {
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

  const setMatches: React.Dispatch<React.SetStateAction<Match[]>> = (nextState) => {
    if (computedReadOnly) return;

    setMatchesState(prevMatches => {
      if (typeof nextState === 'function') {
        return (nextState as (prevState: Match[]) => Match[])(prevMatches);
      }
      return nextState;
    });
  };

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
      .then((user) => {
        if (isCancelled) return;
        if (!user) {
          throw new Error('Could not authenticate with Firebase.');
        }

        setCloudCurrentUid(user.uid);

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

            lastRemoteSignatureRef.current = JSON.stringify(incomingState);
            setCloudOwnerUid(record.meta.ownerUid);

            setTournamentIdState(incomingState.tournamentId);
            setPlayersState(incomingState.players);
            setMatchesState(incomingState.matches);
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
