use serde::Serialize;

use crate::db::{initialize_database, DatabaseReport};

#[derive(Debug, Serialize)]
pub struct BootstrapStatus {
    app_name: &'static str,
    phase: &'static str,
    local_only: bool,
    database: DatabaseReport,
    default_scan_roots: Vec<&'static str>,
}

#[tauri::command]
pub fn bootstrap_status() -> Result<BootstrapStatus, String> {
    let database = initialize_database().map_err(|error| error.to_string())?;

    Ok(BootstrapStatus {
        app_name: "AgentDock",
        phase: "Phase 0 - Project Bootstrap",
        local_only: true,
        database,
        default_scan_roots: vec!["~/.openclaw", "~/.hermes", "~/.agentdock"],
    })
}
