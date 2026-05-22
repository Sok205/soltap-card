import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST } from '../src/routes/tap/[owner]';
import { _resetRateLimit } from '../src/lib/rateLimit';

// A real on-curve wallet address (verified with PublicKey.isOnCurve).
// The old System Program address (11111...2) is off-curve and must not be used.
const VALID_PUBKEY = '9B5XszUGdMaxCZ7uSQhPzdks5ZQSmWxrmzCSvtJ6Ns6g';

// P0.1: A known off-curve address (Associated Token Program — confirmed off-curve).
const OFF_CURVE_PUBKEY = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bJ';

function mkEvent(body: unknown, owner = 'sok') {
  return {
    params: { owner },
    request: new Request(`http://localhost:3000/tap/${owner}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  };
}

describe('POST /tap/:owner', () => {
  const savedNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    _resetRateLimit();
    process.env.NODE_ENV = 'test';
    delete process.env.PUBLIC_BASE_URL;
  });

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
    delete process.env.PUBLIC_BASE_URL;
  });

  it('400 when account missing', async () => {
    const res = await POST(mkEvent({}) as any);
    expect(res.status).toBe(400);
  });

  it('400 when account is not a valid base58 pubkey', async () => {
    const res = await POST(mkEvent({ account: 'not-a-pubkey!' }) as any);
    expect(res.status).toBe(400);
  });

  // P0.1: Off-curve pubkey (program address) must be rejected.
  it('400 when account is an off-curve program address', async () => {
    const res = await POST(mkEvent({ account: OFF_CURVE_PUBKEY }) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/off-curve/i);
  });

  it('200 with { transaction, message } for a fresh recipient', async () => {
    const res = await POST(mkEvent({ account: VALID_PUBKEY }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.transaction).toBe('string');
    expect(body.transaction).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(typeof body.message).toBe('string');
    expect(body.message).toMatch(/handshake/i);
  }, 30_000);

  it('429 when same recipient taps twice within TTL', async () => {
    const first = await POST(mkEvent({ account: VALID_PUBKEY }) as any);
    expect(first.status).toBe(200);
    const second = await POST(mkEvent({ account: VALID_PUBKEY }) as any);
    expect(second.status).toBe(429);
  }, 60_000);

  // P0.2: In production, PUBLIC_BASE_URL must be set.
  it('500 in production when PUBLIC_BASE_URL is not set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_BASE_URL;
    const res = await POST(mkEvent({ account: VALID_PUBKEY }) as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/PUBLIC_BASE_URL/i);
  });
});
