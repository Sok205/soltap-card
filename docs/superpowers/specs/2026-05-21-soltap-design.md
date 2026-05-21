# SolTap — Design Spec

**Date:** 2026-05-21
**Target event:** Solana Accelerate (~2026-06-21, ~1 month runway)
**Primary author:** Sok
**Status:** Approved design, pending implementation plan

---

## 1. Summary

SolTap is an open-source kit for on-chain NFC business cards on Solana. The owner programs a physical NFC card with a Solana Pay URL. When someone taps the card to their phone, their wallet receives a free Metaplex Core NFT containing the owner's contact info and an edition number; the owner's own "card" NFT updates with an incremented handshake counter. A public profile page shows the live count and a real-time feed of handshakes, powered by a Rust indexer.

Anyone can fork the repo, edit a single config file, fund a fee-payer wallet, and deploy their own card in under 30 minutes.

## 2. Goals

- **Primary:** Land Sok a job at Solana Accelerate by demoing a memorable, technically substantive Solana artifact.
- **Secondary:** Ship an open-source kit that other attendees can fork and use.
- **Tertiary:** Produce a polyglot (TS + Rust) repo that serves as a portfolio piece for indexer/infra roles.

## 3. Non-goals

- SaaS-hosted multi-tenant version (post-Accelerate, if at all).
- Mutual-pair minting (recipient also mints a card back to owner). Stretch only.
- Generative per-recipient art. Templated SVG with edition number is sufficient.
- Mainnet from day one. Devnet is acceptable for the event; mainnet upgrade is a config flip.
- Mobile native apps. Browser + wallet deeplinks only.

## 4. User stories

1. **As the owner**, I program my NFC card once, fund a hot wallet with SOL, and deploy. At Accelerate, I hand my phone to someone or let them tap their phone to my card.
2. **As a recipient**, I tap the card with my phone. My wallet (Phantom etc.) pops up showing a fee-sponsored transaction. I approve. An NFT appears in my wallet with the owner's name, role, and contact links.
3. **As a viewer of the owner's profile page**, I see a live counter ("47 handshakes at Accelerate 2026") and a scrolling feed of recent recipient wallets. The counter ticks up within a second when someone signs.
4. **As a forker**, I clone the repo, edit `config.toml`, run `pnpm setup`, deploy. My card is live.

## 5. End-to-end flow

```
                    +-------------------+
                    |  NFC NTAG215 card |  (URL: https://soltap.app/tap/sok)
                    +---------+---------+
                              |
                              v  recipient taps phone
                    +-------------------+
                    |  Next.js (web)    |
                    |  GET /tap/:owner  |  returns Solana Pay tx-request JSON
                    +---------+---------+
                              |
                              v  wallet (Phantom) reads spec, POSTs back
                    +-------------------+
                    |  Next.js (web)    |
                    |  POST /tap/:owner |  builds Metaplex Core mint ix,
                    |                   |  signs as fee payer, returns
                    |                   |  partially-signed tx
                    +---------+---------+
                              |
                              v  wallet signs + submits
                       Solana network
                              |
                              v  mint lands
                    +-------------------+
                    |  Rust indexer     |  Helius LaserStream / WS sub
                    |  (axum + tokio)   |  decodes Core CreateV1 ix,
                    |                   |  emits HandshakeEvent,
                    |                   |  pushes to SSE channel
                    +---------+---------+
                              |
                              v  SSE
                    +-------------------+
                    |  Next.js (web)    |  /sok page subscribes,
                    |  public profile   |  counter ticks, feed scrolls
                    +-------------------+
```

## 6. Architecture

### Monorepo layout

```
soltap/
├── apps/
│   ├── web/                  # Next.js 15 (App Router) — tx-request, mint, dashboard, profile
│   └── indexer/              # Rust axum service — subscribes to chain, serves SSE feed
├── packages/
│   └── card-sdk/             # TS lib: builds Metaplex Core mint ixs, reusable outside Next.js
├── config.toml               # Owner identity, contact info, RPC, art template
├── art/
│   └── card-template.svg     # SVG with placeholders for edition number / owner info
├── scripts/
│   └── init-collection.ts    # One-shot: creates Metaplex Core collection + owner card
└── docs/
    ├── superpowers/specs/    # This spec lives here
    └── deploy.md             # 30-minute fork-and-deploy guide
```

### Components

#### `apps/web` (Next.js 15, TypeScript, `@solana/kit`, `@metaplex-foundation/mpl-core`)

Routes:

- `GET /tap/:owner` — Solana Pay tx-request: returns `{ label, icon }`.
- `POST /tap/:owner` — body `{ account }`. Builds Metaplex Core `CreateV1` ix minting a handshake NFT in the owner's collection to `account`. Fee payer = backend hot wallet. Returns partially-signed serialized tx + message.
- `GET /:owner` — public profile page. SSR snapshot of count + feed; client subscribes to indexer SSE for live updates.
- `GET /api/owner/:owner` — JSON: current counter + latest N handshakes (also reads from indexer).

Reads `config.toml` at build time (and hot-reloads in dev) for owner identity, collection address, RPC URL.

The fee-payer keypair is loaded from `FEE_PAYER_KEYPAIR_B58` env var (never committed). For local dev, devnet keypair; for deployment, mainnet keypair funded with ~1 SOL.

#### `apps/indexer` (Rust, axum, tokio, `solana-client`, Helius LaserStream gRPC)

- Subscribes to transactions touching `MPL_CORE_PROGRAM_ID` filtered by collection address (from `config.toml`).
- Decodes the `CreateV1` instruction discriminator and parses the asset/collection/owner accounts.
- Emits `HandshakeEvent { signature, slot, recipient, edition, ts }` onto an in-memory broadcast channel.
- Persists events to SQLite (`sqlx`) for restart durability and historical queries.
- Exposes:
  - `GET /events` — SSE stream, latest events as they arrive.
  - `GET /events/history?limit=N` — JSON, paginated.
  - `GET /stats` — JSON, total count + first/last seen.
- Backfills on startup by reading SQLite then `getSignaturesForAddress` from last-known slot.

#### `packages/card-sdk` (TypeScript)

- `buildHandshakeMintIx({ owner, recipient, collection, edition, metadata }): Instruction` — pure function, no I/O.
- `renderCardArt({ ownerInfo, edition }): Buffer` — SVG template fill, returns PNG (via `resvg-js`) for the NFT image. Uploaded to a configurable storage backend (default: Arweave via `irys`; fallback: data URI for devnet).
- Reusable by anyone wanting to integrate SolTap mint into a non-Next.js app.

### Token model (Metaplex Core)

- **Owner's card asset:** one Core asset, mutable `Attributes` plugin with `handshake_count` (u64) and `last_handshake_at` (timestamp). Updated by backend on each successful handshake. The asset itself sits in the owner's wallet — recruiters can verify on-chain that the counter is real.
- **Handshake collection:** one Core collection per owner, owned by owner's wallet.
- **Handshake NFTs:** one Core asset per recipient, member of the collection. Metadata JSON includes:
  - `name`: `"Handshake with <owner> — #<edition>"`
  - `description`: short bio + "Met at Solana Accelerate 2026"
  - `image`: pre-rendered PNG (per-edition or templated)
  - `attributes`: `[{owner_name, owner_role, owner_x, owner_github, owner_email, edition, minted_at, event}]`

### Fee sponsorship

- Backend hot wallet pays SOL for all mints.
- Cost ≈ 0.003 SOL per mint × ~100 expected mints ≈ 0.3 SOL (~$50 at current prices).
- README documents funding (`solana transfer ... <fee-payer-pubkey>`).
- Anti-abuse: rate limit per recipient pubkey (1 handshake per owner per 24h) at the `POST /tap/:owner` layer. Stretch: optional Turnstile/captcha if abuse appears.

## 7. Data flow & consistency

- **Source of truth:** the chain. SQLite in the indexer is a cache.
- **Counter on the owner's card asset:** updated by backend immediately *after* the handshake mint confirms. Backend signs as the asset's update authority (owner keypair held in env, alongside fee-payer). This makes the on-chain counter the canonical value; the indexer/SQLite/SSE are just a live view.
- **Race on edition number:** edition is assigned by counting current collection members. Backend serializes mint requests per owner via a per-owner mutex to avoid duplicate editions. On collision (very unlikely), retry with `count + 1`.

## 8. Configuration

Single `config.toml` at repo root drives both apps:

```toml
[owner]
name = "Sok"
role = "Rust + Solana developer"
bio = "Building indexers and on-chain UX. Open to roles."
x = "@sokdev"
github = "sok205"
email = "sokfil205@gmail.com"
wallet = "<owner pubkey>"

[chain]
cluster = "devnet"  # or "mainnet-beta"
rpc_url = "https://api.devnet.solana.com"
helius_laserstream_url = "..."

[collection]
# Populated by `scripts/init-collection.ts` on first deploy
collection_address = ""
owner_card_asset = ""

[art]
template = "art/card-template.svg"
storage = "arweave"  # or "data-uri"

[event]
name = "Solana Accelerate 2026"
```

Secrets are env vars, not in `config.toml`:
- `FEE_PAYER_KEYPAIR_B58`
- `OWNER_UPDATE_AUTHORITY_KEYPAIR_B58`
- `HELIUS_API_KEY`
- `IRYS_PRIVATE_KEY` (if using Arweave storage)

## 9. Deployment

- **`apps/web`:** Vercel (free tier). Env vars in dashboard.
- **`apps/indexer`:** Fly.io / Railway. Tiny VM (256MB). SQLite as a volume.
- **Database:** SQLite, local to indexer VM. No external DB needed at this scale.
- **DNS:** point a domain (e.g., `soltap.app` or a personal subdomain) at Vercel. NFC card encodes `https://soltap.app/tap/sok`.

`docs/deploy.md` walks a forker through: clone → edit `config.toml` → fund wallets → run `scripts/init-collection.ts` → push to GitHub → deploy Vercel + Fly → write NFC card with NFC Tools app.

## 10. Testing strategy

### Unit
- `packages/card-sdk`: vitest. Mock `@solana/kit` types; verify instruction byte layout against a known-good fixture.
- `apps/indexer`: standard `cargo test`. Decoder tested against captured raw `CreateV1` instructions (lifted from devnet runs).

### Integration
- **LiteSVM** test in `apps/web`: spin up in-process SVM, run a real handshake end-to-end (build tx-request, simulate wallet signing, submit, verify NFT lands, verify counter updates).
- **Indexer**: feed it canned Helius gRPC messages from a fixture file; assert correct `HandshakeEvent` emission.

### Manual demo rehearsal
- Devnet end-to-end: tap with a real phone, real Phantom (devnet mode), verify the loop. Repeat 5x before Accelerate.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Phantom doesn't auto-open from NFC URL on iOS | Test on iPhone XS+ early; fallback: QR code printed on card. |
| Helius LaserStream rate limits / costs | Free tier should cover Accelerate-scale traffic; fall back to RPC polling at 2s intervals if exhausted. |
| Fee-payer wallet drained by abuse | Per-recipient rate limit, hard daily cap on `POST /tap/:owner` (e.g., 200/day), monitoring alert at 50% drain. |
| Mainnet vs devnet confusion at event | Switch to mainnet 1 week before Accelerate; rehearse on mainnet. |
| Wallets that don't support Metaplex Core display | Phantom supports it well; Backpack supports it; Solflare supports it. README lists tested wallets. |
| NFC card programmed wrong, no time to reprint | Buy a 10-pack of NTAG215 stickers; carry extras with pre-written URLs as backup. |

## 12. Milestones (1-month plan)

- **Week 1:** Repo scaffold, `config.toml`, `init-collection.ts`, manual mint working against devnet from a CLI. `card-sdk` MVP.
- **Week 2:** Next.js Solana Pay endpoint, fee sponsorship working, recipient flow tested with Phantom on a phone. Counter update on owner's card asset working.
- **Week 3:** Rust indexer — Helius subscription, decoder, SQLite persistence, SSE endpoint. Public profile page consuming SSE.
- **Week 4:** Polish, art template, `docs/deploy.md`, mainnet cutover, NFC cards programmed and tested, demo rehearsals.
- **Stretch (if time):** mutual-mint, endorsement attestations, leaderboard across all forks.

## 13. Open questions

None blocking. Decisions deferred:
- Exact domain name (parking decision until repo exists).
- License: defaulting to MIT unless a reason emerges to use Apache-2.0.

---

**Approved by:** Sok (2026-05-21)

---

## Amendments (2026-05-21, after Phase 1)

### A1. Web stack changed from Next.js to SolidStart

Original §6 listed `apps/web` as Next.js 15 App Router. Replaced with **SolidStart v1** (Vinxi bundler, file-based routing in `src/routes/`).

- **Why:** Solid's fine-grained reactivity is a better fit for the live SSE-driven counter — the demo's headline moment. Also pairs thematically with the Rust indexer ("pick the right tool, not the popular one"), strengthening hiring narrative.
- **Implications:**
  - Route file convention: `apps/web/src/routes/tap/[owner].ts` (exports GET/POST) replaces `apps/web/app/tap/[owner]/route.ts`.
  - Profile page: `apps/web/src/routes/[owner].tsx` replaces `apps/web/app/[owner]/page.tsx`.
  - Components are `.tsx` Solid components, not React.
  - Deployment §9 deployment target stays compatible — SolidStart deploys to Vercel via its Vercel preset, or to a Node host like Fly.io.
- Risk: smaller wallet-adapter ecosystem for Solid. Plan to use raw `@solana/web3.js` + Umi calls and avoid wallet-adapter libraries where they require React context.

### A2. Prior-art on Solana — repositioning required

Competitive research (via Colosseum Copilot, 2026-05-21) surfaced direct prior art that the original spec missed:

- **POW Cards** (Radar Sep 2024, Honorable Mention – Payments) — NFC cards on Solana with Apple/Google Wallet pass integration. Strongest competitor. github.com/tomrowbo/POW-Cards.
- **My Nexus Card** (Radar Sep 2024) — same one-line pitch as SolTap; solo dev, no shipped demo. github.com/nizarsyahmi37/MyNexusCard.
- **Solana Tap** (Breakout Apr 2025) — NFC tap-to-pay (payments, not networking).
- **here.** (Cypherpunk Sep 2025, prize winner) — GPS-verified photo NFTs. Adjacent "proof-of-being-there" mechanic.
- **Attest Protocol** (Radar Sep 2024, prize winner) — generalized on-chain attestation infra. SolTap handshakes could plausibly be implemented as attestations on this rather than custom Metaplex Core assets. Stretch goal.

**No NFC business card project is in any Solana accelerator portfolio.** The wedge has been tried multiple times since 2024 but produced no venture-scale outcomes.

**Repositioning consequences:**

1. **Primary goal stays:** SolTap remains a hiring demo. The product is not novel; the *narrative* and the technical depth (Rust indexer) are.
2. **Demote secondary goal:** "Open-source kit becomes adopted by other attendees" is now an *outcome to hope for*, not an optimization target. No prior similar kit has gained traction; assume the same.
3. **Promote the Rust indexer:** in pitch, demo, and README, lead with **"on-chain handshake protocol with a live Rust indexer"** — the NFC card is the *demo surface*, not the product. The indexer is the most legible differentiator for Helius/Triton/Jito-style roles.
4. **README must cite prior art.** Acknowledging POW Cards + My Nexus Card upfront signals due diligence and demarcates positioning ("wallet-native instead of wallet-pass-locked"). Recruiters will Google.
5. **Risks section (§11) addendum:** if POW Cards' creator (tomrowbo) appears at Accelerate with a v2, expect direct comparison. Defense: different UX angle (Phantom + Metaplex Core vs. Apple Wallet pass) + the live indexer + an open repo with thoughtful README. Don't compete on UX polish (they win); compete on technical legibility.

### A3. config.toml secret-handling resolved

§8 said config.toml is committed and secrets live in env. Implementation surfaced an edge case: the `chain.rpc_url` needs a Helius API key. Resolution: `config.toml` uses literal `${HELIUS_API_KEY}` placeholder, and the config loader does env-var substitution at runtime. `config.toml` stays committed; `.env` carries the secret. Applied in Task 1.3.
