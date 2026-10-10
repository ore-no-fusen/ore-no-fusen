/*
 * アプリケーションエントリーポイント
 *
 * 責務:
 * - アプリケーションの初期化と実行
 * - Windows用コンソール制御
 */

// Jump List starts this executable directly, including in development.
// Avoid allocating a console before the single-instance request is forwarded.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
  app_lib::run();
}
