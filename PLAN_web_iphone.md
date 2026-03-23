# iPhone連携 実装計画 v2（Hono統合版）

> 更新: 2026-03-23

---

## 目標

| 項目 | 内容 |
|------|------|
| 費用 | **¥0**（Vercel無料枠 + Google Drive + APNs すべて無料） |
| 初回 | セットアップ込み 15秒以内でロック画面に通知表示 |
| 2回目以降 | **1秒以内**でロック画面表示 |
| 将来 | iPhone・Android・PC どこからでも双方向書き込み |

---

## 全体アーキテクチャ

```
[PC Tauri]
  │  reqwest で POST するだけ（暗号処理なし）
  ▼
[Hono API (Vercel)]
  │  ① Google Drive に note JSON を保存
  │  ② VAPID署名 + AES暗号化
  │  ③ APNs に HTTPS POST
  ▼
[APNs (Apple Push Notification service)]
  ▼
[iPhone Safari PWA]
  通知タップ → /viewer で付箋内容を表示

[Google Drive]
  fusen_note.json        ← PC が送信するたびに上書き
  fusen_push_config.json ← iPhone PWA が初回セットアップ時に書き込む
```

### なぜHonoを使うか

| 比較 | Rustで全部やる（v1） | Honoに任せる（v2） |
|------|--------------------|--------------------|
| Rust追加クレート | 7個（p256, aes-gcm, hkdf…） | **1個**（reqwestのみ） |
| VAPID暗号化 | Rustで実装（複雑） | TypeScript `web-push` 1パッケージ |
| Rustコード量 | webpush.rs + gdrive.rs（数百行） | **lib.rs に10行** |
| 将来の拡張 | Rustを毎回触る | HonoにTSでエンドポイント追加 |

---

## フェーズ計画

### Phase 1 — Hono導入・Push基盤（土台）

**ゴール**: Hono を Next.js に追加し、Push通知に必要なエンドポイントを作る

**既存APIは触らない**（`app/api/*.ts` はそのまま残す）

#### 追加ファイル

```
app/api/v1/[[...route]]/route.ts   ← Hono エントリーポイント
app/api/v1/handlers/push.ts        ← Google Drive書込 + VAPID + APNs POST
app/api/v1/handlers/subscribe.ts   ← Push Subscription受付 + Drive保存
lib/gdrive.ts                      ← Google Drive API ラッパー
lib/webpush.ts                     ← VAPID署名・暗号化ラッパー
```

#### 追加パッケージ

```
hono
web-push          ← VAPID署名・AES暗号化をまとめて処理
googleapis        ← Google Drive API
```

#### APIエンドポイント（Phase 1で作るもの）

```
POST /api/v1/subscribe       iPhoneのPush Subscriptionを受け取りDriveに保存
POST /api/v1/notes/push      PCから付箋を受け取り Drive保存 + APNs通知送信
GET  /api/v1/notes/latest    最後に送信したnoteを返す（通知タップ後の閲覧用）
```

#### チェックリスト
- [ ] `hono` / `web-push` / `googleapis` インストール
- [ ] `app/api/v1/[[...route]]/route.ts` 作成
- [ ] Google Cloud Console でOAuthクライアントID作成
- [ ] `lib/gdrive.ts` — Drive API ラッパー実装
- [ ] `lib/webpush.ts` — VAPID鍵生成・web-push ラッパー実装
- [ ] `subscribe` ハンドラ実装
- [ ] `notes/push` ハンドラ実装（Drive書込 + APNs POST）
- [ ] `notes/latest` ハンドラ実装
- [ ] `.env.local` に必要な環境変数を追加
- [ ] Vercel に環境変数を設定

#### 環境変数

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...       ← 初回OAuth後に取得・手動で設定
GOOGLE_DRIVE_FOLDER_ID=...     ← ore-no-fusen フォルダのID
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...          ← 初回 web-push keygen で生成
VAPID_SUBJECT=mailto:xxx@gmail.com
```

---

### Phase 2 — iPhoneに送る（コア機能）

**ゴール**: 右クリック → 1秒でiPhoneのロック画面に通知表示

#### ユーザーフロー

**初回セットアップ（約15秒）**

```
1. iPhoneのSafariでVercelのURLを開く（3秒）
2. 「ホーム画面に追加」する（7秒）
   → Service Worker登録 + 通知許可プロンプト表示
3. 「通知を許可」タップ（2秒）
   → Push Subscription取得 → POST /api/v1/subscribe → Driveに保存
4. 完了画面表示「PCから送れます」
```

**2回目以降（1秒以内）**

```
右クリック → 「📱 iPhoneに送る」
  → invoke('fusen_send_to_iphone')
  → Rust が POST /api/v1/notes/push（note内容を送るだけ）
  → Hono が Drive保存 + VAPID署名 + APNs POST
  → iPhoneのロック画面に通知表示 ✅
```

#### 変更ファイル

```
src-tauri/src/lib.rs                    MODIFY  fusen_send_to_iphone コマンド追加
src-tauri/Cargo.toml                    MODIFY  reqwest クレート追加（これだけ）
app/hooks/useStickyNoteContextMenu.ts   MODIFY  ctx_send_to_iphone を enabled: true に
app/viewer/page.tsx                     NEW     PWA閲覧ページ（通知タップ後に開く）
public/sw.js                            NEW     Service Worker（Push受信 + showNotification）
public/manifest.json                    NEW     PWA設定
```

#### 重要な発見

`useStickyNoteContextMenu.ts` に既に `ctx_send_to_iphone` が **`enabled: false`** で実装済み。
`enabled: true` にして `action` を実装するだけ。

#### Rustコード（シンプル）

```rust
// Cargo.toml — 追加はこれだけ
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }

// lib.rs — 新コマンド
#[tauri::command]
async fn fusen_send_to_iphone(path: String) -> Result<(), String> {
    let note = storage::read_note(&path).map_err(|e| e.to_string())?;
    let payload = serde_json::json!({
        "title": note.body.lines().next().unwrap_or("付箋"),
        "body":  &note.body,
        "tags":  &note.tags,
    });
    reqwest::Client::new()
        .post("https://ore-no-fusen.vercel.app/api/v1/notes/push")
        .json(&payload)
        .send().await
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

#### チェックリスト
- [ ] Rust `reqwest` クレート追加
- [ ] `fusen_send_to_iphone` コマンド実装
- [ ] `ctx_send_to_iphone` を `enabled: true` に変更 + action実装
- [ ] `public/sw.js` 実装（push受信 + showNotification + notificationclick）
- [ ] `public/manifest.json` 作成（アイコン・テーマ色）
- [ ] `app/viewer/page.tsx` 実装（初回ガイド + note表示）
- [ ] 手動検証（下記チェックリスト参照）

---

### Phase 3 — 体験向上・双方向編集（将来）

**ゴール**: iPhoneからも付箋を書いたり編集できる

- [ ] `PUT /api/v1/notes/:id` — iPhone からの編集保存
- [ ] `POST /api/v1/notes` — iPhone からの新規作成
- [ ] モバイル向けエディタUI
- [ ] PC側がDriveの変更を検知して取り込む
- [ ] Android対応（Web Push は Android Chrome でも動く）
- [ ] 既存 `app/api/*.ts` を Hono に統合（このタイミングで）

---

## データ構造

### fusen_push_config.json（iPhoneが書き込む）
```json
{
  "endpoint": "https://api.push.apple.com/3/device/XXXX",
  "keys": {
    "p256dh": "BNcRd...(base64url, 65bytes)",
    "auth":   "tBy8s...(base64url, 16bytes)"
  },
  "created_at": "2026-03-03T06:00:00Z"
}
```

### fusen_note.json（PCが書き込む）
```json
{
  "title":   "今日のタスク",
  "body":    "# 今日のタスク\n- [ ] 資料作成\n- [x] メール返信",
  "tags":    ["仕事", "重要"],
  "sent_at": "2026-03-23T09:00:00+09:00"
}
```

### Push通知ペイロード（暗号化前）
```json
{
  "title": "俺の付箋",
  "body":  "今日のタスク",
  "icon":  "/icons/128x128.png",
  "data":  { "url": "/viewer" }
}
```

---

## 検証チェックリスト（Phase 2完了条件）

| # | 手順 | 期待結果 |
|---|------|---------|
| 1 | `npm test` 実行 | 既存テスト全パス |
| 2 | iPhone SafariでVercel URLを開く | 4ステップガイドが表示 |
| 3 | ホーム画面に追加 → 通知許可 | Drive に push_config.json が作成される |
| 4 | 付箋を右クリック → 「iPhoneに送る」 | **15秒以内**にロック画面に通知表示 |
| 5 | 2回目以降に送る | **1秒以内**にロック画面に通知表示 |
| 6 | 通知をタップ | /viewer が開き付箋内容が表示 |
| 7 | 未設定状態で送る | 「iPhoneが未接続」メッセージ表示 |

---

## 開始手順（Phase 1 から始める場合）

```bash
# 1. パッケージ追加
npm install hono web-push googleapis

# 2. VAPID鍵ペア生成（1回だけ）
npx web-push generate-vapid-keys
# → VAPID_PUBLIC_KEY と VAPID_PRIVATE_KEY をメモして .env.local に設定

# 3. Google Drive の認証設定
# Google Cloud Console で OAuth2 クライアントを作成
# → GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を .env.local に設定
```
