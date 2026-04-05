# Phase 9: iPhone付箋管理 - Research

**Researched:** 2026-04-01
**Domain:** Next.js PWA (viewer/page.tsx) — IndexedDB CRUD, React state, contenteditable hydration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**変更ファイル**: `app/viewer/page.tsx` のみ（Rust・app/page.tsx は変更不要）

**バグ修正（最優先）**
- 一覧タップ時、`step === 'history'` のため `editorRef.current` が null → `hydrateEditor` が空振り
- **修正方針**: `pendingHydrate: { markdown: string; blobMap: Map<string, File> } | null` state を追加
- 一覧タップ時: `setPendingHydrate(...)` → `setStep('write')` の順に呼ぶ
- write ステップの `useEffect` で `pendingHydrate` があれば `hydrateEditor` を呼んでクリア

**保存・更新フロー**
- `currentDraftId` が存在する場合 → IndexedDB の既存レコードを上書き（put）
- `currentDraftId` が null の場合 → 新規作成（add）
- 「iPhoneに置いておく」ボタンの動作を上記で分岐させる

**一覧画面リニューアル**
- 「履歴」→「一覧」に名称変更
- 右上に「＋」ボタンを追加: エディタをクリアして `currentDraftId=null` にして `setStep('write')`
- 各ノートに削除ボタン（ゴミ箱アイコン）を追加: IndexedDB から削除 → 一覧を再取得
- 削除確認ダイアログは不要（シンプルに即削除）

**送信フロー維持**
- 「PCに送る」は現状通り動作させる
- 送信後: IndexedDB の下書きを削除（currentDraftId があれば）

**UIポリッシュ**
- 一覧が空の場合: 「付箋がありません。＋で新規作成」メッセージを表示
- 削除中・保存中のローディング状態は既存の isLoading を流用

### Claude's Discretion
- 削除ボタンのスタイル: ゴミ箱アイコン（🗑️ またはテキスト「削除」）、赤系hover
- 「＋」ボタンの位置: ヘッダー右端
- pendingHydrate の型定義: ファイル先頭付近に型エイリアスとして定義

### Deferred Ideas (OUT OF SCOPE)
- 削除確認ダイアログ（シンプルさ優先で即削除）
- 並び替え・検索機能
- 送信済みノートのiPhone内編集後PC再送信フロー（既存で動作しているが、再送信後の下書き削除の挙動は既存通り）
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IPHONE-MGT-01 | 一覧からノートをタップするとエディタに内容が正しく読み込まれる（現バグ修正） | pendingHydrate パターンで解決。write ステップ移行後に useEffect でエディタをハイドレート |
| IPHONE-MGT-02 | 「iPhoneに置いておく」で既存下書きは上書き保存・新規は新規作成される | saveDraft は既に `put(draft, draft.id)` を使用。currentDraftId の有無で分岐 |
| IPHONE-MGT-03 | 一覧画面に「＋」ボタンがあり、タップするとエディタをクリアして新規作成モードで開く | editorRef.current.innerHTML = '' → setCurrentDraftId(null) → setStep('write') |
| IPHONE-MGT-04 | 一覧から付箋を削除できる（IndexedDBから削除、一覧から消える） | 既存 deleteDraft(id) 関数を利用。削除後 historyNotes を再取得 |
| IPHONE-MGT-05 | 「PCに送る」は引き続き動作し、iPhone内の付箋をPCに送信できる | 既存の送信ロジックをそのまま維持。currentDraftId があれば送信後に deleteDraft も実行 |
</phase_requirements>

---

## Summary

Phase 9 は `app/viewer/page.tsx` の単一ファイルのみを対象とする。Rust・app/page.tsx は変更しない。

現在の `step='list'` 画面でノートをタップすると、`hydrateEditor` を呼ぶ時点では `editorRef.current` が null（`step='write'` のコンポーネントがまだマウントされていないため）というバグが存在する。CONTEXT.md が指定する `pendingHydrate` パターンで修正する。

保存フロー・一覧リニューアル・削除機能はすべて既存のヘルパー関数（`saveDraft` / `loadAllDrafts` / `deleteDraft`）を組み合わせて実現できる。新規ライブラリ・新規ヘルパー関数の追加は最小限に留める。

**Primary recommendation:** pendingHydrate state の追加と write ステップの useEffect を軸に実装する。それ以外の変更はすべて既存コードの拡張。

---

## Standard Stack

### Core（変更なし・既存のまま使用）

| 要素 | バージョン/場所 | 役割 |
|------|---------------|------|
| Next.js 14 App Router | app/viewer/page.tsx | PWA ホスト |
| React 18 useState/useEffect/useRef | 同上 | UI 状態管理 |
| IndexedDB (fusen-drafts) | openDraftsDB / saveDraft / loadAllDrafts / deleteDraft | 下書き永続化 |
| contenteditable div | editorRef | テキスト・画像・Mermaid 編集 |
| hydrateEditor() | 同上 | Markdown → DOM 復元 |
| serializeEditor() | 同上 | DOM → Markdown 変換 |

### 変更が必要な箇所

| 変更対象 | 現状 | Phase 9 後 |
|----------|------|-----------|
| `step` 型 | `'banner' \| 'login' \| 'push' \| 'ready' \| 'write' \| 'list' \| 'note'` | 変更なし |
| list ヘッダー「履歴」 | テキスト `履歴` | `一覧` に変更 |
| list ヘッダー「← 戻る」 | `setStep('write')` ボタン | `＋` ボタンに変更（右端）、左に「← 戻る」を残す or 削除（設計指示通り：左は削除して ＋ を右端） |
| list 各 li タップ | `hydrateEditor` を直接呼ぶ（バグ） | `setPendingHydrate` → `setStep('write')` |
| list 各 li | 削除ボタンなし | ゴミ箱ボタン追加 |
| 「iPhoneに置いておく」 | 常に新規 add + `currentDraftId=null` に設定 | `currentDraftId` があれば上書き put（実際は既に `saveDraft` が put のため OK） |
| 新規 state: `pendingHydrate` | なし | 追加 |

**Installation:** 追加パッケージなし。

---

## Architecture Patterns

### 核心パターン: pendingHydrate によるマウント後ハイドレート

**What:** 一覧→write 遷移時、editorRef はまだ null。`pendingHydrate` state にデータを格納し、write ステップの useEffect で editorRef が有効になった後に実行する。

**When to use:** step 変更と contenteditable への DOM 操作が交差するとき。

**Example:**
```typescript
// 型定義（ファイル先頭付近）
type PendingHydrate = {
  markdown: string;
  blobMap: Map<string, File>;
  draftId: string | null;
  tags: string[];
};

// state 宣言
const [pendingHydrate, setPendingHydrate] = useState<PendingHydrate | null>(null);

// list の onClick（バグ修正後）
onClick={async () => {
  // ... draft/sent ロード処理 ...
  setPendingHydrate({ markdown: fullText, blobMap, draftId: note.id, tags: note.tags ?? [] });
  setStep('write');
}}

// write ステップの useEffect（editorRef がマウントされた後に実行）
useEffect(() => {
  if (!pendingHydrate || !editorRef.current) return;
  hydrateEditor(editorRef.current, pendingHydrate.markdown, pendingHydrate.blobMap);
  setImageBlobs(pendingHydrate.blobMap);
  setCurrentDraftId(pendingHydrate.draftId);
  setWriteTags(pendingHydrate.tags);
  setShowTagBar(pendingHydrate.tags.length > 0);
  setPendingHydrate(null);
}, [pendingHydrate]);
// deps: [pendingHydrate] のみ。editorRef.current は deps に入れない（ref は変化を検知しない）
```

**注意:** `useEffect([pendingHydrate])` は step='write' に遷移してエディタがマウントされた後に実行されるが、`editorRef.current` が null のケースが残る可能性がある（初回レンダリングのタイミング）。Phase 8 で確立済みの `setTimeout 50ms` パターンを踏まえ、必要なら `setTimeout(50ms)` 内で `hydrateEditor` を呼ぶ方がより安全。

### 保存フロー: currentDraftId による新規/上書き分岐

```typescript
// 「iPhoneに置いておく」onClick
const draftId = currentDraftId ?? crypto.randomUUID();
await saveDraft({
  id: draftId,
  title,
  body,
  created_at: new Date().toISOString(),
  images: imagesArr,
  tags: writeTags,
});
setCurrentDraftId(draftId); // 新規作成の場合は ID をセット（次回保存で上書きになる）
setStep('list');
```

`saveDraft` の実装は `put(draft, draft.id)` であり、同 ID のレコードが既存なら上書き・なければ追加となる。新規/上書きの分岐は `draftId` の生成ロジックのみ。

### ＋ボタン（新規作成）

```typescript
// list ヘッダーの「＋」ボタン onClick
onClick={() => {
  if (editorRef.current) editorRef.current.innerHTML = '';
  setImageBlobs(new Map());
  setWriteTags([]);
  setShowTagBar(false);
  setTagInput('');
  setCurrentDraftId(null);
  setStep('write');
}}
```

ただし list ステップでは `editorRef.current` は null（write のコンポーネントがアンマウント中）。innerHTML クリアは write ステップ移行後に行う必要がある。解決策: `pendingHydrate` に `{ markdown: '', blobMap: new Map(), draftId: null, tags: [] }` をセットして useEffect で空クリアを実行。

### 削除パターン（IndexedDB + 一覧再取得）

```typescript
// list の li ゴミ箱ボタン onClick
onClick={async (e) => {
  e.stopPropagation(); // li の onClick（タップで編集）伝播を止める
  setIsLoading(true);
  try {
    if (note.status === 'draft') {
      await deleteDraft(note.id);
    }
    // 送信済みは IndexedDB に存在しないため deleteDraft 不要
    setHistoryNotes((prev) => prev.filter((n) => n.id !== note.id));
  } catch {
    // エラー無視（即削除のため）
  } finally {
    setIsLoading(false);
  }
}}
```

### Anti-Patterns to Avoid

- **editorRef を useEffect deps に含める:** ref.current は React の変化検知対象外。deps に入れても再実行されない。
- **step 遷移と DOM 操作を同一 callstack で行う:** step='write' への setState は非同期レンダリングをトリガーする。同 tick で editorRef.current を参照しても null のまま。
- **list ステップ中に editorRef を操作する:** list では write コンポーネントがアンマウントされており editorRef.current は null。

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB CRUD | 独自ストレージ | 既存 openDraftsDB / saveDraft / loadAllDrafts / deleteDraft | 全関数実装済み |
| エディタ DOM 操作 | 独自シリアライザ | 既存 hydrateEditor / serializeEditor | Phase 8 で実装・検証済み |
| タグ管理 | 独自 UI | 既存 writeTags / showTagBar / tagInput state | Phase 8 で実装済み |

---

## Common Pitfalls

### Pitfall 1: editorRef.current が null のまま hydrateEditor を呼ぶ
**What goes wrong:** list→write 遷移直後は write DOM がまだマウントされていない。hydrateEditor が空振りし、エディタが空のまま write 画面が開く。
**Why it happens:** React の setState は非同期。setStep('write') を呼んでも同 tick では DOM が生成されない。
**How to avoid:** pendingHydrate パターン（useEffect で watch） + 必要なら setTimeout 50ms。
**Warning signs:** タップ後に write 画面が空になる。console に editorRef.current = null のエラーが出る。

### Pitfall 2: 削除ボタンのタップが li の onClick（編集画面開く）を発火させる
**What goes wrong:** 削除ボタンをタップすると削除 + 編集画面遷移が両方起きる。
**Why it happens:** イベントバブリング。
**How to avoid:** `e.stopPropagation()` を削除ボタンの onClick の先頭で呼ぶ。

### Pitfall 3: 「iPhoneに置いておく」後に currentDraftId がリセットされない
**What goes wrong:** 新規作成して保存後、同一セッションで再編集するとまた新規 ID が付与され二重保存になる。
**Why it happens:** 現在の実装は保存後に `setCurrentDraftId(null)` している。setStep('list') に遷移するので問題ないが、将来的に list に戻らないフローを追加する場合は注意。
**How to avoid:** 保存後は `setCurrentDraftId(draftId)` で保存に使った ID を保持する（次回保存で上書きになる）。CONTEXT.md はこの点に明示的な指示なし → Claude's Discretion。

### Pitfall 4: list で送信済みノートの「削除」
**What goes wrong:** 送信済みノート（status='sent'）は IndexedDB に存在しない。`deleteDraft(note.id)` を呼ぶとエラーになるか、何もしない（IDBObjectStore.delete は存在しないキーでもエラーを投げない）。
**Why it happens:** sent ノートは Drive 上の `fusen_iphone_notes.json` に格納されており、IndexedDB には存在しない。
**How to avoid:** 削除ボタンは `note.status === 'draft'` のノートにのみ表示する（または sent ノートの削除は Drive への書き込みが必要なため今フェーズでは skip）。CONTEXT.md には「IndexedDB から削除」とのみ記載されており、sent ノートの Drive 側削除はスコープ外と解釈する。

---

## Code Examples

### pendingHydrate state の型定義と宣言
```typescript
// ファイル先頭付近（IphoneNote 型定義の近く）
type PendingHydrate = {
  markdown: string;
  blobMap: Map<string, File>;
  draftId: string | null;
  tags: string[];
};

// ViewerPage 内
const [pendingHydrate, setPendingHydrate] = useState<PendingHydrate | null>(null);
```

### write ステップの useEffect（pendingHydrate のトリガー）
```typescript
useEffect(() => {
  if (step !== 'write') return;
  if (!pendingHydrate) return;
  // editorRef.current がまだ null の場合は 50ms 後に再試行
  const run = () => {
    if (!editorRef.current) return;
    hydrateEditor(editorRef.current, pendingHydrate.markdown, pendingHydrate.blobMap);
    setImageBlobs(pendingHydrate.blobMap);
    setCurrentDraftId(pendingHydrate.draftId);
    setWriteTags(pendingHydrate.tags);
    setShowTagBar(pendingHydrate.tags.length > 0);
    setPendingHydrate(null);
  };
  const t = setTimeout(run, 50);
  return () => clearTimeout(t);
}, [step, pendingHydrate]);
```

### list タップ（バグ修正後）
```typescript
onClick={async () => {
  if (note.status === 'draft') {
    const draft = await loadDraft(note.id).catch(() => null);
    const blobMap = new Map<string, File>();
    if (draft?.images) {
      for (const { fileName, blob } of draft.images) {
        blobMap.set(fileName, new File([blob], fileName, { type: 'image/jpeg' }));
      }
    }
    const fullText = note.title ? `# ${note.title}\n\n${note.body ?? ''}` : (note.body ?? '');
    setPendingHydrate({ markdown: fullText, blobMap, draftId: note.id, tags: note.tags ?? [] });
  } else {
    const fullText = note.title ? `# ${note.title}\n\n${note.body ?? ''}` : (note.body ?? '');
    setPendingHydrate({ markdown: fullText, blobMap: new Map(), draftId: null, tags: note.tags ?? [] });
  }
  setStep('write');
}}
```

### ＋ボタン（新規作成）
```typescript
onClick={() => {
  setPendingHydrate({ markdown: '', blobMap: new Map(), draftId: null, tags: [] });
  setStep('write');
}}
```

### 削除ボタン（list の li 内）
```typescript
<button
  className="ml-auto p-2 text-gray-400 hover:text-red-500"
  aria-label="削除"
  onClick={async (e) => {
    e.stopPropagation();
    if (note.status !== 'draft') return; // sent は IndexedDB 対象外
    setIsLoading(true);
    try {
      await deleteDraft(note.id);
      setHistoryNotes((prev) => prev.filter((n) => n.id !== note.id));
    } finally {
      setIsLoading(false);
    }
  }}
>
  🗑️
</button>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| list→write で直接 hydrateEditor 呼ぶ | pendingHydrate + useEffect | Phase 9 (このフェーズ) | バグ修正・安定化 |
| 「履歴」 | 「一覧」 | Phase 9 (このフェーズ) | 名称変更のみ |
| 新規保存のみ対応 | currentDraftId で上書き対応 | Phase 9 (このフェーズ) | 編集フロー完成 |

---

## Open Questions

1. **「iPhoneに置いておく」後のステップ遷移**
   - What we know: 現在は保存後 `setStep('list')` で一覧に戻る
   - What's unclear: Phase 9 で変更するかどうか CONTEXT.md に記載なし
   - Recommendation: 現状維持（一覧に戻る）。step='write' に留まるパターンは Pitfall 3 を引き起こす可能性あり

2. **sent ノートの削除**
   - What we know: sent ノートは Drive の `fusen_iphone_notes.json` に存在する
   - What's unclear: 削除ボタンを sent ノートにも表示するか
   - Recommendation: CONTEXT.md に「IndexedDB から削除」と明記されているため、draft のみ削除ボタンを表示。sent ノートには削除ボタンを非表示にする。

3. **pendingHydrate の useEffect deps**
   - What we know: `[step, pendingHydrate]` で十分
   - What's unclear: step を deps に含めると step='list' でも実行され無駄な処理が走る
   - Recommendation: `[pendingHydrate]` のみで十分。pendingHydrate が非null のときのみ処理するガードで対応。

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (Next.js default) + Playwright E2E |
| Config file | jest.config.js / playwright.config.ts |
| Quick run command | `npm test` |
| Full suite command | `npm test && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IPHONE-MGT-01 | 一覧タップ → エディタ読み込み | unit (pendingHydrate state 変化) | `npm test -- --testPathPattern=viewer` | ❌ Wave 0 |
| IPHONE-MGT-02 | 上書き保存フロー | unit (saveDraft id 維持) | `npm test -- --testPathPattern=viewer` | ❌ Wave 0 |
| IPHONE-MGT-03 | ＋ボタンで新規作成モード | unit (currentDraftId=null) | `npm test -- --testPathPattern=viewer` | ❌ Wave 0 |
| IPHONE-MGT-04 | 削除ボタンで IndexedDB 削除 | unit (deleteDraft 呼び出し) | `npm test -- --testPathPattern=viewer` | ❌ Wave 0 |
| IPHONE-MGT-05 | 「PCに送る」送信動作維持 | smoke (既存 E2E) | `npx playwright test` | ✅ 既存 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/viewer/__tests__/page.test.tsx` — IPHONE-MGT-01〜04 のユニットテスト
- [ ] IndexedDB モック（`fake-indexeddb` または jest-idb-mock）— `openDraftsDB` のテスト用
- [ ] pendingHydrate state の変化テスト用モック

---

## Sources

### Primary (HIGH confidence)
- `app/viewer/page.tsx` (直接コード読み取り) — 全 state / ヘルパー関数の現状確認
- `.planning/phases/09-iphone-fusen-kanri/09-CONTEXT.md` — ユーザー確定済み実装方針
- `.planning/ROADMAP.md` — Phase 9 の plans 構成と Success Criteria

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Phase 8 の実装決定事項（Phase 9 の前提確認）
- `.planning/phases/08-iphone-note-app/08-CONTEXT.md` — contenteditable パターンの確認

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 全コードを直接確認済み
- Architecture: HIGH — pendingHydrate パターンは CONTEXT.md で確定済み
- Pitfalls: HIGH — editorRef null 問題・バブリング問題はコードから直接確認

**Research date:** 2026-04-01
**Valid until:** 2026-05-01（安定技術領域）
