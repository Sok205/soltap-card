import type { APIEvent } from '@solidjs/start/server';
import { loadConfig } from '../../lib/config';
import { ownerIconDataUri } from '../../lib/icon';
import { buildHandshakeTx } from '../../lib/mint';
import { allowRecipient } from '../../lib/rateLimit';

// Pre-compiled regex for base58 (Solana pubkey shape: 32-44 chars, no 0OIl)
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Solana Pay tx-request GET: returns metadata shown to the user in their wallet
// before they tap "approve".
export async function GET(_event: APIEvent) {
  const cfg = loadConfig();
  const body = {
    label: `Handshake with ${cfg.owner.name}`,
    icon: ownerIconDataUri(),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export async function POST(event: APIEvent) {
  let payload: any;
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const account = payload?.account;
  if (typeof account !== 'string' || !PUBKEY_RE.test(account)) {
    return json({ error: 'missing or invalid account' }, 400);
  }

  if (!allowRecipient(account)) {
    return json({ error: 'rate limited: one handshake per recipient per 24h' }, 429);
  }

  // Pass the public-facing base URL so the on-chain metadata uri resolves to
  // this server (or its ngrok tunnel). Falls back to PUBLIC_BASE_URL env or
  // soltap.app default.
  const url = new URL(event.request.url);
  const proto = event.request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = event.request.headers.get('x-forwarded-host') ?? event.request.headers.get('host') ?? url.host;
  const baseUrl = `${proto}://${host}`;

  const { transaction, message } = await buildHandshakeTx(account, { baseUrl });
  return json({ transaction, message }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
