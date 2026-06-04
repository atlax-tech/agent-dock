use std::fs;
use std::io::Write;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use similar::TextDiff;

use crate::db::{
    insert_backup_record, load_agent_records, load_provider_profiles, open_database,
    upsert_agent_records, upsert_provider_profile, BackupRecord, ProviderKind, ProviderProfile,
};
use crate::scanner::ignore::is_private_runtime_dir;
use crate::scanner::types::{AgentRuntime, AgentScanRecord, ModelSummary, ProviderSummary};

const MISSING_HASH: &str = "missing";
const MODEL_PROVIDER_FILE_KIND: &str = "model_provider";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub kind: ProviderKind,
    pub base_url: Option<String>,
    pub api_key_ref: Option<String>,
    pub default_model: Option<String>,
    pub fallback_model: Option<String>,
    pub validation_json: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderUpdateRequest {
    pub agent_id: String,
    pub provider_id: Option<String>,
    pub provider_name: Option<String>,
    pub kind: ProviderKind,
    pub base_url: Option<String>,
    pub api_key_ref: Option<String>,
    pub default_model: Option<String>,
    pub fallback_model: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyModelProviderUpdateRequest {
    pub update: ModelProviderUpdateRequest,
    pub expected_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderUpdatePlan {
    pub agent_id: String,
    pub runtime: AgentRuntime,
    pub target_files: Vec<PathBuf>,
    pub old_provider_summary: ProviderSummary,
    pub new_provider_summary: ProviderSummary,
    pub old_model_summary: ModelSummary,
    pub new_model_summary: ModelSummary,
    pub old_hash: String,
    pub new_hash: String,
    pub unified_diff: String,
    pub warnings: Vec<String>,
    pub backup_will_be_created: bool,
    pub affects_only_selected_agent_profile: bool,
    pub effective_model_before: EffectiveModelPreview,
    pub effective_model_after: EffectiveModelPreview,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderUpdateResult {
    pub agent_id: String,
    pub runtime: AgentRuntime,
    pub target_path: PathBuf,
    pub backup_path: PathBuf,
    pub old_hash: String,
    pub new_hash: String,
    pub scan_result: Vec<AgentScanRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveModelStep {
    pub label: String,
    pub model: Option<String>,
    pub active: bool,
    pub reason: String,
    pub local_only: bool,
    pub may_call_remote_api: bool,
    pub may_create_cost: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveModelPreview {
    pub effective_model: Option<String>,
    pub source: String,
    pub explanation: String,
    pub local_only: bool,
    pub may_call_remote_api: bool,
    pub may_create_cost: bool,
    pub steps: Vec<EffectiveModelStep>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveModelRequest {
    pub agent_id: String,
    pub provider: Option<ProviderProfileInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiValidationRequest {
    pub kind: ProviderKind,
    pub base_url: String,
    pub api_key_ref: Option<String>,
    pub model: Option<String>,
    pub include_test_request: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderValidationReport {
    pub base_url_valid: bool,
    pub api_key_reference_status: String,
    pub connection_status: String,
    pub auth_status: String,
    pub model_list_status: String,
    pub generation_status: String,
    pub models: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeScanRequest {
    pub base_url: Option<String>,
    pub custom_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeModel {
    pub name: String,
    pub modified: Option<String>,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRuntimeScanResult {
    pub runtime: String,
    pub endpoint: Option<String>,
    pub reachable: bool,
    pub models: Vec<RuntimeModel>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComfyCapabilityFolder {
    pub kind: String,
    pub path: PathBuf,
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComfyScanResult {
    pub provider_kind: String,
    pub is_chat_llm_provider: bool,
    pub detected_paths: Vec<PathBuf>,
    pub capability_folders: Vec<ComfyCapabilityFolder>,
    pub endpoint: Option<String>,
    pub endpoint_reachable: bool,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn list_provider_profiles() -> Result<Vec<ProviderProfile>, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    load_provider_profiles(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_provider_profile(input: ProviderProfileInput) -> Result<ProviderProfile, String> {
    let profile = provider_profile_from_input(input)?;
    let connection = open_database().map_err(|error| error.to_string())?;
    upsert_provider_profile(&connection, &profile).map_err(|error| error.to_string())?;
    Ok(profile)
}

#[tauri::command]
pub fn resolve_effective_model_preview(
    request: EffectiveModelRequest,
) -> Result<EffectiveModelPreview, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    let agent = find_agent(&connection, &request.agent_id)?;
    let provider_input = request.provider.clone();
    let provider = provider_input
        .clone()
        .map(provider_profile_from_input)
        .transpose()?;
    let model_summary = provider_input
        .as_ref()
        .map(|input| ModelSummary {
            default_model: clean_optional(input.default_model.clone()),
            fallback_model: clean_optional(input.fallback_model.clone()),
        })
        .unwrap_or(agent.model_summary);
    Ok(resolve_effective_model(
        &model_summary,
        provider.as_ref(),
        &provider_input,
    ))
}

#[tauri::command]
pub fn create_model_provider_update_plan(
    request: ModelProviderUpdateRequest,
) -> Result<ModelProviderUpdatePlan, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    create_model_provider_update_plan_with_connection(&connection, request)
}

#[tauri::command]
pub fn apply_model_provider_update(
    request: ApplyModelProviderUpdateRequest,
) -> Result<ModelProviderUpdateResult, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    apply_model_provider_update_with_connection(&connection, &home, request)
}

#[tauri::command]
pub fn validate_openai_provider(
    request: OpenAiValidationRequest,
) -> Result<ProviderValidationReport, String> {
    validate_openai_provider_request(request)
}

#[tauri::command]
pub fn scan_ollama_runtime(request: RuntimeScanRequest) -> Result<LocalRuntimeScanResult, String> {
    let base_url = request
        .base_url
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "http://localhost:11434".to_string());
    ensure_local_endpoint(&base_url)?;
    scan_ollama_endpoint(&base_url)
}

#[tauri::command]
pub fn scan_lmstudio_runtime(
    request: RuntimeScanRequest,
) -> Result<LocalRuntimeScanResult, String> {
    let candidates =
        if let Some(base_url) = request.base_url.filter(|value| !value.trim().is_empty()) {
            vec![base_url]
        } else {
            vec![
                "http://localhost:1234".to_string(),
                "http://127.0.0.1:1234".to_string(),
            ]
        };
    for candidate in candidates {
        ensure_local_endpoint(&candidate)?;
        let result = scan_lmstudio_endpoint(&candidate)?;
        if result.reachable {
            return Ok(result);
        }
    }
    Ok(LocalRuntimeScanResult {
        runtime: "lmstudio".to_string(),
        endpoint: Some("http://localhost:1234".to_string()),
        reachable: false,
        models: Vec::new(),
        warnings: vec!["Open LM Studio -> Developer / Local Server -> Start Server".to_string()],
    })
}

#[tauri::command]
pub fn scan_comfy_runtime(request: RuntimeScanRequest) -> Result<ComfyScanResult, String> {
    scan_comfy_paths_and_endpoint(request)
}

fn create_model_provider_update_plan_with_connection(
    connection: &rusqlite::Connection,
    request: ModelProviderUpdateRequest,
) -> Result<ModelProviderUpdatePlan, String> {
    reject_secret_values_in_update(&request)?;
    let agent = find_agent(connection, &request.agent_id)?;
    let target = resolve_config_target(&agent)?;
    let current = read_current_file(&target)?;
    let (new_content, config_warnings) = patch_config_content(&target, &current, &request, &agent)?;
    let new_hash = content_hash(&new_content);
    let new_provider_summary = ProviderSummary {
        provider: request
            .provider_name
            .clone()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| Some(request.kind.as_str().to_string())),
        base_url: clean_optional(request.base_url.clone()),
        secret_fields: agent.provider_summary.secret_fields.clone(),
        missing_secret_fields: Vec::new(),
    };
    let new_model_summary = ModelSummary {
        default_model: clean_optional(request.default_model.clone()),
        fallback_model: clean_optional(request.fallback_model.clone()),
    };
    let provider_after = ProviderProfile {
        id: request
            .provider_id
            .clone()
            .unwrap_or_else(|| format!("agent:{}", agent.id)),
        name: request
            .provider_name
            .clone()
            .unwrap_or_else(|| request.kind.as_str().to_string()),
        kind: request.kind.clone(),
        base_url: clean_optional(request.base_url.clone()),
        api_key_ref: clean_optional(request.api_key_ref.clone()),
        default_model: clean_optional(request.default_model.clone()),
        fallback_model: clean_optional(request.fallback_model.clone()),
        validation_json: "{}".to_string(),
        updated_at: now_millis(),
    };
    let effective_before = resolve_effective_model(&agent.model_summary, None, &None);
    let effective_after = resolve_effective_model(&new_model_summary, Some(&provider_after), &None);
    let mut warnings =
        vec![
        format!("Target agent/profile: {} ({})", agent.name, agent.runtime.as_str()),
        format!("Target file: {}", target.display()),
        "Backup will be created before atomic write.".to_string(),
        "Only provider/model metadata and apiKeyRef are written; secret values are not accepted."
            .to_string(),
        "Global/default config is not modified.".to_string(),
        "Other agents/profiles are not modified.".to_string(),
    ];
    warnings.extend(config_warnings);
    if effective_after.may_call_remote_api {
        warnings.push(
            "Selected effective model may call a remote API and may create cost.".to_string(),
        );
    }
    let affects_only_selected = !is_runtime_root_or_container(&agent.root_path)
        && target.starts_with(&agent.root_path);
    Ok(ModelProviderUpdatePlan {
        agent_id: agent.id,
        runtime: agent.runtime,
        target_files: vec![target],
        old_provider_summary: agent.provider_summary,
        new_provider_summary,
        old_model_summary: agent.model_summary,
        new_model_summary,
        old_hash: current.hash,
        new_hash,
        unified_diff: unified_diff("model-provider-config", &current.content, &new_content),
        warnings,
        backup_will_be_created: true,
        affects_only_selected_agent_profile: affects_only_selected,
        effective_model_before: effective_before,
        effective_model_after: effective_after,
    })
}

fn apply_model_provider_update_with_connection(
    connection: &rusqlite::Connection,
    home_dir: &Path,
    request: ApplyModelProviderUpdateRequest,
) -> Result<ModelProviderUpdateResult, String> {
    let plan =
        create_model_provider_update_plan_with_connection(connection, request.update.clone())?;
    if !plan.affects_only_selected_agent_profile || !plan.backup_will_be_created {
        return Err("Provider/model update is blocked by the safety plan.".to_string());
    }
    if plan.old_hash != request.expected_hash {
        return Err("Stale config: re-generate the provider/model diff before saving.".to_string());
    }
    if plan.old_hash == plan.new_hash {
        return Err("No provider/model changes to apply.".to_string());
    }
    let agent = find_agent(connection, &request.update.agent_id)?;
    let target = plan
        .target_files
        .first()
        .cloned()
        .ok_or_else(|| "Provider/model plan has no target file.".to_string())?;
    let current = read_current_file(&target)?;
    if current.hash != plan.old_hash {
        return Err("Stale config: target file changed since the plan was generated.".to_string());
    }
    let (new_content, _) = patch_config_content(&target, &current, &request.update, &agent)?;
    let backup = create_model_provider_backup_record(
        home_dir,
        &agent,
        &target,
        &current.hash,
        &content_hash(&new_content),
    )?;
    write_config_backup_payload(
        &backup.backup_path,
        &target,
        current.exists,
        &current.content,
    )?;
    atomic_write(&target, new_content.as_bytes())?;
    insert_backup_record(connection, &backup, "model_provider_update")
        .map_err(|error| error.to_string())?;

    let profile = ProviderProfile {
        id: request
            .update
            .provider_id
            .clone()
            .unwrap_or_else(|| format!("agent:{}", agent.id)),
        name: request
            .update
            .provider_name
            .clone()
            .unwrap_or_else(|| request.update.kind.as_str().to_string()),
        kind: request.update.kind.clone(),
        base_url: clean_optional(request.update.base_url.clone()),
        api_key_ref: clean_optional(request.update.api_key_ref.clone()),
        default_model: clean_optional(request.update.default_model.clone()),
        fallback_model: clean_optional(request.update.fallback_model.clone()),
        validation_json: "{}".to_string(),
        updated_at: now_millis(),
    };
    upsert_provider_profile(connection, &profile).map_err(|error| error.to_string())?;
    let scan_result = crate::scanner::scan_selected_root(agent.runtime, agent.root_path.clone())
        .map_err(|error| error.to_string())?;
    upsert_agent_records(connection, &scan_result).map_err(|error| error.to_string())?;
    Ok(ModelProviderUpdateResult {
        agent_id: agent.id,
        runtime: agent.runtime,
        target_path: target,
        backup_path: backup.backup_path,
        old_hash: current.hash,
        new_hash: content_hash(&new_content),
        scan_result,
    })
}

fn provider_profile_from_input(input: ProviderProfileInput) -> Result<ProviderProfile, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Provider profile name is required.".to_string());
    }
    if input
        .api_key_ref
        .as_deref()
        .map(looks_like_secret_value)
        .unwrap_or(false)
    {
        return Err("apiKeyRef must be a reference name, not a secret value.".to_string());
    }
    Ok(ProviderProfile {
        id: input
            .id
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| format!("provider:{}", stable_slug(name))),
        name: name.to_string(),
        kind: input.kind,
        base_url: clean_optional(input.base_url),
        api_key_ref: clean_optional(input.api_key_ref),
        default_model: clean_optional(input.default_model),
        fallback_model: clean_optional(input.fallback_model),
        validation_json: input.validation_json.unwrap_or_else(|| "{}".to_string()),
        updated_at: now_millis(),
    })
}

fn resolve_effective_model(
    agent_model: &ModelSummary,
    provider: Option<&ProviderProfile>,
    raw_provider_input: &Option<ProviderProfileInput>,
) -> EffectiveModelPreview {
    let provider_kind = provider
        .map(|value| value.kind.clone())
        .or_else(|| raw_provider_input.as_ref().map(|value| value.kind.clone()));
    let provider_default = provider.and_then(|value| value.default_model.clone());
    let provider_fallback = provider.and_then(|value| value.fallback_model.clone());
    let remote = provider_kind
        .as_ref()
        .map(|kind| matches!(kind, ProviderKind::OpenAiCompatible | ProviderKind::Custom))
        .unwrap_or(true);
    let capability_only = provider_kind
        .as_ref()
        .map(|kind| matches!(kind, ProviderKind::Comfyui))
        .unwrap_or(false);
    let mut candidates = vec![
        (
            "Agent default model",
            agent_model.default_model.clone(),
            "Agent-scoped default model is set.",
        ),
        (
            "Agent fallback model",
            agent_model.fallback_model.clone(),
            "Agent-scoped fallback model is used because no default model is set.",
        ),
        (
            "Runtime/global default",
            provider_default,
            "Runtime/global default is not read globally; provider default metadata is used only when supplied for this profile.",
        ),
        (
            "Provider fallback",
            provider_fallback,
            "Provider fallback is the last configured model fallback for this provider profile.",
        ),
    ];
    if capability_only {
        candidates
            .iter_mut()
            .for_each(|candidate| candidate.1 = None);
    }
    let active_index = candidates.iter().position(|(_, model, _)| {
        model
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
    });
    let mut steps = Vec::new();
    for (index, (label, model, reason)) in candidates.into_iter().enumerate() {
        let active = active_index == Some(index);
        steps.push(EffectiveModelStep {
            label: label.to_string(),
            model,
            active,
            reason: reason.to_string(),
            local_only: !remote && !capability_only,
            may_call_remote_api: remote && active,
            may_create_cost: remote && active,
        });
    }
    let effective_model = active_index.and_then(|index| steps[index].model.clone());
    let mut warnings = Vec::new();
    if capability_only {
        warnings.push(
            "ComfyUI is a visual/capability provider and is not treated as a default chat LLM."
                .to_string(),
        );
    } else if remote && effective_model.is_some() {
        warnings.push("Remote provider fallback may have privacy and cost impact.".to_string());
    }
    let source = active_index
        .map(|index| steps[index].label.clone())
        .unwrap_or_else(|| "No model configured".to_string());
    EffectiveModelPreview {
        effective_model: effective_model.clone(),
        source: source.clone(),
        explanation: effective_model
            .as_ref()
            .map(|model| format!("{model} is effective because {source} has the first configured model in the resolution order."))
            .unwrap_or_else(|| "No effective chat model is configured for this agent/profile.".to_string()),
        local_only: !remote && effective_model.is_some(),
        may_call_remote_api: remote && effective_model.is_some(),
        may_create_cost: remote && effective_model.is_some(),
        steps,
        warnings,
    }
}

fn validate_openai_provider_request(
    request: OpenAiValidationRequest,
) -> Result<ProviderValidationReport, String> {
    if request.kind == ProviderKind::Comfyui {
        return Err("ComfyUI is not an OpenAI-compatible chat provider unless a bridge endpoint is configured.".to_string());
    }
    let base_url = normalize_base_url(&request.base_url)?;
    let api_key_reference_status = match request.api_key_ref.as_deref().map(str::trim) {
        Some(value) if looks_like_secret_value(value) => {
            return Err("apiKeyRef must be a reference name, not a secret value.".to_string())
        }
        Some(value) if !value.is_empty() => {
            if std::env::var_os(value).is_some() {
                "reference exists in environment".to_string()
            } else {
                "reference not found in environment; secret value was not read".to_string()
            }
        }
        _ => "no apiKeyRef supplied".to_string(),
    };
    let mut report = ProviderValidationReport {
        base_url_valid: true,
        api_key_reference_status,
        connection_status: "not tested".to_string(),
        auth_status: "not tested; secret values are never read by AgentDock".to_string(),
        model_list_status: "not tested".to_string(),
        generation_status: "not requested".to_string(),
        models: Vec::new(),
        warnings: Vec::new(),
    };
    let client = http_client()?;
    let models_url = openai_models_url(&base_url);
    match client.get(&models_url).send() {
        Ok(response) => {
            report.connection_status = "connected".to_string();
            if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
                report.auth_status = "auth failure".to_string();
                report.model_list_status = "model list blocked by auth".to_string();
            } else if response.status().is_success() {
                report.auth_status = "not required or accepted without visible secret".to_string();
                let body: Value = response.json().unwrap_or_else(|_| json!({}));
                report.models = extract_openai_models(&body);
                report.model_list_status = if report.models.is_empty() {
                    "model list response had no model ids".to_string()
                } else {
                    "models listed".to_string()
                };
                if let Some(model) = request
                    .model
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                {
                    if !report.models.is_empty()
                        && !report.models.iter().any(|value| value == model)
                    {
                        report
                            .warnings
                            .push(format!("Unknown model id for listed models: {model}"));
                    }
                }
            } else {
                report.model_list_status =
                    format!("model list failure: HTTP {}", response.status());
            }
        }
        Err(error) => {
            report.connection_status = format!("connection failure: {error}");
            report.model_list_status = "not tested due to connection failure".to_string();
        }
    }
    if request.include_test_request {
        let Some(model) = request.model.filter(|value| !value.trim().is_empty()) else {
            report.generation_status = "generation skipped: model id required".to_string();
            return Ok(report);
        };
        let generation_url = openai_chat_completions_url(&base_url);
        let payload = json!({
            "model": model,
            "messages": [{"role": "user", "content": "AgentDock connectivity check"}],
            "max_tokens": 1
        });
        match client.post(&generation_url).json(&payload).send() {
            Ok(response) if response.status().is_success() => {
                report.generation_status = "generation endpoint responded".to_string();
            }
            Ok(response)
                if response.status().as_u16() == 401 || response.status().as_u16() == 403 =>
            {
                report.generation_status = "auth failure".to_string();
            }
            Ok(response) => {
                report.generation_status =
                    format!("generation failure: HTTP {}", response.status());
            }
            Err(error) => {
                report.generation_status = format!("generation failure: {error}");
            }
        }
    }
    Ok(report)
}

fn scan_ollama_endpoint(base_url: &str) -> Result<LocalRuntimeScanResult, String> {
    let client = http_client()?;
    let endpoint = format!("{}/api/tags", base_url.trim_end_matches('/'));
    match client.get(&endpoint).send() {
        Ok(response) if response.status().is_success() => {
            let body: Value = response.json().unwrap_or_else(|_| json!({}));
            let models = body
                .get("models")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|item| {
                    Some(RuntimeModel {
                        name: item.get("name")?.as_str()?.to_string(),
                        modified: item
                            .get("modified_at")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        size: item.get("size").and_then(Value::as_u64),
                    })
                })
                .collect();
            Ok(LocalRuntimeScanResult {
                runtime: "ollama".to_string(),
                endpoint: Some(base_url.to_string()),
                reachable: true,
                models,
                warnings: Vec::new(),
            })
        }
        Ok(response) => Ok(LocalRuntimeScanResult {
            runtime: "ollama".to_string(),
            endpoint: Some(base_url.to_string()),
            reachable: false,
            models: Vec::new(),
            warnings: vec![format!(
                "Ollama /api/tags failed: HTTP {}",
                response.status()
            )],
        }),
        Err(error) => Ok(LocalRuntimeScanResult {
            runtime: "ollama".to_string(),
            endpoint: Some(base_url.to_string()),
            reachable: false,
            models: Vec::new(),
            warnings: vec![format!("Ollama is not reachable: {error}")],
        }),
    }
}

fn scan_lmstudio_endpoint(base_url: &str) -> Result<LocalRuntimeScanResult, String> {
    let client = http_client()?;
    let endpoint = openai_models_url(base_url);
    match client.get(&endpoint).send() {
        Ok(response) if response.status().is_success() => {
            let body: Value = response.json().unwrap_or_else(|_| json!({}));
            let models = extract_openai_models(&body)
                .into_iter()
                .map(|name| RuntimeModel {
                    name,
                    modified: None,
                    size: None,
                })
                .collect();
            Ok(LocalRuntimeScanResult {
                runtime: "lmstudio".to_string(),
                endpoint: Some(base_url.to_string()),
                reachable: true,
                models,
                warnings: Vec::new(),
            })
        }
        Ok(response) => Ok(LocalRuntimeScanResult {
            runtime: "lmstudio".to_string(),
            endpoint: Some(base_url.to_string()),
            reachable: false,
            models: Vec::new(),
            warnings: vec![
                format!("LM Studio /v1/models failed: HTTP {}", response.status()),
                "Open LM Studio -> Developer / Local Server -> Start Server".to_string(),
            ],
        }),
        Err(error) => Ok(LocalRuntimeScanResult {
            runtime: "lmstudio".to_string(),
            endpoint: Some(base_url.to_string()),
            reachable: false,
            models: Vec::new(),
            warnings: vec![
                format!("LM Studio is not reachable: {error}"),
                "Open LM Studio -> Developer / Local Server -> Start Server".to_string(),
            ],
        }),
    }
}

fn scan_comfy_paths_and_endpoint(request: RuntimeScanRequest) -> Result<ComfyScanResult, String> {
    let mut candidates = comfy_default_paths();
    if let Some(path) = request.custom_path.filter(|value| !value.trim().is_empty()) {
        candidates.insert(0, expand_tilde(&path));
    }
    let detected_paths = candidates
        .into_iter()
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    let mut capability_folders = Vec::new();
    for root in &detected_paths {
        for folder in [
            "checkpoints",
            "vae",
            "loras",
            "controlnet",
            "upscale_models",
            "embeddings",
        ] {
            let path = root.join("models").join(folder);
            if path.is_dir() {
                capability_folders.push(ComfyCapabilityFolder {
                    kind: folder.to_string(),
                    path: path.clone(),
                    models: list_direct_model_files(&path),
                });
            }
        }
    }
    let mut endpoint_reachable = false;
    let endpoint = request
        .base_url
        .filter(|value| !value.trim().is_empty())
        .or_else(|| Some("http://localhost:8188".to_string()));
    let mut warnings = vec![
        "ComfyUI is a capability provider, not a default chat LLM provider.".to_string(),
        "AgentDock does not execute Comfy workflows or upload files during scan.".to_string(),
    ];
    if let Some(endpoint_value) = endpoint.as_ref() {
        ensure_local_endpoint(endpoint_value)?;
        let client = http_client()?;
        match client
            .get(format!(
                "{}/system_stats",
                endpoint_value.trim_end_matches('/')
            ))
            .send()
        {
            Ok(response) if response.status().is_success() => endpoint_reachable = true,
            Ok(response) => warnings.push(format!(
                "ComfyUI endpoint did not respond successfully: HTTP {}",
                response.status()
            )),
            Err(error) => warnings.push(format!("ComfyUI endpoint is not reachable: {error}")),
        }
    }
    Ok(ComfyScanResult {
        provider_kind: "comfyui".to_string(),
        is_chat_llm_provider: false,
        detected_paths,
        capability_folders,
        endpoint,
        endpoint_reachable,
        warnings,
    })
}

fn patch_config_content(
    target: &Path,
    current: &CurrentFile,
    request: &ModelProviderUpdateRequest,
    agent: &AgentScanRecord,
) -> Result<(String, Vec<String>), String> {
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("json")
        .to_ascii_lowercase();
    let mut warnings = Vec::new();
    if request.kind == ProviderKind::Comfyui {
        warnings.push(
            "ComfyUI will be saved as capability metadata; it is not a chat default model provider."
                .to_string(),
        );
    }
    if !current.exists || extension == "json" {
        let mut value = if current.exists {
            serde_json::from_str::<Value>(&current.content)
                .map_err(|_| "Unsupported config: JSON root could not be parsed.".to_string())?
        } else {
            json!({ "name": agent.name })
        };
        apply_json_model_provider_fields(&mut value, request)?;
        return serde_json::to_string_pretty(&value)
            .map(|content| (format!("{content}\n"), warnings))
            .map_err(|error| error.to_string());
    }
    if extension == "yaml" || extension == "yml" {
        let mut value: Value = serde_yaml::from_str(&current.content)
            .map_err(|_| "Unsupported config: YAML root could not be parsed.".to_string())?;
        apply_json_model_provider_fields(&mut value, request)?;
        return serde_yaml::to_string(&value)
            .map(|content| (content, warnings))
            .map_err(|error| error.to_string());
    }
    if extension == "toml" {
        let mut value: toml::Value = toml::from_str(&current.content)
            .map_err(|_| "Unsupported config: TOML root could not be parsed.".to_string())?;
        apply_toml_model_provider_fields(&mut value, request)?;
        return Ok((
            toml::to_string_pretty(&value).map_err(|error| error.to_string())?,
            warnings,
        ));
    }
    Err(
        "Unsupported config format for provider/model mutation. Open the file manually."
            .to_string(),
    )
}

fn apply_json_model_provider_fields(
    value: &mut Value,
    request: &ModelProviderUpdateRequest,
) -> Result<(), String> {
    let object = value
        .as_object_mut()
        .ok_or_else(|| "Unsupported config: root is not an object.".to_string())?;
    set_json_optional(object, "provider", Some(request.kind.as_str().to_string()));
    set_json_optional(object, "base_url", clean_optional(request.base_url.clone()));
    set_json_optional(
        object,
        "api_key_ref",
        clean_optional(request.api_key_ref.clone()),
    );
    set_json_optional(
        object,
        "default_model",
        clean_optional(request.default_model.clone()),
    );
    set_json_optional(
        object,
        "fallback_model",
        clean_optional(request.fallback_model.clone()),
    );
    object.remove("api_key");
    object.remove("apikey");
    Ok(())
}

fn apply_toml_model_provider_fields(
    value: &mut toml::Value,
    request: &ModelProviderUpdateRequest,
) -> Result<(), String> {
    let table = value
        .as_table_mut()
        .ok_or_else(|| "Unsupported config: TOML root is not a table.".to_string())?;
    set_toml_optional(table, "provider", Some(request.kind.as_str().to_string()));
    set_toml_optional(table, "base_url", clean_optional(request.base_url.clone()));
    set_toml_optional(
        table,
        "api_key_ref",
        clean_optional(request.api_key_ref.clone()),
    );
    set_toml_optional(
        table,
        "default_model",
        clean_optional(request.default_model.clone()),
    );
    set_toml_optional(
        table,
        "fallback_model",
        clean_optional(request.fallback_model.clone()),
    );
    table.remove("api_key");
    table.remove("apikey");
    Ok(())
}

fn set_json_optional(
    object: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<String>,
) {
    if let Some(value) = value {
        object.insert(key.to_string(), Value::String(value));
    } else {
        object.remove(key);
    }
}

fn set_toml_optional(
    table: &mut toml::map::Map<String, toml::Value>,
    key: &str,
    value: Option<String>,
) {
    if let Some(value) = value {
        table.insert(key.to_string(), toml::Value::String(value));
    } else {
        table.remove(key);
    }
}

const MAIN_CONFIG_FILE_NAMES: &[&str] = &[
    "config.json",
    "config.yaml",
    "config.yml",
    "config.toml",
    "profile.json",
    "profile.yaml",
    "profile.yml",
    "profile.toml",
];

fn is_runtime_root_or_container(root_path: &Path) -> bool {
    let Some(home) = dirs::home_dir() else {
        return false;
    };
    let blocked = [
        home.join(".openclaw"),
        home.join(".hermes"),
        home.join(".openclaw").join("agents"),
        home.join(".hermes").join("profiles"),
    ];
    let canonical = match fs::canonicalize(root_path) {
        Ok(c) => c,
        Err(_) => {
            for blocked_path in &blocked {
                if root_path == blocked_path {
                    return true;
                }
            }
            return false;
        }
    };
    for blocked_path in &blocked {
        if let Ok(blocked_canonical) = fs::canonicalize(blocked_path) {
            if canonical == blocked_canonical {
                return true;
            }
        } else if root_path == blocked_path {
            return true;
        }
    }
    false
}

fn is_main_config_in_root(path: &Path, root: &Path) -> bool {
    let file_name = match path.file_name().and_then(|n| n.to_str()) {
        Some(name) => name,
        None => return false,
    };
    if !MAIN_CONFIG_FILE_NAMES.contains(&file_name) {
        return false;
    }
    let parent = match path.parent() {
        Some(p) => p,
        None => return false,
    };
    let canonical_root = fs::canonicalize(root).ok();
    let canonical_parent = fs::canonicalize(parent).ok();
    match (canonical_root, canonical_parent) {
        (Some(r), Some(p)) => p == r,
        _ => parent == root,
    }
}

fn resolve_config_target(agent: &AgentScanRecord) -> Result<PathBuf, String> {
    if is_private_runtime_dir(&agent.root_path) {
        return Err("Agent root is private runtime data and cannot be edited.".to_string());
    }
    if is_runtime_root_or_container(&agent.root_path) {
        return Err(
            "Runtime root/global/container directories are not writable targets for provider/model updates."
                .to_string(),
        );
    }
    let root = fs::canonicalize(&agent.root_path)
        .map_err(|_| "Agent root is not accessible. Re-scan before editing.".to_string())?;
    let main_configs: Vec<PathBuf> = agent
        .config_paths
        .iter()
        .filter(|path| is_main_config_in_root(path, &agent.root_path))
        .cloned()
        .collect();
    if main_configs.len() > 1 {
        let names: Vec<String> = main_configs
            .iter()
            .filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(String::from))
            .collect();
        return Err(format!(
            "Ambiguous main config files in agent root: {}. Please keep only one main config file (config.json, config.yaml, config.yml, config.toml, profile.json, profile.yaml, profile.yml, or profile.toml).",
            names.join(", ")
        ));
    }
    let target = if let Some(config) = main_configs.into_iter().next() {
        config
    } else {
        let default_name = match agent.runtime {
            AgentRuntime::OpenClaw => "config.json",
            AgentRuntime::Hermes => "config.yaml",
        };
        agent.root_path.join(default_name)
    };
    let parent = target
        .parent()
        .ok_or_else(|| "Provider/model target has no parent directory.".to_string())?;
    let parent = fs::canonicalize(parent)
        .map_err(|_| "Provider/model target parent is not accessible.".to_string())?;
    if !parent.starts_with(&root) {
        return Err("Provider/model target must stay inside the agent/profile root.".to_string());
    }
    if target.exists() {
        let canonical_target = fs::canonicalize(&target)
            .map_err(|_| "Provider/model target is not accessible.".to_string())?;
        if !canonical_target.starts_with(&root) {
            return Err(
                "Provider/model target resolves outside the agent/profile root.".to_string(),
            );
        }
    }
    Ok(target)
}

struct CurrentFile {
    exists: bool,
    content: String,
    hash: String,
}

fn read_current_file(path: &Path) -> Result<CurrentFile, String> {
    if !path.exists() {
        return Ok(CurrentFile {
            exists: false,
            content: String::new(),
            hash: MISSING_HASH.to_string(),
        });
    }
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(CurrentFile {
        exists: true,
        hash: content_hash(&content),
        content,
    })
}

fn reject_secret_values_in_update(request: &ModelProviderUpdateRequest) -> Result<(), String> {
    for (label, value) in [
        ("apiKeyRef", request.api_key_ref.as_deref()),
        ("baseUrl", request.base_url.as_deref()),
        ("defaultModel", request.default_model.as_deref()),
        ("fallbackModel", request.fallback_model.as_deref()),
    ] {
        if value.map(looks_like_secret_value).unwrap_or(false) {
            return Err(format!(
                "{label} appears to contain a secret value and cannot be saved."
            ));
        }
    }
    Ok(())
}

fn looks_like_secret_value(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("sk-")
        || lower.starts_with("sk_")
        || lower.contains("bearer ")
        || lower.contains("api_key=")
        || lower.contains("token=")
}

fn find_agent(
    connection: &rusqlite::Connection,
    agent_id: &str,
) -> Result<AgentScanRecord, String> {
    load_agent_records(connection)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|agent| agent.id == agent_id)
        .ok_or_else(|| "Agent is not indexed. Re-scan the runtime root first.".to_string())
}

fn create_model_provider_backup_record(
    home_dir: &Path,
    agent: &AgentScanRecord,
    target: &Path,
    before_hash: &str,
    after_hash: &str,
) -> Result<BackupRecord, String> {
    let created_at = now_millis();
    let agent_slug = stable_slug(&agent.id);
    let backup_id = format!(
        "{}:{}:{}:{}",
        agent.runtime.as_str(),
        agent_slug,
        created_at,
        MODEL_PROVIDER_FILE_KIND
    );
    let backup_path = home_dir
        .join(".agentdock")
        .join("backups")
        .join(agent.runtime.as_str())
        .join(agent_slug)
        .join(&created_at);
    Ok(BackupRecord {
        backup_id,
        agent_id: agent.id.clone(),
        runtime: agent.runtime,
        file_kind: MODEL_PROVIDER_FILE_KIND.to_string(),
        original_path: target.to_path_buf(),
        backup_path,
        created_at,
        content_hash_before: before_hash.to_string(),
        content_hash_after: after_hash.to_string(),
    })
}

fn write_config_backup_payload(
    backup_dir: &Path,
    target: &Path,
    existed: bool,
    content: &str,
) -> Result<(), String> {
    fs::create_dir_all(backup_dir).map_err(|error| error.to_string())?;
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("config");
    let manifest = json!({
        "fileKind": MODEL_PROVIDER_FILE_KIND,
        "existed": existed,
        "originalFileName": file_name,
    });
    atomic_write(
        &backup_dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest)
            .map_err(|error| error.to_string())?
            .as_bytes(),
    )?;
    if existed {
        atomic_write(&backup_dir.join(file_name), content.as_bytes())?;
    }
    Ok(())
}

fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Atomic write target has no parent directory.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp_path = parent.join(format!(
        ".agentdock.tmp.{}.{}",
        std::process::id(),
        now_millis()
    ));
    {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(|error| error.to_string())?;
        file.write_all(content).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    fs::rename(&temp_path, path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        error.to_string()
    })?;
    if let Ok(directory) = fs::File::open(parent) {
        let _ = directory.sync_all();
    }
    Ok(())
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| error.to_string())
}

fn normalize_base_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Base URL is required.".to_string());
    }
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("Base URL must start with http:// or https://.".to_string());
    }
    Ok(trimmed.to_string())
}

fn openai_models_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    }
}

fn openai_chat_completions_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    if base.ends_with("/v1") {
        format!("{base}/chat/completions")
    } else {
        format!("{base}/v1/chat/completions")
    }
}

fn extract_openai_models(body: &Value) -> Vec<String> {
    body.get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_string))
        .collect()
}

fn ensure_local_endpoint(base_url: &str) -> Result<(), String> {
    let normalized = normalize_base_url(base_url)?;
    let without_scheme = normalized
        .strip_prefix("http://")
        .or_else(|| normalized.strip_prefix("https://"))
        .unwrap_or(&normalized);
    let host = without_scheme
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    let is_local_host = matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]");
    let is_loopback_ip = host
        .parse::<IpAddr>()
        .map(|ip| ip.is_loopback())
        .unwrap_or(false);
    if is_local_host || is_loopback_ip {
        Ok(())
    } else {
        Err("Local runtime scanners only allow localhost or loopback endpoints.".to_string())
    }
}

fn comfy_default_paths() -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    vec![
        home.join("ComfyUI"),
        home.join("Documents").join("ComfyUI"),
        home.join("Applications").join("ComfyUI"),
    ]
}

fn list_direct_model_files(path: &Path) -> Vec<String> {
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter_map(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(str::to_string)
        })
        .collect()
}

fn expand_tilde(path: &str) -> PathBuf {
    if path == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from(path));
    }
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn unified_diff(file_name: &str, old_content: &str, new_content: &str) -> String {
    TextDiff::from_lines(old_content, new_content)
        .unified_diff()
        .header(&format!("a/{file_name}"), &format!("b/{file_name}"))
        .to_string()
}

fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}

fn stable_slug(value: &str) -> String {
    let hash = content_hash(value).replace("sha256:", "");
    let mut slug = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    slug.truncate(80);
    format!("{slug}-{}", &hash[..12])
}

fn now_millis() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    use tempfile::tempdir;

    use super::*;
    use crate::db::{open_database_in, upsert_agent_records};
    use crate::scanner::types::{ChannelSummary, HealthStatus};

    fn test_agent(root: &Path) -> AgentScanRecord {
        AgentScanRecord {
            id: format!("openclaw:{}", root.display()),
            runtime: AgentRuntime::OpenClaw,
            name: "Provider Test Agent".to_string(),
            root_path: root.to_path_buf(),
            config_paths: vec![root.join("config.json")],
            personality_files: Vec::new(),
            skill_paths: Vec::new(),
            provider_summary: ProviderSummary::default(),
            model_summary: ModelSummary::default(),
            channel_summary: ChannelSummary::default(),
            warnings: Vec::new(),
            health_status: HealthStatus::Warning,
            last_scanned_at: "1".to_string(),
        }
    }

    fn model_update(root: &Path) -> ModelProviderUpdateRequest {
        ModelProviderUpdateRequest {
            agent_id: format!("openclaw:{}", root.display()),
            provider_id: Some("provider:test".to_string()),
            provider_name: Some("Test Provider".to_string()),
            kind: ProviderKind::OpenAiCompatible,
            base_url: Some("http://localhost:9999/v1".to_string()),
            api_key_ref: Some("AGENTDOCK_TEST_KEY".to_string()),
            default_model: Some("gpt-test".to_string()),
            fallback_model: Some("gpt-fallback".to_string()),
        }
    }

    #[test]
    fn effective_model_prefers_agent_default() {
        let preview = resolve_effective_model(
            &ModelSummary {
                default_model: Some("agent-default".to_string()),
                fallback_model: Some("agent-fallback".to_string()),
            },
            None,
            &None,
        );

        assert_eq!(preview.effective_model.as_deref(), Some("agent-default"));
        assert_eq!(preview.source, "Agent default model");
    }

    #[test]
    fn provider_model_update_plan_diff_is_agent_scoped() {
        let home = tempdir().expect("home");
        let connection = open_database_in(home.path()).expect("db");
        let root = home.path().join("agentdock-provider-test");
        fs::create_dir_all(&root).expect("root");
        fs::write(
            root.join("config.json"),
            r#"{"name":"Provider Test Agent"}"#,
        )
        .expect("config");
        let agent = test_agent(&root);
        upsert_agent_records(&connection, &[agent]).expect("agent");

        let plan =
            create_model_provider_update_plan_with_connection(&connection, model_update(&root))
                .expect("plan");

        assert!(plan.affects_only_selected_agent_profile);
        assert!(plan.backup_will_be_created);
        assert!(plan.unified_diff.contains("gpt-test"));
        assert_eq!(plan.target_files, vec![root.join("config.json")]);
    }

    #[test]
    fn provider_model_apply_creates_backup_and_rejects_stale_hash() {
        let home = tempdir().expect("home");
        let connection = open_database_in(home.path()).expect("db");
        let root = home.path().join("agentdock-provider-test");
        fs::create_dir_all(&root).expect("root");
        fs::write(
            root.join("config.json"),
            r#"{"name":"Provider Test Agent"}"#,
        )
        .expect("config");
        let agent = test_agent(&root);
        upsert_agent_records(&connection, &[agent]).expect("agent");
        let plan =
            create_model_provider_update_plan_with_connection(&connection, model_update(&root))
                .expect("plan");

        let result = apply_model_provider_update_with_connection(
            &connection,
            home.path(),
            ApplyModelProviderUpdateRequest {
                update: model_update(&root),
                expected_hash: plan.old_hash.clone(),
            },
        )
        .expect("apply");

        assert!(result.backup_path.join("config.json").exists());
        assert!(fs::read_to_string(root.join("config.json"))
            .expect("updated config")
            .contains("gpt-test"));
        let stale = apply_model_provider_update_with_connection(
            &connection,
            home.path(),
            ApplyModelProviderUpdateRequest {
                update: model_update(&root),
                expected_hash: plan.old_hash,
            },
        )
        .expect_err("stale");
        assert!(stale.contains("Stale config"));
    }

    #[test]
    fn provider_model_update_does_not_accept_secret_value() {
        let home = tempdir().expect("home");
        let connection = open_database_in(home.path()).expect("db");
        let root = home.path().join("agentdock-provider-test");
        fs::create_dir_all(&root).expect("root");
        fs::write(root.join("config.json"), "{}").expect("config");
        upsert_agent_records(&connection, &[test_agent(&root)]).expect("agent");
        let mut request = model_update(&root);
        request.api_key_ref = Some("sk-test-secret".to_string());

        let error = create_model_provider_update_plan_with_connection(&connection, request)
            .expect_err("secret rejected");

        assert!(error.contains("secret value"));
    }

    #[test]
    fn openai_validation_reads_mock_models() {
        let url = mock_http_once("GET /v1/models", r#"{"data":[{"id":"gpt-mock"}]}"#, 200);

        let report = validate_openai_provider_request(OpenAiValidationRequest {
            kind: ProviderKind::OpenAiCompatible,
            base_url: url,
            api_key_ref: Some("AGENTDOCK_TEST_KEY".to_string()),
            model: Some("gpt-mock".to_string()),
            include_test_request: false,
        })
        .expect("validation");

        assert_eq!(report.connection_status, "connected");
        assert!(report.models.contains(&"gpt-mock".to_string()));
    }

    #[test]
    fn ollama_scanner_reads_mock_tags() {
        let url = mock_http_once(
            "GET /api/tags",
            r#"{"models":[{"name":"llama3.1","modified_at":"today","size":123}]}"#,
            200,
        );

        let result = scan_ollama_endpoint(&url).expect("ollama scan");

        assert!(result.reachable);
        assert_eq!(result.models[0].name, "llama3.1");
        assert_eq!(result.models[0].size, Some(123));
    }

    #[test]
    fn lmstudio_scanner_reads_mock_models() {
        let url = mock_http_once("GET /v1/models", r#"{"data":[{"id":"local-model"}]}"#, 200);

        let result = scan_lmstudio_endpoint(&url).expect("lmstudio scan");

        assert!(result.reachable);
        assert_eq!(result.models[0].name, "local-model");
    }

    #[test]
    fn comfy_scan_reads_capability_folders() {
        let root = tempdir().expect("comfy root");
        let checkpoints = root.path().join("models/checkpoints");
        fs::create_dir_all(&checkpoints).expect("folder");
        fs::write(checkpoints.join("model.safetensors"), "fixture").expect("model");

        let result = scan_comfy_paths_and_endpoint(RuntimeScanRequest {
            base_url: None,
            custom_path: Some(root.path().display().to_string()),
        })
        .expect("comfy scan");

        assert!(!result.is_chat_llm_provider);
        assert!(result
            .capability_folders
            .iter()
            .any(|folder| folder.kind == "checkpoints"));
    }

    fn mock_http_once(expected_path: &'static str, body: &'static str, status: u16) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock");
        let address = listener.local_addr().expect("addr");
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buffer = [0_u8; 1024];
            let read = stream.read(&mut buffer).expect("read");
            let request = String::from_utf8_lossy(&buffer[..read]);
            assert!(request.starts_with(expected_path), "{request}");
            let response = format!(
                "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).expect("write");
        });
        format!("http://{address}")
    }

    #[test]
    fn runtime_root_rejected_as_provider_model_target() {
        let real_home = dirs::home_dir().expect("home");
        let openclaw_root = real_home.join(".openclaw");
        let agent = AgentScanRecord {
            id: "openclaw:runtime-root".to_string(),
            runtime: AgentRuntime::OpenClaw,
            name: "Runtime Root".to_string(),
            root_path: openclaw_root.clone(),
            config_paths: vec![openclaw_root.join("config.json")],
            personality_files: Vec::new(),
            skill_paths: Vec::new(),
            provider_summary: ProviderSummary::default(),
            model_summary: ModelSummary::default(),
            channel_summary: ChannelSummary::default(),
            warnings: Vec::new(),
            health_status: HealthStatus::Warning,
            last_scanned_at: "1".to_string(),
        };
        let error = resolve_config_target(&agent).expect_err("runtime root blocked");
        assert!(
            error.contains("Runtime root/global/container"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn nested_skill_config_not_selected_as_provider_model_target() {
        let home = tempdir().expect("home");
        let root = home.path().join("my-agent");
        let skill_dir = root.join("skills").join("my-skill");
        fs::create_dir_all(&skill_dir).expect("skill dir");
        fs::write(root.join("config.json"), r#"{"name":"test"}"#).expect("root config");
        fs::write(skill_dir.join("config.json"), r#"{"name":"skill"}"#)
            .expect("skill config");
        let agent = AgentScanRecord {
            id: "openclaw:nested-test".to_string(),
            runtime: AgentRuntime::OpenClaw,
            name: "Nested Test".to_string(),
            root_path: root.clone(),
            config_paths: vec![
                root.join("config.json"),
                skill_dir.join("config.json"),
            ],
            personality_files: Vec::new(),
            skill_paths: Vec::new(),
            provider_summary: ProviderSummary::default(),
            model_summary: ModelSummary::default(),
            channel_summary: ChannelSummary::default(),
            warnings: Vec::new(),
            health_status: HealthStatus::Warning,
            last_scanned_at: "1".to_string(),
        };
        let target = resolve_config_target(&agent).expect("target resolved");
        assert_eq!(target, root.join("config.json"));
        assert_ne!(target, skill_dir.join("config.json"));
    }

    #[test]
    fn ambiguous_main_config_files_block_provider_model_update() {
        let home = tempdir().expect("home");
        let root = home.path().join("ambiguous-agent");
        fs::create_dir_all(&root).expect("root");
        fs::write(root.join("config.json"), r#"{"name":"test"}"#).expect("json config");
        fs::write(root.join("config.yaml"), "name: test\n").expect("yaml config");
        let agent = AgentScanRecord {
            id: "openclaw:ambiguous".to_string(),
            runtime: AgentRuntime::OpenClaw,
            name: "Ambiguous Agent".to_string(),
            root_path: root.clone(),
            config_paths: vec![root.join("config.json"), root.join("config.yaml")],
            personality_files: Vec::new(),
            skill_paths: Vec::new(),
            provider_summary: ProviderSummary::default(),
            model_summary: ModelSummary::default(),
            channel_summary: ChannelSummary::default(),
            warnings: Vec::new(),
            health_status: HealthStatus::Warning,
            last_scanned_at: "1".to_string(),
        };
        let error = resolve_config_target(&agent).expect_err("ambiguous blocked");
        assert!(
            error.contains("Ambiguous main config"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn provider_model_target_must_be_main_config_in_root() {
        let home = tempdir().expect("home");
        let root = home.path().join("valid-agent");
        fs::create_dir_all(&root).expect("root");
        fs::write(root.join("config.json"), r#"{"name":"valid"}"#).expect("config");
        let agent = AgentScanRecord {
            id: "openclaw:valid".to_string(),
            runtime: AgentRuntime::OpenClaw,
            name: "Valid Agent".to_string(),
            root_path: root.clone(),
            config_paths: vec![root.join("config.json")],
            personality_files: Vec::new(),
            skill_paths: Vec::new(),
            provider_summary: ProviderSummary::default(),
            model_summary: ModelSummary::default(),
            channel_summary: ChannelSummary::default(),
            warnings: Vec::new(),
            health_status: HealthStatus::Warning,
            last_scanned_at: "1".to_string(),
        };
        let target = resolve_config_target(&agent).expect("target resolved");
        assert_eq!(target, root.join("config.json"));
    }
}
