# Requirements: 俺の付箋 v2.0 iPhone連携

**Defined:** 2026-03-23
**Core Value:** すぐ書けて、そこに残る。PCの付箋を1秒でiPhoneに送れる。

## v1 Requirements（v2.0マイルストーン）

### API基盤

- [x] **API-01**: Hono ルーターが `app/api/v1/[[...route]]/route.ts` に設置され `nodejs` runtime が宣言されている
- [x] **API-02**: Google Drive OAuth2 認証が動作する（OAuth2Client + refresh_token 管理 + 失効時 503 レスポンス）
- [x] **API-03**: Google Drive の JSON 読み書きが動作する（`fusen_push_config.json` / `fusen_note.json`）
- [x] **API-04**: VAPID 鍵ペアが生成・設定される（`lib/webpush.ts`、`sub` クレームに `mailto:` を設定）
- [ ] **API-05**: `POST /api/v1/subscribe` が Push Subscription（endpoint + p256dh + auth）を Google Drive に保存する
- [ ] **API-06**: `POST /api/v1/notes/push` が Google Drive への書込と APNs Push 送信を行う
- [ ] **API-07**: `GET /api/v1/notes/latest` が最後に送信した note JSON を返す

### iPhone連携

- [ ] **PWA-01**: `public/manifest.json` が作成され `display: standalone` が設定されている
- [ ] **PWA-02**: `public/sw.js` が push 受信・showNotification・notificationclick を実装し、next-pwa との上書き衝突を回避している
- [ ] **PWA-03**: `app/viewer/page.tsx` がホーム画面追加ガイドと note 全文表示を提供する
- [ ] **SEND-01**: `fusen_send_to_iphone` Rust コマンドが実装される（Cargo.toml に reqwest 追加、lib.rs にコマンド追加）
- [ ] **SEND-02**: 右クリックメニューの `ctx_send_to_iphone` が `enabled: true` になり、アクションが実装される

## v2 Requirements（v3.0以降）

### 双方向編集

- **EDIT-01**: iPhoneから付箋を編集して保存する
- **EDIT-02**: PC側が Google Drive の変更を検知して取り込む
- **EDIT-03**: 競合検知（PC・iPhone 同時編集時）

### マルチデバイス

- **MULTI-01**: Android Chrome での Web Push 対応
- **MULTI-02**: 複数デバイスへの同時送信

### API統合

- **INT-01**: 既存 `app/api/*.ts` を Hono に統合

## Out of Scope

| 機能 | 理由 |
|------|------|
| 複数ユーザー対応 | シングルユーザー前提。認証設計が大きく変わるため別マイルストーン |
| リアルタイム同期（WebSocket/SSE） | Google Drive ポーリングで代替。要件が固まってから検討 |
| ネイティブ iOS アプリ（Swift） | PWA で十分。コスト不釣り合い |
| Edge Runtime での動作 | googleapis は Node.js 依存。変更コストに見合わない |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| API-01 | Phase 4 | Complete |
| API-02 | Phase 4 | Complete |
| API-03 | Phase 4 | Complete |
| API-04 | Phase 4 | Complete |
| API-05 | Phase 4 | Pending |
| API-06 | Phase 4 | Pending |
| API-07 | Phase 4 | Pending |
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
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 — traceability confirmed after roadmap creation*
