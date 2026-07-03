use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{
    Builder as ShortcutBuilder, Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

use crate::{can_do_visibility_op, double_tap::{self, DoubleTapTarget}, fusen_arrange_by_tag, logger, perflog, storage};

static NOTES_HIDDEN: AtomicBool = AtomicBool::new(false);

const TRIGGER_SHORTCUT: &str = "shortcut";
const TRIGGER_DOUBLE_CTRL: &str = "double_ctrl";
const TRIGGER_DOUBLE_SHIFT: &str = "double_shift";

#[derive(Clone, Copy, Eq, Hash, PartialEq)]
enum HotKeyAction {
    NewNote,
    ToggleVisibility,
    Arrange,
}

impl HotKeyAction {
    fn id(self) -> &'static str {
        match self {
            HotKeyAction::NewNote => "new_note",
            HotKeyAction::ToggleVisibility => "toggle_visibility",
            HotKeyAction::Arrange => "arrange",
        }
    }

    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "new_note" => Ok(HotKeyAction::NewNote),
            "toggle_visibility" => Ok(HotKeyAction::ToggleVisibility),
            "arrange" => Ok(HotKeyAction::Arrange),
            _ => Err(format!("unknown hotkey action: {}", value)),
        }
    }
}

#[derive(Clone)]
pub(crate) struct HotKeyState {
    inner: Arc<RwLock<HotKeyBindings>>,
}

#[derive(Clone)]
struct HotKeyBindings {
    shortcuts: HashMap<HotKeyAction, Shortcut>,
    new_note_trigger: String,
}

#[derive(Serialize)]
pub(crate) struct HotKeyBindingsResponse {
    new_note_trigger: String,
    new_note: String,
    toggle_visibility: String,
    arrange: String,
}

#[derive(Serialize)]
pub(crate) struct HotKeyCheckResponse {
    available: bool,
    reason: String,
    conflict_action: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct HotKeyApplyConfig {
    shortcut: Option<String>,
    new_note_trigger: Option<String>,
}

impl HotKeyState {
    fn load() -> Self {
        Self {
            inner: Arc::new(RwLock::new(load_bindings())),
        }
    }
}

fn load_bindings() -> HotKeyBindings {
    let settings = storage::load_settings().unwrap_or_default();

    let shortcut_new_note_str = settings
        .shortcut_new_note
        .unwrap_or_else(|| "ctrl+n".to_string());
    logger::log_info(&format!("[Shortcut] Ctrl+N ショートカット設定: {}", shortcut_new_note_str));

    let new_note = parse_shortcut_or_default(
        &shortcut_new_note_str,
        Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN),
        "[Shortcut] shortcut_new_note の parse に失敗。ctrl+n にフォールバック。",
    );
    let toggle_visibility = parse_shortcut_or_default(
        settings
            .shortcut_toggle_visibility
            .as_deref()
            .unwrap_or("ctrl+shift+h"),
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyH),
        "[Shortcut] shortcut_toggle_visibility の parse に失敗。ctrl+shift+h にフォールバック。",
    );
    // [仮] 2-b のトレイUI実装までの実機確認用トリガー。トレイUI完成後に削除予定
    let arrange = parse_shortcut_or_default(
        settings.shortcut_arrange.as_deref().unwrap_or("ctrl+shift+l"),
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyL),
        "[Shortcut] shortcut_arrange の parse に失敗。ctrl+shift+l にフォールバック。",
    );

    let mut shortcuts = HashMap::new();
    shortcuts.insert(HotKeyAction::NewNote, new_note);
    shortcuts.insert(HotKeyAction::ToggleVisibility, toggle_visibility);
    shortcuts.insert(HotKeyAction::Arrange, arrange);

    HotKeyBindings {
        shortcuts,
        new_note_trigger: normalize_trigger(settings.new_note_trigger.as_deref()),
    }
}

fn parse_shortcut_or_default(value: &str, default: Shortcut, warning: &str) -> Shortcut {
    Shortcut::try_from(value).unwrap_or_else(|_| {
        logger::log_warn(warning);
        default
    })
}

fn normalize_trigger(value: Option<&str>) -> String {
    match value {
        Some(TRIGGER_DOUBLE_CTRL) => TRIGGER_DOUBLE_CTRL.to_string(),
        Some(TRIGGER_DOUBLE_SHIFT) => TRIGGER_DOUBLE_SHIFT.to_string(),
        _ => TRIGGER_SHORTCUT.to_string(),
    }
}

fn shortcut_to_string(shortcut: &Shortcut) -> String {
    shortcut.into_string()
}

fn action_is_registered(action: HotKeyAction, bindings: &HotKeyBindings) -> bool {
    action != HotKeyAction::NewNote || bindings.new_note_trigger == TRIGGER_SHORTCUT
}

pub(crate) fn register_global_shortcuts(app: &mut tauri::App) {
    let hotkey_state = HotKeyState::load();
    let state_for_handler = hotkey_state.clone();
    app.manage(hotkey_state.clone());

    let bindings = hotkey_state.inner.read().unwrap_or_else(|e| e.into_inner()).clone();

    // [Fix] Safely attempt to register shortcuts（Ctrl+Shift+H と Ctrl+N を同一プラグインに登録）
    match ShortcutBuilder::new().with_shortcuts([
        bindings.shortcuts[&HotKeyAction::ToggleVisibility],
        bindings.shortcuts[&HotKeyAction::Arrange],
    ]) {
        Ok(builder) => {
            let plugin = builder
                .with_handler(move |app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let current = state_for_handler.inner.read().unwrap_or_else(|e| e.into_inner()).clone();
                        if current.new_note_trigger == TRIGGER_SHORTCUT
                            && current.shortcuts.get(&HotKeyAction::NewNote).map(|registered| shortcut == registered).unwrap_or(false)
                        {
                            // --- グローバル Ctrl+N: 常に fusen:request_create_global を emit ---
                            // フォーカスチェックは削除。付箋にフォーカスがある状態でも新規作成を許可する。
                            // 二重作成はメインウィンドウの 400ms グローバルスロットルで防ぐ。
                            logger::log_info("[Shortcut] Ctrl+N: グローバル発火 → fusen:request_create_global emit");
                            perflog::log_event("ctrl-n-global", "GLOBAL_CTRL_N_PRESSED", None, None, serde_json::json!({}));
                            let _ = app.emit("fusen:request_create_global", ());
                        } else if current.shortcuts.get(&HotKeyAction::Arrange).map(|registered| shortcut == registered).unwrap_or(false) {
                            logger::log_info("[Shortcut] Ctrl+Shift+L: fusen_arrange_by_tag trigger");
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = fusen_arrange_by_tag(app_handle).await {
                                    logger::log_warn(&format!("[Shortcut] Ctrl+Shift+L arrange failed: {}", e));
                                }
                            });
                        } else if current.shortcuts.get(&HotKeyAction::ToggleVisibility).map(|registered| shortcut == registered).unwrap_or(false) {
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
                        } else {
                            logger::log_warn("[Shortcut] 未知のショートカット発火を無視");
                        }
                    }
                })
                .build();

            match app.handle().plugin(plugin) {
                Ok(_) => {
                    // プラグイン登録後に new_note を追加登録
                    if bindings.new_note_trigger == TRIGGER_SHORTCUT {
                        if let Err(e) = app.handle().global_shortcut().register(bindings.shortcuts[&HotKeyAction::NewNote]) {
                            logger::log_warn(&format!("[Shortcut] Ctrl+N 追加登録失敗: {}", e));
                        } else {
                            logger::log_info("[Shortcut] Ctrl+N グローバルショートカット登録成功");
                        }
                    } else if let Err(e) = sync_double_tap_hook(app.handle(), &bindings.new_note_trigger) {
                        logger::log_warn(&format!("[Shortcut] double tap hook start failed: {}", e));
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

fn trigger_to_double_tap_target(trigger: &str) -> Option<DoubleTapTarget> {
    match trigger {
        TRIGGER_DOUBLE_CTRL => Some(DoubleTapTarget::Ctrl),
        TRIGGER_DOUBLE_SHIFT => Some(DoubleTapTarget::Shift),
        _ => None,
    }
}

fn sync_double_tap_hook(app: &AppHandle, trigger: &str) -> Result<(), String> {
    if let Some(target) = trigger_to_double_tap_target(trigger) {
        double_tap::start(app.clone(), target)
    } else {
        double_tap::stop();
        Ok(())
    }
}

#[tauri::command]
pub(crate) fn hotkey_get_bindings(state: State<'_, HotKeyState>) -> HotKeyBindingsResponse {
    let bindings = state.inner.read().unwrap_or_else(|e| e.into_inner());
    HotKeyBindingsResponse {
        new_note_trigger: bindings.new_note_trigger.clone(),
        new_note: shortcut_to_string(&bindings.shortcuts[&HotKeyAction::NewNote]),
        toggle_visibility: shortcut_to_string(&bindings.shortcuts[&HotKeyAction::ToggleVisibility]),
        arrange: shortcut_to_string(&bindings.shortcuts[&HotKeyAction::Arrange]),
    }
}

#[tauri::command]
pub(crate) fn hotkey_check(
    app: AppHandle,
    state: State<'_, HotKeyState>,
    action: String,
    shortcut: String,
) -> Result<HotKeyCheckResponse, String> {
    let action = HotKeyAction::parse(&action)?;
    let shortcut = parse_requested_shortcut(&shortcut)?;

    {
        let bindings = state.inner.read().unwrap_or_else(|e| e.into_inner());
        if bindings.shortcuts.get(&action).map(|current| current == &shortcut).unwrap_or(false) {
            return Ok(HotKeyCheckResponse {
                available: true,
                reason: "self".to_string(),
                conflict_action: None,
            });
        }
        for (other_action, other_shortcut) in bindings.shortcuts.iter() {
            if *other_action != action && other_shortcut == &shortcut {
                return Ok(HotKeyCheckResponse {
                    available: false,
                    reason: "internal".to_string(),
                    conflict_action: Some(other_action.id().to_string()),
                });
            }
        }
    }

    match app.global_shortcut().register(shortcut) {
        Ok(_) => {
            if let Err(e) = app.global_shortcut().unregister(shortcut) {
                logger::log_warn(&format!("[Shortcut] hotkey_check unregister failed: {}", e));
            }
            Ok(HotKeyCheckResponse {
                available: true,
                reason: "ok".to_string(),
                conflict_action: None,
            })
        },
        Err(e) => {
            logger::log_warn(&format!("[Shortcut] hotkey_check register failed: {}", e));
            Ok(HotKeyCheckResponse {
                available: false,
                reason: "external".to_string(),
                conflict_action: None,
            })
        }
    }
}

#[tauri::command]
pub(crate) fn hotkey_apply(
    app: AppHandle,
    state: State<'_, HotKeyState>,
    action: String,
    config: HotKeyApplyConfig,
) -> Result<(), String> {
    let action = HotKeyAction::parse(&action)?;
    let requested_trigger = normalize_trigger(config.new_note_trigger.as_deref());
    let requested_shortcut = if action == HotKeyAction::NewNote && requested_trigger != TRIGGER_SHORTCUT {
        None
    } else {
        Some(parse_requested_shortcut(config.shortcut.as_deref().unwrap_or(""))?)
    };

    let mut bindings = state.inner.write().unwrap_or_else(|e| e.into_inner());
    let old_shortcut = bindings.shortcuts[&action];
    let old_trigger = bindings.new_note_trigger.clone();
    let old_registered = action_is_registered(action, &bindings);
    let new_registered = action != HotKeyAction::NewNote || requested_trigger == TRIGGER_SHORTCUT;

    if old_registered {
        if let Err(e) = app.global_shortcut().unregister(old_shortcut) {
            logger::log_warn(&format!("[Shortcut] hotkey_apply unregister failed: {}", e));
        }
    }

    if let Some(new_shortcut) = requested_shortcut {
        if new_registered {
            if let Err(e) = app.global_shortcut().register(new_shortcut) {
                logger::log_warn(&format!("[Shortcut] hotkey_apply register failed: {}", e));
                if old_registered {
                    if let Err(rollback_error) = app.global_shortcut().register(old_shortcut) {
                        logger::log_warn(&format!("[Shortcut] hotkey_apply rollback failed: {}", rollback_error));
                    }
                }
                return Err(e.to_string());
            }
        }

        bindings.shortcuts.insert(action, new_shortcut);
    }
    if action == HotKeyAction::NewNote {
        if let Err(e) = sync_double_tap_hook(&app, &requested_trigger) {
            logger::log_warn(&format!("[Shortcut] hotkey_apply double tap sync failed: {}", e));
            if new_registered {
                if let Some(new_shortcut) = requested_shortcut {
                    if let Err(unregister_error) = app.global_shortcut().unregister(new_shortcut) {
                        logger::log_warn(&format!("[Shortcut] hotkey_apply hook rollback unregister failed: {}", unregister_error));
                    }
                }
            }
            if old_registered {
                if let Err(rollback_error) = app.global_shortcut().register(old_shortcut) {
                    logger::log_warn(&format!("[Shortcut] hotkey_apply hook rollback register failed: {}", rollback_error));
                }
            }
            if let Err(rollback_error) = sync_double_tap_hook(&app, &old_trigger) {
                logger::log_warn(&format!("[Shortcut] hotkey_apply hook rollback failed: {}", rollback_error));
            }
            return Err(e);
        }
    }
    if action == HotKeyAction::NewNote {
        bindings.new_note_trigger = requested_trigger;
    }

    if let Err(e) = save_bindings(&bindings) {
        if new_registered {
            if let Some(new_shortcut) = requested_shortcut {
                if let Err(unregister_error) = app.global_shortcut().unregister(new_shortcut) {
                    logger::log_warn(&format!("[Shortcut] hotkey_apply save rollback unregister failed: {}", unregister_error));
                }
            }
        }
        if old_registered {
            if let Err(rollback_error) = app.global_shortcut().register(old_shortcut) {
                logger::log_warn(&format!("[Shortcut] hotkey_apply save rollback register failed: {}", rollback_error));
            }
        }
        bindings.shortcuts.insert(action, old_shortcut);
        bindings.new_note_trigger = old_trigger;
        if action == HotKeyAction::NewNote {
            if let Err(rollback_error) = sync_double_tap_hook(&app, &bindings.new_note_trigger) {
                logger::log_warn(&format!("[Shortcut] hotkey_apply save rollback hook failed: {}", rollback_error));
            }
        }
        return Err(e);
    }

    Ok(())
}

fn parse_requested_shortcut(shortcut: &str) -> Result<Shortcut, String> {
    if shortcut.trim().is_empty() {
        return Err("shortcut is required".to_string());
    }
    Shortcut::try_from(shortcut).map_err(|e| e.to_string())
}

fn save_bindings(bindings: &HotKeyBindings) -> Result<(), String> {
    let mut settings = storage::load_settings().unwrap_or_default();
    settings.shortcut_new_note = Some(shortcut_to_string(&bindings.shortcuts[&HotKeyAction::NewNote]));
    settings.new_note_trigger = Some(bindings.new_note_trigger.clone());
    settings.shortcut_toggle_visibility = Some(shortcut_to_string(&bindings.shortcuts[&HotKeyAction::ToggleVisibility]));
    settings.shortcut_arrange = Some(shortcut_to_string(&bindings.shortcuts[&HotKeyAction::Arrange]));
    storage::save_settings(&settings)
}
