import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import toml from '@iarna/toml';

// Walk up from cwd to find the repo-root .env. SolidStart's vinxi dev runs with
// cwd = apps/web, so the default `dotenv/config` import misses the repo-root .env.
(function loadRepoRootEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
})();

export type Config = {
  owner: {
    name: string;
    role: string;
    bio?: string;
    x?: string;
    github?: string;
    email?: string;
    wallet: string;
  };
  chain: {
    cluster: 'devnet' | 'mainnet-beta';
    rpc_url: string;
    helius_laserstream_url?: string;
  };
  collection: {
    collection_address: string;
    owner_card_asset: string;
  };
  art: {
    template: string;
    storage: 'arweave' | 'data-uri';
  };
  event: {
    name: string;
  };
};

function expandEnv(s: string): string {
  return s.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => {
    const v = process.env[name];
    if (v === undefined || v === '') {
      throw new Error(`env var ${name} not set (referenced in config.toml)`);
    }
    return v;
  });
}

let cached: Config | null = null;

function findConfigPath(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'config.toml');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('config.toml not found in repo root');
}

export function loadConfig(): Config {
  if (cached) return cached;
  const cfgPath = findConfigPath();
  const raw = toml.parse(fs.readFileSync(cfgPath, 'utf8')) as unknown as Config;
  const cfg: Config = {
    ...raw,
    chain: { ...raw.chain, rpc_url: expandEnv(raw.chain.rpc_url) },
  };
  for (const field of ['owner.name', 'owner.wallet', 'chain.rpc_url', 'collection.collection_address', 'collection.owner_card_asset'] as const) {
    const parts = field.split('.');
    let v: unknown = cfg;
    for (const p of parts) v = (v as Record<string, unknown>)?.[p];
    if (!v) throw new Error(`config.toml missing required field: ${field}`);
  }
  cached = cfg;
  return cfg;
}

export function clearConfigCache() {
  cached = null;
}
