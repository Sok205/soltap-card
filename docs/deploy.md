# SolTap — Fork and Deploy Guide

Target time: ~30 minutes to a working local dev loop. Production deploy (Vercel + Fly.io) takes another 30–60 minutes.

---

## 1. Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20 | https://nodejs.org |
| pnpm | 9 | `npm install -g pnpm@9` |
| Rust | 1.78 | https://rustup.rs |
| Solana CLI | 1.18 | https://docs.solanalabs.com/cli/install |
| Helius account | free tier | https://helius.dev — needed for a reliable devnet RPC URL |

---

## 2. Clone and install

```sh
git clone https://github.com/sok205/sol-promotion-card.git soltap
cd soltap
pnpm install
cargo build -p soltap-indexer
```

Expected output: pnpm resolves workspaces (`web`, `card-sdk`); Cargo compiles the indexer. First build takes 2–3 minutes.

---

## 3. Generate Solana keypairs

You need two keypairs:

- **Owner update authority** — signs Metaplex Core updates to the owner's card asset (counter reconciliation). This is the wallet that owns the collection.
- **Fee payer** — backend hot wallet that pays tx fees for handshake mints. Keep it funded with devnet SOL.

```sh
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/soltap-owner.json
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/soltap-fee-payer.json

# Print the public keys
solana address -k ~/.config/solana/soltap-owner.json
solana address -k ~/.config/solana/soltap-fee-payer.json
```

Note both public keys — you will need them for `config.toml` and `.env`.

---

## 4. Fund devnet wallets

```sh
# Airdrop 2 SOL to each wallet (devnet only)
solana airdrop 2 $(solana address -k ~/.config/solana/soltap-owner.json) --url devnet
solana airdrop 2 $(solana address -k ~/.config/solana/soltap-fee-payer.json) --url devnet
```

If the faucet is rate-limited, try:
- https://faucet.solana.com (web UI, paste pubkey)
- Helius faucet: https://dev.helius.xyz/dashboard/app (log in, use the airdrop panel)
- Ask someone on Solana Discord #faucet to transfer devnet SOL via `solana transfer`

Each handshake mint costs roughly 0.003 SOL from the fee-payer wallet. 2 SOL covers ~650 mints — enough for a conference.

---

## 5. Set up `.env`

```sh
cp .env.example .env
```

Convert each keypair to base58 (the format the app expects):

```sh
node -e "
const fs = require('fs');
const bs58 = require('bs58');
const bytes = Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')));
console.log(bs58.encode(bytes));
" ~/.config/solana/soltap-owner.json
```

Run the same command for the fee-payer keypair. Then fill `.env`:

```sh
FEE_PAYER_KEYPAIR_B58=<base58 of soltap-fee-payer.json>
OWNER_UPDATE_AUTHORITY_KEYPAIR_B58=<base58 of soltap-owner.json>
HELIUS_API_KEY=<your Helius API key>
INDEXER_URL=http://localhost:8787

# Required in production — set to your deployed web URL.
# In local dev, leave blank; the app falls back to the request Host header.
PUBLIC_BASE_URL=
```

Never commit `.env`. It is already in `.gitignore`.

---

## 6. Fill `config.toml`

```sh
cp config.example.toml config.toml
```

Open `config.toml` and fill in your details:

```toml
[owner]
name = "Your Name"
role = "What you do"
bio = "One-sentence pitch."
x = "@yourhandle"
github = "yourgithub"
email = "you@example.com"
wallet = "<owner pubkey from step 3>"

[chain]
cluster = "devnet"
rpc_url = "https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}"

[event]
name = "Your Event Name"
```

The `rpc_url` value uses `${HELIUS_API_KEY}` as a placeholder — the config loader substitutes it at runtime from your `.env`. Leave it as written; do not paste the key directly into `config.toml`.

Leave `[collection]` empty — the init script fills it.

---

## 7. Init the on-chain collection

```sh
pnpm tsx scripts/init-collection.ts
```

This script:
1. Creates a Metaplex Core collection on-chain (signed by the owner update authority).
2. Creates the owner's card asset inside that collection, with a `handshake_count` attribute plugin.
3. Writes both addresses back into `config.toml` under `[collection]`.

Expected output:
```
Initialized:
  collection: <address>
  owner card: <address>
```

Verify on-chain (optional):
```sh
solana account <collection_address> --url devnet
```

The script is idempotent — if `collection_address` is already set in `config.toml`, it exits early.

---

## 8. Run dev

Open two terminals.

**Terminal 1 — indexer:**
```sh
RUST_LOG=info cargo run -p soltap-indexer
```

Expected: `listening on 0.0.0.0:8787`. Verify with:
```sh
curl http://localhost:8787/healthz
# → ok
curl http://localhost:8787/stats
# → {"count":0}
```

**Terminal 2 — web app:**
```sh
pnpm --filter web dev
```

Expected: Vinxi dev server on `http://localhost:3000`.

Open `http://localhost:3000/<your-name>` in a browser. You should see the profile page with a counter at 0.

---

## 9. Expose via tunnel for phone testing

Solana Pay requires HTTPS. For local dev with a real phone, use Cloudflare Tunnel:

```sh
# Install cloudflared if needed: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:3000
```

Cloudflare prints a `trycloudflare.com` URL. Use that as your base URL for testing. Note: this URL changes each time you restart the tunnel.

> Note: ngrok free tier injects an interstitial page that breaks the Solana Pay flow (the wallet fetches the URL directly and gets HTML instead of JSON). Cloudflare Tunnel does not have this issue.

Test the Solana Pay endpoint manually:
```sh
curl https://<your-tunnel>.trycloudflare.com/tap/<your-name>
# → {"label":"Handshake with <Name>","icon":"..."}
```

---

## 10. Program an NFC card

**Hardware:** buy NTAG215 NFC cards or stickers (widely available; search "NTAG215 NFC card" on Amazon). Metal business card versions exist too.

**App:** install **NFC Tools** (iOS or Android — free tier is sufficient).

**URL to write:**
```
solana:https://<your-tunnel-or-domain>/tap/<your-name>
```

In NFC Tools: Write > Add a record > Custom URL/URI > paste the URL above > Write. Hold the phone over the card until it confirms.

Test: tap the card with a second phone. Phantom or Solflare (in devnet mode) should pop up with the transaction. Approve it, then check the profile page — the counter should tick within a few seconds.

> Carry extra cards. If a card gets locked or programmed with the wrong URL, you need a fresh one.

---

## 11. Deploy to production (Vercel + Fly.io)

This section outlines the approach. A fully detailed walkthrough will be added after Phase 4 of the implementation plan.

**Web app (`apps/web`) → Vercel:**
- Connect the repo to Vercel.
- Set the root directory to `apps/web` (or configure a monorepo preset).
- Add env vars: `FEE_PAYER_KEYPAIR_B58`, `OWNER_UPDATE_AUTHORITY_KEYPAIR_B58`, `HELIUS_API_KEY`, `INDEXER_URL` (your Fly.io indexer URL), `PUBLIC_BASE_URL` (your Vercel domain).
- Deploy. SolidStart has a Vercel preset that handles SSR.

**Indexer (`apps/indexer`) → Fly.io:**
- Install the Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
- `fly launch` from `apps/indexer/` — creates a `fly.toml`.
- Attach a volume for SQLite persistence: `fly volumes create soltap_data --size 1`.
- Set secrets: `fly secrets set HELIUS_API_KEY=<key>`.
- Deploy: `fly deploy`.
- Update `INDEXER_URL` in Vercel env to the Fly.io app URL.

**Then:** flip `config.toml` to `cluster = "mainnet-beta"`, fund mainnet wallets, re-run `pnpm tsx scripts/init-collection.ts` against mainnet, and re-program your NFC cards with the production URL.

See the Phase 4 tasks in `docs/superpowers/plans/2026-05-21-soltap.md` for the full mainnet cutover checklist.
