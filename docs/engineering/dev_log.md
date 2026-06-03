# AgentDock Development Log

## 2026-06-03 - Hermes Profile ID Scan Fix

### Task Goal

Fix Hermes profile scan identity so the Dashboard profile list, CLI launch
command, and Agent directory point to the same real profile.

### Files Changed

- `apps/desktop/src-tauri/src/scanner/hermes.rs`
- `apps/desktop/src-tauri/src/scanner/mod.rs`
- `apps/desktop/src-tauri/src/commands/agent_profiles.rs`
- `docs/engineering/dev_log.md`

### Implemented

- Hermes scanner now keeps the profile directory name as the profile identity.
- Hermes config `name` / `profile.name` no longer overrides Dashboard
  `displayName`.
- Launch commands now follow the same directory-derived profile id, avoiding
  mismatches like `hermes --profile lsp chat` for
  `~/.hermes/profiles/dev-agent`.

### Boundary Confirmation

- No `hermes profile list` call was added.
- No Hermes or OpenClaw config files are written.
- No create, copy, delete, restore, install, uninstall, migration, Provider,
  Permission, Channel, Scheduled Task, session, memory, or secret behavior was
  added.

### Tests Added / Updated

- Added `hermes_profile_identity_uses_directory_not_config_name`.
- Updated Hermes fixture scan expectations to assert profile directory IDs
  rather than config display names.

### Validation Performed

- `npm run check`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml hermes`: passed
  with 4 filtered Hermes tests.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed with
  64 Rust tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed.
- `git status --short`: reviewed.

### Risks

- If Hermes later exposes an official profile display alias distinct from the
  profile id, it should be shown as secondary metadata, not as the scan identity.

### Next Step

Refresh the Dashboard scan and verify the visible Hermes list matches
`~/.hermes/profiles/*` directory names.

## 2026-06-03 - Dashboard Runtime Status Cleanup

### Task Goal

Clean up the installed runtime status strip so CLI, Version, and Agent directory
fields reflect the selected OpenClaw agent or Hermes profile instead of
repeating raw runtime paths or full CLI version banners.

### Files Changed

- `apps/desktop/src-tauri/src/commands/runtime_detection.rs`
- `apps/desktop/src-tauri/src/commands/agent_profiles.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Runtime detection now extracts a clean version number from CLI version output.
- Runtime detection reports update availability only when the CLI version output
  clearly contains update-available text.
- Added an explicit user-triggered `update_runtime_product` Tauri command for
  `openclaw update` and `hermes update`.
- Managed agent scan results now include a runtime-specific launch command:
  `openclaw agent --agent <id> --message "<message>"` for OpenClaw and
  `hermes --profile <name> chat` for Hermes.
- Dashboard status strip now shows the selected agent/profile launch command and
  selected agent/profile directory.
- Renamed `Home / config` to `Agent目录`.
- Added a compact `有新版本可用` button in the Version cell when an update is
  reported by detection.
- Follow-up: after a user-triggered update succeeds, the Dashboard now hides the
  update button immediately, shows only `升级完成`, and triggers a fresh runtime
  detection pass instead of rendering raw update command output.

### Source Confirmation

- OpenClaw official CLI docs document `openclaw agent --agent <id>` for
  targeting a configured agent and `openclaw update` for runtime updates.
- Hermes official CLI docs document `hermes --profile <name>` / `-p <name>` for
  selecting a profile, `hermes chat` for interactive agent use, and
  `hermes update` for updates.

### Boundary Confirmation

- No create, copy, delete, restore, install, uninstall, migration, Provider,
  Permission, Channel, Scheduled Task, session, memory, telemetry, account, or
  background network behavior was added.
- No OpenClaw or Hermes config files are written during detection or scan.
- Update execution is available only after an explicit user click.
- No `hermes profile list` call was added.

### Tests Added / Updated

- Added launch-command assertions for OpenClaw workspace candidates and Hermes
  profiles.
- Added clean version extraction and update availability parsing coverage.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed with
  63 Rust tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed.
- `git status --short`: reviewed.
- Follow-up validation for update UI state:
  - `npm run check`: passed.
  - `npm run build`: passed.
  - `git diff --check`: passed.

### Risks

- OpenClaw launch command is a command template because the official agent
  command requires a message body for an actual run.
- Update availability depends on CLI version output text; if a runtime changes
  wording, the button may not appear until the parser is updated.
- `openclaw update` / `hermes update` may perform network and filesystem work
  when the user explicitly clicks the button.

### Next Step

Add runtime-specific adapter documentation for command templates and update
parsing once the Dashboard status behavior is accepted.

## 2026-06-03 - Dashboard Rescan Button

### Task Goal

Add a compact reload button next to the runtime switcher and shorten the
temporary background scan progress bar.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Added a toolbar reload button immediately after the OpenClaw / Hermes switcher.
- Clicking reload increments the existing background scan trigger and re-runs
  the read-only `scan_managed_agents` command.
- Disabled the reload button while a scan is already running.
- Shortened the toolbar scan progress indicator so it no longer spans the full
  red-box area.

### Boundary Confirmation

- No backend scan protocol changes.
- No create, copy, delete, restore, install, uninstall, migration, Provider,
  Permission, Channel, Scheduled Task, session, memory, or config write behavior
  was added.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed with
  62 Rust tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed.
- `git status --short`: reviewed.

### Risks

- The progress indicator remains indeterminate because the backend does not yet
  emit exact progress events.

### Next Step

If exact progress is required, add a backend scan progress event protocol in a
separate reviewed slice.

## 2026-06-03 - Dashboard Scan Progress Toolbar

### Task Goal

Show temporary background scan progress in the Dashboard toolbar middle area.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Added a transient scan progress state for the background agent/profile scan.
- Displayed an animated progress bar between the runtime switcher and the
  global environment button while scanning.
- Displayed `扫描完成` briefly after scan completion, then hid the indicator so
  it does not remain on the page.

### Boundary Confirmation

- No backend scan protocol changes.
- No create, copy, delete, restore, install, uninstall, migration, Provider,
  Permission, Channel, Scheduled Task, session, memory, or config write behavior
  was added.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed with
  62 Rust tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed.
- `git status --short`: reviewed.

### Risks

- The progress indicator is indeterminate because the current scanner does not
  expose exact filesystem progress events.

### Next Step

If exact progress is needed, add a backend scan progress event protocol in a
separate reviewed slice.

## 2026-06-03 - Async Background Agent/Profile Scan

### Task Goal

Change read-only Agent/Profile scanning so app entry is not blocked by the
filesystem scan.

### Files Changed

- `apps/desktop/src-tauri/src/commands/agent_profiles.rs`
- `apps/desktop/src/app/App.tsx`
- `docs/engineering/dev_log.md`

### Implemented

- Split frontend runtime detection and agent/profile scanning into separate
  effects.
- Runtime install status now resolves and renders independently of managed
  agent scan results.
- Agent/profile scan starts as a Dashboard background task and updates the tree
  when complete.
- Converted `scan_managed_agents` to an async Tauri command that runs scanner
  work through `tauri::async_runtime::spawn_blocking`.

### Boundary Confirmation

- No create, copy, delete, restore, install, uninstall, migration, Provider,
  Permission, Channel, Scheduled Task, session, memory, gateway restart,
  backup, or trash behavior was added.
- No OpenClaw or Hermes config files are written.
- No secret plaintext reads were added.
- No network, account, hosted service, or telemetry behavior was added.
- `hermes profile list` is still not called.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed with
  62 Rust tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed.
- `git status --short`: reviewed.

### Risks

- Agent/profile results can now arrive after runtime status and after runtime
  switching, so selection state must continue to tolerate empty or late-arriving
  scan results.

### Next Step

Add a small rescan affordance or cached last scan state only after the async
startup behavior is accepted.

## 2026-06-03 - Scanner Safety Hardening Read-only

### Task Goal

Harden the read-only Agent/Profile scanner safety boundary without adding new
product functionality.

### Files Changed

- `apps/desktop/src-tauri/src/commands/agent_profiles.rs`
- `apps/desktop/src-tauri/src/scanner/mod.rs`
- `apps/desktop/src-tauri/src/scanner/ignore.rs`
- `docs/engineering/dev_log.md`

### Implemented

- OpenClaw `~/.openclaw` is now only a container/discovery source for managed
  agent scanning.
- OpenClaw managed scan candidates are limited to `~/.openclaw/agents/<id>`,
  `~/.openclaw/workspace`, and `~/.openclaw/workspace-*`.
- Scanner config collection now skips secret-bearing config files before
  reading file bodies.
- Skipped secret-bearing config files emit only the metadata warning
  `secret_config_file_skipped`.
- Added a defensive parse guard so direct config parsing also refuses
  secret-bearing filenames.

### Boundary Confirmation

- No create, copy, delete, restore, install, uninstall, migration, Provider,
  Permission, Channel, Scheduled Task, gateway restart, backup, or trash
  behavior was added.
- No OpenClaw or Hermes config files are written.
- No session or memory full content is read.
- No secret-bearing config file body is read by the scanner path.
- No secret plaintext is intentionally serialized in warnings, summaries,
  managed agent responses, tests, or logs.
- `hermes profile list` is still not called.

### Tests Added / Updated

- Added `openclaw_home_is_discovery_source_not_managed_agent`.
- Added `scanner_skips_secret_bearing_config_files_without_reading_values`.
- Existing redaction and private runtime directory tests remain in place.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed with
  62 Rust tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed.
- `rg -n "auth.json|credential|credentials|token|secret|cookie|cookies|oauth" apps/desktop/src-tauri/src/scanner apps/desktop/src-tauri/src/commands`:
  reviewed expected scanner skip/redaction logic, existing provider/lifecycle
  guardrails, and tests.
- `git status --short`: reviewed.

### Risks

- Some legitimate metadata stored only inside skipped secret-bearing filenames
  will no longer be used for display.
- Additional runtime-specific secret filename conventions may need to be added
  as official OpenClaw / Hermes documentation is reviewed.

### Next Step

Review official runtime config filename conventions and add only documented
safe metadata files to the scanner allowlist.

## 2026-06-03 - Phase 2 Agent/Profile Scan Read-only

### Task Goal

Implement read-only OpenClaw / Hermes agent/profile scanning and make the
Dashboard Agent/Profile Tree render from scan results for installed runtimes.

### Files Changed

- `apps/desktop/src-tauri/src/commands/agent_profiles.rs`
- `apps/desktop/src-tauri/src/commands/mod.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Added `scan_managed_agents`, a read-only Tauri command returning
  `ManagedAgent` entries for OpenClaw agents and Hermes profiles.
- OpenClaw scan candidates are limited to `~/.openclaw/agents/`,
  `~/.openclaw/workspace`, `~/.openclaw/workspace-*`, and the runtime home
  candidate already used by local detection.
- Hermes scan candidates are limited to `$HERMES_HOME` and `~/.hermes/`.
- `hermes profile list` is intentionally not called because this codebase does
  not yet have a reusable timeout-bound safe command wrapper for that output.
- Dashboard installed runtime tree now renders scanned agents/profiles instead
  of mock names.
- Installed runtimes with no scan results show an empty state instead of
  substituting mock data.
- Browser preview can still use fixture agents/profiles, but the UI labels them
  as browser fixture data.

### Boundary Confirmation

- No agent/profile create, copy, delete, or restore behavior was added.
- No OpenClaw or Hermes config writes were added.
- No install, uninstall, migration, Provider, Permission, Channel, Scheduled
  Task, gateway restart, backup, or trash implementation was added.
- No session or memory full content is read.
- No secret plaintext is serialized or displayed; scanner warnings expose
  redacted field presence only.

### Validation Performed

- Pre-flight `npm run check`: passed.
- Pre-flight `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`:
  passed.
- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed with
  60 Rust tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed.
- `git status --short`: reviewed.

### Risks

- Local OpenClaw / Hermes directory layouts may differ from the limited
  read-only candidates in this phase.
- Low-confidence directory-shape results may show incomplete agent/profile
  metadata.
- `$HERMES_HOME` availability depends on the desktop process environment.

### Next Step

Add a reviewed safe CLI command wrapper before using `hermes profile list`, or
continue with a narrow install-plan preview slice after this read-only scan is
accepted.

## 2026-06-03 - Runtime Detection Tauri Bridge Repair

### Task Goal

Repair the frontend Tauri bridge guard used by Runtime Detection so TypeScript
checks remain stable after the runtime detection slice.

### Repair Reason

`App.tsx` calls `hasTauriCommandBridge()` before invoking
`detect_runtime_install_statuses`. The helper existed in this working tree, but
the bridge check used a minimal global-property probe. This repair makes the
guard explicit and typed so future TypeScript checks do not depend on an
implicitly shaped `window` object.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `docs/engineering/dev_log.md`

### Behavior

- Tauri desktop runtime still prefers `detect_runtime_install_statuses`.
- Browser preview still uses local fallback / fixture runtime status.
- No install, uninstall, migration, Provider, permission, channel, scheduled
  task, session, memory, skill, secret migration, cloud, account, or telemetry
  behavior was added.

### Validation Performed

- Pending in this repair entry until final validation command set completes.

### Risks

- Low. The change only hardens frontend bridge detection and does not alter the
  backend runtime detection command or product behavior.

## 2026-06-03 - Phase 1 Runtime Detection Read-only

### Task Goal

Implement the minimum read-only runtime detection loop for OpenClaw and Hermes
and make the Dashboard runtime switch render installed / not installed from
real detection results instead of hard-coded mock install state.

### Files Changed

- `apps/desktop/src-tauri/src/commands/runtime_detection.rs`
- `apps/desktop/src-tauri/src/commands/mod.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Added `detect_runtime_install_statuses`, a read-only Tauri command returning
  `RuntimeInstallStatus` entries for OpenClaw and Hermes.
- OpenClaw detection checks the `openclaw` CLI in `PATH`,
  `openclaw --version`, and `~/.openclaw/`.
- Hermes detection checks the `hermes` CLI in `PATH`, `hermes --version`,
  `$HERMES_HOME`, and `~/.hermes/`.
- Returned fields include product, installed, cli path, version, home dir,
  config path, gateway status placeholder, detection confidence, and warnings.
- Dashboard now renders installed / not installed state from detection output.
- Browser-only preview keeps a local fallback and an explicit installed fixture
  query for UI validation when the Tauri command bridge is unavailable.

### Confidence Rules

- `high`: CLI exists, version was read, and home/config directory exists.
- `medium`: CLI exists, even if version or home/config is missing.
- `low`: only residual home/config directory evidence exists.
- `unknown`: no reliable CLI or home/config evidence exists.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed with
  runtime detection tests covering absent CLI/home and mocked installed states.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- Browser fallback DOM check at `http://127.0.0.1:1420/`: Dashboard rendered
  OpenClaw not installed with unknown confidence.
- Browser fixture DOM check at
  `http://127.0.0.1:1420/?agentdockRuntimeFixture=installed`: Dashboard
  rendered installed status with fixture version, home/config, and high
  confidence.

### Boundary Confirmation

- No install, uninstall, migration, Provider, permission, channel, scheduled
  task, session, memory, skill, secret migration, cloud, account, or telemetry
  behavior was implemented.
- No session or memory full content is read.
- No OpenClaw or Hermes config files are modified.
- OpenClaw and Hermes detection candidates remain runtime-specific.

### Risks

- CLI detection depends on the desktop process `PATH`; macOS GUI launches may
  expose a different `PATH` than an interactive shell.
- Gateway detection remains intentionally unimplemented and returns `None` /
  `未检查`.
- Low confidence currently means a home/config directory exists without CLI
  evidence; future install/uninstall flows must treat this as read-only residue.

### Next Step

Add a desktop-runtime UI test path or command-level fixture hook so the Tauri
Dashboard can be validated without relying on browser fallback fixtures, then
continue with an explicit install-plan preview slice.

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

## 2026-06-02 - Phase 3 P1 安全修复 + Phase 4 生命周期管理

### Phase

Phase 3 P1 安全修复 + Phase 4 - Create / Duplicate / Delete 生命周期管理。

### 产品边界

AgentDock 保持 local-only 桌面仪表盘。本轮不实现 Web UI 管理、SaaS、登录、云同步、
远程后端、遥测、账号系统、在线市场、聊天 UI、自动密钥迁移或远程桌面。

### Phase 3 P1 安全修复

修复了 Phase 3 遗留的 P1 安全问题：

1. **resolve_config_target 不再从递归 config_paths 中随便排序取第一个文件**：
   - 新增 `MAIN_CONFIG_FILE_NAMES` 常量，定义 8 个合法主配置文件名
   - 新增 `is_main_config_in_root()` 函数，验证配置文件是 agent root 的直接子文件且文件名在白名单中
   - 多个主配置文件时返回 "Ambiguous" 错误，要求用户手动选择
   - 无主配置文件时按 runtime 默认创建 config.json（OpenClaw）或 config.yaml（Hermes）

2. **禁止把 runtime root/global/container 当成可写 agent/profile**：
   - 新增 `is_runtime_root_or_container()` 函数
   - 检测 `~/.openclaw`、`~/.hermes`、`~/.openclaw/agents`、`~/.hermes/profiles`
   - 在 `resolve_config_target()` 中调用此函数，命中时直接返回错误
   - 使用 canonicalize 进行路径比较，同时保留非 canonical 路径的回退比较

3. **affectsOnlySelectedAgentProfile 不再硬编码 true**：
   - 改为 `!is_runtime_root_or_container(&agent.root_path) && target.starts_with(&agent.root_path)`
   - 由真实 scope 校验结果决定

4. **新增 4 个安全单测**：
   - `runtime_root_rejected_as_provider_model_target`
   - `nested_skill_config_not_selected_as_provider_model_target`
   - `ambiguous_main_config_files_block_provider_model_update`
   - `provider_model_target_must_be_main_config_in_root`

### Phase 4 实现

#### 后端生命周期命令（lifecycle.rs）

新增 11 个 Tauri 命令：

| 命令 | 功能 |
|------|------|
| `create_agent_plan` | 创建 OpenClaw agent 的计划 |
| `apply_create_agent` | 执行创建 agent |
| `create_profile_plan` | 创建 Hermes profile 的计划 |
| `apply_create_profile` | 执行创建 profile |
| `duplicate_agent_plan` | 复制 agent/profile 的计划 |
| `apply_duplicate_agent` | 执行复制 |
| `delete_agent_plan` | 软删除 agent 的计划 |
| `apply_delete_agent` | 执行软删除 |
| `list_trash_items` | 列出回收站条目 |
| `restore_trash_item_plan` | 恢复回收站项目的计划 |
| `apply_restore_trash_item` | 执行恢复 |

#### 创建 OpenClaw Agent

最小结构：
- agent root 目录
- config.json 主配置文件（含 name 字段）
- SOUL.md 空模板
- skills/ 空目录

不写全局 OpenClaw 配置。不自动创建 channel/token/secret。

#### 创建 Hermes Profile

最小结构：
- profile root 目录
- config.yaml 主配置文件（含 name 字段）
- SOUL.md 空模板
- skills/ 空目录

不写全局 Hermes 配置。不自动创建 channel/token/secret。

#### 复制 Agent/Profile

复制范围：
- 主配置文件
- SOUL.md / AGENTS.md / USER.md
- skills/ 文件夹中的普通文件

必须跳过：
- sessions / memory / logs / cache / history / conversations / transcripts
- credentials / tokens / .env
- channel secret / pairing state

复制前生成 preview，明确显示 included / skipped。

#### 软删除与 Trash

- 删除只移动目录到 `~/.agentdock/trash/<runtime>/<slug>/<timestamp>`，不 rm -rf
- 删除前创建 trash manifest（含 original_path、runtime、name、deleted_at）
- 恢复从 trash 移回原路径；如果原路径已存在，必须 block，不得覆盖
- Trash 页面显示 runtime、name、originalPath、trashPath、deletedAt

#### 前端 UI

- 侧边栏导航增加 Trash 入口
- Agents 面板增加 New OpenClaw Agent / New Hermes Profile / Duplicate / Delete 按钮
- 所有按钮走 plan → confirm apply 流程
- 风险面板显示 affected path / backup path / skipped private data
- 创建/复制/删除/恢复后 re-scan 并刷新 agent list
- 对 root/global/container record 禁用 destructive 和 provider/model mutation 操作

### 修改文件

- `apps/desktop/src-tauri/src/commands/lifecycle.rs` — 新增生命周期命令模块
- `apps/desktop/src-tauri/src/commands/providers.rs` — P1 安全修复
- `apps/desktop/src-tauri/src/commands/mod.rs` — 添加 lifecycle 模块
- `apps/desktop/src-tauri/src/lib.rs` — 注册 11 个新命令
- `apps/desktop/src/app/App.tsx` — 前端生命周期 UI
- `apps/desktop/src/app/styles.css` — 新增生命周期样式
- `docs/engineering/dev_log.md` — 开发日志

### 隐私边界

- 前端不发送任意文件路径进行生命周期操作
- 后端从索引 agent 元数据推导目标路径
- 目标路径必须在 agent/profile root 内；symlink 逃逸被拒绝
- Session、memory、history、transcript、log、env、token、secret、credential 文件不可通过生命周期命令读写
- Provider/channel secret 字段继续只显示脱敏标记
- 不写全局 OpenClaw/Hermes 配置
- 不自动创建 channel/token/secret
- 无网络请求、遥测、登录、云同步、聊天 UI、Provider 管理器、Model 管理器、Skill 管理器、Channel 管理器、迁移、市场或 SaaS 后端

### 后端新增单测

- `validate_agent_name_rejects_empty`
- `validate_agent_name_rejects_dot_prefix`
- `validate_agent_name_rejects_path_separators`
- `validate_agent_name_accepts_valid`
- `is_private_data_dir_detects_sessions`
- `is_private_data_file_detects_env`
- `create_agent_plan_succeeds_for_new_path`
- `create_agent_plan_blocks_if_target_exists`
- `create_profile_plan_succeeds_for_new_path`
- `delete_agent_plan_blocks_runtime_root`
- `trash_manifest_round_trip`
- `compute_plan_hash_is_deterministic`
- `collect_duplicate_items_skips_private_dirs_and_files`
- `runtime_root_rejected_as_provider_model_target`
- `nested_skill_config_not_selected_as_provider_model_target`
- `ambiguous_main_config_files_block_provider_model_update`
- `provider_model_target_must_be_main_config_in_root`

### 测试结果

- `npm run check`：通过
- `npm run build`：通过（31 modules, 232.42 kB JS + 10.19 kB CSS）
- `cargo test`：52 个测试全部通过
- `cargo check`：通过
- `git diff --check`：通过
- 隐私网络审计通过：无 fetch/XMLHttpRequest/sendBeacon/WebSocket 命中

### 真实 Hermes/OpenClaw 触碰状态

- 真实 `~/.hermes`、`~/.openclaw`、workspace、provider config、channel config、
  global config、tokens、pairing state、sessions、memory、logs、transcript 路径未被触碰
- 未创建真实测试 agent/profile

### 已知风险

- 前端仍无专用自动化 Tauri UI 测试框架；命令行为由 Rust 测试覆盖，渲染浏览器冒烟为静态
- 创建 agent/profile 默认路径为 `~/.openclaw/agents/<name>` 和
  `~/.hermes/profiles/<name>`；sandbox 测试需手动指定 target_root
- 选中文件夹扫描仍使用文本路径输入而非原生文件夹选择器
- 恢复操作如果原路径已存在则 block，但不提供自动重命名选项

### 下一步建议

- 添加原生文件夹选择器支持
- 添加桌面运行时 UI 测试框架
- 在迁移或 skill/channel 变更阶段前扩展真实 OpenClaw/Hermes provider schema fixtures
- 考虑恢复时提供重命名选项而非直接 block

## 2026-06-03 - 001 Frontend v0.3 Shell Read-Only

### Task Goal

Implement the first safe vertical rebuild slice:
`001-frontend-v03-shell-readonly`.

This round realigns the visible desktop frontend with the local v0.3 product
mind while keeping the change frontend-only and read-only.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Replaced the visible phase-era scanner/admin shell with a v0.3 read-only
  shell.
- Left Dock now exposes only `Dashboard`, `Migration`, and `Settings`.
- Added local placeholder controls for language and theme.
- Added Dashboard runtime switcher for `OpenClaw` and `Hermes` without invoking
  scans or backend commands.
- Added read-only placeholders for not-installed status, installed status,
  agent/profile tree, and right-side operation pane.
- Added operation node placeholders for Basic, Provider, Personality, Sessions,
  Memories, Skills, Permissions, Channels, and Scheduled Tasks.
- Added Migration placeholder with explicit preview and no-secret-migration
  framing.
- Added Settings placeholder with local-first privacy framing.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed,
  52 tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `rg -n "scan_default_candidates|scan_fixture_roots|scan_selected_root|apply_create_agent|apply_create_profile|apply_duplicate_agent|apply_delete_agent|apply_model_provider_update|apply_personality_update|restore_personality_backup|apply_restore_trash_item" apps/desktop/src/app/App.tsx || true`: no output.

### Result

The visible app shell is now aligned to the v0.3 first-screen structure and no
longer exposes old top-level Scan, Agents, or Trash flows. Opening the frontend
does not invoke scanner, provider, lifecycle, personality, backup, trash, or
migration commands.

### Risks

- This slice intentionally hides the old scanner/admin UI, but the backend
  command modules still exist for later audit or replacement.
- The new dashboard is placeholder-only and does not yet show real install
  status, runtime confidence, provider, permissions, scheduled tasks, channels,
  sessions, memories, or skills metadata.
- No manual desktop visual QA has been performed in this round.

### Next Step

Plan the next vertical slice: either split the frontend scaffold into stable
route/component boundaries or add a read-only backend view model for runtime
install status without scanning real OpenClaw/Hermes home directories.

## 2026-06-03 - 002 Frontend UI Contract Alignment

### Task Goal

Implement `002-frontend-ui-contract-alignment` to bring the read-only frontend
scaffold closer to `docs/product/AgentDock_UI_UX_redesign.md`.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Replaced top-right segmented controls with two button-style controls:
  `中 / EN` and `白天 / 深夜`.
- Changed operation labels to Chinese-first labels exactly matching the UI
  contract.
- Added mock OpenClaw agents: `main`, `consulting-agent`, `dev-agent`.
- Added mock Hermes profiles: `default`, `consulting`, `auto-business`.
- Changed installed Dashboard to a compact runtime status strip followed by a
  two-column management layout.
- Nested operation nodes under each mock agent/profile accordion item.
- Removed the global operation function list from the visible UI.
- Added `+ Add Agent` / `+ Add Profile` placeholders at the bottom of the
  accordion tree.
- Made OperationPane update from selected runtime, selected agent/profile, and
  selected operation.
- Changed not-installed Dashboard to show only the not-installed panel, install
  placeholder, and command preview placeholder.
- Reworked Migration into a full-width three-column workspace:
  OpenClaw agents, controls, Hermes profiles.
- Reworked Settings into a full-width modular settings page with App data
  directory, Sync, Backup/Trash, Updates, Logs, Language, Theme, and Footer
  links.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed,
  52 tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `rg -n "@tauri-apps/api/core|invoke\\(" apps/desktop/src/app/App.tsx`: no output.
- `rg -n "scan_default_candidates|scan_fixture_roots|scan_selected_root|apply_create_agent|apply_create_profile|apply_duplicate_agent|apply_delete_agent|apply_model_provider_update|apply_personality_update|restore_personality_backup|apply_restore_trash_item" apps/desktop/src/app/App.tsx`: no output.
- `rg -n "fetch|XMLHttpRequest|sendBeacon|WebSocket|telemetry|analytics|login|cloud|upload" apps/desktop/src apps/desktop/src-tauri/src`: one existing backend string about ComfyUI not uploading files during scan; no new frontend network behavior.
- `git diff --stat`: two frontend files changed before this log entry.
- `git status --short`: two frontend files modified before this log entry.

### Result

The frontend now follows the requested UI contract more closely: Chinese-first
operation labels, multiple mock agents/profiles, accordion-scoped operations,
no global function list, full-width Migration columns, and full-width Settings
modules.

### Risks

- All runtime, agent/profile, migration, and settings data is still mock data.
- No real runtime install status or backend view model exists yet.
- No manual desktop visual QA was performed in this round.
- Backend command modules from earlier phases still exist but are not invoked
  by the visible frontend shell.

### Next Step

After UI acceptance, either split the frontend scaffold into stable components
or add a read-only runtime status view model without scanning real
OpenClaw/Hermes home directories.

## 2026-06-03 - 003 Frontend Layout Density And Surface Refinement

### Task Goal

Implement `003-frontend-layout-density-and-surface-refinement` to make the
002 read-only shell feel like a focused local desktop manager instead of a
demo-like card dashboard.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Kept the Dashboard runtime status strip and agent/profile accordion tree.
- Refined the installed Dashboard lower area into one connected management
  workspace with a shared surface and light separator between the tree and
  OperationPane.
- Removed the large forced management min-height and reduced nested boxed
  surfaces in the tree, metadata, and safety rows.
- Moved the Migration preview requirement to a page-level notice directly under
  the Migration page title area.
- Kept Migration as three columns while making OpenClaw and Hermes columns
  dominant and replacing the two large direction buttons with one compact
  direction placeholder.
- Removed `Footer links` from the Settings module data and rendered GitHub,
  Buy me a coffee, Version, Updates, and Privacy as footer content.
- Changed Settings modules from independent cards into grouped rows in a
  continuous settings workspace.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed,
  52 tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `rg -n "@tauri-apps/api/core|invoke\\(" apps/desktop/src/app/App.tsx`: no output.
- `rg -n "scan_default_candidates|scan_fixture_roots|scan_selected_root|apply_create_agent|apply_create_profile|apply_duplicate_agent|apply_delete_agent|apply_model_provider_update|apply_personality_update|restore_personality_backup|apply_restore_trash_item" apps/desktop/src/app/App.tsx`: no output.
- `git diff --name-only`: only `apps/desktop/src/app/App.tsx` and
  `apps/desktop/src/app/styles.css` before this log entry.

### Result

The visible frontend remains read-only and mock-data-only, but the Dashboard,
Migration, and Settings surfaces now use lighter separators, tighter spacing,
and grouped desktop-app structure instead of large independent cards.
Rust/Tauri files were unchanged.

### Risks

- This is still a visual-only refinement backed by mock runtime data.
- No manual desktop visual QA has been performed in this round.
- The current frontend remains in one file and may need component extraction
  after the UI contract stabilizes.

### Next Step

Either run a manual desktop visual pass for density/responsiveness or start the
first read-only runtime status view-model slice without scanning real
OpenClaw/Hermes home directories.

## 2026-06-03 - 003 UI Hard Fix Follow-Up

### Task Goal

Fix the remaining `003-frontend-layout-density-and-surface-refinement` issues
without redesigning the shell: remove lingering empty-space/card-like patterns,
make Migration center controls a single compact button, and move Settings
footer links outside the settings workspace.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Removed the Migration center-column explanatory paragraph so the center column
  renders only one compact direction button.
- Kept `保存前必须预览` as the page-level Migration notice under the page title
  area.
- Moved Settings footer links outside `.settingsWorkspace` into a separate
  page-level footer.
- Kept `.settingsWorkspace` limited to the seven required settings rows:
  App data directory, Sync, Backup/Trash, Updates, Logs, Language, and Theme.
- Reworked the Settings footer as small, weak-color page footer text separated
  from the settings row group.
- Further reduced Dashboard OperationPane module-card feeling by changing the
  read-only safety area from filled blocks into lightweight inspector rows.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed,
  52 tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `rg -n "@tauri-apps/api/core|invoke\\(" apps/desktop/src/app/App.tsx || true`:
  no output.
- `rg -n "scan_default_candidates|scan_fixture_roots|scan_selected_root|apply_create_agent|apply_create_profile|apply_duplicate_agent|apply_delete_agent|apply_model_provider_update|apply_personality_update|restore_personality_backup|apply_restore_trash_item" apps/desktop/src/app/App.tsx || true`:
  no output.
- `git diff --stat`: only frontend files before this log entry.

### Result

The hard fixes are frontend-only. No Rust/Tauri files changed, no backend
command references were added, and no `invoke` usage was introduced.

### Risks

- No manual visual QA was performed in the running desktop app.
- The shell still uses read-only mock data and a single-file frontend
  implementation.

### Next Step

Run a manual visual pass for Dashboard, Migration, and Settings at desktop and
small widths before starting the next implementation slice.

## 2026-06-03 - 003 Screenshot Feedback Hard Fix

### Task Goal

Address the screenshot feedback for the 003 UI refinement without introducing
new behavior: remove the Dashboard management shell/card feeling, make the
Migration center control a narrow symbol-only switch, and place Settings footer
links at the page bottom.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Removed the visual outer container treatment from `.managementLayout` and
  stopped the Dashboard grid from stretching panels into a large empty shell.
- Kept Dashboard tree and OperationPane connected through a simple divider,
  without making them separate large cards.
- Changed the Migration center button label from product names to the compact
  `⇄` symbol, with the direction text only in `aria-label`/`title`.
- Reduced the Migration center column to a narrow fixed column so the side
  OpenClaw/Hermes columns remain dominant.
- Changed Settings page layout so the footer sits at the bottom of the page
  outside `.settingsWorkspace`.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed,
  52 tests.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: passed.
- `rg -n "min-height:\\s*[5-9][0-9]{2}|height:\\s*[5-9][0-9]{2}|OpenClaw ⇄ Hermes|选择两侧条目|当前仅为布局占位|migrationControls p|Footer links" apps/desktop/src/app/App.tsx apps/desktop/src/app/styles.css || true`:
  no output.
- `rg -n "@tauri-apps/api/core|invoke\\(" apps/desktop/src/app/App.tsx || true`:
  no output.
- `rg -n "scan_default_candidates|scan_fixture_roots|scan_selected_root|apply_create_agent|apply_create_profile|apply_duplicate_agent|apply_delete_agent|apply_model_provider_update|apply_personality_update|restore_personality_backup|apply_restore_trash_item" apps/desktop/src/app/App.tsx || true`:
  no output.

### Result

The screenshot-specific fixes are frontend-only. No Rust/Tauri files changed,
no backend command references were added, and no `invoke` usage was introduced.

### Risks

- Manual visual QA should still confirm the exact desktop viewport shown in the
  screenshot.
- Settings uses page-level height only to pin the footer to the bottom; the
  settings workspace itself remains natural height.

### Next Step

Run the desktop app visually and confirm Dashboard, Migration, and Settings
against the screenshot feedback before starting another feature slice.

## 2026-06-03 - Dashboard Add Agent Button Placement

### Task Goal

Move the Dashboard add agent/profile action to the top of the agent/profile
tree so it remains visible when the list grows.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Moved the disabled `+ Add Agent` / `+ Add Profile` placeholder from below the
  accordion tree to directly under the tree header.
- Adjusted spacing so the add action belongs to the tree controls before the
  scroll-prone list content.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `rg -n "@tauri-apps/api/core|invoke\\(" apps/desktop/src/app/App.tsx || true`:
  no output.
- `rg -n "scan_default_candidates|scan_fixture_roots|scan_selected_root|apply_create_agent|apply_create_profile|apply_duplicate_agent|apply_delete_agent|apply_model_provider_update|apply_personality_update|restore_personality_backup|apply_restore_trash_item" apps/desktop/src/app/App.tsx || true`:
  no output.

### Result

Frontend-only placement adjustment. No runtime behavior, backend command,
mock-data, or Chinese operation label changes.

### Risks

- Manual visual QA should confirm the button remains visually light enough at
  the top of long lists.

### Next Step

Run the frontend validation commands and inspect the Dashboard tree in the app.

## 2026-06-03 - Top Control Icon Buttons

### Task Goal

Replace the visible language/theme text controls with icon-only buttons while
preserving the existing read-only shell behavior.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Replaced `中 / EN` visible text with an inline language SVG icon.
- Replaced `白天` / `深夜` visible text with inline sun/moon SVG icons.
- Kept `aria-label` and `title` text for accessibility and hover context.
- Added compact icon-button sizing without adding dependencies.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `rg -n "@tauri-apps/api/core|invoke\\(" apps/desktop/src/app/App.tsx || true`:
  no output.
- `rg -n "scan_default_candidates|scan_fixture_roots|scan_selected_root|apply_create_agent|apply_create_profile|apply_duplicate_agent|apply_delete_agent|apply_model_provider_update|apply_personality_update|restore_personality_backup|apply_restore_trash_item" apps/desktop/src/app/App.tsx || true`:
  no output.

### Result

Frontend-only visual control update. No backend, routing, dependency, mock-data,
or runtime behavior changes.

### Risks

- Manual visual QA should confirm the language icon reads clearly at the final
  desktop size.

### Next Step

Run validation and inspect the top-right controls in the app.

## 2026-06-03 - Language Button State Text Fix

### Task Goal

Fix the top-right language control so it shows the current language state as
`中` or `EN` instead of an abstract language icon.

### Files Changed

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/styles.css`
- `docs/engineering/dev_log.md`

### Implemented

- Added local `language` UI state for the placeholder language toggle.
- Changed the language button visible content to `中` for Chinese and `EN` for
  English.
- Kept the theme control as an icon-only button.
- Added a stable text-button style for the compact language control.

### Validation Performed

- `npm run check`: passed.
- `npm run build`: passed.
- `rg -n "@tauri-apps/api/core|invoke\\(" apps/desktop/src/app/App.tsx || true`:
  no output.
- `rg -n "scan_default_candidates|scan_fixture_roots|scan_selected_root|apply_create_agent|apply_create_profile|apply_duplicate_agent|apply_delete_agent|apply_model_provider_update|apply_personality_update|restore_personality_backup|apply_restore_trash_item" apps/desktop/src/app/App.tsx || true`:
  no output.

### Result

Frontend-only top-control correction. No backend, dependency, route, mock-data,
or runtime behavior changes.

### Risks

- Language switching remains UI placeholder state only and does not translate
  the application yet.

### Next Step

Run validation and visually confirm the language button state text.
