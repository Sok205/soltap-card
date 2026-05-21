import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/lib/config';

describe('loadConfig', () => {
  it('reads config.toml from repo root and expands ${HELIUS_API_KEY}', () => {
    const cfg = loadConfig();
    expect(cfg.owner.name).toBeTruthy();
    expect(cfg.chain.rpc_url).toMatch(/^https?:\/\//);
    expect(cfg.chain.rpc_url).not.toContain('${');
    expect(cfg.collection.collection_address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it('exposes owner wallet pubkey as a base58 string', () => {
    const cfg = loadConfig();
    expect(cfg.owner.wallet).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});
