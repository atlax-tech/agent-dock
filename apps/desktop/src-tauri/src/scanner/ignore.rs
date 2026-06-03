use std::path::Path;

const PRIVATE_RUNTIME_DIRS: &[&str] = &[
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

pub fn is_private_runtime_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            PRIVATE_RUNTIME_DIRS
                .iter()
                .any(|private_name| name.eq_ignore_ascii_case(private_name))
        })
        .unwrap_or(false)
}

pub fn private_runtime_dir_names() -> &'static [&'static str] {
    PRIVATE_RUNTIME_DIRS
}

pub fn is_secret_bearing_config_file(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let normalized = file_name.to_ascii_lowercase();

    normalized == ".env"
        || normalized.starts_with(".env.")
        || normalized == "auth.json"
        || prefixed_json(&normalized, "auth.")
        || prefixed_json(&normalized, "oauth")
        || prefixed_json(&normalized, "credential")
        || prefixed_json(&normalized, "credentials")
        || prefixed_json(&normalized, "token")
        || prefixed_json(&normalized, "secret")
        || prefixed_json(&normalized, "cookie")
        || prefixed_json(&normalized, "cookies")
}

fn prefixed_json(file_name: &str, prefix: &str) -> bool {
    file_name.starts_with(prefix) && file_name.ends_with(".json")
}
