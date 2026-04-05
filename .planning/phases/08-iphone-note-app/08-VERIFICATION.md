---
phase: 08-iphone-note-app
verified: 2026-04-01T06:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
human_verification:
  - test: "書く画面でメモを書き、iPhoneに置いておく を押して下書き保存 → 一覧から下書きをタップして内容が復元されることを確認"
    expected: "テキスト・画像・タグが元通り復元される"
    why_human: "IndexedDB → hydrateEditor の実動作はブラウザ実機のみ確認可能"
  - test: "📷 → アルバム選択 → CropModal → 貼り付け でカーソル位置に画像がインライン表示されることを確認"
    expected: "max-height:80px の img が contenteditable 内に表示される"
    why_human: "Canvas API の動作と touch イベントはブラウザ実機のみ確認可能"
  - test: "タグを追加して PCに送る → PC側付箋にタグが反映されることを確認"
    expected: "fusen_add_tag が呼ばれて PC 付箋ファイルにタグが書き込まれる"
    why_human: "Tauri invoke + PC 受信の E2E は実機確認が必要"
---

# Phase 8: iPhoneノートアプリ化 Verification Report

**Phase Goal:** iPhoneでノートの作成・編集・一覧・PCへの送信が付箋アプリと同等の操作感でできる（contenteditable エディタ・ツールバー・タグ機能・送信済みノート編集）
**Verified:** 2026-04-01T06:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 書く画面にタイトル入力欄がなく、1行目が自動的にタイトル/ファイル名になる | VERIFIED | textareaRef/writeTitle/writeBody の残存ゼロ。editorRef の contenteditable div が L1017-1024 に存在。serializeEditor → extractTitleBody で1行目がタイトルに変換される（L1112-1113, L1165-1166） |
| 2 | ヘッダー右に 📷🔷☑🏷️ が並び、min-w-[32px] hover:bg-gray-100 スタイル | VERIFIED | L979-1013 に4ボタン全て存在。📷🔷☑ は `min-w-[32px] px-2 py-1 hover:bg-gray-100 text-gray-700 rounded text-sm`。🏷️ はトグル状態で背景色変更 |
| 3 | 📷→アルバム選択→CropModal→「貼り付け」でインライン画像挿入 | VERIFIED | CropModal コンポーネント L475 で定義（ViewerPage の外）。📷 ボタンが `fileInputRef.current?.click()` を呼ぶ（L981）。file input onChange が `setCropFile + setShowCropModal(true)` を呼ぶ（L1083-1089）。CropModal の「貼り付け」が `insertNodeAtCursor(img)` を呼ぶ（L1242） |
| 4 | 🔷でMermaidを入力・挿入するとカーソル位置にSVGインライン表示 | VERIFIED | 「挿入」ボタン L1318-1336 で `mermaidPreviewSvg && editorRef.current` 時に `insertNodeAtCursor(wrapper)` (L1327)、プレビューなし時は `insertTextAtCursor(block)` (L1331) |
| 5 | 一覧の sent/draft 両方がタップ可能で、編集・再送信できる | VERIFIED | li の className が固定 `cursor-pointer active:bg-gray-50`（L1371）。onClick が draft/sent 分岐で hydrateEditor を呼ぶ（L1375-1404）。sent タップは `setCurrentDraftId(null)` で新規送信扱い（L1401） |
| 6 | タグを追加でき「PCに送る」でPC側付箋にも反映 | VERIFIED | 🏷️ボタン + showTagBar トグル（L1003-1012）。タグバー UI（L1026-1061）。送信 payload に `tags: writeTags`（L1178, L1187）。app/page.tsx L991 の listen 型に `tags?: string[]`、L1014-1017 で `fusen_add_tag` ループ |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/viewer/page.tsx` (Plan 01) | contenteditable基盤: 5ヘルパー関数・state変更・write UI差し替え | VERIFIED | serializeEditor L22, extractTitleBody L46, insertTextAtCursor L54, insertNodeAtCursor L68, hydrateEditor L87 が全てファイルスコープに定義済み。editorRef, imageBlobs, writeTags, showTagBar, tagInput, cropFile, showCropModal が L659-665 に宣言。textareaRef/writeTitle/writeBody 残存なし |
| `app/viewer/page.tsx` (Plan 02) | CropModal + ヘッダーツールバー📷🔷☑ + Mermaidインライン挿入 | VERIFIED | CropModal L475 に完全実装（Canvas API, touch/mouse イベント, handleCrop)。ツールバー L979-1013。Mermaid 挿入ロジック L1318-1336 |
| `app/viewer/page.tsx` (Plan 03) | 🏷️ボタン + タグバー UI + tags を含む送信payload + DraftRecord tags 保存 | VERIFIED | 🏷️ボタン L1003-1012。タグバー L1026-1061。payload tags L1122, L1178, L1187。DraftRecord.tags? L413。IphoneNote.tags? L321 |
| `app/page.tsx` (Plan 03) | PC受信ハンドラの fusen_add_tag 呼び出し | VERIFIED | listen 型 L991 に `tags?: string[]`。destructuring L994 で tags 取得。fusen_add_tag ループ L1014-1017 |
| `app/viewer/page.tsx` (Plan 04) | 送信済みノード編集対応・hydrateEditor による復元 | VERIFIED | li className 固定 cursor-pointer L1371。draft 復元 L1375-1392（blobMap 構築 + hydrateEditor）。sent 復元 L1394-1403（空 blobMap + hydrateEditor + currentDraftId=null） |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| write step JSX | editorRef (RefObject\<HTMLDivElement\>) | `ref={editorRef}` | WIRED | L1018: `ref={editorRef}` |
| serializeEditor | img[data-filename] | シリアライズ時にMarkdown画像記法に変換 | WIRED | L34-38: `querySelectorAll('img[data-filename]')` で `![](filename)` に変換 |
| hydrateEditor | blobMap (Map\<string, File\>) | ファイル名でblobを引いてObjectURLを生成 | WIRED | L91, L261: `blobMap.get(filename)` → `URL.createObjectURL(file)` |
| 📷 ボタン | fileInputRef (hidden input[type=file]) | `onClick → fileInputRef.current?.click()` | WIRED | L981: `fileInputRef.current?.click()` |
| file input onChange | setCropFile + setShowCropModal(true) | ファイル選択後にCropModalを開く | WIRED | L1083-1089 |
| CropModal 「貼り付け」 | insertNodeAtCursor(img) | Canvas.toBlob → ObjectURL → img要素 → insertNodeAtCursor | WIRED | L1242: `insertNodeAtCursor(img)` |
| Mermaid 「挿入」ボタン | insertNodeAtCursor(div[data-mermaid-code]) | SVGをdivでラップ → insertNodeAtCursor | WIRED | L1322-1327: wrapper.setAttribute('data-mermaid-code', mermaidCode) + insertNodeAtCursor(wrapper) |
| 「PCに送る」uploadWithAutoRefresh | fusen_from_iphone.json の tags フィールド | payload に tags: writeTags を追加 | WIRED | L1178, L1187: `tags: writeTags` |
| app/page.tsx fusen:note_from_iphone リスナー | invoke('fusen_add_tag') | tags 配列をループして invoke | WIRED | L1014-1017 |
| 一覧の li onClick（sent note） | hydrateEditor(editorRef.current, note.body, emptyBlobMap) | テキストのみ復元（画像blobなし） | WIRED | L1394-1400: `hydrateEditor(editorRef.current, fullText, emptyBlobMap)` |
| 一覧の li onClick（draft note） | hydrateEditor(editorRef.current, fullText, blobMap) | IndexedDB から images を取得して blobMap 構築 | WIRED | L1377-1389: blobMap 構築 + hydrateEditor 呼び出し |

### Requirements Coverage

REQUIREMENTS.md には IPHONE-UI-01〜IPHONE-UI-06 の定義が存在しない（v3.0要件は SEND-xx / HIST-xx / REND-xx / POLL-xx 体系）。これらの ID は ROADMAP.md Phase 8 と各 PLAN の frontmatter にのみ記載されている。

要件定義ファイルとしての REQUIREMENTS.md との照合は不可。ただし Phase 8 の Success Criteria（ROADMAP.md L81-86）と各 PLAN の must_haves に対する検証は上記の通り全て VERIFIED。

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| IPHONE-UI-01 | 08-01-PLAN | contenteditable エディタ基盤 | SATISFIED | 5ヘルパー関数・state変更・write UI差し替え 全て実装済み |
| IPHONE-UI-02 | 08-02-PLAN | 📷 画像クロップ挿入 | SATISFIED | CropModal + file input → insertNodeAtCursor 全経路実装済み |
| IPHONE-UI-03 | 08-02-PLAN | 🔷 Mermaid SVG インライン挿入 | SATISFIED | insertNodeAtCursor(div[data-mermaid-code]) 実装済み |
| IPHONE-UI-04 | 08-02-PLAN | ☑ チェックボックス挿入 | SATISFIED | insertTextAtCursor('- [ ] ') L997 実装済み |
| IPHONE-UI-05 | 08-03-PLAN | 🏷️ タグ機能 + PC受信タグ反映 | SATISFIED | タグバー UI + fusen_add_tag ループ 実装済み |
| IPHONE-UI-06 | 08-04-PLAN | 送信済みノード編集・再送信 | SATISFIED | hydrateEditor + sent/draft 両方の onClick 実装済み |

**注記:** IPHONE-UI-01〜06 は REQUIREMENTS.md に未登録（ORPHANED ID）。ROADMAP.md Phase 8 の Success Criteria にのみ記載。機能実装は全て完了しているが、REQUIREMENTS.md のトレーサビリティ表に追記が望ましい。

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | なし | — | — |

旧 state（textareaRef, writeTitle, writeBody, attachedImages）の残存なし。`<textarea` と `<input type="text"` （タイトル欄）の残存なし確認済み。

### Human Verification Required

#### 1. 下書き復元の完全性確認

**Test:** iPhone PWA でテキスト・画像を含むメモを書き「iPhoneに置いておく」→ 一覧から下書きをタップ
**Expected:** contenteditable に画像プレビュー付きでテキストが復元される
**Why human:** IndexedDB → Blob → hydrateEditor → ObjectURL の連鎖は実機のみ確認可能

#### 2. CropModal のタッチ操作確認

**Test:** iPhone で 📷 を押してアルバム選択 → CropModal でドラッグしてトリミング → 「貼り付け」
**Expected:** Canvas に画像とクロップ矩形が表示され、「貼り付け」で contenteditable 内にミニ画像が挿入される
**Why human:** Canvas API の touch イベント動作は実機のみ確認可能

#### 3. PC へのタグ反映確認

**Test:** iPhone でタグを追加して「PCに送る」 → PC 側で受信した付箋を確認
**Expected:** 付箋ファイルに iPhone で設定したタグが書き込まれている
**Why human:** Tauri invoke + Drive 通信 + PC 受信の E2E は実機のみ確認可能

### Gaps Summary

なし。全6つの Observable Truth が VERIFIED。

---

_Verified: 2026-04-01T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
