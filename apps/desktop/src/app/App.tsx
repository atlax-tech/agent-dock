import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type RuntimeKind = "openClaw" | "hermes";

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

const navigation = ["Dashboard", "Scan", "Agents", "Settings"];

function runtimeLabel(runtime: RuntimeKind) {
  return runtime === "openClaw" ? "OpenClaw" : "Hermes";
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

export function App() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [roots, setRoots] = useState<ScanRoot[]>([]);
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeKind>("openClaw");
  const [selectedPath, setSelectedPath] = useState("");
  const [status, setStatus] = useState("Ready");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScanPreview | null>(null);
  const [previewRequestKey, setPreviewRequestKey] = useState<string | null>(null);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  async function refreshIndex() {
    const [scanRoots, indexedAgents] = await Promise.all([
      invoke<ScanRoot[]>("get_scan_roots"),
      invoke<AgentRecord[]>("get_agent_index"),
    ]);
    setRoots(scanRoots);
    setAgents(indexedAgents);
  }

  useEffect(() => {
    void invoke<InitialScanState>("get_initial_scan_state").then((initialState) => {
      setRoots(initialState.scanRoots);
      setAgents(initialState.agents);
      setStatus(
        initialState.privacyMode.defaultCandidatesInspected
          ? "Ready"
          : "Ready: default runtime paths have not been inspected",
      );
    }).catch((error) => {
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
            <p className="sectionLabel">Phase 1</p>
            <h2>Local Scan Engine</h2>
          </div>
          <div className="statusPill">Local-only / Read-only</div>
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
            <strong>Local-only / Read-only</strong>
          </div>
        </section>

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
                AgentDock will not index chat transcripts, memories, logs, API key values, bot
                token values, or encrypted credentials.
              </span>
              <span>
                AgentDock will only store metadata summaries in ~/.agentdock/agentdock.sqlite.
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
                <article className="agentRow" key={agent.id}>
                  <div>
                    <strong>{agent.name}</strong>
                    <small>Last indexed {formatScanTime(agent.lastScannedAt)}</small>
                    <button
                      className="linkButton"
                      type="button"
                      onClick={() =>
                        setExpandedAgentId(expandedAgentId === agent.id ? null : agent.id)
                      }
                    >
                      Details
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
                      {agent.providerSummary.baseUrl ? ` at ${agent.providerSummary.baseUrl}` : ""}
                    </span>
                    <span>
                      Model: {agent.modelSummary.defaultModel ?? "not detected"}
                      {agent.modelSummary.fallbackModel
                        ? ` / fallback ${agent.modelSummary.fallbackModel}`
                        : ""}
                    </span>
                    <span>
                      Channel hints:{" "}
                      {agent.channelSummary.channelHints.length > 0
                        ? agent.channelSummary.channelHints.join(", ")
                        : "none"}
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
                  {expandedAgentId === agent.id ? (
                    <div className="agentDetails">
                      <span>Root path: {agent.rootPath}</span>
                      <span>Config paths: {agent.configPaths.join(", ") || "none"}</span>
                      <span>
                        Personality files: {agent.personalityFiles.join(", ") || "none"}
                      </span>
                      <span>Skill paths: {agent.skillPaths.join(", ") || "none"}</span>
                      <span>
                        Provider: {agent.providerSummary.provider ?? "not detected"} / base_url{" "}
                        {agent.providerSummary.baseUrl ?? "not detected"}
                      </span>
                      <span>
                        Secret fields:{" "}
                        {agent.providerSummary.secretFields.length > 0
                          ? agent.providerSummary.secretFields
                              .map((field) => `${field}: ••••••••`)
                              .join(", ")
                          : "none"}
                      </span>
                      <span>
                        Models: default {agent.modelSummary.defaultModel ?? "not detected"} /
                        fallback {agent.modelSummary.fallbackModel ?? "not detected"}
                      </span>
                      <span>
                        Channels:{" "}
                        {agent.channelSummary.channelHints.length > 0
                          ? agent.channelSummary.channelHints.join(", ")
                          : "none"}
                      </span>
                      <span>
                        Token fields:{" "}
                        {agent.channelSummary.tokenFields.length > 0
                          ? agent.channelSummary.tokenFields
                              .map((field) => `${field}: ••••••••`)
                              .join(", ")
                          : "none"}
                      </span>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
