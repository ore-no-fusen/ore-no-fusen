use std::fs;
use std::path::Path;

fn main() {
  // 自動同期: public/sounds のファイルを src/ にコピーして埋め込み可能にする
  let sounds = ["create.wav", "save.wav", "delete.wav"];
  let public_sounds_dir = Path::new("../public/sounds"); // src-tauri から見た相対パス
  let src_dir = Path::new("src");

  // 変更監視: public/sounds フォルダに変更があったら再ビルド
  println!("cargo:rerun-if-changed=../public/sounds");

  for sound in sounds.iter() {
    let src_path = public_sounds_dir.join(sound);
    let dest_path = src_dir.join(sound);

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
