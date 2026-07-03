#![allow(dead_code)]

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum TapEvent {
    TargetDown,
    TargetUp,
    OtherKeyDown,
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
