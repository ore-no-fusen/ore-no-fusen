use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, AppHandle, Runtime,
};

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // Menu
    let hide_i = MenuItem::with_id(app, "hide_all", "全部隠す (Hide All)", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show_all", "全部戻す (Show All)", true, None::<&str>)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", "終了 (Quit)", true, None::<&str>)?;
    
    let menu = Menu::with_items(app, &[&hide_i, &show_i, &separator, &quit_i])?;

    // Icon
    // Loading from embedded bytes
    let icon_bytes = include_bytes!("../icons/icon.ico");
    // from_bytes panics if format is not supported, but ico should be fine.
    // However, from_bytes returns Result.
    let icon = tauri::image::Image::from_bytes(icon_bytes).expect("Failed to parse icon");

    let _tray = TrayIconBuilder::with_id("tray")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "hide_all" => {
                    for win in app.webview_windows().values() {
                        // mainウィンドウ以外のすべてのウィンドウを隠す
                        if win.label() != "main" {
                            let _ = win.hide();
                        }
                    }
                },
                "show_all" => {
                    for win in app.webview_windows().values() {
                        // mainウィンドウ以外のすべてのウィンドウを表示
                        if win.label() != "main" {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                },
                "quit" => {
                    app.exit(0);
                },
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
