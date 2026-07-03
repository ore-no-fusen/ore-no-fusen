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

    /// イベントと時刻(ms)を与え、2回押し成立時のみ true
    pub fn on_event(&mut self, event: TapEvent, now_ms: u64) -> bool {
        match event {
            TapEvent::TargetDown => self.on_target_down(now_ms),
            TapEvent::TargetUp => {
                self.on_target_up(now_ms);
                false
            },
            TapEvent::OtherKeyDown => {
                self.on_other_key_down();
                false
            },
        }
    }

    fn on_target_down(&mut self, now_ms: u64) -> bool {
        if self.target_down {
            return false;
        }

        if let Some(last_up) = self.last_clean_tap_up_ms {
            if !self.between_taps_dirty && now_ms.saturating_sub(last_up) <= self.window_ms {
                self.reset();
                return true;
            }
        }

        self.target_down = true;
        self.current_tap_dirty = false;
        self.last_clean_tap_up_ms = None;
        self.between_taps_dirty = false;
        false
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

    fn on_other_key_down(&mut self) {
        if self.target_down {
            self.current_tap_dirty = true;
        } else if self.last_clean_tap_up_ms.is_some() {
            self.between_taps_dirty = true;
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
        VK_LCONTROL, VK_LSHIFT, VK_RCONTROL, VK_RSHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, KBDLLHOOKSTRUCT, MSG, PeekMessageW, PostThreadMessageW,
        SetWindowsHookExW, UnhookWindowsHookEx, HHOOK, PM_NOREMOVE, WH_KEYBOARD_LL, WM_KEYDOWN,
        WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    use super::{DoubleTapDetector, DoubleTapTarget, TapEvent};
    use crate::{logger, perflog};

    const WINDOW_MS: u64 = 350;

    struct CallbackState {
        target: DoubleTapTarget,
        detector: DoubleTapDetector,
        sender: mpsc::Sender<()>,
    }

    struct HookRuntime {
        target: DoubleTapTarget,
        hook: isize,
        thread_id: u32,
        hook_thread: JoinHandle<()>,
        emit_thread: JoinHandle<()>,
    }

    static CALLBACK_STATE: OnceLock<Mutex<Option<CallbackState>>> = OnceLock::new();
    static RUNTIME: OnceLock<Mutex<Option<HookRuntime>>> = OnceLock::new();

    pub(crate) fn start(app_handle: AppHandle, target: DoubleTapTarget) -> Result<(), String> {
        if RUNTIME.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|r| r.target == target).unwrap_or(false) {
            return Ok(());
        }

        stop();

        let (fire_tx, fire_rx) = mpsc::channel::<()>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(isize, u32), String>>();
        let callback_tx = fire_tx.clone();
        let hook_thread = thread::spawn(move || {
            let thread_id = unsafe { GetCurrentThreadId() };
            let mut queue_msg = MSG::default();
            unsafe {
                let _ = PeekMessageW(&mut queue_msg, HWND(0), 0, 0, PM_NOREMOVE);
            }

            let state = CallbackState {
                target,
                detector: DoubleTapDetector::new(WINDOW_MS),
                sender: callback_tx,
            };
            *CALLBACK_STATE.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner()) = Some(state);

            let hook = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), HINSTANCE(0), 0) };
            let hook = match hook {
                Ok(hook) => hook,
                Err(e) => {
                    *CALLBACK_STATE.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner()) = None;
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

            *CALLBACK_STATE.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner()) = None;
        });

        let emit_thread = thread::spawn(move || {
            for _ in fire_rx {
                logger::log_info("[Shortcut] Ctrl+N: グローバル発火 → fusen:request_create_global emit");
                perflog::log_event("ctrl-n-global", "GLOBAL_CTRL_N_PRESSED", None, None, serde_json::json!({}));
                let _ = app_handle.emit("fusen:request_create_global", ());
            }
        });

        match ready_rx.recv().map_err(|e| e.to_string())? {
            Ok((hook, thread_id)) => {
                *RUNTIME.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner()) = Some(HookRuntime {
                    target,
                    hook,
                    thread_id,
                    hook_thread,
                    emit_thread,
                });
                Ok(())
            },
            Err(e) => {
                drop(fire_tx);
                let _ = hook_thread.join();
                let _ = emit_thread.join();
                Err(e)
            },
        }
    }

    pub(crate) fn stop() {
        let runtime = RUNTIME.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner()).take();
        if let Some(runtime) = runtime {
            if let Err(e) = unsafe { UnhookWindowsHookEx(HHOOK(runtime.hook)) } {
                logger::log_warn(&format!("[Shortcut] double tap unhook failed: {}", e));
            }
            if let Err(e) = unsafe { PostThreadMessageW(runtime.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) } {
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

            if let Some(state) = CALLBACK_STATE.get_or_init(|| Mutex::new(None)).lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
                if let Some(tap_event) = map_event(event.vkCode, message, state.target) {
                    // プライバシー方針: 対象修飾キー以外は「他キーが押された」という事実だけを
                    // 判定に使う。キーコードや入力内容は保持・記録・ログ出力しない。
                        if state.detector.on_event(tap_event, event.time as u64) {
                            let _ = state.sender.send(());
                        }
                }
            }
        }

        unsafe { CallNextHookEx(HHOOK(0), code, wparam, lparam) }
    }

    fn map_event(vk_code: u32, message: u32, target: DoubleTapTarget) -> Option<TapEvent> {
        match message {
            WM_KEYDOWN | WM_SYSKEYDOWN => {
                if event_matches_target(vk_code, target) {
                    Some(TapEvent::TargetDown)
                } else {
                    Some(TapEvent::OtherKeyDown)
                }
            },
            WM_KEYUP | WM_SYSKEYUP => {
                if event_matches_target(vk_code, target) {
                    Some(TapEvent::TargetUp)
                } else {
                    None
                }
            },
            _ => None,
        }
    }

    fn event_matches_target(vk_code: u32, target: DoubleTapTarget) -> bool {
        match target {
            DoubleTapTarget::Ctrl => {
                vk_code == VK_LCONTROL.0 as u32 || vk_code == VK_RCONTROL.0 as u32
            },
            DoubleTapTarget::Shift => {
                vk_code == VK_LSHIFT.0 as u32 || vk_code == VK_RSHIFT.0 as u32
            },
        }
    }
}

#[cfg(windows)]
pub(crate) use windows_hook::{start, stop};

#[cfg(not(windows))]
pub(crate) fn start(_app_handle: tauri::AppHandle, _target: DoubleTapTarget) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
pub(crate) fn stop() {}

#[cfg(test)]
mod tests {
    use super::{DoubleTapDetector, TapEvent};

    #[test]
    fn fires_on_normal_double_tap() {
        let mut detector = DoubleTapDetector::new(350);

        assert!(!detector.on_event(TapEvent::TargetDown, 1000));
        assert!(!detector.on_event(TapEvent::TargetUp, 1030));
        assert!(detector.on_event(TapEvent::TargetDown, 1200));
    }

    #[test]
    fn does_not_fire_when_other_key_is_used_with_target() {
        let mut detector = DoubleTapDetector::new(350);

        assert!(!detector.on_event(TapEvent::TargetDown, 1000));
        assert!(!detector.on_event(TapEvent::OtherKeyDown, 1010));
        assert!(!detector.on_event(TapEvent::TargetUp, 1030));
        assert!(!detector.on_event(TapEvent::TargetDown, 1200));
        assert!(!detector.on_event(TapEvent::OtherKeyDown, 1210));
        assert!(!detector.on_event(TapEvent::TargetUp, 1230));
    }

    #[test]
    fn does_not_fire_after_window_expires() {
        let mut detector = DoubleTapDetector::new(350);

        assert!(!detector.on_event(TapEvent::TargetDown, 1000));
        assert!(!detector.on_event(TapEvent::TargetUp, 1030));
        assert!(!detector.on_event(TapEvent::TargetDown, 1400));
    }

    #[test]
    fn ignores_repeated_down_while_target_is_down() {
        let mut detector = DoubleTapDetector::new(350);

        assert!(!detector.on_event(TapEvent::TargetDown, 1000));
        assert!(!detector.on_event(TapEvent::TargetDown, 1010));
        assert!(!detector.on_event(TapEvent::TargetUp, 1030));
        assert!(detector.on_event(TapEvent::TargetDown, 1200));
    }

    #[test]
    fn triple_tap_fires_only_once() {
        let mut detector = DoubleTapDetector::new(350);
        let mut fires = 0;

        if detector.on_event(TapEvent::TargetDown, 1000) { fires += 1; }
        if detector.on_event(TapEvent::TargetUp, 1030) { fires += 1; }
        if detector.on_event(TapEvent::TargetDown, 1200) { fires += 1; }
        if detector.on_event(TapEvent::TargetUp, 1230) { fires += 1; }
        if detector.on_event(TapEvent::TargetDown, 1300) { fires += 1; }

        assert_eq!(fires, 1);
    }

    #[test]
    fn can_fire_again_from_down_after_failed_attempt() {
        let mut detector = DoubleTapDetector::new(350);

        assert!(!detector.on_event(TapEvent::TargetDown, 1000));
        assert!(!detector.on_event(TapEvent::TargetUp, 1030));
        assert!(!detector.on_event(TapEvent::OtherKeyDown, 1100));
        assert!(!detector.on_event(TapEvent::TargetDown, 1200));
        assert!(!detector.on_event(TapEvent::TargetUp, 1230));
        assert!(detector.on_event(TapEvent::TargetDown, 1300));
    }
}
