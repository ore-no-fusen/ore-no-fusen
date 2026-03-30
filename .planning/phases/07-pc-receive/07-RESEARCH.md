# Phase 7: PC受信 - Research

**Researched:** 2026-03-30
**Domain:** Rust tokio polling + Google Drive JSON + Tauri event emit + Windows toast notification
**Confidence:** HIGH（全項目を既存コードから直接確認）

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**ポーリング基盤**
- Rust `tokio::spawn` + `tokio::time::interval(30秒)` — `setup()` 内で起動
- Drive通信: Rust `app.emit("fusen:note_from_iphone")` → JS `listen`
- polling loop は AppState Mutex に触れない（emit のみ）
- `Cargo.toml`: tokio features に `"time"` 追加

**重複防止**
- `LAST_IPHONE_NOTE_ID: std::sync::Mutex<Option<String>>` — static変数（プロセスメモリ）
- `received_at` を Drive に書き戻す（PC再起動後も有効）
- 判定順: received_at あり → スキップ → id 一致 → スキップ → 新着

**受信通知・フィードバック**
- 音: 既存の `playCreateSound()` を使用（新規作成音と同じ）
- ウィンドウ前面: `setFocus()` で前面に出す
- Windowsトースト通知: 出す。文言「iPhoneから付箋」固定
- 前面に出せない場合（最小化中など）: トーストだけ出て、ウィンドウは静かに開く

**付箋のコンテキスト名**
優先度順:
1. `title` フィールド（iPhone入力欄の内容）
2. title が空 → 本文の1行目（最大10文字）
3. 本文も空 → 受信時刻（例: `'14:32'`）

**ウィンドウの開き方**
- 位置: 画面右上（Windows画面右上コーナー近く）
- サイズ: Claude裁量（内容量に応じた適切なサイズ、画像・Mermaid含む可能性を考慮）
- 編集モード: しない — 表示モードで開く（クリックで編集できる通常状態、isNew=false）

**Drive未接続時の挙動**
- gdrive_token.jsonなし: 設定画面の「Google接続」項目の横に赤ドット表示（接続成功後の次回ポーリング成功で自動消去）
- トークン期限切れ / Drive APIエラー: 自動リトライ3回（1秒間隔）、失敗後はRustログに記録して次のpolling intervalまで待つ
- fusen_from_iphone.jsonが存在しない: 静かにスキップ（エラーなし）

### Claude's Discretion
- 付箋ウィンドウの初期サイズ（内容に応じた適切な値）
- リトライ間の待機時間の詳細実装
- 赤ドットのCSSデザイン

### Deferred Ideas (OUT OF SCOPE)
なし — 議論はPhase 7のスコープ内に収まった
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| POLL-01 | PCがDriveを30秒間隔でポーリングして新着iPhoneノートを検出できる | tokio `"time"` feature追加 + `interval(30s)` + `download_json` パターン確認済み |
| POLL-02 | 新着ノートをPC側で自動的に新規付箋ウィンドウとして開ける | `app.emit` → JS `listen` + `openNoteWindow` シグネチャ確認済み |
| POLL-03 | 重複受信防止（received_atマーク＋last_seen_idによるスキップ） | static Mutex パターン（LAST_VISIBILITY_MS参照）+ `upload_json` 書き戻し確認済み |
</phase_requirements>

---

## Summary

Phase 7の実装に必要な情報はすべて既存コードから確認できた。新規ライブラリ・クレートの追加は最小限で、tokio `"time"` featureとtauri-plugin-notificationのみ追加が必要。

既存の `gdrive.rs` の `get_access_token` / `download_json` / `upload_json` 関数がそのまま使用できる。`setup()` クロージャには既にspawnパターンが存在する（`tokio::spawn` は fusen_send_to_iphone内で使用済み）。static変数パターンは `LAST_VISIBILITY_MS: AtomicU64` で確立済みで、Mutex版も同じ方法で実装できる。

**Primary recommendation:** lib.rsの `setup()` 末尾にpolling loopを `tauri::async_runtime::spawn` で追加し、ノート受信後は `app.emit("fusen:note_from_iphone", payload)` でpage.tsxのlistenに委ねる。

---

## 1. Cargo.toml tokio features — 調査結果

### 現在の状態

```toml
# 現在（Cargo.toml line 47）
tokio = { version = "1", features = ["rt"] }
```

**`"time"` feature は含まれていない。**

`tokio::time::interval` を使うには `"time"` の追加が必要。

### 必要な変更

```toml
tokio = { version = "1", features = ["rt", "time"] }
```

**confidence: HIGH** — Cargo.tomlを直接確認。

### chrono クレート

```toml
# 既存（Cargo.toml line 36）
chrono = { version = "0.4", features = ["serde"] }
```

chrono はすでに `serde` feature付きで存在する。`chrono::Utc::now()` と `chrono::Local::now()` は追加なしで使用可能。

---

## 2. tauri-plugin-notification — 調査結果

### 現状

`Cargo.toml` にも `tauri.conf.json` にも `tauri-plugin-notification` は含まれていない。新規追加が必要。

### 追加手順

**Cargo.toml**:
```toml
tauri-plugin-notification = "2"
```

**lib.rs の run() 内 `.setup()` クロージャ内**:
```rust
app.handle().plugin(tauri_plugin_notification::init())?;
```

**capabilities/default.json**:
```json
"notification:default"
```

### Rust側の使い方（Windowsトースト通知）

```rust
use tauri_plugin_notification::NotificationExt;

// app: &tauri::AppHandle
app.notification()
    .builder()
    .title("iPhoneから付箋")
    .body(&context_name)  // 付箋のタイトル
    .show()
    .ok();  // 通知失敗は無視
```

**重要**: Windows では通知に `identifier`（bundle ID）が必要。`tauri.conf.json` の `"identifier": "com.ore-no-fusen.app"` が自動使用される。

**confidence: MEDIUM** — Tauri v2公式ドキュメントの既知パターン。実機確認前。

### JS側（今回は使わない）

JS側の `sendNotification` は使わない。Rust側で完結させる（polling loopがRustにあるため）。

---

## 3. 既存のspawnパターン — 調査結果

`setup()` 内での `tauri::async_runtime::spawn` の使用は **現時点では setup() 内に存在しない**。

ただし `fusen_send_to_iphone` コマンド内（行 1296, 1321, 1336）で `tokio::spawn` が使われている。

```rust
// lib.rs 行 1296 — バックグラウンドアップロードの既存パターン
tokio::spawn(async move {
    if let Err(e) = gdrive::upload_json(&bg_client_v, &bg_token_v, "vapid_keys.json", &value).await {
        eprintln!("[vapid] Drive upload error: {}", e);
    }
});
```

### setup() 内の正しい書き方

Tauri の `setup()` クロージャは同期（`fn(app: &mut App) -> Result<(), Box<dyn Error>>`）なので、async ランタイム上で spawn するには `tauri::async_runtime::spawn` を使う。

```rust
// setup() クロージャ末尾、Ok(()) の直前に追加
let app_handle = app.handle().clone();
tauri::async_runtime::spawn(async move {
    let client = reqwest::Client::new();
    let mut interval = tokio::time::interval(
        tokio::time::Duration::from_secs(30)
    );
    interval.tick().await; // 初回即時tickをスキップ（起動直後の空打ち防止）
    loop {
        interval.tick().await;
        poll_iphone_note(&client, &app_handle).await;
    }
});
```

**重要**: `app.handle().clone()` で AppHandle をクローンして spawn に渡す。AppHandle は Send + Clone なので安全。

**confidence: HIGH** — Tauri v2 の確立済みパターン。CONTEXT.mdでも同じパターンが指定されている。

---

## 4. openNoteWindow の現在のシグネチャ — 調査結果

```typescript
// app/page.tsx 行 361
const openNoteWindow = useCallback(async (
  path: string,
  meta?: { x?: number, y?: number, width?: number, height?: number, always_on_top?: boolean },
  isNew?: boolean
) => { ... }, [...]);
```

### 呼び出し例（既存コード）

```typescript
// 位置・サイズ指定あり（復元時）
await openNoteWindow(note.path, { x: note.x, y: note.y, width: note.width, height: note.height });

// 位置・サイズ指定なし（フォールバック）
await openNoteWindow(newNote.meta.path, undefined, true);

// isNew=false（表示モード）
await openNoteWindow(note.path, { x: 1600, y: 50, width: 400, height: 350 });
```

### Phase 7での呼び出し方

```typescript
// iPhoneノート受信時（表示モード・右上配置）
await openNoteWindow(note.meta.path, {
  x: screenWidth - 430,  // 画面幅 - ウィンドウ幅 - マージン
  y: 50,
  width: 400,
  height: 350,           // Claude裁量：内容量に応じた適切な値
}, false);  // isNew=false → 表示モード（編集開始しない）
```

**画面サイズの取得方法**（JS側）:
```typescript
const screenWidth = window.screen.width;
const screenHeight = window.screen.height;
```

**confidence: HIGH** — page.tsx を直接確認。

---

## 5. 設定画面の「Google接続」UI — 調査結果

### ファイルパス

```
components/ui/settings-page.tsx
```

`app/components/` ではなく **`components/ui/`** にある点に注意。

### ナビゲーション構造

サイドバー（行 127-132）:
```tsx
<SidebarItem
    icon={<Smartphone className="mr-3 h-4 w-4" />}
    label="iPhone連携"
    isActive={activeSection === "iphone"}
    onClick={() => setActiveSection("iphone")}
/>
```

`case "iphone": return <IphoneSection t={t} />` でレンダリング。

### IphoneSection の「Googleドライブ接続」部分

```tsx
// components/ui/settings-page.tsx 行 935-965
<div className="rounded-lg border p-6 space-y-4">
    <h3 className="font-semibold text-gray-800">Googleドライブ接続</h3>
    <p className="text-sm text-gray-500">...</p>

    {status === 'connected' && (
        <div className="flex items-center gap-3">
            <span className="text-green-600 font-semibold">✅ 接続済み</span>
            <Button ...>再接続</Button>
        </div>
    )}

    {status === 'disconnected' && (
        <Button onClick={handleConnect} disabled={isConnecting}>
            <Smartphone className="mr-2 h-4 w-4" />Googleドライブに接続
        </Button>
    )}
</div>
```

### 赤ドット追加箇所

サイドバーの `"iPhone連携"` ラベルの横（行 129）に追加する。または `IphoneSection` の `<h3>Googleドライブ接続</h3>` の横に追加する。

**推奨**: サイドバーのSidebarItemを拡張して赤ドットを表示する（ユーザーが設定画面を開く前に気づける）。

**赤ドットのCSS（Claude裁量）**:
```tsx
<span className="ml-auto h-2 w-2 rounded-full bg-red-500" />
```

**重複防止の赤ドット消去**: polling成功後に `app.emit("fusen:drive_connected")` → JS側でstateをリセット。

**confidence: HIGH** — settings-page.tsx を直接確認。

---

## 6. gdrive モジュールの関数シグネチャ — 調査結果

### get_access_token

```rust
// gdrive.rs 行 176
pub async fn get_access_token(client: &Client) -> Result<String, String>
```

- 戻り値: `Result<String, String>` — access_token文字列
- トークン期限切れ時は自動リフレッシュ
- `gdrive_token.json` が存在しない場合: `Err("Googleアカウントが接続されていません...")`
- これが Drive未接続の検出点 → この Err を捕まえて赤ドット emit

### download_json

```rust
// gdrive.rs 行 365
pub async fn download_json(
    client: &Client,
    access_token: &str,
    filename: &str,
) -> Result<serde_json::Value, String>
```

- 戻り値: `Result<serde_json::Value, String>`
- Drive全体から `name='filename'` で検索（フォルダ指定なし）
- ファイル未存在時: `Err("File not found: fusen_from_iphone.json")` — エラーメッセージに "File not found" が含まれる

**静かにスキップする判定**:
```rust
match download_json(&client, &token, "fusen_from_iphone.json").await {
    Err(e) if e.contains("File not found") => return, // 静かにスキップ
    Err(e) => { eprintln!("[poll] Drive download error: {}", e); return; }
    Ok(data) => { /* 処理 */ }
}
```

### upload_json

```rust
// gdrive.rs 行 294
pub async fn upload_json(
    client: &Client,
    access_token: &str,
    filename: &str,
    data: &serde_json::Value,  // &serde_json::Value
) -> Result<(), String>
```

- data は `&serde_json::Value` — `serde_json::json!({})` マクロで作成する
- 既存ファイルがあれば PATCH（更新）、なければ POST（新規作成）

### received_at 書き戻しパターン

```rust
// fusen_from_iphone.json に received_at を追加して書き戻す
let mut updated = data.clone();
updated["received_at"] = serde_json::json!(chrono::Utc::now().to_rfc3339());
gdrive::upload_json(&client, &token, "fusen_from_iphone.json", &updated).await?;
```

**confidence: HIGH** — gdrive.rs を直接確認。

---

## 7. fusen_from_iphone.json の想定フォーマット — 調査結果

Phase 6 (iPhone送信UI) で決定済みのフォーマットを STATE.md・CONTEXT.md から確認。

```json
{
  "id": "uuid-v4-string",
  "title": "ユーザー入力タイトル（空もある）",
  "body": "本文テキスト（Markdown形式、base64画像含む可能性）",
  "sent_at": "2026-03-30T12:34:56Z",
  "received_at": null
}
```

- `received_at` が null または存在しない → 未受信（新着）
- `received_at` が文字列 → 受信済み（スキップ）
- `id` が `LAST_IPHONE_NOTE_ID` と一致 → スキップ（プロセスメモリ）

---

## Architecture Patterns

### Polling Loop パターン（lib.rs）

```rust
// setup() クロージャ末尾（Ok(()) の直前）
let app_handle = app.handle().clone();
tauri::async_runtime::spawn(async move {
    let client = reqwest::Client::new();
    let mut interval = tokio::time::interval(
        std::time::Duration::from_secs(30)
    );
    interval.tick().await; // 起動直後の即時tickをスキップ
    loop {
        interval.tick().await;
        poll_iphone_note(&client, &app_handle).await;
    }
});
```

### static 重複防止変数パターン

```rust
// LAST_VISIBILITY_MS と同じパターン
static LAST_IPHONE_NOTE_ID: std::sync::Mutex<Option<String>> =
    std::sync::Mutex::new(None);
```

使用方法:
```rust
// チェック
let last_id = LAST_IPHONE_NOTE_ID.lock()
    .unwrap_or_else(|p| p.into_inner())
    .clone();
if last_id.as_deref() == Some(note_id) { return; }

// 更新
*LAST_IPHONE_NOTE_ID.lock().unwrap_or_else(|p| p.into_inner()) = Some(note_id.to_string());
```

### emit → listen パターン（既存コードと同じ）

**Rust側**:
```rust
#[derive(Clone, serde::Serialize)]
struct IphoneNotePayload {
    path: String,
    context: String,
}

app_handle.emit("fusen:note_from_iphone", IphoneNotePayload {
    path: note_path,
    context: context_name,
}).ok();
```

**JS側 (page.tsx)**:
```typescript
// isMainWindow guard付きuseEffect（既存パターン通り）
useEffect(() => {
  if (!isMainWindow) return;
  let unlisten: (() => void) | undefined;
  const promise = listen<{ path: string; context: string }>(
    'fusen:note_from_iphone',
    async (event) => {
      const { path, context } = event.payload;
      // 画面右上に表示モードで開く
      const sw = window.screen.width;
      await openNoteWindow(path, { x: sw - 430, y: 50, width: 400, height: 350 }, false);
      playCreateSound();
    }
  );
  promise.then((u) => { unlisten = u; });
  return () => {
    if (unlisten) unlisten();
    else promise.then((u) => u());
  };
}, [isMainWindow, openNoteWindow]);
```

### コンテキスト名の決定ロジック（Rust）

```rust
fn build_context(title: &str, body: &str) -> String {
    if !title.is_empty() {
        return title.to_string();
    }
    let first_line = body.lines().next().unwrap_or("").trim();
    if !first_line.is_empty() {
        let chars: String = first_line.chars().take(10).collect();
        return chars;
    }
    chrono::Local::now().format("%H:%M").to_string()
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drive JSON ダウンロード | 独自reqwest実装 | `gdrive::download_json` | 既に実装済み・テスト済み |
| Drive JSON アップロード | 独自マルチパート実装 | `gdrive::upload_json` | multipart PATCH/POST対応済み |
| アクセストークン管理 | 独自リフレッシュ実装 | `gdrive::get_access_token` | 自動リフレッシュ・ファイル永続化済み |
| 付箋ウィンドウ作成 | 独自WebviewWindow実装 | `openNoteWindow` (page.tsx) | pool window対応・label衝突防止済み |
| 新規作成音 | 独自サウンド実装 | `playCreateSound()` | 既存関数 |
| Windowsトースト通知 | Win32 WinRT直接呼び出し | `tauri-plugin-notification` | クロスプラットフォーム対応 |

---

## Common Pitfalls

### Pitfall 1: polling loop が AppState Mutex を掴む

**何が起きるか**: polling loopがMutexをlockしたまま await すると、他のコマンドが deadlock する
**防止策**: CONTEXT.md決定通り「polling loop は AppState Mutex に触れない（emit のみ）」を厳守
**実装指針**: ノート作成（fusen_create_note, fusen_save_note）はすべて emit → JS側 invoke に委ねる

### Pitfall 2: tokio::time::interval の初回即時tick

**何が起きるか**: `interval.tick().await` を最初に呼ぶと、生成直後に1回すぐ tick する（起動直後にDriveポーリングが走る）
**防止策**: 先頭で `interval.tick().await` を1回空打ちしてから loop に入る（CONTEXT.mdに記載済み）

```rust
interval.tick().await; // 起動直後の即時tickを捨てる
loop {
    interval.tick().await; // ここから30秒毎
    poll_iphone_note(&client, &app_handle).await;
}
```

### Pitfall 3: download_json の "File not found" を error として扱う

**何が起きるか**: fusen_from_iphone.json が存在しない（正常状態）でもErr返却される
**防止策**: エラーメッセージに "File not found" が含まれるか確認してスキップ

### Pitfall 4: setup() クロージャ内では tauri::async_runtime::spawn を使う

**何が起きるか**: `tokio::spawn` は tokio runtime が起動前だと panic する可能性
**防止策**: `tauri::async_runtime::spawn` を使う（Tauri が管理する runtime 上で spawn）

### Pitfall 5: Rust static Mutex の初期化（const_new 未使用）

**何が起きるか**: `std::sync::Mutex::new(None)` は const context では使えない場合がある
**防止策**: `static` 初期値に `std::sync::Mutex::new(None)` は Rust 1.63+ でconst可能。念のため `OnceLock` で包む方法も有効

```rust
// 安全な書き方
static LAST_IPHONE_NOTE_ID: std::sync::OnceLock<std::sync::Mutex<Option<String>>> =
    std::sync::OnceLock::new();
fn last_id() -> &'static std::sync::Mutex<Option<String>> {
    LAST_IPHONE_NOTE_ID.get_or_init(|| std::sync::Mutex::new(None))
}
```

ただし CONTEXT.mdのシンプルな `static Mutex<Option<String>>` も Rust 1.77（このプロジェクトのrust-version）ではconst初期化可能。

### Pitfall 6: tauri-plugin-notification の capabilities 追加忘れ

**何が起きるか**: 通知APIを呼んでも何も起きない（エラーなし）
**防止策**: `capabilities/default.json` に `"notification:default"` を追加する

---

## Code Examples

### poll_iphone_note 関数の骨格

```rust
// lib.rs に追加する関数
async fn poll_iphone_note(client: &reqwest::Client, app: &tauri::AppHandle) {
    // 1. access_token 取得（失敗 = Drive未接続）
    let token = match gdrive::get_access_token(client).await {
        Ok(t) => {
            // 接続回復を通知（赤ドット消去）
            let _ = app.emit("fusen:drive_connected", ());
            t
        },
        Err(_) => {
            // 赤ドット表示
            let _ = app.emit("fusen:drive_disconnected", ());
            return;
        }
    };

    // 2. fusen_from_iphone.json をダウンロード
    let data = match gdrive::download_json(client, &token, "fusen_from_iphone.json").await {
        Err(e) if e.contains("File not found") => return, // 静かにスキップ
        Err(e) => { logger::log_info(&format!("[poll] {}", e)); return; }
        Ok(d) => d,
    };

    // 3. received_at チェック（PC再起動後も有効）
    if data.get("received_at").and_then(|v| v.as_str()).is_some() {
        return;
    }

    // 4. id チェック（プロセスメモリ）
    let note_id = data.get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    {
        let last = LAST_IPHONE_NOTE_ID.lock().unwrap_or_else(|p| p.into_inner());
        if last.as_deref() == Some(&note_id) { return; }
    }

    // 5. 新着 → LAST_IPHONE_NOTE_ID 更新
    *LAST_IPHONE_NOTE_ID.lock().unwrap_or_else(|p| p.into_inner()) = Some(note_id);

    // 6. コンテキスト名決定
    let title = data.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let body = data.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let context = build_context(title, body);

    // 7. received_at を Drive に書き戻す
    let mut updated = data.clone();
    updated["received_at"] = serde_json::json!(chrono::Utc::now().to_rfc3339());
    let client2 = client.clone();
    let token2 = token.clone();
    tauri::async_runtime::spawn(async move {
        let _ = gdrive::upload_json(&client2, &token2, "fusen_from_iphone.json", &updated).await;
    });

    // 8. Windows トースト通知
    #[cfg(desktop)]
    {
        use tauri_plugin_notification::NotificationExt;
        let _ = app.notification()
            .builder()
            .title("iPhoneから付箋")
            .body(&context)
            .show();
    }

    // 9. JS にemit（JS側でfusen_create_note → openNoteWindow を実行）
    #[derive(Clone, serde::Serialize)]
    struct IphoneNotePayload {
        title: String,
        body: String,
        context: String,
    }
    let _ = app.emit("fusen:note_from_iphone", IphoneNotePayload {
        title: title.to_string(),
        body: body.to_string(),
        context,
    });
}
```

### リトライパターン（3回・1秒間隔）

```rust
async fn poll_with_retry(client: &reqwest::Client, app: &tauri::AppHandle) {
    for attempt in 0..3 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
        match try_poll(client, app).await {
            Ok(()) => return,
            Err(e) if attempt == 2 => {
                logger::log_info(&format!("[poll] 3回失敗: {}", e));
            }
            Err(_) => continue,
        }
    }
}
```

---

## 実装ファイルと変更箇所まとめ

| ファイル | 変更内容 | 変更種別 |
|---------|---------|---------|
| `src-tauri/Cargo.toml` | tokio features に `"time"` 追加, `tauri-plugin-notification = "2"` 追加 | 修正・追加 |
| `src-tauri/src/lib.rs` | `static LAST_IPHONE_NOTE_ID`, `build_context()`, `poll_iphone_note()`, setup()末尾にspawn追加, invoke_handler に新コマンドなし | 追加 |
| `src-tauri/capabilities/default.json` | `"notification:default"` 追加 | 修正 |
| `app/page.tsx` | `fusen:note_from_iphone` listen useEffect 追加, `fusen:drive_disconnected/connected` listen useEffect 追加 | 追加 |
| `components/ui/settings-page.tsx` | `IphoneSection` 内 `IphoneSection` コンポーネントに赤ドット表示状態追加 | 修正 |

---

## Open Questions

1. **fusen_from_iphone.json のidフィールド**
   - Phase 6の実装を確認していない（Phase 6のコードはphase 6実装後に確定）
   - 想定: iPhoneがuuid v4をjsonに含める
   - 対処: idが存在しない場合は `sent_at` をidの代替として使う

2. **openNoteWindow への path 渡し方**
   - JS側でfusen_create_noteを呼んでからopenNoteWindowする必要がある
   - payloadに body を含めてJS側でinvokeするか、Rust側でfusen_create_note相当を呼ぶか
   - 推奨: CONTEXT.mdの方針通り「ノート作成はJS側」— payload に title/body を含め、JS listen内でinvoke('fusen_create_note')してからopenNoteWindow

3. **画面サイズ（右上配置）**
   - `window.screen.width` はメインモニターのみ取得可能
   - マルチモニター環境では意図した位置と異なる可能性
   - 許容範囲: シングルモニター前提のシンプル実装でよい

---

## Validation Architecture

> nyquist_validationの設定を確認していないため、標準として含める。

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest / Vitest（フロントエンド）, `cargo test`（Rust） |
| Config file | vitest.config.ts or jest.config.ts |
| Quick run command | `npm test` |
| Full suite command | `npm test && cargo test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLL-01 | 30秒間隔でDriveポーリング | unit | `cargo test poll` | Wave 0 |
| POLL-02 | 新着ノートを付箋ウィンドウとして開く | manual-only | — | manual |
| POLL-03 | received_at + id による重複防止 | unit | `cargo test duplicate` | Wave 0 |

POLL-02はTauriウィンドウ生成を伴うため自動テスト困難 → 実機確認。

---

## Sources

### Primary (HIGH confidence)
- `src-tauri/Cargo.toml` — tokio features, chrono, 既存依存関係すべて確認
- `src-tauri/src/lib.rs` — setup()クロージャ構造, spawn既存パターン, static変数パターン
- `src-tauri/src/gdrive.rs` — get_access_token, download_json, upload_json シグネチャ確認
- `app/page.tsx` — openNoteWindow シグネチャ, isMainWindow guard, listen useEffect パターン確認
- `components/ui/settings-page.tsx` — IphoneSection, 「Googleドライブ接続」UI構造確認
- `src-tauri/tauri.conf.json` — identifier, notificationプラグイン未設定を確認
- `src-tauri/capabilities/default.json` — 現在の権限設定確認

### Secondary (MEDIUM confidence)
- Tauri v2 plugin-notification 公式パターン（`.notification().builder().title().body().show()`）
- `tauri::async_runtime::spawn` のsetup()内使用パターン（Tauri v2標準）

### Tertiary (LOW confidence)
- なし

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — Cargo.tomlを直接確認。tokio "time"のみ追加必要。
- Architecture: HIGH — 既存spawn/emit/listenパターンを直接確認。
- Pitfalls: HIGH — 既存コードのパターンから演繹。poll loop deadlockはCONTEXT.mdで既に対処済み。
- Notification: MEDIUM — tauri-plugin-notification は未インストールで実機未確認。

**Research date:** 2026-03-30
**Valid until:** 2026-04-30（tokio/tauri-plugin-notification APIは安定）
