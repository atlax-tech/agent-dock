import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

type DockRoute = "dashboard" | "migration" | "settings";
type RuntimeProduct = "openclaw" | "hermes";
type ThemeMode = "light" | "dark";
type LanguageMode = "zh" | "en";
type DetectionConfidence = "unknown" | "low" | "medium" | "high";
type ProviderKind = "openai-compatible" | "ollama" | "lmstudio" | "comfyui" | "custom";

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

type RuntimeVersionDetail = {
  product: RuntimeProduct;
  lines: string[];
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
  configuredModels?: {
    modelId: string;
    name: string;
    provider?: string | null;
    baseUrl?: string | null;
    defaultModel: boolean;
    fallbackModel: boolean;
    source: string;
  }[];
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

type RestoreTrashItemPlan = {
  planHash: string;
  operation: string;
  runtime: RuntimeProduct;
  targetPath: string;
  warnings: string[];
  blockedReason?: string | null;
};

type RestoreTrashItemResult = {
  operation: string;
  runtime: RuntimeProduct;
  targetPath: string;
  backupPath?: string | null;
};

type LifecyclePlan = {
  planHash: string;
  operation: "create_agent" | "create_profile" | "duplicate" | string;
  runtime: RuntimeProduct;
  targetPath: string;
  sourcePath?: string | null;
  willCreateFiles: string[];
  willBackup: boolean;
  backupPath?: string | null;
  warnings: string[];
  blockedReason?: string | null;
  includedFiles: string[];
  skippedItems: string[];
};

type LifecycleResult = {
  operation: string;
  runtime: RuntimeProduct;
  targetPath: string;
  backupPath?: string | null;
};

type EffectiveModelStep = {
  label: string;
  model?: string | null;
  active: boolean;
  reason: string;
  localOnly: boolean;
  mayCallRemoteApi: boolean;
  mayCreateCost: boolean;
};

type EffectiveModelPreview = {
  effectiveModel?: string | null;
  source: string;
  explanation: string;
  localOnly: boolean;
  mayCallRemoteApi: boolean;
  mayCreateCost: boolean;
  steps: EffectiveModelStep[];
  warnings: string[];
};

type ModelProviderUpdateRequest = {
  agentId: string;
  providerId?: string | null;
  providerName?: string | null;
  kind: ProviderKind;
  baseUrl?: string | null;
  apiKeyRef?: string | null;
  defaultModel?: string | null;
  fallbackModel?: string | null;
  contextLength?: string | null;
  maxTokens?: string | null;
  timeoutSeconds?: string | null;
  thinking?: string | null;
  reasoning?: string | null;
};

type ProviderProfile = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string | null;
  apiKeyRef?: string | null;
  defaultModel?: string | null;
  fallbackModel?: string | null;
  validationJson: string;
  updatedAt: string;
  sortIndex?: number | null;
};

type ModelProviderUpdatePlan = {
  agentId: string;
  runtime: RuntimeProduct;
  targetFiles: string[];
  oldHash: string;
  newHash: string;
  unifiedDiff: string;
  warnings: string[];
  backupWillBeCreated: boolean;
  affectsOnlySelectedAgentProfile: boolean;
  effectiveModelBefore: EffectiveModelPreview;
  effectiveModelAfter: EffectiveModelPreview;
};

type ModelProviderUpdateResult = {
  agentId: string;
  runtime: RuntimeProduct;
  targetPath: string;
  backupPath: string;
  oldHash: string;
  newHash: string;
};

type ProviderValidationReport = {
  baseUrlValid: boolean;
  apiKeyReferenceStatus: string;
  connectionStatus: string;
  authStatus: string;
  modelListStatus: string;
  generationStatus: string;
  models: string[];
  warnings: string[];
};

type LocalRuntimeScanResult = {
  runtime: string;
  endpoint?: string | null;
  reachable: boolean;
  models: { name: string; modified?: string | null; size?: number | null }[];
  warnings: string[];
};

type ModelParameterForm = {
  contextLength: string;
  maxTokens: string;
  timeoutSeconds: string;
  thinking: string;
  reasoning: string;
};

type ConfiguredModelRole = "default" | "fallback";

type ConfiguredModel = {
  id: string;
  name: string;
  role: ConfiguredModelRole;
  providerName?: string | null;
  baseUrl?: string | null;
  apiKeyRef?: string | null;
  defaultModel: boolean;
  fallbackModel: boolean;
  source: string;
  warnings: string[];
};

type ProviderModelDialogMode = "detail" | "add";

type ProviderModelDialogState = {
  mode: ProviderModelDialogMode;
  modelId: string;
  modelName: string;
  providerName: string;
  baseUrl: string;
  apiKeyRef: string;
  defaultModel: boolean;
  fallbackModel: boolean;
};

type AgentProviderModel = {
  modelId: string;
  name: string;
  providerName?: string | null;
  baseUrl?: string | null;
  apiKeyRef?: string | null;
  defaultModel: boolean;
  fallbackModel: boolean;
  source: string;
  warnings: string[];
};

type AgentModelProvidersResponse = {
  agentId: string;
  runtime: RuntimeProduct;
  source: string;
  models: AgentProviderModel[];
  warnings: string[];
};

type ComfyScanResult = {
  providerKind: string;
  isChatLlmProvider: boolean;
  detectedPaths: string[];
  capabilityFolders: { kind: string; path: string; models: string[] }[];
  endpoint?: string | null;
  endpointReachable: boolean;
  warnings: string[];
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

const providerKindOptions: { id: ProviderKind; label: string; detail: string }[] = [
  { id: "openai-compatible", label: "OpenAI-compatible", detail: "/v1/models 与 chat completions" },
  { id: "ollama", label: "Ollama", detail: "本地 http://localhost:11434" },
  { id: "lmstudio", label: "LM Studio", detail: "本地 OpenAI-compatible server" },
  { id: "comfyui", label: "ComfyUI", detail: "本地能力 provider，不作为默认 chat LLM" },
  { id: "custom", label: "Custom", detail: "自定义 OpenAI-compatible provider" },
];

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
  const [restorePlan, setRestorePlan] = useState<RestoreTrashItemPlan | null>(null);
  const [restorePlanRequestState, setRestorePlanRequestState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [restorePlanError, setRestorePlanError] = useState("");
  const [restoreApplyState, setRestoreApplyState] = useState<"idle" | "running" | "success" | "error">(
    "idle",
  );
  const [restoreApplyResult, setRestoreApplyResult] = useState<RestoreTrashItemResult | null>(null);
  const [restoreApplyError, setRestoreApplyError] = useState("");
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPlan, setCreatePlan] = useState<LifecyclePlan | null>(null);
  const [createState, setCreateState] = useState<"idle" | "planning" | "applying" | "success" | "error">("idle");
  const [createResult, setCreateResult] = useState<LifecycleResult | null>(null);
  const [createError, setCreateError] = useState("");
  const [copyPanelOpen, setCopyPanelOpen] = useState(false);
  const [copyName, setCopyName] = useState("");
  const [copyPlan, setCopyPlan] = useState<LifecyclePlan | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "planning" | "applying" | "success" | "error">("idle");
  const [copyResult, setCopyResult] = useState<LifecycleResult | null>(null);
  const [copyError, setCopyError] = useState("");
  const [versionDetail, setVersionDetail] = useState<RuntimeVersionDetail | null>(null);
  const [versionDetailState, setVersionDetailState] = useState<"idle" | "loading" | "error">("idle");
  const [versionDetailError, setVersionDetailError] = useState("");

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

  function toggleRuntimeVersionDetail(product: RuntimeProduct) {
    if (versionDetailState === "loading") {
      return;
    }

    if (versionDetail?.product === product) {
      setVersionDetail(null);
      setVersionDetailState("idle");
      setVersionDetailError("");
      return;
    }

    if (!hasTauriCommandBridge()) {
      setVersionDetail({
        product,
        lines: getBrowserVersionDetailFallback(product),
        warnings: ["Browser preview fallback; desktop app uses the runtime version command."],
      });
      setVersionDetailState("idle");
      setVersionDetailError("");
      return;
    }

    setVersionDetail(null);
    setVersionDetailState("loading");
    setVersionDetailError("");
    invoke<RuntimeVersionDetail>("get_runtime_version_detail", { product })
      .then((detail) => {
        setVersionDetail(detail);
        setVersionDetailState("idle");
      })
      .catch((error: unknown) => {
        setVersionDetailState("error");
        setVersionDetailError(error instanceof Error ? error.message : String(error));
      });
  }

  function dismissRestorePlan() {
    setRestorePlan(null);
    setRestorePlanRequestState("idle");
    setRestorePlanError("");
    setRestoreApplyState("idle");
    setRestoreApplyResult(null);
    setRestoreApplyError("");
  }

  function requestRestorePlan(trashTargetPath: string) {
    if (!hasTauriCommandBridge()) {
      setRestorePlanRequestState("error");
      setRestorePlanError("Tauri command bridge unavailable.");
      return;
    }

    setRestorePlanRequestState("loading");
    setRestorePlanError("");
    setRestoreApplyState("idle");
    setRestoreApplyResult(null);
    setRestoreApplyError("");
    invoke<RestoreTrashItemPlan>("restore_trash_item_plan", {
      trashPath: trashTargetPath,
    })
      .then((plan) => {
        setRestorePlan(plan);
        setRestorePlanRequestState("idle");
      })
      .catch((error: unknown) => {
        setRestorePlanRequestState("error");
        setRestorePlanError(error instanceof Error ? error.message : String(error));
      });
  }

  function applyRestoreTrashItem(plan: RestoreTrashItemPlan) {
    if (!hasTauriCommandBridge()) {
      setRestoreApplyState("error");
      setRestoreApplyError("Tauri command bridge unavailable.");
      return;
    }

    setRestoreApplyState("running");
    setRestoreApplyError("");
    invoke<RestoreTrashItemResult>("apply_restore_trash_item", {
      request: { planHash: plan.planHash },
    })
      .then((result) => {
        setRestoreApplyState("success");
        setRestoreApplyResult(result);
        setRescanRequestId((current) => current + 1);
        setRuntimeDetectionRequestId((current) => current + 1);
      })
      .catch((error: unknown) => {
        setRestoreApplyState("error");
        setRestoreApplyError(error instanceof Error ? error.message : String(error));
      });
  }

  function dismissDeletePlan() {
    setDeleteAgentPlan(null);
    setDeleteAgentApplyState("idle");
    setDeleteAgentApplyResult(null);
    setDeleteAgentApplyError("");
    setRestorePlan(null);
    setRestorePlanRequestState("idle");
    setRestorePlanError("");
    setRestoreApplyState("idle");
    setRestoreApplyResult(null);
    setRestoreApplyError("");
  }

  function openCreatePanel(runtimeProduct: RuntimeProduct) {
    setCreatePanelOpen(true);
    setCreateName(runtimeProduct === "openclaw" ? "new-agent" : "new-profile");
    setCreatePlan(null);
    setCreateState("idle");
    setCreateResult(null);
    setCreateError("");
  }

  function requestCreateLifecyclePlan(runtime: DashboardRuntime) {
    const name = createName.trim();
    if (!name) {
      setCreateState("error");
      setCreateError("请输入 Agent/Profile 名称。");
      return;
    }
    if (!hasTauriCommandBridge()) {
      setCreateState("error");
      setCreateError("Tauri command bridge unavailable.");
      return;
    }

    setCreateState("planning");
    setCreateError("");
    setCreateResult(null);
    const command = runtime.product === "openclaw" ? "create_agent_plan" : "create_profile_plan";
    invoke<LifecyclePlan>(command, {
      request: {
        name,
        targetRoot: createTargetRoot(runtime, name),
      },
    })
      .then((plan) => {
        setCreatePlan(plan);
        setCreateState("idle");
      })
      .catch((error: unknown) => {
        setCreateState("error");
        setCreateError(error instanceof Error ? error.message : String(error));
      });
  }

  function applyCreateLifecyclePlan(plan: LifecyclePlan) {
    if (!hasTauriCommandBridge()) {
      setCreateState("error");
      setCreateError("Tauri command bridge unavailable.");
      return;
    }

    setCreateState("applying");
    setCreateError("");
    const command = plan.runtime === "openclaw" ? "apply_create_agent" : "apply_create_profile";
    invoke<LifecycleResult>(command, {
      request: { plan },
    })
      .then((result) => {
        setCreateState("success");
        setCreateResult(result);
        setRescanRequestId((current) => current + 1);
        setRuntimeDetectionRequestId((current) => current + 1);
      })
      .catch((error: unknown) => {
        setCreateState("error");
        setCreateError(error instanceof Error ? error.message : String(error));
      });
  }

  function dismissCreateLifecyclePlan() {
    setCreatePanelOpen(false);
    setCreatePlan(null);
    setCreateState("idle");
    setCreateResult(null);
    setCreateError("");
  }

  function openCopyPanel(agent: ManagedAgent) {
    setCopyPanelOpen(true);
    setCopyName(`${agent.displayName}-copy`);
    setCopyPlan(null);
    setCopyState("idle");
    setCopyResult(null);
    setCopyError("");
  }

  function requestCopyLifecyclePlan(agent: ManagedAgent) {
    const newName = copyName.trim();
    if (!newName) {
      setCopyState("error");
      setCopyError("请输入复制后的 Agent/Profile 名称。");
      return;
    }
    if (!hasTauriCommandBridge()) {
      setCopyState("error");
      setCopyError("Tauri command bridge unavailable.");
      return;
    }

    setCopyState("planning");
    setCopyError("");
    setCopyResult(null);
    invoke<LifecyclePlan>("duplicate_agent_plan", {
      request: {
        sourceAgentId: agent.id,
        newName,
      },
    })
      .then((plan) => {
        setCopyPlan(plan);
        setCopyState("idle");
      })
      .catch((error: unknown) => {
        setCopyState("error");
        setCopyError(error instanceof Error ? error.message : String(error));
      });
  }

  function applyCopyLifecyclePlan(plan: LifecyclePlan) {
    if (!hasTauriCommandBridge()) {
      setCopyState("error");
      setCopyError("Tauri command bridge unavailable.");
      return;
    }

    setCopyState("applying");
    setCopyError("");
    invoke<LifecycleResult>("apply_duplicate_agent", {
      request: { plan },
    })
      .then((result) => {
        setCopyState("success");
        setCopyResult(result);
        setRescanRequestId((current) => current + 1);
        setRuntimeDetectionRequestId((current) => current + 1);
      })
      .catch((error: unknown) => {
        setCopyState("error");
        setCopyError(error instanceof Error ? error.message : String(error));
      });
  }

  function dismissCopyLifecyclePlan() {
    setCopyPanelOpen(false);
    setCopyPlan(null);
    setCopyState("idle");
    setCopyResult(null);
    setCopyError("");
  }

  function refreshAfterMutation() {
    setRescanRequestId((current) => current + 1);
    setRuntimeDetectionRequestId((current) => current + 1);
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
            onToggleRuntimeVersionDetail={toggleRuntimeVersionDetail}
            versionDetail={versionDetail}
            versionDetailError={versionDetailError}
            versionDetailState={versionDetailState}
            onRequestDeleteAgentPlan={requestDeleteAgentPlan}
            deleteAgentPlan={deleteAgentPlan}
            onDismissDeletePlan={dismissDeletePlan}
            onApplyDeleteAgentPlan={applyDeleteAgentPlan}
            deleteAgentApplyState={deleteAgentApplyState}
            deleteAgentApplyError={deleteAgentApplyError}
            deleteAgentApplyResult={deleteAgentApplyResult}
            restorePlan={restorePlan}
            restorePlanRequestState={restorePlanRequestState}
            restorePlanError={restorePlanError}
            onRequestRestorePlan={requestRestorePlan}
            onDismissRestorePlan={dismissRestorePlan}
            onApplyRestoreTrashItem={applyRestoreTrashItem}
            restoreApplyState={restoreApplyState}
            restoreApplyResult={restoreApplyResult}
            restoreApplyError={restoreApplyError}
            createPanelOpen={createPanelOpen}
            createName={createName}
            createPlan={createPlan}
            createState={createState}
            createResult={createResult}
            createError={createError}
            onOpenCreatePanel={openCreatePanel}
            onChangeCreateName={setCreateName}
            onRequestCreateLifecyclePlan={requestCreateLifecyclePlan}
            onApplyCreateLifecyclePlan={applyCreateLifecyclePlan}
            onDismissCreateLifecyclePlan={dismissCreateLifecyclePlan}
            copyPanelOpen={copyPanelOpen}
            copyName={copyName}
            copyPlan={copyPlan}
            copyState={copyState}
            copyResult={copyResult}
            copyError={copyError}
            onOpenCopyPanel={openCopyPanel}
            onChangeCopyName={setCopyName}
            onRequestCopyLifecyclePlan={requestCopyLifecyclePlan}
            onApplyCopyLifecyclePlan={applyCopyLifecyclePlan}
            onDismissCopyLifecyclePlan={dismissCopyLifecyclePlan}
            onRefreshAfterMutation={refreshAfterMutation}
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
  onToggleRuntimeVersionDetail,
  versionDetail,
  versionDetailError,
  versionDetailState,
  onRequestDeleteAgentPlan,
  deleteAgentPlan,
  onDismissDeletePlan,
  onApplyDeleteAgentPlan,
  deleteAgentApplyState,
  deleteAgentApplyError,
  deleteAgentApplyResult,
  restorePlan,
  restorePlanRequestState,
  restorePlanError,
  onRequestRestorePlan,
  onDismissRestorePlan,
  onApplyRestoreTrashItem,
  restoreApplyState,
  restoreApplyResult,
  restoreApplyError,
  createPanelOpen,
  createName,
  createPlan,
  createState,
  createResult,
  createError,
  onOpenCreatePanel,
  onChangeCreateName,
  onRequestCreateLifecyclePlan,
  onApplyCreateLifecyclePlan,
  onDismissCreateLifecyclePlan,
  copyPanelOpen,
  copyName,
  copyPlan,
  copyState,
  copyResult,
  copyError,
  onOpenCopyPanel,
  onChangeCopyName,
  onRequestCopyLifecyclePlan,
  onApplyCopyLifecyclePlan,
  onDismissCopyLifecyclePlan,
  onRefreshAfterMutation,
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
  onToggleRuntimeVersionDetail: (product: RuntimeProduct) => void;
  versionDetail: RuntimeVersionDetail | null;
  versionDetailError: string;
  versionDetailState: "idle" | "loading" | "error";
  onRequestDeleteAgentPlan: (agent: ManagedAgent) => void;
  deleteAgentPlan: DeleteAgentMutationPlan | null;
  onDismissDeletePlan: () => void;
  onApplyDeleteAgentPlan: (plan: DeleteAgentMutationPlan) => void;
  deleteAgentApplyState: "idle" | "running" | "success" | "error";
  deleteAgentApplyError: string;
  deleteAgentApplyResult: DeleteAgentMutationResult | null;
  restorePlan: RestoreTrashItemPlan | null;
  restorePlanRequestState: "idle" | "loading" | "error";
  restorePlanError: string;
  onRequestRestorePlan: (trashTargetPath: string) => void;
  onDismissRestorePlan: () => void;
  onApplyRestoreTrashItem: (plan: RestoreTrashItemPlan) => void;
  restoreApplyState: "idle" | "running" | "success" | "error";
  restoreApplyResult: RestoreTrashItemResult | null;
  restoreApplyError: string;
  createPanelOpen: boolean;
  createName: string;
  createPlan: LifecyclePlan | null;
  createState: "idle" | "planning" | "applying" | "success" | "error";
  createResult: LifecycleResult | null;
  createError: string;
  onOpenCreatePanel: (runtimeProduct: RuntimeProduct) => void;
  onChangeCreateName: (name: string) => void;
  onRequestCreateLifecyclePlan: (runtime: DashboardRuntime) => void;
  onApplyCreateLifecyclePlan: (plan: LifecyclePlan) => void;
  onDismissCreateLifecyclePlan: () => void;
  copyPanelOpen: boolean;
  copyName: string;
  copyPlan: LifecyclePlan | null;
  copyState: "idle" | "planning" | "applying" | "success" | "error";
  copyResult: LifecycleResult | null;
  copyError: string;
  onOpenCopyPanel: (agent: ManagedAgent) => void;
  onChangeCopyName: (name: string) => void;
  onRequestCopyLifecyclePlan: (agent: ManagedAgent) => void;
  onApplyCopyLifecyclePlan: (plan: LifecyclePlan) => void;
  onDismissCopyLifecyclePlan: () => void;
  onRefreshAfterMutation: () => void;
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
          onToggleRuntimeVersionDetail={onToggleRuntimeVersionDetail}
          versionDetail={versionDetail}
          versionDetailError={versionDetailError}
          versionDetailState={versionDetailState}
          onRequestDeleteAgentPlan={onRequestDeleteAgentPlan}
          deleteAgentPlan={deleteAgentPlan}
          onDismissDeletePlan={onDismissDeletePlan}
          onApplyDeleteAgentPlan={onApplyDeleteAgentPlan}
          deleteAgentApplyState={deleteAgentApplyState}
          deleteAgentApplyError={deleteAgentApplyError}
          deleteAgentApplyResult={deleteAgentApplyResult}
          restorePlan={restorePlan}
          restorePlanRequestState={restorePlanRequestState}
          restorePlanError={restorePlanError}
          onRequestRestorePlan={onRequestRestorePlan}
          onDismissRestorePlan={onDismissRestorePlan}
          onApplyRestoreTrashItem={onApplyRestoreTrashItem}
          restoreApplyState={restoreApplyState}
          restoreApplyResult={restoreApplyResult}
          restoreApplyError={restoreApplyError}
          createPanelOpen={createPanelOpen}
          createName={createName}
          createPlan={createPlan}
          createState={createState}
          createResult={createResult}
          createError={createError}
          onOpenCreatePanel={onOpenCreatePanel}
          onChangeCreateName={onChangeCreateName}
          onRequestCreateLifecyclePlan={onRequestCreateLifecyclePlan}
          onApplyCreateLifecyclePlan={onApplyCreateLifecyclePlan}
          onDismissCreateLifecyclePlan={onDismissCreateLifecyclePlan}
          copyPanelOpen={copyPanelOpen}
          copyName={copyName}
          copyPlan={copyPlan}
          copyState={copyState}
          copyResult={copyResult}
          copyError={copyError}
          onOpenCopyPanel={onOpenCopyPanel}
          onChangeCopyName={onChangeCopyName}
          onRequestCopyLifecyclePlan={onRequestCopyLifecyclePlan}
          onApplyCopyLifecyclePlan={onApplyCopyLifecyclePlan}
          onDismissCopyLifecyclePlan={onDismissCopyLifecyclePlan}
          onRefreshAfterMutation={onRefreshAfterMutation}
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
  onToggleRuntimeVersionDetail,
  versionDetail,
  versionDetailError,
  versionDetailState,
  onRequestDeleteAgentPlan,
  deleteAgentPlan,
  onDismissDeletePlan,
  onApplyDeleteAgentPlan,
  deleteAgentApplyState,
  deleteAgentApplyError,
  deleteAgentApplyResult,
  restorePlan,
  restorePlanRequestState,
  restorePlanError,
  onRequestRestorePlan,
  onDismissRestorePlan,
  onApplyRestoreTrashItem,
  restoreApplyState,
  restoreApplyResult,
  restoreApplyError,
  createPanelOpen,
  createName,
  createPlan,
  createState,
  createResult,
  createError,
  onOpenCreatePanel,
  onChangeCreateName,
  onRequestCreateLifecyclePlan,
  onApplyCreateLifecyclePlan,
  onDismissCreateLifecyclePlan,
  copyPanelOpen,
  copyName,
  copyPlan,
  copyState,
  copyResult,
  copyError,
  onOpenCopyPanel,
  onChangeCopyName,
  onRequestCopyLifecyclePlan,
  onApplyCopyLifecyclePlan,
  onDismissCopyLifecyclePlan,
  onRefreshAfterMutation,
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
  onToggleRuntimeVersionDetail: (product: RuntimeProduct) => void;
  versionDetail: RuntimeVersionDetail | null;
  versionDetailError: string;
  versionDetailState: "idle" | "loading" | "error";
  onRequestDeleteAgentPlan: (agent: ManagedAgent) => void;
  deleteAgentPlan: DeleteAgentMutationPlan | null;
  onDismissDeletePlan: () => void;
  onApplyDeleteAgentPlan: (plan: DeleteAgentMutationPlan) => void;
  deleteAgentApplyState: "idle" | "running" | "success" | "error";
  deleteAgentApplyError: string;
  deleteAgentApplyResult: DeleteAgentMutationResult | null;
  restorePlan: RestoreTrashItemPlan | null;
  restorePlanRequestState: "idle" | "loading" | "error";
  restorePlanError: string;
  onRequestRestorePlan: (trashTargetPath: string) => void;
  onDismissRestorePlan: () => void;
  onApplyRestoreTrashItem: (plan: RestoreTrashItemPlan) => void;
  restoreApplyState: "idle" | "running" | "success" | "error";
  restoreApplyResult: RestoreTrashItemResult | null;
  restoreApplyError: string;
  createPanelOpen: boolean;
  createName: string;
  createPlan: LifecyclePlan | null;
  createState: "idle" | "planning" | "applying" | "success" | "error";
  createResult: LifecycleResult | null;
  createError: string;
  onOpenCreatePanel: (runtimeProduct: RuntimeProduct) => void;
  onChangeCreateName: (name: string) => void;
  onRequestCreateLifecyclePlan: (runtime: DashboardRuntime) => void;
  onApplyCreateLifecyclePlan: (plan: LifecyclePlan) => void;
  onDismissCreateLifecyclePlan: () => void;
  copyPanelOpen: boolean;
  copyName: string;
  copyPlan: LifecyclePlan | null;
  copyState: "idle" | "planning" | "applying" | "success" | "error";
  copyResult: LifecycleResult | null;
  copyError: string;
  onOpenCopyPanel: (agent: ManagedAgent) => void;
  onChangeCopyName: (name: string) => void;
  onRequestCopyLifecyclePlan: (agent: ManagedAgent) => void;
  onApplyCopyLifecyclePlan: (plan: LifecyclePlan) => void;
  onDismissCopyLifecyclePlan: () => void;
  onRefreshAfterMutation: () => void;
  setExpandedItem: (item: string) => void;
  setSelectedItem: (item: string) => void;
  setSelectedOperation: (operation: OperationNode) => void;
}) {
  return (
    <>
      <section className="runtimeStatus" aria-label={`${runtime.label} runtime status`}>
        <div>
          <span>Version</span>
          <button
            className="versionLink"
            type="button"
            aria-expanded={versionDetail?.product === runtime.product || versionDetailState !== "idle"}
            onClick={() => onToggleRuntimeVersionDetail(runtime.product)}
          >
            {runtime.version ?? "未读取到"}
          </button>
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
        {versionDetail?.product === runtime.product ||
        versionDetailState === "loading" ||
        versionDetailState === "error" ? (
          <div className="versionPopover" role="dialog" aria-label={`${runtime.label} version details`}>
            {versionDetailState === "loading" ? <span>正在查询版本详情...</span> : null}
            {versionDetailState === "error" ? (
              <span>{versionDetailError || "版本详情查询失败。"}</span>
            ) : null}
            {versionDetail?.product === runtime.product ? (
              <div className="versionDetailRows">
                {versionDetail.lines.map((line) => (
                  <code className="versionDetailLine" key={line}>
                    {line}
                  </code>
                ))}
                {versionDetail.warnings.map((warning) => (
                  <div className="versionDetailWarning" key={warning}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
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

          <div className="treeFooterActions" aria-label={`${runtime.entityLabel} lifecycle actions`}>
            <button className="addAgentButton" type="button" onClick={() => onOpenCreatePanel(runtime.product)}>
              {runtime.addLabel}
            </button>
            <span>创建必须先生成计划预览，确认后才会写入。</span>
            {createPanelOpen ? (
              <LifecyclePlanPanel
                actionLabel="创建"
                inputLabel="新名称"
                inputValue={createName}
                plan={createPlan}
                state={createState}
                result={createResult}
                error={createError}
                onInputChange={onChangeCreateName}
                onRequestPlan={() => onRequestCreateLifecyclePlan(runtime)}
                onApplyPlan={onApplyCreateLifecyclePlan}
                onDismiss={onDismissCreateLifecyclePlan}
              />
            ) : null}
          </div>
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
              restorePlan={restorePlan}
              restorePlanRequestState={restorePlanRequestState}
              restorePlanError={restorePlanError}
              onRequestRestorePlan={onRequestRestorePlan}
              onDismissRestorePlan={onDismissRestorePlan}
              onApplyRestoreTrashItem={onApplyRestoreTrashItem}
              restoreApplyState={restoreApplyState}
              restoreApplyResult={restoreApplyResult}
              restoreApplyError={restoreApplyError}
              copyPanelOpen={copyPanelOpen}
              copyName={copyName}
              copyPlan={copyPlan}
              copyState={copyState}
              copyResult={copyResult}
              copyError={copyError}
              onOpenCopyPanel={onOpenCopyPanel}
              onChangeCopyName={onChangeCopyName}
              onRequestCopyLifecyclePlan={onRequestCopyLifecyclePlan}
              onApplyCopyLifecyclePlan={onApplyCopyLifecyclePlan}
              onDismissCopyLifecyclePlan={onDismissCopyLifecyclePlan}
            />
          ) : selectedOperation === "provider" ? (
            <ProviderModelPane
              selectedAgent={selectedAgent}
              runtime={runtime}
              onRefreshAfterMutation={onRefreshAfterMutation}
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

function ProviderModelPane({
  selectedAgent,
  runtime,
  onRefreshAfterMutation,
}: {
  selectedAgent: ManagedAgent | null;
  runtime: DashboardRuntime;
  onRefreshAfterMutation: () => void;
}) {
  const [kind, setKind] = useState<ProviderKind>("openai-compatible");
  const [providerName, setProviderName] = useState("OpenAI compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKeyRef, setApiKeyRef] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [defaultModel, setDefaultModel] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [modelParams, setModelParams] = useState<ModelParameterForm>({
    contextLength: "",
    maxTokens: "",
    timeoutSeconds: "",
    thinking: "",
    reasoning: "",
  });
  const [modelDialog, setModelDialog] = useState<ProviderModelDialogState | null>(null);
  const [effectivePreview, setEffectivePreview] = useState<EffectiveModelPreview | null>(null);
  const [providerPlan, setProviderPlan] = useState<ModelProviderUpdatePlan | null>(null);
  const [providerResult, setProviderResult] = useState<ModelProviderUpdateResult | null>(null);
  const [validationResult, setValidationResult] = useState<
    ProviderValidationReport | LocalRuntimeScanResult | ComfyScanResult | null
  >(null);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>([]);
  const [providerProfileJson, setProviderProfileJson] = useState("");
  const [modelProviderList, setModelProviderList] = useState<AgentModelProvidersResponse | null>(null);
  const [modelProviderListState, setModelProviderListState] = useState<"idle" | "loading" | "error">("idle");
  const [modelProviderListError, setModelProviderListError] = useState("");
  const [profileListState, setProfileListState] = useState<"idle" | "loading" | "error">("idle");
  const [providerState, setProviderState] = useState<
    "idle" | "previewing" | "testing" | "planning" | "applying" | "success" | "error"
  >("idle");
  const [providerError, setProviderError] = useState("");

  useEffect(() => {
    setKind(inferProviderKind(selectedAgent?.providerSummary?.provider));
    setProviderName(selectedAgent?.providerSummary?.provider ?? "OpenAI compatible");
    setBaseUrl(selectedAgent?.providerSummary?.baseUrl ?? "");
    setApiKeyRef("");
    setApiKeyVisible(false);
    setDefaultModel(selectedAgent?.modelSummary?.defaultModel ?? "");
    setFallbackModel(selectedAgent?.modelSummary?.fallbackModel ?? "");
    setModelParams({
      contextLength: "",
      maxTokens: "",
      timeoutSeconds: "",
      thinking: "",
      reasoning: "",
    });
    setModelDialog(null);
    setEffectivePreview(null);
    setProviderPlan(null);
    setProviderResult(null);
    setValidationResult(null);
    setModelProviderList(null);
    setModelProviderListState("idle");
    setModelProviderListError("");
    setProviderState("idle");
    setProviderError("");
  }, [selectedAgent?.id]);

  useEffect(() => {
    loadProviderProfiles();
  }, []);

  useEffect(() => {
    if (!selectedAgent) {
      setModelProviderList(null);
      setModelProviderListState("idle");
      setModelProviderListError("");
      return;
    }
    loadAgentModelProviders(selectedAgent);
  }, [selectedAgent?.id]);

  if (!selectedAgent) {
    return (
      <div className="emptyDetailState">
        <strong>未选择 {runtime.entityLabel}</strong>
        <span>请选择左侧扫描到的 agent/profile 后配置 Provider / Model。</span>
      </div>
    );
  }

  const agent = selectedAgent;
  const updateRequest = buildModelProviderUpdateRequest(agent.id, {
      kind,
      providerName,
      baseUrl,
      apiKeyRef,
      defaultModel,
      fallbackModel,
      ...modelParams,
  });
  const configuredModels = configuredModelsForAgent(agent, defaultModel, fallbackModel, modelProviderList);
  const selectedApiKeyRef =
    apiKeyRef || agent.providerSummary?.secretFields[0] || agent.providerSummary?.missingSecretFields[0] || "";

  function previewEffectiveModel() {
    if (!hasTauriCommandBridge()) {
      setProviderState("error");
      setProviderError("Tauri command bridge unavailable.");
      return;
    }

    setProviderState("previewing");
    setProviderError("");
    invoke<EffectiveModelPreview>("resolve_effective_model_preview", {
      request: {
        agentId: agent.id,
        provider: providerProfileInput(updateRequest),
      },
    })
      .then((preview) => {
        setEffectivePreview(preview);
        setProviderState("idle");
      })
      .catch((error: unknown) => {
        setProviderState("error");
        setProviderError(error instanceof Error ? error.message : String(error));
      });
  }

  function loadProviderProfiles() {
    if (!hasTauriCommandBridge()) {
      setProfileListState("error");
      return;
    }

    setProfileListState("loading");
    invoke<ProviderProfile[]>("list_provider_profiles")
      .then((profiles) => {
        setProviderProfiles(profiles);
        setProfileListState("idle");
      })
      .catch(() => {
        setProfileListState("error");
      });
  }

  function loadAgentModelProviders(nextAgent: ManagedAgent) {
    if (!hasTauriCommandBridge()) {
      setModelProviderList(null);
      setModelProviderListState("error");
      setModelProviderListError("Tauri command bridge unavailable; using scanned fixture metadata.");
      return;
    }

    setModelProviderListState("loading");
    setModelProviderListError("");
    invoke<AgentModelProvidersResponse>("list_agent_model_providers", {
      request: { agentId: nextAgent.id },
    })
      .then((response) => {
        setModelProviderList(response);
        setModelProviderListState("idle");
      })
      .catch((error: unknown) => {
        setModelProviderList(null);
        setModelProviderListState("error");
        setModelProviderListError(error instanceof Error ? error.message : String(error));
      });
  }

  function selectProviderProfile(profile: ProviderProfile) {
    setKind(profile.kind);
    setProviderName(profile.name);
    setBaseUrl(profile.baseUrl ?? "");
    setApiKeyRef(profile.apiKeyRef ?? "");
    setDefaultModel(profile.defaultModel ?? "");
    setFallbackModel(profile.fallbackModel ?? "");
    setProviderPlan(null);
    setProviderResult(null);
    setValidationResult(null);
  }

  function openConfiguredModel(model: ConfiguredModel) {
    setModelDialog({
      mode: "detail",
      modelId: model.id,
      modelName: model.name,
      providerName: model.providerName ?? providerName,
      baseUrl: model.baseUrl ?? baseUrl,
      apiKeyRef: model.apiKeyRef ?? selectedApiKeyRef,
      defaultModel: model.defaultModel,
      fallbackModel: model.fallbackModel,
    });
    setProviderName(model.providerName ?? providerName);
    setBaseUrl(model.baseUrl ?? baseUrl);
    setApiKeyRef(model.apiKeyRef ?? apiKeyRef);
    setProviderPlan(null);
    setProviderResult(null);
    setProviderError("");
  }

  function openAddModelDialog() {
    setModelDialog({
      mode: "add",
      modelId: "",
      modelName: "",
      providerName,
      baseUrl,
      apiKeyRef: selectedApiKeyRef,
      defaultModel: configuredModels.length === 0,
      fallbackModel: configuredModels.length > 0,
    });
    setProviderPlan(null);
    setProviderResult(null);
    setProviderError("");
  }

  function updateModelParameter(field: keyof ModelParameterForm, value: string) {
    setModelParams((current) => ({
      ...current,
      [field]: value,
    }));
    setProviderPlan(null);
  }

  function closeModelDialog() {
    if (providerState === "applying") {
      return;
    }
    setModelDialog(null);
    setProviderError("");
  }

  function saveModelDialog() {
    if (!modelDialog) {
      return;
    }
    const modelId = modelDialog.modelId.trim();
    if (!modelId) {
      setProviderState("error");
      setProviderError("Model ID 不能为空。");
      return;
    }
    if (!modelDialog.defaultModel && !modelDialog.fallbackModel) {
      setProviderState("error");
      setProviderError("新增或编辑模型至少需要设置为 Default model 或 Fallback model。");
      return;
    }
    const nextDefaultModel = modelDialog.defaultModel ? modelId : defaultModel;
    const nextFallbackModel = modelDialog.fallbackModel ? modelId : fallbackModel;
    setDefaultModel(nextDefaultModel);
    setFallbackModel(nextFallbackModel);
    requestProviderPlan({
      defaultModelOverride: nextDefaultModel,
      fallbackModelOverride: nextFallbackModel,
    });
  }

  function saveProviderProfileOnly() {
    if (!hasTauriCommandBridge()) {
      setProviderState("error");
      setProviderError("Tauri command bridge unavailable.");
      return;
    }

    setProviderState("planning");
    setProviderError("");
    invoke<ProviderProfile>("save_provider_profile", {
      input: {
        ...providerProfileInput(updateRequest),
        sortIndex: providerProfiles.length,
      },
    })
      .then(() => {
        setProviderState("idle");
        loadProviderProfiles();
      })
      .catch((error: unknown) => {
        setProviderState("error");
        setProviderError(error instanceof Error ? error.message : String(error));
      });
  }

  function deleteProviderProfile(id: string) {
    if (!hasTauriCommandBridge()) {
      return;
    }

    invoke<ProviderProfile[]>("delete_provider_profile_command", {
      request: { id },
    })
      .then(setProviderProfiles)
      .catch((error: unknown) => {
        setProviderState("error");
        setProviderError(error instanceof Error ? error.message : String(error));
      });
  }

  function moveProviderProfile(id: string, direction: -1 | 1) {
    const currentIndex = providerProfiles.findIndex((profile) => profile.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= providerProfiles.length) {
      return;
    }
    const reordered = [...providerProfiles];
    const [item] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, item);
    setProviderProfiles(reordered);
    if (!hasTauriCommandBridge()) {
      return;
    }
    invoke<ProviderProfile[]>("update_provider_profile_sort_order_command", {
      request: { orderedIds: reordered.map((profile) => profile.id) },
    })
      .then(setProviderProfiles)
      .catch((error: unknown) => {
        setProviderState("error");
        setProviderError(error instanceof Error ? error.message : String(error));
      });
  }

  function exportProviderProfiles() {
    if (!hasTauriCommandBridge()) {
      return;
    }
    invoke<string>("export_provider_profiles")
      .then(setProviderProfileJson)
      .catch((error: unknown) => {
        setProviderState("error");
        setProviderError(error instanceof Error ? error.message : String(error));
      });
  }

  function importProviderProfiles() {
    if (!hasTauriCommandBridge() || !providerProfileJson.trim()) {
      return;
    }
    invoke<ProviderProfile[]>("import_provider_profiles", {
      request: { json: providerProfileJson },
    })
      .then((profiles) => {
        setProviderProfiles(profiles);
        setProviderProfileJson("");
      })
      .catch((error: unknown) => {
        setProviderState("error");
        setProviderError(error instanceof Error ? error.message : String(error));
      });
  }

  function testProviderConnection() {
    if (!hasTauriCommandBridge()) {
      setProviderState("error");
      setProviderError("Tauri command bridge unavailable.");
      return;
    }

    setProviderState("testing");
    setProviderError("");
    setValidationResult(null);
    const cleanBaseUrl = baseUrl.trim();
    const cleanModel = defaultModel.trim() || fallbackModel.trim() || undefined;
    const command =
      kind === "ollama"
        ? "scan_ollama_runtime"
        : kind === "lmstudio"
          ? "scan_lmstudio_runtime"
          : kind === "comfyui"
            ? "scan_comfy_runtime"
            : "validate_openai_provider";
    const request =
      kind === "ollama" || kind === "lmstudio" || kind === "comfyui"
        ? { baseUrl: cleanBaseUrl || undefined, customPath: undefined }
        : {
            kind,
            baseUrl: cleanBaseUrl,
            apiKeyRef: apiKeyRef.trim() || undefined,
            model: cleanModel,
            includeTestRequest: Boolean(cleanModel),
          };
    invoke<ProviderValidationReport | LocalRuntimeScanResult | ComfyScanResult>(command, { request })
      .then((report) => {
        setValidationResult(report);
        setProviderState("idle");
      })
      .catch((error: unknown) => {
        setProviderState("error");
        setProviderError(error instanceof Error ? error.message : String(error));
      });
  }

  function requestProviderPlan(
    overrides: {
      defaultModelOverride?: string;
      fallbackModelOverride?: string;
    } = {},
  ) {
    if (!hasTauriCommandBridge()) {
      setProviderState("error");
      setProviderError("Tauri command bridge unavailable.");
      return;
    }

    setProviderState("planning");
    setProviderError("");
    setProviderResult(null);
    const nextRequest = buildModelProviderUpdateRequest(agent.id, {
      kind,
      providerName,
      baseUrl,
      apiKeyRef,
      defaultModel: overrides.defaultModelOverride ?? defaultModel,
      fallbackModel: overrides.fallbackModelOverride ?? fallbackModel,
      ...modelParams,
    });
    invoke<ModelProviderUpdatePlan>("create_model_provider_update_plan", {
      request: nextRequest,
    })
      .then((plan) => {
        setProviderPlan(plan);
        setEffectivePreview(plan.effectiveModelAfter);
        setProviderState("idle");
      })
      .catch((error: unknown) => {
        setProviderState("error");
        setProviderError(error instanceof Error ? error.message : String(error));
      });
  }

  function applyProviderPlan(plan: ModelProviderUpdatePlan) {
    if (!hasTauriCommandBridge()) {
      setProviderState("error");
      setProviderError("Tauri command bridge unavailable.");
      return;
    }

    setProviderState("applying");
    setProviderError("");
    invoke<ModelProviderUpdateResult>("apply_model_provider_update", {
      request: {
        update: updateRequest,
        expectedHash: plan.oldHash,
      },
    })
      .then((result) => {
        setProviderResult(result);
        setProviderState("success");
        onRefreshAfterMutation();
      })
      .catch((error: unknown) => {
        setProviderState("error");
        setProviderError(error instanceof Error ? error.message : String(error));
      });
  }

  return (
    <>
      <div className="operationTitleRow">
        <div>
          <p className="eyebrow">Provider / Model</p>
          <h3>{agent.displayName}</h3>
        </div>
        <div className="operationTitleActions">
          <button className="secondaryButton compactActionButton" type="button" onClick={openAddModelDialog}>
            + 添加新模型
          </button>
        </div>
      </div>

      <section className="providerManagerPanel" aria-label="Provider and model manager">
        <section className="configuredModelPanel" aria-label="Configured models">
          <div className="sectionTitleRow">
            <div>
              <h4>已配置模型列表</h4>
              <span>
                {modelProviderListState === "loading"
                  ? "正在调用 runtime 只读模型/provider 列表..."
                  : `来源：${modelProviderList?.source ?? "扫描到的 agent/profile 配置元数据"}`}
              </span>
            </div>
            <button className="secondaryButton compactActionButton" type="button" onClick={previewEffectiveModel}>
              {providerState === "previewing" ? "解析中..." : "预览 effective model"}
            </button>
          </div>
          {modelProviderListState === "error" && configuredModels.length === 0 ? (
            <div className="warningList">
              <span>{modelProviderListError}</span>
            </div>
          ) : null}
          {modelProviderList?.warnings.length ? (
            <div className="warningList">
              {modelProviderList.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}
          {configuredModels.length === 0 ? (
            <div className="emptyDetailState">
              <strong>未扫描到已配置模型</strong>
              <span>OpenClaw/Hermes 只读命令/API 和本地配置扫描都没有返回可展示的模型。</span>
            </div>
          ) : (
            <div className="configuredModelList">
              {configuredModels.map((model, index) => (
                <button className="configuredModelRow" type="button" key={`${model.id}:${index}`} onClick={() => openConfiguredModel(model)}>
                  <span>
                    <strong>{model.id}</strong>
                    <small>Model ID</small>
                  </span>
                  <span>
                    <strong>{model.name}</strong>
                    <small>Name</small>
                  </span>
                  <span>
                    <strong>{model.providerName ?? "未扫描"}</strong>
                    <small>Provider</small>
                  </span>
                  <span>
                    <strong>{model.baseUrl ?? "未扫描"}</strong>
                    <small>Base URL / Endpoint</small>
                  </span>
                  <span className={model.defaultModel ? "modelRoleBadge modelRoleBadgeActive" : "modelRoleBadge"}>
                    Default {model.defaultModel ? "true" : "false"}
                  </span>
                  <span className={model.fallbackModel ? "modelRoleBadge modelRoleBadgeActive" : "modelRoleBadge"}>
                    Fallback {model.fallbackModel ? "true" : "false"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {effectivePreview ? <EffectiveModelPreviewView preview={effectivePreview} /> : null}
        </section>

        <section className="providerProfileManager" aria-label="Provider profile manager">
          <div className="sectionTitleRow">
            <div>
              <h4>Provider Profile 区域</h4>
              <span>
                Provider Profile 是可复用的 provider endpoint / model 元数据，不等同于当前 Agent/Profile
                已生效配置。
              </span>
            </div>
            <button className="secondaryButton compactActionButton" type="button" onClick={exportProviderProfiles}>
              导出
            </button>
          </div>
          <div className="profilePurposeNote">
            {profileListState === "loading"
              ? "加载中..."
              : "选择 profile 只会回填表单；写入当前 Agent/Profile 仍需生成更新计划并确认应用。"}
          </div>
          <div className="providerProfileList">
            {providerProfiles.length === 0 ? (
              <span className="emptyInlineNote">尚未保存 Provider Profile。</span>
            ) : (
              providerProfiles.map((profile, index) => (
                <div className="providerProfileRow" key={profile.id}>
                  <button type="button" onClick={() => selectProviderProfile(profile)}>
                    <strong>{profile.name}</strong>
                    <span>{profile.kind} · {profile.defaultModel ?? "no model"}</span>
                  </button>
                  <div>
                    <button type="button" disabled={index === 0} onClick={() => moveProviderProfile(profile.id, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === providerProfiles.length - 1}
                      onClick={() => moveProviderProfile(profile.id, 1)}
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => deleteProviderProfile(profile.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <textarea
            value={providerProfileJson}
            onChange={(event) => setProviderProfileJson(event.target.value)}
            placeholder="导出 JSON 会显示在这里；也可以粘贴 AgentDock providerProfiles.v1 JSON 后导入。"
          />
          <button className="secondaryButton compactActionButton" type="button" onClick={importProviderProfiles}>
            导入 JSON
          </button>
        </section>

        {providerPlan ? (
          <section className="providerPlanPreview" aria-label="Provider model update plan preview">
            <h4>Provider / Model 更新计划</h4>
            <dl className="detailGrid">
              <DetailItem label="目标文件" value={providerPlan.targetFiles.join(", ")} />
              <DetailItem label="旧 hash" value={providerPlan.oldHash} />
              <DetailItem label="新 hash" value={providerPlan.newHash} />
              <DetailItem label="仅影响当前 Agent/Profile" value={providerPlan.affectsOnlySelectedAgentProfile ? "是" : "否"} />
            </dl>
            {providerPlan.warnings.length > 0 ? (
              <div className="warningList">
                {providerPlan.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            ) : null}
            <pre className="diffPreview">{providerPlan.unifiedDiff}</pre>
            {providerResult ? (
              <div className="previewSuccess">
                <strong>Provider / Model 已更新</strong>
                <span>备份路径：{providerResult.backupPath}</span>
              </div>
            ) : null}
            {providerState === "error" ? (
              <div className="previewError">
                <strong>Provider / Model 更新失败</strong>
                <span>{providerError}</span>
              </div>
            ) : null}
            <button
              className="previewConfirmButton"
              type="button"
              disabled={
                providerState === "applying" ||
                providerState === "success" ||
                !providerPlan.affectsOnlySelectedAgentProfile ||
                !providerPlan.backupWillBeCreated
              }
              onClick={() => applyProviderPlan(providerPlan)}
            >
              {providerState === "applying" ? "写入中..." : "确认应用 Provider / Model 更新"}
            </button>
          </section>
        ) : null}
        {providerState === "error" && !providerPlan ? (
          <div className="previewError">
            <strong>Provider 操作失败</strong>
            <span>{providerError}</span>
          </div>
        ) : null}
        {modelDialog ? (
          <ProviderModelDialog
            apiKeyRef={selectedApiKeyRef}
            apiKeyVisible={apiKeyVisible}
            baseUrl={baseUrl}
            dialog={modelDialog}
            kind={kind}
            modelParams={modelParams}
            providerName={providerName}
            providerState={providerState}
            onApiKeyRefChange={(value) => {
              setApiKeyRef(value);
              setProviderPlan(null);
            }}
            onApiKeyVisibleChange={setApiKeyVisible}
            onBaseUrlChange={(value) => {
              setBaseUrl(value);
              setProviderPlan(null);
            }}
            onClose={closeModelDialog}
            onDialogChange={setModelDialog}
            onKindChange={(nextKind) => {
              setKind(nextKind);
              setProviderName(providerKindOptions.find((option) => option.id === nextKind)?.label ?? nextKind);
              setBaseUrl(defaultProviderBaseUrl(nextKind));
              setProviderPlan(null);
            }}
            onModelParamChange={updateModelParameter}
            onProviderNameChange={(value) => {
              setProviderName(value);
              setProviderPlan(null);
            }}
            onSave={saveModelDialog}
          />
        ) : null}
      </section>
    </>
  );
}

function ProviderModelDialog({
  apiKeyRef,
  apiKeyVisible,
  baseUrl,
  dialog,
  kind,
  modelParams,
  providerName,
  providerState,
  onApiKeyRefChange,
  onApiKeyVisibleChange,
  onBaseUrlChange,
  onClose,
  onDialogChange,
  onKindChange,
  onModelParamChange,
  onProviderNameChange,
  onSave,
}: {
  apiKeyRef: string;
  apiKeyVisible: boolean;
  baseUrl: string;
  dialog: ProviderModelDialogState;
  kind: ProviderKind;
  modelParams: ModelParameterForm;
  providerName: string;
  providerState: "idle" | "previewing" | "testing" | "planning" | "applying" | "success" | "error";
  onApiKeyRefChange: (value: string) => void;
  onApiKeyVisibleChange: (visible: boolean) => void;
  onBaseUrlChange: (value: string) => void;
  onClose: () => void;
  onDialogChange: (dialog: ProviderModelDialogState) => void;
  onKindChange: (kind: ProviderKind) => void;
  onModelParamChange: (field: keyof ModelParameterForm, value: string) => void;
  onProviderNameChange: (value: string) => void;
  onSave: () => void;
}) {
  const title = dialog.mode === "add" ? "添加新模型" : "模型详情";

  return (
    <div className="modelDialogBackdrop" role="presentation">
      <section className="modelDialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modelDialogHeader">
          <div>
            <p className="eyebrow">{dialog.mode === "add" ? "Add Model" : "Configured Model"}</p>
            <h4>{title}</h4>
          </div>
          <button className="dialogCloseButton" type="button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        {dialog.mode === "add" ? (
          <div className="providerPresetGrid providerPresetGridCompact" aria-label="Provider kind">
            {providerKindOptions.map((option) => (
              <button
                className={kind === option.id ? "providerPreset providerPresetActive" : "providerPreset"}
                key={option.id}
                type="button"
                onClick={() => onKindChange(option.id)}
              >
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="profilePurposeNote">
            已配置模型详情只展示该模型当前扫描到的 provider 信息；如需新增不同 provider，请使用右上角“添加新模型”。
          </div>
        )}

        <div className="modelDialogForm">
          <label>
            <span>模型 ID</span>
            <input
              value={dialog.modelId}
              onChange={(event) =>
                onDialogChange({
                  ...dialog,
                  modelId: event.target.value,
                })
              }
              placeholder="gpt-4.1-mini"
            />
          </label>
          <label>
            <span>模型 Name</span>
            <input
              value={dialog.modelName}
              onChange={(event) =>
                onDialogChange({
                  ...dialog,
                  modelName: event.target.value,
                })
              }
              placeholder="可读名称，默认使用模型 ID"
            />
          </label>
          <label>
            <span>Provider Name</span>
            <input
              value={providerName}
              readOnly={dialog.mode === "detail"}
              onChange={(event) => onProviderNameChange(event.target.value)}
            />
          </label>
          <label>
            <span>Base URL / Endpoint</span>
            <input
              value={baseUrl}
              readOnly={dialog.mode === "detail"}
              onChange={(event) => onBaseUrlChange(event.target.value)}
            />
          </label>
          <label className="apiKeyInputField">
            <span>API Key</span>
            <div className="apiKeyInputWrap">
              <input
                type={apiKeyVisible ? "text" : "password"}
                value={apiKeyRef}
                readOnly={dialog.mode === "detail"}
                onChange={(event) => onApiKeyRefChange(event.target.value)}
                placeholder="OPENAI_API_KEY"
              />
              <button
                className="eyeIconButton"
                type="button"
                aria-label={apiKeyVisible ? "隐藏 API Key 引用" : "显示 API Key 引用"}
                title={apiKeyVisible ? "隐藏 API Key 引用" : "显示 API Key 引用"}
                onClick={() => onApiKeyVisibleChange(!apiKeyVisible)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <small>只展示已扫描到的引用名；AgentDock 不读取、不复制、不存储 secret 值。</small>
          </label>
          <div className="modelRoleToggles" aria-label="Model roles">
            <label>
              <input
                type="checkbox"
                checked={dialog.defaultModel}
                onChange={(event) =>
                  onDialogChange({
                    ...dialog,
                    defaultModel: event.target.checked,
                  })
                }
              />
              <span>Default model ({dialog.defaultModel ? "true" : "false"})</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={dialog.fallbackModel}
                onChange={(event) =>
                  onDialogChange({
                    ...dialog,
                    fallbackModel: event.target.checked,
                  })
                }
              />
              <span>Fallback model ({dialog.fallbackModel ? "true" : "false"})</span>
            </label>
          </div>
        </div>

        <section className="modelParameterSection" aria-label="Model parameters">
          <div>
            <h5>模型参数</h5>
            <span>参考 OpenClaw/Hermes provider 文档和 cc-switch 模式；会随本次 provider/model 计划写入。</span>
          </div>
          <div className="modelParameterGrid">
            <label>
              <span>上下文长度</span>
              <input
                inputMode="numeric"
                value={modelParams.contextLength}
                onChange={(event) => onModelParamChange("contextLength", event.target.value)}
                placeholder="例如 128000"
              />
            </label>
            <label>
              <span>max tokens</span>
              <input
                inputMode="numeric"
                value={modelParams.maxTokens}
                onChange={(event) => onModelParamChange("maxTokens", event.target.value)}
                placeholder="例如 8192"
              />
            </label>
            <label>
              <span>timeout seconds</span>
              <input
                inputMode="numeric"
                value={modelParams.timeoutSeconds}
                onChange={(event) => onModelParamChange("timeoutSeconds", event.target.value)}
                placeholder="例如 120"
              />
            </label>
            <label>
              <span>thinking</span>
              <select value={modelParams.thinking} onChange={(event) => onModelParamChange("thinking", event.target.value)}>
                <option value="">未设置</option>
                <option value="enabled">enabled</option>
                <option value="disabled">disabled</option>
                <option value="auto">auto</option>
              </select>
            </label>
            <label>
              <span>reasoning</span>
              <select value={modelParams.reasoning} onChange={(event) => onModelParamChange("reasoning", event.target.value)}>
                <option value="">未设置</option>
                <option value="enabled">enabled</option>
                <option value="disabled">disabled</option>
                <option value="auto">auto</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
          </div>
        </section>

        <div className="modelDialogActions">
          <button className="previewCancelButton" type="button" onClick={onClose}>
            取消
          </button>
          <button className="previewConfirmButton" type="button" disabled={providerState === "planning"} onClick={onSave}>
            {providerState === "planning" ? "生成计划中..." : "保存"}
          </button>
        </div>
      </section>
    </div>
  );
}

function EffectiveModelPreviewView({ preview }: { preview: EffectiveModelPreview }) {
  return (
    <section className="effectiveModelPreview" aria-label="Effective model resolution">
      <h4>Effective model resolution</h4>
      <strong>{preview.effectiveModel ?? "未配置有效模型"}</strong>
      <span>{preview.explanation}</span>
      {preview.warnings.length > 0 ? (
        <div className="warningList">
          {preview.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      <div className="effectiveSteps">
        {preview.steps.map((step) => (
          <div className={step.active ? "effectiveStep effectiveStepActive" : "effectiveStep"} key={step.label}>
            <strong>{step.label}</strong>
            <span>{step.model ?? "未设置"}</span>
            <small>{step.reason}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderValidationView({
  report,
}: {
  report: ProviderValidationReport | LocalRuntimeScanResult | ComfyScanResult;
}) {
  if ("connectionStatus" in report) {
    return (
      <section className="providerValidationReport" aria-label="Provider validation report">
        <h4>连接测试结果</h4>
        <DetailItem label="连接" value={report.connectionStatus} />
        <DetailItem label="Auth" value={report.authStatus} />
        <DetailItem label="模型列表" value={report.modelListStatus} />
        <DetailItem label="生成测试" value={report.generationStatus} />
        <DetailItem label="API Key 引用" value={report.apiKeyReferenceStatus} />
        <ModelList models={report.models} />
      </section>
    );
  }

  if ("endpointReachable" in report) {
    return (
      <section className="providerValidationReport" aria-label="ComfyUI scan report">
        <h4>ComfyUI 扫描结果</h4>
        <DetailItem label="Endpoint" value={report.endpoint ?? "未设置"} />
        <DetailItem label="Endpoint reachable" value={report.endpointReachable ? "是" : "否"} />
        <DetailItem label="Chat LLM provider" value={report.isChatLlmProvider ? "是" : "否"} />
        <ModelList models={report.capabilityFolders.flatMap((folder) => folder.models)} />
      </section>
    );
  }

  return (
    <section className="providerValidationReport" aria-label="Local runtime scan report">
      <h4>本地运行时扫描结果</h4>
      <DetailItem label="Runtime" value={report.runtime} />
      <DetailItem label="Endpoint" value={report.endpoint ?? "未设置"} />
      <DetailItem label="Reachable" value={report.reachable ? "是" : "否"} />
      <ModelList models={report.models.map((model) => model.name)} />
    </section>
  );
}

function ModelList({ models }: { models: string[] }) {
  if (models.length === 0) {
    return <span className="emptyInlineNote">未读取到模型列表。</span>;
  }

  return (
    <div className="modelChipList">
      {models.slice(0, 12).map((model) => (
        <span key={model}>{model}</span>
      ))}
    </div>
  );
}

function LifecyclePlanPanel({
  actionLabel,
  inputLabel,
  inputValue,
  plan,
  state,
  result,
  error,
  onInputChange,
  onRequestPlan,
  onApplyPlan,
  onDismiss,
}: {
  actionLabel: string;
  inputLabel: string;
  inputValue: string;
  plan: LifecyclePlan | null;
  state: "idle" | "planning" | "applying" | "success" | "error";
  result: LifecycleResult | null;
  error: string;
  onInputChange: (value: string) => void;
  onRequestPlan: () => void;
  onApplyPlan: (plan: LifecyclePlan) => void;
  onDismiss: () => void;
}) {
  return (
    <section className="lifecyclePlanPanel" aria-label={`${actionLabel} Agent/Profile plan`}>
      <label>
        <span>{inputLabel}</span>
        <input
          type="text"
          value={inputValue}
          disabled={state === "applying" || state === "success"}
          onChange={(event) => onInputChange(event.target.value)}
        />
      </label>
      <div className="lifecyclePlanActions">
        <button
          className="secondaryButton compactActionButton"
          type="button"
          disabled={state === "planning" || state === "applying" || state === "success"}
          onClick={onRequestPlan}
        >
          {state === "planning" ? "生成中..." : `生成${actionLabel}计划`}
        </button>
        <button className="previewCancelButton" type="button" onClick={onDismiss}>
          取消
        </button>
      </div>
      {plan ? (
        <div className="lifecyclePlanPreview">
          <h4>{actionLabel}计划预览</h4>
          <dl className="detailGrid">
            <div>
              <dt>操作</dt>
              <dd>{plan.operation}</dd>
            </div>
            <div>
              <dt>目标路径</dt>
              <dd>{plan.targetPath}</dd>
            </div>
            <div>
              <dt>计划哈希</dt>
              <dd>{plan.planHash}</dd>
            </div>
            <div>
              <dt>计划写入项</dt>
              <dd>{plan.willCreateFiles.length || plan.includedFiles.length}</dd>
            </div>
          </dl>
          {plan.sourcePath ? (
            <div className="previewExplanation">来源路径：{plan.sourcePath}</div>
          ) : null}
          {plan.skippedItems.length > 0 ? (
            <div className="warningList">
              {plan.skippedItems.map((item) => (
                <span key={item}>跳过：{item}</span>
              ))}
            </div>
          ) : null}
          {plan.warnings.length > 0 ? (
            <div className="warningList">
              {plan.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}
          {plan.blockedReason ? <div className="previewBlocked">{plan.blockedReason}</div> : null}
          {state === "success" && result ? (
            <div className="previewSuccess">
              <strong>{actionLabel}完成</strong>
              <span>目标路径：{result.targetPath}</span>
            </div>
          ) : null}
          {state === "error" ? (
            <div className="previewError">
              <strong>{actionLabel}失败</strong>
              <span>{error}</span>
            </div>
          ) : null}
          {plan.blockedReason ? null : (
            <button
              className="previewConfirmButton"
              type="button"
              disabled={state === "applying" || state === "success"}
              onClick={() => onApplyPlan(plan)}
            >
              {state === "applying" ? "执行中..." : `确认${actionLabel}`}
            </button>
          )}
        </div>
      ) : null}
      {state === "error" && !plan ? (
        <div className="previewError">
          <strong>{actionLabel}计划失败</strong>
          <span>{error}</span>
        </div>
      ) : null}
    </section>
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
  restorePlan,
  restorePlanRequestState,
  restorePlanError,
  onRequestRestorePlan,
  onDismissRestorePlan,
  onApplyRestoreTrashItem,
  restoreApplyState,
  restoreApplyResult,
  restoreApplyError,
  copyPanelOpen,
  copyName,
  copyPlan,
  copyState,
  copyResult,
  copyError,
  onOpenCopyPanel,
  onChangeCopyName,
  onRequestCopyLifecyclePlan,
  onApplyCopyLifecyclePlan,
  onDismissCopyLifecyclePlan,
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
  restorePlan: RestoreTrashItemPlan | null;
  restorePlanRequestState: "idle" | "loading" | "error";
  restorePlanError: string;
  onRequestRestorePlan: (trashTargetPath: string) => void;
  onDismissRestorePlan: () => void;
  onApplyRestoreTrashItem: (plan: RestoreTrashItemPlan) => void;
  restoreApplyState: "idle" | "running" | "success" | "error";
  restoreApplyResult: RestoreTrashItemResult | null;
  restoreApplyError: string;
  copyPanelOpen: boolean;
  copyName: string;
  copyPlan: LifecyclePlan | null;
  copyState: "idle" | "planning" | "applying" | "success" | "error";
  copyResult: LifecycleResult | null;
  copyError: string;
  onOpenCopyPanel: (agent: ManagedAgent) => void;
  onChangeCopyName: (name: string) => void;
  onRequestCopyLifecyclePlan: (agent: ManagedAgent) => void;
  onApplyCopyLifecyclePlan: (plan: LifecyclePlan) => void;
  onDismissCopyLifecyclePlan: () => void;
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
        <div className="operationTitleActions">
          <button
            className="secondaryButton compactActionButton"
            type="button"
            title="生成复制 Agent/Profile 计划"
            onClick={() => onOpenCopyPanel(selectedAgent)}
          >
            复制
          </button>
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
          <DetailItem label="Workspace/Profile path" value={selectedAgent.workspaceOrProfilePath} />
          <DetailItem label="配置文件路径" value={formatConfigPath(selectedAgent)} />
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

      {copyPanelOpen ? (
        <LifecyclePlanPanel
          actionLabel="复制"
          inputLabel="复制为"
          inputValue={copyName}
          plan={copyPlan}
          state={copyState}
          result={copyResult}
          error={copyError}
          onInputChange={onChangeCopyName}
          onRequestPlan={() => onRequestCopyLifecyclePlan(selectedAgent)}
          onApplyPlan={onApplyCopyLifecyclePlan}
          onDismiss={onDismissCopyLifecyclePlan}
        />
      ) : null}

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
            这不会彻底移除文件。AgentDock 会先创建备份，再将该 Agent/Profile 移入本地 Trash。移入后它会从 AgentDock 管理列表中移除；如果 Gateway 或 channel 已缓存该 Agent，可能需要重启 Gateway 后才会完全失效。
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
              <button
                className="previewRestoreButton"
                type="button"
                disabled={restorePlanRequestState === "loading" || restorePlan !== null}
                onClick={() => onRequestRestorePlan(deleteAgentApplyResult.trashTargetPath)}
              >
                {restorePlanRequestState === "loading" ? "加载中..." : "生成恢复计划"}
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
          {restorePlan ? (
            <section className="restorePlanPreview" aria-label="Restore plan preview">
              <h4>恢复计划预览</h4>
              <dl className="detailGrid">
                <div>
                  <dt>操作</dt>
                  <dd>{restorePlan.operation}</dd>
                </div>
                <div>
                  <dt>恢复目标路径</dt>
                  <dd>{restorePlan.targetPath}</dd>
                </div>
                <div>
                  <dt>运行时</dt>
                  <dd>{restorePlan.runtime === "openclaw" ? "OpenClaw" : "Hermes"}</dd>
                </div>
                <div>
                  <dt>恢复计划哈希</dt>
                  <dd>{restorePlan.planHash}</dd>
                </div>
              </dl>
              {restorePlan.warnings.length > 0 ? (
                <div className="warningList">
                  {restorePlan.warnings.map((warning, index) => (
                    <span key={index}>{warning}</span>
                  ))}
                </div>
              ) : null}
              {restorePlan.blockedReason ? (
                <div className="previewBlocked">{restorePlan.blockedReason}</div>
              ) : null}
              <div className="previewExplanation">
                恢复会将该 Agent/Profile 从 Trash 移回到原始路径。如果原始路径已存在同名目录，恢复计划会被阻止。
              </div>
              {restoreApplyState === "success" && restoreApplyResult ? (
                <div className="previewSuccess">
                  <strong>恢复完成</strong>
                  <span>该 Agent/Profile 已恢复到 {restoreApplyResult.targetPath}。</span>
                </div>
              ) : null}
              {restoreApplyState === "error" ? (
                <div className="previewError">
                  <strong>恢复失败</strong>
                  <span>{restoreApplyError}</span>
                </div>
              ) : null}
              {restorePlan.blockedReason ? null : (
                <button
                  className="previewConfirmButton"
                  type="button"
                  disabled={restoreApplyState === "running" || restoreApplyState === "success"}
                  onClick={() => onApplyRestoreTrashItem(restorePlan)}
                >
                  {restoreApplyState === "running" ? "恢复中..." : "确认恢复"}
                </button>
              )}
              <button className="previewCancelButton" type="button" onClick={onDismissRestorePlan}>
                取消
              </button>
            </section>
          ) : null}
          {restorePlanRequestState === "error" && !restorePlan ? (
            <div className="previewError">
              <strong>生成恢复计划失败</strong>
              <span>{restorePlanError}</span>
            </div>
          ) : null}
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
  const installCommand = recommendedInstallCommand(runtime.product);

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
        <span>官方推荐安装命令预览</span>
        <code>{installCommand}</code>
      </div>
      <div className="safetyList">
        <span>安装按钮当前为 disabled placeholder，不会执行命令。</span>
        <span>正式安装前必须选择安装方式和安装位置。</span>
        <span>执行前必须再次展示命令预览、跳过选项、备份点和安装后重扫选项。</span>
        <span>AgentDock 不上传本地配置、会话、记忆或 secret。</span>
      </div>
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

function getBrowserVersionDetailFallback(product: RuntimeProduct) {
  if (product === "openclaw") {
    return ["OpenClaw v0.0.0-fixture", "Update status: fixture only"];
  }

  return ["Hermes Agent v0.0.0-fixture", "Python: fixture", "OpenAI SDK: fixture", "Update status: fixture only"];
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
    providerSummary: {
      provider: product === "hermes" ? "lmstudio" : "OpenAI-compatible",
      baseUrl: product === "hermes" ? null : "http://localhost:9999/v1",
      secretFields: product === "hermes" ? [] : ["OPENAI_API_KEY"],
      missingSecretFields: [],
    },
    modelSummary: {
      defaultModel:
        product === "hermes" ? "qwen3.5-9b-uncensored-hauhaucs-aggressive" : "xopglm51",
      fallbackModel:
        product === "hermes" ? "qwen3.6-27b-aeon-ultimate-uncensored-i1" : "xopkimi26",
      configuredModels:
        product === "hermes"
          ? [
              {
                modelId: "qwen3.5-9b-uncensored-hauhaucs-aggressive",
                name: "qwen3.5-9b-uncensored-hauhaucs-aggressive",
                provider: "lmstudio",
                baseUrl: null,
                defaultModel: true,
                fallbackModel: false,
                source: "model.default",
              },
              {
                modelId: "qwen3.6-27b-aeon-ultimate-uncensored-i1",
                name: "qwen3.6-27b-aeon-ultimate-uncensored-i1",
                provider: "lmstudio",
                baseUrl: null,
                defaultModel: false,
                fallbackModel: true,
                source: "fallback_providers",
              },
              {
                modelId: "qwen3.5-9b-uncensored-hauhaucs-aggressive",
                name: "qwen9b",
                provider: "lmstudio",
                baseUrl: null,
                defaultModel: false,
                fallbackModel: false,
                source: "model_aliases",
              },
              {
                modelId: "qwen3.6-27b-aeon-ultimate-uncensored-i1",
                name: "qwen27b",
                provider: "lmstudio",
                baseUrl: null,
                defaultModel: false,
                fallbackModel: false,
                source: "model_aliases",
              },
            ]
          : [
              {
                modelId: "xopglm51",
                name: "xopglm51",
                provider: "OpenAI-compatible",
                baseUrl: "http://localhost:9999/v1",
                defaultModel: true,
                fallbackModel: false,
                source: "default_model",
              },
              {
                modelId: "xopkimi26",
                name: "xopkimi26",
                provider: "OpenAI-compatible",
                baseUrl: "http://localhost:9999/v1",
                defaultModel: false,
                fallbackModel: true,
                source: "fallback_model",
              },
            ],
    },
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

function formatConfigPath(agent: ManagedAgent) {
  return agent.configFiles.find((file) => !file.sensitive && !file.skipped)?.path ?? agent.configRoot;
}

function recommendedInstallCommand(product: RuntimeProduct) {
  if (product === "openclaw") {
    return "curl -fsSL https://openclaw.ai/install.sh | bash";
  }

  return "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash";
}

function createTargetRoot(runtime: DashboardRuntime, name: string) {
  if (!runtime.homeDir) {
    return undefined;
  }

  const base = runtime.homeDir.replace(/\/$/, "");
  return runtime.product === "openclaw" ? `${base}/agents/${name}` : `${base}/profiles/${name}`;
}

function inferProviderKind(value?: string | null): ProviderKind {
  if (value === "ollama" || value === "lmstudio" || value === "comfyui" || value === "custom") {
    return value;
  }

  return "openai-compatible";
}

function defaultProviderBaseUrl(kind: ProviderKind) {
  if (kind === "ollama") {
    return "http://localhost:11434";
  }
  if (kind === "lmstudio") {
    return "http://localhost:1234";
  }
  if (kind === "comfyui") {
    return "http://localhost:8188";
  }

  return "";
}

function buildModelProviderUpdateRequest(
  agentId: string,
  values: {
    kind: ProviderKind;
    providerName: string;
    baseUrl: string;
    apiKeyRef: string;
    defaultModel: string;
    fallbackModel: string;
    contextLength: string;
    maxTokens: string;
    timeoutSeconds: string;
    thinking: string;
    reasoning: string;
  },
): ModelProviderUpdateRequest {
  return {
    agentId,
    providerId: `agent:${agentId}`,
    providerName: cleanFormValue(values.providerName) ?? values.kind,
    kind: values.kind,
    baseUrl: cleanFormValue(values.baseUrl),
    apiKeyRef: cleanFormValue(values.apiKeyRef),
    defaultModel: cleanFormValue(values.defaultModel),
    fallbackModel: cleanFormValue(values.fallbackModel),
    contextLength: cleanFormValue(values.contextLength),
    maxTokens: cleanFormValue(values.maxTokens),
    timeoutSeconds: cleanFormValue(values.timeoutSeconds),
    thinking: cleanFormValue(values.thinking),
    reasoning: cleanFormValue(values.reasoning),
  };
}

function providerProfileInput(update: ModelProviderUpdateRequest) {
  return {
    id: update.providerId,
    name: update.providerName ?? update.kind,
    kind: update.kind,
    baseUrl: update.baseUrl,
    apiKeyRef: update.apiKeyRef,
    defaultModel: update.defaultModel,
    fallbackModel: update.fallbackModel,
    validationJson: "{}",
  };
}

function cleanFormValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function configuredModelsForAgent(
  agent: ManagedAgent,
  defaultModel: string,
  fallbackModel: string,
  providerList: AgentModelProvidersResponse | null,
): ConfiguredModel[] {
  if (providerList?.models.length) {
    return providerList.models.map((model, index) => ({
      id: model.modelId,
      name: model.name || modelDisplayName(model.modelId, model.providerName ?? "Model"),
      role: model.fallbackModel && !model.defaultModel ? "fallback" : "default",
      providerName: model.providerName,
      baseUrl: model.baseUrl,
      apiKeyRef: model.apiKeyRef,
      defaultModel: model.defaultModel,
      fallbackModel: model.fallbackModel,
      source: model.source || providerList.source || `runtime model list ${index + 1}`,
      warnings: model.warnings ?? [],
    }));
  }

  if (agent.modelSummary?.configuredModels?.length) {
    return agent.modelSummary.configuredModels.map((model, index) => ({
      id: model.modelId,
      name: model.name || modelDisplayName(model.modelId, model.provider ?? "Model"),
      role: model.fallbackModel && !model.defaultModel ? "fallback" : "default",
      providerName: model.provider ?? agent.providerSummary?.provider ?? null,
      baseUrl:
        model.baseUrl ??
        agent.providerSummary?.baseUrl ??
        defaultBaseUrlForProvider(model.provider ?? agent.providerSummary?.provider),
      apiKeyRef: agent.providerSummary?.secretFields[0] ?? null,
      defaultModel: model.defaultModel,
      fallbackModel: model.fallbackModel,
      source: model.source || `scanned configured model ${index + 1}`,
      warnings: [],
    }));
  }

  const models: ConfiguredModel[] = [];
  const cleanDefault = defaultModel.trim();
  const cleanFallback = fallbackModel.trim();

  if (cleanDefault) {
    models.push({
      id: cleanDefault,
      name: modelDisplayName(cleanDefault, agent.providerSummary?.provider ?? "Default"),
      role: "default",
      providerName: agent.providerSummary?.provider ?? null,
      baseUrl: agent.providerSummary?.baseUrl ?? defaultBaseUrlForProvider(agent.providerSummary?.provider),
      apiKeyRef: agent.providerSummary?.secretFields[0] ?? null,
      defaultModel: true,
      fallbackModel: cleanFallback === cleanDefault,
      source: "scanned agent config metadata",
      warnings: [],
    });
  }
  if (cleanFallback && cleanFallback !== cleanDefault) {
    models.push({
      id: cleanFallback,
      name: modelDisplayName(cleanFallback, agent.providerSummary?.provider ?? "Fallback"),
      role: "fallback",
      providerName: agent.providerSummary?.provider ?? null,
      baseUrl: agent.providerSummary?.baseUrl ?? defaultBaseUrlForProvider(agent.providerSummary?.provider),
      apiKeyRef: agent.providerSummary?.secretFields[0] ?? null,
      defaultModel: false,
      fallbackModel: true,
      source: "scanned agent config metadata",
      warnings: [],
    });
  }

  return models;
}

function modelDisplayName(modelId: string, providerName: string) {
  const normalized = modelId
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return providerName;
  }
  return normalized;
}

function defaultBaseUrlForProvider(provider?: string | null) {
  const normalized = provider?.toLowerCase();
  if (normalized === "lmstudio" || normalized === "lm-studio" || normalized === "lm studio") {
    return "http://localhost:1234";
  }
  if (normalized === "ollama") {
    return "http://localhost:11434";
  }
  if (normalized === "comfyui") {
    return "http://localhost:8188";
  }
  return null;
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
