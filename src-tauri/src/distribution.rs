/*
 * 配布形式判定
 *
 * 責務:
 * - 実行中のアプリが MSIX package identity を持つか判定する
 */

#[cfg(windows)]
pub fn is_msix_packaged() -> bool {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{WIN32_ERROR, APPMODEL_ERROR_NO_PACKAGE};
    use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

    let mut length = 0u32;
    let result = unsafe { GetCurrentPackageFullName(&mut length, PWSTR::null()) };

    match result {
        Ok(_) => true,
        Err(e) => WIN32_ERROR::from_error(&e) != Some(APPMODEL_ERROR_NO_PACKAGE),
    }
}

#[cfg(not(windows))]
pub fn is_msix_packaged() -> bool {
    false
}

pub fn get_distribution_kind() -> &'static str {
    if is_msix_packaged() {
        "msix"
    } else {
        "desktop"
    }
}

/// MSIX版はStartupTaskを使うため、旧デスクトップ版が共有設定を読んでも
/// レジストリ自動起動を再登録しない状態へ移行する。
pub fn migrate_legacy_autostart_setting(auto_start: &mut bool) -> bool {
    if !*auto_start {
        return false;
    }
    *auto_start = false;
    true
}

#[cfg(test)]
mod tests {
    #[test]
    fn legacy_autostart_setting_is_disabled_once() {
        let mut auto_start = true;
        assert!(super::migrate_legacy_autostart_setting(&mut auto_start));
        assert!(!auto_start);
        assert!(!super::migrate_legacy_autostart_setting(&mut auto_start));
    }

    #[cfg(windows)]
    #[test]
    fn desktop_test_process_is_not_msix_packaged() {
        assert!(!super::is_msix_packaged());
        assert_eq!(super::get_distribution_kind(), "desktop");
    }

    #[cfg(not(windows))]
    #[test]
    fn non_windows_is_not_msix_packaged() {
        assert!(!super::is_msix_packaged());
        assert_eq!(super::get_distribution_kind(), "desktop");
    }
}
