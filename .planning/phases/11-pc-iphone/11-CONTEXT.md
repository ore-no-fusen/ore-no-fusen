# Phase 11: PC→iPhone受信履歴保存 - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

PCから「iPhoneに送る」で送信されたノートを、iPhone側でIndexedDBに保存し、通知を消した後も一覧から閲覧・編集できるようにする。通知が複数ある場合も取り違えない。

変更ファイル：`app/viewer/page.tsx`（主）、`worker/index.js`（通知tag変更）、`src-tauri/src/lib.rs`（fusen_send_to_iphone: 配列化）、`src-tauri/src/gdrive.rs`（fusen_note.json構造変更）

</domain>

<decisions>
## Implementation Decisions

### IndexedDB保存タイミング
- note ステップ表示直後（通知タップ後、Drive からダウンロードが完了した時点）に保存する
- 「通知を消して一覧へ」ボタン押下前に保存 → クラッシュ・レイアウト変更に対応できる
- ID で重複チェックし、すでに存在する場合は上書き保存（再通知タップ対応）

### IndexedDB データ構造
- 既存の `'drafts'` objectStore を使いまわす（新 store・DB バージョンアップ不要）
- `DraftRecord` 型と同じ構造 `{ id, title, body, created_at, images: [], tags }` で保存
- `images` は空配列（PC 受信ノートの画像は base64 埋め込みのまま body に含む）
- 区別用フィールド: `DraftRecord` に `received_pc?: true` フラグを追加して管理
  - `IphoneNote.status = 'received_pc'` として一覧に表示

### 複数ノート対応（fusen_note.json 配列化）
- `fusen_note.json` のスキーマを `{ items: [{ id, title, body, sent_at, received_at? }] }` に変更
- PC 側（Rust `fusen_send_to_iphone`）: 送信時に既存 items を読み込み、新ノートを末尾に追加して最新 20 件まで保持
- **通知のtag**: `'fusen-<note_id>'`（固有ID ベース）
  - 異なるノート → 異なる通知タグ → ロック画面に独立して複数表示
  - 同一ノートを再送信 → 後発通知が前の通知を置き換える
- 通知タップ時の処理（`?note=<id>` 受信後）:
  1. `fusen_note.json` から `received_at` が null の全件（未読）を取得
  2. 全件を IndexedDB に一括保存（上書き方式）
  3. `setStep('list')` で一覧へ遷移

### PC受信ノートの一覧表示・操作
- 一覧で「PC受信」バッジ（水色）表示（`status: 'received_pc'`）
- 一覧からタップ → `write` ステップで内容を編集可能（note ステップには遷移しない）
- 「iPhoneに置いておく」で保存 → `status: 'received_pc'` のまま・内容だけ更新
- 「PCに送る」→ 普通に送信。IndexedDB の受信履歴はそのまま残る（送信済みバッジは付けない）
- 一覧から 🗑️ で削除可能（IndexedDB から削除）

### 「通知を消して一覧へ」ボタン（旧「消す」）
- ボタンラベル: 「通知を消して一覧へ」
- 動作:
  1. SW の通知をすべてクローズ（既存コード）
  2. **Drive の `fusen_note.json` 全 items に `received_at` を付けて書き戻す**（次回通知タップ時の再取得防止）
  3. `setStep('list')` → 一覧へ（現状は 'write' に遷移していたのを修正）
- ボタン下のサブテキスト: 「→ 一覧に履歴として残ります」

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DraftRecord` 型（id/title/body/created_at/images/tags）: 同じ構造で PC 受信ノートを保存できる
- `openDraftsDB()` / `saveDraft()` / `loadAllDrafts()` / `deleteDraft()`: そのまま利用可能
- `uploadWithAutoRefresh()`: Drive への書き戻しに使用
- `downloadWithAutoRefresh()`: `fusen_note.json` 取得に使用（配列化後は複数件返却に対応が必要）
- `IphoneNote` 型: `status: 'sent' | 'draft'` → `'received_pc'` を追加するだけで対応

### Established Patterns
- `pendingHydrate` pattern: list→write 遷移時に内容を state 経由でエディタに渡す（Phase 9 で確立）
- IndexedDB の `received_pc` フラグは `DraftRecord` に追加するのみ（型変更最小）
- 通知tag は現在 `'fusen'` 固定 → `'fusen-<id>'` に変更（worker/index.js の push ハンドラ）

### Integration Points
- `worker/index.js`: push event の `showNotification(title, { tag: 'fusen' })` を `{ tag: 'fusen-' + (data.id ?? 'unknown') }` に変更
- `app/viewer/page.tsx` line 712/732: `downloadWithAutoRefresh` → 配列対応・全未読件一括 IndexedDB 保存に変更
- `app/viewer/page.tsx` line 1589-1597: 「消す」ボタン → ラベル変更・received_at 書き戻し追加・setStep('list') に変更
- `app/viewer/page.tsx` line 1476（list ステップ）: `status='received_pc'` を認識・水色バッジ表示・write 遷移
- `src-tauri/src/lib.rs` line 1350: `fusen_note.json` 単体 upload → read-modify-write 配列追加に変更
- `src-tauri/src/gdrive.rs`: NOTE_FILE 定数は変更なし

</code_context>

<specifics>
## Specific Ideas

- 「通知を消して一覧へ」ボタン下のサブテキスト: 「→ 一覧に履歴として残ります」
- `fusen_note.json` 配列の上限: 最新 20 件（古いものから削除）
- 旧スキーマ（単一オブジェクト形式）との互換: 受信側で `Array.isArray(data.items)` でチェックし、旧スキーマは単一アイテムとして処理（既存 viewer/page.tsx の `fusen_from_iphone.json` 互換コードと同じパターン）
- 「PC受信」バッジのスタイル: `bg-blue-100 text-blue-700`（水色系、送信済みの `bg-blue-500 text-white` より薄め）

</specifics>

<deferred>
## Deferred Ideas

- APNs リッチ通知（画像プレビュー付き通知）— コスト・複雑性が高い
- PC 受信ノートをそのまま別の付箋ウィンドウで開く（PC → iPhone 送信の逆方向）
- 受信通知の既読バッジをアプリアイコンに表示

</deferred>

---

*Phase: 11-pc-iphone*
*Context gathered: 2026-04-06*
