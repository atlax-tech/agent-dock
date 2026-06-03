import { useMemo, useState } from "react";

type DockRoute = "dashboard" | "migration" | "settings";
type RuntimeProduct = "openclaw" | "hermes";
type ThemeMode = "light" | "dark";

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

type MockRuntime = {
  product: RuntimeProduct;
  label: string;
  entityLabel: string;
  addLabel: string;
  installed: boolean;
  cliPath: string;
  version: string;
  homeDir: string;
  gateway: string;
  confidence: string;
  items: string[];
};

const dockRoutes: { id: DockRoute; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "migration", label: "Migration" },
  { id: "settings", label: "Settings" },
];

const operationNodes: { id: OperationNode; label: string; description: string }[] = [
  {
    id: "basic",
    label: "基础设置",
    description: "名称、描述、环境变量、回收、重启 agent 或网关等基础管理入口。",
  },
  {
    id: "provider",
    label: "模型 Provider 配置",
    description: "Provider、默认模型、备用模型与密钥引用的配置区域。",
  },
  {
    id: "personality",
    label: "人格设置",
    description: "按 OpenClaw / Hermes 各自结构展示人格与工具指导文件。",
  },
  {
    id: "sessions",
    label: "会话管理",
    description: "只展示会话元数据列表；默认不读取会话全文。",
  },
  {
    id: "memories",
    label: "记忆管理",
    description: "按日期和来源展示记忆元数据；默认不读取记忆全文。",
  },
  {
    id: "skills",
    label: "Skills 管理",
    description: "展示 skills 文件、来源、状态与后续安全编辑入口。",
  },
  {
    id: "permissions",
    label: "权限管理",
    description: "权限模式、单项开关、风险级别与重启要求的管理区域。",
  },
  {
    id: "channels",
    label: "Channel 管理",
    description: "展示已配置 channel、密钥引用状态与后续连通性测试入口。",
  },
  {
    id: "scheduledTasks",
    label: "定时任务管理",
    description: "展示 cron、heartbeat、background task 等定时任务入口。",
  },
];

const mockRuntimes: Record<RuntimeProduct, MockRuntime> = {
  openclaw: {
    product: "openclaw",
    label: "OpenClaw",
    entityLabel: "Agent",
    addLabel: "+ Add Agent",
    installed: true,
    cliPath: "/usr/local/bin/openclaw",
    version: "v0.3 mock",
    homeDir: "~/.openclaw",
    gateway: "未检查",
    confidence: "mock / layout only",
    items: ["main", "consulting-agent", "dev-agent"],
  },
  hermes: {
    product: "hermes",
    label: "Hermes",
    entityLabel: "Profile",
    addLabel: "+ Add Profile",
    installed: false,
    cliPath: "/usr/local/bin/hermes",
    version: "v0.3 mock",
    homeDir: "~/.hermes",
    gateway: "未检查",
    confidence: "mock / layout only",
    items: ["default", "consulting", "auto-business"],
  },
};

const settingsModules = [
  {
    title: "App data directory",
    status: "~/.agentdock",
    detail: "查看 AgentDock 本地索引、备份、trash 与后续应用数据位置。",
  },
  {
    title: "Sync",
    status: "官方不提供云同步",
    detail: "未来可接入用户自己的 iCloud / OneDrive / Google Drive，同步配置应用前必须先确认本机 runtime 已安装。",
  },
  {
    title: "Backup/Trash",
    status: "本地备份与回收站",
    detail: "集中管理 diff 前备份、软删除项目、恢复计划与保留策略。",
  },
  {
    title: "Updates",
    status: "占位",
    detail: "后续用于检查 AgentDock 更新、runtime 官方安装方式变化与兼容性提示。",
  },
  {
    title: "Logs",
    status: "本地日志",
    detail: "后续展示 AgentDock 自身日志，不上传会话、记忆或配置内容。",
  },
  {
    title: "Language",
    status: "中 / EN",
    detail: "当前默认中文优先；英文仅作为语言切换占位。",
  },
  {
    title: "Theme",
    status: "白天 / 深夜",
    detail: "点击顶部主题按钮切换；根据系统设置的下拉选项保留为后续能力。",
  },
  {
    title: "Footer links",
    status: "GitHub / Buy me a coffee / Version / Updates / Privacy",
    detail: "底部链接模块占位，后续连接开源仓库、赞助、版本、产品更新和隐私声明。",
  },
];

export function App() {
  const [activeRoute, setActiveRoute] = useState<DockRoute>("dashboard");
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeProduct>("openclaw");
  const [expandedItem, setExpandedItem] = useState("main");
  const [selectedItem, setSelectedItem] = useState("main");
  const [selectedOperation, setSelectedOperation] = useState<OperationNode>("basic");
  const [theme, setTheme] = useState<ThemeMode>("light");

  const runtime = mockRuntimes[selectedRuntime];
  const selectedOperationNode = useMemo(
    () => operationNodes.find((node) => node.id === selectedOperation) ?? operationNodes[0],
    [selectedOperation],
  );

  function selectRuntime(product: RuntimeProduct) {
    const nextRuntime = mockRuntimes[product];
    const nextItem = nextRuntime.items[0];
    setSelectedRuntime(product);
    setExpandedItem(nextItem);
    setSelectedItem(nextItem);
    setSelectedOperation("basic");
  }

  return (
    <main className="appShell">
      <aside className="dock" aria-label="AgentDock navigation">
        <div className="brandBlock">
          <div className="brandMark" aria-hidden="true">
            AD
          </div>
          <div>
            <h1>AgentDock</h1>
            <p>本地 Agent 管理器</p>
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
            <p className="eyebrow">Local-first desktop manager</p>
            <h2>{routeTitle(activeRoute)}</h2>
          </div>

          <div className="topControls" aria-label="Application display controls">
            <button className="topButton" type="button">
              中 / EN
            </button>
            <button
              className="topButton"
              type="button"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? "白天" : "深夜"}
            </button>
          </div>
        </header>

        {activeRoute === "dashboard" ? (
          <DashboardView
            expandedItem={expandedItem}
            runtime={runtime}
            selectedItem={selectedItem}
            selectedOperation={selectedOperation}
            selectedOperationNode={selectedOperationNode}
            selectedRuntime={selectedRuntime}
            setExpandedItem={setExpandedItem}
            setSelectedItem={setSelectedItem}
            setSelectedOperation={setSelectedOperation}
            setSelectedRuntime={selectRuntime}
          />
        ) : null}
        {activeRoute === "migration" ? <MigrationView /> : null}
        {activeRoute === "settings" ? <SettingsView /> : null}
      </section>
    </main>
  );
}

function DashboardView({
  expandedItem,
  runtime,
  selectedItem,
  selectedOperation,
  selectedOperationNode,
  selectedRuntime,
  setExpandedItem,
  setSelectedItem,
  setSelectedOperation,
  setSelectedRuntime,
}: {
  expandedItem: string;
  runtime: MockRuntime;
  selectedItem: string;
  selectedOperation: OperationNode;
  selectedOperationNode: { id: OperationNode; label: string; description: string };
  selectedRuntime: RuntimeProduct;
  setExpandedItem: (item: string) => void;
  setSelectedItem: (item: string) => void;
  setSelectedOperation: (operation: OperationNode) => void;
  setSelectedRuntime: (runtime: RuntimeProduct) => void;
}) {
  return (
    <div className="dashboardStack">
      <section className="dashboardToolbar">
        <div className="runtimeSwitcher" aria-label="Runtime product switcher">
          {(["openclaw", "hermes"] as RuntimeProduct[]).map((product) => (
            <button
              className={selectedRuntime === product ? "runtimeActive" : ""}
              key={product}
              type="button"
              onClick={() => setSelectedRuntime(product)}
            >
              {mockRuntimes[product].label}
            </button>
          ))}
        </div>
        <button className="secondaryButton" type="button" disabled>
          全局环境变量
        </button>
      </section>

      {runtime.installed ? (
        <InstalledDashboard
          expandedItem={expandedItem}
          runtime={runtime}
          selectedItem={selectedItem}
          selectedOperation={selectedOperation}
          selectedOperationNode={selectedOperationNode}
          setExpandedItem={setExpandedItem}
          setSelectedItem={setSelectedItem}
          setSelectedOperation={setSelectedOperation}
        />
      ) : (
        <NotInstalledDashboard runtime={runtime} />
      )}
    </div>
  );
}

function InstalledDashboard({
  expandedItem,
  runtime,
  selectedItem,
  selectedOperation,
  selectedOperationNode,
  setExpandedItem,
  setSelectedItem,
  setSelectedOperation,
}: {
  expandedItem: string;
  runtime: MockRuntime;
  selectedItem: string;
  selectedOperation: OperationNode;
  selectedOperationNode: { id: OperationNode; label: string; description: string };
  setExpandedItem: (item: string) => void;
  setSelectedItem: (item: string) => void;
  setSelectedOperation: (operation: OperationNode) => void;
}) {
  return (
    <>
      <section className="runtimeStatus" aria-label={`${runtime.label} runtime status`}>
        <div>
          <span>CLI</span>
          <strong>{runtime.cliPath}</strong>
        </div>
        <div>
          <span>Version</span>
          <strong>{runtime.version}</strong>
        </div>
        <div>
          <span>Home / config</span>
          <strong>{runtime.homeDir}</strong>
        </div>
        <div>
          <span>Gateway</span>
          <strong>{runtime.gateway}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{runtime.confidence}</strong>
        </div>
      </section>

      <section className="managementLayout">
        <article className="treePanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">{runtime.label}</p>
              <h3>{runtime.entityLabel} 列表</h3>
            </div>
          </div>

          <div className="accordionTree">
            {runtime.items.map((item) => {
              const expanded = expandedItem === item;
              return (
                <div className="agentAccordion" key={item}>
                  <button
                    className={selectedItem === item ? "agentHeader agentHeaderActive" : "agentHeader"}
                    type="button"
                    onClick={() => {
                      setExpandedItem(expanded ? "" : item);
                      setSelectedItem(item);
                      setSelectedOperation("basic");
                    }}
                  >
                    <span>{item}</span>
                    <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                  </button>
                  {expanded ? (
                    <div className="operationList">
                      {operationNodes.map((node) => (
                        <button
                          className={
                            selectedItem === item && selectedOperation === node.id
                              ? "operationItem operationItemActive"
                              : "operationItem"
                          }
                          key={`${item}:${node.id}`}
                          type="button"
                          onClick={() => {
                            setSelectedItem(item);
                            setSelectedOperation(node.id);
                          }}
                        >
                          {node.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <button className="addAgentButton" type="button" disabled>
            {runtime.addLabel}
          </button>
        </article>

        <article className="operationPane">
          <div>
            <p className="eyebrow">OperationPane</p>
            <h3>{selectedOperationNode.label}</h3>
          </div>
          <dl className="paneMeta">
            <div>
              <dt>Runtime</dt>
              <dd>{runtime.label}</dd>
            </div>
            <div>
              <dt>{runtime.entityLabel}</dt>
              <dd>{selectedItem}</dd>
            </div>
            <div>
              <dt>Operation</dt>
              <dd>{selectedOperationNode.label}</dd>
            </div>
          </dl>
          <p>{selectedOperationNode.description}</p>
          <div className="safetyList">
            <span>只读占位</span>
            <span>未调用后端命令</span>
            <span>默认不读取会话/记忆全文</span>
            <span>不迁移 secret / token / pairing state</span>
          </div>
        </article>
      </section>
    </>
  );
}

function NotInstalledDashboard({ runtime }: { runtime: MockRuntime }) {
  return (
    <section className="notInstalledPanel">
      <div>
        <p className="eyebrow">未安装状态</p>
        <h3>{runtime.label} 未安装，是否需要安装？</h3>
      </div>
      <p>
        后续安装流程将以官方安装方式为准，先展示命令预览，再让用户选择安装方式和安装位置。
        当前区域仅用于布局验证，不会执行命令或访问网络。
      </p>
      <button type="button" disabled>
        安装 {runtime.label}
      </button>
      <div className="commandPreview">
        <span>命令预览占位</span>
        <code># official {runtime.label} install command preview</code>
      </div>
    </section>
  );
}

function MigrationView() {
  const openclawAgents = mockRuntimes.openclaw.items;
  const hermesProfiles = mockRuntimes.hermes.items;

  return (
    <section className="migrationWorkspace">
      <article className="migrationColumn">
        <div>
          <p className="eyebrow">OpenClaw agents</p>
          <h3>OpenClaw</h3>
        </div>
        <div className="migrationList">
          {openclawAgents.map((agent) => (
            <button type="button" key={agent}>
              {agent}
            </button>
          ))}
        </div>
      </article>

      <article className="migrationControls">
        <button type="button" disabled>
          OpenClaw → Hermes
        </button>
        <button type="button" disabled>
          Hermes → OpenClaw
        </button>
        <div className="migrationNotice">
          <strong>保存前必须预览</strong>
          <span>迁移会先生成预览、diff、备份计划和风险提示。</span>
          <span>secret、token、auth、cookies、encrypted store、channel pairing state 不会自动迁移。</span>
        </div>
      </article>

      <article className="migrationColumn">
        <div>
          <p className="eyebrow">Hermes profiles</p>
          <h3>Hermes</h3>
        </div>
        <div className="migrationList">
          {hermesProfiles.map((profile) => (
            <button type="button" key={profile}>
              {profile}
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

function SettingsView() {
  return (
    <section className="settingsWorkspace">
      <div className="settingsHeader">
        <p className="eyebrow">AgentDock 设置</p>
        <h3>本地应用设置模块</h3>
      </div>
      <div className="settingsList">
        {settingsModules.map((module) => (
          <article className="settingsModule" key={module.title}>
            <div>
              <h4>{module.title}</h4>
              <p>{module.detail}</p>
            </div>
            <span>{module.status}</span>
          </article>
        ))}
      </div>
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
