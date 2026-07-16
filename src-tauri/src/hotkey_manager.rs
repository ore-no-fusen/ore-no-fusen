use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{
    Builder as ShortcutBuilder, Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

use crate::{can_do_visibility_op, double_tap::{self, DoubleTapBinding, DoubleTapTarget}, fusen_arrange_by_tag, logger, storage, triple_right_click};

static NOTES_HIDDEN: AtomicBool = AtomicBool::new(false);

const TRIGGER_SHORTCUT: &str = "shortcut";
const TRIGGER_DOUBLE_CTRL: &str = "double_ctrl";
const TRIGGER_DOUBLE_SHIFT: &str = "double_shift";
const RESERVED_BASIC_SHORTCUT_KEYS: &[&str] = &["c", "v", "x", "z", "y", "a", "s"];

#[derive(Clone, Copy, Eq, Hash, PartialEq)]
enum HotKeyAction {
    NewNote,
    ToggleVisibility,
    Arrange,
    QuickLauncher,
}

impl HotKeyAction {
    fn id(self) -> &'static str {
        match self {
            HotKeyAction::NewNote => "new_note",
            HotKeyAction::ToggleVisibility => "toggle_visibility",
            HotKeyAction::Arrange => "arrange",
            HotKeyAction::QuickLauncher => "quick_launcher",
        }
    }

    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "new_note" => Ok(HotKeyAction::NewNote),
            "toggle_visibility" => Ok(HotKeyAction::ToggleVisibility),
            "arrange" => Ok(HotKeyAction::Arrange),
            "quick_launcher" => Ok(HotKeyAction::QuickLauncher),
            _ => Err(format!("unknown hotkey action: {}", value)),
        }
    }
}

#[derive(Clone)]
pub(crate) struct HotKeyState {
    inner: Arc<RwLock<HotKeyBindings>>,
    register_failures: Arc<RwLock<Vec<HotKeyRegisterFailure>>>,
}

#[derive(Clone)]
struct HotKeyBindings {
    shortcuts: HashMap<HotKeyAction, Shortcut>,
    new_note_trigger: String,
    quick_launcher_triple_right_click: bool,
}

#[derive(Serialize)]
pub(crate) struct HotKeyBindingsResponse {
    new_note_trigger: String,
    new_note: String,
    toggle_visibility: String,
    arrange: String,
    quick_launcher: String,
}

#[derive(Serialize)]
pub(crate) struct HotKeyCheckResponse {
    available: bool,
    reason: String,
    conflict_action: Option<String>,
}

#[derive(Clone, Serialize)]
pub(crate) struct HotKeyRegisterFailure {
    action: String,
    shortcut: String,
}

#[derive(Serialize)]
pub(crate) struct HotKeyRegisterFailuresResponse {
    failures: Vec<HotKeyRegisterFailure>,
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
            register_failures: Arc::new(RwLock::new(Vec::new())),
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
    let quick_launcher = parse_shortcut_or_default(
        settings.shortcut_quick_launcher.as_deref().unwrap_or("ctrl+p"),
        Shortcut::new(Some(Modifiers::CONTROL), Code::KeyP),
        "[Shortcut] shortcut_quick_launcher の parse に失敗。ctrl+p にフォールバック。",
    );

    let mut shortcuts = HashMap::new();
    shortcuts.insert(HotKeyAction::NewNote, new_note);
    shortcuts.insert(HotKeyAction::ToggleVisibility, toggle_visibility);
    shortcuts.insert(HotKeyAction::Arrange, arrange);
    shortcuts.insert(HotKeyAction::QuickLauncher, quick_launcher);

    HotKeyBindings {
        shortcuts,
        new_note_trigger: normalize_trigger(settings.new_note_trigger.as_deref()),
        quick_launcher_triple_right_click: settings.quick_launcher_triple_right_click.unwrap_or(false),
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
    let plugin = ShortcutBuilder::new()
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
                            crate::perf_event!("ctrl-n-global", "GLOBAL_CTRL_N_PRESSED", None, None, serde_json::json!({}));
                            let _ = app.emit("fusen:request_create_global", ());
                        } else if current.shortcuts.get(&HotKeyAction::Arrange).map(|registered| shortcut == registered).unwrap_or(false) {
                            logger::log_info("[Shortcut] Ctrl+Shift+L: fusen_arrange_by_tag trigger");
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = fusen_arrange_by_tag(app_handle).await {
                                    logger::log_warn(&format!("[Shortcut] Ctrl+Shift+L arrange failed: {}", e));
                                }
                            });
                        } else if current.shortcuts.get(&HotKeyAction::QuickLauncher).map(|registered| shortcut == registered).unwrap_or(false) {
                            logger::log_info("[Shortcut] Ctrl+P: fusen:toggle_quick_launcher emit");
                            let _ = app.emit("fusen:toggle_quick_launcher", ());
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
                    register_startup_shortcut(app.handle(), &hotkey_state, &bindings, HotKeyAction::ToggleVisibility);
                    register_startup_shortcut(app.handle(), &hotkey_state, &bindings, HotKeyAction::Arrange);
                    register_startup_shortcut(app.handle(), &hotkey_state, &bindings, HotKeyAction::QuickLauncher);
                    if bindings.new_note_trigger == TRIGGER_SHORTCUT {
                        register_startup_shortcut(app.handle(), &hotkey_state, &bindings, HotKeyAction::NewNote);
                    } else if let Err(e) = sync_double_tap_hook(app.handle(), &bindings.new_note_trigger) {
                        logger::log_warn(&format!("[Shortcut] double tap hook start failed: {}", e));
                    }
                    if let Err(e) = sync_quick_launcher_triple_right_click(app.handle(), bindings.quick_launcher_triple_right_click) {
                        logger::log_warn(&format!("[Shortcut] triple right click hook start failed: {}", e));
                    }
                },
                Err(e) => {
                    logger::log_warn(&format!("Failed to initialize global shortcut plugin: {}", e));
                    push_register_failure(&hotkey_state, HotKeyAction::ToggleVisibility, &bindings.shortcuts[&HotKeyAction::ToggleVisibility]);
                    push_register_failure(&hotkey_state, HotKeyAction::Arrange, &bindings.shortcuts[&HotKeyAction::Arrange]);
                    push_register_failure(&hotkey_state, HotKeyAction::QuickLauncher, &bindings.shortcuts[&HotKeyAction::QuickLauncher]);
                    if bindings.new_note_trigger == TRIGGER_SHORTCUT {
                        push_register_failure(&hotkey_state, HotKeyAction::NewNote, &bindings.shortcuts[&HotKeyAction::NewNote]);
                    }
                }
            }
}

fn register_startup_shortcut(app: &AppHandle, state: &HotKeyState, bindings: &HotKeyBindings, action: HotKeyAction) {
    let shortcut = bindings.shortcuts[&action];
    if let Err(e) = app.global_shortcut().register(shortcut) {
        logger::log_warn(&format!("[Shortcut] {} 登録失敗: {}", action.id(), e));
        push_register_failure(state, action, &shortcut);
    } else if action == HotKeyAction::NewNote {
        logger::log_info("[Shortcut] Ctrl+N グローバルショートカット登録成功");
    }
}

fn push_register_failure(state: &HotKeyState, action: HotKeyAction, shortcut: &Shortcut) {
    state.register_failures.write().unwrap_or_else(|e| e.into_inner()).push(HotKeyRegisterFailure {
        action: action.id().to_string(),
        shortcut: shortcut_to_string(shortcut),
    });
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
        double_tap::start(app.clone(), vec![DoubleTapBinding { target, event: "fusen:request_create_global" }])
    } else {
        double_tap::stop();
        Ok(())
    }
}

pub(crate) fn sync_quick_launcher_triple_right_click<R: tauri::Runtime>(
    app: &AppHandle<R>,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        triple_right_click::start(app.clone())
    } else {
        triple_right_click::stop();
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
        quick_launcher: shortcut_to_string(&bindings.shortcuts[&HotKeyAction::QuickLauncher]),
    }
}

#[tauri::command]
pub(crate) fn hotkey_get_register_failures(state: State<'_, HotKeyState>) -> HotKeyRegisterFailuresResponse {
    HotKeyRegisterFailuresResponse {
        failures: state.register_failures.read().unwrap_or_else(|e| e.into_inner()).clone(),
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
    if is_reserved_basic_shortcut(&shortcut) {
        return Ok(HotKeyCheckResponse {
            available: false,
            reason: "reserved".to_string(),
            conflict_action: None,
        });
    }
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
        let shortcut = config.shortcut.as_deref().unwrap_or("");
        if is_reserved_basic_shortcut(shortcut) {
            return Err("reserved shortcut".to_string());
        }
        Some(parse_requested_shortcut(shortcut)?)
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

    state.register_failures.write().unwrap_or_else(|e| e.into_inner()).retain(|failure| failure.action != action.id());

    Ok(())
}

fn parse_requested_shortcut(shortcut: &str) -> Result<Shortcut, String> {
    if shortcut.trim().is_empty() {
        return Err("shortcut is required".to_string());
    }
    Shortcut::try_from(shortcut).map_err(|e| e.to_string())
}

fn is_reserved_basic_shortcut(shortcut: &str) -> bool {
    let mut has_ctrl = false;
    let mut has_other_modifier = false;
    let mut key: Option<String> = None;

    for part in shortcut.split('+') {
        let part = part.trim().to_ascii_lowercase();
        if part.is_empty() {
            continue;
        }
        match part.as_str() {
            "ctrl" | "control" => has_ctrl = true,
            "shift" | "alt" | "super" | "meta" | "command" | "cmd" => has_other_modifier = true,
            _ => {
                let normalized_key = if part.len() == 4 && part.starts_with("key") {
                    part[3..].to_string()
                } else {
                    part
                };
                key = Some(normalized_key);
            }
        }
    }

    has_ctrl
        && !has_other_modifier
        && key
            .as_deref()
            .map(|value| RESERVED_BASIC_SHORTCUT_KEYS.contains(&value))
            .unwrap_or(false)
}

fn save_bindings(bindings: &HotKeyBindings) -> Result<(), String> {
    let mut settings = storage::load_settings().unwrap_or_default();
    settings.shortcut_new_note = Some(shortcut_to_string(&bindings.shortcuts[&HotKeyAction::NewNote]));
    settings.new_note_trigger = Some(bindings.new_note_trigger.clone());
    settings.shortcut_toggle_visibility = Some(shortcut_to_string(&bindings.shortcuts[&HotKeyAction::ToggleVisibility]));
    settings.shortcut_arrange = Some(shortcut_to_string(&bindings.shortcuts[&HotKeyAction::Arrange]));
    settings.shortcut_quick_launcher = Some(shortcut_to_string(&bindings.shortcuts[&HotKeyAction::QuickLauncher]));
    settings.quick_launcher_triple_right_click = Some(bindings.quick_launcher_triple_right_click);
    storage::save_settings(&settings)
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use tempfile::tempdir;

    use super::{
        is_reserved_basic_shortcut, load_bindings, save_bindings, shortcut_to_string, HotKeyAction,
    };
    use crate::storage;
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

    static SETTINGS_ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn reserved_basic_shortcut_rejects_ctrl_c() {
        assert!(is_reserved_basic_shortcut("ctrl+c"));
        assert!(is_reserved_basic_shortcut("control+KeyC"));
    }

    #[test]
    fn reserved_basic_shortcut_allows_ctrl_shift_c() {
        assert!(!is_reserved_basic_shortcut("ctrl+shift+c"));
        assert!(!is_reserved_basic_shortcut("shift+control+KeyC"));
    }

    #[test]
    fn hotkey_action_parses_quick_launcher() {
        let action = HotKeyAction::parse("quick_launcher").unwrap();
        assert_eq!(action.id(), "quick_launcher");
        assert!(HotKeyAction::parse("unknown").is_err());
    }

    #[test]
    fn load_bindings_defaults_quick_launcher_to_ctrl_p() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap();
        let appdata_dir = tempdir().unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", appdata_dir.path());

        let bindings = load_bindings();
        assert_eq!(
            bindings.shortcuts[&HotKeyAction::QuickLauncher],
            Shortcut::new(Some(Modifiers::CONTROL), Code::KeyP),
        );

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }

    #[test]
    fn save_bindings_persists_quick_launcher_shortcut() {
        let _guard = SETTINGS_ENV_LOCK.lock().unwrap();
        let appdata_dir = tempdir().unwrap();
        let old_appdata = std::env::var("APPDATA").ok();
        std::env::set_var("APPDATA", appdata_dir.path());

        let mut bindings = load_bindings();
        let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP);
        bindings.shortcuts.insert(HotKeyAction::QuickLauncher, shortcut);
        save_bindings(&bindings).unwrap();

        let settings = storage::load_settings().unwrap();
        assert_eq!(settings.shortcut_quick_launcher, Some(shortcut_to_string(&shortcut)));

        if let Some(value) = old_appdata {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
    }
}
