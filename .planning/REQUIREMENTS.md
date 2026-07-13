# Requirements: 俺の付箋 v5.0

**Defined:** 2026-04-10
**Core Value:** すぐ書けて、そこに残る。それだけ確実に動く。

## v5.0 Requirements

### バグ修正 (FIX)

- [ ] **FIX-01**: 一覧と編集を行き来しても、添付画像が消えずに正しく表示され続ける
- [ ] **FIX-02**: ロック画面の通知をタップすると、必ずそのメモの内容が開く（別のメモが開かない）
- [ ] **FIX-03**: 一覧のベルアイコンが実際のロック状態と完全に一致する（ズレが起きない）

### コード整理 (CLEAN)

- [ ] **CLEAN-01**: 死んだコード（`noteData` state・`step='note'`・未使用関数）が削除されている
- [ ] **CLEAN-02**: 型定義・DB操作・Drive操作が `lib/` に分離され、`page.tsx` から参照できる

### 構造分割 (ARCH)

- [ ] **ARCH-01**: `WriteScreen` コンポーネントが独立し、編集画面の責務だけを持つ
- [ ] **ARCH-02**: `ListScreen` コンポーネントが独立し、一覧画面の責務だけを持つ
- [ ] **ARCH-03**: セットアップ画面（banner/login/push）が独立コンポーネントになる
- [ ] **ARCH-04**: 認証・下書き・ロックの状態管理が `hooks/` に分離される

### ロック画面機能完成 (LOCK)

- [ ] **LOCK-06**: エディタ画面にも🔔ボタンがあり、ロック画面への表示をトグルできる
- [ ] **LOCK-07**: エディタの🔔ボタンが現在のロック状態（ON/OFF）を正確に表示する
- [ ] **LOCK-08**: アプリ起動時に、ロック中メモの通知がロック画面に自動で再表示される

## 前マイルストーンから継続（v4.0 完了済み）

- [x] **LOCK-01**: 一覧の任意のメモをタップひとつでロック画面に通知として表示できる
- [x] **LOCK-02**: 一覧から、ロック画面に表示中のメモを消せる（通知が消える）
- [x] **LOCK-03**: ロック画面に表示中のメモは一覧で視覚的に識別できる
- [x] **LOCK-04**: 複数のメモを同時にロック画面に表示できる
- [x] **LOCK-05**: ロック画面表示状態はアプリを閉じても保持される（IndexedDB永続化）

### 起動性能 (PERF) — Phase 19

- [ ] **PERF-01**: Ctrl+N 押下から 1 文字目入力可能（T2_READY）まで 5 回中央値で 300ms 以内
- [ ] **PERF-02**: 1.5 秒間に 3 回 Ctrl+N で 3 付箋全部 300ms 以内、4 回目はフォールバック + トースト
- [ ] **PERF-03**: 既存 17 付箋同時起動下でも PERF-01 達成
- [ ] **PERF-04**: 1 文字も入力されないまま閉じた場合、.md ファイルがフォルダに残らない
- [ ] **PERF-05**: Pool 窓は WS_EX_LAYERED + α=0 状態で事前完全準備（描画完了・CodeMirror マウント済）
- [ ] **PERF-06**: Ctrl+N 時は Win32 レベルで α=0→255 と SetWindowPos 位置移動のみ（webview 新規作成しない）
- [ ] **PERF-07**: グローバル Ctrl+N で他アプリ focus 時も付箋作成可能
- [ ] **PERF-08**: settings.json でショートカットをカスタマイズ可能

### 起動時データ保護・復旧 (SAFE) — Phase 20

- [ ] **SAFE-01**: 設定または保存先の読み込みに失敗した状態を初回起動として扱わず、初期付箋の作成・自動保存・設定上書きを停止する
- [ ] **SAFE-02**: `settings.json` と直前世代が両方壊れた場合は初回起動と誤認せず、壊れた設定を退避して安全な既定保存先と正常設定を再作成し、黄色い案内付箋で異常を伝えた後も通常利用を継続できる

## Out of Scope

| Feature | Reason |
|---------|--------|
| Workbox / オフライン対応 | バグ修正が先。オフラインは次マイルストーン |
| PC側のDrive書き込み削除 | Rust変更が必要。影響大。今回はiPhone側のみ |
| 新機能追加 | 今回は「壊れているものを直す」のみ |
| Android対応 | シングルユーザー・iPhone前提のため不要 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLEAN-01 | Phase 15 | Pending |
| CLEAN-02 | Phase 15 | Pending |
| FIX-01 | Phase 16 | Pending |
| FIX-02 | Phase 16 | Pending |
| FIX-03 | Phase 16 | Pending |
| ARCH-01 | Phase 17 | Pending |
| ARCH-02 | Phase 17 | Pending |
| ARCH-03 | Phase 17 | Pending |
| ARCH-04 | Phase 17 | Pending |
| LOCK-06 | Phase 18 | Pending |
| LOCK-07 | Phase 18 | Pending |
| LOCK-08 | Phase 18 | Pending |
| PERF-01 | Phase 19 | Pending |
| PERF-02 | Phase 19 | Pending |
| PERF-03 | Phase 19 | Pending |
| PERF-04 | Phase 19 | Pending |
| PERF-05 | Phase 19 | Pending |
| PERF-06 | Phase 19 | Pending |
| PERF-07 | Phase 19 | Pending |
| PERF-08 | Phase 19 | Pending |
| SAFE-01 | Phase 20 | Pending |
| SAFE-02 | Phase 20 | Pending |

**Coverage:**
- requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-07-11 after startup data-loss prevention requirements were added*
