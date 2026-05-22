import type { APIEvent } from '@solidjs/start/server';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { loadConfig } from '../../lib/config';
import { ownerIconDataUri } from '../../lib/icon';
import { buildHandshakeTx } from '../../lib/mint';
import { allowRecipient } from '../../lib/rateLimit';

// Pre-compiled regex for base58 (Solana pubkey shape: 32-44 chars, no 0OIl)
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// P0.1: Reject off-curve keys (program addresses / PDAs).
// A key that passes base58 validation but is not a valid ed25519 point would
// either be rejected confusingly by the wallet or allow spoofed identities.
function isValidUserPubkey(s: string): boolean {
  if (!PUBKEY_RE.test(s)) return false;
  try {
    const bytes = bs58.decode(s);
    if (bytes.length !== 32) return false;
    return PublicKey.isOnCurve(bytes);
  } catch {
    return false;
  }
}

// P0.2: Derive base URL from env in prod; derive from request headers only in dev.
// This prevents an attacker from poisoning on-chain metadata URIs by spoofing
// the Host header in a production environment.
function resolveBaseUrl(req: Request): string {
  const fromEnv = process.env.PUBLIC_BASE_URL;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    // Refuse to mint with a header-derived URL in prod — the resulting on-chain
    // metadata uri would be attacker-controllable.
    throw new Error('PUBLIC_BASE_URL not set in production');
  }
  // Dev: derive from request headers (ngrok/cloudflare tunnel friendly).
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  return `${proto}://${host}`;
}

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
  if (!isValidUserPubkey(account)) {
    return json({ error: 'invalid account: not a user wallet (off-curve)' }, 400);
  }

  if (!await allowRecipient(account)) {
    return json({ error: 'rate limited: one handshake per recipient per 24h' }, 429);
  }

  let baseUrl: string;
  try {
    baseUrl = resolveBaseUrl(event.request);
  } catch {
    return json({ error: 'server misconfigured: PUBLIC_BASE_URL required' }, 500);
  }

  const { transaction, message } = await buildHandshakeTx(account, { baseUrl });
  return json({ transaction, message }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
