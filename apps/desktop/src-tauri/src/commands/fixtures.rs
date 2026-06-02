use std::path::PathBuf;

use serde::Serialize;

const REQUIRED_FIXTURES: &[&str] = &[
    "openclaw-basic",
    "openclaw-multi-agent",
    "hermes-basic",
    "hermes-multi-profile",
    "migration-openclaw-to-hermes",
    "migration-hermes-to-openclaw",
];

#[derive(Debug, Serialize)]
pub struct FixtureRoot {
    name: String,
    path: String,
    exists: bool,
}

#[tauri::command]
pub fn fixture_scan_summary() -> Vec<FixtureRoot> {
    let fixtures_root = repository_root().join("tests").join("fixtures");

    REQUIRED_FIXTURES
        .iter()
        .map(|name| {
            let path = fixtures_root.join(name);
            FixtureRoot {
                name: (*name).to_string(),
                path: path.display().to_string(),
                exists: path.is_dir(),
            }
        })
        .collect()
}

fn repository_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_required_fixture_roots_only() {
        let roots = fixture_scan_summary();

        assert_eq!(roots.len(), REQUIRED_FIXTURES.len());
        assert!(roots.iter().all(|root| root.path.contains("tests/fixtures")));
        assert!(roots.iter().any(|root| root.name == "openclaw-basic"));
        assert!(roots.iter().any(|root| root.name == "hermes-basic"));
    }
}
