import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from '../src/routes/tap/[owner]';
import { _resetRateLimit } from '../src/lib/rateLimit';

const VALID_PUBKEY = '11111111111111111111111111111112';

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
  beforeEach(() => _resetRateLimit());

  it('400 when account missing', async () => {
    const res = await POST(mkEvent({}) as any);
    expect(res.status).toBe(400);
  });

  it('400 when account is not a valid base58 pubkey', async () => {
    const res = await POST(mkEvent({ account: 'not-a-pubkey!' }) as any);
    expect(res.status).toBe(400);
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
});
