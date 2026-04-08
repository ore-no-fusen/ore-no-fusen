# Requirements: 俺の付箋 v4.0

**Defined:** 2026-04-09
**Core Value:** すぐ書けて、そこに残る。それだけ確実に動く。

## v4.0 Requirements

### ロック画面コントロール

- [ ] **LOCK-01**: ユーザーは一覧の任意のメモをタップひとつでロック画面に通知として表示できる
- [ ] **LOCK-02**: ユーザーは一覧から、ロック画面に表示中のメモを消せる（通知が消える）
- [ ] **LOCK-03**: ロック画面に表示中のメモは一覧で視覚的に識別できる（アイコン強調など）
- [ ] **LOCK-04**: 複数のメモを同時にロック画面に表示できる（各メモが独立した通知として出る）
- [ ] **LOCK-05**: ロック画面表示状態はアプリを閉じても保持される（IndexedDB永続化）

### エディタ連携

- [ ] **EDIT-01**: エディタのヘッダーツールバーにもロック画面トグルボタンがある
- [ ] **EDIT-02**: エディタ上のボタンは現在のロック状態を反映して表示される（ON/OFF視覚化）

### 再起動時の復元

- [ ] **RESUME-01**: アプリ起動時にIndexedDBのロック中メモを読み取り、通知を自動で再表示できる

## v2 Requirements（将来）

### 拡張

- **EXT-01**: ロック画面通知に本文の先頭N文字を表示できる（リッチ通知）
- **EXT-02**: ロック画面通知をタップするとPWAが開いてそのメモにジャンプする

## Out of Scope

| Feature | Reason |
|---------|--------|
| APNsサーバープッシュによるロック表示 | iPhone側ローカル通知で十分。サーバー負荷・費用増を避ける |
| Android対応 | シングルユーザー・iPhone前提 |
| PCデスクトップからのロック操作 | iPhone側の機能として完結させる |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOCK-01 | Phase 13 | Pending |
| LOCK-02 | Phase 13 | Pending |
| LOCK-03 | Phase 13 | Pending |
| LOCK-04 | Phase 13 | Pending |
| LOCK-05 | Phase 13 | Pending |
| EDIT-01 | Phase 14 | Pending |
| EDIT-02 | Phase 14 | Pending |
| RESUME-01 | Phase 14 | Pending |

**Coverage:**
- v4.0 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after initial definition*
