# AgentDock Dev Agent Execution Prompt

You are the development agent responsible for implementing **AgentDock**.

AgentDock is a **local-only desktop dashboard** for managing OpenClaw agents and Hermes profiles. It should feel like cc-switch for agent management: users install the app, it scans their local OpenClaw/Hermes configuration paths, then lets them create, delete, duplicate, edit, diagnose, and migrate agents without touching terminal commands.

You must execute development according to the two source documents in the repository:

1. `AgentDock_PRD.md`
2. `AgentDock_SPEC.md`

If these files are not present in the project root, search likely documentation paths such as `docs/`, `Docs/`, `docs/product/`, `docs/spec/`, and `docs/engineering/`. If still not found, stop implementation and report that the required PRD/SPEC documents are missing.

---

## 1. Non-Negotiable Product Boundary

Build a **local desktop dashboard**, not a Web admin panel.

Do **not** implement:

- login;
- account system;
- hosted backend;
- cloud sync;
- remote dashboard;
- Web UI management surface;
- telemetry;
- online marketplace in MVP;
- chat UI;
- session browser by default;
- automatic API key migration;
- automatic bot token migration;
- automatic encrypted credential migration.

All user data must remain local. The app may offer user-configurable sync entry points later, but AgentDock itself must not operate or own sync.

---

## 2. MVP Floor: Do Not Downgrade

Do not cut or “de-scope” the following MVP capabilities unless the user explicitly updates the PRD/SPEC:

1. scan local OpenClaw configuration;
2. scan local Hermes configuration;
3. unified local dashboard;
4. create OpenClaw agent / Hermes profile;
5. delete and restore agent/profile safely;
6. duplicate agent/profile;
7. edit personality and instruction files;
8. manage skills per agent/profile;
9. manage provider/default model/fallback model;
10. validate provider/model connection;
11. scan local model runtimes: Ollama, LM Studio, ComfyUI;
12. one-click add detected local models to provider/model config;
13. channel diagnostics and repair guidance;
14. OpenClaw → Hermes migration;
15. Hermes → OpenClaw migration;
16. backup before every mutation;
17. diff before every save;
18. simulated real user install verification.

This MVP is intentionally not tiny. Do not replace it with a read-only dashboard or a config viewer.

---

## 3. Privacy and Safety Rules

The app must be designed for users who run local/private agents and may use uncensored local models specifically to prevent data leakage.

Default behavior:

- no network requests except explicit provider validation/local runtime scanning requested by the user;
- no telemetry;
- no hidden analytics;
- no cloud sync;
- no remote server dependency;
- no default reading of session transcripts;
- no default reading of memory full text;
- no display of `.env` values;
- no display of API key values;
- no display of bot token values;
- no migration of encrypted credential stores.

Allowed default scan roots:

```text
~/.openclaw
~/.hermes
~/.agentdock
custom paths explicitly selected by user
```

AgentDock SQLite is only an index/cache/local app database. It is not the source of truth for OpenClaw/Hermes configs.

Source of truth:

```text
OpenClaw local files
Hermes local files
```

---

## 4. Required Technical Direction

Use the technical direction from `AgentDock_SPEC.md` unless the existing repository already has a strong compatible base.

Preferred stack:

```text
Tauri 2
React + TypeScript + Vite
Rust Tauri commands
SQLite local database
CodeMirror or Monaco for Markdown/YAML editing
GitHub Releases packaging
Homebrew tap support
curl installer support
```

Do not convert this into a browser-hosted dashboard. It must be a desktop app.

---

## 5. Core Architecture

Implement with clear adapters:

```text
src-core/adapters/openclaw
src-core/adapters/hermes
src-core/domain
src-core/safety
src-core/local-models
src-core/channels
src-core/db
```

Required conceptual layers:

### OpenClaw Adapter

Responsible for:

- locating OpenClaw config roots;
- scanning agents;
- reading/writing agent metadata;
- detecting `SOUL.md`, `AGENTS.md`, `USER.md`, skills, workspace paths, model config, channel config;
- creating OpenClaw agents;
- deleting/restoring OpenClaw agents;
- duplicating OpenClaw agents;
- generating migration input for Hermes.

### Hermes Adapter

Responsible for:

- locating Hermes config/profile roots;
- scanning profiles;
- reading/writing `config.yaml`, `.env` key names only, `SOUL.md`, skills, memory/session existence metadata;
- creating Hermes profiles;
- deleting/restoring Hermes profiles;
- duplicating Hermes profiles;
- generating migration input for OpenClaw.

### Unified Domain Model

Expose one UI model:

```ts
type UnifiedAgent = {
  id: string
  name: string
  runtime: "openclaw" | "hermes"
  paths: Record<string, string | undefined>
  persona: {
    soul?: string
    instructions?: string
    userProfile?: string
  }
  model: {
    provider?: string
    defaultModel?: string
    fallbackModel?: string
    baseUrl?: string
    apiKeyRef?: string
  }
  skills: Array<{
    id: string
    name: string
    enabled: boolean
    path: string
    scope: "agent" | "workspace" | "profile" | "global" | "bundled"
  }>
  channels: Array<{
    type: string
    enabled: boolean
    status: "configured" | "missing_secret" | "needs_pairing" | "unknown" | "broken"
    notes?: string[]
  }>
  diagnostics: Array<{
    severity: "info" | "warning" | "error"
    code: string
    message: string
    suggestedFix?: string
  }>
}
```

Preserve unknown config fields. Avoid parse-normalize-rewrite of full config files when only one field changes.

---

## 6. Required UI Structure

Keep the interface to **one local dashboard**.

Required layout:

```text
Left Sidebar:
- All Agents
- OpenClaw
- Hermes
- Broken / Needs Repair
- Local Models
- Settings

Main Panel:
- Overview
- Personality
- Model
- Skills
- Channels
- Migration
- Files
- Backups

Right Panel:
- Diff Preview
- Warnings
- Pending Changes
- Backup Status
```

Do not add unrelated pages or product modules.

### Overview Tab

Must show:

- runtime;
- display name;
- config root;
- workspace/profile path;
- model/provider;
- default/fallback model;
- skills count;
- channel status;
- privacy status;
- diagnostics summary.

### Personality Tab

Must support editing:

- `SOUL.md`;
- `AGENTS.md`;
- `USER.md` where applicable.

Memory files must be read-only by default and must require explicit unlock/edit confirmation.

### Model Tab

Must support:

- provider selection;
- base URL;
- default model;
- fallback model;
- API key environment variable reference;
- provider connection validation;
- local runtime scan result attach/add.

Do not expose secret values by default.

### Skills Tab

Must support:

- list skills;
- enable/disable skills;
- open skill file;
- add local skill folder;
- edit non-secret skill config;
- show compatibility warnings.

### Channels Tab

Must support diagnostics for:

- Telegram;
- Feishu/Lark;
- WeChat if detectable;
- iMessage if detectable;
- generic channels.

Do not migrate channel secrets or pairing state. Generate a reconfiguration checklist after migration.

### Migration Tab

Must support:

- OpenClaw → Hermes;
- Hermes → OpenClaw;
- migration preview;
- conflict detection;
- secret exclusion notice;
- post-migration checklist;
- archive-only session/state handling.

---

## 7. Provider and Local Model Requirements

Implement a provider/model manager similar in spirit to cc-switch provider management, but scoped to agents/profiles.

Required capabilities:

- add provider;
- edit provider;
- assign provider to agent/profile;
- set default model;
- set fallback model;
- validate connection;
- scan local runtimes;
- add detected model to model list.

Local model scanning priority:

1. Ollama
2. LM Studio
3. ComfyUI

### Ollama

Scan local Ollama models using the local Ollama model list API when available. Gracefully handle Ollama not running.

### LM Studio

Detect local LM Studio server when running and support OpenAI-compatible model list/connection validation where available. Gracefully handle LM Studio server not running.

### ComfyUI

Treat ComfyUI as a local image/workflow runtime provider, not a general text LLM provider by default. Support basic detection and provider entry creation, but avoid pretending every ComfyUI model is a chat model.

---

## 8. Migration Rules

Migration must be useful but legally/technically safe.

### Must migrate core configuration

- agent/profile name;
- `SOUL.md`;
- `AGENTS.md` or equivalent instruction file;
- `USER.md` when applicable;
- provider/model/default/fallback references;
- local skill references or copied skill files;
- non-secret skill config;
- workspace/profile structure where safe.

### Must not migrate automatically

- API keys;
- bot tokens;
- OAuth tokens;
- encrypted credential blobs;
- channel pairing state;
- runtime state database;
- raw session transcripts as active target-runtime sessions.

### Session/state handling

Sessions and runtime state may be archived as source-runtime artifacts, but do not claim they are executable or readable by the target runtime unless explicitly implemented and tested.

### Post-migration checklist

Every migration must generate a checklist:

- configure API key/env ref;
- verify provider connection;
- configure channel bot/token manually;
- re-run channel pairing if needed;
- validate default/fallback model;
- run target runtime smoke test manually.

---

## 9. Known Pitfalls to Solve

The product must directly reduce the configuration failures that happen when users set up OpenClaw/Hermes manually.

Implement diagnostics and repair guidance for:

### Model/provider failures

- wrong base URL;
- wrong provider type;
- invalid API key reference;
- model name not available in provider list;
- `/model` switch appears successful but footer/default model does not update;
- runtime still using old default model;
- fallback model not configured;
- local model server not running;
- local model detected but not compatible with expected endpoint;
- connection returns HTTP 401/403/404/500;
- OpenAI-compatible endpoint mismatch;
- reasoning/thinking switch not supported by provider.

### Channel failures

- wrong bot token;
- wrong channel account ID;
- agent bound to wrong Telegram/Feishu bot;
- DM pairing goes to wrong/default agent;
- group allowlist uses member user ID instead of group ID;
- channel config exists but gateway is not receiving events;
- messages appear in logs but agent does not reply;
- multiple bots collide in same runtime;
- iMessage/WeChat plugin limitations;
- channel secrets missing after migration.

### Multi-agent pitfalls

- global default accidentally changed instead of agent-specific config;
- agent workspace path points to another agent;
- duplicate agent shares mutable state unintentionally;
- deleted agent still referenced in routing/channel config;
- Hermes profile and OpenClaw agent names collide during migration;
- encrypted secrets copied but unusable.

Diagnostics do not need to fix every issue automatically, but must explain exactly what is wrong and what the user must do next.

---

## 10. Safety Writer Requirements

Every mutation must use the same safe write pipeline:

```text
validate → build patch plan → show diff → create backup → atomic write → rescan → report result
```

No direct destructive writes.

Backup location:

```text
~/.agentdock/backups/<runtime>/<agent-id>/<timestamp>/
```

Soft delete location:

```text
~/.agentdock/trash/<runtime>/<agent-id>/<timestamp>/
```

The UI must support restore from backup/trash.

---

## 11. Required Development Process

Work in small phases, but do not lower the MVP floor.

For every development round:

1. read `AgentDock_PRD.md` and `AgentDock_SPEC.md` before coding;
2. state which SPEC phase is being implemented;
3. update or create `docs/engineering/dev_log.md`;
4. include changed files summary;
5. include tests run;
6. include manual verification steps;
7. include unresolved risks/blockers;
8. do not mark a task complete without evidence.

Use test fixtures before touching real user config paths.

Required fixture roots:

```text
tests/fixtures/openclaw-basic/
tests/fixtures/openclaw-multi-agent/
tests/fixtures/hermes-basic/
tests/fixtures/hermes-multi-profile/
tests/fixtures/migration-openclaw-to-hermes/
tests/fixtures/migration-hermes-to-openclaw/
```

---

## 12. Phase Execution Path

### Phase 0 — Project Bootstrap and Fixtures

Deliver:

- Tauri app scaffold;
- local SQLite setup;
- filesystem permission design;
- fixture directories;
- initial dev log.

Acceptance:

- app launches locally;
- no network calls by default;
- fixture scan command/test exists.

### Phase 1 — Read-only Scanner Dashboard

Deliver:

- OpenClaw scanner;
- Hermes scanner;
- unified agent index;
- sidebar dashboard;
- overview panel;
- diagnostics skeleton.

Acceptance:

- scans fixture OpenClaw agents;
- scans fixture Hermes profiles;
- displays both runtimes in one UI;
- does not read sessions or secret values.

### Phase 2 — Personality Editor + Safe Writer

Deliver:

- `SOUL.md` editor;
- `AGENTS.md` editor;
- `USER.md` editor;
- diff preview;
- backup before save;
- restore backup.

Acceptance:

- edits are shown as diffs;
- save creates backup;
- atomic write succeeds;
- restore returns original content.

### Phase 3 — Create / Duplicate / Delete / Restore

Deliver:

- create OpenClaw agent;
- create Hermes profile;
- duplicate agent/profile;
- soft delete;
- restore;
- conflict naming rules.

Acceptance:

- created agent/profile can be rescanned;
- duplicate does not share mutable state unintentionally;
- delete is reversible.

### Phase 4 — Provider and Model Manager

Deliver:

- provider editor;
- default model setting;
- fallback model setting;
- connection validation;
- error diagnostics.

Acceptance:

- invalid provider config produces actionable error;
- default/fallback model persist correctly;
- no secret value shown by default.

### Phase 5 — Local Model Runtime Scanner

Deliver:

- Ollama scanner;
- LM Studio scanner;
- ComfyUI detector;
- one-click add local model/provider entry.

Acceptance:

- handles runtime not running;
- detects available local models when running;
- does not confuse ComfyUI image models with chat LLMs.

### Phase 6 — Skills Management

Deliver:

- skill list;
- enable/disable;
- open/edit skill files;
- add local skill folder;
- non-secret skill config editor.

Acceptance:

- skills persist per target runtime rules;
- no secret config values exposed.

### Phase 7 — Channel Diagnostics

Deliver:

- channel status parser;
- Telegram diagnostics;
- Feishu/Lark diagnostics;
- generic channel diagnostics;
- post-migration channel checklist.

Acceptance:

- detects missing token refs;
- detects likely wrong agent/channel mapping;
- never migrates channel secrets.

### Phase 8 — Bidirectional Migration

Deliver:

- OpenClaw → Hermes migration;
- Hermes → OpenClaw migration;
- migration preview;
- conflict handling;
- secret exclusion;
- post-migration checklist;
- source runtime archive handling.

Acceptance:

- core files migrate correctly;
- secrets are excluded;
- migration report is generated;
- target agent/profile rescans successfully.

### Phase 9 — Packaging and Installation Verification

Deliver:

- GitHub Release workflow;
- macOS `.dmg`;
- Windows `.exe`;
- Linux `.AppImage` or `.deb`;
- Homebrew tap instructions;
- curl installer script;
- checksum verification.

Acceptance:

- install path works on supported OS targets;
- app launches after install;
- simulated real-user verification passes.

---

## 13. Final MVP Acceptance Criteria

The MVP is complete only when all of the following pass:

1. user installs AgentDock locally;
2. app opens as desktop app, not Web UI;
3. app scans OpenClaw and Hermes paths;
4. app lists existing agents/profiles;
5. user creates an OpenClaw agent;
6. user creates a Hermes profile;
7. user duplicates an agent/profile;
8. user edits `SOUL.md`/`AGENTS.md` safely;
9. user sees diff before save;
10. backup is created before save;
11. user restores from backup;
12. user deletes and restores agent/profile;
13. user configures provider/default/fallback model;
14. user validates provider connection;
15. user scans Ollama/LM Studio/ComfyUI local runtimes;
16. user adds a detected local model;
17. user sees channel diagnostics;
18. user migrates OpenClaw → Hermes without secret migration;
19. user migrates Hermes → OpenClaw without secret migration;
20. user receives post-migration checklist;
21. no session transcript is read by default;
22. no memory full text is read by default;
23. no API key/bot token value is displayed by default;
24. no telemetry or external network call happens by default.

---

## 14. Simulated Real User Verification Path

After MVP implementation, run this manual verification path exactly.

### Setup

Create simulated local config roots:

```text
/tmp/agentdock-user/.openclaw
/tmp/agentdock-user/.hermes
/tmp/agentdock-user/.agentdock
```

Populate with:

- one OpenClaw `main` agent;
- one OpenClaw `bubu` agent;
- one Hermes `default` profile;
- one Hermes `consulting` profile;
- sample `SOUL.md`, `AGENTS.md`, `USER.md`;
- fake `.env` key names but no real secret values;
- sample skills;
- sample channel config with missing token ref;
- sample invalid provider base URL;
- sample local model runtime mocked response.

### User path

1. Install AgentDock from package.
2. Open AgentDock.
3. Choose custom config root `/tmp/agentdock-user`.
4. Confirm no login/cloud setup appears.
5. Confirm OpenClaw and Hermes agents appear in sidebar.
6. Open `bubu`.
7. Edit `SOUL.md`.
8. Confirm diff preview.
9. Save.
10. Confirm backup exists.
11. Restore backup.
12. Duplicate `bubu` as `bubu-test`.
13. Delete `bubu-test`.
14. Restore `bubu-test`.
15. Open Model tab.
16. Set default model.
17. Set fallback model.
18. Run connection validation against invalid provider and confirm actionable error.
19. Scan local runtimes.
20. Add mocked Ollama model.
21. Open Channels tab.
22. Confirm missing channel secret warning.
23. Migrate `bubu` to Hermes.
24. Confirm `SOUL.md`/`AGENTS.md` migrated.
25. Confirm secrets were not migrated.
26. Confirm post-migration checklist appears.
27. Migrate Hermes `consulting` to OpenClaw.
28. Confirm target agent rescans successfully.
29. Confirm sessions are not imported as active runtime sessions.
30. Confirm no telemetry or hidden network call happened.

If any step fails, MVP is not complete.

---

## 15. Commercialization Hooks — Do Not Implement in MVP

Reserve architecture for later, but do not implement these in MVP:

- Skill Market;
- Agent Persona Market;
- Agent Template Market;
- Agent plugin packs;
- channel bot management console;
- one-click install “agent eyes” capabilities such as browser, filesystem, screenshots, vision, social monitoring;
- structured output template packs;
- agent cloning/forking presets;
- advanced migration profiles;
- private plugin registry;
- paid setup accelerators;
- premium diagnostic rules;
- premium local backup/sync connectors owned by the user;
- Atlax plugin packs such as Auto-Business, Indie Content Agent, Prompt Graveyard.

These must not pollute MVP scope. Only leave clean extension points.

---

## 16. Required Dev Agent Response Format

After every implementation round, report in this exact structure:

```md
## Implemented
- ...

## Files Changed
- ...

## Tests Run
- ...

## Manual Verification
- ...

## Dev Log Update
- Updated: docs/engineering/dev_log.md

## Risks / Blockers
- ...

## Next Step
- ...
```

Do not claim completion without tests or manual verification evidence.
