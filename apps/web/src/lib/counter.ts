import { fetchStats } from './indexer';

/**
 * Returns the current mint count from the indexer, used to determine the
 * next edition number. Falls back to 0 if the indexer is unreachable so
 * the mint flow can continue (edition #1 will be used).
 *
 * Runs server-side only (INDEXER_URL is a server-side env var).
 */
export async function getCurrentEdition(): Promise<number> {
  try {
    const { count } = await fetchStats();
    return count;
  } catch {
    return 0;
  }
}
