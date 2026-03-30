---
phase: 06-iphone-send-ui
verified: 2026-03-29T12:00:00Z
status: human_needed
score: 6/7 must-haves verified
re_verification: false
human_verification:
  - test: "iPhoneのPWAとして開き、write画面が表示されることを確認する"
    expected: "ホーム画面追加済みのSafariで /viewer を開くと、ログイン済みなら「書く」画面が表示される"
    why_human: "isStandalone判定はnavigator.standaloneに依存。jsdomでは再現不可"
  - test: "「PCに送る」ボタンを押してDriveに書き込まれることを確認する"
    expected: "Google Drive に fusen_from_iphone.json が作成/更新され、成功後に入力欄がクリアされ「送信しました！」が表示される"
    why_human: "実際のDrive APIを呼ぶため。uploadToDriveのmock統合テストはit.todoのまま（SEND-01）"
  - test: "「iPhoneに置いておく」を押して履歴に下書きが保存されることを確認する"
    expected: "fusen_iphone_notes.json に status:draft のエントリが追加され、履歴画面に遷移する"
    why_human: "Drive API統合。saveToHistoryのmock統合テストはit.todoのまま（SEND-02）"
  - test: "📷ボタンで画像を選択してMarkdown画像が挿入されることを確認する"
    expected: "選択した画像がCanvasで縮小されてbase64化され、テキストエリアのカーソル位置に![](data:...)が挿入される"
    why_human: "実機のカメラ/ライブラリアクセスが必要。file input動作はjsdom非対応"
  - test: "Mermaidボタンでモーダルが開き、図が挿入されることを確認する"
    expected: "モーダルが全画面で開き、コード入力→プレビューでSVGが表示され、挿入ボタンで本文に```mermaidブロックが入る"
    why_human: "mermaid.render()の実際のSVG生成と、モーダル内のUI操作フローは手動確認が必要"
  - test: "履歴画面でsent/draftバッジと相対時刻が表示されることを確認する"
    expected: "送信済みは青バッジ、下書きは黄バッジ。「3分前」「1時間前」等の相対時刻が表示される"
    why_human: "実際の履歴データをDriveから取得する必要がある。Intl.RelativeTimeFormatの表示確認も含む"
  - test: "下書きをタップして編集画面に遷移し、内容が復元されることを確認する"
    expected: "履歴画面でdraftアイテムをタップするとwrite画面に遷移し、title/bodyが元の下書きの内容に復元される"
    why_human: "実機のタップイベントとステップ遷移の視覚確認が必要"
  - test: "SimpleNoteBodyがMermaidコードブロックをSVGとして描画することを確認する"
    expected: "```mermaidブロックを含む本文がviewerで表示されるとき、テキストではなくSVG図として描画される"
    why_human: "mermaid.render()の実際のSVG描画はjsdomでは確認不可（モックを使用）"
---

# Phase 06: iPhone Send UI Verification Report

**Phase Goal:** iPhoneのviewer画面からテキスト・画像・Mermaidを作成してDriveに送信でき、履歴で確認できる
**Verified:** 2026-03-29T12:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | テキストを入力して「PCに送る」でfusen_from_iphone.jsonがDriveに書き込まれる (SEND-01) | ? HUMAN | page.tsx L638: `uploadWithAutoRefresh(accessToken, 'fusen_from_iphone.json', {...})` 実装済み。Drive統合テストはit.todo |
| 2  | 「iPhoneに置いておく」でfusen_iphone_notes.jsonにdraftが保存される (SEND-02) | ? HUMAN | page.tsx L616: `saveToHistory(accessToken, note)` + `setStep('list')` 実装済み。Drive統合テストはit.todo |
| 3  | 画像選択でCanvasリサイズ→base64→![](data:...)挿入 (SEND-03) | ✓ VERIFIED | resizeImageToBase64/insertAtCursorがexport済み。テストGREEN (2件) |
| 4  | Mermaidボタンでモーダルが開き、```mermaidブロックが挿入される (SEND-04) | ? HUMAN | page.tsx L669-751: MermaidModal実装済み。insertAtCursorテストGREEN。モーダル開閉は手動確認要 |
| 5  | listステップで最新10件が表示され、sent/draftバッジが正しく出る (HIST-01) | ? HUMAN | page.tsx L755-815: list UI実装済み。スライスロジックテストGREEN。Drive読み込みは手動確認要 |
| 6  | draftタップでwriteステップに遷移しtitle/bodyが復元される (HIST-02) | ✓ VERIFIED | page.tsx L785-789: `setWriteTitle(note.title); setWriteBody(note.body); setStep('write')` 実装済み。ハンドラロジックテストGREEN |
| 7  | SimpleNoteBodyが```mermaidブロックをSVGとして描画する (REND-01) | ✓ VERIFIED | SimpleNoteBody.tsx: MermaidBlock + dynamic import('mermaid')実装済み。テストGREEN (3件) |

**Score:** 3/7 truths fully verified by automated checks; 4/7 need human verification (Drive API / real device)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/viewer/page.tsx` | write/listステップ UI + 送信/下書きロジック | ✓ VERIFIED | 849行。step型に'write'/'list'追加。writeステップL522-753、listステップL755-815実装済み |
| `app/viewer/SimpleNoteBody.tsx` | Mermaidブロック検出・SVGレンダリング | ✓ VERIFIED | 109行。MermaidBlock + dynamic import('mermaid')実装済み。'use client'あり |
| `app/viewer/viewer.test.tsx` | 全要件のテスト実装 | PARTIAL | 27テスト（18 GREEN, 9 todo）。SEND-01(3)/SEND-02(2)のコンポーネント統合テストがit.todoのまま |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| push完了後 | setStep('write') | onClick L493 | ✓ WIRED | `localStorage.setItem('viewer_push_done', 'true'); setStep('write')` |
| note「消す」後 | setStep('write') | onClick L829 | ✓ WIRED | `setStep('write')` on 消すボタン |
| 「PCに送る」ボタン | uploadWithAutoRefresh('fusen_from_iphone.json') | onClick L630 | ✓ WIRED | `uploadWithAutoRefresh(accessToken, 'fusen_from_iphone.json', {...})` L638 |
| 「iPhoneに置いておく」ボタン | saveToHistory + setStep('list') | onClick L604 | ✓ WIRED | `saveToHistory(accessToken, note)` → `setStep('list')` L616-617 |
| Mermaid挿入ボタン | insertAtCursor + setWriteBody | onClick L737 | ✓ WIRED | `insertAtCursor(textareaRef.current, block)` → `setWriteBody(newBody)` L740-741 |
| listステップ入場 | downloadFromDrive('fusen_iphone_notes.json') | useEffect L387 | ✓ WIRED | `step !== 'list'` ガード付きuseEffect。`.slice(0, 10)` でリスト |
| draft タップ | setWriteTitle + setWriteBody + setStep('write') | onClick L785 | ✓ WIRED | `note.status !== 'draft'` ガード後に3つのstate更新 |
| SimpleNoteBody | mermaid.render() | import('mermaid') L12 | ✓ WIRED | dynamic import → mermaid.initialize + render → innerHTML = svg |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEND-01 | 06-01, 06-02 | PCに送る機能 | ✓ IMPL, ? HUMAN TEST | page.tsx L638: uploadWithAutoRefresh('fusen_from_iphone.json')。SEND-01テスト3件はit.todo |
| SEND-02 | 06-01, 06-02 | iPhoneに置いておく機能 | ✓ IMPL, ? HUMAN TEST | page.tsx L616: saveToHistory + setStep('list')。SEND-02テスト2件はit.todo |
| SEND-03 | 06-01, 06-03 | 画像添付 (Canvas圧縮) | ✓ VERIFIED | resizeImageToBase64 export済み + テスト2件GREEN |
| SEND-04 | 06-01, 06-04 | Mermaid挿入 | ✓ IMPL, ? HUMAN UI | MermaidModal実装済み。insertAtCursorテスト1件GREEN。モーダル開閉は手動確認要 |
| HIST-01 | 06-01, 06-05 | 履歴表示 (最新10件) | ✓ IMPL, ? HUMAN | listステップUI実装済み。スライスロジックテスト2件GREEN。Drive取得は手動確認要 |
| HIST-02 | 06-01, 06-05 | 下書き編集再開 | ✓ VERIFIED | page.tsx L785-789実装済み。ハンドラテスト2件GREEN |
| REND-01 | 06-01, 06-04 | Mermaidレンダリング | ✓ VERIFIED | SimpleNoteBody.tsx実装済み。テスト3件GREEN |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| app/viewer/viewer.test.tsx | 117-120 | SEND-01の3テストがit.todo | ⚠️ Warning | コンポーネント統合テストが未実装。ロジックは実装済みだが自動検証カバレッジが不完全 |
| app/viewer/viewer.test.tsx | 122-125 | SEND-02の2テストがit.todo | ⚠️ Warning | 同上。Drive mock統合テストが未実装 |

**注:** SEND-01/SEND-02のit.todoはWave 0の設計によるもの（「コンポーネントレンダリングが複雑」のためWave 1以降に委ねた）。しかし実際にはWave 1-5完了後もコンポーネントテストが実装されなかった。ブロッカーではないが、テスト品質の観点で要注意。

### Human Verification Required

#### 1. write画面の表示確認（PWA standalone）

**Test:** iPhoneのSafariでホーム画面に追加済みのアプリを開き、ログイン済み状態で起動する
**Expected:** 「書く」ヘッダー + タイトル入力 + 本文テキストエリア + 📷/Mermaidボタン + 「iPhoneに置いておく」「PCに送る」ボタンが表示される
**Why human:** isStandalone判定がnavigator.standaloneに依存。jsdomでは再現不可

#### 2. PCへの送信フロー（SEND-01）

**Test:** write画面でタイトル・本文を入力し「PCに送る」を押す
**Expected:** Google DriveにaccessTokenで認証してfusen_from_iphone.jsonが作成/更新される。成功後に入力欄がクリアされ「送信しました！」が3秒表示される
**Why human:** 実際のDrive API呼び出しが必要。SEND-01のコンポーネント統合テストがit.todo

#### 3. 下書き保存フロー（SEND-02）

**Test:** write画面で「iPhoneに置いておく」を押す
**Expected:** fusen_iphone_notes.jsonに status:draft のエントリが追加され、履歴画面（list）に遷移する
**Why human:** 実際のDrive API呼び出しが必要。SEND-02のコンポーネント統合テストがit.todo

#### 4. 画像添付フロー（SEND-03）

**Test:** 📷ボタンを押してカメラロールから画像を選択する
**Expected:** 画像がCanvas経由でリサイズ・base64化され、テキストエリアのカーソル位置に `![](data:image/jpeg;base64,...)` が挿入される
**Why human:** file input + カメラ/ライブラリアクセスは実機のみ

#### 5. Mermaidモーダル操作（SEND-04）

**Test:** Mermaidボタンを押してモーダルを開き、`graph TD\n  A-->B` と入力して「プレビュー」→「挿入」
**Expected:** モーダルが全画面で開く。プレビューボタンでSVG図が表示される。挿入ボタンで本文に ` ```mermaid` ブロックが挿入され、モーダルが閉じる
**Why human:** mermaid.render()の実際のSVG生成とモーダルのUI操作フロー確認が必要

#### 6. 履歴画面のsent/draftバッジ・相対時刻表示（HIST-01）

**Test:** 何件か送信/下書き保存後に「📋 履歴」ボタンを押す
**Expected:** 最大10件のリストが表示される。送信済みは青バッジ「送信済み」、下書きは黄バッジ「下書き」。相対時刻（例: 「3分前」「1時間前」）が各アイテムに表示される
**Why human:** Driveからの実データ取得 + Intl.RelativeTimeFormatの実表示確認

#### 7. 下書き編集再開（HIST-02）

**Test:** 履歴画面で下書きアイテムをタップする
**Expected:** write画面に遷移し、保存時のtitleとbodyが復元された状態で表示される
**Why human:** 実機のタップ操作と画面遷移の視覚確認が必要

#### 8. Mermaidレンダリング表示（REND-01）

**Test:** mermaidブロックを含む付箋が通知タップでviewer画面に表示される
**Expected:** ` ```mermaid\ngraph TD\n  A-->B\n``` ` がテキストではなくSVG図として描画される
**Why human:** 実際のmermaid.render()によるSVG生成はjsdomでは確認不可（テストはモックを使用）

### Gaps Summary

自動検証可能な範囲では、7つの要件すべてについて実装コードが存在し、正しく結線されていることを確認した。

**自動確認済み (GREEN):**
- SEND-03: resizeImageToBase64/insertAtCursor ユニットテスト2件 GREEN
- SEND-04: insertAtCursor + mermaidブロック挿入テスト1件 GREEN
- HIST-01: スライスロジック・undefined fallback テスト2件 GREEN
- HIST-02: draft/sentタップハンドラロジック テスト2件 GREEN
- REND-01: SimpleNoteBody mermaid/image/text混在テスト3件 GREEN
- formatRelativeTime: 相対時刻計算テスト2件 GREEN

**it.todoとして残存 (警告):**
- SEND-01: 3件のコンポーネント統合テスト未実装（「PCに送る」のDrive書き込みフロー）
- SEND-02: 2件のコンポーネント統合テスト未実装（「iPhoneに置いておく」のDrive書き込みフロー）

これらはロジックの実装は完了しているが、コンポーネントレンダリング + Drive mock の統合テストが未実装。テスト品質の観点では不完全だが、フェーズゴールの達成を妨げるブロッカーではない。

**人間による確認が必要な項目:** 全8項目（Drive API統合、実機PWA動作、Mermaid実描画）

---

_Verified: 2026-03-29T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
