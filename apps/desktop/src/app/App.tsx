import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type DatabaseReport = {
  db_path: string;
  created: boolean;
  tables: string[];
};

type BootstrapStatus = {
  app_name: string;
  phase: string;
  local_only: boolean;
  database: DatabaseReport;
  default_scan_roots: string[];
};

type FixtureRoot = {
  name: string;
  path: string;
  exists: boolean;
};

const navigation = [
  "Overview",
  "Personality",
  "Model",
  "Skills",
  "Channels",
  "Migration",
  "Backups",
  "Settings",
];

export function App() {
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [fixtures, setFixtures] = useState<FixtureRoot[]>([]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadBootstrap() {
      try {
        const [bootstrapStatus, fixtureSummary] = await Promise.all([
          invoke<BootstrapStatus>("bootstrap_status"),
          invoke<FixtureRoot[]>("fixture_scan_summary"),
        ]);

        if (mounted) {
          setStatus(bootstrapStatus);
          setFixtures(fixtureSummary);
        }
      } catch (error) {
        if (mounted) {
          setRuntimeError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void loadBootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  const existingFixtureCount = useMemo(
    () => fixtures.filter((fixture) => fixture.exists).length,
    [fixtures],
  );

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="AgentDock navigation">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            AD
          </div>
          <div>
            <h1>AgentDock</h1>
            <p>Local desktop dashboard</p>
          </div>
        </div>

        <nav className="navList">
          {navigation.map((item, index) => (
            <button
              className={index === 0 ? "navItem navItemActive" : "navItem"}
              key={item}
              type="button"
            >
              <span aria-hidden="true" />
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="sectionLabel">Phase 0</p>
            <h2>Project bootstrap</h2>
          </div>
          <div className="statusPill">Local only</div>
        </header>

        <section className="panel">
          <div className="panelHeader">
            <h3>Bootstrap status</h3>
            <p>No real OpenClaw or Hermes roots are scanned in Phase 0.</p>
          </div>

          {runtimeError ? (
            <div className="errorBox">{runtimeError}</div>
          ) : (
            <div className="statusGrid">
              <div>
                <span>Desktop runtime</span>
                <strong>{status ? "Tauri command bridge ready" : "Loading"}</strong>
              </div>
              <div>
                <span>SQLite</span>
                <strong>{status?.database.db_path ?? "Preparing local database"}</strong>
              </div>
              <div>
                <span>Fixture roots</span>
                <strong>
                  {fixtures.length > 0
                    ? `${existingFixtureCount}/${fixtures.length} present`
                    : "Loading"}
                </strong>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h3>Phase boundary</h3>
            <p>
              This shell intentionally excludes Web UI, SaaS, login, cloud sync,
              template market, chat UI, and secret migration.
            </p>
          </div>
          <div className="boundaryList">
            <span>API keys are not displayed or stored</span>
            <span>Bot tokens are not displayed or stored</span>
            <span>OAuth and encrypted credentials are not migrated</span>
          </div>
        </section>
      </section>
    </main>
  );
}
