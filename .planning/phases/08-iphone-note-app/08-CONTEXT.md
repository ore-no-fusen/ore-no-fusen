# Phase 8: iPhoneノートアプリ化 - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning
**Source:** ユーザーとの対話による要件収集

<domain>
## Phase Boundary

viewer/page.tsx（iPhone PWA）の書く画面・一覧画面を全面改修し、PCの付箋編集モードと同等の操作感にする。
app/page.tsx（PC受信ハンドラ）にタグ適用を追加。Rustは変更しない。

</domain>

<decisions>
## Implementation Decisions

### エディタ方式
- textarea → contenteditable div に変更（画像・Mermaidのインライン表示を実現するため）
- タイトル入力欄を廃止。1行目が自動的にタイトルになる
- 1行目の `#` プレフィックスは除去してtitleとして扱う（PC受信側が `# title\n\n` を prepend するため）

### ツールバー配置（PC編集モードに合わせる）
- 現在の下部ツールバー（📷・Mermaid）を廃止
- ヘッダー右側に統合：📷 🔷 ☑ 🏷️ の4ボタン
- スタイル: `min-w-[32px] px-2 py-1 hover:bg-gray-100 text-gray-700 rounded`、`gap-0`
- MermaidアイコンはPCと同じ `🔷`（現在は `Mermaid` テキスト）

### 画像挿入フロー（ユーザー確定済み）
1. 📷タップ → `<input type="file" accept="image/*">` でアルバム選択
2. 選択後 → **トリミングモーダル**を表示（フルスクリーン）
3. トリミングモーダル: 画像上にドラッグ可能なクロップ矩形（4隅+4辺ハンドル）
4. 「貼り付け」ボタン → Canvas APIでクロップ → blob生成
5. カーソル位置に `<img>` をインライン挿入（max-height: 80px のサムネイル）
6. 外部ライブラリ不使用。Canvas API + touchイベントで実装
- シリアライズ時: `img[data-filename]` → `![](filename)` に変換

### Mermaid挿入フロー（変更箇所のみ）
- 既存のMermaidモーダル（コード入力+プレビュー）はそのまま活用
- 「挿入」ボタン: テキストエリアへの `![mermaid]...` 挿入 → contenteditable に SVGをインライン挿入に変更
- 挿入する要素: `<div data-mermaid-code="..."><svg>...</svg></div>`
- シリアライズ時: `div[data-mermaid-code]` → ` ```mermaid\n${code}\n``` ` に変換

### チェックボックスボタン（☑）
- カーソル位置に `- [ ] ` をテキストとして挿入
- contenteditable なので `insertTextAtCursor()` 関数を使う

### タグ機能
- 🏷️タップでタグバーを展開/折りたたみ
- タグバー: チップ形式で表示 + テキスト入力（Enter で追加、× で削除）
- `writeTags: string[]` state で管理
- 送信payload: `{ id, title, body, sent_at, tags: writeTags }` に tags を追加
- 下書きにも tags を保存・復元
- PC受信（app/page.tsx）: `fusen_add_tag` を tags 分だけ呼び出す（既存コマンドを再利用）

### 一覧画面の拡張
- 現在: 下書きのみタップで編集可能
- 変更後: **送信済みノートもタップで編集・再送信可能**
- sent noteロード時: テキストのみ復元（画像blobなし）、currentDraftId=null（新規送信扱い）
- draft noteロード時: 画像blobをIndexedDBから復元、hydrateEditorで再構築

### state変更まとめ
- 削除: `writeTitle`, `writeBody`, `textareaRef`, `attachedImages`
- 追加: `editorRef: RefObject<HTMLDivElement>`, `imageBlobs: Map<string, File>`, `writeTags`, `showTagBar`, `tagInput`, `cropFile`, `showCropModal`
- 型変更: `IphoneNote` に `tags?: string[]`, `DraftRecord` に `tags?: string[]`

### 実装ヘルパー関数
- `serializeEditor(el)` → Markdown文字列
- `extractTitleBody(text)` → `{ title, body }`
- `insertTextAtCursor(text)` → contenteditable カーソル位置にテキスト挿入
- `insertNodeAtCursor(node)` → contenteditable カーソル位置にDOMノード挿入
- `hydrateEditor(el, markdown, blobMap)` → Markdown → contenteditable DOM
- `buildImageFileName(title, index)` → 既存関数（タイトルは1行目から取得）

### Claude's Discretion
- トリミングUIの詳細なスタイリング（モバイルで使いやすいサイズ）
- contenteditable のプレースホルダー表示方法（CSS ::before か JS）
- hydrateEditor でMermaidを再レンダリングするかテキストで表示するか（→ コストを考え初回はテキスト表示でよい）
- タグバーの展開アニメーション

</decisions>

<specifics>
## Specific Ideas

- PC側 ToolbarButtons.tsx 編集モードのスタイル: `flex justify-end items-center gap-0 p-1`、各ボタン `text-gray-700 hover:bg-gray-100 px-2 min-w-[32px] rounded text-sm`
- Mermaid `🔷` は ToolbarButtons.tsx 269行目で確認済み
- `fusen_add_tag` コマンドは `app/api/tags.ts` 28行目で `invoke('fusen_add_tag', { path, tag })` として使用済み
- PC受信ハンドラは `app/page.tsx` 991行目、`{ title, body, context }` を受け取り `fusen_save_note` 後に追記
- `insertAtCursor(el, text)` は `app/viewer/utils.ts` 29行目に実装済み（textarea専用なので参考にして contenteditable版を新規作成）

</specifics>

<deferred>
## Deferred Ideas

- リアルタイム同期（Drive polling）— 「PCに送る」ボタン押下時のみ同期で十分
- 画像の in-place resize（挿入後にサイズ変更）— トリミング時に対応済みのため不要
- Mermaidの再編集（挿入済み図のコード変更）— 今回スコープ外
- オフライン対応の強化 — 現行のIndexedDB下書きで十分

</deferred>

---

*Phase: 08-iphone-note-app*
*Context gathered: 2026-03-31*
