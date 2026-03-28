# Rust レビューノート（Plan 01）

## unwrap() 残存一覧

### 本番コード（要対応）

| ファイル | ライン | コード | リスク |
|---------|--------|--------|--------|
| tray.rs | 55 | `state.lock().unwrap()` | Mutex ポイズンでパニック（トレイメニュー構築時） |
| tray.rs | 131 | `state.lock().unwrap()` | Mutex ポイズンでパニック（タグトグル時） |
| logic.rs | 371 | `content.find("---").unwrap()` | フロントマター末尾 `---` なし文字列でパニック（ただし呼び出し前に `starts_with("---")` チェックあり） |
| logic.rs | 380 | `regex::Regex::new(...).unwrap()` | 正規表現パターンはリテラル文字列のため実質パニックしない（低リスク） |
| logic.rs | 89-96 | 複数の `regex::Regex::new(...).unwrap()` | 同上。コンパイル時定数リテラルなので実質パニックしない |
| logic.rs | 139 | `regex::Regex::new(...).unwrap()` | 同上 |
| storage.rs | 118 | `path.file_name().unwrap()` | `is_file()` チェック後のみ到達。`.` や `..` でないため実質 `None` にならない（低リスク） |
| storage.rs | 279 | `regex::Regex::new(...).unwrap()` | コンパイル時リテラル。実質パニックしない（低リスク） |
| storage.rs | 306 | `regex::Regex::new(...).unwrap()` | コンパイル時リテラル。実質パニックしない（低リスク） |

#### リスク分類（優先度）

| 優先度 | 箇所 | 理由 |
|--------|------|------|
| 高 | tray.rs:55, 131 | Mutex ポイズン（パニック中の lock 取得）でアプリ全体が停止する |
| 中 | logic.rs:371 | 実行パスに到達する条件はほぼ満たされているが、将来のリファクタリングで保護が外れるリスクがある |
| 低 | storage.rs:118, logic.rs:89-96,139,380, storage.rs:279,306 | リテラル正規表現・到達条件による事実上の安全性確保済み |

### テストコード（対応不要）

| ファイル | ライン | コード |
|---------|--------|--------|
| lib.rs | 1400 | `tempdir().unwrap()` |
| lib.rs | 1404-1405 | `fs::write(...).unwrap()` |
| lib.rs | 1407 | `.to_str().unwrap()` |
| storage.rs | 399〜621 | テストブロック内の多数の `.unwrap()` |
| logic.rs | 559, 1068〜1084 | テストブロック内の `.unwrap()` |

- lib.rs の `#[cfg(test)]` は line 1392 以降
- storage.rs の `#[cfg(test)]` は line 388 以降
- logic.rs の `#[cfg(test)]` は line 452 以降
- 上記テストコード行は各ファイルの `#[cfg(test)]` ブロック内に含まれるため本番リスクなし

## Win32 / Tauri 状態同期確認

### fusen_show_at_position (lib.rs:1084〜1141)

- 生Win32 `SetWindowPos(SWP_SHOWWINDOW)` でウィンドウを表示・リサイズ・移動を原子的に実行
- **line 1134**: `let _ = win.show();` が末尾に追加済み
- 同期状況: **完了**。コメントにも「`SetWindowPos` だけでは Tauri 内部 visibility 状態を更新しない。`win.show()` で同期しないと tao が "hidden" 判定してウィンドウを非表示にするバグが発生する」と明記されている

### fusen_set_always_on_top (lib.rs:99〜132)

- 生Win32 `SetWindowPos(HWND_TOPMOST/HWND_NOTOPMOST, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE)` を直接使用
- Tauri の `window.set_always_on_top()` を使用しない（tao の visibility 状態影響を排除するため）
- `win.show()` 呼び出しは不要（`SWP_SHOWWINDOW` を渡していないため visibility 変更なし）
- 同期状況: **完了**。MEMORY.md のピンボタン修正パターンに従った実装済み

## storage.rs 保存フロー

### write_note (line 186〜229)

- **アトミック書き込み実装済み**: 一時ファイル（`.tmp` 拡張子）に書き込み後 `fs::rename()` でアトミック置換
- エラーハンドリング:
  - 一時ファイル書き込み失敗 → `Err` を即時返却
  - `rename` 失敗（Windowsでターゲット存在時）→ フォールバック: ターゲット削除 → 再 `rename`
  - フォールバック失敗時も一時ファイルをクリーンアップして `Err` 返却
- **データ消失リスク**: なし。すべてのエラーパスで一時ファイルがクリーンアップされ、元ファイルを破壊せずに失敗する設計

### 内部の unwrap() (line 194-197)

```rust
let file_stem = path_obj.file_stem().unwrap_or_default().to_string_lossy();
let extension = path_obj.extension().unwrap_or_default().to_string_lossy();
let temp_path = path_obj.parent().unwrap_or(Path::new(".")).join(temp_filename);
```

- `unwrap_or_default()` / `unwrap_or()` を使用しており、パニックなし
- フォールバック値でも動作上問題ない（同ディレクトリへの書き込み保証）

### save_settings (line 35〜39)

- `?` 演算子で全エラーを `Result` に伝播
- データ消失リスク: なし

### rename_note (line 231〜233)

- `fs::rename()` のラッパー。エラーは `Result<(), String>` で返却
- データ消失リスク: なし（ファイルシステムの rename はアトミック）

## 総評

- **STAB-02 の充足状況**: 部分充足。高優先度の `tray.rs` 2箇所は未対応
- **Phase 2 の修正対象**: tray.rs:55 と tray.rs:131 の `state.lock().unwrap()` を `unwrap_or_else` または `lock().ok()?` パターンに変更
- **logic.rs:371**: 現行の保護条件（`starts_with("---")` チェック）で実質安全だが、Phase 2 で `?` 伝播に変更推奨
