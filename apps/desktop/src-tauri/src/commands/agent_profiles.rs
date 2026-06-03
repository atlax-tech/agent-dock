use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

use crate::scanner::{
    self,
    types::{
        AgentRuntime, AgentScanRecord, ModelSummary, ProviderSummary, ScanWarning, WarningSeverity,
    },
    ScannerError,
};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeWarning {
    code: String,
    message: String,
    path: Option<String>,
    severity: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSummary {
    status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedAgent {
    id: String,
    product: String,
    display_name: String,
    description: Option<String>,
    agent_kind: String,
    config_root: String,
    workspace_or_profile_path: String,
    effective_cwd: Option<String>,
    provider_summary: Option<ProviderSummary>,
    model_summary: Option<ModelSummary>,
    permission_summary: Option<PermissionSummary>,
    channel_count: usize,
    skill_count: usize,
    memory_count: Option<usize>,
    session_count: Option<usize>,
    last_modified: Option<String>,
    warnings: Vec<RuntimeWarning>,
    confidence: String,
}

#[derive(Debug, Clone)]
struct ScanOptions {
    home_dir: PathBuf,
    hermes_home: Option<PathBuf>,
}

impl ScanOptions {
    fn from_env() -> Self {
        Self {
            home_dir: dirs::home_dir().unwrap_or_else(|| PathBuf::from("~")),
            hermes_home: env::var_os("HERMES_HOME").map(PathBuf::from),
        }
    }
}

#[tauri::command]
pub fn scan_managed_agents() -> Result<Vec<ManagedAgent>, String> {
    scan_managed_agents_with_options(&ScanOptions::from_env()).map_err(|error| error.to_string())
}

fn scan_managed_agents_with_options(
    options: &ScanOptions,
) -> Result<Vec<ManagedAgent>, ScannerError> {
    let mut agents = Vec::new();
    agents.extend(scan_openclaw(options)?);
    agents.extend(scan_hermes(options)?);
    dedupe_managed_agents(&mut agents);
    Ok(agents)
}

fn scan_openclaw(options: &ScanOptions) -> Result<Vec<ManagedAgent>, ScannerError> {
    let openclaw_home = options.home_dir.join(".openclaw");
    let mut candidates = Vec::new();
    push_if_dir(&mut candidates, openclaw_home.clone());
    push_if_dir(&mut candidates, openclaw_home.join("agents"));
    push_if_dir(&mut candidates, openclaw_home.join("workspace"));

    if let Ok(entries) = fs::read_dir(&openclaw_home) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with("workspace-"))
                    .unwrap_or(false)
            {
                candidates.push(path);
            }
        }
    }

    scan_candidates(AgentRuntime::OpenClaw, candidates)
}

fn scan_hermes(options: &ScanOptions) -> Result<Vec<ManagedAgent>, ScannerError> {
    let mut candidates = Vec::new();
    if let Some(hermes_home) = &options.hermes_home {
        push_if_dir(&mut candidates, hermes_home.clone());
    }
    push_if_dir(&mut candidates, options.home_dir.join(".hermes"));

    // `hermes profile list` is intentionally not called in this phase: there is
    // no reusable timeout-bound safe command wrapper for arbitrary CLI output.
    scan_candidates(AgentRuntime::Hermes, candidates)
}

fn scan_candidates(
    runtime: AgentRuntime,
    mut candidates: Vec<PathBuf>,
) -> Result<Vec<ManagedAgent>, ScannerError> {
    candidates.sort();
    candidates.dedup();

    let mut agents = Vec::new();
    for candidate in candidates {
        let records = match runtime {
            AgentRuntime::OpenClaw => scanner::openclaw::scan_root(&candidate)?,
            AgentRuntime::Hermes => scanner::hermes::scan_root(&candidate)?,
        };

        for record in records
            .into_iter()
            .filter(|record| !is_container_root_record(runtime, &candidate, &record.root_path))
        {
            agents.push(managed_agent_from_record(record, &candidate));
        }
    }

    Ok(agents)
}

fn managed_agent_from_record(record: AgentScanRecord, config_root: &Path) -> ManagedAgent {
    let confidence = confidence_for_record(&record);
    let mut warnings = warnings_from_scan(record.warnings);
    if confidence == "low" {
        warnings.push(RuntimeWarning {
            code: "low_confidence_directory_shape".to_string(),
            message: "Agent/profile inferred from directory shape only".to_string(),
            path: Some(record.root_path.display().to_string()),
            severity: "warning".to_string(),
        });
    }

    ManagedAgent {
        id: record.id,
        product: record.runtime.as_str().to_string(),
        display_name: record.name,
        description: None,
        agent_kind: match record.runtime {
            AgentRuntime::OpenClaw => "openclaw-agent",
            AgentRuntime::Hermes => "hermes-profile",
        }
        .to_string(),
        config_root: config_root.display().to_string(),
        workspace_or_profile_path: record.root_path.display().to_string(),
        effective_cwd: None,
        provider_summary: Some(record.provider_summary),
        model_summary: Some(record.model_summary),
        permission_summary: None,
        channel_count: record.channel_summary.channel_hints.len(),
        skill_count: record.skill_paths.len(),
        memory_count: None,
        session_count: None,
        last_modified: last_modified(&record.root_path),
        warnings,
        confidence: confidence.to_string(),
    }
}

fn confidence_for_record(record: &AgentScanRecord) -> &'static str {
    if !record.config_paths.is_empty() || !record.personality_files.is_empty() {
        "high"
    } else if !record.skill_paths.is_empty() {
        "medium"
    } else {
        "low"
    }
}

fn warnings_from_scan(warnings: Vec<ScanWarning>) -> Vec<RuntimeWarning> {
    warnings
        .into_iter()
        .map(|warning| RuntimeWarning {
            code: warning.code,
            message: warning.message,
            path: None,
            severity: match warning.severity {
                WarningSeverity::Info => "info",
                WarningSeverity::Warning => "warning",
                WarningSeverity::Error => "error",
            }
            .to_string(),
        })
        .collect()
}

fn last_modified(path: &Path) -> Option<String> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs().to_string())
}

fn push_if_dir(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if path.is_dir() {
        candidates.push(path);
    }
}

fn is_container_root_record(runtime: AgentRuntime, candidate: &Path, record_path: &Path) -> bool {
    let container_name = match runtime {
        AgentRuntime::OpenClaw => "agents",
        AgentRuntime::Hermes => "profiles",
    };
    candidate == record_path && candidate.join(container_name).is_dir()
}

fn dedupe_managed_agents(agents: &mut Vec<ManagedAgent>) {
    let mut by_key = BTreeMap::new();
    for agent in agents.drain(..) {
        let key = canonical_key(&agent.workspace_or_profile_path);
        by_key.entry(key).or_insert(agent);
    }
    agents.extend(by_key.into_values());
    agents.sort_by(|left, right| {
        (
            left.product.as_str(),
            left.display_name.as_str(),
            left.workspace_or_profile_path.as_str(),
        )
            .cmp(&(
                right.product.as_str(),
                right.display_name.as_str(),
                right.workspace_or_profile_path.as_str(),
            ))
    });
}

fn canonical_key(path: &str) -> String {
    fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path))
        .display()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::io::Write;

    #[test]
    fn returns_empty_when_candidates_are_absent() {
        let temp = tempfile::tempdir().expect("temp home");
        let agents = scan_managed_agents_with_options(&ScanOptions {
            home_dir: temp.path().join("home"),
            hermes_home: None,
        })
        .expect("scan");

        assert!(agents.is_empty());
    }

    #[test]
    fn scans_openclaw_agents_and_workspace_candidates_read_only() {
        let temp = tempfile::tempdir().expect("temp home");
        let openclaw = temp.path().join("home/.openclaw");
        write_config(
            openclaw.join("agents/main/agent.json"),
            r#"{"name":"Main Agent"}"#,
        );
        write_config(
            openclaw.join("workspace/config.json"),
            r#"{"agent":{"name":"Workspace Agent"}}"#,
        );
        write_config(
            openclaw.join("workspace-dev/config.json"),
            r#"{"name":"Workspace Dev Agent"}"#,
        );

        let agents = scan_managed_agents_with_options(&ScanOptions {
            home_dir: temp.path().join("home"),
            hermes_home: None,
        })
        .expect("scan");
        let names: BTreeSet<_> = agents
            .iter()
            .filter(|agent| agent.product == "openclaw")
            .map(|agent| agent.display_name.as_str())
            .collect();

        assert!(names.contains("Main Agent"));
        assert!(names.contains("Workspace Agent"));
        assert!(names.contains("Workspace Dev Agent"));
        assert!(agents
            .iter()
            .filter(|agent| agent.product == "openclaw")
            .all(|agent| agent.agent_kind == "openclaw-agent"));
    }

    #[test]
    fn scans_hermes_home_before_default_home() {
        let temp = tempfile::tempdir().expect("temp home");
        let hermes_home = temp.path().join("custom-hermes");
        write_config(
            hermes_home.join("profiles/custom/profile.json"),
            r#"{"profile":{"name":"Custom Hermes"}}"#,
        );
        write_config(
            temp.path()
                .join("home/.hermes/profiles/default/profile.json"),
            r#"{"profile":{"name":"Default Hermes"}}"#,
        );

        let agents = scan_managed_agents_with_options(&ScanOptions {
            home_dir: temp.path().join("home"),
            hermes_home: Some(hermes_home.clone()),
        })
        .expect("scan");
        let hermes: Vec<_> = agents
            .iter()
            .filter(|agent| agent.product == "hermes")
            .collect();

        assert_eq!(hermes.len(), 2);
        assert!(hermes
            .iter()
            .any(|agent| agent.config_root == hermes_home.display().to_string()));
        assert!(hermes
            .iter()
            .all(|agent| agent.agent_kind == "hermes-profile"));
    }

    #[test]
    fn confidence_and_warnings_are_populated() {
        let temp = tempfile::tempdir().expect("temp home");
        let openclaw = temp.path().join("home/.openclaw");
        fs::create_dir_all(openclaw.join("agents/shape-only")).expect("shape dir");

        let agents = scan_managed_agents_with_options(&ScanOptions {
            home_dir: temp.path().join("home"),
            hermes_home: None,
        })
        .expect("scan");
        let agent = agents
            .iter()
            .find(|agent| agent.display_name == "shape-only")
            .expect("shape agent");

        assert_eq!(agent.confidence, "low");
        assert!(agent
            .warnings
            .iter()
            .any(|warning| warning.code == "low_confidence_directory_shape"));
    }

    #[test]
    fn does_not_serialize_private_session_memory_or_secret_values() {
        let temp = tempfile::tempdir().expect("temp home");
        let agent = temp.path().join("home/.openclaw/agents/private-safe");
        write_config(
            agent.join("config.json"),
            r#"{"name":"Private Safe","api_key":"secret-api-value","channels":{"telegram":{"bot_token":"secret-token-value"}}}"#,
        );
        write_text(
            agent.join("sessions/session.json"),
            "private session text that must not be serialized",
        );
        write_text(
            agent.join("memory/memory.json"),
            "private memory text that must not be serialized",
        );

        let agents = scan_managed_agents_with_options(&ScanOptions {
            home_dir: temp.path().join("home"),
            hermes_home: None,
        })
        .expect("scan");
        let rendered = serde_json::to_string(&agents).expect("serialize");

        assert!(!rendered.contains("secret-api-value"));
        assert!(!rendered.contains("secret-token-value"));
        assert!(!rendered.contains("private session text"));
        assert!(!rendered.contains("private memory text"));
        assert!(rendered.contains("secret_fields_redacted"));
    }

    fn write_config(path: PathBuf, content: &str) {
        write_text(path, content);
    }

    fn write_text(path: PathBuf, content: &str) {
        fs::create_dir_all(path.parent().expect("parent")).expect("create parent");
        let mut file = fs::File::create(path).expect("create file");
        file.write_all(content.as_bytes()).expect("write file");
    }
}
