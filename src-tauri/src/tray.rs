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

fn format_shortcut_for_menu(shortcut: &str) -> String {
    let mut modifiers = Vec::new();
    let mut keys = Vec::new();

    for part in shortcut.split('+') {
        let trimmed = part.trim();
        match trimmed.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => modifiers.push((0, "Ctrl".to_string())),
            "shift" => modifiers.push((1, "Shift".to_string())),
            "alt" => modifiers.push((2, "Alt".to_string())),
            "super" | "win" | "meta" => modifiers.push((3, "Win".to_string())),
            _ => {
                let lower = trimmed.to_ascii_lowercase();
                let display = if lower.starts_with("key") && trimmed.len() == 4 {
                    trimmed[3..].to_ascii_uppercase()
                } else if lower.starts_with("digit") && trimmed.len() == 6 {
                    trimmed[5..].to_string()
                } else if trimmed.len() == 1 {
                    trimmed.to_ascii_uppercase()
                } else {
                    trimmed.to_string()
                };
                keys.push(display);
            }
        }
    }

    modifiers.sort_by_key(|(order, _)| *order);
    modifiers
        .into_iter()
        .map(|(_, label)| label)
        .chain(keys)
        .collect::<Vec<_>>()
        .join("+")
}

fn menu_label(base: &str, shortcut: &str, is_en: bool) -> String {
    if is_en {
        format!("{}\t{}", base, shortcut)
    } else {
        format!("{} ({})", base, shortcut)
    }
}

fn new_note_shortcut_for_menu(trigger: &str, shortcut: &str, is_en: bool) -> String {
    match trigger {
        "double_ctrl" => {
            if is_en { "Double Ctrl".to_string() } else { "Ctrl 2回".to_string() }
        }
        "double_shift" => {
            if is_en { "Double Shift".to_string() } else { "Shift 2回".to_string() }
        }
        _ => format_shortcut_for_menu(shortcut),
    }
}

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    refresh_tray_menu(app)
}


pub fn refresh_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // [i18n] Get language and shortcut settings
    let settings = crate::settings::get_settings(app.clone()).unwrap_or_default();
    let is_en = settings.language == "en";
    let new_note_shortcut = new_note_shortcut_for_menu(
        settings.new_note_trigger.as_deref().unwrap_or("shortcut"),
        settings.shortcut_new_note.as_deref().unwrap_or("ctrl+n"),
        is_en,
    );
    let toggle_shortcut = format_shortcut_for_menu(
        settings.shortcut_toggle_visibility.as_deref().unwrap_or("ctrl+shift+h"),
    );
    let arrange_shortcut = format_shortcut_for_menu(
        settings.shortcut_arrange.as_deref().unwrap_or("ctrl+shift+l"),
    );

    // Labels
    let label_hide = menu_label(
        if is_en { "Hide All" } else { "全部隠す" },
        &toggle_shortcut,
        is_en,
    );
    let label_show = menu_label(
        if is_en { "Show All" } else { "全部戻す (Show All)" },
        &toggle_shortcut,
        is_en,
    );
    let label_settings = if is_en { "Settings" } else { "設定 (Settings)" };
    let label_new_note = menu_label(
        if is_en { "New Note" } else { "新規メモ (New Note)" },
        &new_note_shortcut,
        is_en,
    );
    let label_search = menu_label(if is_en { "Search" } else { "検索 (Search)" }, "Ctrl+F", is_en);
    let label_arrange_by_tag = menu_label(
        if is_en { "Arrange by Tag" } else { "タグで整列 (Arrange by Tag)" },
        &arrange_shortcut,
        is_en,
    );
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

#[cfg(test)]
mod tests {
    use super::{format_shortcut_for_menu, menu_label, new_note_shortcut_for_menu};

    #[test]
    fn formats_saved_shortcuts_for_tray_display() {
        assert_eq!(format_shortcut_for_menu("ctrl+shift+l"), "Ctrl+Shift+L");
        assert_eq!(format_shortcut_for_menu("super+n"), "Win+N");
        assert_eq!(format_shortcut_for_menu("Shift+Control+KeyL"), "Ctrl+Shift+L");
        assert_eq!(format_shortcut_for_menu("Control+Digit1"), "Ctrl+1");
    }

    #[test]
    fn appends_shortcut_using_language_specific_menu_style() {
        assert_eq!(menu_label("新規メモ", "Ctrl+N", false), "新規メモ (Ctrl+N)");
        assert_eq!(menu_label("New Note", "Ctrl+N", true), "New Note\tCtrl+N");
    }

    #[test]
    fn displays_the_configured_new_note_trigger() {
        assert_eq!(new_note_shortcut_for_menu("shortcut", "alt+n", false), "Alt+N");
        assert_eq!(new_note_shortcut_for_menu("double_ctrl", "ctrl+n", false), "Ctrl 2回");
        assert_eq!(new_note_shortcut_for_menu("double_shift", "ctrl+n", true), "Double Shift");
    }
}
