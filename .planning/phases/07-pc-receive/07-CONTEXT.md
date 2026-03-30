# Phase 7: PC受信 - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

iPhoneからDriveに書き込まれた `fusen_from_iphone.json` を、PCのRustバックグラウンドループが30秒間隔で検出し、新規付箋ウィンドウとして表示する。iPhone送信UI（Phase 6）は対象外。

</domain>

<decisions>
## Implementation Decisions

### ポーリング基盤（STATE.mdより引き継ぎ）
- Rust `tokio::spawn` + `tokio::time::interval(30秒)` — `setup()` 内で起動
- Drive通信: Rust `app.emit("fusen:note_from_iphone")` → JS `listen`
- polling loop は AppState Mutex に触れない（emit のみ）
- `Cargo.toml`: tokio features に `"time"` 追加

### 重複防止（STATE.mdより引き継ぎ）
- `LAST_IPHONE_NOTE_ID: std::sync::Mutex<Option<String>>` — static変数（プロセスメモリ）
- `received_at` を Drive に書き戻す（PC再起動後も有効）
- 判定順: received_at あり → スキップ → id 一致 → スキップ → 新着

### 受信通知・フィードバック
- 音: 既存の `playCreateSound()` を使用（新規作成音と同じ）
- ウィンドウ前面: `setFocus()` で前面に出す
- Windowsトースト通知: 出す。文言「iPhoneから付箋」固定
- 前面に出せない場合（最小化中など）: トーストだけ出て、ウィンドウは静かに開く

### 付箋のコンテキスト名（ファイル名に使われる部分）
優先度順:
1. `title` フィールド（iPhone入力欄の内容）
2. title が空 → 本文の1行目（最大10文字）
3. 本文も空 → 受信時刻（例: `'14:32'`）

### ウィンドウの開き方
- 位置: 画面右上（Windows画面右上コーナー近く）
- サイズ: Claude裁量（内容量に応じた適切なサイズ、画像・Mermaid含む可能性を考慮）
- 編集モード: しない — 表示モードで開く（クリックで編集できる通常状態、isNew=false）

### Drive未接続時の挙動
- gdrive_token.jsonなし: 設定画面の「Google接続」項目の横に赤ドット表示（接続成功後の次回ポーリング成功で自動消去）
- トークン期限切れ / Drive APIエラー: 自動リトライ3回（1秒間隔）、失敗後はRustログに記録して次のpolling intervalまで待つ
- fusen_from_iphone.jsonが存在しない: 静かにスキップ（エラーなし）

### Claude's Discretion
- 付箋ウィンドウの初期サイズ（内容に応じた適切な値）
- リトライ間の待機時間の詳細実装
- 赤ドットのCSSデザイン

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gdrive::get_access_token(&client)` — Drive接続チェック + 自動リフレッシュ済み
- `gdrive::download_json(&client, &token, filename)` — Drive JSONダウンロード
- `gdrive::upload_json(&client, &token, filename, &data)` — Drive JSON書き戻し（received_at用）
- `playCreateSound()` — 既存の新規作成音（page.tsx内）
- `fusen_create_note(folderPath, context)` — 新規付箋作成（Rustコマンド）
- `fusen_save_note(path, body, frontmatterRaw, allowRename)` — 本文書き込み（Rustコマンド）
- `openNoteWindow(path, meta?, isNew?)` — 付箋ウィンドウを開く（page.tsx内）
- `logger::log_info()` — Rustのログ出力
- `tauri::async_runtime::spawn` — Tauriのasyncタスク起動

### Established Patterns
- ポーリングパターン: `interval.tick().await` を先頭で1回呼んで初回即時tickをスキップ
- イベント通信: Rust `app.emit(event, payload)` → JS `listen(event, handler)`
- listen useEffect: `isMainWindow` guard + unlisten クリーンアップ（既存パターン通り）
- static AtomicBool: `LAST_VISIBILITY_MS` と同パターン（全隠し/全表示でも使用済み）

### Integration Points
- `lib.rs` の `run()` > `setup()` クロージャ末尾に `tauri::async_runtime::spawn` を追加
- `page.tsx` の isMainWindow guard付きuseEffect群の末尾に listen useEffect を追加
- 設定画面コンポーネント（要確認）の「Google接続」ボタン横に赤ドットを追加

</code_context>

<specifics>
## Specific Ideas

- 赤ドットはリアルタイムで自動消去（接続回復後の次回ポーリング成功時）
- PC再起動後の重複防止は received_at がDriveに残ることで保証（AppStateはリセットされるため）
- iPhoneで「タイトルなし・本文なし」で送信した場合も受信時刻でファイル名が付く

</specifics>

<deferred>
## Deferred Ideas

なし — 議論はPhase 7のスコープ内に収まった

</deferred>

---

*Phase: 07-pc-receive*
*Context gathered: 2026-03-30*
