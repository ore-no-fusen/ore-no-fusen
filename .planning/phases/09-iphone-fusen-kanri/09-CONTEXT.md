# Phase 9: iPhone付箋管理 - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning
**Source:** 会話からの直接収集

<domain>
## Phase Boundary

iPhone PWA（viewer/page.tsx）をスタンドアロンの付箋アプリとして使えるようにする。
IndexedDB を付箋の永続ストレージとして活用し、一覧・作成・編集・保存・削除を実現する。
PCへの送信機能（既存）は引き続き動作させる。

**変更ファイル**: `app/viewer/page.tsx` のみ（Rust・app/page.tsx は変更不要）

</domain>

<decisions>
## Implementation Decisions

### バグ修正（最優先）
- 一覧タップ時、`step === 'history'` のため `editorRef.current` が null → `hydrateEditor` が空振り
- **修正方針**: `pendingHydrate: { markdown: string; blobMap: Map<string, File> } | null` state を追加
- 一覧タップ時: `setPendingHydrate(...)` → `setStep('write')` の順に呼ぶ
- write ステップの `useEffect` で `pendingHydrate` があれば `hydrateEditor` を呼んでクリア

### 保存・更新フロー
- `currentDraftId` が存在する場合 → IndexedDB の既存レコードを上書き（put）
- `currentDraftId` が null の場合 → 新規作成（add）
- 「iPhoneに置いておく」ボタンの動作を上記で分岐させる

### 一覧画面リニューアル
- 「履歴」→「一覧」に名称変更
- 右上に「＋」ボタンを追加: エディタをクリアして `currentDraftId=null` にして `setStep('write')`
- 各ノートに削除ボタン（ゴミ箱アイコン）を追加: IndexedDB から削除 → 一覧を再取得
- 削除確認ダイアログは不要（シンプルに即削除）

### 送信フロー維持
- 「PCに送る」は現状通り動作させる
- 送信後: IndexedDB の下書きを削除（currentDraftId があれば）

### UIポリッシュ
- 一覧が空の場合: 「付箋がありません。＋で新規作成」メッセージを表示
- 削除中・保存中のローディング状態は既存の isLoading を流用

### Claude's Discretion
- 削除ボタンのスタイル: ゴミ箱アイコン（🗑️ またはテキスト「削除」）、赤系hover
- 「＋」ボタンの位置: ヘッダー右端
- pendingHydrate の型定義: ファイル先頭付近に型エイリアスとして定義

</decisions>

<specifics>
## Specific Ideas

- `pendingHydrate` state はシンプルな型: `{ markdown: string; blobMap: Map<string, File> } | null`
- write step の useEffect は `[pendingHydrate]` をトリガーにする（editorRef.current が非nullになった後）
- IndexedDB の put は `saveDraft(id, data)` のような既存ヘルパーに `id` オプションを追加する形が望ましい
- 一覧の削除ボタンはノートのカード右端に配置、タップ伝播を止める（`e.stopPropagation()`）

</specifics>

<deferred>
## Deferred Ideas

- 削除確認ダイアログ（シンプルさ優先で即削除）
- 並び替え・検索機能
- 送信済みノートのiPhone内編集後PC再送信フロー（既存で動作しているが、再送信後の下書き削除の挙動は既存通り）

</deferred>

---

*Phase: 09-iphone-fusen-kanri*
*Context gathered: 2026-04-01 via conversation*
