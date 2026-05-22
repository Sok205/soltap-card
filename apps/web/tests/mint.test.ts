import { describe, it, expect } from 'vitest';
import { buildHandshakeTx } from '../src/lib/mint';

// Use a real on-curve devnet pubkey (verified with PublicKey.isOnCurve).
// The old System Program address (11111...2) is off-curve and is now rejected.
const TEST_RECIPIENT = '9B5XszUGdMaxCZ7uSQhPzdks5ZQSmWxrmzCSvtJ6Ns6g';

describe('buildHandshakeTx', () => {
  it('returns a base64-encoded transaction string and a human-readable message', async () => {
    const { transaction, message } = await buildHandshakeTx(TEST_RECIPIENT);
    expect(typeof transaction).toBe('string');
    expect(transaction.length).toBeGreaterThan(100);
    // Base64 sanity: contains only base64 chars
    expect(transaction).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(message).toMatch(/handshake/i);
    expect(message).toContain('Sok');

    // P0.5: Tx must stay under Solana's 1232-byte legacy limit.
    const txBytes = Buffer.from(transaction, 'base64');
    expect(txBytes.length).toBeLessThan(1232);
  }, 30_000); // RPC can be slow; allow generous timeout
});
