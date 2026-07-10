#![allow(dead_code)]

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum MouseClickEvent {
    RightDown,
    OtherDown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum TripleRightClickOutcome {
    Fired,
    Reset(TripleRightClickReset),
    Ignored,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum TripleRightClickReset {
    OtherButtonDown,
    Timeout { elapsed_ms: u64, window_ms: u64 },
}

pub(crate) struct TripleRightClickDetector {
    window_ms: u64,
    count: u8,
    last_right_down_ms: Option<u64>,
}

impl TripleRightClickDetector {
    pub fn new(window_ms: u64) -> Self {
        Self {
            window_ms,
            count: 0,
            last_right_down_ms: None,
        }
    }

    pub fn on_event(
        &mut self,
        event: MouseClickEvent,
        now_ms: u64,
    ) -> TripleRightClickOutcome {
        match event {
            MouseClickEvent::RightDown => self.on_right_down(now_ms),
            MouseClickEvent::OtherDown => {
                self.reset();
                TripleRightClickOutcome::Reset(TripleRightClickReset::OtherButtonDown)
            }
        }
    }

    fn on_right_down(&mut self, now_ms: u64) -> TripleRightClickOutcome {
        if let Some(last_down_ms) = self.last_right_down_ms {
            let elapsed_ms = now_ms.saturating_sub(last_down_ms);
            if elapsed_ms > self.window_ms {
                self.count = 1;
                self.last_right_down_ms = Some(now_ms);
                return TripleRightClickOutcome::Reset(TripleRightClickReset::Timeout {
                    elapsed_ms,
                    window_ms: self.window_ms,
                });
            }
        } else {
            self.count = 0;
        }

        self.count = self.count.saturating_add(1);
        self.last_right_down_ms = Some(now_ms);

        if self.count >= 3 {
            self.reset();
            TripleRightClickOutcome::Fired
        } else {
            TripleRightClickOutcome::Ignored
        }
    }

    fn reset(&mut self) {
        self.count = 0;
        self.last_right_down_ms = None;
    }
}

#[cfg(windows)]
mod windows_hook {
    use std::mem::MaybeUninit;
    use std::sync::mpsc;
    use std::sync::{Mutex, OnceLock};
    use std::thread::{self, JoinHandle};

    use tauri::{AppHandle, Emitter, Runtime};
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PeekMessageW, PostThreadMessageW, SetWindowsHookExW,
        UnhookWindowsHookEx, HHOOK, MSLLHOOKSTRUCT, MSG, PM_NOREMOVE, WH_MOUSE_LL,
        WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_QUIT, WM_RBUTTONDOWN,
    };

    use super::{MouseClickEvent, TripleRightClickDetector, TripleRightClickOutcome};
    use crate::logger;

    const WINDOW_MS: u64 = 350;

    struct CallbackState {
        detector: TripleRightClickDetector,
        sender: mpsc::Sender<()>,
    }

    struct HookRuntime {
        hook: isize,
        thread_id: u32,
        hook_thread: JoinHandle<()>,
        emit_thread: JoinHandle<()>,
    }

    static CALLBACK_STATE: OnceLock<Mutex<Option<CallbackState>>> = OnceLock::new();
    static RUNTIME: OnceLock<Mutex<Option<HookRuntime>>> = OnceLock::new();

    pub(crate) fn start<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
        if RUNTIME
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_some()
        {
            return Ok(());
        }

        let (fire_tx, fire_rx) = mpsc::channel::<()>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(isize, u32), String>>();
        let callback_tx = fire_tx.clone();
        let hook_thread = thread::spawn(move || {
            let thread_id = unsafe { GetCurrentThreadId() };
            let mut queue_msg = MSG::default();
            unsafe {
                let _ = PeekMessageW(&mut queue_msg, HWND(0), 0, 0, PM_NOREMOVE);
            }

            *CALLBACK_STATE
                .get_or_init(|| Mutex::new(None))
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(CallbackState {
                detector: TripleRightClickDetector::new(WINDOW_MS),
                sender: callback_tx,
            });

            let hook =
                unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), HINSTANCE(0), 0) };
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
            for _ in fire_rx {
                logger::log_info("[Shortcut] triple right click: fusen:toggle_quick_launcher emit");
                let _ = app_handle.emit("fusen:toggle_quick_launcher", ());
            }
        });

        match ready_rx.recv().map_err(|e| e.to_string())? {
            Ok((hook, thread_id)) => {
                *RUNTIME
                    .get_or_init(|| Mutex::new(None))
                    .lock()
                    .unwrap_or_else(|e| e.into_inner()) = Some(HookRuntime {
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
                logger::log_warn(&format!("[Shortcut] triple right click unhook failed: {}", e));
            }
            if let Err(e) =
                unsafe { PostThreadMessageW(runtime.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) }
            {
                logger::log_warn(&format!(
                    "[Shortcut] triple right click thread quit failed: {}",
                    e
                ));
            }
            let _ = runtime.hook_thread.join();
            let _ = runtime.emit_thread.join();
        }
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let event = unsafe { &*(lparam.0 as *const MSLLHOOKSTRUCT) };
            let message = wparam.0 as u32;

            if let Some(click_event) = map_event(message) {
                if let Some(state) = CALLBACK_STATE
                    .get_or_init(|| Mutex::new(None))
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .as_mut()
                {
                    if state.detector.on_event(click_event, event.time as u64)
                        == TripleRightClickOutcome::Fired
                    {
                        let _ = state.sender.send(());
                    }
                }
            }
        }

        unsafe { CallNextHookEx(HHOOK(0), code, wparam, lparam) }
    }

    fn map_event(message: u32) -> Option<MouseClickEvent> {
        match message {
            WM_RBUTTONDOWN => Some(MouseClickEvent::RightDown),
            WM_LBUTTONDOWN | WM_MBUTTONDOWN => Some(MouseClickEvent::OtherDown),
            _ => None,
        }
    }
}

#[cfg(windows)]
pub(crate) use windows_hook::{start, stop};

#[cfg(not(windows))]
pub(crate) fn start<R: tauri::Runtime>(_app_handle: tauri::AppHandle<R>) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
pub(crate) fn stop() {}

#[cfg(test)]
mod tests {
    use super::{
        MouseClickEvent, TripleRightClickDetector, TripleRightClickOutcome, TripleRightClickReset,
    };

    const WINDOW_MS: u64 = 350;

    #[test]
    fn fires_on_third_right_down_within_window() {
        let mut detector = TripleRightClickDetector::new(WINDOW_MS);

        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1000),
            TripleRightClickOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1200),
            TripleRightClickOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1400),
            TripleRightClickOutcome::Fired
        );
    }

    #[test]
    fn resets_when_interval_exceeds_window() {
        let mut detector = TripleRightClickDetector::new(WINDOW_MS);

        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1000),
            TripleRightClickOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1401),
            TripleRightClickOutcome::Reset(TripleRightClickReset::Timeout {
                elapsed_ms: 401,
                window_ms: WINDOW_MS,
            })
        );
        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1500),
            TripleRightClickOutcome::Ignored
        );
    }

    #[test]
    fn resets_when_other_button_down_is_between_right_downs() {
        let mut detector = TripleRightClickDetector::new(WINDOW_MS);

        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1000),
            TripleRightClickOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(MouseClickEvent::OtherDown, 1100),
            TripleRightClickOutcome::Reset(TripleRightClickReset::OtherButtonDown)
        );
        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1200),
            TripleRightClickOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1300),
            TripleRightClickOutcome::Ignored
        );
    }

    #[test]
    fn resets_after_fire_so_four_clicks_do_not_fire_twice() {
        let mut detector = TripleRightClickDetector::new(WINDOW_MS);
        let mut fires = 0;

        for now_ms in [1000, 1100, 1200, 1300] {
            if detector.on_event(MouseClickEvent::RightDown, now_ms)
                == TripleRightClickOutcome::Fired
            {
                fires += 1;
            }
        }

        assert_eq!(fires, 1);
    }

    #[test]
    fn does_not_fire_on_two_clicks() {
        let mut detector = TripleRightClickDetector::new(WINDOW_MS);

        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1000),
            TripleRightClickOutcome::Ignored
        );
        assert_eq!(
            detector.on_event(MouseClickEvent::RightDown, 1100),
            TripleRightClickOutcome::Ignored
        );
    }
}
