use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentRuntime {
    OpenClaw,
    Hermes,
}

impl AgentRuntime {
    pub fn as_str(self) -> &'static str {
        match self {
            AgentRuntime::OpenClaw => "openclaw",
            AgentRuntime::Hermes => "hermes",
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScanRootSource {
    Fixture,
    DefaultCandidate,
    UserSelected,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRoot {
    pub runtime: AgentRuntime,
    pub path: PathBuf,
    pub source: ScanRootSource,
    pub exists: bool,
    pub readable: bool,
    pub last_scanned_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialScanState {
    pub scan_roots: Vec<ScanRoot>,
    pub agents: Vec<AgentScanRecord>,
    pub privacy_mode: PrivacyModeStatus,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyModeStatus {
    pub local_only: bool,
    pub read_only: bool,
    pub default_candidates_inspected: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanPreview {
    pub runtime: AgentRuntime,
    pub path: PathBuf,
    pub exists: bool,
    pub readable: bool,
    pub estimated_scan_mode: String,
    pub private_dirs_skipped: Vec<String>,
    pub config_extensions: Vec<String>,
    pub will_read_config_metadata: bool,
    pub will_skip_runtime_private_data: bool,
    pub will_not_store_secret_values: bool,
    pub warnings: Vec<ScanWarning>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSummary {
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub secret_fields: Vec<String>,
    pub missing_secret_fields: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSummary {
    pub default_model: Option<String>,
    pub fallback_model: Option<String>,
    #[serde(default)]
    pub configured_models: Vec<ConfiguredModelSummary>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfiguredModelSummary {
    pub model_id: String,
    pub name: String,
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub default_model: bool,
    pub fallback_model: bool,
    pub source: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelSummary {
    pub channel_hints: Vec<String>,
    pub token_fields: Vec<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthStatus {
    Ok,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WarningSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanWarning {
    pub code: String,
    pub message: String,
    pub severity: WarningSeverity,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFileMetadata {
    pub path: PathBuf,
    pub role: String,
    pub sensitive: bool,
    pub skipped: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentScanRecord {
    pub id: String,
    pub runtime: AgentRuntime,
    pub name: String,
    pub root_path: PathBuf,
    pub config_paths: Vec<PathBuf>,
    pub config_files: Vec<ConfigFileMetadata>,
    pub personality_files: Vec<PathBuf>,
    pub skill_paths: Vec<PathBuf>,
    pub provider_summary: ProviderSummary,
    pub model_summary: ModelSummary,
    pub channel_summary: ChannelSummary,
    pub warnings: Vec<ScanWarning>,
    pub health_status: HealthStatus,
    pub last_scanned_at: String,
}
