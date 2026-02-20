/*
 * アプリケーションエントリーポイント
 *
 * 責務:
 * - アプリケーションの初期化と実行
 * - Windows用コンソール制御
 */

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  app_lib::run();
}
