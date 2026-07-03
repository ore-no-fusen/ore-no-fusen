use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Emitter;
use tauri_plugin_global_shortcut::{
    Builder as ShortcutBuilder, Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

use crate::{can_do_visibility_op, fusen_arrange_by_tag, logger, perflog, storage};

static NOTES_HIDDEN: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, Eq, Hash, PartialEq)]
enum HotKeyAction {
    NewNote,
    ToggleVisibility,
    Arrange,
}

struct HotKeyManager {
    shortcuts: HashMap<HotKeyAction, Shortcut>,
}

impl HotKeyManager {
    fn load() -> Self {
        let shortcut_new_note_str = storage::load_settings()
            .ok()
            .and_then(|s| s.shortcut_new_note)
            .unwrap_or_else(|| "ctrl+n".to_string());
        logger::log_info(&format!("[Shortcut] Ctrl+N ショートカット設定: {}", shortcut_new_note_str));

        let new_note = Shortcut::try_from(shortcut_new_note_str.as_str())
            .unwrap_or_else(|_| {
                logger::log_warn("[Shortcut] shortcut_new_note の parse に失敗。ctrl+n にフォールバック。");
                Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN)
            });
        let toggle_visibility = Shortcut::try_from("ctrl+shift+h")
            .unwrap_or_else(|_| Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyH));
        // [仮] 2-b のトレイUI実装までの実機確認用トリガー。トレイUI完成後に削除予定
        let arrange = Shortcut::try_from("ctrl+shift+l")
            .unwrap_or_else(|_| Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyL));

        let mut shortcuts = HashMap::new();
        shortcuts.insert(HotKeyAction::NewNote, new_note);
        shortcuts.insert(HotKeyAction::ToggleVisibility, toggle_visibility);
        shortcuts.insert(HotKeyAction::Arrange, arrange);

        Self { shortcuts }
    }

    fn shortcut(&self, action: HotKeyAction) -> Shortcut {
        self.shortcuts[&action].clone()
    }
}

pub(crate) fn register_global_shortcuts(app: &mut tauri::App) {
    let manager = HotKeyManager::load();
    let action_shortcuts = manager.shortcuts.clone();

    // [Fix] Safely attempt to register shortcuts（Ctrl+Shift+H と Ctrl+N を同一プラグインに登録）
    match ShortcutBuilder::new().with_shortcuts([
        manager.shortcut(HotKeyAction::ToggleVisibility),
        manager.shortcut(HotKeyAction::Arrange),
    ]) {
        Ok(builder) => {
            let plugin = builder
                .with_handler(move |app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if action_shortcuts
                            .get(&HotKeyAction::NewNote)
                            .map(|registered| shortcut == registered)
                            .unwrap_or(false)
                        {
                            // --- グローバル Ctrl+N: 常に fusen:request_create_global を emit ---
                            // フォーカスチェックは削除。付箋にフォーカスがある状態でも新規作成を許可する。
                            // 二重作成はメインウィンドウの 400ms グローバルスロットルで防ぐ。
                            logger::log_info("[Shortcut] Ctrl+N: グローバル発火 → fusen:request_create_global emit");
                            perflog::log_event("ctrl-n-global", "GLOBAL_CTRL_N_PRESSED", None, None, serde_json::json!({}));
                            let _ = app.emit("fusen:request_create_global", ());
                        } else if action_shortcuts
                            .get(&HotKeyAction::Arrange)
                            .map(|registered| shortcut == registered)
                            .unwrap_or(false)
                        {
                            logger::log_info("[Shortcut] Ctrl+Shift+L: fusen_arrange_by_tag trigger");
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = fusen_arrange_by_tag(app_handle).await {
                                    logger::log_warn(&format!("[Shortcut] Ctrl+Shift+L arrange failed: {}", e));
                                }
                            });
                        } else {
                            // --- Ctrl+Shift+H: 全付箋隠す/表示 ---
                            if !can_do_visibility_op() { return; }
                            let is_hidden = NOTES_HIDDEN.load(Ordering::SeqCst);
                            NOTES_HIDDEN.store(!is_hidden, Ordering::SeqCst);
                            let visible = is_hidden; // was hidden → now show (true)
                            let _ = app.emit("fusen:set_all_notes_visible", visible);

                            logger::log_info(&format!(
                                "[Shortcut] Ctrl+Shift+H pressed. Notes now {}.",
                                if is_hidden { "SHOWN" } else { "HIDDEN" }
                            ));
                        }
                    }
                })
                .build();

            match app.handle().plugin(plugin) {
                Ok(_) => {
                    // プラグイン登録後に ctrl+n を追加登録
                    if let Err(e) = app.handle().global_shortcut().register(manager.shortcut(HotKeyAction::NewNote)) {
                        logger::log_warn(&format!("[Shortcut] Ctrl+N 追加登録失敗: {}", e));
                    } else {
                        logger::log_info("[Shortcut] Ctrl+N グローバルショートカット登録成功");
                    }
                },
                Err(e) => {
                    logger::log_warn(&format!("Failed to initialize global shortcut plugin: {}", e));
                }
            }
        },
        Err(e) => {
            logger::log_warn(&format!("Failed to register global shortcuts (might be conflicting): {}", e));
        }
    }
}
