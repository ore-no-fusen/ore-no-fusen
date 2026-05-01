---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: iPhone PWA 安定化
status: Defining requirements → ロードマップ作成待ち
last_updated: "2026-05-01T02:16:13.444Z"
last_activity: 2026-05-01 — Phase 19 Plan 01 完了（Wave 0 テスト土台: perflog.rs + perf-check.mjs + E2E/Vitest スケルトン）
progress:
  total_phases: 14
  completed_phases: 5
  total_plans: 33
  completed_plans: 24
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** すぐ書けて、そこに残る。それだけ確実に動く。
**Current focus:** v5.0 iPhone PWA 安定化 — 要件定義完了、次は /gsd:plan-phase 15

## Current Position

Phase: 19-300ms-pool-ctrl-n
Plan: 01 完了 → 次: 02 (Wave 1)
Status: In progress — Wave 0 土台完了、Wave 1 実装フェーズへ
Last activity: 2026-05-01 — Phase 19 Plan 01 完了（Wave 0 テスト土台）

## Phases（予定）

| Phase | 内容 | 要件 | deploy必要 |
|-------|------|------|-----------|
| 15 | コード整理（lib/分離・死んだコード削除） | CLEAN-01, CLEAN-02 | 不要 |
| 16 | バグ修正3件 | FIX-01, FIX-02, FIX-03 | ✅ 実機確認 |
| 17 | コンポーネント分割 | ARCH-01〜04 | ✅ 実機確認 |
| 18 | ロック機能完成（エディタ🔔・再起動復元） | LOCK-06〜08 | ✅ 実機確認 |
| 19 | 起動性能300ms達成（Pool窓 透明→不透明） | TBD（PERF-01〜） | ✅ デスクトップ実測 |

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

- **Phase 19 のマイルストーン整合性**: 現マイルストーン v5.0 は「iPhone PWA 安定化」だが Phase 19 はデスクトップ性能。次マイルストーン (v6.0 等) に切り出すか、v5.0 を「品質安定化全般」に再定義するか要判断
