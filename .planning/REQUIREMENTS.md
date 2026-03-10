# Requirements — 俺の付箋 品質改善

## v1 Requirements

### 安定性（Stability）

- [ ] **STAB-01**: Listener Leak が新たに発生していないこと（useEffect内のasync listen()の解除漏れ）
- [ ] **STAB-02**: Rustコード全体で `unwrap()` の残存がないこと
- [ ] **STAB-03**: Win32 API 呼び出し後に Tauri の内部状態が正しく同期されていること

### データ保護（Data Safety）

- [ ] **DATA-01**: 空body によるノートデータ上書きが発生しないこと
- [ ] **DATA-02**: ノートロード時の競合状態（race condition）がないこと（hasLoadedRef で制御）

### UI安定性（UI Stability）

- [ ] **UI-01**: 編集開始時のカーソル位置が正しいこと（新規作成・再編集の両方）
- [ ] **UI-02**: FloatingFormatBar の blur 除外が正しく機能し、フォーマット操作中に編集モードが解除されないこと

## v2 Requirements（次のマイルストーン以降）

- テストカバレッジの引き上げ（現在30%）
- StickyNote.tsx のリファクタリング
- 新機能（画像・タグ・リンク）

## Out of Scope

- 新機能追加 — 品質改善マイルストーンの対象外
- StickyNote.tsx のリファクタリング — リスク大、別マイルストーンで実施

## Traceability

| REQ-ID | Phase |
|--------|-------|
| STAB-01 | Phase 1: コードレビュー |
| STAB-02 | Phase 1: コードレビュー |
| STAB-03 | Phase 2: Win32/Tauri修正 |
| DATA-01 | Phase 1: コードレビュー |
| DATA-02 | Phase 1: コードレビュー |
| UI-01 | Phase 1: コードレビュー |
| UI-02 | Phase 2: UI修正 |
