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

### Completed Configuration

- Confirmed repository: `atlax-tech/agent-dock`.
- Confirmed admin permission for `QilongLu`.
- Confirmed remote branches exist: `main`, `demo`, and `dev`.
- Cleared `main` so it contains only an empty `README.md`.
- Pushed CI/CODEOWNERS governance baseline to `dev`.
- Pushed CI/CODEOWNERS governance baseline to `demo`.
- Configured and read back branch protection for `main`, `demo`, and `dev`.

### Branch Protection Summary

- `main`: protected; PR required; 1 approval required; stale approvals
  dismissed; conversation resolution required; linear history required; force
  push disabled; branch deletion disabled; push restricted to `QilongLu`;
  admin enforcement enabled. Required checks and CODEOWNERS review are not
  enabled yet because `main` intentionally contains only an empty `README.md`
  and has no workflow/CODEOWNERS files.
- `demo`: protected; PR required; 1 approval required; stale approvals
  dismissed; CODEOWNERS review required; status checks required and strict;
  conversation resolution required; linear history required; force push
  disabled; branch deletion disabled; push restricted to `QilongLu`; admin
  enforcement enabled.
- `dev`: protected; PR not required; status checks not required by GitHub
  protection; linear history required; force push disabled; branch deletion
  disabled; push restricted to `QilongLu`; admin enforcement enabled.

### Required Checks

- Enabled on `demo`: `desktop-check`, `desktop-build`, `tauri-cargo-test`,
  `tauri-cargo-check`, `privacy-network-audit`, and `git-diff-check`.
- Not enabled on `main`: same six checks are missing on `main` because the
  branch was reset to an empty README as requested.
- Not enabled on `dev`: by design, the dev agent may push directly after
  running the full local verification command set.

### Direct Push Policy

- `main`: external contributors cannot direct push; `QilongLu` is the only
  restricted push/bypass user for emergency owner use.
- `demo`: external contributors cannot direct push; `QilongLu` is the only
  restricted push/bypass user.
- `dev`: external contributors cannot direct push; `QilongLu` is the only
  restricted push user for maintainer/dev-agent development.

### Manual Follow-up

- When `main` receives release content, add CI/CODEOWNERS to `main` through the
  release PR and then enable the same six required checks plus CODEOWNERS review
  on `main`.

## 2026-06-02 - Phase 1 Local Scan Engine

### Phase

Phase 1 - Local Scan Engine and unified dashboard.

### Implemented

- Added Rust scanner modules for OpenClaw and Hermes.
- Added default candidate detection for `~/.openclaw`, `~/.openclaw/agents`,
  `~/.openclaw/workspace`, `~/.openclaw/workspace-*`, `~/.hermes`, and
  `~/.hermes/profiles`.
- Added fixture-first scans for `tests/fixtures/openclaw` and
  `tests/fixtures/hermes`.
- Added selected root read-only scan command for user-provided OpenClaw/Hermes
  folders.
- Added SQLite cache writes for `scanned_roots` and `agent_index`.
- Added Phase 1 columns for config paths, personality file paths, skill paths,
  provider/model/channel summaries, and warnings.
- Replaced the Phase 0 frontend shell with a Phase 1 dashboard containing
  Dashboard, Scan, Agents, and Settings sidebar entries.
- Added dashboard status for runtime detection, last scan time, and
  Local-only / Read-only privacy mode.
- Added unified agent list for OpenClaw agents and Hermes profiles.
- Added minimum fixture data for OpenClaw consulting/companion/workspace agents
  and Hermes consulting/dev profiles.

### Scanner Support Scope

- Reads only metadata from JSON, YAML, and TOML config files.
- Records personality files only by path/presence for `SOUL.md`, `AGENTS.md`,
  and `USER.md`; it does not display their contents.
- Records skills by path/presence under `skills`.
- Detects provider, base URL, default model, fallback model, channel hints, and
  warning states.
- `scan_default_candidates` only checks whether default roots exist and are
  readable; it does not deep-scan real user agent/profile contents.

### Privacy Boundary

- Skips private runtime directories named `sessions`, `session`, `history`,
  `histories`, `memory`, `memories`, `conversation`, `conversations`,
  `transcript`, `transcripts`, `logs`, `cache`, and `tmp`.
- Shows skipped private runtime data only as `Skipped private runtime data`.
- Secret-like fields are detected by field name and represented in the UI as
  `••••••••`.
- SQLite does not store API key values, bot tokens, OAuth tokens, encrypted
  credentials, transcript text, memory text, or session content.

### Not Implemented

- No agent creation, deletion, duplication, migration, personality editing,
  skill editing, provider manager, channel bot management, token migration,
  OAuth migration, cloud sync, login, Web UI, plugin market, or SaaS behavior.

### Test Results

- `npm run check`: passed.
- `cargo test`: passed with Phase 1 scanner tests.
- Remaining full acceptance commands are run before commit/push and recorded in
  the final delivery note.

### Manual Verification

- Fixture scan path is available from the dashboard and writes the safe index to
  SQLite.
- Default path detection is exposed separately and does not deep-scan real local
  OpenClaw/Hermes roots.
- Selected folder scan accepts a user-provided runtime and path and performs a
  read-only metadata scan.
- Desktop app build/run verification is performed before delivery.

### Known Risks

- Selected folder scan currently uses a text path input rather than a native
  folder picker.
- Scanner metadata extraction is intentionally conservative and may not detect
  every real OpenClaw/Hermes config variant until real-world structures are
  added as fixtures.
- YAML support uses `serde_yaml`, which is deprecated upstream but still
  adequate for local fixture/config parsing in this phase.

### Next Stage Recommendation

- Add native folder picker support and broaden real-world config fixtures before
  Phase 2 mutation workflows.
