use std::{
    env,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuntimeProduct {
    OpenClaw,
    Hermes,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstallStatus {
    product: String,
    installed: bool,
    cli_path: Option<String>,
    version: Option<String>,
    update_available: bool,
    update_command: Option<String>,
    home_dir: Option<String>,
    config_path: Option<String>,
    gateway_running: Option<bool>,
    detection_confidence: String,
    warnings: Vec<String>,
}

#[derive(Debug, Clone)]
struct DetectionOptions {
    home_dir: PathBuf,
    hermes_home: Option<PathBuf>,
    path_var: Option<OsString>,
}

impl DetectionOptions {
    fn from_env() -> Self {
        Self {
            home_dir: dirs::home_dir().unwrap_or_else(|| PathBuf::from("~")),
            hermes_home: env::var_os("HERMES_HOME").map(PathBuf::from),
            path_var: env::var_os("PATH"),
        }
    }
}

#[tauri::command]
pub fn detect_runtime_install_statuses() -> Vec<RuntimeInstallStatus> {
    let options = DetectionOptions::from_env();
    vec![detect_openclaw(&options), detect_hermes(&options)]
}

#[tauri::command]
pub async fn update_runtime_product(product: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || update_runtime_product_blocking(&product))
        .await
        .map_err(|error| error.to_string())?
}

fn detect_openclaw(options: &DetectionOptions) -> RuntimeInstallStatus {
    detect_runtime(
        RuntimeProduct::OpenClaw,
        "openclaw",
        vec![options.home_dir.join(".openclaw")],
        options,
    )
}

fn detect_hermes(options: &DetectionOptions) -> RuntimeInstallStatus {
    let mut candidates = Vec::new();
    if let Some(hermes_home) = &options.hermes_home {
        candidates.push(hermes_home.clone());
    }
    candidates.push(options.home_dir.join(".hermes"));

    detect_runtime(RuntimeProduct::Hermes, "hermes", candidates, options)
}

fn detect_runtime(
    product: RuntimeProduct,
    cli_name: &str,
    home_candidates: Vec<PathBuf>,
    options: &DetectionOptions,
) -> RuntimeInstallStatus {
    let cli_path = find_cli(cli_name, options.path_var.as_ref());
    let raw_version = cli_path.as_ref().and_then(|path| read_cli_version(path));
    let version = raw_version.as_deref().and_then(extract_version_number);
    let update_available = raw_version
        .as_deref()
        .map(version_reports_update_available)
        .unwrap_or(false);
    let home_dir = home_candidates.into_iter().find(|path| path.is_dir());
    let config_path = home_dir.as_ref().filter(|path| path.is_dir()).cloned();

    let confidence = confidence(cli_path.is_some(), version.is_some(), config_path.is_some());
    let mut warnings = Vec::new();

    if cli_path.is_some() && version.is_none() {
        warnings.push(format!(
            "{cli_name} CLI was found but `{cli_name} --version` did not return a usable version."
        ));
    }
    if cli_path.is_none() && config_path.is_some() {
        warnings.push(format!(
            "{} home/config directory exists but CLI was not found in PATH.",
            product.label()
        ));
    }
    if cli_path.is_some() && config_path.is_none() {
        warnings.push(format!(
            "{} CLI exists but default home/config directory was not found.",
            product.label()
        ));
    }
    if matches!(confidence, "unknown") {
        warnings.push(format!(
            "No reliable {} CLI or home/config evidence was found.",
            product.label()
        ));
    }

    RuntimeInstallStatus {
        product: product.id().to_string(),
        installed: matches!(confidence, "high" | "medium"),
        cli_path: cli_path.map(|path| path.display().to_string()),
        version,
        update_available,
        update_command: Some(format!("{cli_name} update")),
        home_dir: home_dir.map(|path| path.display().to_string()),
        config_path: config_path.map(|path| path.display().to_string()),
        gateway_running: None,
        detection_confidence: confidence.to_string(),
        warnings,
    }
}

fn update_runtime_product_blocking(product: &str) -> Result<String, String> {
    let cli_name = match product {
        "openclaw" => "openclaw",
        "hermes" => "hermes",
        _ => return Err("Unsupported runtime product.".to_string()),
    };
    let options = DetectionOptions::from_env();
    let cli_path = find_cli(cli_name, options.path_var.as_ref())
        .ok_or_else(|| format!("{cli_name} CLI was not found in PATH."))?;
    let output = Command::new(&cli_path)
        .arg("update")
        .output()
        .map_err(|error| format!("Failed to run `{cli_name} update`: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let detail = if stderr.is_empty() { stdout } else { stderr };
        return Err(if detail.is_empty() {
            format!("`{cli_name} update` failed.")
        } else {
            format!("`{cli_name} update` failed: {detail}")
        });
    }
    if stdout.is_empty() {
        Ok(stderr)
    } else {
        Ok(stdout)
    }
}

fn confidence(cli_found: bool, version_found: bool, config_found: bool) -> &'static str {
    if cli_found && version_found && config_found {
        "high"
    } else if cli_found {
        "medium"
    } else if config_found {
        "low"
    } else {
        "unknown"
    }
}

fn find_cli(cli_name: &str, path_var: Option<&OsString>) -> Option<PathBuf> {
    let path_var = path_var?;
    env::split_paths(path_var).find_map(|dir| {
        let candidate = dir.join(cli_name);
        if is_executable_file(&candidate) {
            Some(candidate)
        } else {
            None
        }
    })
}

fn is_executable_file(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file())
        .unwrap_or(false)
}

fn read_cli_version(cli_path: &Path) -> Option<String> {
    let output = Command::new(cli_path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let version = if stdout.is_empty() { stderr } else { stdout };

    if version.is_empty() {
        None
    } else {
        Some(version)
    }
}

fn extract_version_number(raw: &str) -> Option<String> {
    raw.split_whitespace()
        .map(|part| {
            part.trim_matches(|ch: char| {
                matches!(ch, '(' | ')' | ',' | ';' | ':' | '[' | ']') || ch == 'v'
            })
        })
        .find(|part| {
            let mut segments = part.split('.');
            matches!(
                (segments.next(), segments.next()),
                (Some(major), Some(minor))
                    if major.chars().all(|ch| ch.is_ascii_digit())
                        && minor.chars().all(|ch| ch.is_ascii_digit())
            )
        })
        .map(str::to_string)
}

fn version_reports_update_available(raw: &str) -> bool {
    let normalized = raw.to_ascii_lowercase();
    normalized.contains("update available")
        || normalized.contains("new version")
        || normalized.contains("upgrade available")
        || normalized.contains("有新版本")
}

impl RuntimeProduct {
    fn id(self) -> &'static str {
        match self {
            RuntimeProduct::OpenClaw => "openclaw",
            RuntimeProduct::Hermes => "hermes",
        }
    }

    fn label(self) -> &'static str {
        match self {
            RuntimeProduct::OpenClaw => "OpenClaw",
            RuntimeProduct::Hermes => "Hermes",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, io::Write};

    #[test]
    fn reports_unknown_when_cli_and_home_are_absent() {
        let temp = tempfile::tempdir().unwrap();
        let options = DetectionOptions {
            home_dir: temp.path().join("home"),
            hermes_home: None,
            path_var: Some(OsString::from(temp.path().join("bin"))),
        };

        let openclaw = detect_openclaw(&options);
        let hermes = detect_hermes(&options);

        assert!(!openclaw.installed);
        assert_eq!(openclaw.detection_confidence, "unknown");
        assert!(!hermes.installed);
        assert_eq!(hermes.detection_confidence, "unknown");
    }

    #[test]
    fn reports_high_when_cli_version_and_home_exist() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let bin = temp.path().join("bin");
        fs::create_dir_all(home.join(".openclaw")).unwrap();
        fs::create_dir_all(home.join(".hermes")).unwrap();
        fs::create_dir_all(&bin).unwrap();
        write_version_cli(&bin.join("openclaw"), "openclaw 1.2.3");
        write_version_cli(&bin.join("hermes"), "hermes 4.5.6");

        let options = DetectionOptions {
            home_dir: home.clone(),
            hermes_home: None,
            path_var: Some(OsString::from(&bin)),
        };

        let openclaw = detect_openclaw(&options);
        let hermes = detect_hermes(&options);

        assert!(openclaw.installed);
        assert_eq!(openclaw.version.as_deref(), Some("1.2.3"));
        assert_eq!(
            openclaw.home_dir.as_deref(),
            Some(home.join(".openclaw").to_str().unwrap())
        );
        assert_eq!(openclaw.detection_confidence, "high");
        assert!(hermes.installed);
        assert_eq!(hermes.version.as_deref(), Some("4.5.6"));
        assert_eq!(
            hermes.home_dir.as_deref(),
            Some(home.join(".hermes").to_str().unwrap())
        );
        assert_eq!(hermes.detection_confidence, "high");
    }

    #[test]
    fn extracts_clean_version_and_update_state_from_cli_output() {
        assert_eq!(
            extract_version_number(
                "Hermes Agent v0.15.1 (2026.5.29) Project: /tmp Update available: run 'hermes update'"
            )
            .as_deref(),
            Some("0.15.1")
        );
        assert!(version_reports_update_available(
            "Hermes Agent v0.15.1 Update available: run 'hermes update'"
        ));
        assert!(!version_reports_update_available("openclaw 1.2.3"));
    }

    #[test]
    fn hermes_home_env_candidate_takes_precedence() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let hermes_home = temp.path().join("custom-hermes");
        fs::create_dir_all(home.join(".hermes")).unwrap();
        fs::create_dir_all(&hermes_home).unwrap();

        let options = DetectionOptions {
            home_dir: home,
            hermes_home: Some(hermes_home.clone()),
            path_var: None,
        };

        let hermes = detect_hermes(&options);

        assert!(!hermes.installed);
        assert_eq!(hermes.detection_confidence, "low");
        assert_eq!(
            hermes.home_dir.as_deref(),
            Some(hermes_home.to_str().unwrap())
        );
    }

    #[cfg(unix)]
    fn write_version_cli(path: &Path, version: &str) {
        use std::os::unix::fs::PermissionsExt;

        let mut file = fs::File::create(path).unwrap();
        writeln!(file, "#!/bin/sh").unwrap();
        writeln!(file, "echo '{version}'").unwrap();
        let mut permissions = file.metadata().unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).unwrap();
    }

    #[cfg(not(unix))]
    fn write_version_cli(path: &Path, version: &str) {
        let mut file = fs::File::create(path).unwrap();
        writeln!(file, "@echo off").unwrap();
        writeln!(file, "echo {version}").unwrap();
    }
}
