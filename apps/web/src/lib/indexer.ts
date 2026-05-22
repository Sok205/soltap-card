export type HandshakeEvent = {
  signature: string;
  slot: number;
  recipient: string;
  asset: string;
  edition: number;
  ts: number;
};

export type Stats = {
  count: number;
  latest_slot: number | null;
};

function indexerBaseUrl(): string {
  return process.env.INDEXER_URL ?? 'http://localhost:8787';
}

export async function fetchStats(): Promise<Stats> {
  const url = `${indexerBaseUrl()}/stats`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`indexer /stats ${r.status}`);
    return (await r.json()) as Stats;
  } catch (e) {
    console.warn('indexer fetchStats failed', e);
    return { count: 0, latest_slot: null };
  }
}

export async function fetchHistory(limit = 20): Promise<HandshakeEvent[]> {
  const url = `${indexerBaseUrl()}/events/history?limit=${Math.min(limit, 200)}`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`indexer /events/history ${r.status}`);
    return (await r.json()) as HandshakeEvent[];
  } catch (e) {
    console.warn('indexer fetchHistory failed', e);
    return [];
  }
}

/** Client-only helper: URL for EventSource. */
export function indexerSseUrl(): string {
  return `${indexerBaseUrl()}/events`;
}
