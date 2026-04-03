# Phase 10: iPhone UX改善 + 送信高速化 - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning
**Source:** ユーザー直接収集（4点改善要求）

<domain>
## Phase Boundary

iPhone PWA（viewer/page.tsx）のエディタ体験を改善し、PCへの送信を高速化する。
変更ファイル: `app/viewer/page.tsx`（主）, `src-tauri/src/lib.rs`（ポーリング間隔変更）

</domain>

<decisions>
## Implementation Decisions

### 要件1: チェックボックス行頭挿入（iPhone）
- チェックボックスボタンを押したとき、カーソル位置ではなく**行頭**に `- [ ] ` を挿入する
- 行の途中でボタンを押した場合も行頭に挿入する
- PC側（RichTextEditor.tsx）は既に正しく動作しているため、そちらを参考にする
- `insertTextAtCursor('- [ ] ')` を「行頭に移動してから挿入」するロジックに変更

### 要件2: 編集画面でチェックボックスをトグル可能にする
- contenteditable エディタ内で `- [ ] ` / `- [x] ` を実際の `<input type="checkbox">` としてレンダリングする
- チェックボックスをクリックするとリアルタイムにON/OFFが切り替わる
- チェック状態は内部の markdown テキストに同期される（`- [ ] ` ↔ `- [x] `）
- PC側（RichTextEditor.tsx）にも同じ挙動を適用してよい（必要なら）

### 要件3: タグ追加・削除・既存タグ選択UI
- 既存タグを localStorage に保存し、次回以降に再利用できる
- タグ入力時、既存タグの候補をドロップダウンまたはサジェスト形式で表示する
- タグを選ぶだけで追加できる（タイプ不要）
- タグの削除は現行通り（×ボタン）で動作
- 保存キー: `fusen_known_tags`（localStorage）
- 送信時・保存時に使用済みタグをマージして保存する

### 要件4: PCへの送信を5秒以内に高速化
**現状の問題:**
- `getAppFolderId` が毎回 Drive API 1回分のオーバーヘッドを追加（キャッシュなし）
- 画像アップロードが逐次（`for...of` + `await`）
- `fusen_from_iphone.json` と `saveToHistory` が逐次（各3回 API 呼び出し）
- PCポーリング間隔: 30秒 → 最悪30秒待ち

**修正方針:**
- フォルダIDをモジュール変数にキャッシュ（`let cachedFolderId: string | null = null`）
- 画像アップロードを `Promise.all` で並列化
- `fusen_from_iphone.json` と `saveToHistory` を `Promise.all` で並列化
- PCポーリング間隔を 30秒 → 5秒に短縮（Drive API 制限は余裕あり）

</decisions>

<specifics>
## Specific Ideas

### チェックボックス行頭挿入の実装（参考: RichTextEditor.tsx の toggleCheckbox）
contenteditable では Range API を使って現在行の先頭を取得し、そこに `- [ ] ` を挿入する。
具体的には：
1. `window.getSelection()` で現在の Range を取得
2. Range の startContainer を辿って行頭テキストノードを特定
3. Range を行頭に移動してから `insertTextAtCursor` を呼ぶ

### インタラクティブチェックボックスの実装
`hydrateEditor` 時と入力監視時に `- [ ] ` / `- [x] ` を `<input type="checkbox">` に変換。
チェックボックスの `change` イベントで DOM の markdown を更新。
`getMarkdown` 関数でチェックボックスを `- [ ] ` / `- [x] ` に逆変換。

### タグサジェストUI
- 既存タグをバッジ形式で表示（タグバーの上部または入力フィールドの下）
- 最大10件程度表示、入力に応じてフィルタリング
- タップで即追加

### Drive API キャッシュ
フォルダIDは有効で変わらないためセッション中キャッシュして問題なし。
ページリロード（再ログイン）時に自動クリアされる。

</specifics>

<deferred>
## Deferred Ideas

- PC側チェックボックストグルのインタラクティブ対応（必要なら次フェーズで）
- APNs プッシュ通知で即時起動（コスト・複雑性が高い）
- タグの利用頻度順ソート

</deferred>

---

*Phase: 10-pc-notes-to-list（実質: iPhone UX改善 + 送信高速化）*
*Context gathered: 2026-04-03 via ユーザー直接収集*
