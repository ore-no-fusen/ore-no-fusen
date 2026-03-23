# Phase 5: iPhone PWA + Rust送信 - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

iPhone Safari で /viewer にアクセスし、PWAをホーム画面に追加し、Google OAuth + Push購読をセットアップして、PCから右クリック「iPhoneに送る」でロック画面に通知を届ける E2E フローの完成。
iPhoneからの編集・双方向同期は対象外（v3.0以降）。

</domain>

<decisions>
## Implementation Decisions

### manifest.json
- `start_url` を `"/"` から `"/viewer"` に変更（ホーム画面追加後はviewerが開く）
- `description` を更新：「PCの付箋をiPhoneで受け取るセットアップ」相当の内容に
- `name` / `short_name` は「俺の付箋」「付箋」のままでよい

### Viewer ページ（/viewer）UX
- シンプル1ページレイアウト（ウィザードなし）
- ページ先頭に短い説明文：「PCの付箋をiPhoneで受け取るセットアップ」
- ステップ1: 「Googleでログイン」ボタン → Google OAuth PKCE → push_config を Drive に保存
- ステップ2: 「通知を許可する」ボタン → Push購読 → 購読情報を Drive の fusen_push_config.json に上書き保存
- 完了後: 待機画面「PCから付箋が送られたらここに表示されます」
- 通知をタップして開いた場合: fusen_note.json を Drive から読み込み全文表示

### ホーム画面追加ガイド
- `window.matchMedia('(display-mode: standalone)')` で PWA インストール済み判定
- **未インストール時のみ**ページ上部にバナーを表示
- バナー形式: アイコン付きテキスト手順
  - ① Safari の共有アイコン（↑）をタップ
  - ② 「ホーム画面に追加」を選択
- インストール済み（standaloneモード）ではバナー非表示

### 右クリックメニュー
- 既存 `ctx_send_to_iphone`（`enabled: false`）を有効化
- `action` に `invoke('fusen_send_to_iphone', { path: selectedFile.path })` を追加

### Claude's Discretion
- Service Worker 管理: Tauri環境（`__TAURI_INTERNALS__` 検出）では引き続きSW登録解除、Safari環境ではPush対応カスタムSWを登録
- カスタム sw.js への push / notificationclick イベントハンドラ追加方法（workbox sw.js との上書き衝突を回避する実装方法）
- Google OAuth PKCE フローの具体的な実装（PKCE コードチャレンジ生成、コールバック処理）
- Viewer ページのスタイリング詳細

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public/manifest.json`: 既存あり、`display: standalone` 設定済み。start_url と description を更新するだけ
- `public/sw.js`: next-pwa Workbox生成済み（minified）。Push処理なし。カスタムの push/notificationclick を追加する必要あり
- `app/RegisterPWA.tsx`: 現在は全SW登録解除。Tauri環境検出を追加して分岐させる
- `app/hooks/useStickyNoteContextMenu.ts` の `ctx_send_to_iphone`（line 338）: `enabled: false` + 空action。`enabled: true` + invoke 呼び出しに変更するだけ

### Established Patterns
- Google OAuth PKCE + Drive R/W は Phase 4 の `gdrive.rs` で実装済み（Rust側）
- `invoke('fusen_send_to_iphone', ...)` コマンドは Phase 4 で実装済み
- Tauri環境検出: `typeof window.__TAURI_INTERNALS__ !== 'undefined'`

### Integration Points
- `/app/viewer/` — 新規作成（App Router page.tsx）
- `public/sw.js` — push/notificationclick イベントを追加（カスタムSW戦略）
- `public/manifest.json` — start_url + description 更新
- `app/RegisterPWA.tsx` — Tauri/Safari 分岐追加
- `app/hooks/useStickyNoteContextMenu.ts` — ctx_send_to_iphone 有効化

</code_context>

<specifics>
## Specific Ideas

- 既存 `manifest.json` の `icon-192.png` / `icon-512.png` はそのまま流用可能
- `fusen_push_config.json` の形式は Phase 4 で確定済み（endpoint + keys.p256dh + keys.auth）
- 通知タップ後に viewer を開く: notificationclick で `clients.openWindow('/viewer')` + note データを通知に含める

</specifics>

<deferred>
## Deferred Ideas

- Android Chrome 対応 — v3.0
- iPhoneからの編集・双方向同期 — v3.0
- 複数デバイスへの同時送信 — v3.0

</deferred>

---

*Phase: 05-iphone-pwa-rust-soshin*
*Context gathered: 2026-03-23*
