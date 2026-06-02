use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;

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

    Ok(())
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
}
