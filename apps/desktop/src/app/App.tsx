import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

type DockRoute = "dashboard" | "migration" | "settings";
type RuntimeProduct = "openclaw" | "hermes";
type ThemeMode = "light" | "dark";
type LanguageMode = "zh" | "en";
type DetectionConfidence = "unknown" | "low" | "medium" | "high";

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
  items: string[];
};

type RuntimeInstallStatus = {
  product: RuntimeProduct;
  installed: boolean;
  cliPath?: string | null;
  version?: string | null;
  updateAvailable?: boolean;
  updateCommand?: string | null;
  homeDir?: string | null;
  configPath?: string | null;
  gatewayRunning?: boolean | null;
  detectionConfidence: DetectionConfidence;
  warnings: string[];
};

type RuntimeWarning = {
  code: string;
  message: string;
  path?: string | null;
  severity: "info" | "warning" | "error";
};

type ProviderSummary = {
  provider?: string | null;
  baseUrl?: string | null;
  secretFields: string[];
  missingSecretFields: string[];
};

type ModelSummary = {
  defaultModel?: string | null;
  fallbackModel?: string | null;
};

type ConfigFileEntry = {
  path: string;
  role: string;
  sensitive: boolean;
  skipped: boolean;
};

type ManagedAgent = {
  id: string;
  product: RuntimeProduct;
  displayName: string;
  description?: string | null;
  agentKind: "openclaw-agent" | "hermes-profile";
  launchCommand?: string | null;
  configRoot: string;
  workspaceOrProfilePath: string;
  effectiveCwd?: string | null;
  configFiles: ConfigFileEntry[];
  providerSummary?: ProviderSummary | null;
  modelSummary?: ModelSummary | null;
  permissionSummary?: { status: string } | null;
  channelCount: number;
  skillCount: number;
  memoryCount?: number | null;
  sessionCount?: number | null;
  lastModified?: string | null;
  warnings: RuntimeWarning[];
  confidence: DetectionConfidence;
};

type DeleteAgentMutationPlan = {
  planHash: string;
  product: RuntimeProduct;
  agentId: string;
  operation: "delete-agent";
  affectedFiles: string[];
  trashTargetPath: string;
  backupRequired: boolean;
  backupPath: string;
  restartRequired: boolean;
  warnings: string[];
  blockedReason?: string | null;
};

type DeleteAgentMutationResult = {
  product: string;
  agentId: string;
  operation: string;
  sourcePath: string;
  trashTargetPath: string;
  backupPath: string;
  registryPath: string;
};

type AgentScanSource = "desktop" | "fixture" | "empty";
type ScanProgressState = "hidden" | "scanning" | "complete";
type DashboardRuntime = MockRuntime & RuntimeInstallStatus;
type TauriBridgeWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
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
    items: ["main", "consulting-agent", "dev-agent"],
  },
  hermes: {
    product: "hermes",
    label: "Hermes",
    entityLabel: "Profile",
    addLabel: "+ Add Profile",
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
];

const settingsFooterLinks = ["GitHub", "Buy me a coffee", "Version", "Updates", "Privacy"];

export function App() {
  const [activeRoute, setActiveRoute] = useState<DockRoute>("dashboard");
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeProduct>("openclaw");
  const [expandedItem, setExpandedItem] = useState("main");
  const [selectedItem, setSelectedItem] = useState("main");
  const [selectedOperation, setSelectedOperation] = useState<OperationNode>("basic");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [language, setLanguage] = useState<LanguageMode>("zh");
  const [runtimeStatuses, setRuntimeStatuses] = useState<Record<RuntimeProduct, RuntimeInstallStatus>>(
    getBrowserRuntimeDetectionFallback,
  );
  const [managedAgents, setManagedAgents] = useState<ManagedAgent[]>(getBrowserManagedAgentFallback);
  const [agentScanSource, setAgentScanSource] = useState<AgentScanSource>(() =>
    getBrowserFixtureEnabled() ? "fixture" : "empty",
  );
  const [agentScanState, setAgentScanState] = useState<"loading" | "ready" | "error">("loading");
  const [agentScanError, setAgentScanError] = useState("");
  const [scanProgressState, setScanProgressState] = useState<ScanProgressState>("hidden");
  const [rescanRequestId, setRescanRequestId] = useState(0);
  const [runtimeDetectionRequestId, setRuntimeDetectionRequestId] = useState(0);
  const [runtimeDetectionState, setRuntimeDetectionState] = useState<"loading" | "ready" | "error">("loading");
  const [runtimeDetectionError, setRuntimeDetectionError] = useState("");
  const [runtimeUpdateState, setRuntimeUpdateState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [runtimeUpdateMessage, setRuntimeUpdateMessage] = useState("");
  const [deleteAgentPlan, setDeleteAgentPlan] = useState<DeleteAgentMutationPlan | null>(null);
  const [deleteAgentApplyState, setDeleteAgentApplyState] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [deleteAgentApplyResult, setDeleteAgentApplyResult] = useState<
    DeleteAgentMutationResult | null
  >(null);
  const [deleteAgentApplyError, setDeleteAgentApplyError] = useState("");

  const runtime = useMemo(
    () => ({
      ...mockRuntimes[selectedRuntime],
      ...runtimeStatuses[selectedRuntime],
    }),
    [runtimeStatuses, selectedRuntime],
  );
  const selectedOperationNode = useMemo(
    () => operationNodes.find((node) => node.id === selectedOperation) ?? operationNodes[0],
    [selectedOperation],
  );
  const runtimeAgents = useMemo(
    () => managedAgents.filter((agent) => agent.product === selectedRuntime),
    [managedAgents, selectedRuntime],
  );
  const selectedAgent = useMemo(
    () => runtimeAgents.find((agent) => agent.id === selectedItem) ?? runtimeAgents[0] ?? null,
    [runtimeAgents, selectedItem],
  );

  useEffect(() => {
    let cancelled = false;

    if (!hasTauriCommandBridge()) {
      setRuntimeDetectionState("error");
      setRuntimeDetectionError("Tauri command bridge unavailable in browser preview.");
      return () => {
        cancelled = true;
      };
    }

    invoke<RuntimeInstallStatus[]>("detect_runtime_install_statuses")
      .then((statuses) => {
        if (cancelled) {
          return;
        }

        setRuntimeStatuses(normalizeRuntimeStatuses(statuses));
        setRuntimeDetectionState("ready");
        setRuntimeDetectionError("");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setRuntimeDetectionState("error");
        setRuntimeDetectionError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [runtimeDetectionRequestId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    if (!hasTauriCommandBridge()) {
      setAgentScanState(getBrowserFixtureEnabled() ? "ready" : "error");
      setAgentScanError("Tauri command bridge unavailable in browser preview.");
      return () => {
        cancelled = true;
      };
    }

    if (activeRoute !== "dashboard") {
      return () => {
        cancelled = true;
      };
    }

    setAgentScanState("loading");
    setAgentScanError("");
    setScanProgressState("scanning");
    timer = window.setTimeout(() => {
      invoke<ManagedAgent[]>("scan_managed_agents")
        .then((agents) => {
          if (cancelled) {
            return;
          }

          setManagedAgents(normalizeManagedAgents(agents));
          setAgentScanSource("desktop");
          setAgentScanState("ready");
          setAgentScanError("");
          setScanProgressState("complete");
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          setAgentScanState("error");
          setAgentScanError(error instanceof Error ? error.message : String(error));
          setScanProgressState("hidden");
        });
    }, 0);

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [activeRoute, rescanRequestId]);

  useEffect(() => {
    if (scanProgressState !== "complete") {
      return;
    }

    const timer = window.setTimeout(() => {
      setScanProgressState("hidden");
    }, 1600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [scanProgressState]);

  useEffect(() => {
    if (runtimeAgents.length === 0) {
      setExpandedItem("");
      setSelectedItem("");
      setSelectedOperation("basic");
      return;
    }

    if (!runtimeAgents.some((agent) => agent.id === selectedItem)) {
      setExpandedItem(runtimeAgents[0].id);
      setSelectedItem(runtimeAgents[0].id);
      setSelectedOperation("basic");
    }
  }, [runtimeAgents, selectedItem]);

  function selectRuntime(product: RuntimeProduct) {
    const nextItem = managedAgents.find((agent) => agent.product === product)?.id ?? "";
    setSelectedRuntime(product);
    setExpandedItem(nextItem);
    setSelectedItem(nextItem);
    setSelectedOperation("basic");
  }

  function requestRescan() {
    setRescanRequestId((current) => current + 1);
  }

  function requestRuntimeUpdate(product: RuntimeProduct) {
    if (!hasTauriCommandBridge()) {
      setRuntimeUpdateState("error");
      setRuntimeUpdateMessage("Tauri command bridge unavailable.");
      return;
    }

    setRuntimeUpdateState("running");
    setRuntimeUpdateMessage("");
    invoke<string>("update_runtime_product", { product })
      .then(() => {
        setRuntimeUpdateState("success");
        setRuntimeUpdateMessage("升级完成");
        setRuntimeStatuses((current) => ({
          ...current,
          [product]: {
            ...current[product],
            updateAvailable: false,
          },
        }));
        setRuntimeDetectionRequestId((current) => current + 1);
        setRescanRequestId((current) => current + 1);
      })
      .catch((error: unknown) => {
        setRuntimeUpdateState("error");
        setRuntimeUpdateMessage(error instanceof Error ? error.message : String(error));
      });
  }

  function dismissDeletePlan() {
    setDeleteAgentPlan(null);
    setDeleteAgentApplyState("idle");
    setDeleteAgentApplyResult(null);
    setDeleteAgentApplyError("");
  }

  function applyDeleteAgentPlan(plan: DeleteAgentMutationPlan) {
    if (!hasTauriCommandBridge()) {
      setDeleteAgentApplyState("error");
      setDeleteAgentApplyError("Tauri command bridge unavailable.");
      return;
    }

    setDeleteAgentApplyState("running");
    setDeleteAgentApplyError("");
    invoke<DeleteAgentMutationResult>("apply_delete_agent_mutation_plan", {
      request: { plan },
    })
      .then((result) => {
        setDeleteAgentApplyState("success");
        setDeleteAgentApplyResult(result);
        // Do NOT call setDeleteAgentPlan(null) here.
        // The success notice is rendered inside the preview surface
        // (conditionally on deleteAgentPlan being non-null).
        // Clearing deleteAgentPlan would unmount the preview and hide
        // the success result before the user sees it.
        // State is cleared only when the user clicks Close/Cancel.
        setRescanRequestId((current) => current + 1);
        setRuntimeDetectionRequestId((current) => current + 1);
      })
      .catch((error: unknown) => {
        setDeleteAgentApplyState("error");
        setDeleteAgentApplyError(error instanceof Error ? error.message : String(error));
      });
  }

  function requestDeleteAgentPlan(agent: ManagedAgent) {
    if (!hasTauriCommandBridge()) {
      console.warn("Tauri command bridge unavailable; delete-agent plan was not requested.");
      return;
    }

    invoke<DeleteAgentMutationPlan>("create_delete_agent_mutation_plan", {
      request: {
        product: agent.product,
        agentId: agent.id,
        agentPath: agent.workspaceOrProfilePath,
      },
    })
      .then((plan) => {
        setDeleteAgentPlan(plan);
        setDeleteAgentApplyState("idle");
        setDeleteAgentApplyResult(null);
        setDeleteAgentApplyError("");
      })
      .catch((error: unknown) => {
        console.error("Failed to create delete-agent MutationPlan", error);
      });
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
            <button
              className="topButton languageButton"
              type="button"
              aria-label="切换语言"
              title="切换语言"
              onClick={() => setLanguage((current) => (current === "zh" ? "en" : "zh"))}
            >
              {language === "zh" ? "中" : "EN"}
            </button>
            <button
              className="topButton iconButton"
              type="button"
              aria-label="切换主题"
              title="切换主题"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="M4.93 4.93l1.41 1.41" />
                  <path d="M17.66 17.66l1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="M4.93 19.07l1.41-1.41" />
                  <path d="M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M20.4 14.4A8.2 8.2 0 0 1 9.6 3.6 8.7 8.7 0 1 0 20.4 14.4Z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {activeRoute === "dashboard" ? (
          <DashboardView
            expandedItem={expandedItem}
            runtime={runtime}
            runtimeAgents={runtimeAgents}
            selectedAgent={selectedAgent}
            selectedItem={selectedItem}
            selectedOperation={selectedOperation}
            selectedOperationNode={selectedOperationNode}
            selectedRuntime={selectedRuntime}
            agentScanError={agentScanError}
            agentScanSource={agentScanSource}
            agentScanState={agentScanState}
            onRequestRescan={requestRescan}
            scanProgressState={scanProgressState}
            runtimeDetectionError={runtimeDetectionError}
            runtimeDetectionState={runtimeDetectionState}
            runtimeUpdateMessage={runtimeUpdateMessage}
            runtimeUpdateState={runtimeUpdateState}
            onRequestRuntimeUpdate={requestRuntimeUpdate}
            onRequestDeleteAgentPlan={requestDeleteAgentPlan}
            deleteAgentPlan={deleteAgentPlan}
            onDismissDeletePlan={dismissDeletePlan}
            onApplyDeleteAgentPlan={applyDeleteAgentPlan}
            deleteAgentApplyState={deleteAgentApplyState}
            deleteAgentApplyError={deleteAgentApplyError}
            deleteAgentApplyResult={deleteAgentApplyResult}
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
  agentScanError,
  agentScanSource,
  agentScanState,
  expandedItem,
  runtime,
  runtimeAgents,
  selectedAgent,
  selectedItem,
  selectedOperation,
  selectedOperationNode,
  selectedRuntime,
  onRequestRescan,
  scanProgressState,
  runtimeDetectionError,
  runtimeDetectionState,
  runtimeUpdateMessage,
  runtimeUpdateState,
  onRequestRuntimeUpdate,
  onRequestDeleteAgentPlan,
  deleteAgentPlan,
  onDismissDeletePlan,
  onApplyDeleteAgentPlan,
  deleteAgentApplyState,
  deleteAgentApplyError,
  deleteAgentApplyResult,
  setExpandedItem,
  setSelectedItem,
  setSelectedOperation,
  setSelectedRuntime,
}: {
  agentScanError: string;
  agentScanSource: AgentScanSource;
  agentScanState: "loading" | "ready" | "error";
  expandedItem: string;
  runtime: DashboardRuntime;
  runtimeAgents: ManagedAgent[];
  selectedAgent: ManagedAgent | null;
  selectedItem: string;
  selectedOperation: OperationNode;
  selectedOperationNode: { id: OperationNode; label: string; description: string };
  selectedRuntime: RuntimeProduct;
  onRequestRescan: () => void;
  scanProgressState: ScanProgressState;
  runtimeDetectionError: string;
  runtimeDetectionState: "loading" | "ready" | "error";
  runtimeUpdateMessage: string;
  runtimeUpdateState: "idle" | "running" | "success" | "error";
  onRequestRuntimeUpdate: (product: RuntimeProduct) => void;
  onRequestDeleteAgentPlan: (agent: ManagedAgent) => void;
  deleteAgentPlan: DeleteAgentMutationPlan | null;
  onDismissDeletePlan: () => void;
  onApplyDeleteAgentPlan: (plan: DeleteAgentMutationPlan) => void;
  deleteAgentApplyState: "idle" | "running" | "success" | "error";
  deleteAgentApplyError: string;
  deleteAgentApplyResult: DeleteAgentMutationResult | null;
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
        <button
          className="rescanButton"
          type="button"
          aria-label="重新扫描"
          title="重新扫描"
          disabled={scanProgressState === "scanning"}
          onClick={onRequestRescan}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M20 6v5h-5" />
            <path d="M4 18v-5h5" />
            <path d="M19 11a7 7 0 0 0-12.2-4.7L4 9" />
            <path d="M5 13a7 7 0 0 0 12.2 4.7L20 15" />
          </svg>
        </button>
        <ScanProgressIndicator state={scanProgressState} />
        <button className="secondaryButton" type="button" disabled>
          全局环境变量
        </button>
      </section>

      <RuntimeDetectionNotice state={runtimeDetectionState} error={runtimeDetectionError} />

      {runtime.installed ? (
        <InstalledDashboard
          agentScanError={agentScanError}
          agentScanSource={agentScanSource}
          agentScanState={agentScanState}
          expandedItem={expandedItem}
          runtime={runtime}
          runtimeAgents={runtimeAgents}
          runtimeUpdateMessage={runtimeUpdateMessage}
          runtimeUpdateState={runtimeUpdateState}
          selectedAgent={selectedAgent}
          selectedItem={selectedItem}
          selectedOperation={selectedOperation}
          selectedOperationNode={selectedOperationNode}
          setExpandedItem={setExpandedItem}
          setSelectedItem={setSelectedItem}
          setSelectedOperation={setSelectedOperation}
          onRequestRuntimeUpdate={onRequestRuntimeUpdate}
          onRequestDeleteAgentPlan={onRequestDeleteAgentPlan}
          deleteAgentPlan={deleteAgentPlan}
          onDismissDeletePlan={onDismissDeletePlan}
          onApplyDeleteAgentPlan={onApplyDeleteAgentPlan}
          deleteAgentApplyState={deleteAgentApplyState}
          deleteAgentApplyError={deleteAgentApplyError}
          deleteAgentApplyResult={deleteAgentApplyResult}
        />
      ) : (
        <NotInstalledDashboard runtime={runtime} />
      )}
    </div>
  );
}

function ScanProgressIndicator({ state }: { state: ScanProgressState }) {
  if (state === "hidden") {
    return null;
  }

  return (
    <div
      className={state === "complete" ? "toolbarScanProgress toolbarScanProgressComplete" : "toolbarScanProgress"}
      aria-live="polite"
    >
      <span>{state === "complete" ? "扫描完成" : "后台扫描中"}</span>
      {state === "scanning" ? (
        <div className="scanProgressTrack" aria-hidden="true">
          <div className="scanProgressBar" />
        </div>
      ) : null}
    </div>
  );
}

function InstalledDashboard({
  agentScanError,
  agentScanSource,
  agentScanState,
  expandedItem,
  runtime,
  runtimeAgents,
  runtimeUpdateMessage,
  runtimeUpdateState,
  selectedAgent,
  selectedItem,
  selectedOperation,
  selectedOperationNode,
  onRequestRuntimeUpdate,
  onRequestDeleteAgentPlan,
  deleteAgentPlan,
  onDismissDeletePlan,
  onApplyDeleteAgentPlan,
  deleteAgentApplyState,
  deleteAgentApplyError,
  deleteAgentApplyResult,
  setExpandedItem,
  setSelectedItem,
  setSelectedOperation,
}: {
  agentScanError: string;
  agentScanSource: AgentScanSource;
  agentScanState: "loading" | "ready" | "error";
  expandedItem: string;
  runtime: DashboardRuntime;
  runtimeAgents: ManagedAgent[];
  runtimeUpdateMessage: string;
  runtimeUpdateState: "idle" | "running" | "success" | "error";
  selectedAgent: ManagedAgent | null;
  selectedItem: string;
  selectedOperation: OperationNode;
  selectedOperationNode: { id: OperationNode; label: string; description: string };
  onRequestRuntimeUpdate: (product: RuntimeProduct) => void;
  onRequestDeleteAgentPlan: (agent: ManagedAgent) => void;
  deleteAgentPlan: DeleteAgentMutationPlan | null;
  onDismissDeletePlan: () => void;
  onApplyDeleteAgentPlan: (plan: DeleteAgentMutationPlan) => void;
  deleteAgentApplyState: "idle" | "running" | "success" | "error";
  deleteAgentApplyError: string;
  deleteAgentApplyResult: DeleteAgentMutationResult | null;
  setExpandedItem: (item: string) => void;
  setSelectedItem: (item: string) => void;
  setSelectedOperation: (operation: OperationNode) => void;
}) {
  return (
    <>
      <section className="runtimeStatus" aria-label={`${runtime.label} runtime status`}>
        <div>
          <span>Version</span>
          <strong>{runtime.version ?? "未读取到"}</strong>
          {runtime.updateAvailable ? (
            <button
              className="inlineUpdateButton"
              type="button"
              disabled={runtimeUpdateState === "running"}
              onClick={() => onRequestRuntimeUpdate(runtime.product)}
            >
              {runtimeUpdateState === "running" ? "升级中" : "有新版本可用"}
            </button>
          ) : null}
        </div>
      </section>
      {runtimeUpdateState === "error" ? (
        <section className="runtimeUpdateNotice runtimeUpdateNoticeWarning">
          {runtimeUpdateMessage}
        </section>
      ) : null}
      <AgentScanNotice source={agentScanSource} state={agentScanState} error={agentScanError} />

      <section className="managementLayout">
        <article className="treePanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">{runtime.label}</p>
              <h3>{runtime.entityLabel} 列表</h3>
            </div>
          </div>

          <button className="addAgentButton" type="button" disabled>
            {runtime.addLabel}
          </button>

          {runtimeAgents.length === 0 ? (
            <div className="emptyTreeState">
              <strong>未扫描到{runtime.entityLabel}</strong>
              <span>该 runtime 已安装，但只读扫描未找到可展示的 agents/profiles。</span>
            </div>
          ) : (
            <div className="accordionTree">
              {runtimeAgents.map((agent) => {
              const expanded = expandedItem === agent.id;
              return (
                <div className="agentAccordion" key={agent.id}>
                  <button
                    className={selectedItem === agent.id ? "agentHeader agentHeaderActive" : "agentHeader"}
                    type="button"
                    onClick={() => {
                      setExpandedItem(expanded ? "" : agent.id);
                      setSelectedItem(agent.id);
                      setSelectedOperation("basic");
                    }}
                  >
                    <span>{agent.displayName}</span>
                    <small>{agentScanSource === "fixture" ? "fixture" : agent.confidence}</small>
                    <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                  </button>
                  {expanded ? (
                    <div className="operationList">
                      {operationNodes.map((node) => (
                        <button
                          className={
                            selectedItem === agent.id && selectedOperation === node.id
                              ? "operationItem operationItemActive"
                              : "operationItem"
                          }
                          key={`${agent.id}:${node.id}`}
                          type="button"
                          onClick={() => {
                            setSelectedItem(agent.id);
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
          )}
        </article>

        <article className="operationPane">
          {selectedOperation === "basic" ? (
            <BasicSettingsPane
              runtime={runtime}
              selectedAgent={selectedAgent}
              onRequestDeleteAgentPlan={onRequestDeleteAgentPlan}
              deleteAgentPlan={deleteAgentPlan}
              onDismissDeletePlan={onDismissDeletePlan}
              onApplyDeleteAgentPlan={onApplyDeleteAgentPlan}
              deleteAgentApplyState={deleteAgentApplyState}
              deleteAgentApplyError={deleteAgentApplyError}
              deleteAgentApplyResult={deleteAgentApplyResult}
            />
          ) : (
            <PlaceholderOperationPane
              runtime={runtime}
              selectedAgent={selectedAgent}
              selectedOperationNode={selectedOperationNode}
            />
          )}
        </article>
      </section>
    </>
  );
}

function BasicSettingsPane({
  onRequestDeleteAgentPlan,
  runtime,
  selectedAgent,
  deleteAgentPlan,
  onDismissDeletePlan,
  onApplyDeleteAgentPlan,
  deleteAgentApplyState,
  deleteAgentApplyError,
  deleteAgentApplyResult,
}: {
  onRequestDeleteAgentPlan: (agent: ManagedAgent) => void;
  runtime: DashboardRuntime;
  selectedAgent: ManagedAgent | null;
  deleteAgentPlan: DeleteAgentMutationPlan | null;
  onDismissDeletePlan: () => void;
  onApplyDeleteAgentPlan: (plan: DeleteAgentMutationPlan) => void;
  deleteAgentApplyState: "idle" | "running" | "success" | "error";
  deleteAgentApplyError: string;
  deleteAgentApplyResult: DeleteAgentMutationResult | null;
}) {
  if (!selectedAgent) {
    return (
      <>
        <div className="operationTitleRow">
          <div>
            <p className="eyebrow">Basic Settings</p>
            <h3>基础设置</h3>
          </div>
        </div>
        <div className="emptyDetailState">
          <strong>未选择 {runtime.entityLabel}</strong>
          <span>请选择左侧扫描到的 agent/profile 后查看只读基础详情。</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="operationTitleRow">
        <div>
          <p className="eyebrow">Basic Settings</p>
          <h3>{selectedAgent.displayName}</h3>
        </div>
        <button
          className="trashIconButton"
          type="button"
          aria-label="删除/回收"
          title="生成删除/回收计划"
          onClick={() => onRequestDeleteAgentPlan(selectedAgent)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 15h10l1-15" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>

      <section className="basicSettingsForm" aria-label="Basic settings">
        <label>
          <span>名称</span>
          <input type="text" value={selectedAgent.displayName} readOnly />
        </label>
        <label>
          <span>描述（只在 AgentDock 中生效）</span>
          <textarea value={selectedAgent.description ?? ""} readOnly placeholder="未设置" />
        </label>
      </section>

      <section className="detailSection" aria-label="Basic runtime metadata">
        <h4>基础信息</h4>
        <dl className="detailGrid">
          <DetailItem label="运行时类型" value={runtime.label} />
          <DetailItem label="Agent/Profile kind" value={selectedAgent.agentKind} />
          <DetailItem label="Agent/Profile ID" value={selectedAgent.id} />
          <DetailItem label="CLI-agent启动命令" value={selectedAgent.launchCommand ?? "未扫描"} />
          <div>
            <dt>Agent环境变量路径</dt>
            <dd className="envPathDetailValue">
              <span>{agentEnvPath(selectedAgent)}</span>
              <button
                className="envEditIconButton"
                type="button"
                disabled
                aria-label="编辑 Agent 环境变量"
                title="编辑 Agent 环境变量尚未实现"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </dd>
          </div>
          <div>
            <dt>Gateway检查</dt>
            <dd className="gatewayDetailValue">
              <span>{formatGateway(runtime.gatewayRunning)}</span>
              <button
                className="gatewayReloadButton"
                type="button"
                disabled
                aria-label="重启 gateway"
                title="重启 gateway 尚未实现"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M20 6v5h-5" />
                  <path d="M4 18v-5h5" />
                  <path d="M19 11a7 7 0 0 0-12.2-4.7L4 9" />
                  <path d="M5 13a7 7 0 0 0 12.2 4.7L20 15" />
                </svg>
              </button>
            </dd>
          </div>
          <DetailItem label="Confidence" value={selectedAgent.confidence} />
          <DetailItem label="最近修改时间" value={formatLastModified(selectedAgent.lastModified)} />
        </dl>
      </section>

      {deleteAgentPlan ? (
        <section className="deletePlanPreview" aria-label="Delete agent plan preview">
          <h4>删除/回收计划预览</h4>
          <dl className="detailGrid">
            <div>
              <dt>Agent/Profile ID</dt>
              <dd>{deleteAgentPlan.agentId}</dd>
            </div>
            <div>
              <dt>受影响文件数</dt>
              <dd>{deleteAgentPlan.affectedFiles.length}</dd>
            </div>
            <div>
              <dt>Trash 目标路径</dt>
              <dd>{deleteAgentPlan.trashTargetPath}</dd>
            </div>
            <div>
              <dt>备份路径</dt>
              <dd>{deleteAgentPlan.backupPath}</dd>
            </div>
          </dl>
          {deleteAgentPlan.warnings.length > 0 ? (
            <div className="warningList">
              {deleteAgentPlan.warnings.map((warning, index) => (
                <span key={index}>{warning}</span>
              ))}
            </div>
          ) : null}
          {deleteAgentPlan.blockedReason ? (
            <div className="previewBlocked">{deleteAgentPlan.blockedReason}</div>
          ) : null}
          <div className="previewExplanation">
            这不会永久删除文件。AgentDock 会先创建备份，再将该 Agent/Profile 移入本地 Trash。移入后它会从 AgentDock 管理列表中移除；如果 Gateway 或 channel 已缓存该 Agent，可能需要重启 Gateway 后才会完全失效。
          </div>
          {deleteAgentApplyState === "success" && deleteAgentApplyResult ? (
            <div className="previewSuccess">
              <strong>回收完成</strong>
              <span>
                该 Agent/Profile 已移入本地 Trash。备份已保存至 {deleteAgentApplyResult.backupPath}。
                如果 Gateway 或 channel 已缓存该 Agent，可能需要重启 Gateway 后才会完全失效。
              </span>
              <button className="previewCancelButton" type="button" onClick={onDismissDeletePlan}>
                关闭
              </button>
            </div>
          ) : (
            <>
              {deleteAgentPlan.blockedReason ? null : (
                <button
                  className="previewConfirmButton"
                  type="button"
                  disabled={
                    deleteAgentApplyState === "running" ||
                    (deleteAgentPlan !== null &&
                      (runtime.product !== deleteAgentPlan.product ||
                        selectedAgent?.id !== deleteAgentPlan.agentId))
                  }
                  onClick={() => onApplyDeleteAgentPlan(deleteAgentPlan)}
                >
                  {deleteAgentApplyState === "running" ? "执行中..." : "确认移入回收站"}
                </button>
              )}
              {deleteAgentPlan !== null &&
              (runtime.product !== deleteAgentPlan.product ||
                selectedAgent?.id !== deleteAgentPlan.agentId) ? (
                <div className="previewSelectionMismatch">
                  当前选中的 Agent/Profile 已变化，请重新生成回收计划。
                </div>
              ) : null}
              <button
                className="previewCancelButton"
                type="button"
                onClick={onDismissDeletePlan}
              >
                取消
              </button>
              {deleteAgentApplyState === "error" ? (
                <div className="previewError">
                  <strong>回收失败</strong>
                  <span>{deleteAgentApplyError}</span>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </>
  );
}

function PlaceholderOperationPane({
  runtime,
  selectedAgent,
  selectedOperationNode,
}: {
  runtime: DashboardRuntime;
  selectedAgent: ManagedAgent | null;
  selectedOperationNode: { id: OperationNode; label: string; description: string };
}) {
  return (
    <>
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
          <dd>{selectedAgent?.displayName ?? "未选择"}</dd>
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
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}


function NotInstalledDashboard({ runtime }: { runtime: DashboardRuntime }) {
  return (
    <section className="notInstalledPanel">
      <div>
        <p className="eyebrow">未安装状态</p>
        <h3>{runtime.label} 未安装</h3>
      </div>
      <p>
        当前只完成只读检测：CLI、版本和默认 home/config 目录。后续安装流程将以官方安装方式为准，
        先展示命令预览，再让用户选择安装方式和安装位置。本轮不会执行安装命令或访问网络。
      </p>
      <button type="button" disabled>
        安装 {runtime.label}
      </button>
      <div className="commandPreview">
        <span>检测结果</span>
        <code>
          CLI: {runtime.cliPath ?? "not found"} | Home/config: {runtime.configPath ?? runtime.homeDir ?? "not found"} |
          Confidence: {runtime.detectionConfidence}
        </code>
      </div>
      {runtime.warnings.length > 0 ? (
        <div className="notInstalledWarnings">
          {runtime.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RuntimeDetectionNotice({
  error,
  state,
}: {
  error: string;
  state: "loading" | "ready" | "error";
}) {
  if (state === "ready") {
    return null;
  }

  return (
    <section className={state === "error" ? "runtimeDetectionNotice runtimeDetectionNoticeWarning" : "runtimeDetectionNotice"}>
      {state === "loading" ? "正在只读检测 OpenClaw / Hermes 安装状态..." : null}
      {state === "error" ? (
        <>
          <strong>当前使用本地 fallback 状态</strong>
          <span>{error || "Tauri command bridge unavailable."}</span>
        </>
      ) : null}
    </section>
  );
}

function AgentScanNotice({
  error,
  source,
  state,
}: {
  error: string;
  source: AgentScanSource;
  state: "loading" | "ready" | "error";
}) {
  if (state === "ready" && source === "desktop") {
    return null;
  }

  if (source === "fixture") {
    return (
      <section className="agentScanNotice">
        <strong>Browser fixture only</strong>
        <span>Desktop runtime uses read-only Tauri scan results.</span>
      </section>
    );
  }

  return (
    <section className={state === "error" ? "agentScanNotice agentScanNoticeWarning" : "agentScanNotice"}>
      {state === "loading" ? "正在只读扫描 agents/profiles..." : null}
      {state === "error" ? (
        <>
          <strong>Agent/Profile scan unavailable</strong>
          <span>{error || "Tauri command bridge unavailable."}</span>
        </>
      ) : null}
    </section>
  );
}

function MigrationView() {
  const openclawAgents = mockRuntimes.openclaw.items;
  const hermesProfiles = mockRuntimes.hermes.items;

  return (
    <section className="migrationPage">
      <div className="migrationNotice" aria-label="Migration preview policy">
        <strong>保存前必须预览</strong>
        <span>迁移会先生成预览、diff、备份计划和风险提示。</span>
        <span>secret、token、auth、cookies、encrypted store、channel pairing state 不会自动迁移。</span>
      </div>

      <div className="migrationWorkspace">
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
          <button
            className="directionButton"
            type="button"
            disabled
            aria-label="Switch migration direction"
            title="切换迁移方向"
          >
            ⇄
          </button>
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
      </div>
    </section>
  );
}

function SettingsView() {
  return (
    <section className="settingsPage">
      <div className="settingsWorkspace">
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
      </div>
      <footer className="settingsFooter" aria-label="Settings footer links">
        {settingsFooterLinks.map((link) => (
          <button type="button" key={link} disabled>
            {link}
          </button>
        ))}
      </footer>
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

function normalizeRuntimeStatuses(statuses: RuntimeInstallStatus[]): Record<RuntimeProduct, RuntimeInstallStatus> {
  const fallback = getEmptyRuntimeStatuses();

  for (const status of statuses) {
    if (status.product === "openclaw" || status.product === "hermes") {
      fallback[status.product] = {
        ...fallback[status.product],
        ...status,
        warnings: status.warnings ?? [],
      };
    }
  }

  return fallback;
}

function normalizeManagedAgents(agents: ManagedAgent[]): ManagedAgent[] {
  return agents
    .filter((agent) => agent.product === "openclaw" || agent.product === "hermes")
    .map((agent) => ({
      ...agent,
      channelCount: agent.channelCount ?? 0,
      configFiles: agent.configFiles ?? [],
      skillCount: agent.skillCount ?? 0,
      warnings: agent.warnings ?? [],
    }));
}

function getEmptyRuntimeStatuses(): Record<RuntimeProduct, RuntimeInstallStatus> {
  return {
    openclaw: {
      product: "openclaw",
      installed: false,
      updateAvailable: false,
      updateCommand: "openclaw update",
      gatewayRunning: null,
      detectionConfidence: "unknown",
      warnings: ["No reliable OpenClaw CLI or home/config evidence was found."],
    },
    hermes: {
      product: "hermes",
      installed: false,
      updateAvailable: false,
      updateCommand: "hermes update",
      gatewayRunning: null,
      detectionConfidence: "unknown",
      warnings: ["No reliable Hermes CLI or home/config evidence was found."],
    },
  };
}

function getBrowserRuntimeDetectionFallback(): Record<RuntimeProduct, RuntimeInstallStatus> {
  if (!getBrowserFixtureEnabled()) {
    return getEmptyRuntimeStatuses();
  }

  return {
    openclaw: {
      product: "openclaw",
      installed: true,
      cliPath: "/mock/bin/openclaw",
      version: "0.0.0-fixture",
      updateAvailable: false,
      updateCommand: "openclaw update",
      homeDir: "/mock/home/.openclaw",
      configPath: "/mock/home/.openclaw",
      gatewayRunning: null,
      detectionConfidence: "high",
      warnings: ["Browser fixture only; desktop runtime uses the Tauri detection command."],
    },
    hermes: {
      product: "hermes",
      installed: true,
      cliPath: "/mock/bin/hermes",
      version: "0.0.0-fixture",
      updateAvailable: false,
      updateCommand: "hermes update",
      homeDir: "/mock/home/.hermes",
      configPath: "/mock/home/.hermes",
      gatewayRunning: null,
      detectionConfidence: "high",
      warnings: ["Browser fixture only; desktop runtime uses the Tauri detection command."],
    },
  };
}

function getBrowserManagedAgentFallback(): ManagedAgent[] {
  if (!getBrowserFixtureEnabled()) {
    return [];
  }

  return [
    ...mockRuntimes.openclaw.items.map((item) => browserFixtureAgent("openclaw", item)),
    ...mockRuntimes.hermes.items.map((item) => browserFixtureAgent("hermes", item)),
  ];
}

function browserFixtureAgent(product: RuntimeProduct, item: string): ManagedAgent {
  const runtime = mockRuntimes[product];
  return {
    id: `fixture:${product}:${item}`,
    product,
    displayName: item,
    description: null,
    agentKind: product === "openclaw" ? "openclaw-agent" : "hermes-profile",
    launchCommand:
      product === "openclaw"
        ? `openclaw agent --agent ${item} --message "<message>"`
        : `hermes --profile ${item} chat`,
    configRoot: `/mock/home/${product === "openclaw" ? ".openclaw" : ".hermes"}`,
    workspaceOrProfilePath: `/mock/home/${product === "openclaw" ? ".openclaw/agents" : ".hermes/profiles"}/${item}`,
    effectiveCwd: null,
    configFiles: [],
    providerSummary: null,
    modelSummary: null,
    permissionSummary: null,
    channelCount: 0,
    skillCount: 0,
    memoryCount: null,
    sessionCount: null,
    lastModified: null,
    warnings: [
      {
        code: "browser_fixture_only",
        message: `${runtime.label} ${runtime.entityLabel} fixture only; desktop runtime uses read-only scan results.`,
        path: null,
        severity: "info",
      },
    ],
    confidence: "high",
  };
}

function getBrowserFixtureEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  const fixture =
    new URLSearchParams(window.location.search).get("agentdockRuntimeFixture") ??
    window.localStorage.getItem("agentdockRuntimeFixture");

  return fixture === "installed";
}

function formatGateway(gatewayRunning?: boolean | null) {
  if (gatewayRunning === true) {
    return "运行中";
  }
  if (gatewayRunning === false) {
    return "未运行";
  }
  return "未检查";
}

function agentEnvPath(agent: ManagedAgent) {
  return `${agent.workspaceOrProfilePath}/.env`;
}

function formatLastModified(value?: string | null) {
  if (!value) {
    return "未扫描";
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return value;
  }

  return new Date(seconds * 1000).toLocaleString();
}

function hasTauriCommandBridge() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean((window as TauriBridgeWindow).__TAURI_INTERNALS__);
}
