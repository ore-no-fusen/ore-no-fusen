/*
 * サウンド再生機能
 *
 * 責務:
 * - 効果音リソースの埋め込みと管理
 * - 専用スレッドで OutputStream を握り続け、安定して鳴らす（旧実装は毎回 try_default していて競合・初期化失敗で「鳴らない」事象が出ていた）
 * - リクエストはチャンネルで投げ、呼び出し側はブロックしない
 */

use std::io::Cursor;
use std::sync::OnceLock;
use std::sync::mpsc::{self, Sender};
use rodio::{Decoder, OutputStream, Sink};

// Sound embedded in the binary (from OUT_DIR)
const CREATE_SOUND: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/create.wav"));
const SAVE_SOUND: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/save.wav"));
const DELETE_SOUND: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/delete.wav"));
const ALARM_SOUND: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/alarm.wav"));

/// 1 回の再生リクエスト
struct PlayRequest {
    data: &'static [u8],
    volume: f32,
}

/// 再生スレッドへの送信口（プロセスで 1 個）
static SENDER: OnceLock<Sender<PlayRequest>> = OnceLock::new();

/// 専用再生スレッドを 1 度だけ起動し、その送信口を返す。
/// このスレッドが OutputStream を握り続けることで Windows の
/// オーディオデバイス初期化競合（毎回 try_default すると数百ms
/// オーダーで失敗することがある）を回避する。
fn sender() -> &'static Sender<PlayRequest> {
    SENDER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<PlayRequest>();
        std::thread::Builder::new()
            .name("fusen-audio".into())
            .spawn(move || {
                // OutputStream はこのスレッドが生きている限り保持する
                let (_stream, handle) = match OutputStream::try_default() {
                    Ok(v) => v,
                    Err(e) => {
                        eprintln!("[Sound] OutputStream init failed: {}", e);
                        return;
                    }
                };

                while let Ok(req) = rx.recv() {
                    if let Err(e) = play_one(&handle, req.data, req.volume) {
                        eprintln!("[Sound] play failed: {}", e);
                    }
                }
            })
            .expect("failed to spawn fusen-audio thread");
        tx
    })
}

fn play_one(
    handle: &rodio::OutputStreamHandle,
    data: &'static [u8],
    volume: f32,
) -> Result<(), Box<dyn std::error::Error>> {
    let sink = Sink::try_new(handle)?;
    sink.set_volume(volume);
    let source = Decoder::new(Cursor::new(data))?;
    sink.append(source);
    // 鳴り終わるまでこのスレッドで待つ（並列再生はしない＝同じ音を連打しても重ならない）
    sink.sleep_until_end();
    Ok(())
}

#[tauri::command]
pub fn fusen_play_sound(name: String, volume: Option<f32>) {
    let vol = volume.unwrap_or(1.0);
    let data: &'static [u8] = match name.as_str() {
        "create" => CREATE_SOUND,
        "save" => SAVE_SOUND,
        "delete" => DELETE_SOUND,
        "alarm" => ALARM_SOUND,
        _ => return,
    };

    // チャンネルに投げるだけで即 return。Tauri コマンドはブロックしない
    if let Err(e) = sender().send(PlayRequest { data, volume: vol }) {
        eprintln!("[Sound] send to audio thread failed: {}", e);
    }
}
