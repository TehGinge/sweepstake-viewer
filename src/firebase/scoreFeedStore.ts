import { DataSnapshot, off, onValue, ref, update } from 'firebase/database';
import { TournamentId } from '../types';
import { getFirebaseServices } from './client';
import { ScoreUpdate } from '../services/scoreSync';

type CentralScoreRecord = {
  homeScore: number;
  awayScore: number;
  status: 'FINISHED' | 'LIVE';
  source: string;
  updatedAt: number;
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const toScoreUpdatesFromSnapshot = (snapshot: DataSnapshot): ScoreUpdate[] => {
  const value = snapshot.val();
  if (!isObject(value)) return [];

  const updates: ScoreUpdate[] = [];

  for (const [matchId, rawRecord] of Object.entries(value)) {
    if (!isObject(rawRecord)) continue;
    if (typeof rawRecord.homeScore !== 'number' || typeof rawRecord.awayScore !== 'number') continue;
    if (rawRecord.status !== 'FINISHED' && rawRecord.status !== 'LIVE') continue;

    updates.push({
      matchId,
      homeScore: rawRecord.homeScore,
      awayScore: rawRecord.awayScore,
      status: rawRecord.status,
      source: typeof rawRecord.source === 'string' && rawRecord.source.length > 0 ? rawRecord.source : 'central-score-feed',
    });
  }

  return updates;
};

export const subscribeToCentralScoreFeed = (
  tournamentId: TournamentId,
  onScores: (updates: ScoreUpdate[]) => void,
  onError: (error: Error) => void,
): (() => void) => {
  const services = getFirebaseServices();
  if (!services) {
    onError(new Error('Firebase is not configured.'));
    return () => {};
  }

  const feedRef = ref(services.database, `scoreFeeds/${tournamentId}/matches`);

  const unsubscribe = onValue(
    feedRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onScores([]);
        return;
      }

      onScores(toScoreUpdatesFromSnapshot(snapshot));
    },
    (error) => onError(error),
  );

  return () => {
    off(feedRef);
    unsubscribe();
  };
};

export const publishCentralScoreUpdates = async (
  tournamentId: TournamentId,
  updates: ScoreUpdate[],
): Promise<void> => {
  if (updates.length === 0) return;

  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase is not configured.');
  }

  const now = Date.now();
  const payload: Record<string, CentralScoreRecord> = {};

  for (const scoreUpdate of updates) {
    payload[scoreUpdate.matchId] = {
      homeScore: scoreUpdate.homeScore,
      awayScore: scoreUpdate.awayScore,
      status: scoreUpdate.status,
      source: scoreUpdate.source,
      updatedAt: now,
    };
  }

  await update(ref(services.database, `scoreFeeds/${tournamentId}/matches`), payload);
};
