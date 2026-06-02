# AgentDock PRD

> Working name: **AgentDock**  
> Product type: **local-only desktop dashboard for OpenClaw / Hermes agent management**  
> Version: v0.1 MVP PRD  
> Owner: Kinson / Atlax  
> Status: ready for dev-agent execution  

---

## 1. Product Summary

AgentDock is a **local-first desktop dashboard** for managing OpenClaw agents and Hermes profiles.

It provides a cc-switch-like graphical management interface, but instead of primarily managing providers, it manages **agent lifecycle and agent configuration**:

- scan local OpenClaw / Hermes configuration paths;
- list all local agents/profiles in one dashboard;
- create agents/profiles without terminal commands;
- delete agents/profiles safely;
- duplicate agents/profiles;
- migrate agents between OpenClaw and Hermes;
- edit agent personality and instruction files;
- manage skills per agent;
- configure providers, default models, fallback models, and local model runtimes;
- validate model/provider connectivity;
- preserve privacy by keeping all data local.

The product is **not** a Web admin panel, not a SaaS, not a cloud sync product, not a remote dashboard, and not a chat UI.

---

## 2. Why This Product Exists

OpenClaw and Hermes are powerful but configuration-heavy. A user who runs multiple agents typically needs to manage:

- agent/profile identity;
- workspace/profile directories;
- `SOUL.md`;
- `AGENTS.md`;
- `USER.md`;
- skills;
- model provider;
- default model;
- fallback model;
- local model server;
- channel/bot binding;
- encrypted secrets;
- gateway/profile state;
- migration between runtimes.

Today, much of this still requires terminal commands, manual file editing, and repeated config inspection.

This creates the exact pain that cc-switch solves for provider management:

> Users do not want to hand-edit fragile local config files every time they add, clone, migrate, or repair an agent.

AgentDock exists to remove that friction.

---

## 3. Product Positioning

### One-line positioning

**Manage OpenClaw and Hermes agents like cc-switch manages providers.**

### Product boundary

AgentDock is:

- a local desktop app;
- a local configuration dashboard;
- a safe config editor;
- a local agent/profile lifecycle manager;
- a migration assistant between OpenClaw and Hermes;
- a local model/provider manager for agents.

AgentDock is not:

- a hosted dashboard;
- a remote management system;
- an agent runtime;
- a replacement for OpenClaw or Hermes;
- a cloud sync platform;
- a chat client;
- a secret migration tool;
- a session/memory browser by default.

---

## 4. Target Users

### Primary user

Technical AI agent users who already use or are trying to use OpenClaw / Hermes, especially users who maintain multiple agents such as:

- companion agent;
- consulting agent;
- dev agent;
- auto-business agent;
- content agent;
- private local-model agent.

### User characteristics

They are likely to:

- use local models through Ollama / LM Studio / ComfyUI;
- care strongly about privacy;
- avoid cloud exposure;
- use agents with sensitive memory/persona;
- want multiple agents with different models and channels;
- dislike repeated terminal configuration;
- prefer GitHub open-source tools;
- accept local installation via `.dmg`, `.exe`, Linux packages, Homebrew, or curl installer.

---

## 5. Core User Story

> As an OpenClaw/Hermes user, I want to install a local dashboard, let it scan my local agent configurations, and then create, delete, duplicate, configure, and migrate agents through a GUI, so that I no longer need to manually edit configs or run fragile terminal commands.

---

## 6. MVP Scope

This MVP is intentionally **not reduced below the core product promise**. The minimum shippable version must include all product foundation capabilities listed below.

### 6.1 Local Scan

AgentDock must scan local OpenClaw and Hermes config paths based on their expected local directory structures.

Default paths:

```text
OpenClaw:
~/.openclaw/
~/.openclaw/agents/
~/.openclaw/workspace
~/.openclaw/workspace-*

Hermes:
~/.hermes/
~/.hermes/profiles/
```

The user must also be able to manually add custom paths.

### 6.2 Unified Agent Dashboard

AgentDock must show a unified dashboard with all detected agents/profiles grouped by runtime:

```text
All Agents
├── OpenClaw
│   ├── main
│   ├── bubu
│   ├── consulting-agent
│   └── dev-agent
└── Hermes
    ├── default
    ├── consulting
    └── auto-business
```

Each agent row/card must show:

- runtime: OpenClaw / Hermes;
- name / agent id / profile id;
- config root;
- workspace/profile path;
- detected provider;
- default model;
- fallback model;
- skills count;
- channel count;
- local model runtime status;
- warning state;
- last modified time.

### 6.3 Add Agent / Profile

The user must be able to create:

- a new OpenClaw agent;
- a new Hermes profile;
- a new agent by duplicating an existing one.

The create flow must support:

- name;
- runtime;
- workspace/profile path;
- base template: blank / duplicate existing;
- personality files;
- model provider;
- default model;
- fallback model;
- skills;
- channel placeholders.

### 6.4 Delete Agent / Profile

Deletion must be safe.

AgentDock must support:

- soft delete by moving local agent/profile data into AgentDock trash;
- restore deleted agent/profile;
- permanent delete only after explicit confirmation.

No direct destructive delete should happen without backup.

### 6.5 OpenClaw ↔ Hermes Migration

The user must be able to migrate agents in both directions:

- OpenClaw agent → Hermes profile;
- Hermes profile → OpenClaw agent.

MVP migration must preserve the core agent configuration:

- name;
- personality;
- instruction files;
- user context files;
- workspace/profile structure where applicable;
- skill references or copied skill files;
- provider profile metadata;
- default model;
- fallback model;
- channel configuration skeletons;
- non-secret channel metadata.

MVP migration must **not** migrate encrypted API keys, bot tokens, or secrets automatically.

Reason:

- OpenClaw and Hermes may store credentials in encrypted/local runtime-specific stores;
- directly copying encrypted secrets is unreliable;
- wrong secret migration creates liability;
- after migration, the user should manually configure provider/channel keys through AgentDock’s provider/channel forms.

The migration report must clearly show:

```text
Migrated:
- SOUL.md
- AGENTS.md
- USER.md
- selected skills
- model/provider settings
- fallback model settings
- channel skeleton

Not migrated:
- encrypted API keys
- bot tokens
- channel pairing state
- runtime sessions
- internal state database
```

### 6.6 Personality / Instruction Editor

AgentDock must allow manual editing of:

- `SOUL.md`;
- `AGENTS.md`;
- `USER.md`;
- optional identity/instruction files if detected.

The editor must include:

- Markdown editor;
- preview;
- diff before save;
- backup before save;
- restore backup.

Sensitive memory/session files must not be opened by default.

### 6.7 Skill Management

AgentDock must support per-agent skill management:

- scan installed/local skills;
- list enabled skills;
- enable/disable skills for an agent;
- copy a local skill to an agent;
- remove a skill from an agent;
- edit `SKILL.md`;
- edit non-secret skill config;
- show skill security warnings.

The product must treat third-party skills as potentially unsafe and show warnings before installation/copy.

### 6.8 Provider and Model Management

AgentDock must provide a cc-switch-like provider/model panel, scoped to agents/profiles.

Capabilities:

- add provider;
- edit provider;
- configure base URL;
- configure API key reference;
- validate provider connection;
- list provider models where supported;
- configure default model;
- configure fallback model;
- configure local model providers.

Provider validation must support:

- OpenAI-compatible endpoints;
- Ollama;
- LM Studio;
- ComfyUI/Comfy local model scanning as a visual/model capability provider.

MVP must include:

#### Ollama support

- detect whether Ollama is running;
- default endpoint: `http://localhost:11434`;
- list local models through `/api/tags`;
- add model to agent provider profile;
- test a lightweight generation request.

#### LM Studio support

- detect local server endpoint;
- support OpenAI-compatible endpoint;
- list models through `/v1/models` where available;
- validate chat completion or lightweight model call;
- add selected local model to an agent.

#### ComfyUI / Comfy support

ComfyUI is primarily a visual workflow/model system, not a normal text LLM provider. AgentDock must still support it as a local capability provider:

- detect common ComfyUI paths;
- detect local ComfyUI server if running;
- scan model folders such as checkpoints, VAEs, LoRAs, ControlNet, upscalers;
- register ComfyUI as an agent capability/tool provider;
- do not treat ComfyUI as default chat LLM unless a compatible bridge endpoint is configured by the user.

### 6.9 Channel Configuration Support

AgentDock must help with common channel/bot configuration pitfalls.

MVP must support configuration inspection and repair hints for:

- Telegram;
- Feishu/Lark;
- WeChat;
- iMessage;
- generic webhook/channel entries.

MVP does not need to fully own each channel lifecycle, but it must provide a GUI layer for:

- viewing channel binding status;
- viewing which agent/profile a channel is attached to;
- showing missing credentials;
- showing allowlist/group allowlist state where detectable;
- generating channel setup checklist;
- warning when a channel cannot be safely migrated;
- preventing automatic migration of bot secrets and pairing state.

### 6.10 Local Database

All AgentDock data must be stored in a local SQLite database.

SQLite is not the source of truth for agent config. The source of truth remains the OpenClaw/Hermes local files.

SQLite stores:

- scan index;
- detected paths;
- UI state;
- warnings;
- provider metadata;
- local backup registry;
- migration history;
- non-secret config cache.

SQLite must not store:

- API key values;
- bot token values;
- full conversation history;
- full memory contents unless user explicitly imports them later;
- remote telemetry.

### 6.11 Sync Entry Only

AgentDock may provide a user-controlled sync entry, but it must not implement platform-managed cloud sync.

Allowed:

- “Open AgentDock Data Folder”;
- “Move AgentDock Data Folder”;
- “Use custom data directory”;
- “You may put this directory under iCloud / Dropbox / OneDrive / Syncthing / Git yourself.”

Not allowed in MVP:

- AgentDock account login;
- AgentDock cloud;
- built-in sync service;
- uploading configs;
- remote backup.

---

## 7. Privacy Requirements

Privacy is a core product feature, not an implementation detail.

AgentDock must guarantee:

```text
No cloud.
No login.
No web dashboard.
No telemetry.
No conversation upload.
No automatic secret migration.
No default memory/session reading.
All data remains local.
```

Default behavior:

- no network request on launch except optional provider validation explicitly triggered by user;
- no remote analytics;
- no hidden update check unless user enables it;
- no reading session transcript directories by default;
- `.env` values and tokens must be redacted;
- secret fields are write-only or manually editable with explicit reveal action.

---

## 8. Security Requirements

### 8.1 Safe Write

Every file write must use:

1. validation;
2. patch plan;
3. diff preview;
4. backup snapshot;
5. atomic write;
6. re-scan;
7. success/failure report.

### 8.2 Unknown Field Preservation

AgentDock must preserve unknown fields in OpenClaw/Hermes config files.

Do not parse and rewrite entire configs if a targeted patch is possible.

### 8.3 Backup

Every destructive or mutating operation must create a backup:

- edit personality;
- edit provider;
- edit model;
- create agent;
- delete agent;
- migrate agent;
- edit skills;
- edit channels.

### 8.4 Secret Handling

Secrets are never automatically migrated.

Secrets include:

- API keys;
- bot tokens;
- encrypted credential stores;
- channel pairing state;
- OAuth tokens;
- cookies;
- private SSH keys.

AgentDock may store secret key names or references, but not values unless the user explicitly enters them into the target runtime’s expected local configuration.

---

## 9. UX Principles

### 9.1 One Dashboard

The product must feel like cc-switch:

- single desktop dashboard;
- left navigation;
- right configuration detail;
- visible status;
- fast switching;
- no terminal-first workflow.

### 9.2 No Wizard Hell

A short setup scan is allowed. A long multi-page onboarding flow is not.

### 9.3 Do Not Hide Risk

Every risky operation must show:

- affected files;
- backup location;
- what will not be migrated;
- whether secrets must be reconfigured manually.

### 9.4 Respect Local Power Users

Users should be able to:

- open config folder;
- open file in external editor;
- copy path;
- rescan;
- repair detected config;
- inspect diff.

---

## 10. MVP Screens

### Screen 1: Dashboard

Purpose: show all detected OpenClaw/Hermes agents.

Layout:

```text
Left Sidebar:
- All Agents
- OpenClaw
- Hermes
- Warnings
- Trash
- Settings

Main:
- Agent cards/table
- Runtime
- Model
- Provider
- Skills
- Channels
- Status

Right:
- Selected agent overview
- Quick actions
```

Primary actions:

- New Agent
- Duplicate
- Migrate
- Delete
- Rescan

### Screen 2: Agent Detail

Tabs:

- Overview
- Personality
- Model & Provider
- Skills
- Channels
- Migration
- Files
- Backups

### Screen 3: Provider Manager

Capabilities:

- provider list;
- add provider;
- validate connection;
- scan local runtimes;
- choose default model;
- choose fallback model.

### Screen 4: Migration Planner

Capabilities:

- source runtime;
- target runtime;
- migration preview;
- migrated items;
- skipped items;
- secret reconfiguration checklist;
- apply migration.

### Screen 5: Backup / Restore

Capabilities:

- list snapshots;
- compare backup to current;
- restore;
- delete old backup.

---

## 11. Known User Pain Points to Solve

The following configuration pitfalls must be directly addressed in UX copy, validation logic, and repair hints.

### 11.1 Model switch appears successful but runtime still uses old model

Symptoms:

- command/UI says model switched;
- footer/status still shows old model;
- model list does not include desired provider;
- runtime calls wrong endpoint.

AgentDock solution:

- show agent-level model, runtime-level default model, and provider-level model separately;
- validate actual endpoint before saving;
- show “effective model” after config merge;
- provide “why this model is active” explanation.

### 11.2 Provider authentication failure

Symptoms:

- HTTP 401;
- key exists but wrong env var;
- base URL wrong;
- provider expects different model id;
- `/v1/models` or `/v2/models` warning.

AgentDock solution:

- provider validation button;
- explicit base URL field;
- env key reference field;
- show request target without exposing secrets;
- show “model list failed” separately from “chat completion failed”;
- allow manual model id override.

### 11.3 Default model vs fallback model confusion

Symptoms:

- global default overrides agent default;
- fallback silently used;
- local model unavailable, API fallback unexpectedly called.

AgentDock solution:

- model resolution graph;
- display priority order;
- warn when fallback may incur API cost;
- allow per-agent default/fallback config;
- dry-run effective model resolution.

### 11.4 Channel account bound to wrong agent

Symptoms:

- Telegram/Feishu bot sends messages to wrong agent;
- multiple bots confused;
- account id / app id / secret mixed up;
- dev-agent messages appear under auto-business logs.

AgentDock solution:

- channel-to-agent map;
- detect duplicate account references;
- show channel owner agent;
- do not migrate bot secrets automatically;
- generate per-channel setup checklist;
- warn when a runtime does not support multiple bots cleanly.

### 11.5 DM pairing / allowlist confusion

Symptoms:

- DM pairing command does nothing;
- group allowlist uses group chat id, not member id;
- bot replies in wrong place;
- logs not appearing.

AgentDock solution:

- channel diagnostics checklist;
- show allowlist and group allowlist fields if detectable;
- explain “chat id vs user id vs group id”;
- provide test-event checklist rather than blind config edits.

### 11.6 Local model server is not actually running

Symptoms:

- Ollama model exists but server not reachable;
- LM Studio model downloaded but server not started;
- local model UI has model, but OpenAI-compatible endpoint is disabled.

AgentDock solution:

- runtime scanner;
- endpoint health check;
- model list fetch;
- test generation;
- “Start server in LM Studio” instruction;
- “Ollama reachable at localhost:11434” status.

### 11.7 Tools/skills accidentally mounted into wrong agent

Symptoms:

- Feishu tools appear on companion agent;
- too many tools inflate prompt/context;
- local model becomes slow because irrelevant tools are mounted.

AgentDock solution:

- per-agent skill/channel list;
- detect shared/global skills;
- show “effective tools loaded”;
- warn when agent has high tool count;
- allow disable skill/channel per agent.

### 11.8 Context or prompt bloat causes local model latency

Symptoms:

- hello triggers huge context;
- 8B local model becomes slow;
- unnecessary tools and memories inflate prompt.

AgentDock solution:

- show estimated context contributors:
  - SOUL;
  - AGENTS;
  - USER;
  - skills;
  - channels;
  - memory;
- warn when agent config is too large;
- provide “prompt weight report.”

---

## 12. Commercialization Openings — Not MVP

These are product-aligned extension points. They must be documented but not implemented in MVP.

### 12.1 Skill Market

A curated marketplace for high-quality OpenClaw/Hermes skills.

Premium value:

- one-click install;
- compatibility validation;
- risk scan;
- dependency check;
- version pinning;
- rollback.

### 12.2 Agent Persona Market

A marketplace for high-quality agent personalities.

Premium value:

- SOUL.md packs;
- AGENTS.md packs;
- role-specific templates;
- migration-ready persona bundles.

### 12.3 Agent Template Packs

Pre-built full agent bundles:

- consulting agent;
- dev agent;
- content agent;
- companion agent;
- auto-business agent;
- research agent.

### 12.4 Agent “Eyes” Installation

A guided capability installer for adding visual/browser/context perception to agents:

- browser control;
- screenshot analysis;
- OCR connector;
- local file watcher;
- selected folder monitor;
- clipboard watcher.

This aligns with the product promise because it increases agent capability through configuration, not cloud logic.

### 12.5 Channel Bot Fleet Manager

Advanced management for many channel bots:

- Telegram bot fleet;
- Feishu/Lark app fleet;
- Discord/Slack accounts;
- per-agent channel routing;
- allowlist templates;
- bot health status;
- test message tool.

### 12.6 Structured Output Template Packs

Reusable output schemas and templates:

- business validation report;
- PRD generator;
- SPEC generator;
- bug triage;
- PM review;
- content calendar;
- research brief.

### 12.7 Agent Clones / Agent Branching

Clone an agent into multiple variants:

- same memory, different model;
- same persona, different channel;
- same workspace, different skill set;
- A/B compare models/personas.

### 12.8 Third-party Runtime Adapters

Adapters for additional local/agent runtimes:

- Claude Code;
- Codex;
- Gemini CLI;
- OpenCode;
- Cursor/IDE agents;
- local MCP managers.

### 12.9 Atlax Plugin Shelf

A future plugin area where Atlax-owned agent packs can be distributed:

- Auto Business agent pack;
- Indie Content agent pack;
- Prompt Graveyard agent pack;
- MindDock mentor agent pack.

This is not MVP, but the product architecture should allow it later.

---

## 13. Distribution

MVP distribution must support:

- GitHub open source;
- GitHub Releases;
- macOS `.dmg`;
- Windows `.exe`;
- Linux `.AppImage` and/or `.deb`;
- Homebrew tap;
- curl installer.

No paid distribution and no account system in MVP.

---

## 14. Success Metrics

### Functional success

- detects existing OpenClaw agents;
- detects existing Hermes profiles;
- creates new OpenClaw agent through GUI;
- creates new Hermes profile through GUI;
- edits personality safely;
- configures provider/model/fallback;
- validates Ollama and LM Studio;
- scans ComfyUI local model folders;
- migrates OpenClaw → Hermes;
- migrates Hermes → OpenClaw;
- deletes/restores agent safely;
- never migrates secrets automatically.

### User success

A real user should be able to:

1. install AgentDock;
2. scan local configs;
3. see all OpenClaw/Hermes agents;
4. create a dev-agent;
5. set default model and fallback model;
6. validate provider connection;
7. attach a local Ollama/LM Studio model;
8. edit `SOUL.md`;
9. migrate the agent to the other runtime;
10. manually reconfigure API keys/channel tokens after migration;
11. run the migrated agent in OpenClaw/Hermes without terminal config surgery.

---

## 15. References

- OpenClaw multi-agent docs: https://docs.openclaw.ai/concepts/multi-agent
- OpenClaw agent runtime docs: https://docs.openclaw.ai/concepts/agent
- OpenClaw workspace docs: https://github.com/openclaw/openclaw/blob/main/docs/concepts/agent-workspace.md
- OpenClaw migration from Hermes: https://docs.openclaw.ai/install/migrating-hermes
- Hermes Agent repository and migration notes: https://github.com/nousresearch/hermes-agent
- Hermes profiles docs: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md
- cc-switch repository: https://github.com/farion1231/cc-switch
- Tauri GitHub Action: https://github.com/tauri-apps/tauri-action
- Tauri filesystem plugin: https://v2.tauri.app/plugin/file-system/
- Ollama API docs: https://docs.ollama.com/api/tags
- LM Studio local server docs: https://lmstudio.ai/docs/developer/core/server
- ComfyUI model docs: https://docs.comfy.org/development/core-concepts/models
- Homebrew tap docs: https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap
