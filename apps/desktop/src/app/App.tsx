import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type RuntimeKind = "openClaw" | "hermes";
type PersonalityFileKind = "soul" | "agents" | "user";
type DetailTab = "overview" | "personality" | "files" | "backups";

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

const navigation = ["Dashboard", "Scan", "Agents", "Settings"];
const personalityKinds: PersonalityFileKind[] = ["soul", "agents", "user"];

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
  const [backups, setBackups] = useState<BackupRecord[]>([]);

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
    setRuntimeError(null);
    setStatus("Opening agent detail");
    try {
      await refreshAgentDetail(agentId);
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
      setStatus("Saved, backed up, and re-scanned");
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setStatus("Save failed");
    }
  }

  async function restoreBackup(backupId: string) {
    if (!selectedAgentId) {
      return;
    }
    setRuntimeError(null);
    setStatus("Restoring backup");
    try {
      await invoke("restore_personality_backup", { backupId });
      await refreshIndex();
      await refreshAgentDetail(selectedAgentId);
      if (personalityRead) {
        await openPersonalityFile(personalityRead.fileKind);
      }
      setPlan(null);
      setStatus("Backup restored and agent re-scanned");
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
            <p className="sectionLabel">Local Scanner</p>
            <h2>Privacy-Hardened Agent Index</h2>
          </div>
          <div className="statusPill">Local-only / Safe writes</div>
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
                    {(["overview", "personality", "files", "backups"] as DetailTab[]).map((tab) => (
                      <button
                        className={detailTab === tab ? "tabButton tabButtonActive" : "tabButton"}
                        key={tab}
                        type="button"
                        onClick={() => setDetailTab(tab)}
                      >
                        {tab[0].toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
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

                  {detailTab === "files" ? (
                    <div className="emptyState">
                      File management is reserved for a later stage. This view only exposes safe
                      personality editing.
                    </div>
                  ) : null}

                  {detailTab === "backups" ? (
                    <BackupList backups={backups} onRestore={restoreBackup} />
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
              {plan ? (
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
              ) : (
                <div className="emptyState">Generate a diff before saving.</div>
              )}
            </section>

            <section>
              <h3>Backups</h3>
              <BackupList backups={backups.slice(0, 4)} onRestore={restoreBackup} compact />
            </section>
          </aside>
        </div>
      </section>
    </main>
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
