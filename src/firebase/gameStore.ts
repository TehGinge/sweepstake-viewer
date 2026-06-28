import { DataSnapshot, off, onValue, push, ref, remove, set, update, get, query, orderByChild, equalTo } from 'firebase/database';
import { getFirebaseServices } from './client';
import { AppSettings, Match, PersistedAppState, Player, ScoreConfig, TournamentId } from '../types';

export type CloudGameStatus = 'disabled' | 'connecting' | 'ready' | 'error';

export interface CloudGameRecord {
  meta: {
    ownerUid: string;
    createdAt: number;
    updatedAt: number;
    schemaVersion: 1;
  };
  state: PersistedAppState;
}

const DEFAULT_SETTINGS: AppSettings = {
  isDarkMode: false,
  allowRandomize: false,
  allowSimulate: false,
  customTitle: 'SWEEPSTAKE',
};

const DEFAULT_CONFIG: ScoreConfig = {
  matchWin: 3,
  matchDraw: 1,
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isTournamentId = (value: unknown): value is TournamentId => {
  return value === 'WC26';
  // return value === 'WC26' || value === 'EURO28';
};

const normalizePlayers = (value: unknown): Player[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isObject)
    .map((player, index) => ({
      id: typeof player.id === 'string' ? player.id : `P${index + 1}`,
      name: typeof player.name === 'string' ? player.name : `Player ${index + 1}`,
      teamIds: Array.isArray(player.teamIds) ? player.teamIds.filter((id): id is string => typeof id === 'string') : [],
    }));
};

const normalizeMatchStatus = (match: Record<string, unknown>): Match['status'] => {
  if (match.status === 'LIVE' || match.status === 'FINISHED' || match.status === 'SCHEDULED') {
    return match.status;
  }

  return match.homeScore !== null && match.awayScore !== null ? 'FINISHED' : 'SCHEDULED';
};

const normalizeMatches = (value: unknown): Match[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isObject)
    .filter((match) => typeof match.id === 'string' && typeof match.stage === 'string')
    .map((match) => ({
      id: match.id as string,
      stage: match.stage as Match['stage'],
      providerMatchId: typeof match.providerMatchId === 'string' ? match.providerMatchId : undefined,
      homeTeamId: typeof match.homeTeamId === 'string' ? match.homeTeamId : null,
      awayTeamId: typeof match.awayTeamId === 'string' ? match.awayTeamId : null,
      homeScore: typeof match.homeScore === 'number' ? match.homeScore : null,
      awayScore: typeof match.awayScore === 'number' ? match.awayScore : null,
      status: normalizeMatchStatus(match),
      group: typeof match.group === 'string' ? match.group : undefined,
      date: typeof match.date === 'string' ? match.date : undefined,
      location: typeof match.location === 'string' ? match.location : undefined,
      placeholderHome: typeof match.placeholderHome === 'string' ? match.placeholderHome : undefined,
      placeholderAway: typeof match.placeholderAway === 'string' ? match.placeholderAway : undefined,
    }));
};

const normalizeConfig = (value: unknown): ScoreConfig => {
  if (!isObject(value)) return DEFAULT_CONFIG;

  return {
    matchWin: typeof value.matchWin === 'number' ? value.matchWin : DEFAULT_CONFIG.matchWin,
    matchDraw: typeof value.matchDraw === 'number' ? value.matchDraw : DEFAULT_CONFIG.matchDraw,
  };
};

const normalizeSettings = (value: unknown): AppSettings => {
  if (!isObject(value)) return DEFAULT_SETTINGS;

  return {
    isDarkMode: typeof value.isDarkMode === 'boolean' ? value.isDarkMode : DEFAULT_SETTINGS.isDarkMode,
    allowRandomize: typeof value.allowRandomize === 'boolean' ? value.allowRandomize : DEFAULT_SETTINGS.allowRandomize,
    allowSimulate: typeof value.allowSimulate === 'boolean' ? value.allowSimulate : DEFAULT_SETTINGS.allowSimulate,
    customTitle: typeof value.customTitle === 'string' ? value.customTitle : DEFAULT_SETTINGS.customTitle,
  };
};

const getStateFromSnapshot = (snapshot: DataSnapshot): PersistedAppState | null => {
  const value = snapshot.val();
  if (!isObject(value)) return null;
  if (!isObject(value.state)) return null;

  const state = value.state;
  if (!isTournamentId(state.tournamentId)) return null;

  return {
    tournamentId: state.tournamentId,
    players: normalizePlayers(state.players),
    matches: normalizeMatches(state.matches),
    config: normalizeConfig(state.config),
    settings: normalizeSettings(state.settings),
  };
};

const getMetaFromSnapshot = (snapshot: DataSnapshot): CloudGameRecord['meta'] | null => {
  const value = snapshot.val();
  if (!isObject(value) || !isObject(value.meta)) return null;

  const meta = value.meta;
  if (typeof meta.ownerUid !== 'string' || meta.ownerUid.length === 0) return null;

  return {
    ownerUid: meta.ownerUid,
    createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : Date.now(),
    updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : Date.now(),
    schemaVersion: 1,
  };
};

export const subscribeToCloudGame = (
  gameId: string,
  onGame: (record: CloudGameRecord | null) => void,
  onError: (error: Error) => void,
): (() => void) => {
  const services = getFirebaseServices();
  if (!services) {
    onError(new Error('Firebase is not configured.'));
    return () => {};
  }

  const gameRef = ref(services.database, `games/${gameId}`);

  const unsubscribe = onValue(
    gameRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onGame(null);
        return;
      }

      const state = getStateFromSnapshot(snapshot);
      const meta = getMetaFromSnapshot(snapshot);

      if (!state || !meta) {
        onError(new Error('Cloud game payload is invalid.'));
        return;
      }

      onGame({ meta, state });
    },
    (error) => onError(error),
  );

  return () => {
    off(gameRef);
    unsubscribe();
  };
};

export const createCloudGame = async (ownerUid: string, state: PersistedAppState): Promise<string> => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  const gamesRef = ref(services.database, 'games');
  const newGameRef = push(gamesRef);

  if (!newGameRef.key) {
    throw new Error('Could not generate a game ID.');
  }

  const now = Date.now();
  const gameId = newGameRef.key;

  // Generate a random host secret
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  const hostSecret = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');

  // Write game payload
  await set(newGameRef, {
    meta: {
      ownerUid,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    },
    state,
  });

  // Write secret
  await set(ref(services.database, `gameSecrets/${gameId}`), hostSecret);

  return gameId;
};

export const claimCloudGame = async (gameId: string, hostSecret: string, newOwnerUid: string): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  const gameRef = ref(services.database, `games/${gameId}`);
  const snapshot = await get(gameRef);
  if (!snapshot.exists()) {
    throw new Error('Game not found.');
  }

  // Update ownership by passing the claimSecret to pass security rules
  await update(gameRef, {
    'meta/ownerUid': newOwnerUid,
    'meta/claimSecret': hostSecret,
    'meta/updatedAt': Date.now(),
  });
};

export const getCloudGameSecret = async (gameId: string): Promise<string | null> => {
  const services = getFirebaseServices();
  if (!services) return null;

  try {
    const secretRef = ref(services.database, `gameSecrets/${gameId}`);
    const snapshot = await get(secretRef);
    return snapshot.exists() ? snapshot.val() : null;
  } catch (err) {
    return null; // Will fail if not owner due to rules
  }
};

export const updateCloudGameState = async (gameId: string, state: PersistedAppState): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  await update(ref(services.database, `games/${gameId}`), {
    state,
    'meta/updatedAt': Date.now(),
  });
};

export const deleteCloudGame = async (gameId: string): Promise<void> => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  await remove(ref(services.database, `games/${gameId}`));
  await remove(ref(services.database, `gameSecrets/${gameId}`)).catch(() => {});
};

export const getUserCloudGames = async (ownerUid: string): Promise<{ id: string; meta: CloudGameRecord['meta'] }[]> => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  const gamesRef = ref(services.database, 'games');
  const q = query(gamesRef, orderByChild('meta/ownerUid'), equalTo(ownerUid));
  
  const snapshot = await get(q);
  if (!snapshot.exists()) return [];

  const results: { id: string; meta: CloudGameRecord['meta'] }[] = [];
  snapshot.forEach((child) => {
    const meta = getMetaFromSnapshot(child);
    if (meta) {
      results.push({ id: child.key!, meta });
    }
  });

  return results.sort((a, b) => b.meta.createdAt - a.meta.createdAt);
};
