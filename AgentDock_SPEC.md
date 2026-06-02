# AgentDock SPEC

> Working name: **AgentDock**  
> Document type: executable development SPEC  
> Target: dev agent implementation  
> Goal: build a local-only cc-switch-like dashboard for OpenClaw / Hermes agent management  
> Non-negotiable MVP: scan, create, delete, duplicate, edit personality/skills, provider/model manager, local model scanner, channel diagnostics, OpenClaw ↔ Hermes migration, safe backup/diff, local-only privacy.  

---

## 0. Hard Rules for Dev Agent

Do not deviate from these rules.

### 0.1 Product boundary

Build a **local desktop dashboard**, not a Web admin panel.

Do not implement:

- login;
- cloud sync;
- hosted backend;
- remote dashboard;
- telemetry;
- account system;
- online marketplace;
- chat UI;
- session browser by default;
- automatic secret migration.

### 0.2 Data boundary

Source of truth:

```text
OpenClaw / Hermes local files
```

AgentDock database:

```text
local SQLite index/cache only
```

Never treat AgentDock SQLite as the only source of truth for OpenClaw/Hermes configuration.

### 0.3 Privacy boundary

Do not read or display by default:

- session transcripts;
- memory full text;
- `.env` values;
- API key values;
- bot token values;
- encrypted credential blobs;
- browser profiles;
- unrelated user files.

Only scan explicitly allowed directories:

```text
~/.openclaw
~/.hermes
~/.agentdock
custom paths selected by user
```

### 0.4 Secret migration boundary

Do not migrate API keys, bot tokens, OAuth tokens, channel pairing state, or encrypted credential stores.

Migration must create a **reconfiguration checklist** instead.

### 0.5 MVP floor

Do not cut the following MVP capabilities:

- local scan for both OpenClaw and Hermes;
- unified dashboard;
- create agent/profile;
- delete/restore agent/profile;
- duplicate agent/profile;
- edit personality/instruction files;
- skill management;
- provider/default/fallback model manager;
- provider connection validation;
- local runtime scanner for Ollama / LM Studio / ComfyUI;
- channel diagnostics;
- OpenClaw → Hermes migration;
- Hermes → OpenClaw migration;
- backup before every mutation;
- diff before save;
- simulated real user install verification.

---

## 1. Recommended Tech Stack

### 1.1 Desktop runtime

Use:

```text
Tauri 2
```

Rationale:

- cross-platform desktop;
- small binary footprint;
- Rust backend for safe local file operations;
- can build macOS/Linux/Windows release binaries through GitHub Actions;
- better fit than a browser-based Web admin surface.

### 1.2 Frontend

Recommended:

```text
React + TypeScript
Vite
shadcn/ui or Naive UI
CodeMirror or Monaco Editor
TanStack Query
Zustand
```

### 1.3 Backend

Recommended:

```text
Rust Tauri commands
SQLite
serde
serde_json
serde_yaml
toml optional
notify file watcher
similar/diff crate
```

### 1.4 Packaging

Must support:

```text
macOS .dmg
Windows .exe
Linux .AppImage or .deb
GitHub Releases
Homebrew tap
curl installer
```

Use Tauri GitHub Action for release builds.

---

## 2. Repository Structure

Create this structure:

```text
agentdock/
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── features/
│       │   │   ├── dashboard/
│       │   │   ├── agent-detail/
│       │   │   ├── personality/
│       │   │   ├── providers/
│       │   │   ├── local-models/
│       │   │   ├── skills/
│       │   │   ├── channels/
│       │   │   ├── migration/
│       │   │   ├── backups/
│       │   │   └── settings/
│       │   └── lib/
│       ├── src-tauri/
│       │   ├── src/
│       │   │   ├── main.rs
│       │   │   ├── commands/
│       │   │   ├── domain/
│       │   │   ├── adapters/
│       │   │   │   ├── openclaw/
│       │   │   │   ├── hermes/
│       │   │   │   ├── ollama/
│       │   │   │   ├── lmstudio/
│       │   │   │   └── comfyui/
│       │   │   ├── db/
│       │   │   ├── safety/
│       │   │   ├── migration/
│       │   │   └── release/
│       │   └── tauri.conf.json
├── fixtures/
│   ├── openclaw/
│   ├── hermes/
│   ├── ollama/
│   ├── lmstudio/
│   └── comfyui/
├── docs/
│   ├── PRD.md
│   ├── SPEC.md
│   ├── architecture.md
│   ├── privacy.md
│   ├── migration-map.md
│   └── release.md
└── scripts/
    ├── install.sh
    ├── release-homebrew.sh
    └── verify-install.sh
```

---

## 3. Domain Model

### 3.1 UnifiedAgent

Implement a unified agent model used by frontend and backend.

```ts
export type RuntimeKind = "openclaw" | "hermes";

export type UnifiedAgent = {
  id: string;
  runtime: RuntimeKind;
  displayName: string;

  paths: {
    root: string;
    workspace?: string;
    profile?: string;
    config?: string;
    env?: string;
    soul?: string;
    agents?: string;
    user?: string;
    memory?: string;
    sessions?: string;
    skills?: string[];
    channels?: string[];
  };

  persona: {
    soulExists: boolean;
    agentsExists: boolean;
    userExists: boolean;
    estimatedTokens?: number;
  };

  model: {
    provider?: string;
    defaultModel?: string;
    fallbackModel?: string;
    baseUrl?: string;
    apiKeyRef?: string;
    effectiveModel?: string;
    warnings: string[];
  };

  skills: SkillSummary[];
  channels: ChannelSummary[];

  privacy: {
    hasEnv: boolean;
    hasSecrets: boolean;
    hasMemory: boolean;
    hasSessions: boolean;
    secretsRedacted: true;
  };

  status: {
    level: "ok" | "warning" | "broken";
    messages: string[];
    lastScannedAt: string;
  };
};
```

### 3.2 SkillSummary

```ts
export type SkillSummary = {
  id: string;
  name: string;
  enabled: boolean;
  path: string;
  scope: "agent" | "workspace" | "profile" | "global" | "bundled" | "unknown";
  hasSkillMd: boolean;
  hasConfig: boolean;
  warnings: string[];
};
```

### 3.3 ChannelSummary

```ts
export type ChannelSummary = {
  id: string;
  type: "telegram" | "feishu" | "wechat" | "imessage" | "discord" | "slack" | "webhook" | "unknown";
  enabled: boolean;
  ownerAgentId?: string;
  configPath?: string;
  hasSecretRef: boolean;
  hasPairingState: boolean;
  warnings: string[];
};
```

### 3.4 ProviderProfile

```ts
export type ProviderProfile = {
  id: string;
  name: string;
  kind: "openai-compatible" | "ollama" | "lmstudio" | "comfyui" | "custom";
  baseUrl?: string;
  apiKeyRef?: string;
  defaultModel?: string;
  fallbackModel?: string;
  localRuntime?: LocalRuntimeStatus;
  validation: ProviderValidationStatus;
};
```

---

## 4. Local Database Schema

SQLite is for AgentDock index/cache only.

Create tables:

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE scanned_roots (
  id TEXT PRIMARY KEY,
  runtime TEXT NOT NULL,
  path TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  last_scanned_at TEXT
);

CREATE TABLE agent_index (
  id TEXT PRIMARY KEY,
  runtime TEXT NOT NULL,
  display_name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  workspace_path TEXT,
  profile_path TEXT,
  config_path TEXT,
  env_path TEXT,
  soul_path TEXT,
  agents_path TEXT,
  user_path TEXT,
  memory_path TEXT,
  sessions_path TEXT,
  detected_provider TEXT,
  default_model TEXT,
  fallback_model TEXT,
  status TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  last_scanned_at TEXT NOT NULL
);

CREATE TABLE provider_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT,
  api_key_ref TEXT,
  default_model TEXT,
  fallback_model TEXT,
  validation_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE backups (
  id TEXT PRIMARY KEY,
  runtime TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  source_paths_json TEXT NOT NULL,
  backup_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE migration_history (
  id TEXT PRIMARY KEY,
  source_runtime TEXT NOT NULL,
  source_agent_id TEXT NOT NULL,
  target_runtime TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Do not create tables for storing conversation transcripts or secret values.

---

## 5. Adapter Contracts

Implement runtime adapters behind a common interface.

```ts
interface RuntimeAdapter {
  scanRoots(paths: string[]): Promise<UnifiedAgent[]>;
  readAgent(agentId: string): Promise<UnifiedAgentDetail>;
  createAgent(input: CreateAgentInput): Promise<MutationResult>;
  duplicateAgent(input: DuplicateAgentInput): Promise<MutationResult>;
  softDeleteAgent(input: DeleteAgentInput): Promise<MutationResult>;
  restoreAgent(input: RestoreAgentInput): Promise<MutationResult>;
  updatePersonality(input: UpdatePersonalityInput): Promise<MutationResult>;
  updateModel(input: UpdateModelInput): Promise<MutationResult>;
  updateSkills(input: UpdateSkillsInput): Promise<MutationResult>;
  updateChannels(input: UpdateChannelsInput): Promise<MutationResult>;
}
```

Each adapter must be responsible for preserving runtime-specific unknown fields.

---

## 6. OpenClaw Adapter

### 6.1 Scan targets

Scan:

```text
~/.openclaw
~/.openclaw/agents
~/.openclaw/agents/<agentId>
~/.openclaw/workspace
~/.openclaw/workspace-*
custom selected OpenClaw roots
```

OpenClaw docs indicate each agent has its own workspace with `SOUL.md`, `AGENTS.md`, optional `USER.md`, plus `agentDir` and session store under `~/.openclaw/agents/<agentId>`.

### 6.2 Detect

For each detected agent:

- agent id;
- workspace path;
- `SOUL.md`;
- `AGENTS.md`;
- `USER.md`;
- `MEMORY.md` presence only;
- skills directories;
- sessions path presence only;
- config file path;
- provider/model values;
- channel references.

### 6.3 Create OpenClaw agent

Write plan:

1. validate agent id;
2. create workspace directory;
3. create `SOUL.md`;
4. create `AGENTS.md`;
5. optionally create `USER.md`;
6. create/patch agent config entry;
7. create backup before patching existing config;
8. re-scan.

### 6.4 Delete OpenClaw agent

Soft delete:

1. backup config and agent directory;
2. remove/disable config reference;
3. move workspace/agent data into `~/.agentdock/trash/openclaw/<agentId>/<timestamp>`;
4. preserve restore metadata.

### 6.5 OpenClaw mutation rules

Never rewrite whole config if a small patch is possible.

Always display affected files in diff.

---

## 7. Hermes Adapter

### 7.1 Scan targets

Scan:

```text
~/.hermes
~/.hermes/profiles
~/.hermes/profiles/<profile>
custom selected Hermes roots
```

Hermes profile docs describe profiles as isolated home directories with `config.yaml`, `.env`, `SOUL.md`, memories, sessions, skills, cron jobs, and state database.

### 7.2 Detect

For each profile:

- profile name;
- profile path;
- `config.yaml`;
- `.env` path, but only key names;
- `SOUL.md`;
- `AGENTS.md` if present;
- skills directory;
- memories presence only;
- sessions presence only;
- provider/model values;
- channel references.

### 7.3 Create Hermes profile

Write plan:

1. validate profile name;
2. create profile directory;
3. write `config.yaml`;
4. write empty `.env` or env key skeleton if needed;
5. write `SOUL.md`;
6. write `AGENTS.md` if used;
7. create `skills/`;
8. re-scan.

### 7.4 Delete Hermes profile

Soft delete:

1. backup profile directory;
2. move profile to `~/.agentdock/trash/hermes/<profile>/<timestamp>`;
3. preserve restore metadata.

---

## 8. Provider and Model Manager

### 8.1 Provider UI

Create `Model & Provider` tab with:

- provider list;
- Add Provider;
- Test Connection;
- Refresh Models;
- Default Model;
- Fallback Model;
- Effective Model Preview;
- Cost/Privacy warning if fallback uses remote API.

### 8.2 Provider types

MVP provider types:

```text
OpenAI-compatible
Ollama
LM Studio
ComfyUI / Comfy
Custom
```

### 8.3 OpenAI-compatible validation

Validation steps:

1. check base URL;
2. check env key reference exists if required;
3. call model list endpoint if available;
4. run lightweight test request if user explicitly clicks Test;
5. report:
   - auth failure;
   - connection failure;
   - model list failure;
   - generation failure;
   - unknown model id.

Do not log secret values.

### 8.4 Ollama adapter

Default endpoint:

```text
http://localhost:11434
```

MVP operations:

- health check;
- list models using `GET /api/tags`;
- add selected model;
- lightweight generation test.

### 8.5 LM Studio adapter

Default endpoint candidates:

```text
http://localhost:1234
http://127.0.0.1:1234
```

MVP operations:

- detect local server;
- use OpenAI-compatible model list where available;
- validate model call;
- show instruction if server is not running:
  - “Open LM Studio → Developer/Local Server → Start Server.”

### 8.6 ComfyUI adapter

Default path candidates:

```text
~/ComfyUI
~/Documents/ComfyUI
~/Applications/ComfyUI
custom selected path
```

Default endpoint candidates:

```text
http://localhost:8188
http://127.0.0.1:8188
```

MVP operations:

- detect path;
- detect server;
- scan model folders:
  - checkpoints;
  - vae;
  - loras;
  - controlnet;
  - upscale_models;
  - embeddings;
- register as capability provider, not default chat provider;
- only allow default chat model use if user configures a compatible bridge.

### 8.7 Effective model resolution

Implement a model resolution panel:

```text
Agent default model
↓
Agent fallback model
↓
Runtime/global default
↓
Provider fallback
```

Show exactly why a model is effective.

---

## 9. Skill Manager

### 9.1 Skill scan

For each agent/profile:

- scan local skill directories;
- detect `SKILL.md`;
- parse name/description if available;
- show warnings if missing metadata;
- detect whether skill is agent-scoped/global/bundled.

### 9.2 Skill actions

MVP actions:

- enable;
- disable;
- copy to agent/profile;
- remove from agent/profile;
- open folder;
- edit `SKILL.md`;
- edit non-secret config.

### 9.3 Security warnings

Show before adding third-party/local skill:

```text
Skills can inject instructions, call tools, and affect agent behavior.
Only install skills you trust.
```

Do not execute skill code from AgentDock.

AgentDock manages files/config only.

---

## 10. Channel Diagnostics

### 10.1 Channel dashboard

Create `Channels` tab.

Show:

- detected channel type;
- owner agent/profile;
- config path;
- secret reference;
- pairing status if detectable;
- warning state;
- setup checklist.

### 10.2 MVP channel types

Support diagnostics for:

- Telegram;
- Feishu/Lark;
- WeChat;
- iMessage;
- generic webhook.

### 10.3 Common pitfall solutions

#### Telegram

Detect/explain:

- bot token not migrated;
- DM chat id vs user id confusion;
- group allowlist uses group chat id, not member id;
- bot can be pulled into groups if not blocked by policy;
- pairing state cannot be safely migrated.

UX requirement:

- show “Reconfigure Telegram for this migrated agent” checklist.

#### Feishu/Lark

Detect/explain:

- app id / app secret must match the intended bot;
- multiple bots can be bound to wrong account id;
- logs may not appear if gateway/channel account differs;
- do not copy secret values across runtimes.

UX requirement:

- show agent-channel ownership map;
- warn on duplicate app ids or ambiguous account refs.

#### WeChat

Detect/explain:

- plugins may not support multiple bots cleanly;
- migration cannot guarantee channel state;
- user must re-pair/reconfigure.

#### iMessage

Detect/explain:

- requires Mac availability;
- local machine sleep breaks delivery;
- duplicated messages may occur depending on bridge behavior;
- channel state is not portable.

### 10.4 Channel migration

Migration only creates a target channel skeleton.

Do not migrate:

- tokens;
- encrypted secrets;
- pairing state;
- chat history;
- platform OAuth state.

---

## 11. Migration Engine

### 11.1 Migration types

MVP must implement:

```text
OpenClaw → Hermes
Hermes → OpenClaw
```

### 11.2 Migration planner

Before applying migration, show:

```text
Source agent/profile
Target runtime
Target name
Target path
Files to create
Files to copy
Config fields to map
Skills to copy/reference
Channels to create as skeletons
Secrets not migrated
Sessions archived only
Backups to create
```

### 11.3 Migration data classes

#### Migrated by default

- name;
- `SOUL.md`;
- `AGENTS.md`;
- `USER.md`;
- selected local skills;
- provider kind;
- provider base URL;
- default model;
- fallback model;
- non-secret skill config;
- channel skeleton metadata.

#### Not migrated by default

- API keys;
- encrypted credential stores;
- bot tokens;
- OAuth tokens;
- channel pairing state;
- sessions;
- runtime state database.

#### Archived, not converted

- session directory if user explicitly selects “archive source state”;
- runtime state db if user explicitly selects archive.

### 11.4 Migration output

After migration, generate `migration-report.md` in target profile/agent folder:

```md
# AgentDock Migration Report

Source:
Target:
Date:

Migrated:
- ...

Skipped:
- API keys
- bot tokens
- pairing state
- sessions

Manual steps:
- Configure provider API key
- Validate default model
- Validate fallback model
- Re-pair Telegram/Feishu/etc
```

### 11.5 OpenClaw → Hermes mapping

| Source OpenClaw | Target Hermes |
|---|---|
| agent id | profile name |
| workspace | profile workspace/cwd field |
| `SOUL.md` | `SOUL.md` |
| `AGENTS.md` | `AGENTS.md` or config instruction file |
| `USER.md` | `USER.md` |
| skills folder | profile `skills/` |
| model/provider | `config.yaml` model/provider |
| channels | channel skeleton |
| secrets | manual reconfiguration |

### 11.6 Hermes → OpenClaw mapping

| Source Hermes | Target OpenClaw |
|---|---|
| profile name | agent id |
| profile directory | agent workspace |
| `SOUL.md` | `SOUL.md` |
| `AGENTS.md` | `AGENTS.md` |
| `USER.md` | `USER.md` |
| profile `skills/` | workspace/agent skills |
| `config.yaml` model/provider | OpenClaw model/provider config |
| channels | channel skeleton |
| secrets | manual reconfiguration |

---

## 12. Backup and Diff Engine

### 12.1 Mutation workflow

All mutations must use this workflow:

```text
1. Build mutation plan
2. Validate paths
3. Generate diff
4. Show diff to user
5. Create backup
6. Apply atomic writes
7. Re-scan
8. Show result
```

### 12.2 Backup path

```text
~/.agentdock/backups/<runtime>/<agentId>/<timestamp>/
```

### 12.3 Trash path

```text
~/.agentdock/trash/<runtime>/<agentId>/<timestamp>/
```

### 12.4 Atomic write

For every file write:

```text
write temp file
fsync if available
rename temp file to target
re-scan target
```

### 12.5 Diff UI

Right side panel must show:

- changed files;
- additions/removals;
- warnings;
- backup path;
- confirm button.

No hidden write.

---

## 13. UI Design Lock

The dev agent must not create extra product surfaces.

### 13.1 App shell

Use one desktop dashboard layout:

```text
┌───────────────────────────────────────────────────────────────┐
│ AgentDock                                  Local Only ●        │
├───────────────┬───────────────────────────────┬───────────────┤
│ Sidebar       │ Main Detail                   │ Risk / Diff   │
│               │                               │               │
│ All Agents    │ Selected Agent                │ Warnings      │
│ OpenClaw      │ Tabs                          │ File changes  │
│ Hermes        │                               │ Backup status │
│ Warnings      │                               │ Confirm       │
│ Trash         │                               │               │
│ Settings      │                               │               │
└───────────────┴───────────────────────────────┴───────────────┘
```

### 13.2 Required top status

Top bar must show:

```text
Local Only
No Cloud
No Telemetry
```

### 13.3 Sidebar

Items:

- All Agents;
- OpenClaw;
- Hermes;
- Warnings;
- Trash;
- Settings.

### 13.4 Agent detail tabs

Tabs:

- Overview;
- Personality;
- Model & Provider;
- Skills;
- Channels;
- Migration;
- Files;
- Backups.

### 13.5 Avoid

Do not add:

- marketplace page in MVP;
- login page;
- cloud page;
- chat page;
- dashboard server controls;
- remote terminal;
- remote desktop.

---

## 14. Development Phases

The dev agent must implement in this order. Do not jump ahead.

---

### Phase 0 — Project Bootstrap

Goal: create buildable Tauri desktop app.

Tasks:

1. initialize Tauri app;
2. add React/Vite/TypeScript;
3. add basic app shell;
4. add SQLite setup;
5. add directory permission layer;
6. add fixture directories.

Acceptance:

- app launches on macOS;
- sidebar renders;
- SQLite file created under `~/.agentdock`;
- no network request on launch.

---

### Phase 1 — Local Scan Engine

Goal: detect local OpenClaw/Hermes agents.

Tasks:

1. implement OpenClaw scanner;
2. implement Hermes scanner;
3. implement custom root selector;
4. populate `agent_index`;
5. render unified dashboard.

Acceptance:

- detects mock OpenClaw fixtures;
- detects mock Hermes fixtures;
- detects real `~/.openclaw` if present;
- detects real `~/.hermes` if present;
- does not read sessions;
- does not show secret values.

---

### Phase 2 — Agent Detail + Personality Editor

Goal: safe editing of `SOUL.md`, `AGENTS.md`, `USER.md`.

Tasks:

1. agent detail screen;
2. personality tab;
3. Markdown editor;
4. diff generation;
5. backup before save;
6. restore backup.

Acceptance:

- edit `SOUL.md`;
- edit `AGENTS.md`;
- edit `USER.md`;
- diff visible before save;
- backup exists after save;
- restore returns original content.

---

### Phase 3 — Provider and Model Manager

Goal: cc-switch-like provider/model management per agent.

Tasks:

1. provider profile UI;
2. default model field;
3. fallback model field;
4. effective model preview;
5. OpenAI-compatible validation;
6. Ollama scanner;
7. LM Studio scanner;
8. ComfyUI scanner.

Acceptance:

- can add OpenAI-compatible provider;
- can validate provider without logging secret;
- can detect Ollama if running;
- can list Ollama models through `/api/tags`;
- can detect LM Studio local server;
- can list LM Studio models where supported;
- can detect ComfyUI model folders;
- can set default/fallback model per agent.

---

### Phase 4 — Create / Duplicate / Delete

Goal: manage lifecycle through GUI.

Tasks:

1. New Agent dialog;
2. New Hermes Profile dialog;
3. duplicate flow;
4. soft delete;
5. trash page;
6. restore flow.

Acceptance:

- create OpenClaw agent from GUI;
- create Hermes profile from GUI;
- duplicate existing agent/profile;
- delete moves to AgentDock trash;
- restore works;
- all operations create backups.

---

### Phase 5 — Skill Manager

Goal: manage local skills.

Tasks:

1. scan skill folders;
2. parse `SKILL.md`;
3. enable/disable;
4. copy skill to agent;
5. remove skill;
6. edit `SKILL.md`;
7. show security warning.

Acceptance:

- OpenClaw skills detected;
- Hermes skills detected;
- skill can be copied to an agent/profile;
- skill can be disabled/removed;
- no code execution from skill.

---

### Phase 6 — Channel Diagnostics

Goal: detect and explain channel binding state.

Tasks:

1. channel tab;
2. detect Telegram refs;
3. detect Feishu/Lark refs;
4. detect WeChat/iMessage/generic refs where possible;
5. channel ownership map;
6. duplicate/conflict warnings;
7. migration checklist generator.

Acceptance:

- channel attached to wrong agent can be spotted;
- duplicate app/token refs warned;
- Telegram group/user id warning shown;
- Feishu multi-bot warning shown;
- migration says “secrets not migrated.”

---

### Phase 7 — OpenClaw → Hermes Migration

Goal: one-way migration.

Tasks:

1. migration planner;
2. source OpenClaw agent selection;
3. target Hermes profile preview;
4. map files;
5. map model/provider config;
6. map skills;
7. create channel skeletons;
8. generate migration report;
9. no secrets migrated.

Acceptance:

- migrated Hermes profile exists;
- `SOUL.md` preserved;
- `AGENTS.md` preserved;
- default/fallback model preserved;
- skills copied/referenced;
- secrets skipped;
- report generated;
- user can manually configure provider key afterward.

---

### Phase 8 — Hermes → OpenClaw Migration

Goal: reverse migration.

Tasks:

1. source Hermes profile selection;
2. target OpenClaw agent preview;
3. map files;
4. map model/provider config;
5. map skills;
6. create channel skeletons;
7. generate migration report;
8. no secrets migrated.

Acceptance:

- migrated OpenClaw agent exists;
- `SOUL.md` preserved;
- `AGENTS.md` preserved;
- default/fallback model preserved;
- skills copied/referenced;
- secrets skipped;
- report generated.

---

### Phase 9 — Packaging and Install

Goal: ship GitHub open-source installer.

Tasks:

1. GitHub Release workflow;
2. macOS `.dmg`;
3. Windows `.exe`;
4. Linux `.AppImage` or `.deb`;
5. Homebrew tap;
6. curl installer;
7. checksum generation;
8. README install docs.

Acceptance:

- GitHub release includes all artifacts;
- macOS installs from `.dmg`;
- Windows installs from `.exe`;
- Linux package runs;
- Homebrew tap installs app;
- curl installer downloads correct release.

---

## 15. Real User Verification Path

This is the simulated real user install test. The MVP is not accepted until this path passes.

### 15.1 Environment

Prepare one machine with:

- OpenClaw installed and at least two agents:
  - `main`;
  - `consulting-agent`;
- Hermes installed and at least one profile:
  - `default`;
- Ollama installed with at least one local model;
- LM Studio installed with local server started;
- ComfyUI folder with at least one checkpoint model;
- at least one fake Telegram/Feishu channel skeleton config, with dummy non-secret values only.

### 15.2 Install path A — GitHub Release

Steps:

1. download `.dmg` on macOS;
2. install AgentDock;
3. launch app;
4. verify “Local Only / No Cloud / No Telemetry” visible;
5. scan local paths.

Expected:

- OpenClaw agents appear;
- Hermes profiles appear;
- no secrets displayed.

### 15.3 Install path B — Homebrew

Steps:

```bash
brew tap atlax/agentdock
brew install --cask agentdock
open -a AgentDock
```

Expected:

- app launches;
- local scan works;
- no terminal config required after launch.

### 15.4 Install path C — curl installer

Steps:

```bash
curl -fsSL https://raw.githubusercontent.com/atlax/agentdock/main/scripts/install.sh | bash
agentdock
```

Expected:

- installer detects OS;
- downloads release;
- validates checksum;
- launches app or prints launch path.

### 15.5 Create agent test

Steps:

1. click New Agent;
2. choose OpenClaw;
3. name it `dev-agent`;
4. set provider to Ollama;
5. choose local model;
6. set fallback model to LM Studio model;
7. write basic `SOUL.md`;
8. save.

Expected:

- new OpenClaw agent appears;
- files created;
- backup created;
- effective model panel shows Ollama default, LM Studio fallback.

### 15.6 Provider validation test

Steps:

1. open `dev-agent`;
2. click Model & Provider;
3. validate Ollama;
4. validate LM Studio;
5. scan ComfyUI.

Expected:

- Ollama connection passes;
- Ollama models listed;
- LM Studio server detected;
- LM Studio model listed if endpoint supports it;
- ComfyUI model folders detected;
- no secret values shown.

### 15.7 Personality edit test

Steps:

1. open `SOUL.md`;
2. change personality text;
3. click Save;
4. inspect diff;
5. confirm;
6. restore previous backup.

Expected:

- diff shown before save;
- backup created;
- restore works.

### 15.8 Skill test

Steps:

1. open Skills tab;
2. add local skill folder;
3. inspect `SKILL.md`;
4. enable skill;
5. disable skill;
6. remove skill.

Expected:

- skill status updates;
- security warning shown;
- no skill code executed by AgentDock.

### 15.9 Channel diagnostic test

Steps:

1. open Channels tab;
2. inspect Telegram skeleton;
3. inspect Feishu skeleton;
4. create duplicate fake Feishu app id across two agents.

Expected:

- channel ownership visible;
- duplicate warning shown;
- secrets not shown;
- migration warning says tokens/pairing are not migrated.

### 15.10 OpenClaw → Hermes migration test

Steps:

1. select OpenClaw `dev-agent`;
2. click Migrate;
3. choose Hermes target;
4. preview migration;
5. confirm;
6. open resulting Hermes profile.

Expected:

- Hermes profile created;
- personality preserved;
- model/default/fallback preserved;
- skills copied/referenced;
- secrets skipped;
- migration report generated;
- provider key requires manual configuration.

### 15.11 Hermes → OpenClaw migration test

Steps:

1. select Hermes profile;
2. click Migrate;
3. choose OpenClaw target;
4. preview migration;
5. confirm;
6. open resulting OpenClaw agent.

Expected:

- OpenClaw agent created;
- personality preserved;
- model/default/fallback preserved;
- skills copied/referenced;
- secrets skipped;
- migration report generated.

### 15.12 Delete/restore test

Steps:

1. delete migrated test agent;
2. confirm soft delete;
3. open Trash;
4. restore it.

Expected:

- agent removed from dashboard after delete;
- files moved to AgentDock trash;
- restore brings agent back;
- backup exists.

---

## 16. Final MVP Acceptance Criteria

MVP is accepted only if all criteria pass.

### Product criteria

- one local dashboard;
- no login;
- no cloud;
- no web admin;
- no telemetry;
- local SQLite only;
- local files remain source of truth.

### Functional criteria

- scans OpenClaw and Hermes;
- creates OpenClaw agent;
- creates Hermes profile;
- deletes/restores agent/profile;
- duplicates agent/profile;
- edits `SOUL.md`, `AGENTS.md`, `USER.md`;
- manages skills;
- manages providers;
- validates provider connectivity;
- supports default/fallback model;
- detects Ollama;
- detects LM Studio;
- detects ComfyUI models/capabilities;
- diagnoses channels;
- migrates OpenClaw → Hermes;
- migrates Hermes → OpenClaw;
- does not migrate secrets;
- generates migration report;
- backup/diff works for every mutation.

### UX criteria

- resembles cc-switch-level management clarity;
- no terminal needed for core flows;
- risk/diff visible before save;
- privacy status visible;
- interface does not introduce unrelated modules.

### Release criteria

- GitHub release artifacts created;
- `.dmg` available;
- `.exe` available;
- Linux package available;
- Homebrew tap install works;
- curl installer works.

---

## 17. Future Commercialization Hooks — Document Only, Do Not Build in MVP

Do not implement these in MVP. Keep architecture extensible.

### 17.1 Skill Market

Future marketplace for curated skills with:

- one-click install;
- compatibility check;
- risk scan;
- dependency scan;
- paid premium skills.

### 17.2 Agent Persona Market

Future marketplace for:

- SOUL packs;
- AGENTS instruction packs;
- role-specific agent personalities;
- companion/consulting/dev/business agents.

### 17.3 Agent Template Packs

Future installable full templates:

- Auto Business agent;
- Indie Content agent;
- Prompt Graveyard agent;
- MindDock Mentor agent;
- PM Review agent;
- Dev Agent.

### 17.4 Agent Eyes Packs

Future capability installer:

- browser eyes;
- screenshot eyes;
- OCR eyes;
- local file watcher;
- clipboard watcher;
- visual model workflow through ComfyUI.

### 17.5 Channel Bot Fleet Manager

Future advanced channel management:

- multiple Telegram bots;
- multiple Feishu apps;
- per-agent bot mapping;
- pairing state wizard;
- channel health check;
- bulk repair.

### 17.6 Structured Output Template Packs

Future paid templates:

- PRD output;
- SPEC output;
- business validation report;
- PM review report;
- bug triage report;
- content generation calendar.

### 17.7 Agent Branching

Future high-value feature:

- clone agent into branches;
- compare models;
- compare personalities;
- compare skills;
- test prompt/context weight;
- rollback agent branch.

### 17.8 Atlax Plugin Shelf

Future built-in distribution area for Atlax-owned plugins:

- Auto Business Lab pack;
- Indie Content Agent pack;
- Prompt Graveyard pack;
- MindDock Mentor pack.

MVP only needs architecture cleanliness to allow this later.

---

## 18. Reference Notes

Implementation should be checked against:

- OpenClaw multi-agent workspace/profile assumptions;
- Hermes profile directory assumptions;
- cc-switch-like local management UX;
- Ollama `/api/tags`;
- LM Studio local server/OpenAI-compatible endpoints;
- ComfyUI model folder conventions;
- Tauri packaging and Homebrew tap release process.

Do not invent runtime schema blindly. If config structures differ on the user machine, preserve unknown fields and add warnings instead of overwriting them.
