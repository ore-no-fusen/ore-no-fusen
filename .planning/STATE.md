---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: iPhone PWA 安定化
status: defining_requirements
last_updated: "2026-04-10T00:00:00.000Z"
last_activity: 2026-04-10 — v5.0 マイルストーン開始（要件定義完了、ロードマップ作成待ち）
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** すぐ書けて、そこに残る。それだけ確実に動く。
**Current focus:** v5.0 iPhone PWA 安定化 — 要件定義完了、次は /gsd:plan-phase 15

## Current Position

Phase: Not started
Plan: —
Status: Defining requirements → ロードマップ作成待ち
Last activity: 2026-04-10 — v5.0 マイルストーン開始

## Phases（予定）

| Phase | 内容 | 要件 | deploy必要 |
|-------|------|------|-----------|
| 15 | コード整理（lib/分離・死んだコード削除） | CLEAN-01, CLEAN-02 | 不要 |
| 16 | バグ修正3件 | FIX-01, FIX-02, FIX-03 | ✅ 実機確認 |
| 17 | コンポーネント分割 | ARCH-01〜04 | ✅ 実機確認 |
| 18 | ロック機能完成（エディタ🔔・再起動復元） | LOCK-06〜08 | ✅ 実機確認 |

## Accumulated Context

### 設計書
- `docs/viewer-redesign.html` — バグ根本原因と修正方針の詳細
- `docs/system-overview.html` — システム全体データフロー図
- `docs/pwa-data-flow.html` — iPhone PWA 内部フロー図

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

### Pending Todos

なし

### Blockers/Concerns

なし
