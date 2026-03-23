# Phase 4: Hono API基盤 - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Vercel上でWeb Push通知パイプラインのAPIを完全稼働させる。
curl で全エンドポイント（subscribe / notes/push / notes/latest）を検証できる状態にする。
iPhone PWAやRust送信コマンドはPhase 5のスコープ。

</domain>

<decisions>
## Implementation Decisions

### Push通知方式（重要な修正）
- **APNsは使用しない。Web Push（VAPID）で統一。**
- iPhoneのPWA PushはiOS 16.4以降のSafari Web Pushのみ対応（ネイティブAPNsはPWA非対応）
- APNs関連コード・ライブラリ・証明書は一切実装しない
- `web-push` ライブラリでVAPID署名を行い、ブラウザのプッシュサービス経由で送信する

### APIエンドポイント保護
- 全エンドポイント（subscribe / notes/push / notes/latest）をBearer認証で保護
- ヘッダー形式: `Authorization: Bearer {API_SECRET}`
- `API_SECRET` はVercel環境変数で管理。PWA側・Rust側ともに同じトークンを使用

### Google OAuth認証フロー
- APIの `/api/v1/auth` エンドポイントで認証フローを実装
- 初回のみブラウザで Google認証 → refresh_token を取得
- 取得したrefresh_tokenをVercel環境変数に登録、以降は自動更新
- refresh_token失効時は503を返す（サイレント障害なし）

### Google Driveファイル配置
- フォルダ名: `ore-no-fusen`（マイドライブ直下に作成）
- 構成: フラット（サブフォルダなし）
  - `ore-no-fusen/fusen_push_config.json` — Push Subscription（endpoint + p256dh + auth）
  - `ore-no-fusen/fusen_note.json` — 最後に送信した付箋1件（上書き保存）

### fusen_note.jsonの保存形式
- 最新の1件のみ上書き保存（履歴は持たない）
- ユーザーが選択した付箋をそのまま1件保存する

### Vercel環境変数の管理
- 設定手順はPLAN.mdの「セットアップ手順」セクションに記載（開発者向け）
- 必要な変数:
  - `GOOGLE_CLIENT_ID` — Google Cloud ConsoleのOAuth 2.0クライアントID
  - `GOOGLE_CLIENT_SECRET` — 同シークレット
  - `GOOGLE_REFRESH_TOKEN` — 認証フロー実行後に取得・登録
  - `VAPID_PUBLIC_KEY` — `npx web-push generate-vapid-keys` で生成
  - `VAPID_PRIVATE_KEY` — 同上
  - `API_SECRET` — 任意の文字列（Bearer認証トークン）

### Claude's Discretion
- Hono のミドルウェア構成（認証チェックの実装方法）
- Google Drive APIのファイルUPDATE vs CREATE処理の詳細
- エラーレスポンスのJSON body形式
- `lib/gdrive.ts` と `lib/webpush.ts` のインターフェース設計

</decisions>

<specifics>
## Specific Ideas

- 正しいPush通知フロー:
  ```
  [PC付箋] → [Rustコマンド] → [API(Hono)] → [Web Push送信（VAPID）] → [iPhone Service Worker] → [Notification表示]
  ```
- Service Workerのpushハンドラ:
  ```javascript
  self.addEventListener('push', (event) => {
    const data = event.data.json();
    self.registration.showNotification(data.title, { body: data.body });
  });
  ```
- Subscribe時の保存データ: `{ "endpoint": "...", "p256dh": "...", "auth": "..." }`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/notes.ts`, `app/api/window.ts` — Tauri invoke wrappers（Hono routesとは別物、参照のみ）
- `.env.local` に `NEXT_PUBLIC_GOOGLE_CLIENT_ID_PC` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID_PWA` が既にある（同じGCPプロジェクトを使う）

### Established Patterns
- `next.config.mjs`: `output: process.env.IS_TAURI_BUILD === 'true' ? 'export' : undefined` — VercelではAPI Routes有効、TauriではStaticExportに切り替わる設計が既にある
- `next-pwa@5.6.0` は既存依存。Tauriビルドでは無効化、Vercelビルドでは有効
- `app/lib/` 内: `i18n.ts`, `settings-store.ts`, `utils.ts` — Hono lib は新規追加（`lib/gdrive.ts`, `lib/webpush.ts`）

### Integration Points
- 新規: `app/api/v1/[[...route]]/route.ts` に Hono エントリを作成（既存 `app/api/` は Tauri invoke wrappers なので衝突しない）
- nodejs runtime 宣言必須（googleapis は Node.js 依存、Edge Runtime 非対応）

</code_context>

<deferred>
## Deferred Ideas

- Android Chrome での Web Push 対応 — v3.0以降（REQUIREMENTS: MULTI-01）
- 複数デバイスへの同時送信 — v3.0以降（REQUIREMENTS: MULTI-02）
- 既存 `app/api/*.ts` の Hono 移植 — v3.0以降（REQUIREMENTS: INT-01）
- 付箋の送信履歴管理（複数件保存）— Phase 4スコープ外、将来検討

</deferred>

---

*Phase: 04-hono-api-kiban*
*Context gathered: 2026-03-23*
