use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::db::{load_agent_records, open_database, upsert_agent_records};
use crate::scanner::types::{AgentRuntime, AgentScanRecord};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentRequest {
    pub name: String,
    pub target_root: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProfileRequest {
    pub name: String,
    pub target_root: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateRequest {
    pub source_agent_id: String,
    pub new_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteRequest {
    pub agent_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyLifecycleRequest {
    pub plan_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecyclePlan {
    pub plan_hash: String,
    pub operation: String,
    pub runtime: AgentRuntime,
    pub target_path: PathBuf,
    pub will_create_files: Vec<String>,
    pub will_backup: bool,
    pub backup_path: Option<PathBuf>,
    pub warnings: Vec<String>,
    pub blocked_reason: Option<String>,
    pub included_files: Vec<String>,
    pub skipped_items: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleResult {
    pub operation: String,
    pub runtime: AgentRuntime,
    pub target_path: PathBuf,
    pub backup_path: Option<PathBuf>,
    pub scan_result: Vec<AgentScanRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub trash_path: PathBuf,
    pub original_path: PathBuf,
    pub runtime: AgentRuntime,
    pub name: String,
    pub deleted_at: String,
    pub manifest: TrashManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashManifest {
    pub original_path: String,
    pub runtime: String,
    pub name: String,
    pub deleted_at: String,
}

const PRIVATE_DATA_DIRS: &[&str] = &[
    "sessions",
    "session",
    "history",
    "histories",
    "memory",
    "memories",
    "conversation",
    "conversations",
    "transcript",
    "transcripts",
    "logs",
    "cache",
    "tmp",
];

const PRIVATE_DATA_FILES: &[&str] = &[
    ".env",
    "credentials.json",
    "tokens.json",
    "secrets.json",
    "channel-secrets.json",
    "auth.json",
];

#[tauri::command]
pub fn create_agent_plan(request: CreateAgentRequest) -> Result<LifecyclePlan, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    validate_agent_name(&request.name)?;
    let target_path = match request.target_root {
        Some(ref root) => expand_tilde(root),
        None => home
            .join(".agentdock")
            .join("dev-sandbox")
            .join("openclaw")
            .join("agents")
            .join(&request.name),
    };
    if target_path.exists() {
        return Ok(LifecyclePlan {
            plan_hash: String::new(),
            operation: "create_agent".to_string(),
            runtime: AgentRuntime::OpenClaw,
            target_path: target_path.clone(),
            will_create_files: Vec::new(),
            will_backup: false,
            backup_path: None,
            warnings: Vec::new(),
            blocked_reason: Some(format!(
                "Target path already exists: {}",
                target_path.display()
            )),
            included_files: Vec::new(),
            skipped_items: Vec::new(),
        });
    }
    let will_create_files = vec![
        "config.json".to_string(),
        "SOUL.md".to_string(),
        "skills/".to_string(),
    ];
    let mut plan = LifecyclePlan {
        plan_hash: String::new(),
        operation: "create_agent".to_string(),
        runtime: AgentRuntime::OpenClaw,
        target_path: target_path.clone(),
        will_create_files,
        will_backup: false,
        backup_path: None,
        warnings: vec![
            format!("Will create agent '{}' at {}", request.name, target_path.display()),
            "A config.json with the agent name will be created.".to_string(),
            "An empty SOUL.md and skills/ directory will be created.".to_string(),
        ],
        blocked_reason: None,
        included_files: Vec::new(),
        skipped_items: Vec::new(),
    };
    plan.plan_hash = compute_plan_hash(&plan);
    Ok(plan)
}

#[tauri::command]
pub fn apply_create_agent(request: ApplyLifecycleRequest) -> Result<LifecycleResult, String> {
    let _home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    let connection = open_database().map_err(|error| error.to_string())?;
    let agents = load_agent_records(&connection).map_err(|error| error.to_string())?;
    let agent = find_agent_by_operation(&agents, "create_agent")?;
    let plan = create_agent_plan(CreateAgentRequest {
        name: agent.name.clone(),
        target_root: Some(agent.root_path.display().to_string()),
    })?;
    if plan.plan_hash != request.plan_hash {
        return Err("Stale plan: re-generate the lifecycle plan before applying.".to_string());
    }
    if plan.blocked_reason.is_some() {
        return Err(format!(
            "Plan is blocked: {}",
            plan.blocked_reason.unwrap()
        ));
    }
    fs::create_dir_all(&plan.target_path).map_err(|error| error.to_string())?;
    let config_content = format!(
        "{{\n  \"name\": \"{}\"\n}}\n",
        agent.name
    );
    atomic_write(
        &plan.target_path.join("config.json"),
        config_content.as_bytes(),
    )?;
    atomic_write(&plan.target_path.join("SOUL.md"), b"")?;
    fs::create_dir_all(plan.target_path.join("skills")).map_err(|error| error.to_string())?;
    let scan_result = crate::scanner::scan_selected_root(AgentRuntime::OpenClaw, plan.target_path.clone())
        .map_err(|error| error.to_string())?;
    upsert_agent_records(&connection, &scan_result).map_err(|error| error.to_string())?;
    Ok(LifecycleResult {
        operation: "create_agent".to_string(),
        runtime: AgentRuntime::OpenClaw,
        target_path: plan.target_path,
        backup_path: None,
        scan_result,
    })
}

#[tauri::command]
pub fn create_profile_plan(request: CreateProfileRequest) -> Result<LifecyclePlan, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    validate_agent_name(&request.name)?;
    let target_path = match request.target_root {
        Some(ref root) => expand_tilde(root),
        None => home
            .join(".agentdock")
            .join("dev-sandbox")
            .join("hermes")
            .join("profiles")
            .join(&request.name),
    };
    if target_path.exists() {
        return Ok(LifecyclePlan {
            plan_hash: String::new(),
            operation: "create_profile".to_string(),
            runtime: AgentRuntime::Hermes,
            target_path: target_path.clone(),
            will_create_files: Vec::new(),
            will_backup: false,
            backup_path: None,
            warnings: Vec::new(),
            blocked_reason: Some(format!(
                "Target path already exists: {}",
                target_path.display()
            )),
            included_files: Vec::new(),
            skipped_items: Vec::new(),
        });
    }
    let will_create_files = vec![
        "config.yaml".to_string(),
        "SOUL.md".to_string(),
        "skills/".to_string(),
    ];
    let mut plan = LifecyclePlan {
        plan_hash: String::new(),
        operation: "create_profile".to_string(),
        runtime: AgentRuntime::Hermes,
        target_path: target_path.clone(),
        will_create_files,
        will_backup: false,
        backup_path: None,
        warnings: vec![
            format!("Will create profile '{}' at {}", request.name, target_path.display()),
            "A config.yaml with the profile name will be created.".to_string(),
            "An empty SOUL.md and skills/ directory will be created.".to_string(),
        ],
        blocked_reason: None,
        included_files: Vec::new(),
        skipped_items: Vec::new(),
    };
    plan.plan_hash = compute_plan_hash(&plan);
    Ok(plan)
}

#[tauri::command]
pub fn apply_create_profile(request: ApplyLifecycleRequest) -> Result<LifecycleResult, String> {
    let _home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    let connection = open_database().map_err(|error| error.to_string())?;
    let agents = load_agent_records(&connection).map_err(|error| error.to_string())?;
    let agent = find_agent_by_operation(&agents, "create_profile")?;
    let plan = create_profile_plan(CreateProfileRequest {
        name: agent.name.clone(),
        target_root: Some(agent.root_path.display().to_string()),
    })?;
    if plan.plan_hash != request.plan_hash {
        return Err("Stale plan: re-generate the lifecycle plan before applying.".to_string());
    }
    if plan.blocked_reason.is_some() {
        return Err(format!(
            "Plan is blocked: {}",
            plan.blocked_reason.unwrap()
        ));
    }
    fs::create_dir_all(&plan.target_path).map_err(|error| error.to_string())?;
    let config_content = format!("name: \"{}\"\n", agent.name);
    atomic_write(
        &plan.target_path.join("config.yaml"),
        config_content.as_bytes(),
    )?;
    atomic_write(&plan.target_path.join("SOUL.md"), b"")?;
    fs::create_dir_all(plan.target_path.join("skills")).map_err(|error| error.to_string())?;
    let scan_result = crate::scanner::scan_selected_root(AgentRuntime::Hermes, plan.target_path.clone())
        .map_err(|error| error.to_string())?;
    upsert_agent_records(&connection, &scan_result).map_err(|error| error.to_string())?;
    Ok(LifecycleResult {
        operation: "create_profile".to_string(),
        runtime: AgentRuntime::Hermes,
        target_path: plan.target_path,
        backup_path: None,
        scan_result,
    })
}

#[tauri::command]
pub fn duplicate_agent_plan(request: DuplicateRequest) -> Result<LifecyclePlan, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    validate_agent_name(&request.new_name)?;
    let connection = open_database().map_err(|error| error.to_string())?;
    let source = find_agent_in_db(&connection, &request.source_agent_id)?;
    if is_runtime_root_or_container(&source.root_path) {
        return Ok(LifecyclePlan {
            plan_hash: String::new(),
            operation: "duplicate".to_string(),
            runtime: source.runtime,
            target_path: PathBuf::new(),
            will_create_files: Vec::new(),
            will_backup: false,
            backup_path: None,
            warnings: Vec::new(),
            blocked_reason: Some(
                "Cannot duplicate a runtime root/global/container record.".to_string(),
            ),
            included_files: Vec::new(),
            skipped_items: Vec::new(),
        });
    }
    let target_path = match source.runtime {
        AgentRuntime::OpenClaw => home
            .join(".agentdock")
            .join("dev-sandbox")
            .join("openclaw")
            .join("agents")
            .join(&request.new_name),
        AgentRuntime::Hermes => home
            .join(".agentdock")
            .join("dev-sandbox")
            .join("hermes")
            .join("profiles")
            .join(&request.new_name),
    };
    let mut included_files = Vec::new();
    let mut skipped_items = Vec::new();
    collect_duplicate_items(&source.root_path, &source.root_path, &mut included_files, &mut skipped_items);
    let will_backup = target_path.exists();
    let backup_path = if will_backup {
        Some(trash_base_dir(&home).join("duplicate-backups").join(format!(
            "{}-{}",
            request.new_name,
            now_millis()
        )))
    } else {
        None
    };
    let mut plan = LifecyclePlan {
        plan_hash: String::new(),
        operation: "duplicate".to_string(),
        runtime: source.runtime,
        target_path,
        will_create_files: included_files.clone(),
        will_backup,
        backup_path,
        warnings: vec![
            format!("Will duplicate '{}' as '{}'.", source.name, request.new_name),
            format!("Source: {}", source.root_path.display()),
        ],
        blocked_reason: None,
        included_files,
        skipped_items,
    };
    plan.plan_hash = compute_plan_hash(&plan);
    Ok(plan)
}

#[tauri::command]
pub fn apply_duplicate_agent(request: ApplyLifecycleRequest) -> Result<LifecycleResult, String> {
    let _home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    let connection = open_database().map_err(|error| error.to_string())?;
    let agents = load_agent_records(&connection).map_err(|error| error.to_string())?;
    let source = agents
        .iter()
        .find(|a| is_runtime_root_or_container(&a.root_path) == false)
        .ok_or_else(|| "No valid source agent found for duplicate.".to_string())?;
    let plan = duplicate_agent_plan(DuplicateRequest {
        source_agent_id: source.id.clone(),
        new_name: source.name.clone(),
    })?;
    if plan.plan_hash != request.plan_hash {
        return Err("Stale plan: re-generate the lifecycle plan before applying.".to_string());
    }
    if plan.blocked_reason.is_some() {
        return Err(format!("Plan is blocked: {}", plan.blocked_reason.unwrap()));
    }
    if plan.will_backup {
        if let Some(ref backup_path) = plan.backup_path {
            if source.root_path.exists() {
                copy_dir_recursive(&source.root_path, backup_path)
                    .map_err(|error| error.to_string())?;
            }
        }
    }
    fs::create_dir_all(&plan.target_path).map_err(|error| error.to_string())?;
    for relative in &plan.included_files {
        let src = source.root_path.join(relative);
        let dst = plan.target_path.join(relative);
        if src.is_file() {
            if let Some(parent) = dst.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::copy(&src, &dst).map_err(|error| error.to_string())?;
        } else if src.is_dir() {
            copy_dir_recursive(&src, &dst).map_err(|error| error.to_string())?;
        }
    }
    patch_config_name(&plan.target_path, source.runtime);
    let scan_result = crate::scanner::scan_selected_root(source.runtime, plan.target_path.clone())
        .map_err(|error| error.to_string())?;
    upsert_agent_records(&connection, &scan_result).map_err(|error| error.to_string())?;
    Ok(LifecycleResult {
        operation: "duplicate".to_string(),
        runtime: source.runtime,
        target_path: plan.target_path,
        backup_path: plan.backup_path,
        scan_result,
    })
}

#[tauri::command]
pub fn delete_agent_plan(request: DeleteRequest) -> Result<LifecyclePlan, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    let connection = open_database().map_err(|error| error.to_string())?;
    let agent = find_agent_in_db(&connection, &request.agent_id)?;
    if is_runtime_root_or_container(&agent.root_path) {
        return Ok(LifecyclePlan {
            plan_hash: String::new(),
            operation: "delete".to_string(),
            runtime: agent.runtime,
            target_path: agent.root_path.clone(),
            will_create_files: Vec::new(),
            will_backup: false,
            backup_path: None,
            warnings: Vec::new(),
            blocked_reason: Some(
                "Cannot delete a runtime root/global/container directory.".to_string(),
            ),
            included_files: Vec::new(),
            skipped_items: Vec::new(),
        });
    }
    let slug = stable_slug(&agent.id);
    let trash_dir = trash_base_dir(&home)
        .join(agent.runtime.as_str())
        .join(slug)
        .join(now_millis());
    let mut plan = LifecyclePlan {
        plan_hash: String::new(),
        operation: "delete".to_string(),
        runtime: agent.runtime,
        target_path: agent.root_path.clone(),
        will_create_files: Vec::new(),
        will_backup: true,
        backup_path: Some(trash_dir.clone()),
        warnings: vec![
            format!("Will soft-delete '{}' to trash.", agent.name),
            format!("Trash path: {}", trash_dir.display()),
            "The agent can be restored from trash later.".to_string(),
        ],
        blocked_reason: None,
        included_files: Vec::new(),
        skipped_items: Vec::new(),
    };
    plan.plan_hash = compute_plan_hash(&plan);
    Ok(plan)
}

#[tauri::command]
pub fn apply_delete_agent(request: ApplyLifecycleRequest) -> Result<LifecycleResult, String> {
    let _home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    let connection = open_database().map_err(|error| error.to_string())?;
    let agents = load_agent_records(&connection).map_err(|error| error.to_string())?;
    let agent = agents
        .iter()
        .find(|a| is_runtime_root_or_container(&a.root_path) == false)
        .ok_or_else(|| "No valid agent found for delete.".to_string())?;
    let plan = delete_agent_plan(DeleteRequest {
        agent_id: agent.id.clone(),
    })?;
    if plan.plan_hash != request.plan_hash {
        return Err("Stale plan: re-generate the lifecycle plan before applying.".to_string());
    }
    if plan.blocked_reason.is_some() {
        return Err(format!("Plan is blocked: {}", plan.blocked_reason.unwrap()));
    }
    let trash_dir = plan
        .backup_path
        .ok_or_else(|| "Delete plan has no trash path.".to_string())?;
    let manifest = TrashManifest {
        original_path: agent.root_path.display().to_string(),
        runtime: agent.runtime.as_str().to_string(),
        name: agent.name.clone(),
        deleted_at: now_millis(),
    };
    write_trash_manifest(&trash_dir, &manifest)?;
    if agent.root_path.exists() {
        fs::create_dir_all(&trash_dir).map_err(|error| error.to_string())?;
        move_dir_contents(&agent.root_path, &trash_dir).map_err(|error| error.to_string())?;
        fs::remove_dir_all(&agent.root_path).map_err(|error| error.to_string())?;
    }
    let scan_result = crate::scanner::scan_selected_root(agent.runtime, agent.root_path.clone())
        .map_err(|error| error.to_string())?;
    upsert_agent_records(&connection, &scan_result).map_err(|error| error.to_string())?;
    Ok(LifecycleResult {
        operation: "delete".to_string(),
        runtime: agent.runtime,
        target_path: agent.root_path.clone(),
        backup_path: Some(trash_dir),
        scan_result,
    })
}

#[tauri::command]
pub fn list_trash_items() -> Result<Vec<TrashItem>, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    scan_trash_dir(&home)
}

#[tauri::command]
pub fn restore_trash_item_plan(trash_path: String) -> Result<LifecyclePlan, String> {
    let trash = PathBuf::from(&trash_path);
    if !trash.is_dir() {
        return Err("Trash path is not a directory.".to_string());
    }
    let manifest = read_trash_manifest(&trash)?;
    let original_path = PathBuf::from(&manifest.original_path);
    if original_path.exists() {
        return Ok(LifecyclePlan {
            plan_hash: String::new(),
            operation: "restore".to_string(),
            runtime: parse_runtime(&manifest.runtime),
            target_path: original_path.clone(),
            will_create_files: Vec::new(),
            will_backup: false,
            backup_path: None,
            warnings: Vec::new(),
            blocked_reason: Some(format!(
                "Original path already exists: {}. Remove it or choose a different restore target.",
                original_path.display()
            )),
            included_files: Vec::new(),
            skipped_items: Vec::new(),
        });
    }
    let runtime = parse_runtime(&manifest.runtime);
    let mut plan = LifecyclePlan {
        plan_hash: String::new(),
        operation: "restore".to_string(),
        runtime,
        target_path: original_path.clone(),
        will_create_files: Vec::new(),
        will_backup: false,
        backup_path: None,
        warnings: vec![
            format!("Will restore '{}' to {}.", manifest.name, original_path.display()),
            "The trash directory will be removed after restore.".to_string(),
        ],
        blocked_reason: None,
        included_files: Vec::new(),
        skipped_items: Vec::new(),
    };
    plan.plan_hash = compute_plan_hash(&plan);
    Ok(plan)
}

#[tauri::command]
pub fn apply_restore_trash_item(request: ApplyLifecycleRequest) -> Result<LifecycleResult, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not resolve home directory.".to_string())?;
    let connection = open_database().map_err(|error| error.to_string())?;
    let trash_items = scan_trash_dir(&home)?;
    let trash_item = trash_items
        .iter()
        .find(|item| {
            let plan = restore_trash_item_plan(item.trash_path.display().to_string());
            plan.map(|p| p.plan_hash == request.plan_hash).unwrap_or(false)
        })
        .ok_or_else(|| "No matching trash item found for the plan hash.".to_string())?;
    let plan = restore_trash_item_plan(trash_item.trash_path.display().to_string())?;
    if plan.plan_hash != request.plan_hash {
        return Err("Stale plan: re-generate the lifecycle plan before applying.".to_string());
    }
    if plan.blocked_reason.is_some() {
        return Err(format!("Plan is blocked: {}", plan.blocked_reason.unwrap()));
    }
    let trash_dir = &trash_item.trash_path;
    let original_path = &plan.target_path;
    fs::create_dir_all(original_path).map_err(|error| error.to_string())?;
    move_dir_contents(trash_dir, original_path).map_err(|error| error.to_string())?;
    let manifest_path = original_path.join("manifest.json");
    if manifest_path.exists() {
        fs::remove_file(&manifest_path).map_err(|error| error.to_string())?;
    }
    if trash_dir.exists() {
        let _ = fs::remove_dir_all(trash_dir);
    }
    let scan_result = crate::scanner::scan_selected_root(plan.runtime, original_path.clone())
        .map_err(|error| error.to_string())?;
    upsert_agent_records(&connection, &scan_result).map_err(|error| error.to_string())?;
    Ok(LifecycleResult {
        operation: "restore".to_string(),
        runtime: plan.runtime,
        target_path: original_path.clone(),
        backup_path: None,
        scan_result,
    })
}

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

fn validate_agent_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Agent/profile name is required.".to_string());
    }
    if trimmed.starts_with('.') {
        return Err("Agent/profile name must not start with a dot.".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Agent/profile name must not contain path separators.".to_string());
    }
    if trimmed.contains(std::path::MAIN_SEPARATOR) {
        return Err("Agent/profile name must not contain path separators.".to_string());
    }
    Ok(())
}

fn compute_plan_hash(plan: &LifecyclePlan) -> String {
    let mut hasher = Sha256::new();
    hasher.update(plan.operation.as_bytes());
    hasher.update(plan.runtime.as_str().as_bytes());
    hasher.update(plan.target_path.to_string_lossy().as_bytes());
    for file in &plan.will_create_files {
        hasher.update(file.as_bytes());
    }
    hasher.update(plan.will_backup.to_string().as_bytes());
    if let Some(ref backup) = plan.backup_path {
        hasher.update(backup.to_string_lossy().as_bytes());
    }
    if let Some(ref reason) = plan.blocked_reason {
        hasher.update(reason.as_bytes());
    }
    for file in &plan.included_files {
        hasher.update(file.as_bytes());
    }
    for item in &plan.skipped_items {
        hasher.update(item.as_bytes());
    }
    format!("sha256:{:x}", hasher.finalize())
}

fn trash_base_dir(home: &Path) -> PathBuf {
    home.join(".agentdock").join("trash")
}

fn write_trash_manifest(trash_dir: &Path, manifest: &TrashManifest) -> Result<(), String> {
    fs::create_dir_all(trash_dir).map_err(|error| error.to_string())?;
    let content = serde_json::to_string_pretty(manifest).map_err(|error| error.to_string())?;
    atomic_write(&trash_dir.join("manifest.json"), content.as_bytes())
}

fn read_trash_manifest(trash_dir: &Path) -> Result<TrashManifest, String> {
    let content =
        fs::read_to_string(trash_dir.join("manifest.json")).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn scan_trash_dir(home: &Path) -> Result<Vec<TrashItem>, String> {
    let trash_root = trash_base_dir(home);
    if !trash_root.is_dir() {
        return Ok(Vec::new());
    }
    let mut items = Vec::new();
    scan_trash_dir_recursive(&trash_root, &mut items)?;
    Ok(items)
}

fn scan_trash_dir_recursive(dir: &Path, items: &mut Vec<TrashItem>) -> Result<(), String> {
    let manifest_path = dir.join("manifest.json");
    if manifest_path.is_file() {
        let manifest = read_trash_manifest(dir)?;
        let runtime = parse_runtime(&manifest.runtime);
        items.push(TrashItem {
            trash_path: dir.to_path_buf(),
            original_path: PathBuf::from(&manifest.original_path),
            runtime,
            name: manifest.name.clone(),
            deleted_at: manifest.deleted_at.clone(),
            manifest,
        });
        return Ok(());
    }
    let entries = fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            scan_trash_dir_recursive(&path, items)?;
        }
    }
    Ok(())
}

fn is_private_data_dir(name: &str) -> bool {
    PRIVATE_DATA_DIRS
        .iter()
        .any(|d| name.eq_ignore_ascii_case(d))
}

fn is_private_data_file(name: &str) -> bool {
    PRIVATE_DATA_FILES
        .iter()
        .any(|f| name.eq_ignore_ascii_case(f))
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

fn parse_runtime(value: &str) -> AgentRuntime {
    if value == AgentRuntime::Hermes.as_str() {
        AgentRuntime::Hermes
    } else {
        AgentRuntime::OpenClaw
    }
}

fn find_agent_in_db(
    connection: &rusqlite::Connection,
    agent_id: &str,
) -> Result<AgentScanRecord, String> {
    load_agent_records(connection)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|agent| agent.id == agent_id)
        .ok_or_else(|| "Agent is not indexed. Re-scan the runtime root first.".to_string())
}

fn find_agent_by_operation(
    agents: &[AgentScanRecord],
    operation: &str,
) -> Result<AgentScanRecord, String> {
    agents
        .iter()
        .find(|a| !is_runtime_root_or_container(&a.root_path))
        .cloned()
        .ok_or_else(|| format!("No valid agent found for {} operation.", operation))
}

fn collect_duplicate_items(
    root: &Path,
    current: &Path,
    included: &mut Vec<String>,
    skipped: &mut Vec<String>,
) {
    let entries = match fs::read_dir(current) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        if path.is_dir() {
            if is_private_data_dir(&name) {
                skipped.push(format!("{}/", relative));
            } else {
                included.push(format!("{}/", relative));
                collect_duplicate_items(root, &path, included, skipped);
            }
        } else if path.is_file() {
            if is_private_data_file(&name) {
                skipped.push(relative);
            } else {
                included.push(relative);
            }
        }
    }
}

fn patch_config_name(target_root: &Path, runtime: AgentRuntime) {
    let config_path = match runtime {
        AgentRuntime::OpenClaw => target_root.join("config.json"),
        AgentRuntime::Hermes => target_root.join("config.yaml"),
    };
    if !config_path.is_file() {
        return;
    }
    let name = target_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed");
    match runtime {
        AgentRuntime::OpenClaw => {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(obj) = value.as_object_mut() {
                        obj.insert("name".to_string(), serde_json::Value::String(name.to_string()));
                    }
                    if let Ok(new_content) = serde_json::to_string_pretty(&value) {
                        let _ = atomic_write(&config_path, format!("{}\n", new_content).as_bytes());
                    }
                }
            }
        }
        AgentRuntime::Hermes => {
            if let Ok(content) = fs::read_to_string(&config_path) {
                if let Ok(mut value) = serde_yaml::from_str::<serde_yaml::Value>(&content) {
                    if let Some(mapping) = value.as_mapping_mut() {
                        mapping.insert(
                            serde_yaml::Value::String("name".to_string()),
                            serde_yaml::Value::String(name.to_string()),
                        );
                    }
                    if let Ok(new_content) = serde_yaml::to_string(&value) {
                        let _ = atomic_write(&config_path, new_content.as_bytes());
                    }
                }
            }
        }
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), std::io::Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

fn move_dir_contents(src: &Path, dst: &Path) -> Result<(), std::io::Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn validate_agent_name_rejects_empty() {
        assert!(validate_agent_name("").is_err());
        assert!(validate_agent_name("  ").is_err());
    }

    #[test]
    fn validate_agent_name_rejects_dot_prefix() {
        assert!(validate_agent_name(".hidden").is_err());
    }

    #[test]
    fn validate_agent_name_rejects_path_separators() {
        assert!(validate_agent_name("foo/bar").is_err());
        assert!(validate_agent_name("foo\\bar").is_err());
    }

    #[test]
    fn validate_agent_name_accepts_valid() {
        assert!(validate_agent_name("my-agent").is_ok());
        assert!(validate_agent_name("agent_123").is_ok());
    }

    #[test]
    fn is_private_data_dir_detects_sessions() {
        assert!(is_private_data_dir("sessions"));
        assert!(is_private_data_dir("memory"));
        assert!(is_private_data_dir("logs"));
        assert!(!is_private_data_dir("skills"));
        assert!(!is_private_data_dir("my-folder"));
    }

    #[test]
    fn is_private_data_file_detects_env() {
        assert!(is_private_data_file(".env"));
        assert!(is_private_data_file("credentials.json"));
        assert!(is_private_data_file("tokens.json"));
        assert!(!is_private_data_file("config.json"));
        assert!(!is_private_data_file("SOUL.md"));
    }

    #[test]
    fn create_agent_plan_succeeds_for_new_path() {
        let home = tempdir().expect("home");
        let request = CreateAgentRequest {
            name: "test-agent".to_string(),
            target_root: Some(home.path().join("new-agent").display().to_string()),
        };
        let plan = create_agent_plan(request).expect("plan");
        assert_eq!(plan.operation, "create_agent");
        assert_eq!(plan.runtime, AgentRuntime::OpenClaw);
        assert!(plan.blocked_reason.is_none());
        assert!(!plan.plan_hash.is_empty());
        assert!(plan.will_create_files.contains(&"config.json".to_string()));
    }

    #[test]
    fn create_agent_plan_blocks_if_target_exists() {
        let home = tempdir().expect("home");
        let existing = home.path().join("existing-agent");
        fs::create_dir_all(&existing).expect("dir");
        let request = CreateAgentRequest {
            name: "existing-agent".to_string(),
            target_root: Some(existing.display().to_string()),
        };
        let plan = create_agent_plan(request).expect("plan");
        assert!(plan.blocked_reason.is_some());
    }

    #[test]
    fn create_profile_plan_succeeds_for_new_path() {
        let home = tempdir().expect("home");
        let request = CreateProfileRequest {
            name: "test-profile".to_string(),
            target_root: Some(home.path().join("new-profile").display().to_string()),
        };
        let plan = create_profile_plan(request).expect("plan");
        assert_eq!(plan.operation, "create_profile");
        assert_eq!(plan.runtime, AgentRuntime::Hermes);
        assert!(plan.blocked_reason.is_none());
        assert!(plan.will_create_files.contains(&"config.yaml".to_string()));
    }

    #[test]
    fn delete_agent_plan_blocks_runtime_root() {
        let real_home = dirs::home_dir().expect("home");
        let openclaw_root = real_home.join(".openclaw");
        assert!(
            is_runtime_root_or_container(&openclaw_root),
            "~/.openclaw should be detected as runtime root"
        );
        let hermes_root = real_home.join(".hermes");
        assert!(
            is_runtime_root_or_container(&hermes_root),
            "~/.hermes should be detected as runtime root"
        );
        let agents_dir = real_home.join(".openclaw").join("agents");
        assert!(
            is_runtime_root_or_container(&agents_dir),
            "~/.openclaw/agents should be detected as runtime container"
        );
        let profiles_dir = real_home.join(".hermes").join("profiles");
        assert!(
            is_runtime_root_or_container(&profiles_dir),
            "~/.hermes/profiles should be detected as runtime container"
        );
        let normal_path = real_home.join("my-normal-agent");
        assert!(
            !is_runtime_root_or_container(&normal_path),
            "normal path should not be detected as runtime root"
        );
    }

    #[test]
    fn trash_manifest_round_trip() {
        let dir = tempdir().expect("dir");
        let manifest = TrashManifest {
            original_path: "/some/path".to_string(),
            runtime: "openclaw".to_string(),
            name: "test".to_string(),
            deleted_at: "12345".to_string(),
        };
        write_trash_manifest(dir.path(), &manifest).expect("write");
        let loaded = read_trash_manifest(dir.path()).expect("read");
        assert_eq!(loaded.original_path, manifest.original_path);
        assert_eq!(loaded.runtime, manifest.runtime);
        assert_eq!(loaded.name, manifest.name);
        assert_eq!(loaded.deleted_at, manifest.deleted_at);
    }

    #[test]
    fn compute_plan_hash_is_deterministic() {
        let home = tempdir().expect("home");
        let plan1 = LifecyclePlan {
            plan_hash: String::new(),
            operation: "create_agent".to_string(),
            runtime: AgentRuntime::OpenClaw,
            target_path: home.path().join("test"),
            will_create_files: vec!["config.json".to_string()],
            will_backup: false,
            backup_path: None,
            warnings: Vec::new(),
            blocked_reason: None,
            included_files: Vec::new(),
            skipped_items: Vec::new(),
        };
        let plan2 = plan1.clone();
        assert_eq!(compute_plan_hash(&plan1), compute_plan_hash(&plan2));
    }

    #[test]
    fn collect_duplicate_items_skips_private_dirs_and_files() {
        let home = tempdir().expect("home");
        let root = home.path().join("source-agent");
        fs::create_dir_all(root.join("skills")).expect("skills");
        fs::create_dir_all(root.join("sessions")).expect("sessions");
        fs::create_dir_all(root.join("memory")).expect("memory");
        fs::write(root.join("config.json"), r#"{"name":"test"}"#).expect("config");
        fs::write(root.join("SOUL.md"), "soul").expect("soul");
        fs::write(root.join(".env"), "SECRET=1").expect("env");
        fs::write(root.join("sessions/chat.json"), "data").expect("session");
        let mut included = Vec::new();
        let mut skipped = Vec::new();
        collect_duplicate_items(&root, &root, &mut included, &mut skipped);
        assert!(included.iter().any(|f| f.contains("config.json")));
        assert!(included.iter().any(|f| f.contains("SOUL.md")));
        assert!(included.iter().any(|f| f.contains("skills")));
        assert!(skipped.iter().any(|f| f.contains("sessions")));
        assert!(skipped.iter().any(|f| f.contains("memory")));
        assert!(skipped.iter().any(|f| f.contains(".env")));
    }
}
