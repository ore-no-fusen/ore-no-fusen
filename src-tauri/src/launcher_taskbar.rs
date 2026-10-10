//! Windows Jump List task. Failure never blocks the existing keyboard entry.
pub(crate) fn install(app: &tauri::AppHandle) {
    #[cfg(windows)]
    {
        let is_en = crate::settings::get_settings(app.clone()).unwrap_or_default().language == "en";
        std::thread::spawn(move || {
            if let Err(e) = install_windows(is_en) {
                crate::logger::log_warn(&format!("[Launcher] Jump List unavailable: {e}"));
            } else {
                crate::logger::log_info("[Launcher] Jump List installed");
            }
        });
    }
    #[cfg(not(windows))]
    let _ = app;
}
#[cfg(windows)]
fn install_windows(is_en: bool) -> windows::core::Result<()> {
    use windows::core::{ComInterface, GUID, PCWSTR, PWSTR};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::{Com::StructuredStorage::PROPVARIANT, Variant::VT_LPWSTR};
    use windows::Win32::UI::Shell::{DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink, GetCurrentProcessExplicitAppUserModelID, Common::{IObjectArray, IObjectCollection}, PropertiesSystem::{IPropertyStore, PROPERTYKEY}};
    fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(Some(0)).collect() }
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)?;
        let result = (|| {
            let list: ICustomDestinationList = CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
            if let Ok(app_id) = GetCurrentProcessExplicitAppUserModelID() {
                let set_result = list.SetAppID(PCWSTR(app_id.0));
                CoTaskMemFree(Some(app_id.0.cast()));
                set_result?;
            }
            let mut slots = 0;
            let _removed: IObjectArray = list.BeginList(&mut slots)?;
            let built = (|| {
                let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
                let exe = wide(&std::env::current_exe().map_err(|_| windows::core::Error::from_win32())?.to_string_lossy());
                let args = wide("--quick-launcher");
                link.SetPath(PCWSTR(exe.as_ptr()))?;
                link.SetArguments(PCWSTR(args.as_ptr()))?;
                link.SetIconLocation(PCWSTR(exe.as_ptr()), 0)?;
                let mut title = wide(if is_en { "Open Quick Launcher" } else { "クイックランチャーを開く" });
                let props: IPropertyStore = link.cast()?;
                // System.Title (PKEY_Title), required for Jump List task links.
                let title_key = PROPERTYKEY { fmtid: GUID::from_u128(0xf29f85e0_4ff9_1068_ab91_08002b27b3d9), pid: 2 };
                // Borrow the buffer only for SetValue, which copies the value. Do not clear this borrowed variant.
                let mut value = PROPVARIANT::default();
                (*value.Anonymous.Anonymous).vt = VT_LPWSTR;
                (*value.Anonymous.Anonymous).Anonymous.pwszVal = PWSTR(title.as_mut_ptr());
                props.SetValue(&title_key, &value)?;
                props.Commit()?;
                let collection: IObjectCollection = CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
                collection.AddObject(&link)?;
                let tasks: IObjectArray = collection.cast()?;
                list.AddUserTasks(&tasks)?;
                list.CommitList()
            })();
            if built.is_err() { let _ = list.AbortList(); }
            built
        })();
        CoUninitialize();
        result
    }
}
