# Repository Guidelines

## Project Structure & Module Organization
- `src/api/`: Public lookup orchestration (`lookup.ts`).
- `src/rdap/`: RDAP bootstrap, client, and normalization (`bootstrap.ts`, `client.ts`, `normalize.ts`).
- `src/whois/`: WHOIS TCP client, discovery, referral, normalization, catalog.
- `src/lib/`: Shared utilities (`dates.ts`, `async.ts`, `domain.ts`, `text.ts`).
- `src/types.ts`: Public types. `src/index.ts` re-exports API and types.
- Tests: per-module `__tests__/` folders with `*.test.ts` (e.g., `src/lib/__tests__/dates.test.ts`).
- `dist/`: Build output (generated). Do not edit.
- `cli.mjs`: Local CLI for manual checks.

## Build, Test, and Development Commands
- `npm run build`: Clean and compile with `tsc -p tsconfig.build.json` (excludes tests); outputs to `dist/`.
- `npm test`: Compile tests, then run Node’s test runner on `dist/**/*.test.js`.
- `npm run lint`: Biome format+lint with autofix per `biome.json`.
- Example CLI: `npm run build && node cli.mjs example.com`.

## Coding Style & Naming Conventions
- TypeScript strict; ES2022 ESM (`tsconfig.json`).
- Biome-enforced: spaces indentation; double quotes; organized imports.
- Filenames: kebab-case for modules (e.g., `normalize-rdap.ts`).
- Identifiers: camelCase; avoid abbreviations; explicit return types for exported functions.

## Testing Guidelines
- Framework: Node `node:test`.
- Tests live under `src/**/__tests__` and are deterministic/offline by default.
- Smoke tests gated by `SMOKE=1` (e.g., `SMOKE=1 npm test`).
- Run all tests: `npm test`.

## Commit & Pull Request Guidelines
- Commits: imperative, concise summaries (e.g., “Refactor lookup: tighten error handling”).
- PRs: include what/why, linked issues, and test notes; ensure `npm run lint && npm test` pass.

## Release & Security Notes
- Publish only `dist/`; `prepublishOnly` runs the build. Tests are excluded via `tsconfig.build.json` and `files` in `package.json`.
- Node >= 18.17 with global `fetch`. WHOIS uses TCP 43; be mindful of registry rate limits.
