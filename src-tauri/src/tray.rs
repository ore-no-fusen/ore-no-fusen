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
    let hide_i = MenuItem::with_id(app, "hide_all", "全部隠す (Hide All)", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show_all", "全部戻す (Show All)", true, None::<&str>)?;
    
    // Choose World Submenu
    let world_menu = tauri::menu::Submenu::with_id(app, "choose_world", "世界を選ぶ (Choose World)", true)?;
    let all_worlds = MenuItem::with_id(app, "world_all", "(すべて) / All", true, None::<&str>)?;
    world_menu.append(&all_worlds)?;
    world_menu.append(&tauri::menu::PredefinedMenuItem::separator(app)?)?;
    
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
    
    let quit_i = MenuItem::with_id(app, "quit", "終了 (Quit)", true, None::<&str>)?;
    
    let menu = Menu::with_items(app, &[
        &hide_i, 
        &show_i, 
        &tauri::menu::PredefinedMenuItem::separator(app)?, 
        &world_menu, 
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
                    "world_all" => {
                        // Clear all selections
                        let state = app.state::<Mutex<AppState>>();
                        let mut app_state = state.lock().unwrap();
                        app_state.active_tags.clear();
                        drop(app_state);
                        
                        // Refresh menu
                        let _ = refresh_tray_menu(app);
                        
                        // Show all notes
                        let _ = app.emit("fusen:apply_tag_filter", Vec::<String>::new());
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
                        
                        // Refresh menu to update checkboxes
                        let _ = refresh_tray_menu(app);
                        
                        // Apply filter
                        let _ = app.emit("fusen:apply_tag_filter", active_tags);
                    },
                    "quit" => {
                        app.exit(0);
                    },
                    _ => {}
                }
            })
            .build(app)?;
    }

    Ok(())
}
