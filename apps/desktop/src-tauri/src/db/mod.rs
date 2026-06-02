use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde::Serialize;
use thiserror::Error;

use crate::scanner::types::{
    AgentRuntime, AgentScanRecord, HealthStatus, ScanRoot, ScanRootSource,
};

const DATABASE_FILE: &str = "agentdock.sqlite";

const TABLES: &[&str] = &[
    "app_settings",
    "scanned_roots",
    "agent_index",
    "provider_profiles",
    "backups",
    "migration_history",
];

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("could not resolve the user home directory")]
    HomeDirectoryUnavailable,
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Serialize)]
pub struct DatabaseReport {
    pub db_path: String,
    pub created: bool,
    pub tables: Vec<&'static str>,
}

pub fn initialize_database() -> Result<DatabaseReport, DatabaseError> {
    let home_dir = dirs::home_dir().ok_or(DatabaseError::HomeDirectoryUnavailable)?;
    initialize_database_in(&home_dir)
}

pub fn open_database() -> Result<Connection, DatabaseError> {
    let home_dir = dirs::home_dir().ok_or(DatabaseError::HomeDirectoryUnavailable)?;
    open_database_in(&home_dir)
}

pub fn open_database_in(home_dir: &Path) -> Result<Connection, DatabaseError> {
    let report = initialize_database_in(home_dir)?;
    Ok(Connection::open(report.db_path)?)
}

pub fn initialize_database_in(home_dir: &Path) -> Result<DatabaseReport, DatabaseError> {
    let app_dir = home_dir.join(".agentdock");
    fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join(DATABASE_FILE);
    let created = !db_path.exists();
    let connection = Connection::open(&db_path)?;

    create_schema(&connection)?;

    Ok(DatabaseReport {
        db_path: db_path.display().to_string(),
        created,
        tables: TABLES.to_vec(),
    })
}

fn create_schema(connection: &Connection) -> Result<(), DatabaseError> {
    connection.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scanned_roots (
          id TEXT PRIMARY KEY,
          runtime TEXT NOT NULL,
          path TEXT NOT NULL,
          enabled INTEGER NOT NULL,
          last_scanned_at TEXT
        );

        CREATE TABLE IF NOT EXISTS agent_index (
          id TEXT PRIMARY KEY,
          runtime TEXT NOT NULL,
          display_name TEXT NOT NULL,
          root_path TEXT NOT NULL,
          workspace_path TEXT,
          profile_path TEXT,
          config_path TEXT,
          env_path TEXT,
          soul_path TEXT,
          agents_path TEXT,
          user_path TEXT,
          memory_path TEXT,
          sessions_path TEXT,
          detected_provider TEXT,
          default_model TEXT,
          fallback_model TEXT,
          status TEXT NOT NULL,
          warnings_json TEXT NOT NULL,
          last_scanned_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          base_url TEXT,
          api_key_ref TEXT,
          default_model TEXT,
          fallback_model TEXT,
          validation_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS backups (
          id TEXT PRIMARY KEY,
          runtime TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          source_paths_json TEXT NOT NULL,
          backup_path TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS migration_history (
          id TEXT PRIMARY KEY,
          source_runtime TEXT NOT NULL,
          source_agent_id TEXT NOT NULL,
          target_runtime TEXT NOT NULL,
          target_agent_id TEXT NOT NULL,
          report_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        "#,
    )?;

    migrate_phase_one_columns(connection)?;

    Ok(())
}

fn migrate_phase_one_columns(connection: &Connection) -> Result<(), DatabaseError> {
    add_column_if_missing(
        connection,
        "scanned_roots",
        "source",
        "TEXT NOT NULL DEFAULT 'defaultCandidate'",
    )?;
    add_column_if_missing(
        connection,
        "scanned_roots",
        "exists",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column_if_missing(
        connection,
        "scanned_roots",
        "readable",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column_if_missing(
        connection,
        "agent_index",
        "config_paths_json",
        "TEXT NOT NULL DEFAULT '[]'",
    )?;
    add_column_if_missing(
        connection,
        "agent_index",
        "personality_files_json",
        "TEXT NOT NULL DEFAULT '[]'",
    )?;
    add_column_if_missing(
        connection,
        "agent_index",
        "skill_paths_json",
        "TEXT NOT NULL DEFAULT '[]'",
    )?;
    add_column_if_missing(
        connection,
        "agent_index",
        "provider_summary_json",
        "TEXT NOT NULL DEFAULT '{}'",
    )?;
    add_column_if_missing(
        connection,
        "agent_index",
        "model_summary_json",
        "TEXT NOT NULL DEFAULT '{}'",
    )?;
    add_column_if_missing(
        connection,
        "agent_index",
        "channel_summary_json",
        "TEXT NOT NULL DEFAULT '{}'",
    )?;
    add_column_if_missing(
        connection,
        "agent_index",
        "health_status",
        "TEXT NOT NULL DEFAULT 'warning'",
    )?;
    Ok(())
}

fn add_column_if_missing(
    connection: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), DatabaseError> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(());
        }
    }
    connection.execute_batch(&format!(
        "ALTER TABLE {table} ADD COLUMN \"{column}\" {definition};"
    ))?;
    Ok(())
}

pub fn upsert_scan_roots(connection: &Connection, roots: &[ScanRoot]) -> Result<(), DatabaseError> {
    for root in roots {
        let id = format!("{}:{}", root.runtime.as_str(), root.path.display());
        connection.execute(
            r#"
            INSERT INTO scanned_roots
              (id, runtime, path, enabled, last_scanned_at, source, "exists", readable)
            VALUES
              (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
              runtime = excluded.runtime,
              path = excluded.path,
              last_scanned_at = excluded.last_scanned_at,
              source = excluded.source,
              "exists" = excluded."exists",
              readable = excluded.readable
            "#,
            (
                id,
                root.runtime.as_str(),
                root.path.display().to_string(),
                root.last_scanned_at.as_deref(),
                serde_json::to_string(&root.source)?,
                bool_as_i64(root.exists),
                bool_as_i64(root.readable),
            ),
        )?;
    }
    Ok(())
}

pub fn upsert_agent_records(
    connection: &Connection,
    records: &[AgentScanRecord],
) -> Result<(), DatabaseError> {
    for record in records {
        let paths = record
            .config_paths
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>();
        let personalities = record
            .personality_files
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>();
        let skills = record
            .skill_paths
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>();

        connection.execute(
            r#"
            INSERT INTO agent_index
              (id, runtime, display_name, root_path, workspace_path, profile_path, config_path,
               env_path, soul_path, agents_path, user_path, memory_path, sessions_path,
               detected_provider, default_model, fallback_model, status, warnings_json,
               last_scanned_at, config_paths_json, personality_files_json, skill_paths_json,
               provider_summary_json, model_summary_json, channel_summary_json, health_status)
            VALUES
              (?1, ?2, ?3, ?4, NULL, NULL, ?5, NULL, NULL, NULL, NULL, NULL, NULL,
               ?6, ?7, ?8, 'indexed', ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
            ON CONFLICT(id) DO UPDATE SET
              runtime = excluded.runtime,
              display_name = excluded.display_name,
              root_path = excluded.root_path,
              config_path = excluded.config_path,
              detected_provider = excluded.detected_provider,
              default_model = excluded.default_model,
              fallback_model = excluded.fallback_model,
              status = excluded.status,
              warnings_json = excluded.warnings_json,
              last_scanned_at = excluded.last_scanned_at,
              config_paths_json = excluded.config_paths_json,
              personality_files_json = excluded.personality_files_json,
              skill_paths_json = excluded.skill_paths_json,
              provider_summary_json = excluded.provider_summary_json,
              model_summary_json = excluded.model_summary_json,
              channel_summary_json = excluded.channel_summary_json,
              health_status = excluded.health_status
            "#,
            params![
                &record.id,
                record.runtime.as_str(),
                &record.name,
                record.root_path.display().to_string(),
                paths.first().cloned(),
                record.provider_summary.provider.as_deref(),
                record.model_summary.default_model.as_deref(),
                record.model_summary.fallback_model.as_deref(),
                serde_json::to_string(&record.warnings)?,
                &record.last_scanned_at,
                serde_json::to_string(&paths)?,
                serde_json::to_string(&personalities)?,
                serde_json::to_string(&skills)?,
                serde_json::to_string(&record.provider_summary)?,
                serde_json::to_string(&record.model_summary)?,
                serde_json::to_string(&record.channel_summary)?,
                health_status_text(record.health_status),
            ],
        )?;
    }
    Ok(())
}

pub fn load_agent_records(connection: &Connection) -> Result<Vec<AgentScanRecord>, DatabaseError> {
    let mut statement = connection.prepare(
        r#"
        SELECT id, runtime, display_name, root_path, config_paths_json, personality_files_json,
               skill_paths_json, provider_summary_json, model_summary_json, channel_summary_json,
               warnings_json, health_status, last_scanned_at
        FROM agent_index
        ORDER BY runtime, display_name
        "#,
    )?;
    let rows = statement.query_map([], |row| {
        let runtime_text: String = row.get(1)?;
        let runtime = if runtime_text == AgentRuntime::Hermes.as_str() {
            AgentRuntime::Hermes
        } else {
            AgentRuntime::OpenClaw
        };
        Ok(AgentScanRecord {
            id: row.get(0)?,
            runtime,
            name: row.get(2)?,
            root_path: PathBuf::from(row.get::<_, String>(3)?),
            config_paths: json_paths(row.get::<_, String>(4)?),
            personality_files: json_paths(row.get::<_, String>(5)?),
            skill_paths: json_paths(row.get::<_, String>(6)?),
            provider_summary: serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or_default(),
            model_summary: serde_json::from_str(&row.get::<_, String>(8)?).unwrap_or_default(),
            channel_summary: serde_json::from_str(&row.get::<_, String>(9)?).unwrap_or_default(),
            warnings: serde_json::from_str(&row.get::<_, String>(10)?).unwrap_or_default(),
            health_status: parse_health_status(&row.get::<_, String>(11)?),
            last_scanned_at: row.get(12)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(DatabaseError::from)
}

pub fn load_scan_roots(connection: &Connection) -> Result<Vec<ScanRoot>, DatabaseError> {
    let mut statement = connection.prepare(
        r#"
        SELECT runtime, path, source, "exists", readable, last_scanned_at
        FROM scanned_roots
        WHERE enabled = 1
        ORDER BY runtime, path
        "#,
    )?;
    let rows = statement.query_map([], |row| {
        let runtime_text: String = row.get(0)?;
        let runtime = parse_runtime(&runtime_text);
        let source_text: String = row.get(2)?;
        Ok(ScanRoot {
            runtime,
            path: PathBuf::from(row.get::<_, String>(1)?),
            source: parse_scan_root_source(&source_text),
            exists: row.get::<_, i64>(3)? == 1,
            readable: row.get::<_, i64>(4)? == 1,
            last_scanned_at: row.get(5)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(DatabaseError::from)
}

fn json_paths(value: String) -> Vec<PathBuf> {
    serde_json::from_str::<Vec<String>>(&value)
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

fn parse_runtime(value: &str) -> AgentRuntime {
    if value == AgentRuntime::Hermes.as_str() {
        AgentRuntime::Hermes
    } else {
        AgentRuntime::OpenClaw
    }
}

fn parse_scan_root_source(value: &str) -> ScanRootSource {
    serde_json::from_str(value).unwrap_or_else(|_| match value {
        "fixture" => ScanRootSource::Fixture,
        "userSelected" => ScanRootSource::UserSelected,
        _ => ScanRootSource::DefaultCandidate,
    })
}

fn health_status_text(value: HealthStatus) -> &'static str {
    match value {
        HealthStatus::Ok => "ok",
        HealthStatus::Warning => "warning",
        HealthStatus::Error => "error",
    }
}

fn parse_health_status(value: &str) -> HealthStatus {
    match value {
        "ok" => HealthStatus::Ok,
        "error" => HealthStatus::Error,
        _ => HealthStatus::Warning,
    }
}

fn bool_as_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

#[allow(dead_code)]
fn database_path(home_dir: &Path) -> PathBuf {
    home_dir.join(".agentdock").join(DATABASE_FILE)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use tempfile::tempdir;

    use super::*;
    use crate::scanner::scan_root;
    use crate::scanner::types::ScanRootSource;

    #[test]
    fn initializes_sqlite_database_under_agentdock_home() {
        let home = tempdir().expect("temp home");
        let report = initialize_database_in(home.path()).expect("database initialized");

        assert!(report.created);
        assert_eq!(report.tables, TABLES);

        let db_path = database_path(home.path());
        assert_eq!(report.db_path, db_path.display().to_string());
        assert!(db_path.exists());

        let connection = Connection::open(db_path).expect("open sqlite");
        for table in TABLES {
            let count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .expect("table exists query");
            assert_eq!(count, 1, "missing table {table}");
        }
    }

    #[test]
    fn persists_and_reloads_scan_roots_without_duplicates() {
        let home = tempdir().expect("temp home");
        let connection = open_database_in(home.path()).expect("open sqlite");
        let selected_path = home.path().join("agentdock-fixture-openclaw");
        fs::create_dir_all(&selected_path).expect("create selected root");
        let root = scan_root(
            AgentRuntime::OpenClaw,
            selected_path.clone(),
            ScanRootSource::UserSelected,
        );

        upsert_scan_roots(&connection, &[root.clone(), root]).expect("upsert roots");
        let reloaded = load_scan_roots(&connection).expect("load roots");

        assert_eq!(reloaded.len(), 1);
        assert_eq!(reloaded[0].runtime, AgentRuntime::OpenClaw);
        assert_eq!(reloaded[0].path, selected_path);
        assert_eq!(reloaded[0].source, ScanRootSource::UserSelected);
        assert!(reloaded[0].exists);
        assert!(reloaded[0].readable);
    }
}
