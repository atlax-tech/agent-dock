# AgentDock

AgentDock is a local-only desktop dashboard for managing OpenClaw agents and
Hermes profiles.

The product boundary is strict:

- local desktop app, not a Web admin panel;
- no login, account system, hosted backend, telemetry, or cloud sync;
- local SQLite is an index/cache only;
- OpenClaw and Hermes local files remain the source of truth;
- API keys, bot tokens, OAuth tokens, channel pairing state, and encrypted
  credentials are not migrated, displayed, or stored.

## Branches

- `main`: stable major-version releases.
- `demo`: small demo releases.
- `dev`: active development.

## Phase 0

This repository currently contains the Phase 0 bootstrap:

- Tauri 2 desktop scaffold;
- React + TypeScript + Vite app shell;
- local SQLite initialization under `~/.agentdock/agentdock.sqlite`;
- fixture roots for scanner development;
- engineering dev log.

## Development

```bash
npm install
npm run check
npm run dev
```

`npm run dev` launches the desktop app through Tauri.
