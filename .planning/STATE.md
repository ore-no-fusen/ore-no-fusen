---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: ロック画面コントロール
status: defining_requirements
stopped_at: ""
last_updated: "2026-04-09T00:00:00Z"
last_activity: 2026-04-09 — v4.0 マイルストーン開始
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** すぐ書けて、そこに残る。それだけ確実に動く。
**Current focus:** v4.0 ロック画面コントロール — 要件定義中

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-09 — Milestone v4.0 started

## Accumulated Context

### Decisions

- v4.0: ロック画面表示はService Worker `registration.showNotification()` で実装（APNs不要・iPhone側から直接）
- v4.0: 通知タグは `fusen-lock-<noteId>` で管理（複数同時表示・個別削除に対応）
- v4.0: ロック中状態はIndexedDB `fusen-drafts` の新規ストアか既存メタデータに永続化
- v4.0: ボタン配置は一覧行 + エディタヘッダーの両方

### Pending Todos

なし

### Blockers/Concerns

なし
