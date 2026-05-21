import { describe, it, expect } from 'vitest';
import { buildHandshakeTx } from '../src/lib/mint';

// Use a real-looking devnet pubkey — doesn't need to be funded or exist.
const TEST_RECIPIENT = '11111111111111111111111111111112';

describe('buildHandshakeTx', () => {
  it('returns a base64-encoded transaction string and a human-readable message', async () => {
    const { transaction, message } = await buildHandshakeTx(TEST_RECIPIENT);
    expect(typeof transaction).toBe('string');
    expect(transaction.length).toBeGreaterThan(100);
    // Base64 sanity: contains only base64 chars
    expect(transaction).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(message).toMatch(/handshake/i);
    expect(message).toContain('Sok');
  }, 30_000); // RPC can be slow; allow generous timeout
});
