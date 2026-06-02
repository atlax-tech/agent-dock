pub mod commands;
pub mod db;

pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            db::initialize_database()
                .map(|_| ())
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap::bootstrap_status,
            commands::fixtures::fixture_scan_summary
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AgentDock desktop app");
}
