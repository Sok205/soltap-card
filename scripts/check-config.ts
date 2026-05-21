import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import toml from '@iarna/toml';

function expandEnv(s: string): string {
  return s.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => {
    const v = process.env[name];
    if (v === undefined) throw new Error(`env var ${name} not set`);
    return v;
  });
}

function get(obj: unknown, dot: string): unknown {
  return dot.split('.').reduce((o: unknown, k: string) => (o as Record<string, unknown>)?.[k], obj);
}

const cfg = toml.parse(fs.readFileSync(path.resolve('config.toml'), 'utf8'));

const required = ['owner.name', 'owner.wallet', 'chain.cluster', 'chain.rpc_url', 'event.name'];
const missing: string[] = [];
for (const k of required) {
  if (!get(cfg, k)) missing.push(k);
}
if (missing.length) {
  console.error('Missing in config.toml:', missing);
  process.exit(1);
}

const reqEnv = ['FEE_PAYER_KEYPAIR_B58', 'OWNER_UPDATE_AUTHORITY_KEYPAIR_B58', 'HELIUS_API_KEY'];
const missEnv = reqEnv.filter((e) => !process.env[e]);
if (missEnv.length) {
  console.error('Missing env vars:', missEnv);
  process.exit(1);
}

try {
  const rpcUrl = expandEnv((cfg as Record<string, Record<string, string>>).chain.rpc_url);
  new URL(rpcUrl); // assert valid URL
} catch (e) {
  console.error('Invalid or unexpandable rpc_url:', e);
  process.exit(1);
}

console.log('config OK');
