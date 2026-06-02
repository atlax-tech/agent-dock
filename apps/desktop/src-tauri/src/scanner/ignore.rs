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
