use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use similar::TextDiff;

use crate::db::{
    insert_backup_record, load_agent_backups as db_load_agent_backups, load_agent_records,
    load_backup_record, open_database, upsert_agent_records, BackupRecord,
};
use crate::scanner::ignore::is_private_runtime_dir;
use crate::scanner::types::{
    AgentRuntime, AgentScanRecord, ChannelSummary, HealthStatus, ModelSummary, ProviderSummary,
    ScanWarning,
};

const MISSING_HASH: &str = "missing";

#[derive(Debug, Clone, Copy, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PersonalityFileKind {
    Soul,
    Agents,
    User,
}

impl PersonalityFileKind {
    fn file_name(self) -> &'static str {
        match self {
            PersonalityFileKind::Soul => "SOUL.md",
            PersonalityFileKind::Agents => "AGENTS.md",
            PersonalityFileKind::User => "USER.md",
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            PersonalityFileKind::Soul => "soul",
            PersonalityFileKind::Agents => "agents",
            PersonalityFileKind::User => "user",
        }
    }

    fn from_backup_value(value: &str) -> Result<Self, String> {
        match value {
            "soul" => Ok(PersonalityFileKind::Soul),
            "agents" => Ok(PersonalityFileKind::Agents),
            "user" => Ok(PersonalityFileKind::User),
            _ => Err("Backup is not for an editable personality file.".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalityFileMetadata {
    pub file_kind: PersonalityFileKind,
    pub resolved_path: PathBuf,
    pub exists: bool,
    pub size_bytes: Option<u64>,
    pub last_modified_time: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathMetadata {
    pub path: PathBuf,
    pub exists: bool,
    pub size_bytes: Option<u64>,
    pub last_modified_time: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDetail {
    pub id: String,
    pub name: String,
    pub runtime: AgentRuntime,
    pub root_path: PathBuf,
    pub config_paths: Vec<PathBuf>,
    pub personality_files: Vec<PersonalityFileMetadata>,
    pub skill_paths: Vec<PathMetadata>,
    pub provider_summary: ProviderSummary,
    pub model_summary: ModelSummary,
    pub channel_summary: ChannelSummary,
    pub health_status: HealthStatus,
    pub warnings: Vec<ScanWarning>,
    pub last_scanned_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalityFileReadResult {
    pub file_kind: PersonalityFileKind,
    pub resolved_path: PathBuf,
    pub exists: bool,
    pub content: String,
    pub content_hash: String,
    pub last_modified_time: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalityUpdatePlan {
    pub agent_id: String,
    pub runtime: AgentRuntime,
    pub file_kind: PersonalityFileKind,
    pub target_path: PathBuf,
    pub old_hash: String,
    pub new_hash: String,
    pub unified_diff: String,
    pub warnings: Vec<String>,
    pub backup_will_be_created: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalityUpdateResult {
    pub agent_id: String,
    pub runtime: AgentRuntime,
    pub file_kind: PersonalityFileKind,
    pub target_path: PathBuf,
    pub backup_path: PathBuf,
    pub old_hash: String,
    pub new_hash: String,
    pub scan_result: Vec<AgentScanRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalityRestorePlan {
    pub backup_id: String,
    pub agent_id: String,
    pub runtime: AgentRuntime,
    pub file_kind: PersonalityFileKind,
    pub target_path: PathBuf,
    pub backup_path: PathBuf,
    pub current_hash: String,
    pub restored_hash: String,
    pub unified_diff: String,
    pub warnings: Vec<String>,
    pub safety_backup_will_be_created: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub restored_backup_id: String,
    pub safety_backup_id: String,
    pub agent_id: String,
    pub runtime: AgentRuntime,
    pub file_kind: PersonalityFileKind,
    pub target_path: PathBuf,
    pub restored_hash: String,
    pub scan_result: Vec<AgentScanRecord>,
}

#[tauri::command]
pub fn get_agent_detail(agent_id: String) -> Result<AgentDetail, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    let agent = find_agent(&connection, &agent_id)?;
    Ok(detail_from_agent(&agent))
}

#[tauri::command]
pub fn read_personality_file(
    agent_id: String,
    file_kind: PersonalityFileKind,
) -> Result<PersonalityFileReadResult, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    let agent = find_agent(&connection, &agent_id)?;
    let target = resolve_personality_target(&agent, file_kind)?;
    let current = read_current_file(&target)?;
    Ok(PersonalityFileReadResult {
        file_kind,
        resolved_path: target,
        exists: current.exists,
        content: current.content,
        content_hash: current.hash,
        last_modified_time: current.last_modified_time,
    })
}

#[tauri::command]
pub fn create_personality_update_plan(
    agent_id: String,
    file_kind: PersonalityFileKind,
    new_content: String,
    expected_hash: String,
) -> Result<PersonalityUpdatePlan, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    create_personality_update_plan_with_connection(
        &connection,
        agent_id,
        file_kind,
        new_content,
        expected_hash,
    )
}

fn create_personality_update_plan_with_connection(
    connection: &rusqlite::Connection,
    agent_id: String,
    file_kind: PersonalityFileKind,
    new_content: String,
    expected_hash: String,
) -> Result<PersonalityUpdatePlan, String> {
    let agent = find_agent(connection, &agent_id)?;
    let target = resolve_personality_target(&agent, file_kind)?;
    let current = read_current_file(&target)?;
    ensure_expected_hash(&current.hash, &expected_hash)?;
    let new_hash = content_hash(&new_content);
    let old_display = if current.exists {
        current.content.as_str()
    } else {
        ""
    };
    Ok(PersonalityUpdatePlan {
        agent_id: agent.id,
        runtime: agent.runtime,
        file_kind,
        target_path: target,
        old_hash: current.hash,
        new_hash,
        unified_diff: unified_diff(file_kind.file_name(), old_display, &new_content),
        warnings: plan_warnings(&new_content),
        backup_will_be_created: true,
    })
}

#[tauri::command]
pub fn apply_personality_update(
    agent_id: String,
    file_kind: PersonalityFileKind,
    new_content: String,
    expected_hash: String,
) -> Result<PersonalityUpdateResult, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    let home =
        dirs::home_dir().ok_or_else(|| "Could not resolve the user home directory.".to_string())?;
    apply_personality_update_with_connection(
        &connection,
        &home,
        agent_id,
        file_kind,
        new_content,
        expected_hash,
    )
}

fn apply_personality_update_with_connection(
    connection: &rusqlite::Connection,
    home_dir: &Path,
    agent_id: String,
    file_kind: PersonalityFileKind,
    new_content: String,
    expected_hash: String,
) -> Result<PersonalityUpdateResult, String> {
    let agent = find_agent(connection, &agent_id)?;
    let target = resolve_personality_target(&agent, file_kind)?;
    let current = read_current_file(&target)?;
    ensure_expected_hash(&current.hash, &expected_hash)?;
    let new_hash = content_hash(&new_content);
    if current.hash == new_hash {
        return Err(
            "No changes to apply. Generate a diff after editing before saving.".to_string(),
        );
    }

    let backup = create_backup_record_under(
        home_dir,
        &agent,
        file_kind,
        &target,
        &current.hash,
        &new_hash,
    )?;
    write_backup_payload(
        &backup.backup_path,
        file_kind,
        current.exists,
        &current.content,
    )?;
    atomic_write(&target, new_content.as_bytes())?;
    insert_backup_record(connection, &backup, "personality_update")
        .map_err(|error| error.to_string())?;
    let scan_result = rescan_agent_root(connection, &agent)?;

    Ok(PersonalityUpdateResult {
        agent_id: agent.id,
        runtime: agent.runtime,
        file_kind,
        target_path: target,
        backup_path: backup.backup_path,
        old_hash: current.hash,
        new_hash,
        scan_result,
    })
}

#[tauri::command]
pub fn list_agent_backups(agent_id: String) -> Result<Vec<BackupRecord>, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    let _agent = find_agent(&connection, &agent_id)?;
    db_load_agent_backups(&connection, &agent_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_personality_restore_plan(
    backup_id: String,
) -> Result<PersonalityRestorePlan, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    create_personality_restore_plan_with_connection(&connection, backup_id)
}

#[tauri::command]
pub fn restore_personality_backup(backup_id: String) -> Result<RestoreResult, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    let home =
        dirs::home_dir().ok_or_else(|| "Could not resolve the user home directory.".to_string())?;
    let _plan = create_personality_restore_plan_with_connection(&connection, backup_id.clone())?;
    restore_personality_backup_with_connection(&connection, &home, backup_id)
}

fn create_personality_restore_plan_with_connection(
    connection: &rusqlite::Connection,
    backup_id: String,
) -> Result<PersonalityRestorePlan, String> {
    let backup = load_backup_record(connection, &backup_id).map_err(|error| error.to_string())?;
    let file_kind = PersonalityFileKind::from_backup_value(&backup.file_kind)?;
    let agent = find_agent(connection, &backup.agent_id)?;
    let target = resolve_personality_target(&agent, file_kind)?;
    if target != backup.original_path {
        return Err("Backup target no longer matches the indexed agent root.".to_string());
    }
    let current = read_current_file(&target)?;
    let restored_payload = read_backup_payload(&backup.backup_path, file_kind)?;
    let restored_hash = restored_payload
        .as_ref()
        .map(|content| content_hash(content))
        .unwrap_or_else(|| MISSING_HASH.to_string());
    let restored_display = restored_payload.as_deref().unwrap_or("");
    Ok(PersonalityRestorePlan {
        backup_id: backup.backup_id,
        agent_id: agent.id,
        runtime: agent.runtime,
        file_kind,
        target_path: target,
        backup_path: backup.backup_path,
        current_hash: current.hash,
        restored_hash,
        unified_diff: unified_diff(file_kind.file_name(), &current.content, restored_display),
        warnings: vec![
            "Restore will create a safety backup before writing.".to_string(),
            "Restore is scoped to the selected agent/profile personality file.".to_string(),
            "AgentDock will re-scan the agent/profile root after restore.".to_string(),
        ],
        safety_backup_will_be_created: true,
    })
}

fn restore_personality_backup_with_connection(
    connection: &rusqlite::Connection,
    home_dir: &Path,
    backup_id: String,
) -> Result<RestoreResult, String> {
    let backup = load_backup_record(connection, &backup_id).map_err(|error| error.to_string())?;
    let file_kind = PersonalityFileKind::from_backup_value(&backup.file_kind)?;
    let agent = find_agent(connection, &backup.agent_id)?;
    let target = resolve_personality_target(&agent, file_kind)?;
    if target != backup.original_path {
        return Err("Backup target no longer matches the indexed agent root.".to_string());
    }

    let current = read_current_file(&target)?;
    let restored_payload = read_backup_payload(&backup.backup_path, file_kind)?;
    let restored_hash = restored_payload
        .as_ref()
        .map(|content| content_hash(content))
        .unwrap_or_else(|| MISSING_HASH.to_string());

    let safety_backup = create_backup_record_under(
        home_dir,
        &agent,
        file_kind,
        &target,
        &current.hash,
        &restored_hash,
    )?;
    write_backup_payload(
        &safety_backup.backup_path,
        file_kind,
        current.exists,
        &current.content,
    )?;

    if let Some(content) = restored_payload {
        atomic_write(&target, content.as_bytes())?;
    } else if target.exists() {
        fs::remove_file(&target).map_err(|error| error.to_string())?;
    }

    insert_backup_record(connection, &safety_backup, "personality_restore")
        .map_err(|error| error.to_string())?;
    let scan_result = rescan_agent_root(connection, &agent)?;

    Ok(RestoreResult {
        restored_backup_id: backup.backup_id,
        safety_backup_id: safety_backup.backup_id,
        agent_id: agent.id,
        runtime: agent.runtime,
        file_kind,
        target_path: target,
        restored_hash,
        scan_result,
    })
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

fn detail_from_agent(agent: &AgentScanRecord) -> AgentDetail {
    AgentDetail {
        id: agent.id.clone(),
        name: agent.name.clone(),
        runtime: agent.runtime,
        root_path: agent.root_path.clone(),
        config_paths: agent.config_paths.clone(),
        personality_files: [
            PersonalityFileKind::Soul,
            PersonalityFileKind::Agents,
            PersonalityFileKind::User,
        ]
        .iter()
        .map(|kind| metadata_for_path(*kind, agent.root_path.join(kind.file_name())))
        .collect(),
        skill_paths: agent
            .skill_paths
            .iter()
            .map(|path| path_metadata(path.clone()))
            .collect(),
        provider_summary: agent.provider_summary.clone(),
        model_summary: agent.model_summary.clone(),
        channel_summary: agent.channel_summary.clone(),
        health_status: agent.health_status,
        warnings: agent.warnings.clone(),
        last_scanned_at: agent.last_scanned_at.clone(),
    }
}

fn metadata_for_path(file_kind: PersonalityFileKind, path: PathBuf) -> PersonalityFileMetadata {
    let metadata = fs::metadata(&path).ok();
    PersonalityFileMetadata {
        file_kind,
        resolved_path: path,
        exists: metadata.is_some(),
        size_bytes: metadata.as_ref().map(|value| value.len()),
        last_modified_time: metadata
            .and_then(|value| value.modified().ok())
            .map(system_time_to_timestamp),
    }
}

fn path_metadata(path: PathBuf) -> PathMetadata {
    let metadata = fs::metadata(&path).ok();
    PathMetadata {
        path,
        exists: metadata.is_some(),
        size_bytes: metadata.as_ref().map(|value| value.len()),
        last_modified_time: metadata
            .and_then(|value| value.modified().ok())
            .map(system_time_to_timestamp),
    }
}

fn resolve_personality_target(
    agent: &AgentScanRecord,
    file_kind: PersonalityFileKind,
) -> Result<PathBuf, String> {
    if is_private_runtime_dir(&agent.root_path) {
        return Err("Agent root is private runtime data and cannot be edited.".to_string());
    }
    let root = fs::canonicalize(&agent.root_path)
        .map_err(|_| "Agent root is not accessible. Re-scan before editing.".to_string())?;
    let target = agent.root_path.join(file_kind.file_name());
    let parent = target
        .parent()
        .ok_or_else(|| "Personality file target has no parent directory.".to_string())?;
    let parent = fs::canonicalize(parent)
        .map_err(|_| "Personality file parent is not accessible.".to_string())?;
    if !parent.starts_with(&root) {
        return Err("Personality file must stay inside the agent/profile root.".to_string());
    }
    if target.exists() {
        let canonical_target = fs::canonicalize(&target)
            .map_err(|_| "Personality file target is not accessible.".to_string())?;
        if !canonical_target.starts_with(&root) {
            return Err("Personality file resolves outside the agent/profile root.".to_string());
        }
    }
    Ok(target)
}

struct CurrentFile {
    exists: bool,
    content: String,
    hash: String,
    last_modified_time: Option<String>,
}

fn read_current_file(path: &Path) -> Result<CurrentFile, String> {
    if !path.exists() {
        return Ok(CurrentFile {
            exists: false,
            content: String::new(),
            hash: MISSING_HASH.to_string(),
            last_modified_time: None,
        });
    }
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let hash = content_hash(&content);
    Ok(CurrentFile {
        exists: true,
        content,
        hash,
        last_modified_time: metadata.modified().ok().map(system_time_to_timestamp),
    })
}

fn ensure_expected_hash(current_hash: &str, expected_hash: &str) -> Result<(), String> {
    if current_hash != expected_hash {
        return Err(
            "Stale file: the file changed since it was opened. Re-read it before saving."
                .to_string(),
        );
    }
    Ok(())
}

fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("sha256:{:x}", hasher.finalize())
}

fn unified_diff(file_name: &str, old_content: &str, new_content: &str) -> String {
    TextDiff::from_lines(old_content, new_content)
        .unified_diff()
        .header(&format!("a/{file_name}"), &format!("b/{file_name}"))
        .to_string()
}

fn plan_warnings(new_content: &str) -> Vec<String> {
    let mut warnings = vec!["Backup will be created before atomic write.".to_string()];
    if new_content.trim().is_empty() {
        warnings.push("New personality file content is empty.".to_string());
    }
    warnings
}

#[cfg(test)]
fn create_backup_record(
    agent: &AgentScanRecord,
    file_kind: PersonalityFileKind,
    target: &Path,
    before_hash: &str,
    after_hash: &str,
) -> Result<BackupRecord, String> {
    let home_dir =
        dirs::home_dir().ok_or_else(|| "Could not resolve the user home directory.".to_string())?;
    create_backup_record_under(&home_dir, agent, file_kind, target, before_hash, after_hash)
}

fn create_backup_record_under(
    home_dir: &Path,
    agent: &AgentScanRecord,
    file_kind: PersonalityFileKind,
    target: &Path,
    before_hash: &str,
    after_hash: &str,
) -> Result<BackupRecord, String> {
    let created_at = now_millis();
    let agent_slug = backup_agent_slug(&agent.id);
    let backup_id = format!(
        "{}:{}:{}:{}",
        agent.runtime.as_str(),
        agent_slug,
        created_at,
        file_kind.as_str()
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
        file_kind: file_kind.as_str().to_string(),
        original_path: target.to_path_buf(),
        backup_path,
        created_at,
        content_hash_before: before_hash.to_string(),
        content_hash_after: after_hash.to_string(),
    })
}

fn write_backup_payload(
    backup_dir: &Path,
    file_kind: PersonalityFileKind,
    existed: bool,
    content: &str,
) -> Result<(), String> {
    fs::create_dir_all(backup_dir).map_err(|error| error.to_string())?;
    let manifest = serde_json::json!({
        "fileKind": file_kind.as_str(),
        "existed": existed,
    });
    atomic_write(
        &backup_dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest)
            .map_err(|error| error.to_string())?
            .as_bytes(),
    )?;
    if existed {
        atomic_write(&backup_dir.join(file_kind.file_name()), content.as_bytes())?;
    }
    Ok(())
}

fn read_backup_payload(
    backup_dir: &Path,
    file_kind: PersonalityFileKind,
) -> Result<Option<String>, String> {
    let manifest_path = backup_dir.join("manifest.json");
    let manifest: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(manifest_path).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    if manifest
        .get("fileKind")
        .and_then(serde_json::Value::as_str)
        .and_then(|value| PersonalityFileKind::from_backup_value(value).ok())
        != Some(file_kind)
    {
        return Err("Backup file kind does not match restore request.".to_string());
    }
    if !manifest
        .get("existed")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        return Ok(None);
    }
    fs::read_to_string(backup_dir.join(file_kind.file_name()))
        .map(Some)
        .map_err(|error| error.to_string())
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

fn rescan_agent_root(
    connection: &rusqlite::Connection,
    agent: &AgentScanRecord,
) -> Result<Vec<AgentScanRecord>, String> {
    let records = crate::scanner::scan_selected_root(agent.runtime, agent.root_path.clone())
        .map_err(|error| error.to_string())?;
    upsert_agent_records(connection, &records).map_err(|error| error.to_string())?;
    Ok(records)
}

fn backup_agent_slug(agent_id: &str) -> String {
    let hash = content_hash(agent_id).replace("sha256:", "");
    let mut slug = agent_id
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

fn system_time_to_timestamp(value: SystemTime) -> String {
    value
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;
    use crate::db::{open_database_in, upsert_agent_records};
    use crate::scanner::types::{ChannelSummary, ModelSummary, ProviderSummary};

    fn test_agent(root: &Path) -> AgentScanRecord {
        AgentScanRecord {
            id: format!("openclaw:{}", root.display()),
            runtime: AgentRuntime::OpenClaw,
            name: "Fixture Agent".to_string(),
            root_path: root.to_path_buf(),
            config_paths: Vec::new(),
            config_files: Vec::new(),
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

    #[test]
    fn missing_personality_file_has_missing_hash() {
        let root = tempdir().expect("root");
        let agent = test_agent(root.path());
        let target = resolve_personality_target(&agent, PersonalityFileKind::Soul).expect("target");
        let current = read_current_file(&target).expect("read missing");

        assert!(!current.exists);
        assert_eq!(current.hash, MISSING_HASH);
    }

    #[test]
    fn stale_expected_hash_is_rejected() {
        let result = ensure_expected_hash("sha256:new", "sha256:old");

        assert!(result.expect_err("stale").contains("Stale file"));
    }

    #[test]
    fn symlink_outside_agent_root_is_rejected() {
        let root = tempdir().expect("root");
        let outside = tempdir().expect("outside");
        let outside_file = outside.path().join("SOUL.md");
        fs::write(&outside_file, "outside").expect("outside file");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside_file, root.path().join("SOUL.md"))
                .expect("symlink");
            let agent = test_agent(root.path());
            let error = resolve_personality_target(&agent, PersonalityFileKind::Soul)
                .expect_err("reject outside symlink");
            assert!(error.contains("outside"));
        }
    }

    #[test]
    fn backup_records_round_trip() {
        let home = tempdir().expect("home");
        let connection = open_database_in(home.path()).expect("db");
        let agent_root = home.path().join(".openclaw/agents/a");
        fs::create_dir_all(&agent_root).expect("agent root");
        let agent = test_agent(&agent_root);
        upsert_agent_records(&connection, &[agent.clone()]).expect("agent insert");
        let target = resolve_personality_target(&agent, PersonalityFileKind::User).expect("target");
        let backup = create_backup_record(
            &agent,
            PersonalityFileKind::User,
            &target,
            MISSING_HASH,
            "new",
        )
        .expect("backup");
        insert_backup_record(&connection, &backup, "personality_update").expect("insert backup");

        let loaded = db_load_agent_backups(&connection, &agent.id).expect("load backups");

        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].file_kind, "user");
        assert_eq!(loaded[0].original_path, target);
    }

    #[test]
    fn personality_apply_and_restore_closed_loop() {
        let home = tempdir().expect("home");
        let connection = open_database_in(home.path()).expect("db");
        let agent_root = home.path().join(".openclaw/agents/agentdock-phase3-test");
        fs::create_dir_all(&agent_root).expect("agent root");
        let soul_path = agent_root.join("SOUL.md");
        let original = "Original isolated personality.\n";
        let updated = "Updated isolated personality.\n";
        fs::write(&soul_path, original).expect("write original");
        let agent = test_agent(&agent_root);
        upsert_agent_records(&connection, &[agent.clone()]).expect("agent insert");

        let read = read_current_file(&soul_path).expect("read personality");
        let update_plan = create_personality_update_plan_with_connection(
            &connection,
            agent.id.clone(),
            PersonalityFileKind::Soul,
            updated.to_string(),
            read.hash,
        )
        .expect("update plan");

        let update_result = apply_personality_update_with_connection(
            &connection,
            home.path(),
            agent.id.clone(),
            PersonalityFileKind::Soul,
            updated.to_string(),
            update_plan.old_hash,
        )
        .expect("apply update");

        assert_eq!(
            fs::read_to_string(&soul_path).expect("updated content"),
            updated
        );
        assert!(update_result.backup_path.join("SOUL.md").exists());

        let restore_plan = create_personality_restore_plan_with_connection(
            &connection,
            update_result
                .backup_path
                .parent()
                .and_then(|_| db_load_agent_backups(&connection, &agent.id).ok())
                .and_then(|backups| {
                    backups
                        .into_iter()
                        .find(|backup| backup.file_kind == "soul")
                })
                .expect("update backup")
                .backup_id,
        )
        .expect("restore plan");

        assert!(restore_plan
            .unified_diff
            .contains("Original isolated personality"));
        let restore_result = restore_personality_backup_with_connection(
            &connection,
            home.path(),
            restore_plan.backup_id,
        )
        .expect("restore");

        assert_eq!(
            fs::read_to_string(&soul_path).expect("restored content"),
            original
        );
        let safety_backup = db_load_agent_backups(&connection, &agent.id)
            .expect("load backups")
            .into_iter()
            .find(|backup| backup.backup_id == restore_result.safety_backup_id)
            .expect("safety backup record");
        assert!(safety_backup.backup_path.join("SOUL.md").exists());
        assert!(!restore_result.scan_result.is_empty());
    }
}
