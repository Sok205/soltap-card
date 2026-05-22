# Contributing to SolTap

SolTap is currently maintainer-focused — built for Solana Accelerate 2026, with a tight one-month runway. PRs are welcome, but iteration is fast and the design is still settling. If you plan a non-trivial change, open an issue first to check it isn't already in flight.

## Filing an issue

Use [GitHub Issues](https://github.com/sok205/sol-promotion-card/issues). Include: what you did, what you expected, what happened instead. A minimal reproduction is ideal.

## Branch and PR workflow

- Use descriptive branch names: `feat/mutual-mint`, `fix/sse-reconnect`, `docs/deploy-guide`.
- Before pushing: run `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, and `cargo test` for Rust changes; run `pnpm typecheck` and `pnpm test` for TypeScript changes.
- Squash commits on merge. One logical change per PR.

## Code style

- TypeScript: strict mode, no `any`, no suppression comments without explanation.
- Rust: `cargo fmt` (default settings) + `clippy --all-targets -D warnings`. No `unwrap` in library or server code — use `?` or explicit error handling.

## Contact

Maintainer: Sok Filimonov — sokfil205@gmail.com
