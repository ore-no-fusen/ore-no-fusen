# フロントエンド レビューノート（Plan 02）

## STAB-01: Listener リーク確認

### listen() 呼び出し一覧

| # | useEffect | イベント | フラグパターン | wrapUnlisten | 問題 |
|---|-----------|---------|--------------|--------------|------|
| 1 | move/resize リスナー | `tauri://move`, `tauri://resize` | `isMounted` | あり（`wrapUnlisten` ラッパー使用） | なし |
| 2 | クローズリスナー | `onCloseRequested` | `isMounted` | あり（同上） | なし |
| 3 | Alt+Tab フォーカスリスナー | `tauri://focus` | なし（deps=`[]`） | あり（cleanup で `unlisten?.()` + `.catch`） | なし（一度だけ登録、アンマウントで確実に解除） |
| 4 | プール昇格リスナー | `fusen:promote_from_pool` | `mounted` フラグ | **wrapUnlisten なし（`u()` 直接呼び出し）** | Open Question 1 参照 → **問題なし** |
| 5 | リロードリスナー | `fusen:reload_note` | `cancelled` フラグ | あり（`wrapUnlisten` ラッパー使用） | なし |
| 6 | 全文検索スクロールリスナー | `fusen:scroll_to_line` | `cancelled` フラグ | あり（同上） | なし |

**パターン整合性の評価:**
- `isMounted` パターン（#1, #2）: async setup の resolve 後に `if (isMounted)` でフラグチェック、cleanup で `isMounted=false` を先行設定 → 解除漏れなし
- `mounted` パターン（#4）: resolve 後に `if (!mounted) { u(); return; }` → Strict Mode のダブルsetup を含め正しく処理
- `cancelled` パターン（#5, #6）: resolve 後に `if (cancelled)` でフラグチェック、cleanup で `cancelled=true` + `safeUnlisten` → 解除漏れなし
- `[]` deps パターン（#3）: `unlisten` 変数は `let unlisten: (() => void) | null = null;` で宣言。cleanup で `unlisten?.()` + `.catch` → 一度だけ登録で問題なし

**確認結果: STAB-01 充足**

---

### Open Question 1: isPool の u() 直接呼び出し

**コード（StickyNote.tsx L631-638）:**
```typescript
if (!mounted) { u(); return; }
unlisten = u;
// ...
return () => {
    mounted = false;
    if (unlisten) unlisten();
};
```

**判定: 問題なし**

理由:
- `u` は `await thisWin.listen(...)` の解決値であり、Tauri v2 の `WebviewWindow.listen()` が返す unlisten 関数は **同期関数**（`() => void` 型）。
- Tauri v2 の型定義: `listen<T>(event, handler): Promise<UnlistenFn>` であり、`UnlistenFn = () => void`（同期）。
- したがって `u()` の呼び出しは Promise を返さず、`.catch()` なしでも未捕捉 Promise エラーは発生しない。
- `wrapUnlisten` ラッパーは念のため `p.catch` のケアをしているが、`u()` 直接呼び出しでも動作上の問題はない。
- ただし、他のリスナーが `wrapUnlisten` を使用しているのに対して #4 だけ直接呼び出しの **スタイル不統一** がある（低優先度の改善候補）。

---

## DATA-01: 空body上書きガード確認

### hasLoadedRef ガード（useNoteFile.ts L55, L160, L111）

**初期化:**
```typescript
const hasLoadedRef = useRef(isNew);
// isNew=true（新規ノート）→ 初期値 true（保存ブロック不要）
// isNew=false（既存ノート）→ 初期値 false（ロード完了まで保存ブロック）
```

**ガード 1 - autoSave ブロック（L160）:**
```typescript
if (!hasLoadedRef.current) return; // ロード完了前の auto-save をブロック
```

**ガード 2 - saveNoteContent ブロック（L111-115）:**
```typescript
if (!hasLoadedRef.current && body.trim() === '') {
    throw new Error('BLOCKED: Attempted to save empty body before first successful load.');
}
```

**ガード 3 - 二重チェック（L119-123）:**
```typescript
if (body.trim() === '' && !frontmatter) {
    throw new Error('BLOCKED: Attempted to save empty content and empty frontmatter.');
}
```

- ガード 2: `hasLoadedRef=false` かつ `body` が空の場合にブロック（H-1 メイン修正）
- ガード 3: frontmatter が存在する場合は空 body 保存を許可（意図的な空ノート作成を妨げない設計）
- loadNote 成功時に `hasLoadedRef.current = true` をセット → 以降の autoSave が有効化される

**reload_note ハンドラの空 body スキップ（StickyNote.tsx L664-668）:**
```typescript
const body = await loadNote();
if (!body) {
    console.error('[StickyNote] reload_note: loadNote returned empty, skipping...');
    return;
}
```

C-2 修正が正しく実装されており、`loadNote()` が空文字を返した場合は `setContent` / `setEditBody` を呼ばない。

**確認結果: DATA-01 充足**

---

## DATA-02: 競合状態確認

### autoSave deps（useNoteFile.ts L192）

```typescript
}, [path, savePending, content, rawFrontmatter, saveNoteContent]);
```

- `savePending` が `true` になった時のみ実行（L159: `if (!path || !savePending || !content) return`）
- `content` / `rawFrontmatter` は実際に保存する値なので deps に含まれること自体は適切
- `saveNoteContent` は `onPathChange` のみに依存する `useCallback`（安定）
- 再実行トリガーとして `content` が含まれるが、`savePending=false` の間は早期 return するため不要な保存は走らない

**不必要な再実行リスク評価:** 低。`savePending` ガードが機能しているため、`content` 変化でフォーカスが外れても autoSave は発火しない。

### cancelled フラグ（loadNote 非同期処理）

loadNote 自体は `useCallback` で定義されており、アンマウント後のキャンセルフラグを内部に持たない。ただし以下の理由で問題なし:
- loadNote は初期化 useEffect（`[urlPath, isNew]`）の中で一度だけ呼ばれる
- React Strict Mode のダブル実行ケースは `hasInitializedRef.current` でガード済み
- loadNote 完了後の `setContent` / `setRawFrontmatter` は アンマウント後でも React 18 では no-op（警告は出るが機能は壊れない）

### Open Question 2: useEditMode の startEditing が initialContent に依存

**コード（useEditMode.ts L77-90）:**
```typescript
const startEditing = useCallback((cursorPos?, coords?) => {
    if (isEditing) { return; }
    // ...
    setEditBodyAndRef(initialContent);
    // ...
}, [isEditing, initialContent]);
```

**判定: 問題あり（低優先度）**

シナリオ:
1. 既存ノート読み込み中（`content=''`）にイベント等で `startEditing` が呼ばれた場合
2. その時点の `initialContent` は空文字列（`useNoteFile` の `content` 初期値が `''`）
3. `setEditBodyAndRef('')` が実行され、エディタが空になる

**実際の影響評価:**
- 通常フロー: 初期化 useEffect でロード完了後 `setEditBody(body)` が明示的に呼ばれる（StickyNote.tsx L401）
- プールウィンドウ: `isPool=true` の間は `startEditing` は呼ばれず、`fusen:promote_from_pool` 受信後に `startEditing()` を呼ぶ。この時点では content はすでに設定済み
- ユーザー操作（クリック）による `startEditing`: ロード完了後にのみ UI が表示されるため空 content のリスクは低い
- **総合判定: 理論上のリスクは存在するが、実用上は現在のフローで防がれている。要改善（低優先度）**

**確認結果: DATA-02 充足（残存リスク低優先度あり）**

---

## UI-01: isNewNote カーソル位置確認

### isNewNote state フロー

**新規作成時（setIsNewNote(true) パス）:**
1. StickyNote.tsx L381: `setIsNewNote(isNew)` — URL パラメータ `isNew=true` で `true` をセット
2. RichTextEditor に `isNewNote={isNewNote}` として伝達
3. RichTextEditor.tsx L1222-L1240: `if (isNewNote)` ブロック内でカーソル位置を 0 に設定
   - `requestAnimationFrame(doFocus)` + `setTimeout(doFocus, 50)` + `setTimeout(doFocus, 150)` + `setTimeout(doFocus, 300)` の4段階
4. StickyNote.tsx L388-391: `setTimeout(() => { editorRef.current?.focusAndSelectFirstLine(); }, 100)` でフォーカス

**再編集時（setIsNewNote(false) パス）:**
- StickyNote.tsx L1415: ダブルクリックハンドラ冒頭で `setIsNewNote(false)` を実行（修正済み）
- これにより RichTextEditor は再マウントせず、`isNewNote` prop が `false` になる
- RichTextEditor のエディタインスタンスは `deps=[]` の useEffect で一度だけ作成されるため、`isNewNote` prop の変化による再初期化は起きない
- 再編集時の `startEditing` は `cursorPos` / `coords` を使ったカーソル配置（L88-89）が適用される

**整合性確認:**
- 新規作成: `isNewNote=true` → RichTextEditor 初期化時（`deps=[]`）に一度だけカーソル 0 固定が実行される
- 再編集: `isNewNote=false` に変化しても RichTextEditor のエディタインスタンスは破棄されない（`deps=[]`）ため、50/150/300ms タイマーは**再実行されない**

**確認結果: UI-01 充足**

---

## パフォーマンス（低優先）

### Open Question 3: isHover deps の深刻度判定

**コード（StickyNote.tsx L1087-L1129）:**
```typescript
useEffect(() => {
    const handleGlobalPointer = (e: PointerEvent) => {
        // ...
        if (!isInside && isHover) {
            setIsDraggableArea(false);
        } else if (isInside) { /* ... */ }
    };
    window.addEventListener('pointermove', handleGlobalPointer);
    // ...
    return () => { window.removeEventListener('pointermove', handleGlobalPointer); };
}, [isHover]);
```

**判定: 深刻度 低**

理由:
- `isHover` の変化は付箋のマウスオーバー/アウト時のみ発生（頻度は低い）
- `pointermove` リスナーの再登録コストは removeEventListener + addEventListener のみ
- `handleGlobalPointer` 内の `setIsHover` 呼び出しはコメントアウトされており、`isHover` state は React のネイティブイベント（`onMouseEnter`/`onMouseLeave`）で管理されている
- `isHover` は `pointermove` ハンドラ内で変化しないため、ポインタ移動中に deps が変化してリスナーが再登録されるという悪循環は起きない
- `handleGlobalPointer` で実際に変化させるのは `isDraggableArea` のみ

**要改善候補（低優先）:** `isHover` を deps に含める必要はなく、`useRef` で最新値を参照するパターンに変更することでリスナーの再登録を完全にゼロにできる。ただし現状でも動作上の問題はない。

---

## 総合評価

| 要件 | 充足状況 | 残存リスク |
|------|---------|-----------|
| STAB-01: Listener リーク | 充足 | wrapUnlisten スタイル不統一（低優先） |
| DATA-01: 空body上書き | 充足 | なし |
| DATA-02: 競合状態 | 充足 | startEditing の initialContent 依存（低優先） |
| UI-01: カーソル位置 | 充足 | なし |

## Open Questions 結論まとめ

| # | 質問 | 結論 |
|---|------|------|
| 1 | isPool の u() 直接呼び出し | 問題なし（UnlistenFn は同期関数、Promise ではない） |
| 2 | startEditing の initialContent 依存 | 理論上リスクあり、実用上は現フローで防止済み（低優先） |
| 3 | handleGlobalPointer の isHover deps | 深刻度低（悪循環なし、リスナー再登録コストのみ） |

## Phase 2 修正対象リスト

**高優先度:** なし（すべて充足済み）

**低優先度（改善候補）:**
- `fusen:promote_from_pool` リスナーの `u()` 直接呼び出しを `wrapUnlisten` 統一
- `useEditMode.startEditing` の `initialContent` 依存を `ref` 化
- `handleGlobalPointer` の deps を `[]` + `isHoverRef` パターンに変更
