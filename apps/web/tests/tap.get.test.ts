import { describe, it, expect } from 'vitest';
import { GET } from '../src/routes/tap/[owner]';

describe('GET /tap/:owner (Solana Pay tx-request)', () => {
  it('returns { label, icon } where label mentions the owner name', async () => {
    const event: any = {
      params: { owner: 'sok' },
      request: new Request('http://localhost:3000/tap/sok'),
    };
    const res = await GET(event);
    expect(res).toBeInstanceOf(Response);
    const body = await res.json();
    expect(body.label).toMatch(/Handshake with/i);
    expect(body.label).toContain('Sok');
    expect(typeof body.icon).toBe('string');
    expect(body.icon.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });
});
