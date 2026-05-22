// Per-recipient rate limit with persistent KV backing (Vercel KV / Upstash Redis REST)
// and an in-memory fallback for local dev.
//
// Required env vars for durable rate limiting (production):
//   KV_REST_API_URL   — Upstash/Vercel KV REST endpoint
//   KV_REST_API_TOKEN — Upstash/Vercel KV token
//
// Phase 4 follow-up: consider adding Cloudflare Turnstile for bot protection
// at the HTTP edge before the request even reaches this rate-limit check.

export type RateLimitStore = {
  /** Returns true (allow) when key has not been seen within TTL; false if rate-limited. */
  tryAcquire(key: string, ttlSeconds: number): Promise<boolean>;
};

class InMemoryStore implements RateLimitStore {
  readonly seen = new Map<string, number>();
  async tryAcquire(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const last = this.seen.get(key);
    if (last !== undefined && now - last < ttlSeconds * 1000) return false;
    this.seen.set(key, now);
    return true;
  }
}

/**
 * Vercel KV / Upstash Redis REST-backed store. Activated when
 * KV_REST_API_URL + KV_REST_API_TOKEN are set in env. Uses SET NX EX
 * (atomic set-if-not-exists with TTL) so the check + write is one round-trip.
 */
class UpstashKVStore implements RateLimitStore {
  constructor(private url: string, private token: string) {}
  async tryAcquire(key: string, ttlSeconds: number): Promise<boolean> {
    // Upstash REST API: POST /set/<key>/<value>?NX=&EX=<ttl>
    const res = await fetch(`${this.url}/set/${encodeURIComponent(key)}/1?NX=&EX=${ttlSeconds}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      console.warn('rateLimit: KV unavailable, failing open', res.status);
      return true; // fail-open; prod operators should monitor KV health
    }
    const body = await res.json() as { result: string | null };
    return body.result === 'OK'; // OK = newly set (allowed); null = already existed (rate-limited)
  }
}

let cached: RateLimitStore | null = null;

function store(): RateLimitStore {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    cached = new UpstashKVStore(url, token);
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        'rateLimit: KV_REST_API_URL/KV_REST_API_TOKEN not set in production — ' +
        'using in-memory rate limit (NOT durable across serverless instances).',
      );
    }
    cached = new InMemoryStore();
  }
  return cached;
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export async function allowRecipient(recipient: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<boolean> {
  return store().tryAcquire(`soltap:recipient:${recipient}`, ttlSeconds);
}

/** Test helper: resets state. Only the in-memory backend supports full reset. */
export function _resetRateLimit() {
  if (cached instanceof InMemoryStore) {
    cached.seen.clear();
  }
  cached = null; // force re-init on next call
}
