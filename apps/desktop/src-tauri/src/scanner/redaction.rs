use serde_json::Value;

const SECRET_FIELD_KEYWORDS: &[&str] = &[
    "api_key",
    "apikey",
    "key",
    "token",
    "secret",
    "password",
    "credential",
    "credentials",
    "oauth",
    "auth",
    "bearer",
    "cookie",
    "session",
];

pub const REDACTED_VALUE: &str = "••••••••";

pub fn is_secret_field(field_name: &str) -> bool {
    let normalized = field_name.to_ascii_lowercase();
    SECRET_FIELD_KEYWORDS
        .iter()
        .any(|keyword| normalized.contains(keyword))
}

pub fn collect_secret_fields(value: &Value) -> Vec<String> {
    let mut fields = Vec::new();
    collect_secret_fields_inner(value, None, &mut fields);
    fields.sort();
    fields.dedup();
    fields
}

fn collect_secret_fields_inner(value: &Value, parent: Option<&str>, fields: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if is_secret_field(key) {
                    fields.push(key.to_string());
                }
                collect_secret_fields_inner(child, Some(key), fields);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_secret_fields_inner(item, parent, fields);
            }
        }
        _ => {}
    }
}

pub fn redacted_marker() -> &'static str {
    REDACTED_VALUE
}
