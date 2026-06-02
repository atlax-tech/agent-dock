use std::path::PathBuf;

use serde::Deserialize;

use crate::db::{
    load_agent_records, load_scan_roots, open_database, upsert_agent_records, upsert_scan_roots,
};
use crate::scanner::types::{
    AgentRuntime, AgentScanRecord, InitialScanState, PrivacyModeStatus, ScanPreview, ScanRoot,
};
use crate::scanner::{default_candidate_roots, fixture_roots, scan_fixtures};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSelectedRootRequest {
    runtime: AgentRuntime,
    path: String,
}

#[tauri::command]
pub fn get_initial_scan_state() -> Result<InitialScanState, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    initial_scan_state_from_connection(&connection)
}

fn initial_scan_state_from_connection(
    connection: &rusqlite::Connection,
) -> Result<InitialScanState, String> {
    let mut roots = fixture_roots();
    roots.extend(load_scan_roots(&connection).map_err(|error| error.to_string())?);
    dedupe_roots(&mut roots);
    let default_candidates_inspected = roots
        .iter()
        .any(|root| root.source == crate::scanner::types::ScanRootSource::DefaultCandidate);
    Ok(InitialScanState {
        scan_roots: roots,
        agents: load_agent_records(connection).map_err(|error| error.to_string())?,
        privacy_mode: PrivacyModeStatus {
            local_only: true,
            read_only: true,
            default_candidates_inspected,
        },
    })
}

#[tauri::command]
pub fn get_scan_roots() -> Result<Vec<ScanRoot>, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    let mut roots = fixture_roots();
    roots.extend(load_scan_roots(&connection).map_err(|error| error.to_string())?);
    dedupe_roots(&mut roots);
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
    let mut merged = fixture_roots();
    merged.extend(load_scan_roots(&connection).map_err(|error| error.to_string())?);
    dedupe_roots(&mut merged);
    Ok(merged)
}

#[tauri::command]
pub fn preview_scan_root(request: ScanSelectedRootRequest) -> Result<ScanPreview, String> {
    Ok(crate::scanner::preview_scan_root(
        request.runtime,
        expand_tilde(&request.path),
    ))
}

#[tauri::command]
pub fn scan_selected_root(
    request: ScanSelectedRootRequest,
) -> Result<Vec<AgentScanRecord>, String> {
    let connection = open_database().map_err(|error| error.to_string())?;
    scan_selected_root_with_connection(request, &connection)
}

fn scan_selected_root_with_connection(
    request: ScanSelectedRootRequest,
    connection: &rusqlite::Connection,
) -> Result<Vec<AgentScanRecord>, String> {
    let path = expand_tilde(&request.path);
    let records = crate::scanner::scan_selected_root(request.runtime, path.clone())
        .map_err(|error| error.to_string())?;
    upsert_scan_roots(
        connection,
        &[crate::scanner::scan_root(
            request.runtime,
            path,
            crate::scanner::types::ScanRootSource::UserSelected,
        )],
    )
    .map_err(|error| error.to_string())?;
    upsert_agent_records(connection, &records).map_err(|error| error.to_string())?;
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

fn dedupe_roots(roots: &mut Vec<ScanRoot>) {
    roots.sort_by(|left, right| {
        (
            left.runtime.as_str(),
            left.path.display().to_string(),
            source_priority(left.source),
        )
            .cmp(&(
                right.runtime.as_str(),
                right.path.display().to_string(),
                source_priority(right.source),
            ))
    });
    roots.dedup_by(|left, right| left.runtime == right.runtime && left.path == right.path);
}

fn source_priority(source: crate::scanner::types::ScanRootSource) -> u8 {
    match source {
        crate::scanner::types::ScanRootSource::Fixture => 0,
        crate::scanner::types::ScanRootSource::UserSelected => 1,
        crate::scanner::types::ScanRootSource::DefaultCandidate => 2,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{initialize_database_in, open_database_in};

    #[test]
    fn initial_state_does_not_include_default_candidates() {
        let home = tempfile::tempdir().expect("temp home");
        std::fs::create_dir_all(home.path().join(".openclaw/workspace-private"))
            .expect("create fake runtime");
        initialize_database_in(home.path()).expect("init db");
        let connection = open_database_in(home.path()).expect("open db");

        let state = initial_scan_state_from_connection(&connection).expect("initial state");
        let rendered = serde_json::to_string(&state.scan_roots).expect("roots json");

        assert!(!rendered.contains(".openclaw"));
        assert!(!rendered.contains(".hermes"));
        assert!(!rendered.contains("workspace-private"));
        assert!(!state.privacy_mode.default_candidates_inspected);
    }

    #[test]
    fn initial_state_reports_previously_detected_default_candidates() {
        let home = tempfile::tempdir().expect("temp home");
        initialize_database_in(home.path()).expect("init db");
        let connection = open_database_in(home.path()).expect("open db");
        upsert_scan_roots(
            &connection,
            &[crate::scanner::scan_root(
                AgentRuntime::Hermes,
                home.path().join(".hermes"),
                crate::scanner::types::ScanRootSource::DefaultCandidate,
            )],
        )
        .expect("persist default candidate");

        let state = initial_scan_state_from_connection(&connection).expect("initial state");

        assert!(state.privacy_mode.default_candidates_inspected);
        assert!(state
            .scan_roots
            .iter()
            .any(|root| root.source == crate::scanner::types::ScanRootSource::DefaultCandidate));
    }

    #[test]
    fn preview_scan_root_does_not_write_database() {
        let home = tempfile::tempdir().expect("temp home");
        initialize_database_in(home.path()).expect("init db");
        let connection = open_database_in(home.path()).expect("open db");
        let before = load_scan_roots(&connection).expect("load roots before");

        let _preview = preview_scan_root(ScanSelectedRootRequest {
            runtime: AgentRuntime::OpenClaw,
            path: home.path().display().to_string(),
        })
        .expect("preview");
        let after = load_scan_roots(&connection).expect("load roots after");

        assert_eq!(before.len(), after.len());
    }

    #[test]
    fn expand_tilde_expands_selected_scan_paths() {
        let home = dirs::home_dir().expect("home dir");

        assert_eq!(
            expand_tilde("~/agentdock-expand-test"),
            home.join("agentdock-expand-test")
        );
    }

    #[test]
    fn selected_scan_persists_scanned_root() {
        let home = tempfile::tempdir().expect("temp home");
        initialize_database_in(home.path()).expect("init db");
        let connection = open_database_in(home.path()).expect("open db");
        let root = crate::scanner::repository_root().join("tests/fixtures/openclaw");

        let records = scan_selected_root_with_connection(
            ScanSelectedRootRequest {
                runtime: AgentRuntime::OpenClaw,
                path: root.display().to_string(),
            },
            &connection,
        )
        .expect("scan selected root");
        let persisted = load_scan_roots(&connection).expect("load roots");

        assert!(!records.is_empty());
        assert!(persisted.iter().any(|scan_root| {
            scan_root.runtime == AgentRuntime::OpenClaw
                && scan_root.path == root
                && scan_root.source == crate::scanner::types::ScanRootSource::UserSelected
        }));
    }
}
