pub mod commands;
pub mod db;
pub mod scanner;

pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            db::initialize_database()
                .map(|_| ())
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap::bootstrap_status,
            commands::fixtures::fixture_scan_summary,
            commands::scanner::get_initial_scan_state,
            commands::scanner::get_scan_roots,
            commands::scanner::preview_scan_root,
            commands::scanner::scan_fixture_roots,
            commands::scanner::scan_selected_root,
            commands::scanner::scan_default_candidates,
            commands::scanner::get_agent_index
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AgentDock desktop app");
}
