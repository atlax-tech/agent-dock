import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type RuntimeKind = "openClaw" | "hermes";
type PersonalityFileKind = "soul" | "agents" | "user";
type DetailTab = "overview" | "personality" | "modelProvider" | "files" | "backups";
type ProviderKind = "openai-compatible" | "ollama" | "lmstudio" | "comfyui" | "custom";

type ScanRoot = {
  runtime: RuntimeKind;
  path: string;
  source: "fixture" | "defaultCandidate" | "userSelected";
  exists: boolean;
  readable: boolean;
  lastScannedAt: string | null;
};

type ScanWarning = {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
};

type AgentRecord = {
  id: string;
  runtime: RuntimeKind;
  name: string;
  rootPath: string;
  configPaths: string[];
  personalityFiles: string[];
  skillPaths: string[];
  providerSummary: {
    provider?: string;
    baseUrl?: string;
    secretFields: string[];
    missingSecretFields: string[];
  };
  modelSummary: {
    defaultModel?: string;
    fallbackModel?: string;
  };
  channelSummary: {
    channelHints: string[];
    tokenFields: string[];
  };
  warnings: ScanWarning[];
  healthStatus: "ok" | "warning" | "error";
  lastScannedAt: string;
};

type InitialScanState = {
  scanRoots: ScanRoot[];
  agents: AgentRecord[];
  privacyMode: {
    localOnly: boolean;
    readOnly: boolean;
    defaultCandidatesInspected: boolean;
  };
};

type ScanPreview = {
  runtime: RuntimeKind;
  path: string;
  exists: boolean;
  readable: boolean;
  estimatedScanMode: string;
  privateDirsSkipped: string[];
  configExtensions: string[];
  willReadConfigMetadata: boolean;
  willSkipRuntimePrivateData: boolean;
  willNotStoreSecretValues: boolean;
  warnings: ScanWarning[];
};

type PersonalityFileMetadata = {
  fileKind: PersonalityFileKind;
  resolvedPath: string;
  exists: boolean;
  sizeBytes?: number;
  lastModifiedTime?: string;
};

type PathMetadata = {
  path: string;
  exists: boolean;
  sizeBytes?: number;
  lastModifiedTime?: string;
};

type AgentDetail = {
  id: string;
  name: string;
  runtime: RuntimeKind;
  rootPath: string;
  configPaths: string[];
  personalityFiles: PersonalityFileMetadata[];
  skillPaths: PathMetadata[];
  providerSummary: AgentRecord["providerSummary"];
  modelSummary: AgentRecord["modelSummary"];
  channelSummary: AgentRecord["channelSummary"];
  healthStatus: AgentRecord["healthStatus"];
  warnings: ScanWarning[];
  lastScannedAt: string;
};

type PersonalityRead = {
  fileKind: PersonalityFileKind;
  resolvedPath: string;
  exists: boolean;
  content: string;
  contentHash: string;
  lastModifiedTime?: string;
};

type PersonalityPlan = {
  agentId: string;
  runtime: RuntimeKind;
  fileKind: PersonalityFileKind;
  targetPath: string;
  oldHash: string;
  newHash: string;
  unifiedDiff: string;
  warnings: string[];
  backupWillBeCreated: boolean;
};

type PersonalityRestorePlan = {
  backupId: string;
  agentId: string;
  runtime: RuntimeKind;
  fileKind: PersonalityFileKind;
  targetPath: string;
  backupPath: string;
  currentHash: string;
  restoredHash: string;
  unifiedDiff: string;
  warnings: string[];
  safetyBackupWillBeCreated: boolean;
};

type BackupRecord = {
  backupId: string;
  agentId: string;
  runtime: RuntimeKind;
  fileKind: string;
  originalPath: string;
  backupPath: string;
  createdAt: string;
  contentHashBefore: string;
  contentHashAfter: string;
};

type ProviderProfile = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKeyRef?: string;
  defaultModel?: string;
  fallbackModel?: string;
  validationJson: string;
  updatedAt: string;
};

type ProviderForm = {
  providerId?: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKeyRef: string;
  defaultModel: string;
  fallbackModel: string;
};

type EffectiveModelStep = {
  label: string;
  model?: string;
  active: boolean;
  reason: string;
  localOnly: boolean;
  mayCallRemoteApi: boolean;
  mayCreateCost: boolean;
};

type EffectiveModelPreview = {
  effectiveModel?: string;
  source: string;
  explanation: string;
  localOnly: boolean;
  mayCallRemoteApi: boolean;
  mayCreateCost: boolean;
  steps: EffectiveModelStep[];
  warnings: string[];
};

type ModelProviderPlan = {
  agentId: string;
  runtime: RuntimeKind;
  targetFiles: string[];
  oldProviderSummary: AgentRecord["providerSummary"];
  newProviderSummary: AgentRecord["providerSummary"];
  oldModelSummary: AgentRecord["modelSummary"];
  newModelSummary: AgentRecord["modelSummary"];
  oldHash: string;
  newHash: string;
  unifiedDiff: string;
  warnings: string[];
  backupWillBeCreated: boolean;
  affectsOnlySelectedAgentProfile: boolean;
  effectiveModelBefore: EffectiveModelPreview;
  effectiveModelAfter: EffectiveModelPreview;
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

type RuntimeModel = {
  name: string;
  modified?: string;
  size?: number;
};

type LocalRuntimeScanResult = {
  runtime: string;
  endpoint?: string;
  reachable: boolean;
  models: RuntimeModel[];
  warnings: string[];
};

type ComfyScanResult = {
  providerKind: string;
  isChatLlmProvider: boolean;
  detectedPaths: string[];
  capabilityFolders: { kind: string; path: string; models: string[] }[];
  endpoint?: string;
  endpointReachable: boolean;
  warnings: string[];
};

type LifecyclePlan = {
  planHash: string;
  operation: string;
  runtime: RuntimeKind;
  targetPath: string;
  willCreateFiles: string[];
  willBackup: boolean;
  backupPath?: string;
  warnings: string[];
  blockedReason?: string;
  includedFiles?: string[];
  skippedItems?: string[];
};

type LifecycleResult = {
  operation: string;
  runtime: RuntimeKind;
  targetPath: string;
  backupPath?: string;
  scanResult: AgentRecord[];
};

type TrashItem = {
  trashPath: string;
  originalPath: string;
  runtime: RuntimeKind;
  name: string;
  deletedAt: string;
  manifest: {
    originalPath: string;
    runtime: string;
    name: string;
    deletedAt: string;
  };
};

const navigation = ["Dashboard", "Scan", "Agents", "Trash", "Settings"];
const personalityKinds: PersonalityFileKind[] = ["soul", "agents", "user"];
const providerKinds: ProviderKind[] = [
  "openai-compatible",
  "ollama",
  "lmstudio",
  "comfyui",
  "custom",
];

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

function runtimeLabel(runtime: RuntimeKind) {
  return runtime === "openClaw" ? "OpenClaw" : "Hermes";
}

function fileKindLabel(kind: PersonalityFileKind | string) {
  if (kind === "soul") {
    return "SOUL.md";
  }
  if (kind === "agents") {
    return "AGENTS.md";
  }
  return "USER.md";
}

function formatScanTime(value?: string | null) {
  if (!value) {
    return "Not scanned yet";
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return new Date(numeric * 1000).toLocaleString();
  }
  return value;
}

function formatBackupTime(value: string) {
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return new Date(numeric).toLocaleString();
  }
  return value;
}

function defaultProviderForm(): ProviderForm {
  return {
    name: "",
    kind: "openai-compatible",
    baseUrl: "",
    apiKeyRef: "",
    defaultModel: "",
    fallbackModel: "",
  };
}

function providerKindFromSummary(provider?: string): ProviderKind {
  const normalized = provider?.toLowerCase() ?? "";
  if (normalized.includes("ollama")) {
    return "ollama";
  }
  if (normalized.includes("lmstudio") || normalized.includes("lm studio")) {
    return "lmstudio";
  }
  if (normalized.includes("comfy")) {
    return "comfyui";
  }
  if (normalized.includes("custom")) {
    return "custom";
  }
  return "openai-compatible";
}

function providerUpdateFromForm(agentId: string, form: ProviderForm) {
  return {
    agentId,
    providerId: form.providerId,
    providerName: form.name || form.kind,
    kind: form.kind,
    baseUrl: form.baseUrl || undefined,
    apiKeyRef: form.apiKeyRef || undefined,
    defaultModel: form.defaultModel || undefined,
    fallbackModel: form.fallbackModel || undefined,
  };
}

export function App() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [roots, setRoots] = useState<ScanRoot[]>([]);
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeKind>("openClaw");
  const [selectedPath, setSelectedPath] = useState("");
  const [status, setStatus] = useState("Ready");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [previewRequestKey, setPreviewRequestKey] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [selectedFileKind, setSelectedFileKind] = useState<PersonalityFileKind>("soul");
  const [personalityRead, setPersonalityRead] = useState<PersonalityRead | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [plan, setPlan] = useState<PersonalityPlan | null>(null);
  const [restorePlan, setRestorePlan] = useState<PersonalityRestorePlan | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderForm>(() => defaultProviderForm());
  const [modelPlan, setModelPlan] = useState<ModelProviderPlan | null>(null);
  const [effectivePreview, setEffectivePreview] = useState<EffectiveModelPreview | null>(null);
  const [validationReport, setValidationReport] = useState<ProviderValidationReport | null>(null);
  const [runtimeScan, setRuntimeScan] = useState<LocalRuntimeScanResult | null>(null);
  const [comfyScan, setComfyScan] = useState<ComfyScanResult | null>(null);
  const [comfyPath, setComfyPath] = useState("");
  const [lifecyclePlan, setLifecyclePlan] = useState<LifecyclePlan | null>(null);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [newProfileName, setNewProfileName] = useState("");
  const [duplicateName, setDuplicateName] = useState("");
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");

  async function refreshIndex() {
    const [scanRoots, indexedAgents] = await Promise.all([
      invoke<ScanRoot[]>("get_scan_roots"),
      invoke<AgentRecord[]>("get_agent_index"),
    ]);
    setRoots(scanRoots);
    setAgents(indexedAgents);
  }

  async function refreshAgentDetail(agentId: string) {
    const [nextDetail, nextBackups] = await Promise.all([
      invoke<AgentDetail>("get_agent_detail", { agentId }),
      invoke<BackupRecord[]>("list_agent_backups", { agentId }),
    ]);
    setDetail(nextDetail);
    setBackups(nextBackups);
  }

  async function refreshProviderProfiles() {
    const profiles = await invoke<ProviderProfile[]>("list_provider_profiles");
    setProviderProfiles(profiles);
  }

  useEffect(() => {
    if (!isTauriRuntime()) {
      setStatus("Desktop runtime required for local commands");
      return;
    }
    void invoke<InitialScanState>("get_initial_scan_state")
      .then((initialState) => {
        setRoots(initialState.scanRoots);
        setAgents(initialState.agents);
        setStatus(
          initialState.privacyMode.defaultCandidatesInspected
            ? "Ready"
            : "Ready: default runtime paths have not been inspected",
        );
      })
      .catch((error) => {
        setRuntimeError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    if (!detail) {
      setProviderForm(defaultProviderForm());
      setEffectivePreview(null);
      return;
    }
    setProviderForm({
      name: detail.providerSummary.provider ?? "",
      kind: providerKindFromSummary(detail.providerSummary.provider),
      baseUrl: detail.providerSummary.baseUrl ?? "",
      apiKeyRef: detail.providerSummary.secretFields.length > 0 ? "ENV_OR_KEYCHAIN_REF" : "",
      defaultModel: detail.modelSummary.defaultModel ?? "",
      fallbackModel: detail.modelSummary.fallbackModel ?? "",
    });
    setModelPlan(null);
    setValidationReport(null);
    setRuntimeScan(null);
    setComfyScan(null);
    setComfyPath("");
    setRestorePlan(null);
  }, [detail]);

  useEffect(() => {
    if (!selectedAgentId || !isTauriRuntime()) {
      return;
    }
    void invoke<EffectiveModelPreview>("resolve_effective_model_preview", {
      request: {
        agentId: selectedAgentId,
        provider: {
          name: providerForm.name || providerForm.kind,
          kind: providerForm.kind,
          baseUrl: providerForm.baseUrl || undefined,
          apiKeyRef: providerForm.apiKeyRef || undefined,
          defaultModel: providerForm.defaultModel || undefined,
          fallbackModel: providerForm.fallbackModel || undefined,
          validationJson: "{}",
        },
      },
    })
      .then(setEffectivePreview)
      .catch(() => {
        setEffectivePreview(null);
      });
  }, [
    selectedAgentId,
    providerForm.name,
    providerForm.kind,
    providerForm.baseUrl,
    providerForm.apiKeyRef,
    providerForm.defaultModel,
    providerForm.fallbackModel,
  ]);

  useEffect(() => {
    if (activeNav === "Trash" && isTauriRuntime()) {
      void loadTrashItems();
    }
  }, [activeNav]);

  const detectedRuntimes = useMemo(
    () => ({
      openClaw: roots.some((root) => root.runtime === "openClaw" && root.exists),
      hermes: roots.some((root) => root.runtime === "hermes" && root.exists),
    }),
    [roots],
  );

  const lastScanTime = useMemo(() => {
    const latest = agents
      .map((agent) => Number(agent.lastScannedAt))
      .filter((value) => !Number.isNaN(value))
      .sort((a, b) => b - a)[0];
    return latest ? formatScanTime(String(latest)) : "Not scanned yet";
  }, [agents]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const unsavedChanges = personalityRead ? editorContent !== personalityRead.content : false;

  async function runScanFixtures() {
    setStatus("Scanning fixtures");
    setRuntimeError(null);
    try {
      const scanned = await invoke<AgentRecord[]>("scan_fixture_roots");
      setAgents(scanned);
      await refreshIndex();
      setStatus(`Fixture scan indexed ${scanned.length} agents`);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Fixture scan failed");
    }
  }

  async function detectLocalPaths() {
    setStatus("Detecting local paths");
    setRuntimeError(null);
    try {
      const detected = await invoke<ScanRoot[]>("scan_default_candidates");
      setRoots(detected);
      setStatus("Detected default paths without scanning agent contents");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Path detection failed");
    }
  }

  function selectedRequestKey() {
    return `${selectedRuntime}:${selectedPath.trim()}`;
  }

  async function previewSelectedFolder() {
    if (!selectedPath.trim()) {
      setRuntimeError("Enter an OpenClaw or Hermes folder path before preview.");
      return;
    }
    setStatus("Previewing selected folder");
    setRuntimeError(null);
    try {
      const result = await invoke<ScanPreview>("preview_scan_root", {
        request: { runtime: selectedRuntime, path: selectedPath.trim() },
      });
      setPreview(result);
      setPreviewRequestKey(selectedRequestKey());
      setStatus("Preview ready; no config contents were read");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Preview failed");
    }
  }

  async function scanSelectedFolder() {
    if (!selectedPath.trim()) {
      setRuntimeError("Enter an OpenClaw or Hermes folder path before scanning.");
      return;
    }
    if (previewRequestKey !== selectedRequestKey()) {
      await previewSelectedFolder();
      setStatus("Preview ready; review it before scanning selected folder");
      return;
    }
    setStatus("Scanning selected folder");
    setRuntimeError(null);
    try {
      const scanned = await invoke<AgentRecord[]>("scan_selected_root", {
        request: { runtime: selectedRuntime, path: selectedPath.trim() },
      });
      await refreshIndex();
      setStatus(`Selected folder scan indexed ${scanned.length} agents`);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Selected folder scan failed");
    }
  }

  async function openAgentDetail(agentId: string) {
    setSelectedAgentId(agentId);
    setDetailTab("overview");
    setPersonalityRead(null);
    setEditorContent("");
    setPlan(null);
    setRestorePlan(null);
    setModelPlan(null);
    setValidationReport(null);
    setRuntimeScan(null);
    setComfyScan(null);
    setRuntimeError(null);
    setStatus("Opening agent detail");
    try {
      await Promise.all([refreshAgentDetail(agentId), refreshProviderProfiles()]);
      setStatus("Agent detail ready");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Agent detail failed");
    }
  }

  async function openPersonalityFile(kind: PersonalityFileKind) {
    if (!selectedAgentId) {
      return;
    }
    setSelectedFileKind(kind);
    setRuntimeError(null);
    setStatus(`Reading ${fileKindLabel(kind)}`);
    try {
      const result = await invoke<PersonalityRead>("read_personality_file", {
        agentId: selectedAgentId,
        fileKind: kind,
      });
      setPersonalityRead(result);
      setEditorContent(result.content);
      setPlan(null);
      setStatus(`${fileKindLabel(kind)} ${result.exists ? "loaded" : "ready to create"}`);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Personality file read failed");
    }
  }

  async function generateDiff() {
    if (!selectedAgentId || !personalityRead) {
      return;
    }
    setRuntimeError(null);
    setStatus("Generating diff plan");
    try {
      const result = await invoke<PersonalityPlan>("create_personality_update_plan", {
        agentId: selectedAgentId,
        fileKind: personalityRead.fileKind,
        newContent: editorContent,
        expectedHash: personalityRead.contentHash,
      });
      setPlan(result);
      setRestorePlan(null);
      setModelPlan(null);
      setStatus("Diff plan ready; review target path and warnings before saving");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Diff plan failed");
    }
  }

  async function savePersonalityFile() {
    if (!selectedAgentId || !personalityRead || !plan) {
      return;
    }
    setRuntimeError(null);
    setStatus("Saving with backup and atomic write");
    try {
      await invoke("apply_personality_update", {
        agentId: selectedAgentId,
        fileKind: personalityRead.fileKind,
        newContent: editorContent,
        expectedHash: plan.oldHash,
      });
      await refreshIndex();
      await refreshAgentDetail(selectedAgentId);
      await openPersonalityFile(personalityRead.fileKind);
      setPlan(null);
      setRestorePlan(null);
      setStatus("Saved, backed up, and re-scanned");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Save failed");
    }
  }

  async function createRestorePlan(backupId: string) {
    if (!selectedAgentId) {
      return;
    }
    setRuntimeError(null);
    setStatus("Creating restore plan");
    try {
      const result = await invoke<PersonalityRestorePlan>("create_personality_restore_plan", {
        backupId,
      });
      setRestorePlan(result);
      setPlan(null);
      setModelPlan(null);
      setStatus("Restore diff ready; confirm before writing");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Restore plan failed");
    }
  }

  async function confirmRestoreBackup() {
    if (!selectedAgentId || !restorePlan) {
      return;
    }
    setRuntimeError(null);
    setStatus("Restoring backup with safety backup");
    try {
      await invoke("restore_personality_backup", { backupId: restorePlan.backupId });
      await refreshIndex();
      await refreshAgentDetail(selectedAgentId);
      if (personalityRead) {
        await openPersonalityFile(personalityRead.fileKind);
      }
      setPlan(null);
      setRestorePlan(null);
      setStatus("Backup restored and agent re-scanned");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Restore failed");
    }
  }

  async function saveProviderProfileOnly() {
    setRuntimeError(null);
    setStatus("Saving provider profile metadata");
    try {
      await invoke<ProviderProfile>("save_provider_profile", {
        input: {
          id: providerForm.providerId,
          name: providerForm.name || providerForm.kind,
          kind: providerForm.kind,
          baseUrl: providerForm.baseUrl || undefined,
          apiKeyRef: providerForm.apiKeyRef || undefined,
          defaultModel: providerForm.defaultModel || undefined,
          fallbackModel: providerForm.fallbackModel || undefined,
          validationJson: validationReport ? JSON.stringify(validationReport) : "{}",
        },
      });
      await refreshProviderProfiles();
      setStatus("Provider profile metadata saved without secret values");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Provider profile save failed");
    }
  }

  async function generateModelProviderDiff() {
    if (!selectedAgentId) {
      return;
    }
    setRuntimeError(null);
    setStatus("Generating provider/model diff plan");
    try {
      const result = await invoke<ModelProviderPlan>("create_model_provider_update_plan", {
        request: providerUpdateFromForm(selectedAgentId, providerForm),
      });
      setModelPlan(result);
      setPlan(null);
      setRestorePlan(null);
      setStatus("Provider/model diff ready; review target, backup, and effective model change");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Provider/model diff failed");
    }
  }

  async function saveModelProviderUpdate() {
    if (!selectedAgentId || !modelPlan) {
      return;
    }
    setRuntimeError(null);
    setStatus("Saving provider/model with backup and atomic write");
    try {
      await invoke("apply_model_provider_update", {
        request: {
          update: providerUpdateFromForm(selectedAgentId, providerForm),
          expectedHash: modelPlan.oldHash,
        },
      });
      await Promise.all([refreshIndex(), refreshAgentDetail(selectedAgentId), refreshProviderProfiles()]);
      setModelPlan(null);
      setStatus("Provider/model saved, backed up, and re-scanned");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Provider/model save failed");
    }
  }

  async function validateProvider(includeTestRequest: boolean) {
    setRuntimeError(null);
    setStatus(includeTestRequest ? "Testing provider connection" : "Refreshing provider models");
    try {
      const report = await invoke<ProviderValidationReport>("validate_openai_provider", {
        request: {
          kind: providerForm.kind,
          baseUrl: providerForm.baseUrl,
          apiKeyRef: providerForm.apiKeyRef || undefined,
          model: providerForm.defaultModel || providerForm.fallbackModel || undefined,
          includeTestRequest,
        },
      });
      setValidationReport(report);
      setStatus(includeTestRequest ? "Provider test completed" : "Provider model list refreshed");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus(includeTestRequest ? "Provider test failed" : "Provider model refresh failed");
    }
  }

  async function scanOllama() {
    setRuntimeError(null);
    setStatus("Scanning Ollama localhost runtime");
    try {
      const result = await invoke<LocalRuntimeScanResult>("scan_ollama_runtime", {
        request: { baseUrl: providerForm.baseUrl || undefined },
      });
      setRuntimeScan(result);
      setComfyScan(null);
      setStatus("Ollama scan completed");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Ollama scan failed");
    }
  }

  async function scanLmStudio() {
    setRuntimeError(null);
    setStatus("Scanning LM Studio localhost runtime");
    try {
      const result = await invoke<LocalRuntimeScanResult>("scan_lmstudio_runtime", {
        request: { baseUrl: providerForm.baseUrl || undefined },
      });
      setRuntimeScan(result);
      setComfyScan(null);
      setStatus("LM Studio scan completed");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("LM Studio scan failed");
    }
  }

  async function scanComfy() {
    setRuntimeError(null);
    setStatus("Scanning ComfyUI capabilities");
    try {
      const result = await invoke<ComfyScanResult>("scan_comfy_runtime", {
        request: { baseUrl: providerForm.baseUrl || undefined, customPath: comfyPath || undefined },
      });
      setComfyScan(result);
      setRuntimeScan(null);
      setStatus("ComfyUI capability scan completed");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("ComfyUI scan failed");
    }
  }

  async function createAgentPlan() {
    if (!newAgentName.trim()) return;
    setRuntimeError(null);
    setStatus("Creating agent plan");
    try {
      const result = await invoke<LifecyclePlan>("create_agent_plan", {
        request: { name: newAgentName.trim() },
      });
      setLifecyclePlan(result);
      if (result.blockedReason) {
        setStatus(`Blocked: ${result.blockedReason}`);
      } else {
        setStatus("Agent creation plan ready; review before applying");
      }
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Agent plan failed");
    }
  }

  async function applyCreateAgent() {
    if (!lifecyclePlan || lifecyclePlan.operation !== "create_agent") return;
    setRuntimeError(null);
    setStatus("Creating agent with backup and atomic write");
    try {
      await invoke<LifecycleResult>("apply_create_agent", {
        request: { planHash: lifecyclePlan.planHash },
      });
      await refreshIndex();
      setLifecyclePlan(null);
      setShowCreateAgent(false);
      setNewAgentName("");
      setStatus("Agent created, backed up, and re-scanned");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Agent creation failed");
    }
  }

  async function createProfilePlan() {
    if (!newProfileName.trim()) return;
    setRuntimeError(null);
    setStatus("Creating profile plan");
    try {
      const result = await invoke<LifecyclePlan>("create_profile_plan", {
        request: { name: newProfileName.trim() },
      });
      setLifecyclePlan(result);
      if (result.blockedReason) {
        setStatus(`Blocked: ${result.blockedReason}`);
      } else {
        setStatus("Profile creation plan ready; review before applying");
      }
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Profile plan failed");
    }
  }

  async function applyCreateProfile() {
    if (!lifecyclePlan || lifecyclePlan.operation !== "create_profile") return;
    setRuntimeError(null);
    setStatus("Creating profile with backup and atomic write");
    try {
      await invoke<LifecycleResult>("apply_create_profile", {
        request: { planHash: lifecyclePlan.planHash },
      });
      await refreshIndex();
      setLifecyclePlan(null);
      setShowCreateProfile(false);
      setNewProfileName("");
      setStatus("Profile created, backed up, and re-scanned");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Profile creation failed");
    }
  }

  async function duplicateAgentPlan() {
    if (!selectedAgentId || !duplicateName.trim()) return;
    setRuntimeError(null);
    setStatus("Creating duplicate plan");
    try {
      const result = await invoke<LifecyclePlan>("duplicate_agent_plan", {
        request: { sourceAgentId: selectedAgentId, newName: duplicateName.trim() },
      });
      setLifecyclePlan(result);
      if (result.blockedReason) {
        setStatus(`Blocked: ${result.blockedReason}`);
      } else {
        setStatus("Duplicate plan ready; review included/skipped items before applying");
      }
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Duplicate plan failed");
    }
  }

  async function applyDuplicateAgent() {
    if (!lifecyclePlan || lifecyclePlan.operation !== "duplicate") return;
    setRuntimeError(null);
    setStatus("Duplicating agent with backup");
    try {
      await invoke<LifecycleResult>("apply_duplicate_agent", {
        request: { planHash: lifecyclePlan.planHash },
      });
      await refreshIndex();
      setLifecyclePlan(null);
      setShowDuplicate(false);
      setDuplicateName("");
      setStatus("Agent duplicated, backed up, and re-scanned");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Duplicate failed");
    }
  }

  async function deleteAgentPlan() {
    if (!selectedAgentId) return;
    setRuntimeError(null);
    setStatus("Creating delete plan");
    try {
      const result = await invoke<LifecyclePlan>("delete_agent_plan", {
        request: { agentId: selectedAgentId },
      });
      setLifecyclePlan(result);
      if (result.blockedReason) {
        setStatus(`Blocked: ${result.blockedReason}`);
      } else {
        setStatus("Delete plan ready; review trash path before confirming");
      }
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Delete plan failed");
    }
  }

  async function applyDeleteAgent() {
    if (!lifecyclePlan || lifecyclePlan.operation !== "delete") return;
    setRuntimeError(null);
    setStatus("Moving agent to trash with backup");
    try {
      await invoke<LifecycleResult>("apply_delete_agent", {
        request: { planHash: lifecyclePlan.planHash },
      });
      await refreshIndex();
      setSelectedAgentId(null);
      setDetail(null);
      setLifecyclePlan(null);
      setStatus("Agent moved to trash and re-scanned");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Delete failed");
    }
  }

  async function loadTrashItems() {
    setRuntimeError(null);
    try {
      const items = await invoke<TrashItem[]>("list_trash_items");
      setTrashItems(items);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function restoreTrashItemPlan(trashPath: string) {
    setRuntimeError(null);
    setStatus("Creating restore plan");
    try {
      const result = await invoke<LifecyclePlan>("restore_trash_item_plan", {
        trashPath,
      });
      setLifecyclePlan(result);
      if (result.blockedReason) {
        setStatus(`Blocked: ${result.blockedReason}`);
      } else {
        setStatus("Restore plan ready; confirm to move back from trash");
      }
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Restore plan failed");
    }
  }

  async function applyRestoreTrashItem() {
    if (!lifecyclePlan || lifecyclePlan.operation !== "restore") return;
    setRuntimeError(null);
    setStatus("Restoring from trash");
    try {
      await invoke<LifecycleResult>("apply_restore_trash_item", {
        request: { planHash: lifecyclePlan.planHash },
      });
      await refreshIndex();
      await loadTrashItems();
      setLifecyclePlan(null);
      setStatus("Item restored and re-scanned");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Restore failed");
    }
  }

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
          {navigation.map((item) => (
            <button
              className={activeNav === item ? "navItem navItemActive" : "navItem"}
              key={item}
              type="button"
              onClick={() => setActiveNav(item)}
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
            <p className="sectionLabel">Local Scanner</p>
            <h2>Privacy-Hardened Agent Index</h2>
          </div>
          <div className="statusPill">Local Only / No Cloud / No Telemetry</div>
        </header>

        <section className="summaryGrid" aria-label="Scan summary">
          <div>
            <span>OpenClaw</span>
            <strong>{detectedRuntimes.openClaw ? "detected" : "not detected"}</strong>
          </div>
          <div>
            <span>Hermes</span>
            <strong>{detectedRuntimes.hermes ? "detected" : "not detected"}</strong>
          </div>
          <div>
            <span>Last scan time</span>
            <strong>{lastScanTime}</strong>
          </div>
          <div>
            <span>Privacy mode</span>
            <strong>Local-only / Private data skipped</strong>
          </div>
        </section>

        {(activeNav === "Dashboard" || activeNav === "Scan" || activeNav === "Agents") ? (
        <div className="workspaceGrid">
          <div className="mainColumn">
            <section className="panel">
              <div className="panelHeader">
                <h3>Scan</h3>
                <p>{status}</p>
              </div>
              <div className="scanActions">
                <button type="button" onClick={runScanFixtures}>
                  Scan fixtures
                </button>
                <button type="button" onClick={detectLocalPaths}>
                  Detect local paths
                </button>
                <div className="selectedScan">
                  <select
                    aria-label="Runtime"
                    value={selectedRuntime}
                    onChange={(event) => {
                      setSelectedRuntime(event.target.value as RuntimeKind);
                      setPreview(null);
                      setPreviewRequestKey(null);
                    }}
                  >
                    <option value="openClaw">OpenClaw</option>
                    <option value="hermes">Hermes</option>
                  </select>
                  <input
                    aria-label="Selected scan folder"
                    placeholder="~/.openclaw or ~/.hermes"
                    value={selectedPath}
                    onChange={(event) => {
                      setSelectedPath(event.target.value);
                      setPreview(null);
                      setPreviewRequestKey(null);
                    }}
                  />
                  <button type="button" onClick={scanSelectedFolder}>
                    Scan selected folder
                  </button>
                  <button type="button" onClick={previewSelectedFolder}>
                    Preview selected folder
                  </button>
                </div>
              </div>
              {runtimeError ? <div className="errorBox">{runtimeError}</div> : null}
              {preview ? (
                <div className="previewBox">
                  <strong>Scan preview</strong>
                  <span>Runtime: {runtimeLabel(preview.runtime)}</span>
                  <span>Target path: {preview.path}</span>
                  <span>
                    Access: {preview.exists ? "exists" : "not found"} /{" "}
                    {preview.readable ? "readable" : "not readable"}
                  </span>
                  <span>Estimated scan mode: {preview.estimatedScanMode}</span>
                  <span>Config file extensions: {preview.configExtensions.join(", ")}</span>
                  <span>Private dirs skipped: {preview.privateDirsSkipped.join(", ")}</span>
                  <span>
                    AgentDock will not index chat transcripts, memories, logs, API key values,
                    bot token values, or encrypted credentials.
                  </span>
                </div>
              ) : null}

              <div className="rootList">
                {roots.map((root) => (
                  <div className="rootRow" key={`${root.runtime}:${root.path}`}>
                    <strong>{runtimeLabel(root.runtime)}</strong>
                    <span>{root.path}</span>
                    <em>
                      {root.source} / {root.exists ? "found" : "not found"} /{" "}
                      {root.readable ? "readable" : "not readable"}
                    </em>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panelHeader">
                <h3>Agents</h3>
                <p>OpenClaw agents and Hermes profiles indexed from local metadata only.</p>
              </div>
              <div className="agentActions">
                <button type="button" onClick={() => { setShowCreateAgent(true); setLifecyclePlan(null); }}>
                  New OpenClaw Agent
                </button>
                <button type="button" onClick={() => { setShowCreateProfile(true); setLifecyclePlan(null); }}>
                  New Hermes Profile
                </button>
                {selectedAgentId ? (
                  <>
                    <button type="button" onClick={() => { setShowDuplicate(true); setDuplicateName(""); setLifecyclePlan(null); }}>
                      Duplicate
                    </button>
                    <button type="button" onClick={() => { setLifecyclePlan(null); void deleteAgentPlan(); }}>
                      Delete
                    </button>
                  </>
                ) : null}
              </div>

              {agents.length === 0 ? (
                <div className="emptyState">
                  No local agents detected yet. Start with fixture scan or choose an OpenClaw/Hermes
                  config folder.
                </div>
              ) : (
                <div className="agentTable">
                  <div className="agentHeader">
                    <span>Name</span>
                    <span>Status</span>
                    <span>Runtime</span>
                    <span>Root path</span>
                    <span>Metadata</span>
                    <span>Warnings</span>
                  </div>
                  {agents.map((agent) => (
                    <article
                      className={
                        selectedAgentId === agent.id ? "agentRow agentRowSelected" : "agentRow"
                      }
                      key={agent.id}
                    >
                      <div>
                        <strong>{agent.name}</strong>
                        <small>Last indexed {formatScanTime(agent.lastScannedAt)}</small>
                        <button
                          className="linkButton"
                          type="button"
                          onClick={() => void openAgentDetail(agent.id)}
                        >
                          Open detail
                        </button>
                      </div>
                      <div className={`statusText statusText-${agent.healthStatus}`}>
                        {agent.healthStatus.toUpperCase()}
                      </div>
                      <div>{runtimeLabel(agent.runtime)}</div>
                      <div className="pathText">{agent.rootPath}</div>
                      <div className="metadataStack">
                        <span>Config files: {agent.configPaths.length}</span>
                        <span>Personality files detected: {agent.personalityFiles.length}</span>
                        <span>Skills detected: {agent.skillPaths.length}</span>
                        <span>
                          Provider: {agent.providerSummary.provider ?? "not detected"}
                          {agent.providerSummary.baseUrl
                            ? ` at ${agent.providerSummary.baseUrl}`
                            : ""}
                        </span>
                        <span>
                          Model: {agent.modelSummary.defaultModel ?? "not detected"}
                          {agent.modelSummary.fallbackModel
                            ? ` / fallback ${agent.modelSummary.fallbackModel}`
                            : ""}
                        </span>
                        <span>
                          Secret fields:{" "}
                          {[
                            ...agent.providerSummary.secretFields,
                            ...agent.channelSummary.tokenFields,
                          ].length > 0
                            ? "••••••••"
                            : "none"}
                        </span>
                      </div>
                      <div className="warningStack">
                        {agent.warnings.length > 0
                          ? agent.warnings.map((warning) => (
                              <span key={`${agent.id}:${warning.code}`}>
                                {warning.severity.toUpperCase()}: {warning.message}
                              </span>
                            ))
                          : "No warnings"}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {showCreateAgent ? (
              <div className="panel">
                <div className="panelHeader">
                  <h3>New OpenClaw Agent</h3>
                  <p>Create a minimal agent structure with config, SOUL.md, and skills/ directory.</p>
                </div>
                <div className="createForm">
                  <label>
                    <span>Agent name</span>
                    <input value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} placeholder="my-agent" />
                  </label>
                  <button type="button" disabled={!newAgentName.trim()} onClick={() => void createAgentPlan()}>
                    Generate plan
                  </button>
                  {lifecyclePlan && lifecyclePlan.operation === "create_agent" ? (
                    <div className="planPreview">
                      <span>Target: {lifecyclePlan.targetPath}</span>
                      <span>Files to create: {lifecyclePlan.willCreateFiles.join(", ")}</span>
                      <span>Backup: {lifecyclePlan.willBackup ? "will be created" : "no"}</span>
                      {lifecyclePlan.warnings.map((w) => <span key={w}>WARNING: {w}</span>)}
                      {lifecyclePlan.blockedReason ? <span className="errorBox">BLOCKED: {lifecyclePlan.blockedReason}</span> : null}
                      {!lifecyclePlan.blockedReason ? (
                        <button type="button" onClick={() => void applyCreateAgent()}>Confirm create</button>
                      ) : null}
                    </div>
                  ) : null}
                  <button type="button" onClick={() => { setShowCreateAgent(false); setNewAgentName(""); setLifecyclePlan(null); }}>Cancel</button>
                </div>
              </div>
            ) : null}

            {showCreateProfile ? (
              <div className="panel">
                <div className="panelHeader">
                  <h3>New Hermes Profile</h3>
                  <p>Create a minimal profile structure with config, SOUL.md, and skills/ directory.</p>
                </div>
                <div className="createForm">
                  <label>
                    <span>Profile name</span>
                    <input value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="my-profile" />
                  </label>
                  <button type="button" disabled={!newProfileName.trim()} onClick={() => void createProfilePlan()}>
                    Generate plan
                  </button>
                  {lifecyclePlan && lifecyclePlan.operation === "create_profile" ? (
                    <div className="planPreview">
                      <span>Target: {lifecyclePlan.targetPath}</span>
                      <span>Files to create: {lifecyclePlan.willCreateFiles.join(", ")}</span>
                      <span>Backup: {lifecyclePlan.willBackup ? "will be created" : "no"}</span>
                      {lifecyclePlan.warnings.map((w) => <span key={w}>WARNING: {w}</span>)}
                      {lifecyclePlan.blockedReason ? <span className="errorBox">BLOCKED: {lifecyclePlan.blockedReason}</span> : null}
                      {!lifecyclePlan.blockedReason ? (
                        <button type="button" onClick={() => void applyCreateProfile()}>Confirm create</button>
                      ) : null}
                    </div>
                  ) : null}
                  <button type="button" onClick={() => { setShowCreateProfile(false); setNewProfileName(""); setLifecyclePlan(null); }}>Cancel</button>
                </div>
              </div>
            ) : null}

            {showDuplicate && selectedAgentId ? (
              <div className="panel">
                <div className="panelHeader">
                  <h3>Duplicate Agent/Profile</h3>
                  <p>Copy configuration and personality. Private data (sessions, memory, secrets) will be skipped.</p>
                </div>
                <div className="createForm">
                  <label>
                    <span>New name</span>
                    <input value={duplicateName} onChange={(e) => setDuplicateName(e.target.value)} placeholder="copy-of-agent" />
                  </label>
                  <button type="button" disabled={!duplicateName.trim()} onClick={() => void duplicateAgentPlan()}>
                    Generate plan
                  </button>
                  {lifecyclePlan && lifecyclePlan.operation === "duplicate" ? (
                    <div className="planPreview">
                      <span>Target: {lifecyclePlan.targetPath}</span>
                      <span>Included: {lifecyclePlan.includedFiles?.join(", ") ?? "none"}</span>
                      <span>Skipped: {lifecyclePlan.skippedItems?.join(", ") ?? "none"}</span>
                      <span>Backup: {lifecyclePlan.willBackup ? "will be created" : "no"}</span>
                      {lifecyclePlan.warnings.map((w) => <span key={w}>WARNING: {w}</span>)}
                      {lifecyclePlan.blockedReason ? <span className="errorBox">BLOCKED: {lifecyclePlan.blockedReason}</span> : null}
                      {!lifecyclePlan.blockedReason ? (
                        <button type="button" onClick={() => void applyDuplicateAgent()}>Confirm duplicate</button>
                      ) : null}
                    </div>
                  ) : null}
                  <button type="button" onClick={() => { setShowDuplicate(false); setDuplicateName(""); setLifecyclePlan(null); }}>Cancel</button>
                </div>
              </div>
            ) : null}

            <section className="panel detailPanel">
              <div className="panelHeader">
                <h3>Agent Detail</h3>
                <p>
                  {selectedAgent
                    ? `${selectedAgent.name} / ${runtimeLabel(selectedAgent.runtime)}`
                    : "Select an indexed agent or profile."}
                </p>
              </div>

              {detail ? (
                <>
                  <div className="tabBar">
                    {(["overview", "personality", "modelProvider", "files", "backups"] as DetailTab[]).map(
                      (tab) => (
                        <button
                          className={detailTab === tab ? "tabButton tabButtonActive" : "tabButton"}
                          key={tab}
                          type="button"
                          onClick={() => setDetailTab(tab)}
                        >
                          {tab === "modelProvider"
                            ? "Model & Provider"
                            : tab[0].toUpperCase() + tab.slice(1)}
                        </button>
                      ),
                    )}
                  </div>

                  {detailTab === "overview" ? (
                    <div className="detailStack">
                      <span>Agent id: {detail.id}</span>
                      <span>Root path: {detail.rootPath}</span>
                      <span>Config paths: {detail.configPaths.join(", ") || "none"}</span>
                      <span>
                        Provider: {detail.providerSummary.provider ?? "not detected"} / base_url{" "}
                        {detail.providerSummary.baseUrl ?? "not detected"}
                      </span>
                      <span>
                        Models: default {detail.modelSummary.defaultModel ?? "not detected"} /
                        fallback {detail.modelSummary.fallbackModel ?? "not detected"}
                      </span>
                      <span>
                        Channels:{" "}
                        {detail.channelSummary.channelHints.length > 0
                          ? detail.channelSummary.channelHints.join(", ")
                          : "none"}
                      </span>
                      <span>
                        Secret fields:{" "}
                        {[
                          ...detail.providerSummary.secretFields,
                          ...detail.channelSummary.tokenFields,
                        ].length > 0
                          ? "••••••••"
                          : "none"}
                      </span>
                    </div>
                  ) : null}

                  {detailTab === "personality" ? (
                    <div className="personalityEditor">
                      <div className="fileSelector">
                        {personalityKinds.map((kind) => {
                          const metadata = detail.personalityFiles.find(
                            (file) => file.fileKind === kind,
                          );
                          return (
                            <button
                              className={
                                selectedFileKind === kind
                                  ? "fileButton fileButtonActive"
                                  : "fileButton"
                              }
                              key={kind}
                              type="button"
                              onClick={() => void openPersonalityFile(kind)}
                            >
                              <strong>{fileKindLabel(kind)}</strong>
                              <span>{metadata?.exists ? "detected" : "missing"}</span>
                            </button>
                          );
                        })}
                      </div>

                      {personalityRead ? (
                        <>
                          <div className="editorMeta">
                            <span>{personalityRead.exists ? "Detected" : "Missing"}</span>
                            <span>{personalityRead.resolvedPath}</span>
                            <span>Hash: {personalityRead.contentHash}</span>
                            <span>
                              Modified: {formatScanTime(personalityRead.lastModifiedTime)}
                            </span>
                          </div>
                          <textarea
                            aria-label="Markdown personality editor"
                            className="markdownEditor"
                            value={editorContent}
                            onChange={(event) => {
                              setEditorContent(event.target.value);
                              setPlan(null);
                            }}
                            spellCheck={false}
                          />
                          <div className="editorActions">
                            <span>{unsavedChanges ? "Unsaved changes" : "No unsaved changes"}</span>
                            <button
                              type="button"
                              disabled={!unsavedChanges}
                              onClick={() => {
                                setEditorContent(personalityRead.content);
                                setPlan(null);
                              }}
                            >
                              Reset changes
                            </button>
                            <button
                              type="button"
                              disabled={!unsavedChanges}
                              onClick={() => void generateDiff()}
                            >
                              Generate diff
                            </button>
                            <button
                              type="button"
                              disabled={!plan || !unsavedChanges}
                              onClick={() => void savePersonalityFile()}
                            >
                              Save
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="emptyState">
                          Open SOUL.md, AGENTS.md, or USER.md to edit a whitelisted personality
                          file.
                        </div>
                      )}
                    </div>
                  ) : null}

                  {detailTab === "modelProvider" ? (
                    <div className="providerManager">
                      <div className="providerGrid">
                        <label>
                          <span>Provider profile</span>
                          <select
                            value={providerForm.providerId ?? ""}
                            onChange={(event) => {
                              const selected = providerProfiles.find(
                                (profile) => profile.id === event.target.value,
                              );
                              if (selected) {
                                setProviderForm({
                                  providerId: selected.id,
                                  name: selected.name,
                                  kind: selected.kind,
                                  baseUrl: selected.baseUrl ?? "",
                                  apiKeyRef: selected.apiKeyRef ?? "",
                                  defaultModel: selected.defaultModel ?? "",
                                  fallbackModel: selected.fallbackModel ?? "",
                                });
                              } else {
                                setProviderForm((current) => ({ ...current, providerId: undefined }));
                              }
                              setModelPlan(null);
                            }}
                          >
                            <option value="">Agent scoped metadata</option>
                            {providerProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name} / {profile.kind}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Name</span>
                          <input
                            value={providerForm.name}
                            onChange={(event) => {
                              setProviderForm((current) => ({
                                ...current,
                                name: event.target.value,
                              }));
                              setModelPlan(null);
                            }}
                          />
                        </label>
                        <label>
                          <span>Kind</span>
                          <select
                            value={providerForm.kind}
                            onChange={(event) => {
                              setProviderForm((current) => ({
                                ...current,
                                kind: event.target.value as ProviderKind,
                              }));
                              setModelPlan(null);
                            }}
                          >
                            {providerKinds.map((kind) => (
                              <option key={kind} value={kind}>
                                {kind}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Base URL</span>
                          <input
                            placeholder={
                              providerForm.kind === "ollama"
                                ? "http://localhost:11434"
                                : providerForm.kind === "lmstudio"
                                  ? "http://localhost:1234"
                                  : "https://provider.example/v1"
                            }
                            value={providerForm.baseUrl}
                            onChange={(event) => {
                              setProviderForm((current) => ({
                                ...current,
                                baseUrl: event.target.value,
                              }));
                              setModelPlan(null);
                            }}
                          />
                        </label>
                        <label>
                          <span>API key reference</span>
                          <input
                            placeholder="ENV_OR_KEYCHAIN_REF"
                            value={providerForm.apiKeyRef}
                            onChange={(event) => {
                              setProviderForm((current) => ({
                                ...current,
                                apiKeyRef: event.target.value,
                              }));
                              setModelPlan(null);
                            }}
                          />
                        </label>
                        <label>
                          <span>Default model</span>
                          <input
                            value={providerForm.defaultModel}
                            onChange={(event) => {
                              setProviderForm((current) => ({
                                ...current,
                                defaultModel: event.target.value,
                              }));
                              setModelPlan(null);
                            }}
                          />
                        </label>
                        <label>
                          <span>Fallback model</span>
                          <input
                            value={providerForm.fallbackModel}
                            onChange={(event) => {
                              setProviderForm((current) => ({
                                ...current,
                                fallbackModel: event.target.value,
                              }));
                              setModelPlan(null);
                            }}
                          />
                        </label>
                        <label>
                          <span>ComfyUI custom path</span>
                          <input
                            placeholder="~/ComfyUI"
                            value={comfyPath}
                            onChange={(event) => setComfyPath(event.target.value)}
                          />
                        </label>
                      </div>

                      <div className="providerActions">
                        <button type="button" onClick={() => void saveProviderProfileOnly()}>
                          Save provider profile
                        </button>
                        <button
                          type="button"
                          disabled={!providerForm.baseUrl || providerForm.kind === "comfyui"}
                          onClick={() => void validateProvider(false)}
                        >
                          Refresh models
                        </button>
                        <button
                          type="button"
                          disabled={!providerForm.baseUrl || providerForm.kind === "comfyui"}
                          onClick={() => void validateProvider(true)}
                        >
                          Test connection
                        </button>
                        <button type="button" onClick={() => void scanOllama()}>
                          Scan Ollama
                        </button>
                        <button type="button" onClick={() => void scanLmStudio()}>
                          Scan LM Studio
                        </button>
                        <button type="button" onClick={() => void scanComfy()}>
                          Scan ComfyUI
                        </button>
                        <button type="button" onClick={() => void generateModelProviderDiff()}>
                          Generate diff
                        </button>
                        <button
                          type="button"
                          disabled={!modelPlan || !modelPlan.affectsOnlySelectedAgentProfile}
                          onClick={() => void saveModelProviderUpdate()}
                        >
                          Save
                        </button>
                      </div>

                      <EffectiveModelCard preview={effectivePreview} />
                      <ValidationCard report={validationReport} />
                      <RuntimeScanCard
                        result={runtimeScan}
                        onUseDefault={(model) => {
                          setProviderForm((current) => ({ ...current, defaultModel: model }));
                          setModelPlan(null);
                        }}
                        onUseFallback={(model) => {
                          setProviderForm((current) => ({ ...current, fallbackModel: model }));
                          setModelPlan(null);
                        }}
                      />
                      <ComfyScanCard result={comfyScan} />
                    </div>
                  ) : null}

                  {detailTab === "files" ? (
                    <div className="emptyState">
                      File management is reserved for a later stage. This view only exposes safe
                      personality editing.
                    </div>
                  ) : null}

                  {detailTab === "backups" ? (
                    <BackupList backups={backups} onRestore={createRestorePlan} />
                  ) : null}
                </>
              ) : (
                <div className="emptyState">Open an agent detail from the agent list.</div>
              )}
            </section>
          </div>

          <aside className="rightPanel" aria-label="Risk, diff, and backup panel">
            <section>
              <h3>Risk</h3>
              <div className="riskStack">
                <span>Readable files: SOUL.md / AGENTS.md / USER.md</span>
                <span>Private runtime data: skipped</span>
                <span>Secrets: redacted</span>
                <span>Save path: backup, atomic write, re-scan</span>
                {detail?.warnings.map((warning) => (
                  <span key={`${detail.id}:${warning.code}`}>
                    {warning.severity.toUpperCase()}: {warning.message}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <h3>Diff</h3>
              {modelPlan ? (
                <div className="diffPanel">
                  <span>Agent/profile: {modelPlan.agentId}</span>
                  <span>Target: {modelPlan.targetFiles.join(", ")}</span>
                  <span>Old hash: {modelPlan.oldHash}</span>
                  <span>New hash: {modelPlan.newHash}</span>
                  <span>Backup: {modelPlan.backupWillBeCreated ? "will be created" : "blocked"}</span>
                  <span>
                    Scope:{" "}
                    {modelPlan.affectsOnlySelectedAgentProfile
                      ? "selected agent/profile only"
                      : "blocked"}
                  </span>
                  <span>
                    Effective model:{" "}
                    {modelPlan.effectiveModelBefore.effectiveModel ?? "none"} -&gt;{" "}
                    {modelPlan.effectiveModelAfter.effectiveModel ?? "none"}
                  </span>
                  {modelPlan.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                  <pre className="diffBox">
                    {modelPlan.unifiedDiff || "No provider/model changes detected."}
                  </pre>
                </div>
              ) : restorePlan ? (
                <div className="diffPanel">
                  <span>Restore backup: {restorePlan.backupId}</span>
                  <span>Target: {restorePlan.targetPath}</span>
                  <span>Backup path: {restorePlan.backupPath}</span>
                  <span>Current hash: {restorePlan.currentHash}</span>
                  <span>Restored hash: {restorePlan.restoredHash}</span>
                  <span>
                    Safety backup:{" "}
                    {restorePlan.safetyBackupWillBeCreated ? "will be created" : "blocked"}
                  </span>
                  {restorePlan.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                  <pre className="diffBox">
                    {restorePlan.unifiedDiff || "Restore has no text changes."}
                  </pre>
                  <button
                    className="confirmRestoreButton"
                    type="button"
                    onClick={() => void confirmRestoreBackup()}
                  >
                    Confirm restore
                  </button>
                </div>
              ) : plan ? (
                <div className="diffPanel">
                  <span>Target: {plan.targetPath}</span>
                  <span>Old hash: {plan.oldHash}</span>
                  <span>New hash: {plan.newHash}</span>
                  <span>Backup: {plan.backupWillBeCreated ? "will be created" : "blocked"}</span>
                  {plan.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                  <pre className="diffBox">{plan.unifiedDiff || "No text changes detected."}</pre>
                </div>
              ) : lifecyclePlan && lifecyclePlan.operation === "delete" ? (
                <div className="diffPanel">
                  <strong>Delete plan</strong>
                  <span>Target: {lifecyclePlan.targetPath}</span>
                  <span>Trash path: {lifecyclePlan.backupPath ?? "N/A"}</span>
                  <span>Backup: {lifecyclePlan.willBackup ? "will be created" : "no"}</span>
                  {lifecyclePlan.warnings.map((w) => <span key={w}>WARNING: {w}</span>)}
                  {lifecyclePlan.blockedReason ? <span className="errorBox">BLOCKED: {lifecyclePlan.blockedReason}</span> : null}
                  {!lifecyclePlan.blockedReason ? (
                    <button className="confirmDeleteButton" type="button" onClick={() => void applyDeleteAgent()}>
                      Confirm delete (move to trash)
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setLifecyclePlan(null)}>Cancel</button>
                </div>
              ) : (
                <div className="emptyState">Generate a diff before saving.</div>
              )}
            </section>

            <section>
              <h3>Backups</h3>
              <BackupList backups={backups.slice(0, 4)} onRestore={createRestorePlan} compact />
            </section>
          </aside>
        </div>
        ) : null}

        {activeNav === "Trash" ? (
          <section className="panel">
            <div className="panelHeader">
              <h3>Trash</h3>
              <p>Soft-deleted agents and profiles. Restore moves them back to the original path.</p>
            </div>
            <button type="button" onClick={() => void loadTrashItems()}>Refresh trash</button>
            {trashItems.length === 0 ? (
              <div className="emptyState">No items in trash.</div>
            ) : (
              <div className="trashTable">
                <div className="agentHeader">
                  <span>Name</span>
                  <span>Runtime</span>
                  <span>Original path</span>
                  <span>Trash path</span>
                  <span>Deleted at</span>
                  <span>Actions</span>
                </div>
                {trashItems.map((item) => (
                  <article className="agentRow" key={item.trashPath}>
                    <div><strong>{item.name}</strong></div>
                    <div>{runtimeLabel(item.runtime)}</div>
                    <div className="pathText">{item.originalPath}</div>
                    <div className="pathText">{item.trashPath}</div>
                    <div>{formatBackupTime(item.deletedAt)}</div>
                    <div>
                      {lifecyclePlan && lifecyclePlan.operation === "restore" && lifecyclePlan.targetPath === item.originalPath ? (
                        <div className="planPreview">
                          <span>Restore to: {lifecyclePlan.targetPath}</span>
                          {lifecyclePlan.blockedReason ? <span className="errorBox">BLOCKED: {lifecyclePlan.blockedReason}</span> : null}
                          {!lifecyclePlan.blockedReason ? (
                            <button type="button" onClick={() => void applyRestoreTrashItem()}>Confirm restore</button>
                          ) : null}
                          <button type="button" onClick={() => setLifecyclePlan(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => void restoreTrashItemPlan(item.trashPath)}>
                          Restore
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {runtimeError ? <div className="errorBox">{runtimeError}</div> : null}
          </section>
        ) : null}

        {activeNav === "Settings" ? (
          <section className="panel">
            <div className="panelHeader">
              <h3>Settings</h3>
              <p>Application settings will be available in a future update.</p>
            </div>
            <div className="emptyState">Settings page is not yet implemented.</div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function EffectiveModelCard({ preview }: { preview: EffectiveModelPreview | null }) {
  if (!preview) {
    return <div className="emptyState">Effective model preview is not available.</div>;
  }

  return (
    <div className="providerCard">
      <div className="providerCardHeader">
        <strong>Effective model</strong>
        <span>{preview.effectiveModel ?? "none"}</span>
      </div>
      <p>{preview.explanation}</p>
      <div className="providerBadgeRow">
        <span>{preview.localOnly ? "Local-only" : "Remote-capable"}</span>
        <span>{preview.mayCallRemoteApi ? "May call remote API" : "No remote call from preview"}</span>
        <span>{preview.mayCreateCost ? "May create cost" : "No cost from preview"}</span>
      </div>
      <div className="resolutionSteps">
        {preview.steps.map((step) => (
          <div className={step.active ? "resolutionStep resolutionStepActive" : "resolutionStep"} key={step.label}>
            <strong>{step.label}</strong>
            <span>{step.model ?? "not configured"}</span>
            <small>{step.reason}</small>
          </div>
        ))}
      </div>
      {preview.warnings.length > 0 ? (
        <div className="warningStack">
          {preview.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ValidationCard({ report }: { report: ProviderValidationReport | null }) {
  if (!report) {
    return (
      <div className="emptyState">
        Provider validation only runs after Refresh models or Test connection.
      </div>
    );
  }

  return (
    <div className="providerCard">
      <div className="providerCardHeader">
        <strong>Validation status</strong>
        <span>{report.connectionStatus}</span>
      </div>
      <div className="detailStack">
        <span>Base URL: {report.baseUrlValid ? "valid" : "invalid"}</span>
        <span>API key reference: {report.apiKeyReferenceStatus}</span>
        <span>Auth: {report.authStatus}</span>
        <span>Models: {report.modelListStatus}</span>
        <span>Generation: {report.generationStatus}</span>
        <span>Model ids: {report.models.join(", ") || "none returned"}</span>
        {report.warnings.map((warning) => (
          <span key={warning}>WARNING: {warning}</span>
        ))}
      </div>
    </div>
  );
}

function RuntimeScanCard({
  result,
  onUseDefault,
  onUseFallback,
}: {
  result: LocalRuntimeScanResult | null;
  onUseDefault: (model: string) => void;
  onUseFallback: (model: string) => void;
}) {
  if (!result) {
    return <div className="emptyState">Local runtime scan has not been run.</div>;
  }

  return (
    <div className="providerCard">
      <div className="providerCardHeader">
        <strong>{result.runtime} scan</strong>
        <span>{result.reachable ? "reachable" : "not reachable"}</span>
      </div>
      <div className="detailStack">
        <span>Endpoint: {result.endpoint ?? "not set"}</span>
        {result.warnings.map((warning) => (
          <span key={warning}>WARNING: {warning}</span>
        ))}
      </div>
      <div className="modelList">
        {result.models.map((model) => (
          <div className="modelRow" key={model.name}>
            <div>
              <strong>{model.name}</strong>
              <span>
                {model.modified ?? "modified unknown"}
                {model.size ? ` / ${model.size} bytes` : ""}
              </span>
            </div>
            <button type="button" onClick={() => onUseDefault(model.name)}>
              Default
            </button>
            <button type="button" onClick={() => onUseFallback(model.name)}>
              Fallback
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComfyScanCard({ result }: { result: ComfyScanResult | null }) {
  if (!result) {
    return <div className="emptyState">ComfyUI capability scan has not been run.</div>;
  }

  return (
    <div className="providerCard">
      <div className="providerCardHeader">
        <strong>ComfyUI capabilities</strong>
        <span>{result.isChatLlmProvider ? "chat provider" : "capability provider"}</span>
      </div>
      <div className="detailStack">
        <span>Endpoint: {result.endpoint ?? "not set"}</span>
        <span>Endpoint reachable: {result.endpointReachable ? "yes" : "no"}</span>
        <span>Detected paths: {result.detectedPaths.join(", ") || "none"}</span>
        {result.warnings.map((warning) => (
          <span key={warning}>WARNING: {warning}</span>
        ))}
      </div>
      <div className="modelList">
        {result.capabilityFolders.map((folder) => (
          <div className="comfyFolder" key={folder.path}>
            <strong>{folder.kind}</strong>
            <span>{folder.path}</span>
            <small>{folder.models.join(", ") || "no model files detected"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function BackupList({
  backups,
  compact = false,
  onRestore,
}: {
  backups: BackupRecord[];
  compact?: boolean;
  onRestore: (backupId: string) => Promise<void>;
}) {
  if (backups.length === 0) {
    return <div className="emptyState">No backups for this agent yet.</div>;
  }

  return (
    <div className={compact ? "backupList backupListCompact" : "backupList"}>
      {backups.map((backup) => (
        <div className="backupRow" key={backup.backupId}>
          <div>
            <strong>{fileKindLabel(backup.fileKind)}</strong>
            <span>{formatBackupTime(backup.createdAt)}</span>
            <span>{backup.originalPath}</span>
            {!compact ? <span>Backup path: {backup.backupPath}</span> : null}
          </div>
          <button type="button" onClick={() => void onRestore(backup.backupId)}>
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}
