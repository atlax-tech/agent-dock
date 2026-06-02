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

## 2026-06-02 - Phase 2 Local Scan Dashboard v1

### Phase

Phase 2 - Privacy startup hardening, persisted scan roots, scan preview, and
explainable local scan results.

### Implemented

- Added `get_initial_scan_state`, which returns fixture roots, persisted
  AgentDock roots, persisted agent index, and privacy mode without calling
  default candidate detection.
- Changed startup and `get_scan_roots` so they no longer inspect
  `~/.openclaw`, `~/.hermes`, `~/.config/openclaw`, `~/.config/hermes`, or
  workspace candidates.
- Kept default runtime path detection behind explicit `scan_default_candidates`
  / "Detect local paths" user action.
- Added `load_scan_roots` and persisted root reload from SQLite with
  runtime/path de-duplication.
- Added `preview_scan_root`, which only checks target path existence/readability
  and returns scan rules; it does not parse config contents or write SQLite.
- Added frontend preview panel with explicit private-dir and secret-value
  privacy notes.
- Added expandable agent details with root path, config paths, personality
  files, skill paths, provider/model/channel summaries, and redacted secret
  field names only.
- Added per-agent `healthStatus` values: `ok`, `warning`, and `error`.
- Expanded OpenClaw and Hermes fixtures for provider/model mismatch, fallback
  models, channel token fields, encrypted credential placeholders, personality
  files, skills, and private runtime directories.

### Modified Files

- `apps/desktop/src-tauri/src/commands/scanner.rs`
- `apps/desktop/src-tauri/src/db/mod.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/scanner/mod.rs`
- `apps/desktop/src-tauri/src/scanner/openclaw.rs`
- `apps/desktop/src-tauri/src/scanner/hermes.rs`
- `apps/desktop/src-tauri/src/scanner/types.rs`
- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `tests/fixtures/openclaw/**`
- `tests/fixtures/hermes/**`

### Test Results

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test`: passed with 18 tests.
- `cargo check`: passed.
- `git diff --check`: passed.
- Privacy network audit passed:
  `! rg -n "fetch\\(|XMLHttpRequest|sendBeacon|WebSocket" apps/desktop/src apps/desktop/src-tauri/src`.

### Review Follow-up

- Re-reviewed Phase 2 Step 0 through Step 6 against the execution prompt.
- Fixed selected-folder scan so a matching preview is required before scanning;
  if runtime/path changes, the app clears the preview and requires a fresh one.
- Added warning severity labels to the agent warnings UI.
- Corrected `privacyMode.defaultCandidatesInspected` so persisted default
  candidate roots are reflected without re-detecting local runtime paths.
- Added command-level tests for `~` expansion and selected scan persistence.
- Fixed an `agent_index` SQLite upsert value-count bug found by the new
  selected scan persistence test.

### Privacy Boundary

- Startup reads only AgentDock SQLite, fixture root metadata, and persisted
  AgentDock scan/index state.
- Default OpenClaw/Hermes runtime paths are detected only by explicit user
  action.
- Preview does not read config contents, does not write SQLite, and does not
  modify files.
- Scanner still skips sessions, history, memory, conversations, transcripts,
  logs, cache, and tmp directories.
- Serialized scan records and SQLite summaries contain secret field names only,
  not API key values, bot token values, OAuth tokens, cookies, encrypted
  credential values, memory text, transcript text, or log contents.

### Unfinished Items

- Frontend still has no dedicated test framework; Phase 2 verification relies
  on TypeScript check, production build, Rust command/scanner/DB tests, and
  manual app verification.
- UI navigation remains static as planned for Phase 2/3.
- No provider editing, migration, key management, channel bot management, cloud
  sync, login, chat UI, or source config mutation was implemented.

### Next Step

Before Phase 3, manually verify the desktop app flow end to end in Tauri:
first launch, fixture scan, detect local paths, selected folder preview, selected
folder scan, and restart/persisted root reload.

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

## 2026-06-02 - Phase 2.5 Safe Agent Detail + Personality Editor

### Phase

Phase 2.5 - Safe Agent Detail and Personality Editor.

### Goal

Add a safe, local-only agent detail workflow for reading, editing, diffing,
backing up, atomically saving, re-scanning, listing backups, and restoring only
the whitelisted personality files: `SOUL.md`, `AGENTS.md`, and `USER.md`.

### Modified Files

- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock`
- `apps/desktop/src-tauri/src/commands/mod.rs`
- `apps/desktop/src-tauri/src/commands/personality.rs`
- `apps/desktop/src-tauri/src/commands/scanner.rs`
- `apps/desktop/src-tauri/src/db/mod.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Added backend rejection for overly broad selected scan roots including `/`,
  the user home root, and Desktop/Documents/Downloads.
- Added `get_agent_detail` without reading personality file bodies, sessions,
  memory, logs, or secret values.
- Added `read_personality_file` with backend-resolved paths for only
  `SOUL.md`, `AGENTS.md`, and `USER.md`.
- Added `create_personality_update_plan` with stale hash checking and unified
  diff generation.
- Added `apply_personality_update` with backup creation, temp-file write,
  fsync, atomic rename, affected-root re-scan, and SQLite index update.
- Added backup records with file kind, original path, backup path, created time,
  before hash, and after hash.
- Added `list_agent_backups` and `restore_personality_backup`; restore creates
  a new safety backup before applying backup content and then re-scans.
- Replaced internal phase copy in the app header with user-facing scanner and
  privacy-index copy.
- Added Agent Detail tabs for Overview, Personality, Files placeholder, and
  Backups.
- Added Personality editor UI with detected/missing states, Markdown textarea,
  unsaved changes, reset, generate diff, save gating, and backup restore.

### Privacy Boundary

- Frontend never sends arbitrary file paths for personality reads or writes.
- Backend derives target paths from indexed agent metadata and a whitelisted
  file kind.
- Target paths must remain inside the indexed agent/profile root; symlink
  escapes are rejected.
- Session, memory, history, transcript, log, env, token, secret, and credential
  files are not readable through the personality commands.
- Provider/channel secret fields continue to display only redacted markers.
- No network request, telemetry, login, cloud sync, chat UI, provider manager,
  model manager, skill manager, channel manager, migration, marketplace, or
  SaaS backend was added.

### Test Results

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test`: passed with 24 tests.
- `cargo check`: passed.
- `git diff --check`: passed.
- Privacy network audit passed:
  `! rg -n "fetch\\(|XMLHttpRequest|sendBeacon|WebSocket" apps/desktop/src apps/desktop/src-tauri/src`.
- Browser static smoke at `http://127.0.0.1:1420/` passed for page identity,
  nonblank render, no framework overlay, no console warning/error, and first
  viewport layout. Browser-only mode does not exercise Tauri commands; desktop
  runtime behavior is covered by Rust command tests and Tauri build checks.

### Known Risks

- Frontend has no dedicated automated UI test framework; rendered verification
  is manual/Tauri-runtime focused.
- Backup directory names use a sanitized agent id plus content hash because
  indexed agent ids include filesystem path separators.
- Selected folder scan still uses a text path input rather than a native folder
  picker.

### Phase 3 Readiness

Phase 2.5 can proceed toward Phase 3 after desktop runtime manual review in the
Tauri app. Provider/model/skill/channel/migration work remains intentionally
out of scope for this phase.

## 2026-06-02 - Phase 3 Provider and Model Manager

### Phase

Phase 3 - Provider and Model Manager, plus Phase 2.5 carry-over restore
hardening.

### Implemented

- Added `Model & Provider` tab inside Agent Detail.
- Added provider profile metadata round trip in SQLite for name, kind, base
  URL, API key reference, default model, fallback model, validation JSON, and
  updated time.
- Added effective model preview with resolution order, source explanation,
  local/remote/cost indicators, and remote fallback warning.
- Added explicit OpenAI-compatible validation command with base URL checks,
  API key reference existence check, model listing, optional lightweight
  generation test, and unknown model warning.
- Added explicit Ollama scanner for `/api/tags`.
- Added explicit LM Studio scanner for `/v1/models`.
- Added explicit ComfyUI capability scanner for default/custom paths and model
  folders: checkpoints, vae, loras, controlnet, upscale_models, and embeddings.
- Added provider/model safe mutation commands:
  `create_model_provider_update_plan` and `apply_model_provider_update`.
- Provider/model apply validates stale hash, creates backup, writes
  atomically, re-scans the selected agent/profile root, and refreshes SQLite
  index/provider profile metadata.
- Added `create_personality_restore_plan` with target path, backup path,
  current/restored hashes, unified diff, warnings, and safety backup preview.
- Frontend Restore now creates a restore plan first and requires explicit
  Confirm restore before write.
- Top status now shows `Local Only / No Cloud / No Telemetry`.

### Modified Files

- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock`
- `apps/desktop/src-tauri/src/commands/mod.rs`
- `apps/desktop/src-tauri/src/commands/personality.rs`
- `apps/desktop/src-tauri/src/commands/providers.rs`
- `apps/desktop/src-tauri/src/db/mod.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Privacy Boundary

- No API key value, bot token value, OAuth token, pairing state, session,
  memory, transcript, log, or `.env` value is read, displayed, or saved.
- Provider profile DB writes reject secret-like `apiKeyRef` values and store
  only reference names.
- Provider/model mutation is scoped to the selected indexed agent/profile
  config file inside the agent/profile root.
- Global/default config and other agents/profiles are not modified.
- Real Hermes/OpenClaw paths were not written or used for tests.

### Provider Validation Boundary

- Provider validation is only invoked by explicit UI buttons:
  Refresh models or Test connection.
- Validation does not run on app launch.
- Validation never logs or stores secret values.
- API key reference checks use the reference name only; AgentDock does not
  read `.env` files or display secret contents.

### Local Runtime Scan Boundary

- Ollama, LM Studio, and ComfyUI scans are only invoked by explicit UI buttons.
- Ollama/LM Studio scanner endpoints are restricted to localhost/loopback.
- ComfyUI scan reads only configured/default ComfyUI model capability folders
  and does not execute workflows or upload files.
- No local runtime server is started and no model is downloaded.

### Test Results

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test`: passed with 35 tests.
- `cargo check`: passed.
- `git diff --check`: passed.
- Privacy/network audit passed with no hits:
  `! rg -n "fetch\\(|XMLHttpRequest|sendBeacon|WebSocket" apps/desktop/src apps/desktop/src-tauri/src`.
- Browser static smoke at `http://127.0.0.1:1420/` passed for page identity,
  nonblank first viewport, top status text, no framework overlay, and no
  console warning/error. Browser-only Vite cannot exercise Tauri commands or
  Agent Detail tabs because the Tauri command bridge is unavailable there.

### Backend Tests Added

- Provider profile DB round trip.
- Provider profile secret-like `apiKeyRef` rejection.
- OpenAI-compatible validation mock server.
- Ollama `/api/tags` mock server.
- LM Studio `/v1/models` mock server.
- ComfyUI folder scan fixture.
- Effective model resolution.
- Provider/model update plan diff and scoped target.
- Provider/model apply creates backup.
- Provider/model apply rejects stale hash.
- Provider/model update rejects secret-like values.
- Personality apply + restore closed loop with restore plan and safety backup.

### Real Hermes/OpenClaw Touch Status

- Real `~/.hermes`, `~/.openclaw`, workspace, provider config, channel config,
  global config, tokens, pairing state, sessions, memory, logs, and transcript
  paths were not touched.
- No real test agent/profile was created.

### Known Risks

- Frontend still has no dedicated automated Tauri UI test framework; command
  behavior is covered by Rust tests and rendered browser smoke is static.
- Provider/model config mutation supports structured JSON/YAML/TOML top-level
  provider/model fields. Unknown schemas are rejected instead of guessed.
- OpenAI-compatible validation cannot send real auth without reading a secret;
  authenticated providers may report auth failure until the runtime itself
  handles credentials outside AgentDock.
- ComfyUI is represented as a capability provider and remains blocked as a
  default chat model unless a compatible bridge endpoint is configured later.

### Next Phase Recommendation

- Add native folder picker support and a desktop-runtime UI test harness for
  Agent Detail interactions.
- Broaden real-world OpenClaw/Hermes provider schema fixtures before migration
  or skill/channel mutation phases.
