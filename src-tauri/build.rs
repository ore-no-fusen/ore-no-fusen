/*
 * Tauri ビルドスクリプト
 *
 * 責務:
 * - ビルド時の追加処理 (音声ファイルのコピー等)
 * - 変更検知トリガーの設定 (cargo:rerun-if-changed)
 */

use std::fs;
use std::path::Path;

fn main() {
  // .env.local から GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET をコンパイル時に埋め込む
  let env_path = std::path::Path::new("../.env.local");
  println!("cargo:rerun-if-changed=../.env.local");
  if let Ok(content) = std::fs::read_to_string(env_path) {
    for line in content.lines() {
      let line = line.trim();
      if line.starts_with('#') { continue; }
      if let Some(pos) = line.find('=') {
        let key = &line[..pos];
        let val = line[pos + 1..].trim_matches('"');
        if key == "GDRIVE_CLIENT_ID" || key == "GDRIVE_CLIENT_SECRET" {
          println!("cargo:rustc-env={}={}", key, val);
        }
      }
    }
  }

  // 自動同期: public/sounds のファイルを OUT_DIR にコピーして埋め込み可能にする
  // ソースディレクトリ(src/)へのコピーは無限ループの原因になるため廃止
  let sounds = ["create.wav", "save.wav", "delete.wav", "alarm.wav"];
  let public_sounds_dir = Path::new("../public/sounds"); // src-tauri から見た相対パス
  
  // OUT_DIRを取得 (Cargoが設定するビルド出力ディレクトリ)
  let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR not set");
  let dest_dir = Path::new(&out_dir);

  // 変更監視: public/sounds フォルダに変更があったら再ビルド
  println!("cargo:rerun-if-changed=../public/sounds");

  for sound in sounds.iter() {
    let src_path = public_sounds_dir.join(sound);
    let dest_path = dest_dir.join(sound);

    if src_path.exists() {
      // 上書きコピー
      if let Err(e) = fs::copy(&src_path, &dest_path) {
         println!("cargo:warning=Failed to copy sound file {:?}: {}", src_path, e);
      }
    } else {
      println!("cargo:warning=Sound file not found: {:?}", src_path);
    }
  }

  tauri_build::build()
}
