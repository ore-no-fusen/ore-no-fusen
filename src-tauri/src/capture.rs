use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;
use std::fs;
use tauri::{State, command};
use std::sync::Mutex;
use arboard::Clipboard;
use image::ImageBuffer;
use crate::state::AppState;

#[command]
pub async fn fusen_capture_screen(state: State<'_, Mutex<AppState>>, note_seq: i32) -> Result<String, String> {
    eprintln!("[CAPTURE_DEBUG] === Starting screen capture for note seq: {} ===", note_seq);
    
    // 1. Resolve Base Path
    let app_state = state.lock().unwrap();
    let base_path_str = app_state.base_path.clone()
        .or(app_state.folder_path.clone())
        .ok_or("Base path not set")?;
    drop(app_state); // Unlock early
    
    let base_path = PathBuf::from(&base_path_str);
    eprintln!("[CAPTURE_DEBUG] Base path: {:?}", base_path);
    
    // Assets directory: <base>/assets
    let assets_dir = base_path.join("assets");
    eprintln!("[CAPTURE_DEBUG] Assets directory: {:?}", assets_dir);
    
    if !assets_dir.exists() {
        eprintln!("[CAPTURE_DEBUG] Assets dir does not exist, creating...");
        fs::create_dir_all(&assets_dir).map_err(|e| format!("Failed to create assets dir: {}", e))?;
    }
    
    // 2. Prepare Clipboard
    {
        eprintln!("[CAPTURE_DEBUG] Clearing clipboard...");
        let mut clipboard = Clipboard::new().map_err(|e| format!("Failed to access clipboard: {}", e))?;
        let _ = clipboard.clear();
    } // clipboard is dropped here, releasing any potential locks
    
    // 3. Launch Snipping Tool (ms-screenclip:)
    #[cfg(target_os = "windows")]
    {
        eprintln!("[CAPTURE_DEBUG] Launching Snipping Tool via ms-screenclip:");
        Command::new("explorer")
            .arg("ms-screenclip:")
            .spawn()
            .map_err(|e| format!("Failed to launch Snipping Tool: {}", e))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        return Err("Screen capture is only supported on Windows".to_string());
    }
    
    // 4. Loop and Wait for Image in Clipboard
    let start_time = std::time::Instant::now();
    let timeout = Duration::from_secs(60); 
    
    let mut caught_image: Option<arboard::ImageData> = None;
    
    eprintln!("[CAPTURE_DEBUG] Waiting for clipboard update (timeout: 60s)...");
    let mut poll_count = 0;
    while start_time.elapsed() < timeout {
        thread::sleep(Duration::from_millis(200));
        poll_count += 1;
        
        if poll_count % 10 == 0 {
            eprintln!("[CAPTURE_DEBUG] Still waiting... ({}s elapsed)", start_time.elapsed().as_secs());
        }
        
        if let Ok(mut clipboard) = Clipboard::new() {
             match clipboard.get_image() {
                Ok(img) => {
                    eprintln!("[CAPTURE_DEBUG] ✓ Image found in clipboard! Size: {}x{}", img.width, img.height);
                    caught_image = Some(img);
                    break;
                },
                Err(e) => {
                    // 通常はエラーが正常（画像がまだない）
                    if poll_count == 1 {
                        eprintln!("[CAPTURE_DEBUG] No image yet (expected). Error: {}", e);
                    }
                }
            }
        }
    }
    
    let img_data = caught_image.ok_or_else(|| {
        eprintln!("[CAPTURE_DEBUG] ✗ Capture timed out or no image selected");
        "Capture timed out or no image selected".to_string()
    })?;
    
    // 5. Convert to ImageBuffer
    eprintln!("[CAPTURE_DEBUG] Converting image to buffer...");
    let width = img_data.width as u32;
    let height = img_data.height as u32;
    let buffer: ImageBuffer<image::Rgba<u8>, Vec<u8>> = ImageBuffer::from_raw(width, height, img_data.bytes.into_owned())
        .ok_or("Failed to create ImageBuffer")?;
    
    // 6. Generate Filename (NoteSeq_YYYYMMDD_NN.png)
    let today = chrono::Local::now().format("%Y%m%d").to_string();
    let prefix = format!("{}_{}_", note_seq, today);
    
    // Count existing files to find next serial (NN)
    let mut max_serial = 0;
    if let Ok(entries) = fs::read_dir(&assets_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            // Format: {NoteSeq}_{YYYYMMDD}_{Serial}.png
            if name.starts_with(&prefix) && name.ends_with(".png") {
                // Extract Serial portion
                let stem = name.replace(".png", "");
                let parts: Vec<&str> = stem.split('_').collect();
                if let Some(serial_str) = parts.last() {
                    if let Ok(num) = serial_str.parse::<i32>() {
                        if num > max_serial { max_serial = num; }
                    }
                }
            }
        }
    }
    let next_serial = max_serial + 1;
    let filename = format!("{}{:02}.png", prefix, next_serial);
    let target_path = assets_dir.join(&filename);
    
    eprintln!("[CAPTURE_DEBUG] Saving to: {:?}", target_path);
    
    // 7. Save Image
    buffer.save(&target_path).map_err(|e| format!("Failed to save image: {}", e))?;
    
    eprintln!("[CAPTURE_DEBUG] ✓ Capture successful! Path: {:?}", target_path);
    
    Ok(target_path.to_string_lossy().to_string())
}
