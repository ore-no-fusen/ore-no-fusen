/*
 * 設定コマンドハンドラ
 *
 * 責務:
 * - フロントエンドからの設定読み書き要求の処理
 * - 設定変更時の状態同期とイベント通知
 * - トレイメニューなどのUIへの設定反映トリガー
 */

use crate::state::AppState;
use crate::state::Settings as AppSettings;
use crate::storage;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime, State};

// --- コマンド実装 ---

// 設定を読み込むコマンド
#[tauri::command]
pub fn get_settings<R: Runtime>(_app: AppHandle<R>) -> Result<AppSettings, String> {
    storage::load_settings()
}

#[tauri::command]
pub fn set_editor_hotkey_enabled<R: Runtime>(app: AppHandle<R>, action: String, enabled: bool) -> Result<(), String> {
    let settings = storage::update_settings(|settings| update_editor_hotkey(settings, &action, enabled))?;
    let _ = app.emit("settings_updated", &settings);
    Ok(())
}

fn update_editor_hotkey(settings: &mut AppSettings, action: &str, enabled: bool) -> Result<(), String> {
    if !matches!(action, "editor_bold" | "editor_heading" | "editor_bullet_list" | "editor_checkbox") {
        return Err("Unknown editor hotkey".into());
    }
    settings.disabled_editor_hotkeys.retain(|item| item != action);
    if !enabled { settings.disabled_editor_hotkeys.push(action.to_string()); }
    Ok(())
}

#[cfg(test)]
mod editor_hotkey_tests {
    use super::*;
    #[test]
    fn individual_editor_toggle_preserves_global_and_other_editor_settings() {
        let mut settings = AppSettings::default();
        settings.disabled_hotkeys = vec!["new_note".into()];
        settings.disabled_editor_hotkeys = vec!["editor_heading".into()];
        update_editor_hotkey(&mut settings, "editor_bold", false).unwrap();
        update_editor_hotkey(&mut settings, "editor_bold", false).unwrap();
        assert_eq!(settings.disabled_editor_hotkeys, vec!["editor_heading", "editor_bold"]);
        let restored: AppSettings = serde_json::from_str(&serde_json::to_string(&settings).unwrap()).unwrap();
        assert_eq!(restored.disabled_editor_hotkeys, vec!["editor_heading", "editor_bold"]);
        assert_eq!(restored.disabled_hotkeys, vec!["new_note"]);
        update_editor_hotkey(&mut settings, "editor_bold", true).unwrap();
        assert_eq!(settings.disabled_editor_hotkeys, vec!["editor_heading"]);
        assert!(update_editor_hotkey(&mut settings, "new_note", true).is_err());
        assert_eq!(settings.disabled_editor_hotkeys, vec!["editor_heading"]);
        assert_eq!(settings.disabled_hotkeys, vec!["new_note"]);
    }
}

// 設定を保存するコマンド
#[tauri::command]
pub fn save_settings<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Mutex<AppState>>,
    mut settings: AppSettings,
) -> Result<(), String> {
    // 存在する設定が壊れている場合は、既定値で上書きせず保存を中断する。
    let settings = storage::update_settings(|existing_settings| {
        // pc_id は UI から書き換えさせない内部フィールド。
        // フロントから空（=フロントが知らない or 古いフロント）で来ても既存値を保持する。
        if settings
            .pc_id
            .as_ref()
            .map_or(true, |s| s.trim().is_empty())
        {
            settings.pc_id = existing_settings.pc_id.clone();
        }
        // 内部の初回確認状態は、古いフロントや保存途中の画面から false が届いても戻さない。
        settings.desktop_shortcut_prompted =
            settings.desktop_shortcut_prompted || existing_settings.desktop_shortcut_prompted;

        if let Some(base_path) = &settings.base_path {
            storage::validate_storage_path(base_path)?;
        }

        // A new data location always requires a new explicit Trash cleanup opt-in.
        if settings.base_path != existing_settings.base_path {
            crate::trash_cleanup::set_policy(&crate::trash_policy_path()?, None)?;
        }

        settings.disabled_hotkeys = existing_settings.disabled_hotkeys.clone();
        settings.disabled_editor_hotkeys = existing_settings.disabled_editor_hotkeys.clone();
        settings.shortcut_new_note = existing_settings.shortcut_new_note.clone();
        settings.new_note_trigger = existing_settings.new_note_trigger.clone();
        settings.shortcut_toggle_visibility = existing_settings.shortcut_toggle_visibility.clone();
        settings.shortcut_arrange = existing_settings.shortcut_arrange.clone();
        settings.shortcut_quick_launcher = existing_settings.shortcut_quick_launcher.clone();

        // 1. ファイルに保存
        *existing_settings = settings.clone();
        Ok(())
    })?;
    if let Err(e) = crate::hotkey_manager::sync_quick_launcher_triple_right_click(
        &app,
        settings.quick_launcher_triple_right_click.unwrap_or(false),
    ) {
        crate::logger::log_warn(&format!(
            "[Shortcut] triple right click hook sync failed: {}",
            e
        ));
    }

    // 2. メモリ上の AppState を同期
    {
        let mut app_state = state.lock().unwrap_or_else(|e| e.into_inner());
        app_state.base_path = settings.base_path.clone();
        app_state.folder_path = settings.base_path.clone();
        crate::member_identity::apply_usage_setting(
            &mut app_state,
            settings.analytics_consent.as_deref(),
        )?;

        // ベースパスが変わったらノート一覧も再読み込み
        if let Some(path) = &settings.base_path {
            app_state.notes = storage::list_notes(path);
        }
    }

    // 3. 全ウィンドウに通知を飛ばす（全体更新イベント）
    let _ = app.emit("settings_updated", &settings);
    // Keep the taskbar shortcut hint in sync with language and key settings.
    crate::launcher_taskbar::install(&app);

    // [Fix] トレイメニュー更新はメインスレッドで行う（Windowsでのクラッシュ防止）
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(e) = crate::tray::refresh_tray_menu(&app_handle) {
            eprintln!("[SETTINGS] Failed to refresh tray menu: {}", e);
        }
    });

    println!("[SETTINGS] Save successful. AppState updated, event emitted, and Tray refreshed.");

    Ok(())
}
