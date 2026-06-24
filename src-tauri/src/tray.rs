/*
 * システムトレイ管理
 *
 * 責務:
 * - タスクトレイアイコンとメニューの作成・更新
 * - トレイメニューイベントのハンドリング（表示/非表示、終了など）
 * - 言語設定に応じたメニュー項目のローカライズ
 */

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
    let label_hide = if is_en { "Hide All\tCtrl+Shift+H" } else { "全部隠す (Ctrl+Shift+H)" };
    let label_show = if is_en { "Show All" } else { "全部戻す (Show All)" };
    let label_settings = if is_en { "Settings" } else { "設定 (Settings)" };
    let label_new_note = if is_en { "New Note" } else { "新規メモ (New Note)" };
    let label_search = if is_en { "Search" } else { "検索 (Search)" }; // [NEW] 全文検索
    let label_arrange_by_tag = if is_en { "Arrange by Tag" } else { "タグで整列 (Arrange by Tag)" };
    let label_arrange_undo = if is_en { "Undo Arrange" } else { "整列を元に戻す (Undo Arrange)" };
    let label_filter = if is_en { "Filter by Tags" } else { "タグで絞り込む (Filter by Tags)" };
    let label_quit = if is_en { "Quit" } else { "終了 (Quit)" };

    let hide_i = MenuItem::with_id(app, "hide_all", label_hide, true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show_all", label_show, true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "open_settings", label_settings, true, None::<&str>)?; 
    let new_note_i = MenuItem::with_id(app, "create_note", label_new_note, true, None::<&str>)?; // [NEW]
    let search_i = MenuItem::with_id(app, "open_search", label_search, true, None::<&str>)?; // [NEW] 全文検索
    let arrange_by_tag_i = MenuItem::with_id(app, "arrange_by_tag", label_arrange_by_tag, true, None::<&str>)?;
    let arrange_undo_i = MenuItem::with_id(app, "arrange_undo", label_arrange_undo, true, None::<&str>)?;
    
    // Generate Tag Filter Submenu
    let world_menu = tauri::menu::Submenu::with_id(app, "choose_world", label_filter, true)?;
    
    // Get tags from state
    let state = app.state::<Mutex<AppState>>();
    let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());

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
        &arrange_by_tag_i,
        &arrange_undo_i,
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
                        if !crate::can_do_visibility_op() { return; }
                        let _ = app.emit("fusen:set_all_notes_visible", false);
                    },
                    "show_all" => {
                        if !crate::can_do_visibility_op() { return; }
                        let _ = app.emit("fusen:set_all_notes_visible", true);
                    },
                    id if id.starts_with("world_") => {
                        let tag = id.replace("world_", "");
                        let app_clone = app.clone();
                        // refresh_tray_menu と update_tag_filter 両方をメインスレッドから外す
                        // （Win32同期メッセージによるスタック消費を防ぐ）
                        std::thread::spawn(move || {
                            let state = app_clone.state::<Mutex<AppState>>();
                            let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
                            if app_state.active_tags.contains(&tag) {
                                app_state.active_tags.retain(|t| t != &tag);
                            } else {
                                app_state.active_tags.push(tag.clone());
                            }
                            let active_tags = app_state.active_tags.clone();
                            drop(app_state);

                            eprintln!("[Tray] Toggled tag '{}'. Current Active Tags: {:?}", tag, active_tags);

                            let _ = refresh_tray_menu(&app_clone);

                            let state = app_clone.state::<Mutex<AppState>>();
                            if let Err(e) = crate::update_tag_filter(&app_clone, state, &active_tags) {
                                eprintln!("[Tray] Failed to apply tag filter: {}", e);
                            }
                        });
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
                    "arrange_by_tag" => {
                        crate::logger::log_info("[Tray] Arrange by Tag trigger");
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = crate::run_fusen_arrange_by_tag(app_handle).await {
                                crate::logger::log_warn(&format!("[Tray] Arrange by Tag failed: {}", e));
                            }
                        });
                    },
                    "arrange_undo" => {
                        crate::logger::log_info("[Tray] Undo Arrange trigger");
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = crate::run_fusen_arrange_undo(app_handle).await {
                                crate::logger::log_warn(&format!("[Tray] Undo Arrange failed: {}", e));
                            }
                        });
                    },
                    _ => {}
                }
            })
            .build(app)?;
    }

    Ok(())
}
