import { useMemo, useState } from "react";

type DockRoute = "dashboard" | "migration" | "settings";
type RuntimeProduct = "openclaw" | "hermes";
type LanguageMode = "zh" | "en";
type ThemeMode = "system" | "light" | "dark";

type OperationNode =
  | "basic"
  | "provider"
  | "personality"
  | "sessions"
  | "memories"
  | "skills"
  | "permissions"
  | "channels"
  | "scheduledTasks";

const dockRoutes: { id: DockRoute; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "migration", label: "Migration" },
  { id: "settings", label: "Settings" },
];

const runtimeProducts: { id: RuntimeProduct; label: string; entity: string }[] = [
  { id: "openclaw", label: "OpenClaw", entity: "agent" },
  { id: "hermes", label: "Hermes", entity: "profile" },
];

const operationNodes: { id: OperationNode; label: string; description: string }[] = [
  {
    id: "basic",
    label: "Basic",
    description: "Identity, config roots, cwd, runtime warnings, and confidence.",
  },
  {
    id: "provider",
    label: "Provider",
    description: "Provider/model metadata, API key references, and connection checks.",
  },
  {
    id: "personality",
    label: "Personality",
    description: "Whitelisted personality files such as SOUL.md, AGENTS.md, or USER.md.",
  },
  {
    id: "sessions",
    label: "Sessions",
    description: "Session metadata only; full conversation content remains closed by default.",
  },
  {
    id: "memories",
    label: "Memories",
    description: "Memory metadata only; full memory content requires explicit user action later.",
  },
  {
    id: "skills",
    label: "Skills",
    description: "Installed skills, local paths, source, and safety status.",
  },
  {
    id: "permissions",
    label: "Permissions",
    description: "File, exec, browser, message, cron, gateway, and runtime-specific risks.",
  },
  {
    id: "channels",
    label: "Channels",
    description: "Channel bindings and redacted token/pairing status.",
  },
  {
    id: "scheduledTasks",
    label: "Scheduled Tasks",
    description: "Cron, heartbeat, background task status, and runtime-specific schedules.",
  },
];

function runtimeLabel(product: RuntimeProduct) {
  return runtimeProducts.find((runtime) => runtime.id === product)?.label ?? product;
}

function runtimeEntity(product: RuntimeProduct) {
  return runtimeProducts.find((runtime) => runtime.id === product)?.entity ?? "agent/profile";
}

export function App() {
  const [activeRoute, setActiveRoute] = useState<DockRoute>("dashboard");
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeProduct>("openclaw");
  const [selectedOperation, setSelectedOperation] = useState<OperationNode>("basic");
  const [language, setLanguage] = useState<LanguageMode>("zh");
  const [theme, setTheme] = useState<ThemeMode>("system");

  const selectedOperationNode = useMemo(
    () => operationNodes.find((node) => node.id === selectedOperation) ?? operationNodes[0],
    [selectedOperation],
  );

  return (
    <main className="appShell">
      <aside className="dock" aria-label="AgentDock navigation">
        <div className="brandBlock">
          <div className="brandMark" aria-hidden="true">
            AD
          </div>
          <div>
            <h1>AgentDock</h1>
            <p>Local runtime manager</p>
          </div>
        </div>

        <nav className="dockNav">
          {dockRoutes.map((route) => (
            <button
              className={activeRoute === route.id ? "dockItem dockItemActive" : "dockItem"}
              key={route.id}
              type="button"
              onClick={() => setActiveRoute(route.id)}
            >
              {route.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topBar">
          <div>
            <p className="eyebrow">Local-first desktop control surface</p>
            <h2>{routeTitle(activeRoute)}</h2>
          </div>

          <div className="topControls" aria-label="Application display controls">
            <div className="segmentedControl" aria-label="Language">
              {(["zh", "en"] as LanguageMode[]).map((mode) => (
                <button
                  className={language === mode ? "segmentActive" : ""}
                  key={mode}
                  type="button"
                  onClick={() => setLanguage(mode)}
                >
                  {mode === "zh" ? "中文" : "EN"}
                </button>
              ))}
            </div>

            <div className="segmentedControl" aria-label="Theme">
              {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
                <button
                  className={theme === mode ? "segmentActive" : ""}
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
                >
                  {themeLabel(mode)}
                </button>
              ))}
            </div>
          </div>
        </header>

        {activeRoute === "dashboard" ? (
          <DashboardView
            selectedOperation={selectedOperation}
            selectedOperationNode={selectedOperationNode}
            selectedRuntime={selectedRuntime}
            setSelectedOperation={setSelectedOperation}
            setSelectedRuntime={setSelectedRuntime}
          />
        ) : null}
        {activeRoute === "migration" ? <MigrationView /> : null}
        {activeRoute === "settings" ? <SettingsView language={language} theme={theme} /> : null}
      </section>
    </main>
  );
}

function DashboardView({
  selectedOperation,
  selectedOperationNode,
  selectedRuntime,
  setSelectedOperation,
  setSelectedRuntime,
}: {
  selectedOperation: OperationNode;
  selectedOperationNode: { id: OperationNode; label: string; description: string };
  selectedRuntime: RuntimeProduct;
  setSelectedOperation: (operation: OperationNode) => void;
  setSelectedRuntime: (runtime: RuntimeProduct) => void;
}) {
  const runtime = runtimeLabel(selectedRuntime);
  const entity = runtimeEntity(selectedRuntime);

  return (
    <div className="dashboardStack">
      <section className="dashboardToolbar">
        <div className="runtimeSwitcher" aria-label="Runtime product switcher">
          {runtimeProducts.map((product) => (
            <button
              className={selectedRuntime === product.id ? "runtimeActive" : ""}
              key={product.id}
              type="button"
              onClick={() => setSelectedRuntime(product.id)}
            >
              {product.label}
            </button>
          ))}
        </div>
        <button className="secondaryButton" type="button" disabled>
          Global Env
        </button>
      </section>

      <section className="statusGrid" aria-label={`${runtime} install status`}>
        <article className="statusPanel">
          <div>
            <p className="eyebrow">Not installed placeholder</p>
            <h3>{runtime} is not connected</h3>
          </div>
          <p>
            Install planning will use official runtime guidance, command preview, explicit
            confirmation, and rollback reporting. This placeholder does not run commands.
          </p>
          <button type="button" disabled>
            Prepare install plan
          </button>
        </article>

        <article className="statusPanel">
          <div>
            <p className="eyebrow">Installed placeholder</p>
            <h3>{runtime} runtime status</h3>
          </div>
          <dl className="statusList">
            <div>
              <dt>CLI path</dt>
              <dd>Not scanned</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>Unknown</dd>
            </div>
            <div>
              <dt>Home / config</dt>
              <dd>Not confirmed</dd>
            </div>
            <div>
              <dt>Gateway</dt>
              <dd>Not checked</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>unknown</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="dashboardGrid">
        <article className="treePanel">
          <div>
            <p className="eyebrow">Agent/profile tree placeholder</p>
            <h3>
              {runtime} {entity} operations
            </h3>
          </div>

          <div className="treeRoot">
            <div className="treeRuntime">{runtime}</div>
            <div className="treeAgent">No {entity} selected</div>
            <div className="operationList">
              {operationNodes.map((node) => (
                <button
                  className={
                    selectedOperation === node.id ? "operationItem operationItemActive" : "operationItem"
                  }
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedOperation(node.id)}
                >
                  {node.label}
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="operationPane">
          <div>
            <p className="eyebrow">Right-side operation pane placeholder</p>
            <h3>{selectedOperationNode.label}</h3>
          </div>
          <p>{selectedOperationNode.description}</p>
          <div className="safetyList">
            <span>Read-only scaffold</span>
            <span>No backend command invoked</span>
            <span>No session or memory content read</span>
            <span>No secret migration</span>
          </div>
        </article>
      </section>
    </div>
  );
}

function MigrationView() {
  return (
    <section className="placeholderPage">
      <div>
        <p className="eyebrow">Migration placeholder</p>
        <h3>OpenClaw <span aria-hidden="true">↔</span> Hermes migration</h3>
      </div>
      <p>
        Migration will start with a scan, explicit preview, diff, backup, atomic write, rescan,
        and report. Nothing is copied or written in this placeholder.
      </p>
      <div className="policyGrid">
        <span>Secrets are not auto-migrated</span>
        <span>Channel pairing state is not copied</span>
        <span>Sessions and memories stay metadata-first</span>
        <span>Runtime differences remain explicit</span>
      </div>
    </section>
  );
}

function SettingsView({ language, theme }: { language: LanguageMode; theme: ThemeMode }) {
  return (
    <section className="placeholderPage">
      <div>
        <p className="eyebrow">Settings placeholder</p>
        <h3>Local-only preferences</h3>
      </div>
      <p>
        Future settings will manage language, theme, scan roots, backups, trash, and global
        environment references without cloud sync or telemetry.
      </p>
      <dl className="statusList">
        <div>
          <dt>Language</dt>
          <dd>{language === "zh" ? "中文" : "EN"}</dd>
        </div>
        <div>
          <dt>Theme</dt>
          <dd>{themeLabel(theme)}</dd>
        </div>
        <div>
          <dt>Privacy</dt>
          <dd>No cloud / no login / no telemetry</dd>
        </div>
      </dl>
    </section>
  );
}

function routeTitle(route: DockRoute) {
  if (route === "migration") {
    return "Migration";
  }
  if (route === "settings") {
    return "Settings";
  }
  return "Dashboard";
}

function themeLabel(mode: ThemeMode) {
  if (mode === "light") {
    return "Light";
  }
  if (mode === "dark") {
    return "Dark";
  }
  return "System";
}
