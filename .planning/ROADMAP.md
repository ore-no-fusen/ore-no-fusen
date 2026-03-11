# Roadmap — 俺の付箋 品質改善

**3 phases** | **7 requirements** | 全v1要件カバー ✓

## Phase 1: コードレビュー

**Goal**: 潜在バグ・不安定要素を横断的に洗い出して文書化する

**Requirements**: STAB-01, STAB-02, DATA-01, DATA-02, UI-01

**Plans:** 3/3 plans executed

Plans:
- [x] 01-01-PLAN.md — Rust コード静的レビュー（unwrap残存・Win32同期・保存フロー）
- [x] 01-02-PLAN.md — フロントエンド静的レビュー（Listenerリーク・データ保護・競合状態・カーソル位置）
- [x] 01-03-PLAN.md — FINDINGS.md 作成（全発見事項の統合文書化・人間レビュー）

**Success Criteria**:
1. 全 useEffect 内の async listen() が正しく解除されていることを確認
2. Rust コード全体で `unwrap()` の残存をリストアップ
3. 空body上書きリスクのある箇所をすべて特定
4. 競合状態（race condition）の可能性箇所を特定
5. 発見事項が `.planning/research/FINDINGS.md` に文書化されている

---

## Phase 2: バグ修正

**Goal**: Phase 1 で発見した問題を最小変更で修正する

**Requirements**: STAB-03, UI-02、および Phase 1 で発見された問題

**Plans:** 2/2 plans complete

Plans:
- [ ] 02-01-PLAN.md — Rust unwrap() 修正（tray.rs 2箇所・logic.rs 1箇所）
- [ ] 02-02-PLAN.md — STAB-03 / UI-02 実装確認と REQUIREMENTS.md 更新

**Success Criteria**:
1. 各修正が最小変更であること（無関係なコードを変更しない）
2. Win32 API 呼び出し後の Tauri 状態同期が正しく行われている
3. FloatingFormatBar の blur 除外が正しく機能している
4. 修正ごとに個別コミットが作られている

---

## Phase 3: 確認・検証

**Goal**: すべての修正に対して回帰テストと動作確認を行う

**Requirements**: 全 REQ（STAB-01〜03, DATA-01〜02, UI-01〜02）

**Success Criteria**:
1. `npx playwright test` が全13件パス
2. `npm run test` (vitest) がパス
3. Tauri ビルドが通ること
4. 手動テストで新たな回帰が発見されないこと
