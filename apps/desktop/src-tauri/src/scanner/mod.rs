pub mod hermes;
pub mod ignore;
pub mod openclaw;
pub mod redaction;
pub mod types;

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use thiserror::Error;

use self::ignore::{is_private_runtime_dir, is_secret_bearing_config_file};
pub use self::types::*;

#[derive(Debug, Error)]
pub enum ScannerError {
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("could not resolve the user home directory")]
    HomeDirectoryUnavailable,
}

pub fn repository_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

pub fn fixture_roots() -> Vec<ScanRoot> {
    let root = repository_root().join("tests").join("fixtures");
    vec![
        scan_root(
            AgentRuntime::OpenClaw,
            root.join("openclaw"),
            ScanRootSource::Fixture,
        ),
        scan_root(
            AgentRuntime::Hermes,
            root.join("hermes"),
            ScanRootSource::Fixture,
        ),
    ]
}

pub fn default_candidate_roots() -> Result<Vec<ScanRoot>, ScannerError> {
    let home = dirs::home_dir().ok_or(ScannerError::HomeDirectoryUnavailable)?;
    let mut roots = vec![
        scan_root(
            AgentRuntime::OpenClaw,
            home.join(".openclaw"),
            ScanRootSource::DefaultCandidate,
        ),
        scan_root(
            AgentRuntime::OpenClaw,
            home.join(".openclaw").join("agents"),
            ScanRootSource::DefaultCandidate,
        ),
        scan_root(
            AgentRuntime::OpenClaw,
            home.join(".openclaw").join("workspace"),
            ScanRootSource::DefaultCandidate,
        ),
        scan_root(
            AgentRuntime::Hermes,
            home.join(".hermes"),
            ScanRootSource::DefaultCandidate,
        ),
        scan_root(
            AgentRuntime::Hermes,
            home.join(".hermes").join("profiles"),
            ScanRootSource::DefaultCandidate,
        ),
    ];

    if let Ok(entries) = fs::read_dir(home.join(".openclaw")) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with("workspace-"))
                    .unwrap_or(false)
            {
                roots.push(scan_root(
                    AgentRuntime::OpenClaw,
                    path,
                    ScanRootSource::DefaultCandidate,
                ));
            }
        }
    }

    Ok(roots)
}

pub fn scan_selected_root(
    runtime: AgentRuntime,
    path: PathBuf,
) -> Result<Vec<AgentScanRecord>, ScannerError> {
    match runtime {
        AgentRuntime::OpenClaw => openclaw::scan_root(&path),
        AgentRuntime::Hermes => hermes::scan_root(&path),
    }
}

pub fn preview_scan_root(runtime: AgentRuntime, path: PathBuf) -> ScanPreview {
    let exists = path.is_dir();
    let readable = exists && fs::read_dir(&path).is_ok();
    let mut warnings = Vec::new();
    if exists && !readable {
        warnings.push(warning(
            "root_not_readable",
            "Scan root is not readable",
            WarningSeverity::Error,
        ));
    }
    if !exists {
        warnings.push(warning(
            "root_not_found",
            "Target path does not exist",
            WarningSeverity::Warning,
        ));
    }

    ScanPreview {
        runtime,
        path,
        exists,
        readable,
        estimated_scan_mode: "Read-only metadata scan".to_string(),
        private_dirs_skipped: ignore::private_runtime_dir_names()
            .iter()
            .map(|name| (*name).to_string())
            .collect(),
        config_extensions: ["json", "yaml", "yml", "toml"]
            .iter()
            .map(|extension| (*extension).to_string())
            .collect(),
        will_read_config_metadata: readable,
        will_skip_runtime_private_data: true,
        will_not_store_secret_values: true,
        warnings,
    }
}

pub fn scan_fixtures() -> Result<Vec<AgentScanRecord>, ScannerError> {
    let mut records = Vec::new();
    for root in fixture_roots() {
        if root.exists {
            records.extend(scan_selected_root(root.runtime, root.path)?);
        }
    }
    Ok(records)
}

pub(crate) fn scan_root(runtime: AgentRuntime, path: PathBuf, source: ScanRootSource) -> ScanRoot {
    let exists = path.is_dir();
    ScanRoot {
        runtime,
        readable: exists && fs::read_dir(&path).is_ok(),
        path,
        source,
        exists,
        last_scanned_at: None,
    }
}

pub(crate) fn now_timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

pub(crate) fn warning(code: &str, message: &str, severity: WarningSeverity) -> ScanWarning {
    ScanWarning {
        code: code.to_string(),
        message: message.to_string(),
        severity,
    }
}

pub(crate) fn health_status(
    provider_summary: &ProviderSummary,
    model_summary: &ModelSummary,
    warnings: &[ScanWarning],
) -> HealthStatus {
    if warnings
        .iter()
        .any(|warning| warning.severity == WarningSeverity::Error)
    {
        return HealthStatus::Error;
    }
    if provider_summary.provider.is_some() && model_summary.default_model.is_some() {
        return HealthStatus::Ok;
    }
    HealthStatus::Warning
}

pub(crate) fn parse_config(path: &Path) -> Option<Value> {
    if is_secret_bearing_config_file(path) {
        return None;
    }

    let extension = path.extension().and_then(|value| value.to_str())?;
    let content = fs::read_to_string(path).ok()?;
    match extension.to_ascii_lowercase().as_str() {
        "json" => serde_json::from_str(&content).ok(),
        "yaml" | "yml" => serde_yaml::from_str::<Value>(&content).ok(),
        "toml" => toml::from_str::<toml::Value>(&content)
            .ok()
            .and_then(|value| serde_json::to_value(value).ok()),
        _ => None,
    }
}

pub(crate) fn collect_config_files(root: &Path, warnings: &mut Vec<ScanWarning>) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_config_files_inner(root, warnings, &mut files);
    files.sort();
    files
}

fn collect_config_files_inner(
    root: &Path,
    warnings: &mut Vec<ScanWarning>,
    files: &mut Vec<PathBuf>,
) {
    if is_private_runtime_dir(root) {
        warnings.push(warning(
            "private_runtime_data_skipped",
            "Skipped private runtime data",
            WarningSeverity::Info,
        ));
        return;
    }

    let Ok(entries) = fs::read_dir(root) else {
        warnings.push(warning(
            "root_not_readable",
            "Scan root is not readable",
            WarningSeverity::Error,
        ));
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_config_files_inner(&path, warnings, files);
        } else if is_secret_bearing_config_file(&path) {
            warnings.push(warning(
                "secret_config_file_skipped",
                "Skipped secret-bearing config file",
                WarningSeverity::Info,
            ));
        } else if is_config_file(&path) {
            files.push(path);
        }
    }
}

pub(crate) fn is_config_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "json" | "yaml" | "yml" | "toml"
            )
        })
        .unwrap_or(false)
}

pub(crate) fn find_personality_files(root: &Path) -> Vec<PathBuf> {
    ["SOUL.md", "AGENTS.md", "USER.md"]
        .iter()
        .map(|name| root.join(name))
        .filter(|path| path.is_file())
        .collect()
}

pub(crate) fn find_skill_paths(root: &Path) -> Vec<PathBuf> {
    let skills_dir = root.join("skills");
    fs::read_dir(skills_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() || path.is_file())
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::hash_map::DefaultHasher;
    use std::fs;
    use std::hash::{Hash, Hasher};

    use super::redaction::{collect_secret_fields, redacted_marker};
    use super::*;

    #[test]
    fn scanner_detects_openclaw_fixtures() {
        let root = repository_root().join("tests/fixtures/openclaw");
        let records = openclaw::scan_root(&root).expect("openclaw fixture scan");

        assert!(records
            .iter()
            .any(|record| record.name == "Consulting Agent"));
        assert!(records
            .iter()
            .any(|record| record.name == "Companion Agent"));
        assert!(records
            .iter()
            .any(|record| record.name == "Auto Business Agent"));
        assert!(records
            .iter()
            .any(|record| record.name == "Provider Without Model"));
        assert!(records
            .iter()
            .any(|record| record.name == "Model Without Provider"));
        assert!(records
            .iter()
            .any(|record| record.name == "OpenClaw Channel Matrix"));
        assert!(records
            .iter()
            .all(|record| record.runtime == AgentRuntime::OpenClaw));
    }

    #[test]
    fn scanner_detects_hermes_fixtures() {
        let root = repository_root().join("tests/fixtures/hermes");
        let records = hermes::scan_root(&root).expect("hermes fixture scan");

        assert!(records.iter().any(|record| record.name == "consulting-agent"));
        assert!(records.iter().any(|record| record.name == "dev-agent"));
        assert!(records.iter().any(|record| record.name == "provider-matrix"));
        assert!(records.iter().any(|record| record.name == "model-no-provider"));
        assert!(!records
            .iter()
            .any(|record| record.name == "Hermes Dev Agent"));
        assert!(records
            .iter()
            .all(|record| record.runtime == AgentRuntime::Hermes));
    }

    #[test]
    fn scanner_redacts_secret_fields() {
        let value = serde_json::json!({
            "api_key": "fixture-api-key",
            "channels": { "telegram": { "bot_token": "fixture-token" } }
        });

        let fields = collect_secret_fields(&value);
        assert!(fields.contains(&"api_key".to_string()));
        assert!(fields.contains(&"bot_token".to_string()));
        assert_eq!(redacted_marker(), "••••••••");
    }

    #[test]
    fn scanner_skips_private_runtime_dirs() {
        let root = repository_root().join("tests/fixtures/openclaw");
        let records = openclaw::scan_root(&root).expect("openclaw fixture scan");
        let rendered = serde_json::to_string(&records).expect("records json");

        assert!(rendered.contains("Skipped private runtime data"));
        assert!(!rendered.contains("This private session content must never be indexed"));
        assert!(!rendered.contains("This private memory content must never be indexed"));
        assert!(!rendered.contains("This private history content must never be indexed"));
        assert!(!rendered.contains("This private log content must never be indexed"));
        assert!(!rendered.contains("transcript"));
    }

    #[test]
    fn scanner_never_serializes_secret_values() {
        let records = scan_fixtures().expect("fixture scan");
        let rendered = serde_json::to_string(&records).expect("records json");

        for secret_value in [
            "fixture-openclaw-api-key",
            "fixture-openclaw-bot-token",
            "fixture-telegram-token",
            "fixture-app-secret",
            "fixture-hermes-api-key",
            "fixture-hermes-bot-token",
            "fixture-secret",
            "fixture-encrypted-placeholder",
        ] {
            assert!(
                !rendered.contains(secret_value),
                "serialized records leaked {secret_value}"
            );
        }
    }

    #[test]
    fn scanner_skips_secret_bearing_config_files_without_reading_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path().join("agent");
        fs::create_dir_all(&root).expect("agent root");
        fs::write(
            root.join("config.json"),
            r#"{"name":"Safe Metadata","provider":"openai","model":{"default":"gpt-safe"}}"#,
        )
        .expect("write config");
        fs::write(
            root.join("auth.json"),
            r#"{"name":"Leaked Auth Name","api_key":"AUTH_CANARY_006"}"#,
        )
        .expect("write auth");
        fs::write(
            root.join("credentials.json"),
            r#"{"provider":"bad-provider","token":"CREDENTIAL_CANARY_006"}"#,
        )
        .expect("write credentials");
        fs::write(root.join(".env"), "OPENAI_API_KEY=ENV_CANARY_006").expect("write env");

        let records = openclaw::scan_root(&root).expect("scan root");
        let rendered = serde_json::to_string(&records).expect("records json");

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].name, "Safe Metadata");
        assert_eq!(
            records[0].provider_summary.provider.as_deref(),
            Some("openai")
        );
        assert!(records[0]
            .warnings
            .iter()
            .any(|warning| warning.code == "secret_config_file_skipped"));
        assert!(!records[0]
            .config_paths
            .iter()
            .any(|path| path.file_name().and_then(|name| name.to_str()) == Some("auth.json")));
        assert!(!records[0]
            .config_paths
            .iter()
            .any(
                |path| path.file_name().and_then(|name| name.to_str()) == Some("credentials.json")
            ));
        assert!(!rendered.contains("Leaked Auth Name"));
        assert!(!rendered.contains("AUTH_CANARY_006"));
        assert!(!rendered.contains("bad-provider"));
        assert!(!rendered.contains("CREDENTIAL_CANARY_006"));
        assert!(!rendered.contains("ENV_CANARY_006"));
    }

    #[test]
    fn fixture_matrix_emits_phase_two_warnings_and_health() {
        let records = scan_fixtures().expect("fixture scan");
        let rendered = serde_json::to_string(&records).expect("records json");

        for code in [
            "provider_without_model",
            "model_without_provider",
            "channel_token_hidden",
            "encrypted_credential_detected",
            "possible_channel_identity_conflict",
            "private_runtime_data_skipped",
        ] {
            assert!(rendered.contains(code), "missing warning code {code}");
        }
        assert!(records
            .iter()
            .any(|record| record.health_status == HealthStatus::Ok));
        assert!(records
            .iter()
            .any(|record| record.health_status == HealthStatus::Warning));
    }

    #[test]
    fn preview_scan_root_only_reports_rules_and_access() {
        let root = repository_root().join("tests/fixtures/openclaw");
        let preview = preview_scan_root(AgentRuntime::OpenClaw, root);

        assert!(preview.exists);
        assert!(preview.readable);
        assert!(preview.will_skip_runtime_private_data);
        assert!(preview.will_not_store_secret_values);
        assert_eq!(preview.config_extensions, ["json", "yaml", "yml", "toml"]);
        assert!(preview
            .private_dirs_skipped
            .contains(&"sessions".to_string()));
    }

    #[test]
    fn scanner_does_not_mutate_source_files() {
        let root = repository_root().join("tests/fixtures/hermes");
        let before = directory_fingerprint(&root);

        let _records = hermes::scan_root(&root).expect("hermes fixture scan");

        let after = directory_fingerprint(&root);
        assert_eq!(before, after);
    }

    #[test]
    fn scanner_handles_missing_roots() {
        let root = repository_root().join("tests/fixtures/missing-root");
        let records = openclaw::scan_root(&root).expect("missing root scan");

        assert!(records.is_empty());
    }

    #[test]
    fn scanner_handles_unknown_config_format() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(temp.path().join("README.txt"), "unknown format").expect("write fixture");

        let records = hermes::scan_root(temp.path()).expect("unknown fixture scan");

        assert_eq!(records.len(), 1);
        assert!(records[0]
            .warnings
            .iter()
            .any(|warning| warning.code == "unknown_config_format_preserved"));
    }

    fn directory_fingerprint(root: &Path) -> u64 {
        let mut paths = Vec::new();
        collect_all_files(root, &mut paths);
        paths.sort();

        let mut hasher = DefaultHasher::new();
        for path in paths {
            path.display().to_string().hash(&mut hasher);
            fs::read(path).expect("read file").hash(&mut hasher);
        }
        hasher.finish()
    }

    fn collect_all_files(root: &Path, files: &mut Vec<PathBuf>) {
        for entry in fs::read_dir(root).expect("read dir") {
            let path = entry.expect("dir entry").path();
            if path.is_dir() {
                collect_all_files(&path, files);
            } else {
                files.push(path);
            }
        }
    }
}
