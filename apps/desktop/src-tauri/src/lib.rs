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
            commands::agent_profiles::scan_managed_agents,
            commands::bootstrap::bootstrap_status,
            commands::fixtures::fixture_scan_summary,
            commands::scanner::get_initial_scan_state,
            commands::scanner::get_scan_roots,
            commands::scanner::preview_scan_root,
            commands::scanner::scan_fixture_roots,
            commands::scanner::scan_selected_root,
            commands::scanner::scan_default_candidates,
            commands::scanner::get_agent_index,
            commands::personality::get_agent_detail,
            commands::personality::read_personality_file,
            commands::personality::create_personality_update_plan,
            commands::personality::apply_personality_update,
            commands::personality::list_agent_backups,
            commands::personality::create_personality_restore_plan,
            commands::personality::restore_personality_backup,
            commands::providers::list_provider_profiles,
            commands::providers::save_provider_profile,
            commands::providers::delete_provider_profile_command,
            commands::providers::update_provider_profile_sort_order_command,
            commands::providers::export_provider_profiles,
            commands::providers::import_provider_profiles,
            commands::providers::list_agent_model_providers,
            commands::providers::resolve_effective_model_preview,
            commands::providers::create_model_provider_update_plan,
            commands::providers::apply_model_provider_update,
            commands::providers::validate_openai_provider,
            commands::providers::scan_ollama_runtime,
            commands::providers::scan_lmstudio_runtime,
            commands::providers::scan_comfy_runtime,
            commands::runtime_detection::detect_runtime_install_statuses,
            commands::runtime_detection::get_runtime_version_detail,
            commands::runtime_detection::update_runtime_product,
            commands::lifecycle::create_agent_plan,
            commands::lifecycle::apply_create_agent,
            commands::lifecycle::create_profile_plan,
            commands::lifecycle::apply_create_profile,
            commands::lifecycle::duplicate_agent_plan,
            commands::lifecycle::apply_duplicate_agent,
            commands::lifecycle::delete_agent_plan,
            commands::lifecycle::create_delete_agent_mutation_plan,
            commands::lifecycle::apply_delete_agent_mutation_plan,
            commands::lifecycle::apply_delete_agent,
            commands::lifecycle::list_trash_items,
            commands::lifecycle::restore_trash_item_plan,
            commands::lifecycle::apply_restore_trash_item
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AgentDock desktop app");
}
