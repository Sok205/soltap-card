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

// URL helpers — split by runtime context:
//
// - fetchStats / fetchHistory run server-side (SSR / API routes). They use
//   process.env.INDEXER_URL which is available in Node and never sent to the
//   browser bundle.
//
// - indexerSseUrl() is called client-side for EventSource. process.env is not
//   available in the browser, so it uses import.meta.env.VITE_INDEXER_URL
//   (a Vite build-time constant). Falls back to localhost for local dev.

function serverIndexerUrl(): string {
  return process.env.INDEXER_URL ?? 'http://localhost:8787';
}

function clientIndexerUrl(): string {
  return import.meta.env.VITE_INDEXER_URL || 'http://localhost:8787';
}

export async function fetchStats(): Promise<Stats> {
  const url = `${serverIndexerUrl()}/stats`;
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
  const url = `${serverIndexerUrl()}/events/history?limit=${Math.min(limit, 200)}`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`indexer /events/history ${r.status}`);
    return (await r.json()) as HandshakeEvent[];
  } catch (e) {
    console.warn('indexer fetchHistory failed', e);
    return [];
  }
}

/** Client-only helper: URL for EventSource (browser-side SSE connection). */
export function indexerSseUrl(): string {
  return `${clientIndexerUrl()}/events`;
}
