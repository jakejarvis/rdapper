# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` (entry: `src/index.ts`).
- Protocol modules: `src/rdap/` and `src/whois/` (clients, normalize, helpers).
- Utilities: `src/lib/`, shared types: `src/types.ts`.
- Tests live beside code in `__tests__/` and use `*.test.ts`.
- Built output: `dist/` (ESM + types). Quick CLI: `cli.mjs` for manual checks.

## Build, Test, and Development Commands
- `npm run build` — clean and compile TypeScript to `dist/`.
- `npm test` — type-check, build, and run Node’s test runner on `dist/**/*.test.js`.
- `npm run lint` — format and lint with Biome (auto-fixes).
- Manual smoke: `node cli.mjs example.com` (after `npm run build`).
- Network smoke tests (opt‑in): `SMOKE=1 npm test`.

## Coding Style & Naming Conventions
- TypeScript strict, ESM (`module`/`moduleResolution: NodeNext`).
- Formatting via Biome: spaces, 2‑space indent, double quotes.
- Naming: functions/vars `camelCase`, types/interfaces `PascalCase`, constants `UPPER_SNAKE_CASE`.
- Files: lowercase; tests in `__tests__/` with `*.test.ts`.
- Prefer named exports; avoid default exports unless ergonomic.

## Testing Guidelines
- Framework: Node `node:test` + `assert/strict`.
- Unit tests must be deterministic and offline. Gate network tests behind `SMOKE=1`.
- Place tests near the code (e.g., `src/whois/__tests__/normalize.test.ts`).
- Run locally: `npm test`; for smoke: `SMOKE=1 npm test`.

## Commit & Pull Request Guidelines
- Commits: concise imperative subject (e.g., “Add WHOIS referral fallback”), with a brief “what/why” body.
- Scope changes narrowly; keep diffs readable.
- PRs: clear description, linked issues, test plan (commands + expected output), and any CLI screenshots/logs when relevant.
- Required checks before PR: `npm run lint && npm test`.

## Security & Configuration Tips
- Node `>= 18.17`. No external HTTP client; uses global `fetch` and TCP 43 for WHOIS.
- Avoid hardcoding endpoints. Respect options: `timeoutMs`, `followWhoisReferral`, `rdapOnly`, `whoisOnly`.
- Do not run network tests in CI by default; use `SMOKE=1` only when appropriate.
