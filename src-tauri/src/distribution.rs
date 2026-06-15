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

#[cfg(test)]
mod tests {
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
