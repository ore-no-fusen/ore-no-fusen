# Requirements: 俺の付箋 v2.0 iPhone連携

**Defined:** 2026-03-23
**Core Value:** すぐ書けて、そこに残る。PCの付箋を1秒でiPhoneに送れる。

## v1 Requirements（v2.0マイルストーン）

### Rust バックエンド（Phase 4）

- [x] **API-01**: `src-tauri/src/gdrive.rs` が実装され、Google OAuth2 PKCE フロー + access_token 自動更新が動作する
- [x] **API-02**: `gdrive.rs` が Google Drive REST API で JSON ファイルの上書きアップロード・ダウンロードを行う（`fusen_push_config.json` / `fusen_note.json`）
- [x] **API-03**: `gdrive.rs` が `fusen_push_config.json` をポーリングして AppState にキャッシュする
- [x] **API-04**: `src-tauri/src/webpush.rs` が VAPID 鍵ペア生成・JWT 署名（RFC 8292）を実装する
- [x] **API-05**: `webpush.rs` が AES-128-GCM ペイロード暗号化（RFC 8291）を実装する
- [x] **API-06**: `webpush.rs` が APNs HTTPS POST（`/3/device/{token}`）を実装する
- [x] **API-07**: Tauri コマンド `fusen_send_to_iphone` が Drive upload + APNs push をオーケストレーションする

### iPhone連携（Phase 5）

- [ ] **PWA-01**: `public/manifest.json` が作成され `display: standalone` が設定されている
- [ ] **PWA-02**: `public/sw.js` が push 受信・showNotification・notificationclick を実装し、next-pwa との上書き衝突を回避している
- [ ] **PWA-03**: `app/viewer/page.tsx` が初回セットアップガイド（Google OAuth PKCE + push subscription）と note 全文表示を提供する
- [ ] **SEND-01**: iPhone PWA が Google OAuth PKCE フローで `fusen_push_config.json` を自分の Google Drive に保存する
- [ ] **SEND-02**: 右クリックメニューに「iPhoneに送る」が追加され、`fusen_send_to_iphone` コマンドを呼び出す

## v2 Requirements（v3.0以降）

### 双方向編集

- **EDIT-01**: iPhoneから付箋を編集して保存する
- **EDIT-02**: PC側が Google Drive の変更を検知して取り込む
- **EDIT-03**: 競合検知（PC・iPhone 同時編集時）

### マルチデバイス

- **MULTI-01**: Android Chrome での Web Push 対応
- **MULTI-02**: 複数デバイスへの同時送信

## Out of Scope

| 機能 | 理由 |
|------|------|
| サーバーサイド API（Vercel API Routes） | Rust が直接 Google Drive + APNs を呼ぶためサーバー不要 |
| 複数ユーザー対応 | 各ユーザーが自分の Google Drive を使うシングルユーザー前提 |
| リアルタイム同期（WebSocket/SSE） | Google Drive ポーリングで代替 |
| ネイティブ iOS アプリ（Swift） | PWA で十分 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| API-01 | Phase 4 | Complete |
| API-02 | Phase 4 | Complete |
| API-03 | Phase 4 | Complete |
| API-04 | Phase 4 | Complete |
| API-05 | Phase 4 | Complete |
| API-06 | Phase 4 | Complete |
| API-07 | Phase 4 | Complete |
| PWA-01 | Phase 5 | Pending |
| PWA-02 | Phase 5 | Pending |
| PWA-03 | Phase 5 | Pending |
| SEND-01 | Phase 5 | Pending |
| SEND-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements updated: 2026-03-23 — corrected from Hono API to Rust direct implementation*
