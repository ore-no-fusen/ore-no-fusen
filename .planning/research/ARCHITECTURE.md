# Architecture Patterns — iPhone→PC付箋送信

**Project:** 俺の付箋 v2.1
**Domain:** Desktop sticky note app — adding reverse channel (iPhone → PC note creation)
**Researched:** 2026-03-29
**Confidence:** HIGH (primary sources: existing source code — gdrive.rs, lib.rs, viewer/page.tsx, state.rs)

---

## Recommended Architecture

```
[iPhone: Safari PWA /viewer]
  新しい step: 'write'
  │  テキスト入力 → 「PC に送る」ボタン
  │    → uploadToDrive(accessToken, 'fusen_from_iphone.json', { id, body, sent_at })
  │    → uploadToDrive(accessToken, 'fusen_iphone_notes.json', append entry)
  ▼
[Google Drive (BYOS)]
  fusen_from_iphone.json    ← "未受信の最新1件" として機能するキュー
                               { id: string, body: string, sent_at: string }
                               PC受信後は { id, body, sent_at, received_at } に更新 (confirmed)
  fusen_iphone_notes.json   ← iPhone側の履歴リスト
                               [ { id, body, sent_at }, ... ]  (最新50件上限)

[PC: Rust background polling task]
  setup() 内で tokio::spawn
  │  loop {
  │    interval.tick().await  (30秒間隔)
  │    download fusen_from_iphone.json
  │    if id != last_seen_id:
  │      emit "fusen:note_from_iphone" { body }
  │      last_seen_id = id
  │      upload fusen_from_iphone.json with received_at (重複防止マーク)
  │  }
  ▼
[PC: page.tsx listener]
  listen('fusen:note_from_iphone', async (event) => {
    invoke('fusen_create_note', { folderPath, context: 'from-iphone' })
    invoke('fusen_save_note', { path, body: event.payload.body })
    openNoteWindow(path)
  })
```

---

## Component Boundaries

### Existing — No Changes

| Component | Responsibility | Location |
|-----------|---------------|----------|
| AppState (Rust) | Single source of truth | `src-tauri/src/state.rs` |
| gdrive::upload_json | Drive への JSON 書き込み | `src-tauri/src/gdrive.rs` |
| gdrive::download_json | Drive からの JSON 読み込み | `src-tauri/src/gdrive.rs` |
| gdrive::get_access_token | OAuth refresh token → access token | `src-tauri/src/gdrive.rs` |
| lib.rs setup() | アプリ初期化・プラグイン登録 | `src-tauri/src/lib.rs` (末尾 `.setup()` ブロック) |
| page.tsx OrchestratorContent | Tauri イベントリスナー登録・ノート作成 | `app/page.tsx` |
| viewer/page.tsx | iPhone PWA ステップUI | `app/viewer/page.tsx` |
| fusen_create_note | ノートファイル生成 + AppState更新 | `src-tauri/src/lib.rs` |
| fusen_save_note | ノートボディ保存 | `src-tauri/src/lib.rs` |

### Modified — 最小変更のみ

| Component | 変更内容 | リスク |
|-----------|---------|--------|
| `app/viewer/page.tsx` | step 型に `'write'` と `'list'` を追加。`step === 'ready'` レンダー内にボタンを追加 | LOW — 既存ステップに影響しない |
| `src-tauri/src/lib.rs` | `setup()` ブロック末尾に `tokio::spawn(polling_loop(...))` を1ブロック追加 | LOW — 追記のみ |
| `app/page.tsx` | `listen('fusen:note_from_iphone', ...)` を既存の listen ブロック群に1件追加 | LOW — 既存リスナーと独立 |

### New — 新規ファイルなし、Drive上の新規ファイルのみ

| Drive ファイル | 役割 | 書き手 | 読み手 |
|---------------|------|--------|--------|
| `fusen_from_iphone.json` | PC向け1件キュー | iPhone PWA | Rust polling |
| `fusen_iphone_notes.json` | iPhone側履歴（最新50件） | iPhone PWA | iPhone PWA (`'list'` step) |

---

## Data Flow

### iPhone → Drive → PC (詳細フロー)

```
1. iPhone: step='ready' の画面で「メモを書く」ボタンをタップ
   → step を 'write' に変更

2. iPhone: step='write' でテキスト入力 → 「PCに送る」ボタン
   → uuid = crypto.randomUUID()
   → uploadToDrive(accessToken, 'fusen_from_iphone.json', {
       id: uuid,
       body: inputText,
       sent_at: new Date().toISOString()
     })
   → fusen_iphone_notes.json に { id, body, sent_at } を先頭追加（最新50件）
   → step を 'list' に変更（送信済み確認）

3. PC: Rust polling loop (30秒間隔)
   a. get_access_token(&client).await  // 期限切れなら自動リフレッシュ
      → エラー時: eprintln してスキップ（パニックしない）
   b. download_json(&client, &token, "fusen_from_iphone.json").await
      → ファイルなし（初回）: スキップ
      → エラー: eprintln してスキップ
   c. id = value["id"].as_str()
      last = LAST_IPHONE_NOTE_ID.lock().unwrap()
      if id == last { continue }  // 同一ノートなら無視（重複防止）
   d. *last = id.to_string()  // 記録更新
   e. app_handle.emit("fusen:note_from_iphone", { body: value["body"] })
   f. received_at を付けて upload_json("fusen_from_iphone.json", confirmed_value)
      // 上書きにより「受信済み」マークをつける

4. PC: page.tsx listener
   a. listen('fusen:note_from_iphone') が発火
   b. invoke('fusen_create_note', { folderPath, context: 'from-iphone' })
   c. invoke('fusen_save_note', { path: newNote.meta.path, body: payload.body })
   d. 既存の createNote フローと同じ: openNoteWindow(newNote.meta.path)
```

### viewer step machine (変更後)

```
既存:  banner → login → push → ready → note
追加:           ↑                ↓       ↓
               push          write → list
                               ↑       ↓
                               └───────┘ (戻るボタン)
```

- `'write'`: テキストエリア + 「PCに送る」ボタン + 「戻る」ボタン
- `'list'`: 直近の送信履歴（fusen_iphone_notes.json から読み込み）+ 「書く」ボタン
- `'ready'` から `'write'` への遷移: 「書く」ボタン追加
- `'note'` は既存のまま（PC→iPhone受信表示）

---

## Patterns to Follow

### Pattern 1: polling loop — Rust static Mutex で重複防止

`last_seen_id` を `std::sync::Mutex<String>` として `lib.rs` のモジュールレベルに置く。`tokio::Mutex` ではなく標準の `Mutex` を使う（非同期コンテキスト内でも `.lock().unwrap()` できるが、await 中にホールドしない）。

```rust
// src-tauri/src/lib.rs — モジュールレベルに追加
static LAST_IPHONE_NOTE_ID: std::sync::Mutex<String> =
    std::sync::Mutex::new(String::new());

async fn iphone_note_polling_loop(
    app: tauri::AppHandle,
    state: std::sync::Arc<std::sync::Mutex<AppState>>,
) {
    let client = reqwest::Client::new();
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
    loop {
        interval.tick().await;
        let token = match gdrive::get_access_token(&client).await {
            Ok(t) => t,
            Err(e) => { eprintln!("[iphone_poll] token error: {}", e); continue; }
        };
        let value = match gdrive::download_json(&client, &token, "fusen_from_iphone.json").await {
            Ok(v) => v,
            Err(_) => continue, // ファイル未作成 or ネットワーク障害 → スキップ
        };
        let id = match value["id"].as_str() {
            Some(s) => s.to_string(),
            None => continue,
        };
        {
            let mut last = LAST_IPHONE_NOTE_ID.lock().unwrap_or_else(|p| p.into_inner());
            if *last == id { continue; }
            *last = id.clone();
        }
        let body = value["body"].as_str().unwrap_or("").to_string();
        let _ = app.emit("fusen:note_from_iphone", serde_json::json!({ "body": body }));
        // received_at を付けて上書き（重複防止の念押し）
        let mut confirmed = value.clone();
        confirmed["received_at"] = serde_json::Value::String(
            chrono::Utc::now().to_rfc3339()
        );
        let _ = gdrive::upload_json(&client, &token, "fusen_from_iphone.json", &confirmed).await;
    }
}
```

setup() 末尾（`logger::log_info("アプリの初期化が完了しました")` の直前）に以下を追加:

```rust
let poll_app = app.handle().clone();
let poll_state = /* Arc<Mutex<AppState>> */ ;
tokio::spawn(async move {
    iphone_note_polling_loop(poll_app, poll_state).await;
});
```

**注意**: `setup()` は `&mut App` を受け取るためクロージャ内から `app.state()` で `State` が取れる。ただし `State<'_, Mutex<AppState>>` は `'_` ライフタイムのため `tokio::spawn` に渡せない。`app.handle().state::<Mutex<AppState>>()` で `Arc` 的に clone して渡す方が安全。または polling loop が state に触れる必要がなければ（本フローでは polling はイベント emit のみで state 変更は JS 側に任せるので）state 引数自体が不要。

### Pattern 2: iPhone PWA — uploadToDrive は既存関数をそのまま利用

`viewer/page.tsx` 内の `uploadToDrive(accessToken, fileName, data)` が既に実装済み。`fusen_from_iphone.json` と `fusen_iphone_notes.json` への書き込みも同関数を呼ぶだけ。新規実装ゼロ。

### Pattern 3: fusen_iphone_notes.json の履歴管理

上書き前に `downloadFromDrive` で既存配列を読み込み、先頭に追加して最新50件にトリム。Drive が存在しない場合は空配列から開始。

```typescript
// viewer/page.tsx — 「PCに送る」ボタンハンドラ内
const id = crypto.randomUUID();
const entry = { id, body: inputText, sent_at: new Date().toISOString() };

// 1. キューファイル更新
await uploadToDrive(accessToken!, 'fusen_from_iphone.json', entry);

// 2. 履歴ファイル更新（取得失敗は無視）
const existing: typeof entry[] = await downloadFromDrive(accessToken!, 'fusen_iphone_notes.json')
  .catch(() => []);
const updated = [entry, ...existing].slice(0, 50);
await uploadToDrive(accessToken!, 'fusen_iphone_notes.json', updated);
```

### Pattern 4: PC offline / ポーリング失敗時の挙動

polling loop は `continue` でスキップするだけ。再試行は次の 30 秒 tick に任せる。`fusen_from_iphone.json` は「最後の1件」として Drive に残り続けるため、PC が起動してさえいれば最終的に受信される。`received_at` の付与が完了しない場合（PC クラッシュ等）は次回起動後の最初の poll で再受信が発生し得るが、`LAST_IPHONE_NOTE_ID` はプロセスメモリのためリセットされている。これを許容するか、`received_at` の有無でフィルタするかは実装判断。**推奨: received_at フィルタを入れる（後述 PITFALLS 参照）**。

### Pattern 5: page.tsx への listener 追加

既存の `listen('fusen:create_note_from_tray', ...)` と同じパターンで追加。`isMainWindow` ガードを必ずつける。

```typescript
// app/page.tsx — 既存 listen ブロック群に追加
useEffect(() => {
  if (!isMainWindow) return;
  let unlisten: (() => void) | undefined;
  const promise = listen('fusen:note_from_iphone', async (event: any) => {
    const body: string = event.payload?.body ?? '';
    if (!body.trim()) return;
    const fp = folderPathRef.current || await invoke<string | null>('get_base_path');
    if (!fp) return;
    try {
      const newNote = await invoke<any>('fusen_create_note', {
        folderPath: fp,
        context: 'from-iphone',
      });
      await invoke('fusen_save_note', {
        path: newNote.meta.path,
        body,
        frontmatter: newNote.frontmatter,
      });
      // 既存の openNoteWindow を再利用
      openNoteWindow(newNote.meta.path);
    } catch (e) {
      console.error('[iphone_note] create failed:', e);
    }
  });
  promise.then((fn) => { unlisten = fn; });
  return () => { promise.then((fn) => fn()); };
}, [isMainWindow]);
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: fusen_from_iphone.json を「リスト」として使う

**何が起きるか:** Drive への読み書きコストが上がり、polling で配列全体を差分比較する必要が生じる。
**代わりに:** 「最新1件キュー」として使う。`id` フィールドで重複を検出。履歴は別ファイル `fusen_iphone_notes.json` に分離。

### Anti-Pattern 2: polling interval を短くしすぎる (< 15秒)

**何が起きるか:** Google Drive API は 1000 req/100s の quota。30秒間隔は 1日 2880 req ≒ quota の 0.3%。15秒以下にすると quota を浪費し、他の Drive 操作（push 送信等）に影響する。
**代わりに:** 30秒を基本とする。将来 WebSocket や Server-Sent Events への移行余地を設計上残す。

### Anti-Pattern 3: polling loop で AppState の Mutex をホールドしたまま await する

**何が起きるか:** Mutex を保持したまま `.await` するとデッドロックの温床になる（他の Tauri command が同じ Mutex を取得しようとすると詰まる）。
**代わりに:** polling loop は AppState に一切触れない。`emit` でフロントエンドに渡し、ノート作成は既存の `fusen_create_note` command 経由で行う（Mutex は command ハンドラ内で短時間取得・解放される）。

### Anti-Pattern 4: viewer/page.tsx の step に 'write' を追加する際、既存フローの useEffect 依存配列を変更する

**何が起きるか:** 初期化 useEffect が再実行され、OAuth コールバック処理等が二重に走る。
**代わりに:** `step` state の初期値は変更せず、'ready' step のレンダー内にボタンだけ追加する。step 遷移はボタンの `onClick` から `setStep('write')` を呼ぶだけ。useEffect の deps は変更しない。

### Anti-Pattern 5: fusen_save_note の frontmatter 引数を省略する

**何が起きるか:** `fusen_save_note` は frontmatter + body を合体して書き込む。frontmatter を渡さないと空になり、既存の付箋管理機能（タグ・色・日付）が壊れる。
**代わりに:** `fusen_create_note` の返り値 `newNote.frontmatter` をそのまま渡す。

---

## Integration Points (新規 vs 修正 — 明示)

### 修正が必要なファイル（2件）

| ファイル | 変更内容 | 変更箇所 | 行数目安 |
|---------|---------|---------|---------|
| `src-tauri/src/lib.rs` | `iphone_note_polling_loop` 非同期関数を追加 + `setup()` 末尾で `tokio::spawn` | `setup()` ブロックの `logger::log_info("アプリの初期化が完了しました")` 直前に1ブロック追加 | +40行 |
| `app/viewer/page.tsx` | step 型に `'write'` `'list'` 追加 + 'ready' step に「書く」ボタン追加 + 'write' step UI + 'list' step UI | step 型定義 1箇所 + JSX 内 3ブロック追加 | +60行 |

### 修正が必要なファイル（1件・軽微）

| ファイル | 変更内容 | 変更箇所 | 行数目安 |
|---------|---------|---------|---------|
| `app/page.tsx` | `listen('fusen:note_from_iphone', ...)` を追加 | 既存 listen ブロック群の末尾 | +25行 |

### 新規ファイル不要

Drive 上のファイル（`fusen_from_iphone.json`, `fusen_iphone_notes.json`）は実行時に自動生成される。既存の `uploadToDrive` / `upload_json` が対応済み。

---

## Build Order

```
Phase 1: Drive ← iPhone 書き込み（PCなしで検証可能）
  Step 1.1  viewer/page.tsx: step 型に 'write' 追加
  Step 1.2  viewer/page.tsx: 'ready' step に「書く」ボタン追加
  Step 1.3  viewer/page.tsx: 'write' step UI (テキスト入力 + 送信ボタン)
  Step 1.4  viewer/page.tsx: 送信ハンドラ — fusen_from_iphone.json と fusen_iphone_notes.json 書き込み
  Step 1.5  Verify: iPhone 実機で「書く」→ Drive に fusen_from_iphone.json が作成されることを確認

Phase 2: PC polling（Phase 1 完了後でないと検証できない）
  Step 2.1  lib.rs: LAST_IPHONE_NOTE_ID static Mutex を追加
  Step 2.2  lib.rs: iphone_note_polling_loop 関数を追加
  Step 2.3  lib.rs: setup() 末尾で tokio::spawn
  Step 2.4  page.tsx: listen('fusen:note_from_iphone', ...) を追加
  Step 2.5  Verify: iPhoneで送信 → 30秒以内にPCに付箋ウィンドウが開くことを確認

Phase 3: iPhone 履歴表示（Phase 1 完了後に追加可能）
  Step 3.1  viewer/page.tsx: 'list' step UI (fusen_iphone_notes.json からの履歴表示)
  Step 3.2  Verify: 送信後に 'list' step で履歴が表示されることを確認
```

**順序の根拠:**
- Phase 1 が先: Drive 書き込みが動作しないと polling の検証が不可能。
- Phase 2 が Phase 1 依存: ファイルが存在しないと `download_json` が毎回エラーを返すだけで動作確認できない。
- Phase 3 は Phase 1 と独立: 履歴表示は fusen_iphone_notes.json を読むだけで、PC との通信に依存しない。

---

## Scalability Considerations

シングルユーザー設計のため従来の scalability は不要。関連する運用上の制約:

| 関心事 | 現在のスコープ | 含意 |
|--------|--------------|------|
| Drive API quota | 1000 req/100s | 30秒 poll = 2880 req/day。push 送信と合わせても quota の < 1% |
| polling 中のトークン期限切れ | `get_access_token` が自動 refresh | 問題なし。refresh 失敗時は `continue` でスキップ |
| PC 未起動時のノート消失 | `fusen_from_iphone.json` はファイルが残る | 再起動後の最初の poll で受信。ただし `received_at` フィルタがないと再起動のたびに重複受信 |
| Drive ファイル競合 | iPhone が送信中に PC が上書き | 実用上問題なし（シングルユーザー。送信 → 受信のシーケンシャルな使い方） |

---

## Sources

- `src-tauri/src/gdrive.rs` — `upload_json`, `download_json`, `get_access_token` のシグネチャ（ソースコード）
- `src-tauri/src/lib.rs` — `setup()` ブロック構造、既存 `tokio::spawn` パターン、`LAST_VISIBILITY_MS` static Mutex パターン（ソースコード）
- `app/viewer/page.tsx` — 既存 step machine、`uploadToDrive` 実装（ソースコード）
- `app/page.tsx` — 既存 `listen` パターン、`fusen_create_note` / `fusen_save_note` 呼び出し例（ソースコード）
- `src-tauri/src/state.rs` — `AppState`, `Note`, `NoteMeta` 型定義（ソースコード）
- `.planning/PROJECT.md` — v2.0 完了状態の確認（プロジェクトドキュメント）
