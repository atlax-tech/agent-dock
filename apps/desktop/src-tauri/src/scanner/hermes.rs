use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::ignore::is_private_runtime_dir;
use super::redaction::collect_secret_fields;
use super::types::*;
use super::{
    collect_config_file_metadata, find_personality_files, find_skill_paths, health_status,
    now_timestamp, parse_config, warning, ScannerError,
};

pub fn scan_root(root: &Path) -> Result<Vec<AgentScanRecord>, ScannerError> {
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let mut candidates = Vec::new();
    let profiles_dir = root.join("profiles");
    if profiles_dir.is_dir() {
        collect_child_dirs(&profiles_dir, &mut candidates)?;
    }
    if root.file_name().and_then(|name| name.to_str()) != Some("profiles") {
        candidates.push(root.to_path_buf());
    } else {
        collect_child_dirs(root, &mut candidates)?;
    }

    candidates.sort();
    candidates.dedup();
    Ok(candidates
        .into_iter()
        .filter(|path| !is_private_runtime_dir(path))
        .filter_map(|path| scan_profile_dir(&path))
        .collect())
}

fn collect_child_dirs(root: &Path, candidates: &mut Vec<PathBuf>) -> Result<(), ScannerError> {
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        if path.is_dir() && !is_private_runtime_dir(&path) {
            candidates.push(path);
        }
    }
    Ok(())
}

fn scan_profile_dir(root: &Path) -> Option<AgentScanRecord> {
    let mut warnings = Vec::new();
    let config_files = collect_config_file_metadata(root, &mut warnings);
    let config_paths: Vec<_> = config_files
        .iter()
        .filter(|file| !file.skipped)
        .map(|file| file.path.clone())
        .collect();
    let mut provider_summary = ProviderSummary::default();
    let mut model_summary = ModelSummary::default();
    let mut channel_summary = ChannelSummary::default();
    let name = root.file_name()?.to_string_lossy().to_string();

    if config_paths.is_empty() {
        warnings.push(warning(
            "unknown_config_format_preserved",
            "Unknown config format preserved",
            WarningSeverity::Warning,
        ));
    }

    for path in &config_paths {
        let Some(value) = parse_config(path) else {
            warnings.push(warning(
                "unknown_config_format_preserved",
                "Unknown config format preserved",
                WarningSeverity::Warning,
            ));
            continue;
        };

        merge_metadata(
            &value,
            &mut provider_summary,
            &mut model_summary,
            &mut channel_summary,
        );
    }

    if !provider_summary.secret_fields.is_empty() || !channel_summary.token_fields.is_empty() {
        warnings.push(warning(
            "secret_fields_redacted",
            "Secret fields redacted",
            WarningSeverity::Info,
        ));
    }

    if provider_summary.provider.is_some() && model_summary.default_model.is_none() {
        warnings.push(warning(
            "provider_without_model",
            "Provider configured but no model detected",
            WarningSeverity::Warning,
        ));
    }

    if provider_summary.provider.is_none() && model_summary.default_model.is_some() {
        warnings.push(warning(
            "model_without_provider",
            "Model configured but no provider detected",
            WarningSeverity::Warning,
        ));
    }

    if !channel_summary.channel_hints.is_empty() && !channel_summary.token_fields.is_empty() {
        warnings.push(warning(
            "channel_token_hidden",
            "Channel config detected but token is hidden",
            WarningSeverity::Info,
        ));
    }

    if provider_summary
        .secret_fields
        .iter()
        .any(|field| field.to_ascii_lowercase().contains("encrypted"))
    {
        warnings.push(warning(
            "encrypted_credential_detected",
            "Encrypted credential detected; AgentDock will not migrate or decrypt it",
            WarningSeverity::Info,
        ));
    }

    if channel_summary.token_fields.iter().any(|field| {
        matches!(
            field.to_ascii_lowercase().as_str(),
            "accountid" | "account_id" | "botid" | "bot_id" | "appid" | "app_id" | "secret"
        )
    }) {
        warnings.push(warning(
            "possible_channel_identity_conflict",
            "Channel identity fields may be ambiguous",
            WarningSeverity::Warning,
        ));
    }

    let last_scanned_at = now_timestamp();
    let health_status = health_status(&provider_summary, &model_summary, &warnings);
    Some(AgentScanRecord {
        id: format!("hermes:{}", root.display()),
        runtime: AgentRuntime::Hermes,
        name,
        root_path: root.to_path_buf(),
        config_paths,
        config_files,
        personality_files: find_personality_files(root),
        skill_paths: find_skill_paths(root),
        provider_summary,
        model_summary,
        channel_summary,
        warnings,
        health_status,
        last_scanned_at,
    })
}

fn merge_metadata(
    value: &Value,
    provider_summary: &mut ProviderSummary,
    model_summary: &mut ModelSummary,
    channel_summary: &mut ChannelSummary,
) {
    provider_summary.provider = provider_summary
        .provider
        .clone()
        .or_else(|| string_at(value, &["provider"]).map(str::to_string))
        .or_else(|| string_at(value, &["model", "provider"]).map(str::to_string));
    provider_summary.base_url = provider_summary
        .base_url
        .clone()
        .or_else(|| string_at(value, &["base_url"]).map(str::to_string))
        .or_else(|| string_at(value, &["provider", "base_url"]).map(str::to_string));
    model_summary.default_model = model_summary
        .default_model
        .clone()
        .or_else(|| string_at(value, &["default_model"]).map(str::to_string))
        .or_else(|| string_at(value, &["model", "default"]).map(str::to_string));
    model_summary.fallback_model = model_summary
        .fallback_model
        .clone()
        .or_else(|| string_at(value, &["fallback_model"]).map(str::to_string))
        .or_else(|| string_at(value, &["model", "fallback"]).map(str::to_string));

    provider_summary
        .secret_fields
        .extend(collect_secret_fields(value));
    provider_summary.secret_fields.sort();
    provider_summary.secret_fields.dedup();

    collect_channel_hints(value, channel_summary);
}

fn string_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    current.as_str()
}

fn collect_channel_hints(value: &Value, summary: &mut ChannelSummary) {
    if let Some(channels) = value.get("channels").and_then(Value::as_object) {
        summary.channel_hints.extend(channels.keys().cloned());
        for channel in channels.values() {
            collect_channel_token_fields(channel, summary);
        }
    }
    for secret in collect_secret_fields(value) {
        if secret.to_ascii_lowercase().contains("token") {
            summary.token_fields.push(secret);
        }
    }
    summary.channel_hints.sort();
    summary.channel_hints.dedup();
    summary.token_fields.sort();
    summary.token_fields.dedup();
}

fn collect_channel_token_fields(value: &Value, summary: &mut ChannelSummary) {
    let Some(object) = value.as_object() else {
        return;
    };
    for key in object.keys() {
        let normalized = key.to_ascii_lowercase();
        if normalized.contains("token")
            || normalized.contains("secret")
            || matches!(
                normalized.as_str(),
                "accountid" | "account_id" | "botid" | "bot_id" | "appid" | "app_id"
            )
        {
            summary.token_fields.push(key.to_string());
        }
    }
}
