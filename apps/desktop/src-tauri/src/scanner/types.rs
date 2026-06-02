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
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelSummary {
    pub channel_hints: Vec<String>,
    pub token_fields: Vec<String>,
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
pub struct AgentScanRecord {
    pub id: String,
    pub runtime: AgentRuntime,
    pub name: String,
    pub root_path: PathBuf,
    pub config_paths: Vec<PathBuf>,
    pub personality_files: Vec<PathBuf>,
    pub skill_paths: Vec<PathBuf>,
    pub provider_summary: ProviderSummary,
    pub model_summary: ModelSummary,
    pub channel_summary: ChannelSummary,
    pub warnings: Vec<ScanWarning>,
    pub last_scanned_at: String,
}
