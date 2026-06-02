use std::path::PathBuf;

use serde::Deserialize;

use crate::db::{load_agent_records, open_database, upsert_agent_records, upsert_scan_roots};
use crate::scanner::types::{AgentRuntime, AgentScanRecord, ScanRoot};
use crate::scanner::{default_candidate_roots, fixture_roots, scan_fixtures};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSelectedRootRequest {
    runtime: AgentRuntime,
    path: String,
}

#[tauri::command]
pub fn get_scan_roots() -> Result<Vec<ScanRoot>, String> {
    let mut roots = fixture_roots();
    roots.extend(default_candidate_roots().map_err(|error| error.to_string())?);
    Ok(roots)
}

#[tauri::command]
pub fn scan_fixture_roots() -> Result<Vec<AgentScanRecord>, String> {
    let records = scan_fixtures().map_err(|error| error.to_string())?;
    let connection = open_database().map_err(|error| error.to_string())?;
    upsert_scan_roots(&connection, &fixture_roots()).map_err(|error| error.to_string())?;
    upsert_agent_records(&connection, &records).map_err(|error| error.to_string())?;
    Ok(records)
}

#[tauri::command]
pub fn scan_default_candidates() -> Result<Vec<ScanRoot>, String> {
    let roots = default_candidate_roots().map_err(|error| error.to_string())?;
    let connection = open_database().map_err(|error| error.to_string())?;
    upsert_scan_roots(&connection, &roots).map_err(|error| error.to_string())?;
    Ok(roots)
}

#[tauri::command]
pub fn scan_selected_root(
    request: ScanSelectedRootRequest,
) -> Result<Vec<AgentScanRecord>, String> {
    let path = expand_tilde(&request.path);
    let records = crate::scanner::scan_selected_root(request.runtime, path.clone())
        .map_err(|error| error.to_string())?;
    let connection = open_database().map_err(|error| error.to_string())?;
    upsert_scan_roots(
        &connection,
        &[crate::scanner::scan_root(
            request.runtime,
            path,
            crate::scanner::types::ScanRootSource::UserSelected,
        )],
    )
    .map_err(|error| error.to_string())?;
    upsert_agent_records(&connection, &records).map_err(|error| error.to_string())?;
    Ok(records)
}

#[tauri::command]
pub fn get_agent_index() -> Result<Vec<AgentScanRecord>, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    load_agent_records(&connection).map_err(|error| error.to_string())
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
