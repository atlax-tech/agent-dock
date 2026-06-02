# AgentDock Development Log

## 2026-06-02 - Phase 0 Bootstrap

### Phase

Phase 0 - Project Bootstrap and Fixtures.

### Product Boundary

AgentDock remains a local-only desktop dashboard. This round does not implement
Web UI management, SaaS, login, cloud sync, hosted backend, telemetry, template
market, chat UI, automatic secret migration, or real OpenClaw/Hermes scanning.

### Implemented

- Created the public GitHub repository plan target `atlax-tech/agent-dock`.
- Added MIT open-source license and branch policy documentation.
- Added React + TypeScript + Vite desktop app shell under `apps/desktop`.
- Added Tauri 2 Rust backend scaffold under `apps/desktop/src-tauri`.
- Added SQLite initialization under `~/.agentdock/agentdock.sqlite`.
- Added Phase 0 Tauri commands for bootstrap status and fixture root summary.
- Added required fixture roots under `tests/fixtures`.
- Copied PRD, SPEC, and execution prompt into the repository root.

### Data and Secret Handling

- SQLite stores only AgentDock index/cache tables from SPEC.
- No table stores API key values, bot token values, OAuth tokens, channel
  pairing state, encrypted credentials, transcripts, or memory full text.
- Fixture summary command only reports `tests/fixtures` roots.

### Verification Notes

- `npm install` completed with 0 reported vulnerabilities.
- `npm run check` passed.
- `npm run build` passed.
- `cargo test` passed with 2 tests.
- `cargo check` passed.
- `npm run dev` launched the Tauri macOS desktop app through the local Vite
  dev server at `127.0.0.1:1420`.
- Verified `~/.agentdock/agentdock.sqlite` was created.
- Verified SQLite contains only the six SPEC Phase 0 index/cache tables:
  `app_settings`, `scanned_roots`, `agent_index`, `provider_profiles`,
  `backups`, and `migration_history`.
- Static network audit found no frontend/Rust business code that calls
  `fetch`, `XMLHttpRequest`, `sendBeacon`, or `WebSocket`; only Tauri config
  schema metadata and the local development URL were present.
- Stopped the dev app, Vite server, and Tauri dev process after verification.
- Pushed `main`, `demo`, and `dev` branches to
  `github.com:atlax-tech/agent-dock`.
- Ran a Chrome headless local Vite render check at `127.0.0.1:1420`; DOM
  output confirmed the sidebar, navigation, `Project bootstrap`, and
  `Local only` Phase 0 shell copy render. The Tauri command bridge is only
  available in the desktop runtime, so the browser-only runtime error is
  expected and not product behavior.

### Risks / Blockers

- Current Phase 0 app shell is intentionally minimal and contains no real
  scanner, migration, provider, skills, channel, or backup workflows.
- Visual QA is limited to confirming the desktop app launches; this round did
  not create a full product UI design because Phase 0 is bootstrap-only.
- Main/demo/dev branch protection rules are not configured yet.

### Next Step

Finish Phase 0 verification, push `main`, create `demo` and `dev`, then continue
Phase 1 from the `dev` branch after user approval.

## 2026-06-02 - Branch Protection Preparation

### Phase

Repository governance before Phase 1.

### Implemented

- Added `.github/CODEOWNERS` with `@QilongLu` as the confirmed GitHub owner
  account.
- Added `.github/workflows/ci.yml` with the required Phase 0/Phase 1 baseline
  checks:
  `desktop-check`, `desktop-build`, `tauri-cargo-test`,
  `tauri-cargo-check`, `privacy-network-audit`, and `git-diff-check`.

### Branch Model

Target branch flow:

```text
task/* or phase/* or fix/*
        -> dev
        -> demo
        -> main
```

Allowed temporary branch prefixes: `task/*`, `phase/*`, `fix/*`, `release/*`.
Forbidden long-lived development branches: `hot-dev`, `agent-dev`,
`dev-agent`, `phase-dev`, and `staging-dev`.

### Pending Verification

- Run the full local dev-agent pre-push verification command set.
- Push CI/CODEOWNERS to `dev`.
- Clear `main` content so only an empty `README.md` remains.
- Configure and read back branch protection for `main`, `demo`, and `dev`.
