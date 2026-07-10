#![allow(dead_code)]

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum TapEvent {
    TargetDown,
    TargetUp,
    OtherKeyDown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DoubleTapTarget {
    Ctrl,
    Shift,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DoubleTapBinding {
    pub target: DoubleTapTarget,
    pub event: &'static str,
}

impl DoubleTapTarget {
    fn label(self) -> &'static str {
        match self {
            DoubleTapTarget::Ctrl => "Ctrl",
            DoubleTapTarget::Shift => "Shift",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DoubleTapOutcome {
    Fired,
    Failed(DoubleTapFailure),
    Ignored,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DoubleTapFailure {
    TargetRepeatedWhileDown,
    OtherKeyWhileTargetDown,
    OtherKeyBetweenTaps,
    Timeout { elapsed_ms: u64, window_ms: u64 },
}

impl DoubleTapFailure {
    fn reason(self) -> &'static str {
        match self {
            DoubleTapFailure::TargetRepeatedWhileDown => "target_repeated_while_down",
            DoubleTapFailure::OtherKeyWhileTargetDown => "other_key_while_target_down",
            DoubleTapFailure::OtherKeyBetweenTaps => "other_key_between_taps",
            DoubleTapFailure::Timeout { .. } => "timeout",
        }
    }
}

pub(crate) struct DoubleTapDetector {
    window_ms: u64,
    target_down: bool,
    current_tap_dirty: bool,
    last_clean_tap_up_ms: Option<u64>,
    between_taps_dirty: bool,
}

impl DoubleTapDetector {
    pub fn new(window_ms: u64) -> Self {
        Self {
            window_ms,
            target_down: false,
            current_tap_dirty: false,
            last_clean_tap_up_ms: None,
            between_taps_dirty: false,
        }
    }

    /// イベントと時刻(ms)を与え、2回押し成立または失敗理由を返す
    pub fn on_event(&mut self, event: TapEvent, now_ms: u64) -> DoubleTapOutcome {
        match event {
            TapEvent::TargetDown => self.on_target_down(now_ms),
            TapEvent::TargetUp => {
                self.on_target_up(now_ms);
                DoubleTapOutcome::Ignored
            }
            TapEvent::OtherKeyDown => self.on_other_key_down(),
        }
    }

    fn on_target_down(&mut self, now_ms: u64) -> DoubleTapOutcome {
        if self.target_down {
            return DoubleTapOutcome::Failed(DoubleTapFailure::TargetRepeatedWhileDown);
        }

        if let Some(last_up) = self.last_clean_tap_up_ms {
            let elapsed_ms = now_ms.saturating_sub(last_up);
            if self.between_taps_dirty {
                self.reset();
                return DoubleTapOutcome::Failed(DoubleTapFailure::OtherKeyBetweenTaps);
            }
            if elapsed_ms <= self.window_ms {
                self.reset();
                return DoubleTapOutcome::Fired;
            }
            self.reset();
            return DoubleTapOutcome::Failed(DoubleTapFailure::Timeout {
                elapsed_ms,
                window_ms: self.window_ms,
            });
        }

        self.target_down = true;
        self.current_tap_dirty = false;
        self.last_clean_tap_up_ms = None;
        self.between_taps_dirty = false;
        DoubleTapOutcome::Ignored
    }

    fn on_target_up(&mut self, now_ms: u64) {
        if !self.target_down {
            return;
        }

        if self.current_tap_dirty {
            self.reset();
            return;
        }

        self.target_down = false;
        self.current_tap_dirty = false;
        self.last_clean_tap_up_ms = Some(now_ms);
        self.between_taps_dirty = false;
    }

    fn on_other_key_down(&mut self) -> DoubleTapOutcome {
        if self.target_down {
            self.current_tap_dirty = true;
            DoubleTapOutcome::Failed(DoubleTapFailure::OtherKeyWhileTargetDown)
        } else if self.last_clean_tap_up_ms.is_some() {
            self.between_taps_dirty = true;
            DoubleTapOutcome::Failed(DoubleTapFailure::OtherKeyBetweenTaps)
        } else {
            DoubleTapOutcome::Ignored
        }
    }

    fn reset(&mut self) {
        self.target_down = false;
        self.current_tap_dirty = false;
        self.last_clean_tap_up_ms = None;
        self.between_taps_dirty = false;
    }
}

#[cfg(windows)]
mod windows_hook {
    use std::mem::MaybeUninit;
    use std::sync::mpsc;
    use std::sync::{Mutex, OnceLock};
    use std::thread::{self, JoinHandle};

    use tauri::{AppHandle, Emitter};
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LCONTROL, VK_LSHIFT, VK_RCONTROL, VK_RSHIFT, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW,
        UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG, PM_NOREMOVE, WH_KEYBOARD_LL, WM_KEYDOWN,
        WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    use super::{DoubleTapBinding, DoubleTapDetector, DoubleTapOutcome, DoubleTapTarget, TapEvent};
    use crate::{logger, perflog};

    const WINDOW_MS: u64 = 650;
    const NOISE_WINDOW_MS: u64 = 300;
    const VK_C: u32 = 0x43;
    const VK_V: u32 = 0x56;

    struct BindingState {
        binding: DoubleTapBinding,
        detector: DoubleTapDetector,
        last_target_down_ms: Option<u64>,
    }

    struct CallbackState {
        bindings: Vec<BindingState>,
        sender: mpsc::Sender<&'static str>,
    }

    struct HookRuntime {
        bindings: Vec<DoubleTapBinding>,
        hook: isize,
        thread_id: u32,
        hook_thread: JoinHandle<()>,
        emit_thread: JoinHandle<()>,
    }

    static CALLBACK_STATE: OnceLock<Mutex<Option<CallbackState>>> = OnceLock::new();
    static RUNTIME: OnceLock<Mutex<Option<HookRuntime>>> = OnceLock::new();

    pub(crate) fn start(app_handle: AppHandle, bindings: Vec<DoubleTapBinding>) -> Result<(), String> {
        if bindings.is_empty() {
            stop();
            return Ok(());
        }

        if RUNTIME
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .map(|r| r.bindings == bindings)
            .unwrap_or(false)
        {
            return Ok(());
        }

        stop();

        let (fire_tx, fire_rx) = mpsc::channel::<&'static str>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(isize, u32), String>>();
        let callback_tx = fire_tx.clone();
        let callback_bindings = bindings.clone();
        let hook_thread = thread::spawn(move || {
            let thread_id = unsafe { GetCurrentThreadId() };
            let mut queue_msg = MSG::default();
            unsafe {
                let _ = PeekMessageW(&mut queue_msg, HWND(0), 0, 0, PM_NOREMOVE);
            }

            let binding_states = callback_bindings
                .into_iter()
                .map(|binding| BindingState {
                    binding,
                    detector: DoubleTapDetector::new(WINDOW_MS),
                    last_target_down_ms: None,
                })
                .collect();
            let state = CallbackState {
                bindings: binding_states,
                sender: callback_tx,
            };
            *CALLBACK_STATE
                .get_or_init(|| Mutex::new(None))
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(state);

            let hook =
                unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), HINSTANCE(0), 0) };
            let hook = match hook {
                Ok(hook) => hook,
                Err(e) => {
                    *CALLBACK_STATE
                        .get_or_init(|| Mutex::new(None))
                        .lock()
                        .unwrap_or_else(|e| e.into_inner()) = None;
                    let _ = ready_tx.send(Err(e.to_string()));
                    return;
                }
            };

            let _ = ready_tx.send(Ok((hook.0, thread_id)));

            let mut msg = MaybeUninit::<MSG>::zeroed();
            loop {
                let result = unsafe { GetMessageW(msg.as_mut_ptr(), HWND(0), 0, 0) };
                if result.0 <= 0 {
                    break;
                }
            }

            *CALLBACK_STATE
                .get_or_init(|| Mutex::new(None))
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = None;
        });

        let emit_thread = thread::spawn(move || {
            for event in fire_rx {
                if event == "fusen:request_create_global" {
                    logger::log_info(
                        "[Shortcut] Ctrl+N: グローバル発火 → fusen:request_create_global emit",
                    );
                    perflog::log_event(
                        "ctrl-n-global",
                        "GLOBAL_CTRL_N_PRESSED",
                        None,
                        None,
                        serde_json::json!({}),
                    );
                } else {
                    logger::log_info(&format!("[Shortcut] double tap fired → {} emit", event));
                }
                let _ = app_handle.emit(event, ());
            }
        });

        match ready_rx.recv().map_err(|e| e.to_string())? {
            Ok((hook, thread_id)) => {
                *RUNTIME
                    .get_or_init(|| Mutex::new(None))
                    .lock()
                    .unwrap_or_else(|e| e.into_inner()) = Some(HookRuntime {
                    bindings,
                    hook,
                    thread_id,
                    hook_thread,
                    emit_thread,
                });
                Ok(())
            }
            Err(e) => {
                drop(fire_tx);
                let _ = hook_thread.join();
                let _ = emit_thread.join();
                Err(e)
            }
        }
    }

    pub(crate) fn stop() {
        let runtime = RUNTIME
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take();
        if let Some(runtime) = runtime {
            if let Err(e) = unsafe { UnhookWindowsHookEx(HHOOK(runtime.hook)) } {
                logger::log_warn(&format!("[Shortcut] double tap unhook failed: {}", e));
            }
            if let Err(e) =
                unsafe { PostThreadMessageW(runtime.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) }
            {
                logger::log_warn(&format!("[Shortcut] double tap thread quit failed: {}", e));
            }
            let _ = runtime.hook_thread.join();
            let _ = runtime.emit_thread.join();
        }
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let event = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
            let message = wparam.0 as u32;

            if let Some(state) = CALLBACK_STATE
                .get_or_init(|| Mutex::new(None))
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .as_mut()
            {
                for binding_state in &mut state.bindings {
                    if let Some(tap_event) = map_event(event.vkCode, message, binding_state.binding.target) {
                        if tap_event == TapEvent::TargetDown {
                            binding_state.last_target_down_ms = Some(event.time as u64);
                        }
                        if should_ignore_noise(binding_state, tap_event, event.vkCode, event.time as u64) {
                            continue;
                        }
                        match binding_state.detector.on_event(tap_event, event.time as u64) {
                            DoubleTapOutcome::Fired => {
                                logger::log_info(&format!(
                                    "[Shortcut] {}*2 detected within {}ms",
                                    binding_state.binding.target.label(),
                                    WINDOW_MS,
                                ));
                                let _ = state.sender.send(binding_state.binding.event);
                            }
                            DoubleTapOutcome::Failed(reason) => {
                                logger::log_info(&format!(
                                    "[Shortcut] {}*2 ignored: reason={}{}",
                                    binding_state.binding.target.label(),
                                    reason.reason(),
                                    match reason {
                                        super::DoubleTapFailure::Timeout {
                                            elapsed_ms,
                                            window_ms,
                                        } => {
                                            format!(
                                                " elapsed_ms={} window_ms={}",
                                                elapsed_ms, window_ms
                                            )
                                        }
                                        _ => String::new(),
                                    }
                                ));
                            }
                            DoubleTapOutcome::Ignored => {}
                        }
                    }
                }
            }
        }

        unsafe { CallNextHookEx(HHOOK(0), code, wparam, lparam) }
    }

    fn should_ignore_noise(
        state: &BindingState,
        tap_event: TapEvent,
        vk_code: u32,
        event_time_ms: u64,
    ) -> bool {
        if state.binding.target != DoubleTapTarget::Ctrl
            || tap_event != TapEvent::OtherKeyDown
            || !matches!(vk_code, VK_C | VK_V)
        {
            return false;
        }

        let Some(last_target_down_ms) = state.last_target_down_ms else {
            return false;
        };
        if event_time_ms.saturating_sub(last_target_down_ms) > NOISE_WINDOW_MS {
            return false;
        }

        !async_key_is_down(vk_code)
            && (async_key_is_down(VK_CONTROL.0 as u32)
                || async_key_is_down(VK_LCONTROL.0 as u32)
                || async_key_is_down(VK_RCONTROL.0 as u32))
    }

    fn async_key_is_down(vk_code: u32) -> bool {
        let state = unsafe { GetAsyncKeyState(vk_code as i32) } as u16;
        (state & 0x8000) != 0
    }

    fn map_event(vk_code: u32, message: u32, target: DoubleTapTarget) -> Option<TapEvent> {
        match message {
            WM_KEYDOWN | WM_SYSKEYDOWN => {
                if event_matches_target(vk_code, target) {
                    Some(TapEvent::TargetDown)
                } else {
                    Some(TapEvent::OtherKeyDown)
                }
            }
            WM_KEYUP | WM_SYSKEYUP => {
                if event_matches_target(vk_code, target) {
                    Some(TapEvent::TargetUp)
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    fn event_matches_target(vk_code: u32, target: DoubleTapTarget) -> bool {
        match target {
            DoubleTapTarget::Ctrl => {
                vk_code == VK_CONTROL.0 as u32
                    || vk_code == VK_LCONTROL.0 as u32
                    || vk_code == VK_RCONTROL.0 as u32
            }
            DoubleTapTarget::Shift => {
                vk_code == VK_SHIFT.0 as u32
                    || vk_code == VK_LSHIFT.0 as u32
                    || vk_code == VK_RSHIFT.0 as u32
            }
        }
    }
}

#[cfg(windows)]
pub(crate) use windows_hook::{start, stop};

#[cfg(not(windows))]
pub(crate) fn start(_app_handle: tauri::AppHandle, _bindings: Vec<DoubleTapBinding>) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
pub(crate) fn stop() {}

#[cfg(test)]
mod tests {
    use super::{DoubleTapDetector, DoubleTapFailure, DoubleTapOutcome, TapEvent};

    const WINDOW_MS: u64 = 650;

    #[test]
    fn fires_on_normal_double_tap() {
        let mut detector = DoubleTapDetector::new(WINDOW_MS);

        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1000),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetUp, 1030),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1200),
            DoubleTapOutcome::Fired
        );
    }

    #[test]
    fn does_not_fire_when_other_key_is_used_with_target() {
        let mut detector = DoubleTapDetector::new(WINDOW_MS);

        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1000),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::OtherKeyDown, 1010),
            DoubleTapOutcome::Failed(DoubleTapFailure::OtherKeyWhileTargetDown),
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetUp, 1030),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1200),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::OtherKeyDown, 1210),
            DoubleTapOutcome::Failed(DoubleTapFailure::OtherKeyWhileTargetDown),
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetUp, 1230),
            DoubleTapOutcome::Ignored
        );
    }

    #[test]
    fn does_not_fire_after_window_expires() {
        let mut detector = DoubleTapDetector::new(WINDOW_MS);

        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1000),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetUp, 1030),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1700),
            DoubleTapOutcome::Failed(DoubleTapFailure::Timeout {
                elapsed_ms: 670,
                window_ms: WINDOW_MS,
            }),
        );
    }

    #[test]
    fn ignores_repeated_down_while_target_is_down() {
        let mut detector = DoubleTapDetector::new(WINDOW_MS);

        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1000),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1010),
            DoubleTapOutcome::Failed(DoubleTapFailure::TargetRepeatedWhileDown),
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetUp, 1030),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1200),
            DoubleTapOutcome::Fired
        );
    }

    #[test]
    fn triple_tap_fires_only_once() {
        let mut detector = DoubleTapDetector::new(WINDOW_MS);
        let mut fires = 0;

        if detector.on_event(TapEvent::TargetDown, 1000) == DoubleTapOutcome::Fired {
            fires += 1;
        }
        if detector.on_event(TapEvent::TargetUp, 1030) == DoubleTapOutcome::Fired {
            fires += 1;
        }
        if detector.on_event(TapEvent::TargetDown, 1200) == DoubleTapOutcome::Fired {
            fires += 1;
        }
        if detector.on_event(TapEvent::TargetUp, 1230) == DoubleTapOutcome::Fired {
            fires += 1;
        }
        if detector.on_event(TapEvent::TargetDown, 1300) == DoubleTapOutcome::Fired {
            fires += 1;
        }

        assert_eq!(fires, 1);
    }

    #[test]
    fn can_fire_again_from_down_after_failed_attempt() {
        let mut detector = DoubleTapDetector::new(WINDOW_MS);

        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1000),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetUp, 1030),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::OtherKeyDown, 1100),
            DoubleTapOutcome::Failed(DoubleTapFailure::OtherKeyBetweenTaps),
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1200),
            DoubleTapOutcome::Failed(DoubleTapFailure::OtherKeyBetweenTaps),
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetUp, 1230),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1300),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetUp, 1330),
            DoubleTapOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(TapEvent::TargetDown, 1400),
            DoubleTapOutcome::Fired
        );
    }
}
