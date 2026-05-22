# SolTap

> On-chain business cards on Solana. Tap an NFC card with your phone, mint a handshake NFT, see the count tick live.

[![status](https://img.shields.io/badge/status-pre--mvp-orange)]() [![solana](https://img.shields.io/badge/solana-devnet-9945FF)]() [![license](https://img.shields.io/badge/license-MIT-blue)]()

## What it is

SolTap is an open-source kit for NFC-tappable business cards on Solana. The owner programs a physical NFC card with a Solana Pay URL. When someone taps the card, their mobile wallet (Phantom, Solflare) presents a fee-sponsored transaction; one approval later, a Metaplex Core NFT containing the owner's contact info lands in their wallet. The owner's public profile page shows a live handshake counter and a real-time feed of recipients, powered by a Rust indexer that subscribes to devnet and pushes events via SSE within seconds of a mint landing on-chain. Anyone can fork the repo, edit a single config file, fund a fee-payer wallet, and deploy their own card in under 30 minutes.

## Demo

<!-- TODO: replace with deploy URL + demo gif after Phase 4 deploy -->
**Live demo:** _coming soon_

**Local demo:** see [docs/deploy.md](docs/deploy.md).

**Devnet state (verifiable):**
- Collection: [`5btULRffJ1DAN8UREWUyxMvU3taFARZYo6d4u1TzrVeH`](https://explorer.solana.com/address/5btULRffJ1DAN8UREWUyxMvU3taFARZYo6d4u1TzrVeH?cluster=devnet)
- Owner card asset: [`3gHR35TpLP22xPtANZAoW1bDJZhMfpyWkgynQcZJPBJc`](https://explorer.solana.com/address/3gHR35TpLP22xPtANZAoW1bDJZhMfpyWkgynQcZJPBJc?cluster=devnet)
- 4 handshake NFTs minted via real Solana Pay flows; indexer caught each within 3 seconds.

## How it works

```
+-------------------+
|  NFC NTAG215 card |  (URL: solana:https://<domain>/tap/<owner>)
+---------+---------+
          |
          v  recipient taps phone
+---------+---------+
|  SolidStart (web) |
|  GET /tap/:owner  |  returns Solana Pay tx-request JSON
+---------+---------+
          |
          v  wallet reads spec, POSTs back
+---------+---------+
|  SolidStart (web) |
|  POST /tap/:owner |  builds Metaplex Core CreateV2 ix,
|                   |  fee payer = backend hot wallet,
|                   |  returns partially-signed tx
+---------+---------+
          |
          v  wallet signs + submits
     Solana network
          |
          v  mint lands on-chain
+---------+---------+
|  Rust indexer     |  polls getSignaturesForAddress(collection),
|  (axum + tokio)   |  decodes Core instruction (custom wire-format
|                   |  parser, no solana-sdk dep), persists to SQLite,
|                   |  fans out via SSE on /events
+---------+---------+
          |
          v  SSE
+---------+---------+
|  Profile page     |  /<owner> subscribes via EventSource,
|  (SolidStart SSR) |  counter ticks, feed scrolls in real time
+-------------------+
```

- **Tap triggers Solana Pay.** The NFC card encodes a `solana:` URI. The wallet fetches the tx-request GET, then POSTs the recipient's public key. The backend constructs and partially signs a Metaplex Core `CreateV2` instruction.
- **Mint is fee-sponsored.** The backend hot wallet pays the transaction fee. The recipient approves one click; no SOL required on their side.
- **Rust indexer drives the live profile.** The indexer polls `getSignaturesForAddress` on the collection, decodes the raw instruction wire format, stores events in SQLite, and fans out to all SSE subscribers. The subscriber interface is designed to swap polling for Yellowstone gRPC with a one-line change.

## Stack

| Layer | Tech |
|---|---|
| Web app | SolidStart 1.0 + Vinxi 0.5 (SSR, file-based routing) |
| Solana Pay + mint route | `@solidjs/start` API routes, `@metaplex-foundation/mpl-core` 1.1, `@metaplex-foundation/umi` 0.9 |
| Mint SDK | `packages/card-sdk` — pure TS, no I/O, reusable outside the web app |
| Indexer | Rust: axum 0.7, tokio 1, sqlx 0.8 + SQLite, reqwest 0.12 |
| Live updates | SSE (`EventSource` in browser, axum SSE handler in indexer) |
| Config | Single `config.toml` at repo root, shared by web + indexer |
| Workspace | pnpm 9 (TS packages) + Cargo workspace (Rust) |
| Deploy | Vercel (web) + Fly.io (indexer) |

## Quick start

**Prerequisites:** Node 20+, pnpm 9+, Rust 1.78+, Solana CLI, Helius account (free tier).

```sh
# 1. Clone + install
git clone https://github.com/sok205/sol-promotion-card.git soltap
cd soltap
pnpm install
cargo build -p soltap-indexer

# 2. Configure
cp config.example.toml config.toml
# edit config.toml — fill [owner] fields + set wallet pubkey
# copy .env.example to .env and fill secrets (keypairs + HELIUS_API_KEY)
pnpm tsx scripts/init-collection.ts   # creates collection + owner card on-chain, writes addresses back to config.toml

# 3. Run
cargo run -p soltap-indexer &          # indexer on :8787
pnpm --filter web dev                  # web on :3000
# open http://localhost:3000/<your-name>
```

Full fork-and-deploy guide (tunneling, NFC programming, Vercel + Fly.io): [docs/deploy.md](docs/deploy.md).

## Prior art

NFC business cards on Solana are not a new idea. Projects that came before:

- **[POW Cards](https://github.com/tomrowbo/POW-Cards)** (Radar Sep 2024, Honorable Mention — Payments) — NFC cards with Apple Wallet / Google Wallet pass integration. Different UX angle: SolTap is wallet-native (Phantom/Solflare + Solana Pay) rather than platform-pass-based.
- **[My Nexus Card](https://github.com/nizarsyahmi37/MyNexusCard)** (Radar Sep 2024) — same one-line pitch; solo dev, no shipped demo at time of writing.
- **[Solana Tap](https://github.com/vonernue/solana-tap)** (Breakout Apr 2025) — NFC tap-to-pay (payments focus, not networking / contact exchange).

What's specifically different here: none of the above have a real-time on-chain event pipeline. The Rust indexer — custom wire-format decoder, SQLite persistence, SSE fan-out, drop-in Yellowstone gRPC interface — is the technical differentiator and the main portfolio piece. SolTap is not trying to be the first or the most polished; it's trying to be the most legible open-source Rust-infra piece in this space.

## Status and roadmap

- **Working today (devnet):** Solana Pay tx-request endpoint, fee-sponsored Metaplex Core mint, Rust indexer (polling + SQLite + SSE), live profile page, `init-collection` bootstrap script.
- **In progress:** art template (SVG → PNG renderer), metadata upload to Arweave.
- **Phase 4 (pre-Accelerate):** mainnet cutover, Vercel + Fly.io deploy, NFC card programming, demo rehearsal.
- **Stretch:** Yellowstone gRPC subscription (swap for polling), mutual mint, endorsement attestations, cross-fork leaderboard.

Built for Solana Accelerate 2026. Mainnet target: one week before the event.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
