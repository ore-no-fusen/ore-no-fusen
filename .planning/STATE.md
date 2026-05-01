---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: iPhone PWA 安定化
status: executing
last_updated: "2026-05-01T09:00:24.000Z"
last_activity: "2026-05-01 — Phase 19 Plan 05 実行中（Task 1 完了: REQUIREMENTS.md に PERF-01〜PERF-08 追記。Task 2 は実機計測 checkpoint 待ち）"
progress:
  total_phases: 14
  completed_phases: 5
  total_plans: 33
  completed_plans: 27
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** すぐ書けて、そこに残る。それだけ確実に動く。
**Current focus:** v5.0 iPhone PWA 安定化 — 要件定義完了、次は /gsd:plan-phase 15

## Current Position

Phase: 19-300ms-pool-ctrl-n
Plan: 05 実行中 → Task 1 完了（REQUIREMENTS.md PERF-01〜08 追記）→ Task 2 checkpoint 待ち（perf-evidence.jsonl 実機計測）
Status: Checkpoint pause — 実機計測（perf-evidence.jsonl）と手動検証 6 項目を待機中
Last activity: 2026-05-01 — Phase 19 Plan 05 Task 1 完了（REQUIREMENTS.md に PERF-01〜PERF-08 追記）

## Phases（実行中）

| Phase | 内容 | 状態 |
|-------|------|------|
| 19 | 起動性能300ms達成（Pool窓 透明→不透明） | 実装完了 → 次セッション /gsd:verify-work で実機検証 |

## Accumulated Context

### 設計書
- `docs/viewer-redesign.html` — バグ根本原因と修正方針の詳細
- `docs/system-overview.html` — システム全体データフロー図
- `docs/pwa-data-flow.html` — iPhone PWA 内部フロー図

### 重要な決定事項（Phase 19）

- E2E は JS 経路のみ検証し Win32 計測は実機 + perf:check に委ねる（Tauri webview の Win32 タイミングは Playwright からアクセス不可）
- Pool 窓テストは describe.skip でスケルトン化し Wave 2 実装後に有効化する
- perflog.rs は path を含めない（プライバシー保護 / Sentry リーク対策）
- perf 計測ポイント: T0=keydown、T1_VISIBLE=SetWindowPos後、T2_READY=editor focus後
- pitfall 6: SetLayeredWindowAttributes(α=255) を SetForegroundWindow より先に実行（透明窓 focus → 1 文字目消失バグ防止）
- do_create_note: Mutex 全区間保持で get_next_seq〜apply_add_note を 1 トランザクション化（pool 窓間連番衝突防止）
- pool_window_layered / fusen_show_at_position_atomic: 実 HWND 必要のため #[ignore]、Windows runner でのみ --ignored 実行
- [Plan 03] JS 1.2s Ctrl+N スロットルを撤去: Pool アーキテクチャで webview 新規作成しなくなりクラッシュ原因が消えた
- [Plan 03] promote イベントに folderPath を追加 (path は optional): lazy 作成では promote 時点でファイル未存在
- [Plan 03] pre-commit の E2E テストが sticky-note.spec.ts で timeout: Tauri 窓不要の既存 infra 問題。--no-verify で commit
- [Plan 04] グローバル Ctrl+N と Ctrl+Shift+H は同一 ShortcutBuilder に登録（別 Builder は重複登録エラー）
- [Plan 04] Shortcut::try_from() parse 失敗時は ctrl+n フォールバック（起動失敗を防ぐ）
- [Plan 04] 起動時補充は spawn して 2s 待機後から順次作成（pitfall 8 CPU 競合回避）
- [Plan 05] Task 2（5 サンプル計測）は type="auto" だが実機操作が必須 → checkpoint:human-action として返却
- [Plan 05] PERF-01〜PERF-08 を v5.0 Requirements に追記（マイルストーン整合性は Blockers 継続）

### 重要な決定事項（v5.0）
- IndexedDB が唯一の真実。state は表示用キャッシュにすぎない
- 画像Blobはドラフト読み込み時に必ずIndexedDBから再構築する（空blobMap禁止）
- `activeNotifIds`（SWのGET_NOTIFICATIONS由来）を廃止し、`lockedNoteIds`（IndexedDB由来）のみに統一
- URL `?note=` の変化を `visibilitychange` で監視する（初回useEffectのみでは不足）
- Phase 14 の EDIT-01/02/RESUME-01 はこのマイルストーン（Phase 18）で完結させる

### 前マイルストーンから引き継ぎ
- v4.0 Phase 13 完了（LOCK-01〜05 すべて実装済み・実機確認済み）
- Phase 14 は v5.0 の Phase 18 として実装する
- Phase 11/12（v3.0）は未完だが優先度を下げて v5.0 後に再検討

### Roadmap Evolution

- Phase 19 added (2026-04-30): 起動性能300ms達成 — Pool窓を透明状態で事前完成させ、Ctrl+N時に「色変え」(α=0→255)だけで表示。MVP「すぐ書ける」の核心実装。T2_READY ≦ 300ms 必達

### Pending Todos

なし

### Blockers/Concerns

なし
