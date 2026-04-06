---
phase: 11-pc-iphone
plan: 03
subsystem: viewer/page.tsx
tags: [pc-iphone, received_pc, IndexedDB, Drive, notification]
dependency_graph:
  requires: [11-01, 11-02]
  provides: [PC→iPhone受信フロー, received_pcバッジ, 一覧受信表示]
  affects: [app/viewer/page.tsx]
tech_stack:
  added: []
  patterns: [pendingHydrate, downloadFusenNoteItems, IndexedDB saveDraft]
key_files:
  created: []
  modified:
    - app/viewer/page.tsx
decisions:
  - "[Phase 11-pc-iphone]: downloadFusenNoteItems は items 配列スキーマと旧スキーマ（単体 title/body）の両方に対応"
  - "[Phase 11-pc-iphone]: 通知タップ後は note ステップを経由せず write ステップに直接遷移（pendingHydrate パターン）"
  - "[Phase 11-pc-iphone]: 「通知を消して一覧へ」ボタンで received_at を全 items に書き戻して Drive を更新する"
metrics:
  duration: "382s (約6分)"
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_modified: 1
---

# Phase 11 Plan 03: PC→iPhone 受信フロー + received_pc 一覧表示 Summary

**One-liner:** 通知タップ後に Drive から全未読ノートを IndexedDB に received_pc: true で保存し write に直接遷移、一覧に水色「PC受信」バッジで表示・編集・削除できる

## What Was Built

viewer/page.tsx に PC→iPhone 受信フロー全体を実装した。

### 型拡張

- `IphoneNote.status` に `'received_pc'` を追加（`'sent' | 'draft' | 'received_pc'`）
- `DraftRecord` に `received_pc?: true` フィールドを追加
- `FusenNoteItem` 型（id, title, body, sent_at, received_at）を新規定義

### downloadFusenNoteItems 関数

- `fusen_note.json` を Drive からダウンロード
- `items` 配列スキーマ: `received_at == null` の件のみフィルタ
- 旧スキーマ（単体 `title`/`body`）: 1 件の配列として互換処理
- トークン期限切れ時は `refreshAccessToken` で自動リフレッシュ

### 通知タップフロー（2 箇所）

`?note=<id>` パラメータ受信 と OAuth 再リダイレクト後の `pending_note` フローの両方を変更:

1. `downloadFusenNoteItems(token)` で全未読取得
2. `for...of saveDraft(...)` で IndexedDB に `received_pc: true` で一括保存
3. タップされた id（または先頭）のノートを `setPendingHydrate` → `setStep('write')` で直接表示

### 一覧表示変更

- `drafts.map` のマッピングを `d.received_pc ? 'received_pc' : 'draft'` に変更
- バッジ: `bg-blue-100 text-blue-700`「PC受信」（水色）を追加
- 削除ボタン表示条件を `draft || received_pc` に拡張
- 削除後の再マッピングも `received_pc` 対応
- タップハンドラ: `draft || received_pc` で `loadDraft + draftId` 維持（pendingHydrate パターン）

### note ステップ「消す」ボタン変更

「通知を消して一覧へ」に変更:
1. 全通知をクローズ（タグ指定なし → 全件）
2. Drive の `fusen_note.json` 全 items に `received_at` を付けて書き戻し
3. `setStep('list')` で一覧へ遷移

サブテキスト「→ 一覧に履歴として残ります」を追加。

## Verification Results

- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: 72 passed / 29 todo (0 failures)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

### Files Exist

- FOUND: app/viewer/page.tsx
- FOUND: commit 2d17b0d (Task 1)
- FOUND: commit c13f7d9 (Task 2)

## Self-Check: PASSED
