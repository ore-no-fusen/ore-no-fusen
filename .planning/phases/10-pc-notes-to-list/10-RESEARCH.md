# Phase 10: iPhone UX改善 + 送信高速化 - Research

**Researched:** 2026-04-03
**Domain:** contenteditable Range API / Drive API キャッシュ / Rust tokio interval
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**要件1: チェックボックス行頭挿入（iPhone）**
- チェックボックスボタンを押したとき、カーソル位置ではなく行頭に `- [ ] ` を挿入する
- 行の途中でボタンを押した場合も行頭に挿入する
- `insertTextAtCursor('- [ ] ')` を「行頭に移動してから挿入」するロジックに変更

**要件2: 編集画面でチェックボックスをトグル可能にする**
- contenteditable エディタ内で `- [ ] ` / `- [x] ` を実際の `<input type="checkbox">` としてレンダリングする
- チェックボックスをクリックするとリアルタイムにON/OFFが切り替わる
- チェック状態は内部の markdown テキストに同期される（`- [ ] ` ↔ `- [x] `）

**要件3: タグ追加・削除・既存タグ選択UI**
- 既存タグを localStorage に保存し、次回以降に再利用できる
- タグ入力時、既存タグの候補をドロップダウンまたはサジェスト形式で表示する
- タグを選ぶだけで追加できる（タイプ不要）
- タグの削除は現行通り（×ボタン）
- 保存キー: `fusen_known_tags`（localStorage）
- 送信時・保存時に使用済みタグをマージして保存する

**要件4: PCへの送信を5秒以内に高速化**
- フォルダIDをモジュール変数にキャッシュ（`let cachedFolderId: string | null = null`）
- 画像アップロードを `Promise.all` で並列化
- `fusen_from_iphone.json` と `saveToHistory` を `Promise.all` で並列化
- PCポーリング間隔を 30秒 → 5秒に短縮

### Claude's Discretion
（なし — 4要件はすべて仕様として確定済み）

### Deferred Ideas (OUT OF SCOPE)
- PC側チェックボックストグルのインタラクティブ対応（次フェーズ以降）
- APNs プッシュ通知で即時起動（コスト・複雑性が高い）
- タグの利用頻度順ソート
</user_constraints>

---

## Summary

Phase 10 は `app/viewer/page.tsx`（iPhone PWA）と `src-tauri/src/lib.rs`（ポーリング間隔）の2ファイルのみを変更する。変更量は小さいが、contenteditable の Range API の扱い・`<input type="checkbox">` を contenteditable 内に埋め込む際の iOS 固有挙動・Drive API の呼び出し順序の変更という3つの独立した技術領域にまたがる。

既存コードを精査した結果、実装に必要なすべての基盤（`insertTextAtCursor`・`hydrateEditor`・`serializeEditor`・`insertNodeAtCursor`）はすでに `viewer/page.tsx` 内に定義されており、新規ヘルパーは最小限に抑えられる。

**Primary recommendation:** 4要件を独立した Wave に分け（01: チェックボックス行頭・02: インタラクティブ checkbox・03: タグサジェスト・04: 送信高速化）、各 Wave で単体テストを GREEN にしてから次へ進む。

---

## Standard Stack

### Core（変更なし・確認済み）
| 要素 | バージョン | 役割 |
|------|-----------|------|
| contenteditable div | Web標準 | iPhone エディタ基盤 |
| `window.getSelection()` / Range API | Web標準 | カーソル位置操作 |
| `localStorage` | Web標準 | タグ永続化 |
| `Promise.all` | Web標準 | 並列 Drive API 呼び出し |
| tokio::time::interval | tokio 1.x | Rust ポーリング間隔 |

### 変更箇所（確認済み行番号）

| ファイル | 行 | 現状 | 変更後 |
|----------|----|------|-------|
| `app/viewer/page.tsx` | 1023 | `insertTextAtCursor('- [ ] ')` | `insertCheckboxAtLineStart()` を呼ぶ |
| `app/viewer/page.tsx` | 89–148 | `hydrateEditor` でチェックボックスをテキストとして処理 | `- [ ] ` / `- [x] ` を `<input type="checkbox">` に変換 |
| `app/viewer/page.tsx` | 22–43 | `serializeEditor` でチェックボックスを未処理 | checkbox を `- [ ] ` / `- [x] ` に逆変換 |
| `app/viewer/page.tsx` | 1070–1087 | タグ入力フィールドのみ | 既存タグのバッジサジェストを追加 |
| `app/viewer/page.tsx` | 191–214 | `getAppFolderId` キャッシュなし | モジュール変数でキャッシュ |
| `app/viewer/page.tsx` | 1183–1185 | `for...of` 逐次アップロード | `Promise.all` で並列化 |
| `app/viewer/page.tsx` | 1187–1203 | `uploadWithAutoRefresh` → `saveToHistory` 逐次 | `Promise.all` で並列化 |
| `src-tauri/src/lib.rs` | 1826 | `Duration::from_secs(30)` | `Duration::from_secs(5)` |

---

## Architecture Patterns

### 要件1: チェックボックス行頭挿入

PC側（`RichTextEditor.tsx` の `insertCheckbox`）は CodeMirror API（`state.doc.lineAt(from)`）を使うため contenteditable では直接流用できない。contenteditable では Range API で行頭を取得する。

**実装パターン（Range API で行頭に移動）:**
```typescript
// viewer/page.tsx 内の新ヘルパー
function insertCheckboxAtLineStart(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);

  // カーソルのあるノードを辿り、親 div/span の行頭テキストノードを特定
  let node: Node = range.startContainer;
  // editorRef.current 直下の div/span まで遡る
  while (node.parentElement && !node.parentElement?.isEqualNode(editorRef.current)) {
    node = node.parentNode!;
  }
  // 行頭 Range を作り、そこに insertTextAtCursor を適用
  const headRange = document.createRange();
  headRange.setStart(node, 0);
  headRange.setEnd(node, 0);
  sel.removeAllRanges();
  sel.addRange(headRange);
  insertTextAtCursor('- [ ] ');
}
```

**注意:** `editorRef.current` は `insertCheckboxAtLineStart` の定義スコープ内にあるため、クロージャで自然に参照できる。外部から渡す必要はない。

**PC側の挙動との比較:**
- PC（CodeMirror）: `lineAt(from)` で行オブジェクトを取得 → `line.from` に `- [ ] ` を挿入
- iPhone（contenteditable）: Range で行頭ノードを特定 → カーソルを行頭に移動 → `insertTextAtCursor`

### 要件2: インタラクティブチェックボックス

contenteditable 内に `<input type="checkbox">` を埋め込む場合の既知の挙動：

**iOS Safari 固有挙動（MEDIUM confidence — 実機確認必要）:**
- `<input type="checkbox">` は contenteditable 内でも `click` イベントが発火する（Safari 16+）
- `contenteditable="true"` 属性の要素内でチェックボックスをクリックすると、デフォルトでは DOM の `checked` 状態は変わるが、テキスト入力フォーカスが移動する場合がある
- `e.preventDefault()` を checkbox の `click` ハンドラで呼ぶと checked が変わらないため、`mousedown` で `e.preventDefault()` し `click` で状態更新するのが安全なパターン

**`hydrateEditor` での変換方針（確認済み）:**
既存の `hydrateEditor` は行ごとに `span + br` を作成している（行 141–146）。チェックボックス行だけ `<input type="checkbox">` を含む要素に差し替える：

```typescript
// hydrateEditor 内の追加分岐
const checkMatch = line.match(/^- \[([ x])\] (.*)$/);
if (checkMatch) {
  const checked = checkMatch[1] === 'x';
  const text = checkMatch[2];
  const wrapper = document.createElement('span');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.style.cssText = 'margin-right:4px;pointer-events:auto;';
  // click でも checked は自動更新されるが、iOS では mousedown preventDefault が必要
  cb.addEventListener('mousedown', (e) => e.preventDefault());
  cb.addEventListener('change', () => {
    // DOM 内のチェック状態は自動反映済み。serializeEditor が逆変換する。
  });
  const textNode = document.createTextNode(text);
  wrapper.appendChild(cb);
  wrapper.appendChild(textNode);
  el.appendChild(wrapper);
  el.appendChild(document.createElement('br'));
  i++;
  continue;
}
```

**`serializeEditor` での逆変換:**
既存の `serializeEditor` は TEXT_NODE と Element を再帰的にウォークする（行 22–43）。`<input type="checkbox">` は Element だが現在は未処理。追加が必要：

```typescript
// serializeEditor の walk 関数内に追加
if (node.tagName === 'INPUT' && (node as HTMLInputElement).type === 'checkbox') {
  return (node as HTMLInputElement).checked ? '- [x] ' : '- [ ] ';
}
```

**contenteditable + checkbox の IME 問題:**
日本語入力（IME）が進行中に checkbox をクリックしても IME セッションが終了する動作は iOS では通常発生しない（IME は `compositionstart/end` イベントで管理）。checkbox は IME の影響外。問題なし。

### 要件3: タグサジェストUI

**localStorage スキーマ:**
- キー: `fusen_known_tags`
- 値: `JSON.stringify(string[])` — 重複なし配列
- 更新タイミング: 「iPhoneに置いておく」と「PCに送る」の両ボタン押下時、送信処理の前に `mergeKnownTags(writeTags)` を呼ぶ

**サジェスト表示方針:**
- タグ入力フィールド（`<input>`）に `onChange` でフィルタリング
- 既存タグバッジを入力フィールドの下に最大10件表示
- タップで `writeTags` に追加、フィールドをクリア
- 入力が空のとき全件表示（最大10件）

**実装パターン:**
```typescript
// モジュール外（またはコンポーネント外）に追加
function loadKnownTags(): string[] {
  try {
    return JSON.parse(localStorage.getItem('fusen_known_tags') || '[]');
  } catch { return []; }
}
function mergeKnownTags(newTags: string[]): void {
  const known = loadKnownTags();
  const merged = Array.from(new Set([...known, ...newTags]));
  localStorage.setItem('fusen_known_tags', JSON.stringify(merged));
}
```

**UI 配置:** 既存タグバー（行 1053–1088）の `<input>` の下に候補リストを絶対配置 (`position: absolute`) するか、または `<input>` の後ろにインラインバッジとして並べる。絶対配置は iOS でスクロール位置のずれが起きやすいため、インラインバッジ形式（フィルタリング済み候補を横並び）が安全。

### 要件4: 送信高速化

**現在の送信フロー（確認済み — 行 1154–1230）:**

```
1. refreshAccessToken (任意・期限切れ時のみ)
2. for...of capturedBlobs: uploadImageWithAutoRefresh (逐次)   ← 改善
3. uploadWithAutoRefresh(fusen_from_iphone.json)               ← 改善
4. saveToHistory(token, note)                                   ← 改善
5. deleteDraft (任意・currentDraftId あり時)
```

**高速化後のフロー:**
```
1. refreshAccessToken (任意)
2. cachedFolderId キャッシュを使用 (getAppFolderId は最初の1回のみ Drive API 呼び出し)
3. Promise.all([...画像アップロード]) で並列化
4. Promise.all([uploadWithAutoRefresh(json), saveToHistory]) で並列化
5. deleteDraft (任意)
```

**フォルダIDキャッシュ（モジュール変数）:**
```typescript
// page.tsx の先頭付近（関数定義の外）に追加
let cachedFolderId: string | null = null;

// getAppFolderId を修正
async function getAppFolderId(accessToken: string): Promise<string | null> {
  if (cachedFolderId) return cachedFolderId;
  // ... 既存ロジック ...
  cachedFolderId = result; // 取得した ID をキャッシュ
  return cachedFolderId;
}
```

**ページリロード時のキャッシュクリア:** モジュール変数のためページリロード（再ログイン）で自動クリアされる。手動クリア不要。

**saveToHistory が引数に `token` を受け取るため:** `Promise.all` で並列化する際、両方とも同じ有効な `token` を使えば問題なし。`saveToHistory` は内部で `uploadWithAutoRefresh` を呼ぶため自動リフレッシュも動作する。

**Rust ポーリング間隔変更箇所（確認済み — lib.rs 行 1826）:**
```rust
// 変更前
tokio::time::interval(std::time::Duration::from_secs(30));
// 変更後
tokio::time::interval(std::time::Duration::from_secs(5));
```

**Drive API quota 計算（確認済み — STATE.md より）:**
- 現在: 30秒間隔 = 2 req/min = 2,880 req/day → quota の 0.3% 以下
- 変更後: 5秒間隔 = 12 req/min = 17,280 req/day → quota の 1.7%（余裕あり）

---

## Don't Hand-Roll

| 問題 | 作らない | 使う | 理由 |
|------|---------|------|------|
| 行頭ノードの特定 | DOM ツリーを独自再帰 | `while (parentElement !== editorRef.current)` の単純ループ | 構造が浅いため再帰不要 |
| タグ候補フィルタリング | 独自検索エンジン | `string.includes()` + `Array.filter()` | 件数が10件以下 |
| Drive API 並列 | カスタムキュー | `Promise.all()` | Web標準で十分 |

---

## Common Pitfalls

### Pitfall 1: contenteditable 内の Range が editorRef 外を指す
**何が起きるか:** カーソルが contenteditable の外（例: タグ入力フィールド）にある状態でチェックボックスボタンを押すと、`window.getSelection()` が外の input を指す場合がある。
**防止:** `insertCheckboxAtLineStart` の先頭で `editorRef.current?.contains(range.commonAncestorContainer)` を確認し、editorRef 外なら `editorRef.current?.focus()` してから処理。

### Pitfall 2: serializeEditor が checkbox の `- [ ] ` を二重に出力
**何が起きるか:** checkbox の `wrapper` span が `textContent` を持つとき、walk 関数が span の子を再帰処理した際に `input` と `textNode` を別々に処理して `- [ ] text` + `text` になる。
**防止:** `serializeEditor` の walk で `INPUT[type=checkbox]` の先にタッチする前に INPUT を先にチェックして return する。walk の順序（INPUT を TEXT_NODE の前にチェック）が重要。

### Pitfall 3: `Promise.all` で saveToHistory が先に書き込み、fusen_from_iphone.json が後になる
**影響:** PC 側はポーリングで `fusen_from_iphone.json` を読むため、履歴への書き込み順序はどちらが先でも問題なし。並列化しても副作用なし。

### Pitfall 4: フォルダIDキャッシュとトークンリフレッシュの競合
**何が起きるか:** `cachedFolderId` はトークン（`accessToken`）に紐付かない。トークンが別ユーザーに変わった場合（Google アカウント変更）にフォルダIDが古いままになる。
**防止:** 今回のユースケースでは1ユーザー固定のため問題なし。ページリロードで自動クリアされるため十分。

### Pitfall 5: iOS Safari でのチェックボックス `change` イベントの遅延
**何が起きるか:** iOS Safari 16 以前では `<input type="checkbox">` の `change` イベントが contenteditable 内でブロックされることがある報告がある。
**対策:** `change` の代わりに `click` イベントを使い、`cb.checked` を直接読む（`click` は iOS Safari でも確実に発火する）。

---

## Code Examples

### hydrateEditor: チェックボックス行の変換
```typescript
// Source: viewer/page.tsx 内（既存の hydrateEditor を拡張）
const checkMatch = line.match(/^- \[([ x])\] (.*)$/);
if (checkMatch) {
  const checked = checkMatch[1] === 'x';
  const text = checkMatch[2];
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-checkbox-line', '');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.style.cssText = 'margin-right:4px;pointer-events:auto;vertical-align:middle;';
  cb.addEventListener('mousedown', (e) => e.preventDefault()); // iOS フォーカス移動防止
  cb.addEventListener('click', () => { /* serializeEditor が change を拾う */ });
  const textNode = document.createTextNode(text);
  wrapper.appendChild(cb);
  wrapper.appendChild(textNode);
  el.appendChild(wrapper);
  el.appendChild(document.createElement('br'));
  i++;
  continue;
}
```

### serializeEditor: INPUT[checkbox] の逆変換
```typescript
// Source: viewer/page.tsx 内（既存の walk 関数に追加）
if (node instanceof HTMLInputElement && node.type === 'checkbox') {
  return node.checked ? 'x' : ' '; // 呼び出し元で '- [' + result + '] ' + sibling を組む
}
// または wrapper span を data-checkbox-line 属性で識別する方式:
if (node instanceof Element && node.hasAttribute('data-checkbox-line')) {
  const cb = node.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  const text = node.textContent?.replace(/^\s*/, '') ?? '';
  return `- [${cb?.checked ? 'x' : ' '}] ${text}`;
}
```

### フォルダIDキャッシュ
```typescript
// Source: viewer/page.tsx（モジュールスコープ）
let cachedFolderId: string | null = null;

async function getAppFolderId(accessToken: string): Promise<string | null> {
  if (cachedFolderId !== null) return cachedFolderId;
  // ... 既存の fetch + create ロジック ...
  cachedFolderId = result;
  return cachedFolderId;
}
```

### 送信並列化
```typescript
// 画像並列アップロード
await Promise.all(
  Array.from(capturedBlobs.entries()).map(([fileName, file]) =>
    uploadImageWithAutoRefresh(token, file, fileName)
  )
);

// JSON書き込み + 履歴保存の並列化
const note: IphoneNote = { ... };
await Promise.all([
  uploadWithAutoRefresh(token, 'fusen_from_iphone.json', { id: noteId, title, body: fullBody, sent_at: sentAt, tags: capturedTags }),
  saveToHistory(token, note),
]);
```

---

## Validation Architecture

> nyquist_validation: true — このセクションを含める

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (vitest.config.ts) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run app/viewer/__tests__/page.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| 要件 | 振る舞い | テスト種別 | 自動コマンド | ファイル存在 |
|------|---------|-----------|-------------|------------|
| REQ-CB-LINE | チェックボックスボタン押下で `- [ ] ` が行頭に挿入される | unit | `npx vitest run app/viewer/__tests__/page.test.tsx -t "行頭挿入"` | ❌ Wave 0 |
| REQ-CB-TOGGLE | contenteditable 内の checkbox をクリックで ON/OFF が切り替わる | unit | `npx vitest run app/viewer/__tests__/page.test.tsx -t "チェックボックストグル"` | ❌ Wave 0 |
| REQ-CB-SERIALIZE | serializeEditor が checkbox DOM を `- [ ] ` / `- [x] ` に逆変換する | unit | `npx vitest run app/viewer/__tests__/page.test.tsx -t "serializeEditor"` | ❌ Wave 0 |
| REQ-CB-HYDRATE | hydrateEditor が `- [ ] text` を checkbox DOM に変換する | unit | `npx vitest run app/viewer/__tests__/page.test.tsx -t "hydrateEditor"` | ❌ Wave 0 |
| REQ-TAG-SUGGEST | knownTags から候補をフィルタリング・表示する | unit | `npx vitest run app/viewer/__tests__/page.test.tsx -t "タグサジェスト"` | ❌ Wave 0 |
| REQ-TAG-PERSIST | 送信・保存時に fusen_known_tags が localStorage に書き込まれる | unit | `npx vitest run app/viewer/__tests__/page.test.tsx -t "タグ永続化"` | ❌ Wave 0 |
| REQ-SEND-PARALLEL | Promise.all で画像・JSON・履歴が並列呼び出しされる | unit | `npx vitest run app/viewer/__tests__/page.test.tsx -t "並列送信"` | ❌ Wave 0 |
| REQ-FOLDER-CACHE | 2回目の getAppFolderId は Drive API を呼ばない | unit | `npx vitest run app/viewer/__tests__/page.test.tsx -t "フォルダキャッシュ"` | ❌ Wave 0 |
| REQ-RUST-INTERVAL | Rust ポーリング間隔が 5秒になっている | manual | PCアプリを実ビルドして Drive にノートを送り、5秒以内に受信確認 | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run app/viewer/__tests__/page.test.tsx`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/viewer/__tests__/page.test.tsx` — Phase 09 のスタブが存在するが Phase 10 の 8 要件（上表）のスタブを追記する必要がある
- [ ] `serializeEditor` / `hydrateEditor` / `insertCheckboxAtLineStart` / `mergeKnownTags` をテスト対象としてエクスポートする必要がある（現在は非エクスポート内部関数）

---

## State of the Art

| 旧アプローチ | 現アプローチ | 変更理由 |
|------------|------------|---------|
| `insertTextAtCursor('- [ ] ')` で現在位置に挿入 | `insertCheckboxAtLineStart()` で行頭に挿入 | PC側との挙動統一 |
| `hydrateEditor` でチェックボックスをプレーンテキスト表示 | `<input type="checkbox">` でインタラクティブ表示 | 編集中にトグルできる |
| `for...of` 逐次画像アップロード | `Promise.all` 並列 | 送信時間短縮 |
| `getAppFolderId` 毎回 Drive API 呼び出し | モジュール変数でセッション中キャッシュ | API 呼び出し削減 |
| ポーリング 30秒 | ポーリング 5秒 | 最悪待ち時間を 30秒 → 5秒に短縮 |

---

## Open Questions

1. **iOS Safari でのチェックボックス `mousedown` + `e.preventDefault()` の動作**
   - 既知: iOS Safari 15 以降では contenteditable 内 `<input>` の `mousedown` preventDefault でキーボード非表示化を防げる場合がある
   - 不明: 最新 iOS 17/18 での具体的な挙動（実機確認が必要）
   - 対処: Wave 0 テストは jsdom（PC環境）でパスを確認。実機テストは REQ-RUST-INTERVAL と同様に実機確認タスクとして分離

2. **`serializeEditor` での wrapper span 識別方法**
   - 方法A: `data-checkbox-line` 属性でラッパーを識別し、span 単位で `- [x] text` を返す
   - 方法B: `INPUT[type=checkbox]` と隣接 textNode を個別に処理
   - 推奨: 方法A（ラッパー span を atomic に扱うため入れ子ウォークが単純になる）

---

## Sources

### Primary (HIGH confidence)
- `app/viewer/page.tsx` 直接読み込み — 全ヘルパー関数・state・送信フローを確認
- `src-tauri/src/lib.rs` 行 1822–1832 — ポーリング間隔の実装箇所を確認
- `app/components/RichTextEditor.tsx` 行 565–593 — `insertCheckbox` の PC側実装を確認
- `vitest.config.ts` — テストフレームワーク設定を確認

### Secondary (MEDIUM confidence)
- MDN Web Docs（training data）: `window.getSelection()`, `Range`, `contenteditable` + `<input>` 挙動
- iOS Safari 既知の contenteditable + interactive element の挙動（実機確認推奨）

### Tertiary (LOW confidence)
- iOS Safari での `mousedown` + `preventDefault` による checkbox フォーカス制御（実機確認必要）

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — コードを直接確認
- Architecture: HIGH — 既存コードベースの構造が明確
- contenteditable + checkbox iOS 挙動: MEDIUM — 実機確認が必要な部分あり
- Pitfalls: MEDIUM — contenteditable iOS 固有挙動は実機確認依存

**Research date:** 2026-04-03
**Valid until:** 2026-05-03（安定スタック）
