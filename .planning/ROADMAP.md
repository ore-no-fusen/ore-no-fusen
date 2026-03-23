# Roadmap — 俺の付箋

## Milestones

- [x] **v1.0 品質改善** - Phases 1-3 (complete)
- [ ] **v2.0 iPhone連携** - Phases 4-5 (in progress)

## Phases

<details>
<summary>v1.0 品質改善 (Phases 1-3) — COMPLETE</summary>

### Phase 1: コードレビュー
**Goal**: 潜在バグ・不安定要素を横断的に洗い出して文書化する
**Requirements**: STAB-01, STAB-02, DATA-01, DATA-02, UI-01
**Success Criteria** (what must be TRUE):
  1. 全 useEffect 内の async listen() が正しく解除されていることを確認
  2. Rust コード全体で `unwrap()` の残存をリストアップ
  3. 空body上書きリスクのある箇所をすべて特定
  4. 競合状態（race condition）の可能性箇所を特定
  5. 発見事項が `.planning/research/FINDINGS.md` に文書化されている
**Plans**: 3/3 plans executed

Plans:
- [x] 01-01-PLAN.md — Rust コード静的レビュー（unwrap残存・Win32同期・保存フロー）
- [x] 01-02-PLAN.md — フロントエンド静的レビュー（Listenerリーク・データ保護・競合状態・カーソル位置）
- [x] 01-03-PLAN.md — FINDINGS.md 作成（全発見事項の統合文書化・人間レビュー）

---

### Phase 2: バグ修正
**Goal**: Phase 1 で発見した問題を最小変更で修正する
**Requirements**: STAB-03, UI-02
**Success Criteria** (what must be TRUE):
  1. 各修正が最小変更であること（無関係なコードを変更しない）
  2. Win32 API 呼び出し後の Tauri 状態同期が正しく行われている
  3. FloatingFormatBar の blur 除外が正しく機能している
  4. 修正ごとに個別コミットが作られている
**Plans**: 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — Rust unwrap() 修正（tray.rs 2箇所・logic.rs 1箇所）
- [x] 02-02-PLAN.md — STAB-03 / UI-02 実装確認と REQUIREMENTS.md 更新

---

### Phase 3: 確認・検証
**Goal**: すべての修正に対して回帰テストと動作確認を行う
**Requirements**: STAB-01〜03, DATA-01〜02, UI-01〜02
**Success Criteria** (what must be TRUE):
  1. `npx playwright test` が全13件パス
  2. `npm run test` (vitest) がパス
  3. Tauri ビルドが通ること
  4. 手動テストで新たな回帰が発見されないこと
**Plans**: 2/2 plans executed

Plans:
- [x] 03-01-PLAN.md — 自動テスト実行（vitest 全件 + Playwright E2E 13件）
- [x] 03-02-PLAN.md — Tauri ビルド確認 + 手動テスト（STAB-02/03 動作確認）

</details>

---

### v2.0 iPhone連携

**Milestone Goal:** PCの付箋を右クリック一発でiPhoneのロック画面に送れるようにする

#### Phase 4: Rust バックエンド（Google Drive + APNs）
**Goal**: Rust (Tauri) から Google Drive への読み書きと APNs Push 通知送信が完全稼働し、`fusen_send_to_iphone` コマンドで付箋を iPhone に送信できる
**Depends on**: Phase 3
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, API-07
**Success Criteria** (what must be TRUE):
  1. `fusen_check_pro_setup` が Google Drive から `fusen_push_config.json` を読み込んで AppState にキャッシュできる
  2. `fusen_send_to_iphone` が note JSON を Google Drive にアップロードできる
  3. `fusen_send_to_iphone` が APNs に Push を送信できる（push_config が有効な場合）
  4. Google OAuth PKCE フローで取得したトークンがローカルに保存・再利用される
**Plans**: 5 plans

Plans:
- [ ] 04-01-PLAN.md — Cargo.toml 新規クレート追加 + state.rs ProConfig 定義
- [ ] 04-02-PLAN.md — gdrive.rs 実装（OAuth PKCE + Drive R/W + poll_push_config）
- [ ] 04-03-PLAN.md — webpush.rs 実装（VAPID + AES-128-GCM + APNs POST）
- [ ] 04-04-PLAN.md — lib.rs に fusen_send_to_iphone / fusen_check_pro_setup / fusen_oauth_connect 追加
- [ ] 04-05-PLAN.md — 自動テスト + Tauri ビルド確認 + 手動検証チェックポイント

---

#### Phase 5: iPhone PWA + Rust送信
**Goal**: 右クリック「iPhoneに送る」でロック画面に通知が届き、タップで付箋全文が読める完全なE2Eフローが動く
**Depends on**: Phase 4
**Requirements**: PWA-01, PWA-02, PWA-03, SEND-01, SEND-02
**Success Criteria** (what must be TRUE):
  1. iPhone Safari で `/viewer` にアクセスすると「ホーム画面に追加」の案内が表示される
  2. PWA インストール後に通知許可ダイアログが表示され、購読が完了して Google Drive に保存される
  3. PC 側の付箋を右クリック「iPhoneに送る」を押すとiPhoneのロック画面に通知が届く
  4. 通知をタップすると PWA が開き付箋の全文が読める
**Plans**: 4 plans

Plans:
- [ ] 05-01-PLAN.md — PWA基盤（manifest.json + worker/index.js + RegisterPWA.tsx Tauri/Safari分岐）
- [ ] 05-02-PLAN.md — viewer ページ（app/viewer/page.tsx）— ホーム画面追加ガイド + OAuth PKCE + Push購読 + 全文表示
- [ ] 05-03-PLAN.md — 右クリックメニュー有効化（ctx_send_to_iphone enabled: true + invoke）
- [ ] 05-04-PLAN.md — 自動テスト確認 + 実機E2E検証チェックポイント

---

## Phase Details

### Phase 4: Rust バックエンド（Google Drive + APNs）
**Goal**: Rust (Tauri) から Google Drive への読み書きと APNs Push 通知送信が完全稼働し、`fusen_send_to_iphone` コマンドで付箋を iPhone に送信できる
**Depends on**: Phase 3
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, API-07
**Success Criteria** (what must be TRUE):
  1. `fusen_check_pro_setup` が Google Drive から `fusen_push_config.json` を読み込んで AppState にキャッシュできる
  2. `fusen_send_to_iphone` が note JSON を Google Drive にアップロードできる
  3. `fusen_send_to_iphone` が APNs に Push を送信できる（push_config が有効な場合）
  4. Google OAuth PKCE フローで取得したトークンがローカルに保存・再利用される
**Plans**: 5 plans

Plans:
- [ ] 04-01-PLAN.md — Cargo.toml 新規クレート追加 + state.rs ProConfig 定義
- [ ] 04-02-PLAN.md — gdrive.rs 実装（OAuth PKCE + Drive R/W + poll_push_config）
- [ ] 04-03-PLAN.md — webpush.rs 実装（VAPID + AES-128-GCM + APNs POST）
- [ ] 04-04-PLAN.md — lib.rs に fusen_send_to_iphone / fusen_check_pro_setup / fusen_oauth_connect 追加
- [ ] 04-05-PLAN.md — 自動テスト + Tauri ビルド確認 + 手動検証チェックポイント

### Phase 5: iPhone PWA + Rust送信
**Goal**: 右クリック「iPhoneに送る」でロック画面に通知が届き、タップで付箋全文が読める完全なE2Eフローが動く
**Depends on**: Phase 4
**Requirements**: PWA-01, PWA-02, PWA-03, SEND-01, SEND-02
**Success Criteria** (what must be TRUE):
  1. iPhone Safari で `/viewer` にアクセスすると「ホーム画面に追加」の案内が表示される
  2. PWA インストール後に通知許可ダイアログが表示され、購読が完了して Google Drive に保存される
  3. PC 側の付箋を右クリック「iPhoneに送る」を押すとiPhoneのロック画面に通知が届く
  4. 通知をタップすると PWA が開き付箋の全文が読める
**Plans**: 4 plans

Plans:
- [ ] 05-01-PLAN.md — PWA基盤（manifest.json + worker/index.js + RegisterPWA.tsx Tauri/Safari分岐）
- [ ] 05-02-PLAN.md — viewer ページ（app/viewer/page.tsx）— ホーム画面追加ガイド + OAuth PKCE + Push購読 + 全文表示
- [ ] 05-03-PLAN.md — 右クリックメニュー有効化（ctx_send_to_iphone enabled: true + invoke）
- [ ] 05-04-PLAN.md — 自動テスト確認 + 実機E2E検証チェックポイント

---

## Progress

**Execution Order:** 4 → 5

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. コードレビュー | v1.0 | 3/3 | Complete | 2026-03-23 |
| 2. バグ修正 | v1.0 | 2/2 | Complete | 2026-03-23 |
| 3. 確認・検証 | v1.0 | 2/2 | Complete | 2026-03-23 |
| 4. Hono API基盤 | 5/5 | Complete   | 2026-03-23 | - |
| 5. iPhone PWA + Rust送信 | 3/5 | In Progress|  | - |
