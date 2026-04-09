---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: iPhone→PC送信
status: executing
last_updated: "2026-04-09T11:01:00.000Z"
last_activity: 2026-04-09 — 13-03 完了（起動時ロック復元 + 削除時ロック解除 + LOCK-04/05 テスト GREEN）
progress:
  total_phases: 9
  completed_phases: 5
  total_plans: 25
  completed_plans: 23
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** すぐ書けて、そこに残る。それだけ確実に動く。
**Current focus:** v4.0 ロック画面コントロール — Phase 13 実行中（13-03 完了）

## Current Position

Phase: 13-rokku-gamen-kontororu-kiban
Plan: 03（完了）
Status: In Progress — 次のアクション: 13-04-PLAN.md 実行
Last activity: 2026-04-09 — 13-03 完了（起動時ロック復元 + 削除時ロック解除 + LOCK-04/05 テスト GREEN）

## Accumulated Context

### Decisions

- v4.0: ロック画面表示はService Worker `registration.showNotification()` で実装（APNs不要・iPhone側から直接）
- v4.0: 通知タグは `fusen-lock-<noteId>` で管理（複数同時表示・個別削除に対応）
- v4.0: ロック中状態はIndexedDB `fusen-drafts` の新規ストアか既存メタデータに永続化
- v4.0: ボタン配置は一覧行 + エディタヘッダーの両方
- v4.0: Phase 13 で基盤（LOCK-01〜05）、Phase 14 でエディタ連携 + 再起動復元（EDIT-01〜02, RESUME-01）
- [Phase 13-rokku-gamen-kontororu-kiban]: テストスタブは test.skip() を使用（pre-commit フックの test:e2e がブロックするため）
- [Phase 13-rokku-gamen-kontororu-kiban]: テストファイルは e2e/ に配置（playwright.config.ts の testDir: ./e2e に準拠）
- [Phase 13-rokku-gamen-kontororu-kiban]: Bell button shown on ALL note cards regardless of status; activeNotifIds and lockedNoteIds kept separate to avoid tag prefix collision
- [Phase 13-rokku-gamen-kontororu-kiban]: Startup permission check uses Notification.permission without requestPermission() (iOS constraint)
- [Phase 13-rokku-gamen-kontororu-kiban]: LOCK-04 implemented as pure unit test; LOCK-05 as E2E with IndexedDB injection

### Pending Todos

なし

### Blockers/Concerns

なし
