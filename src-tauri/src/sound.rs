use std::io::Cursor;
use rodio::{Decoder, OutputStream, Sink};
// thread is used via std::thread::spawn directly

// Sound embedded in the binary
// Sound embedded in the binary (from OUT_DIR)
const CREATE_SOUND: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/create.wav"));
const SAVE_SOUND: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/save.wav"));
const DELETE_SOUND: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/delete.wav"));

#[tauri::command]
pub fn fusen_play_sound(name: String, volume: Option<f32>) {
    std::thread::spawn(move || {
        let vol = volume.unwrap_or(1.0);
        if let Err(e) = play_sound_impl(&name, vol) {
            eprintln!("[Sound] Failed to play sound '{}': {}", name, e);
        }
    });
}

fn play_sound_impl(name: &str, volume: f32) -> Result<(), Box<dyn std::error::Error>> {
    // Get a output stream handle to the default physical sound device
    let (_stream, stream_handle) = OutputStream::try_default()?;
    let sink = Sink::try_new(&stream_handle)?;
    sink.set_volume(volume);

    let data = match name {
        "create" => CREATE_SOUND,
        "save" => SAVE_SOUND,
        "delete" => DELETE_SOUND,
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
