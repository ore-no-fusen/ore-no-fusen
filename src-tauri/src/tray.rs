use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, AppHandle, Runtime, Emitter,
};
use crate::state::AppState;
use crate::logic;
use crate::storage;
use std::sync::Mutex;

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    refresh_tray_menu(app)
}


pub fn refresh_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // [i18n] Get language setting
    let lang = match crate::settings::get_settings(app.clone()) {
        Ok(s) => s.language,
        Err(_) => "ja".to_string(),
    };
    let is_en = lang == "en";

    // Labels
    let label_hide = if is_en { "Hide All" } else { "全部隠す (Hide All)" };
    let label_show = if is_en { "Show All" } else { "全部戻す (Show All)" };
    let label_settings = if is_en { "Settings" } else { "設定 (Settings)" };
    let label_new_note = if is_en { "New Note" } else { "新規メモ (New Note)" };
    let label_search = if is_en { "Search" } else { "検索 (Search)" }; // [NEW] 全文検索
    let label_filter = if is_en { "Filter by Tags" } else { "タグで絞り込む (Filter by Tags)" };
    let label_quit = if is_en { "Quit" } else { "終了 (Quit)" };

    let hide_i = MenuItem::with_id(app, "hide_all", label_hide, true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show_all", label_show, true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "open_settings", label_settings, true, None::<&str>)?; 
    let new_note_i = MenuItem::with_id(app, "create_note", label_new_note, true, None::<&str>)?; // [NEW]
    let search_i = MenuItem::with_id(app, "open_search", label_search, true, None::<&str>)?; // [NEW] 全文検索
    
    // Generate Tag Filter Submenu
    let world_menu = tauri::menu::Submenu::with_id(app, "choose_world", label_filter, true)?;
    
    // Get tags from state
    let state = app.state::<Mutex<AppState>>();
    let mut app_state = state.lock().unwrap();
    
    // 常にノート一覧を再読み込み（タグ更新を反映するため）
    if let Some(base_path) = &app_state.base_path.clone() {
        app_state.notes = storage::list_notes(base_path);
    }
    
    let tags = logic::get_all_unique_tags(&*app_state);
    let active_tags = app_state.active_tags.clone(); // 選択中のタグ
    
    for tag in tags {
        let is_selected = active_tags.contains(&tag);
        let text = if is_selected { format!("☑ {}", tag) } else { format!("☐ {}", tag) };
        let item = MenuItem::with_id(app, format!("world_{}", tag), text, true, None::<&str>)?;
        world_menu.append(&item)?;
    }
    
    let quit_i = MenuItem::with_id(app, "quit", label_quit, true, None::<&str>)?;
    
    let menu = Menu::with_items(app, &[
        &new_note_i, // [NEW] 最上部に配置
        &search_i, // [NEW] 全文検索
        &tauri::menu::PredefinedMenuItem::separator(app)?, 
        &hide_i, 
        &show_i, 
        &tauri::menu::PredefinedMenuItem::separator(app)?, 
        &world_menu, 
        &tauri::menu::PredefinedMenuItem::separator(app)?, 
        &settings_i,
        &tauri::menu::PredefinedMenuItem::separator(app)?, 
        &quit_i
    ])?;

    // Use existing tray or build new one
    if let Some(tray) = app.tray_by_id("tray") {
        tray.set_menu(Some(menu))?;
    } else {
        // Icon
        let icon_bytes = include_bytes!("../icons/icon.ico");
        let icon = tauri::image::Image::from_bytes(icon_bytes).expect("Failed to parse icon");

        let _tray = TrayIconBuilder::with_id("tray")
            .icon(icon)
            .menu(&menu)
            .show_menu_on_left_click(true)
            .on_menu_event(move |app, event| {
                let id = event.id().as_ref();
                match id {
                    "hide_all" => {
                        for win in app.webview_windows().values() {
                            if win.label() != "main" {
                                let _ = win.hide();
                            }
                        }
                    },
                    "show_all" => {
                        for win in app.webview_windows().values() {
                            if win.label() != "main" {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    },

                    id if id.starts_with("world_") => {
                        let tag = id.replace("world_", "");
                        
                        // Toggle tag in active_tags
                        let state = app.state::<Mutex<AppState>>();
                        let mut app_state = state.lock().unwrap();
                        if app_state.active_tags.contains(&tag) {
                            app_state.active_tags.retain(|t| t != &tag);
                        } else {
                            app_state.active_tags.push(tag.clone());
                        }
                        let active_tags = app_state.active_tags.clone();
                        drop(app_state);
                        
                        // DEBUG LOG
                        eprintln!("[Tray] Toggled tag '{}'. Current Active Tags: {:?}", tag, active_tags);

                        // Refresh menu to update checkboxes
                        let _ = refresh_tray_menu(app);
                        
                        // Rust側で直接ウィンドウフィルタリングを実行
                        let state = app.state::<Mutex<AppState>>();
                        if let Err(e) = crate::apply_tag_filter_windows(app, state, &active_tags) {
                            eprintln!("[Tray] Failed to apply tag filter: {}", e);
                        }
                    },
                    "quit" => {
                        app.exit(0);
                    },
                    "open_settings" => { 
                        eprintln!("[Tray] Opening settings...");
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.emit("fusen:open_settings", ()); 
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    },
                    "create_note" => { // [NEW] 新規作成イベント
                        eprintln!("[Tray] Creating new note...");
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.emit("fusen:create_note_from_tray", ());
                        }
                    },
                    "open_search" => { // [NEW] 全文検索
                        eprintln!("[Tray] Opening search...");
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.emit("fusen:open_search", ());
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    },
                    _ => {}
                }
            })
            .build(app)?;
    }

    Ok(())
}
