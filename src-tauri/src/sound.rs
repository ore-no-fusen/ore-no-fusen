use std::io::Cursor;
use rodio::{Decoder, OutputStream, Sink};
// thread is used via std::thread::spawn directly

// Sound embedded in the binary
const PEEL_OFF_SOUND: &[u8] = include_bytes!("../../public/sounds/peel-off.mp3");

#[tauri::command]
pub fn fusen_play_sound(name: String) {
    std::thread::spawn(move || {
        if let Err(e) = play_sound_impl(&name) {
            eprintln!("[Sound] Failed to play sound '{}': {}", name, e);
        }
    });
}

fn play_sound_impl(name: &str) -> Result<(), Box<dyn std::error::Error>> {
    // Get a output stream handle to the default physical sound device
    let (_stream, stream_handle) = OutputStream::try_default()?;
    let sink = Sink::try_new(&stream_handle)?;
    sink.set_volume(1.0); // Force max volume

    let data = match name {
        "peel-off" => PEEL_OFF_SOUND,
        _ => return Ok(()),
    };

    let cursor = Cursor::new(data);
    let source = Decoder::new(cursor)?;
    
    sink.append(source);
    sink.sleep_until_end();
    
    // Buffer flush safety
    std::thread::sleep(std::time::Duration::from_millis(100));
    
    Ok(())
}
