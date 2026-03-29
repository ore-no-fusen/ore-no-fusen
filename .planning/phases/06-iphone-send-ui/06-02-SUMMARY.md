---
phase: 06-iphone-send-ui
plan: "02"
subsystem: ui
tags: [react, pwa, google-drive, iphone, write-step]

requires:
  - phase: 06-01
    provides: Wave 0 テストスタブ（viewer.test.tsx 22件 todo）

provides:
  - write ステップ UI（ヘッダー・タイトル入力・本文テキストエリア・添付ツールバー・アクションボタン）
  - "PCに送る" ロジック（fusen_from_iphone.json へ Drive 書き込み）
  - "iPhoneに置いておく" ロジック（fusen_iphone_notes.json へ draft 保存）
  - IphoneNote 型定義
  - uploadWithAutoRefresh / saveToHistory / resizeImageToBase64 / insertAtCursor ヘルパー
  - viewer_push_done フラグによるセットアップ済みユーザーの write 直接遷移

affects:
  - 06-03  # list ステップ実装（setStep('list') が接続先）
  - 06-04  # Mermaid モーダル実装（showMermaidModal プレースホルダーを差し替え）

tech-stack:
  added: []
  patterns:
    - "uploadWithAutoRefresh: Drive 書き込みでトークン期限切れ時に refreshAccessToken して retry"
    - "saveToHistory: 既存ファイルを download → unshift → slice(0,50) → upload で50件上限管理"
    - "viewer_push_done localStorage フラグ: push 設定済みユーザーを write へ直接遷移"
    - "resizeImageToBase64: Canvas API で maxWidth=800 に縮小して image/jpeg 0.7 で base64 出力"
    - "insertAtCursor: selectionStart/End でカーソル位置挿入、requestAnimationFrame でカーソル復元"

key-files:
  created: []
  modified:
    - app/viewer/page.tsx

key-decisions:
  - "push 完了後の遷移先は setStep('write')（'ready' ではない）— write がホーム画面になる"
  - "note「消す」後の遷移先も setStep('write')（通知確認後に書く画面へ戻る）"
  - "Mermaid モーダル UI は Plan 04 に委ねる — showMermaidModal state と setShowMermaidModal(true) のみ追加"
  - "fusen_from_iphone.json と fusen_iphone_notes.json は別ファイル（PC受信キューと履歴を分離）"

patterns-established:
  - "IphoneNote 型: id(UUID) / status('sent'|'draft') / title / body / created_at / sent_at? で統一"

requirements-completed:
  - SEND-01
  - SEND-02

duration: 15min
completed: 2026-03-29
---

# Phase 6 Plan 02: write ステップ UI と送信/下書きロジック Summary

**viewer/page.tsx に write ステップを追加し、fusen_from_iphone.json（PC送信）と fusen_iphone_notes.json（下書き履歴）への Drive 書き込みフローを実装**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-29T17:20:00Z
- **Completed:** 2026-03-29T17:28:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- step 型に `'write' | 'list'` を追加し、push 完了・note 消去後の遷移を `setStep('write')` に修正
- write 画面（ヘッダー/タイトル入力/テキストエリア/添付ツールバー/送信ボタン）を実装
- 「PCに送る」で fusen_from_iphone.json に書き込み後、履歴保存・入力クリア・成功メッセージ表示
- 「iPhoneに置いておく」で fusen_iphone_notes.json に draft 保存後、list ステップに遷移
- IphoneNote 型・4つのヘルパー関数（uploadWithAutoRefresh / saveToHistory / resizeImageToBase64 / insertAtCursor）を追加

## Task Commits

Each task was committed atomically:

1. **Task 1: step 型拡張・遷移修正・ヘルパー追加** - `dd2b976` (feat)
2. **Task 2: write ステップ UI と送信/下書きロジック** - `b8a07f8` (feat)

## Files Created/Modified

- `app/viewer/page.tsx` - write ステップ UI 追加、IphoneNote 型・ヘルパー群追加、step 型拡張・遷移修正

## Decisions Made

- push 完了後と note「消す」後はどちらも `setStep('write')` — write がアプリのホーム画面になる
- Mermaid モーダル UI は Plan 04 に委ねる（この Plan では state 宣言と `setShowMermaidModal(true)` 呼び出しのみ）
- fusen_from_iphone.json と fusen_iphone_notes.json は別ファイル設計（PC受信キューと iPhone 履歴を分離）

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- write ステップ完成。Plan 03 の list ステップ（履歴表示・下書き編集）が接続できる状態
- `setStep('list')` は write ヘッダーの「📋 履歴」ボタンと「iPhoneに置いておく」ボタンの両方から呼ばれる
- Plan 04 は `showMermaidModal` state と `{showMermaidModal && null}` プレースホルダーを置き換えるだけで実装可能

---
*Phase: 06-iphone-send-ui*
*Completed: 2026-03-29*
