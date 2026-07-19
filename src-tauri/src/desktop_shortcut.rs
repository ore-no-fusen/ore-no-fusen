use std::path::PathBuf;

const STORE_SHORTCUT_NAME: &str = "俺の付箋（Store版）.lnk";
const DESKTOP_SHORTCUT_NAME: &str = "俺の付箋.lnk";
const MSIX_APPLICATION_ID: &str = "OreNoFusen";
const SHORTCUT_ICON: &[u8] = include_bytes!("../icons/icon.ico");

fn msix_shell_arguments(package_family_name: &str) -> String {
    format!("shell:AppsFolder\\{}!{}", package_family_name, MSIX_APPLICATION_ID)
}

fn stable_icon_path() -> Result<PathBuf, String> {
    let base = directories::BaseDirs::new()
        .ok_or("AppDataフォルダーを取得できませんでした")?
        .data_dir()
        .join("OreNoFusen");
    std::fs::create_dir_all(&base)
        .map_err(|e| format!("ショートカット用アイコンのフォルダーを作成できませんでした: {e}"))?;
    let icon = base.join("shortcut-icon.ico");
    if std::fs::read(&icon).ok().as_deref() != Some(SHORTCUT_ICON) {
        std::fs::write(&icon, SHORTCUT_ICON)
            .map_err(|e| format!("ショートカット用アイコンを保存できませんでした: {e}"))?;
    }
    Ok(icon)
}

fn shortcut_path() -> Result<PathBuf, String> {
    let desktop = directories::UserDirs::new()
        .and_then(|dirs| dirs.desktop_dir().map(PathBuf::from))
        .ok_or("デスクトップフォルダーを取得できませんでした")?;
    let name = if crate::distribution::is_msix_packaged() {
        STORE_SHORTCUT_NAME
    } else {
        DESKTOP_SHORTCUT_NAME
    };
    Ok(desktop.join(name))
}

#[cfg(windows)]
fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    value.encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn create_windows_shortcut(path: &std::path::Path) -> Result<(), String> {
    use windows::core::{ComInterface, PCWSTR};
    use windows::Win32::Foundation::TRUE;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let result = (|| -> Result<(), String> {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("ショートカット機能を初期化できませんでした: {e}"))?;

            if crate::distribution::is_msix_packaged() {
                let family = windows::ApplicationModel::Package::Current()
                    .and_then(|package| package.Id())
                    .and_then(|id| id.FamilyName())
                    .map_err(|e| format!("Store版のアプリIDを取得できませんでした: {e}"))?;
                let arguments = msix_shell_arguments(&family.to_string());
                let explorer = wide(std::ffi::OsStr::new("explorer.exe"));
                let args = wide(std::ffi::OsStr::new(&arguments));
                link.SetPath(PCWSTR(explorer.as_ptr()))
                    .map_err(|e| format!("ショートカットの起動先を設定できませんでした: {e}"))?;
                link.SetArguments(PCWSTR(args.as_ptr()))
                    .map_err(|e| format!("Store版のアプリIDを設定できませんでした: {e}"))?;
            } else {
                let executable = std::env::current_exe()
                    .map_err(|e| format!("アプリの場所を取得できませんでした: {e}"))?;
                let executable = wide(executable.as_os_str());
                link.SetPath(PCWSTR(executable.as_ptr()))
                    .map_err(|e| format!("ショートカットの起動先を設定できませんでした: {e}"))?;
            }

            let description = wide(std::ffi::OsStr::new("俺の付箋を起動します"));
            link.SetDescription(PCWSTR(description.as_ptr()))
                .map_err(|e| format!("ショートカットの説明を設定できませんでした: {e}"))?;
            let icon = stable_icon_path()?;
            let icon = wide(icon.as_os_str());
            link.SetIconLocation(PCWSTR(icon.as_ptr()), 0)
                .map_err(|e| format!("ショートカットのアイコンを設定できませんでした: {e}"))?;

            let persist: IPersistFile = link.cast()
                .map_err(|e| format!("ショートカットを保存できませんでした: {e}"))?;
            let output = wide(path.as_os_str());
            persist.Save(PCWSTR(output.as_ptr()), TRUE)
                .map_err(|e| format!("デスクトップへショートカットを保存できませんでした: {e}"))?;
            Ok(())
        })();
        if initialized {
            CoUninitialize();
        }
        result
    }
}

#[cfg(not(windows))]
fn create_windows_shortcut(_path: &std::path::Path) -> Result<(), String> {
    Err("デスクトップショートカットはWindows版だけで利用できます".to_string())
}

#[tauri::command]
pub fn fusen_get_desktop_shortcut_state() -> Result<bool, String> {
    Ok(shortcut_path()?.is_file())
}

#[tauri::command]
pub fn fusen_create_desktop_shortcut() -> Result<String, String> {
    let path = shortcut_path()?;
    create_windows_shortcut(&path)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn fusen_remove_desktop_shortcut() -> Result<(), String> {
    let path = shortcut_path()?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("ショートカットを削除できませんでした: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn fusen_should_prompt_desktop_shortcut() -> Result<bool, String> {
    if !crate::distribution::is_msix_packaged() {
        return Ok(false);
    }
    let settings = crate::storage::load_settings()?;
    Ok(!settings.desktop_shortcut_prompted && !shortcut_path()?.is_file())
}

#[tauri::command]
pub fn fusen_mark_desktop_shortcut_prompted() -> Result<(), String> {
    let mut settings = crate::storage::load_settings()?;
    settings.desktop_shortcut_prompted = true;
    crate::storage::save_settings(&settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_shortcut_is_visibly_distinct_from_legacy_name() {
        assert!(STORE_SHORTCUT_NAME.contains("Store版"));
        assert_ne!(STORE_SHORTCUT_NAME, DESKTOP_SHORTCUT_NAME);
    }

    #[test]
    fn msix_target_uses_stable_apps_folder_identity() {
        assert_eq!(
            msix_shell_arguments("ONFStudios.FUSEN_abc123"),
            "shell:AppsFolder\\ONFStudios.FUSEN_abc123!OreNoFusen"
        );
    }
}
