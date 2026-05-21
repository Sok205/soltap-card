// Per-recipient rate limit. In-memory; resets on server restart.
// Production: replace with Redis or KV. For Accelerate scale (one event,
// hundreds of taps over a few days), in-memory is fine.

const seen = new Map<string, number>();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function allowRecipient(recipient: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const now = Date.now();
  const last = seen.get(recipient);
  if (last !== undefined && now - last < ttlMs) return false;
  seen.set(recipient, now);
  return true;
}

// For tests.
export function _resetRateLimit() {
  seen.clear();
}
