# Phase 1: コードレビュー - Research

**Researched:** 2026-03-11
**Domain:** Tauri v2 + React 18 コードベース静的レビュー（フロントエンド・Rustバックエンド横断）
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**調査対象ファイル（集中スキャン）**
- `StickyNote.tsx` — データ保存・Listenerリーク・競合状態の修正履歴が最多
- `lib.rs / storage.rs` — Rust主要ロジック。unwrap・Win32状態同期・saveロジック
- `useNoteFile.ts / hooks/` — ノート読み込み・hasLoadedRef制御・競合状態の起点

その他コンポーネント（FloatingFormatBar, RichTextEditor, MarkdownRenderer 等）は調査対象外。

**調査リスクパターン（優先1: データ消失・クラッシュ）**
1. `async listen()` の解除漏れ（Listenerリーク）
2. 空 body による上書き
3. 競合状態（race condition）
4. `unwrap()` 残存
5. Win32 API 呼び出し後の Tauri 内部状態不同期

**優先2: パフォーマンス**
6. 無駄な再レンダリング（useEffect/state変化による予期しない再描画）

### Claude's Discretion
- 既修正済み項目（MEMORY.md 記載）を FINDINGS.md に「確認済み」として記録するかどうかの判断
- パフォーマンス問題の深刻度判断（軽微なものは記載しない等）
- FINDINGS.md の具体的な構成・フォーマット

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAB-01 | Listener Leak が新たに発生していないこと（useEffect内のasync listen()の解除漏れ） | StickyNote.tsx 内全 listen() 呼び出しの cancelled フラグ + unlisten パターン検証 |
| STAB-02 | Rustコード全体で `unwrap()` の残存がないこと | lib.rs, logic.rs, storage.rs, tray.rs の unwrap() 残存箇所の洗い出し |
| DATA-01 | 空body によるノートデータ上書きが発生しないこと | hasLoadedRef ガード・空body ブロック経路の完全性確認 |
| DATA-02 | ノートロード時の競合状態（race condition）がないこと | useNoteFile + StickyNote の非同期フロー・cancelled フラグ整合性確認 |
| UI-01 | 編集開始時のカーソル位置が正しいこと（新規作成・再編集の両方） | isNewNote state リセットタイミング・startEditing の呼び出しパス確認 |
</phase_requirements>

---

## Summary

Phase 1 の目標は「コードを変更せず、潜在リスクを文書化すること」である。実際のコードを精査した結果、以下のことが判明した。

StickyNote.tsx は大規模リファクタリング後（2,344行 → 約500行）であり、Listenerリークの主要パターンはすでに `cancelled` フラグ + `wrapUnlisten` ラッパーで対処済み。ただし `isPool` リスナー（`fusen:promote_from_pool`）は `cancelled` ではなく `mounted` フラグを使うなど実装パターンが複数混在しており、統一性の確認が必要である。

Rust 側では `lib.rs` 本体の `unwrap()` はテストコードのみに残存（本番パスはすべて `unwrap_or_else` 済み）。しかし `tray.rs` に本番コードの `unwrap()` が 2 箇所残存していることが確認された。`logic.rs` の `unwrap()` も大部分はテストコードだが、`update_frontmatter_value` 内の `content.find("---").unwrap()` は本番コードであり、frontmatter がない（または不正な）ノートでパニックを引き起こすリスクがある。

データ消失リスク（DATA-01, DATA-02）については `hasLoadedRef` と `saveNoteContent` の二重ガードが確認できた。競合状態は `autoSave` デバウンス（800ms）と `cancelled` フラグで抑制されている。

**Primary recommendation:** FINDINGS.md は「確認済み（既修正）」「残存リスク」「要確認」の3セクションで構成し、レビュー結果を明確に分類して記録する。

---

## Standard Stack

このフェーズは「静的コードレビュー」であり、新規ライブラリの導入は不要。ツールは既存のものを使用する。

### Core
| ツール | 用途 |
|--------|------|
| Grep (ripgrep) | パターン横断検索（unwrap, listen, hasLoadedRef 等） |
| Read (ファイル精読) | 対象ファイルの全体コンテキスト確認 |
| FINDINGS.md | 発見事項の文書化（このフェーズの唯一の成果物） |

### 調査対象ファイル一覧（確定）
| ファイル | パス | 優先度 |
|---------|------|-------|
| StickyNote.tsx | `app/components/StickyNote.tsx` | 最高 |
| useNoteFile.ts | `app/hooks/useNoteFile.ts` | 最高 |
| useEditMode.ts | `app/hooks/useEditMode.ts` | 高 |
| lib.rs | `src-tauri/src/lib.rs` | 最高 |
| storage.rs | `src-tauri/src/storage.rs` | 高 |
| logic.rs | `src-tauri/src/logic.rs` | 高 |
| tray.rs | `src-tauri/src/tray.rs` | 中 |

---

## Architecture Patterns

### Listenerリーク対策パターン（プロジェクト標準）

StickyNote.tsx で確認された「正しい」パターン:

```typescript
// パターン1: cancelled フラグ（reload_note, scroll_to_line で使用）
useEffect(() => {
    if (!selectedFile) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
        const u = await listen('event', handler);
        if (cancelled) { wrapUnlisten(u)(); return; } // 重要: 解決後チェック
        unlisten = wrapUnlisten(u);
    };
    setup();

    return () => {
        cancelled = true;
        safeUnlisten(unlisten);
    };
}, [selectedFile]); // deps は selectedFile のみ
```

```typescript
// パターン2: isMounted フラグ（move, resize で使用）
useEffect(() => {
    let isMounted = true;
    let unlistenMove: (() => void) | null = null;

    const setup = async () => {
        const uMove = await win.listen('tauri://move', handler);
        const safeMove = wrapUnlisten(uMove);
        if (isMounted) unlistenMove = safeMove; else safeMove();
    };
    setup();

    return () => {
        isMounted = false;
        safeUnlisten(unlistenMove);
    };
}, [selectedFile, saveWindowState]);
```

```typescript
// パターン3: mounted フラグ（isPool promote で使用）
useEffect(() => {
    if (!isPool) return;
    let unlisten: (() => void) | undefined;
    let mounted = true;

    const setup = async () => {
        const u = await thisWin.listen('fusen:promote_from_pool', handler);
        if (!mounted) { u(); return; }
        unlisten = u;
    };
    setup();

    return () => {
        mounted = false;
        if (unlisten) unlisten();
    };
}, [isPool, startEditing]);
```

**注意:** パターン3では `wrapUnlisten` を使わず直接 `u()` を呼んでいる。パターン間の不一致がある。

### hasLoadedRef ガードパターン（DATA-01）

```typescript
// useNoteFile.ts: 二重ガード
if (!hasLoadedRef.current && body.trim() === '') {
    throw new Error('BLOCKED: empty body before first load');
}
if (body.trim() === '' && !frontmatter) {
    throw new Error('BLOCKED: empty content and frontmatter');
}
```

autoSave useEffect でも追加ガード:
```typescript
useEffect(() => {
    if (!path || !savePending || !content) return;
    if (!hasLoadedRef.current) return; // ロード完了前ブロック
    ...
}, [path, savePending, content, rawFrontmatter, saveNoteContent]);
```

### isNewNote カーソル管理パターン（UI-01）

```typescript
// StickyNote.tsx line 1415: ダブルクリック時にリセット（修正済み）
onDoubleClick={(e) => {
    e.stopPropagation();
    setIsNewNote(false); // 再編集時は新規ノート扱いを解除
    startEditing(offset);
}}
```

---

## Don't Hand-Roll

このフェーズは静的レビューのため「手を動かさない」フェーズ。以下の分析はツールで行い、独自スクリプトは不要:

| 問題 | やること | 理由 |
|------|---------|------|
| unwrap() 残存検索 | Grep で `\.unwrap\(\)` を検索 | 手動確認より確実 |
| listen() 解除確認 | Grep + コンテキスト読み | キャンセルパターンの目視確認 |
| FINDINGS.md 作成 | Write ツールで直接作成 | Bashヒアドキュメント不使用 |

---

## Common Pitfalls

### Pitfall 1: テストコードの unwrap() を本番リスクと混同する
**What goes wrong:** `#[cfg(test)]` 内の `unwrap()` を本番パニックリスクとして誤記録する
**Why it happens:** Grep 結果をコンテキストなしで列挙する
**How to avoid:** 各 `unwrap()` が `#[cfg(test)]` ブロック内かどうかを必ず確認する
**Warning signs:** ファイルのライン番号が 400+ で、テスト関数内に存在する

### Pitfall 2: 既修正済みパターンを「新規リスク」として記録する
**What goes wrong:** MEMORY.md に記載済みの修正（C-1, C-2, H-1 等）を再び「問題あり」と記録する
**Why it happens:** コード上に `// [FIX]` コメントが残っているが文脈を読まない
**How to avoid:** MEMORY.md の「データ消失リスク対応状況」セクションを先に確認し、既修正項目を把握してからコードを読む

### Pitfall 3: 複数の unlisten パターン混在を「バグ」と判定する
**What goes wrong:** `cancelled` / `isMounted` / `mounted` フラグの違いをすべてバグと記録する
**Why it happens:** 統一されていないことを即「問題」と判断する
**How to avoid:** 各パターンが async listen() の解決前後を正しくハンドリングしているかの本質を確認する。パターンが違っても動作上問題なければ「要改善（低優先）」として記録する

### Pitfall 4: logic.rs の unwrap() ラインを見落とす
**What goes wrong:** `tray.rs` と `lib.rs` のテストコード unwrap のみを確認して、`logic.rs` の本番コード `unwrap()` を見逃す
**Why it happens:** grep 結果が多く、logic.rs のラインをスキャンしきれない
**How to avoid:** `update_frontmatter_value` 関数内の `content.find("---").unwrap()` を特に注意して確認する（line 371）

---

## Code Examples

### 確認済みリスク: tray.rs の本番 unwrap()

```rust
// src-tauri/src/tray.rs:55 - 本番コード
let mut app_state = state.lock().unwrap(); // Mutex ポイズンで panicする
// src-tauri/src/tray.rs:131
let mut app_state = state.lock().unwrap(); // 同上
```

これらは `unwrap_or_else(|p| p.into_inner())` に変更する対象（Phase 2）。

### 確認済みリスク: logic.rs の本番 unwrap()

```rust
// src-tauri/src/logic.rs:371 - update_frontmatter_value 本番コード
let start_idx = content.find("---").unwrap() + 3;
// frontmatter が "---" で始まることは行 365 でチェック済みだが、
// content.find("---") は最初の "---" を見つけるため理論上は常に Some を返す。
// ただしマルチバイト境界問題や将来的な変更リスクとして記録する価値がある。
```

### 確認済み: reload_note リスナーの空body チェック（C-2 対策）

```typescript
// StickyNote.tsx:664-668 - 正しくガードされている
const body = await loadNote();
if (!body) {
    console.error('[StickyNote] reload_note: loadNote returned empty, skipping...');
    return;
}
```

### 確認済み: isNewNote リセット（UI-01 修正済み）

```typescript
// StickyNote.tsx:1415 - ダブルクリックハンドラ冒頭
setIsNewNote(false); // 再編集時は新規ノート扱いを解除
```

---

## State of the Art

| 項目 | 修正前状態 | 現在の状態 | 残存リスク |
|------|-----------|-----------|----------|
| Listener リーク | async listen() に unlisten なし | cancelled フラグ + wrapUnlisten | 複数パターン混在（機能上の問題は低） |
| 空body上書き | 初期化競合でデータ消失 | hasLoadedRef 二重ガード | なし（確認済み） |
| isNewNote バグ | 再編集でカーソルが先頭に戻る | ダブルクリック時に setIsNewNote(false) | なし（確認済み） |
| Rust unwrap() | 29箇所 | 本番コードは大幅削減 | tray.rs 2箇所・logic.rs 1箇所残存 |
| reload_note 空上書き | 空bodyで上書き | 空body はスキップ | なし（確認済み） |

---

## Open Questions

1. **isPool リスナーの `wrapUnlisten` 未使用**
   - What we know: `fusen:promote_from_pool` リスナーは `mounted` フラグを使い、unlisten 時に `u()` を直接呼んでいる（`wrapUnlisten` なし）
   - What's unclear: Tauri v2 で unlisten 関数が Promise を返す仕様の場合、このパターンで `.catch()` なしにエラーが飛ぶリスクがあるか
   - Recommendation: FINDINGS.md に「要確認（低優先）」として記録し、Phase 2 で統一するか判断

2. **useEditMode の `startEditing` が `initialContent` に依存**
   - What we know: `startEditing` の useCallback deps が `[isEditing, initialContent]` であり、`initialContent` が変わるたびに再生成される
   - What's unclear: これが isPool からの promote フロー中に startEditing が古い空 content を参照するケースがあるかどうか
   - Recommendation: FINDINGS.md に「要確認（中優先）」として記録

3. **useEffect の deps に `isHover` を含む handleGlobalPointer**
   - What we know: StickyNote.tsx line 1087 の useEffect deps が `[isHover]` であり、マウス移動のたびに再レンダリングが誘発される可能性がある
   - What's unclear: `isHover` の更新頻度と実際のパフォーマンス影響
   - Recommendation: FINDINGS.md に「パフォーマンス（低優先）」として記録

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` (vitest run) |
| Full suite command | `npm run test:coverage` |
| E2E command | `npm run test:e2e` (Playwright, port 3003) |

### Phase Requirements -> Test Map

このフェーズは「コードを変更しない」レビューフェーズであるため、成果物は `.planning/research/FINDINGS.md` の作成である。自動テストは対象外。

| REQ ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| STAB-01 | Listener Leak がないこと | manual-only | — | コード精読で確認。自動化不可 |
| STAB-02 | unwrap() 残存なし | manual-only | — | Grep で検索し目視確認 |
| DATA-01 | 空body上書きなし | manual-only | — | 保存フローのコード精読 |
| DATA-02 | 競合状態なし | manual-only | — | 非同期フローのコード精読 |
| UI-01 | カーソル位置が正しい | manual-only | — | isNewNote フローのコード精読 |

**Phase gate:** `.planning/research/FINDINGS.md` が作成され、全 5 要件について「確認済み/残存/要確認」のいずれかが記録されていること。

### Wave 0 Gaps
None — このフェーズはコード変更なし、テスト作成不要。

---

## Sources

### Primary (HIGH confidence)
- `app/components/StickyNote.tsx` - Listener パターン、isNewNote、useEffect 構造を直接精読
- `app/hooks/useNoteFile.ts` - hasLoadedRef ガード、autoSave ロジックを直接精読
- `app/hooks/useEditMode.ts` - startEditing/endEditing、deps 構造を直接精読
- `src-tauri/src/tray.rs` - unwrap() 残存箇所を Grep + 精読
- `src-tauri/src/logic.rs` - unwrap() 残存箇所を Grep + 精読（本番 vs テストコード分類）
- `.planning/phases/01-code-review/01-CONTEXT.md` - 調査スコープの確定

### Secondary (MEDIUM confidence)
- `MEMORY.md` (プロジェクトメモリ) - 既修正済みパターンの把握

### Tertiary (LOW confidence)
- なし

---

## Metadata

**Confidence breakdown:**
- 調査対象ファイルの特定: HIGH - CONTEXT.md で確定済み
- Listener リーク現状: HIGH - StickyNote.tsx を直接精読
- unwrap() 残存箇所: HIGH - Grep + ラインコンテキスト確認済み
- データ消失リスク: HIGH - useNoteFile.ts を直接精読
- パフォーマンス問題: MEDIUM - isHover deps は精読済みだが影響度は実行時計測が必要

**Research date:** 2026-03-11
**Valid until:** 2026-04-11（コードベースに変更がなければ有効）
