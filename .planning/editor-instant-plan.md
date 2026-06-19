# 計画書：編集に入る一瞬のチラつきをなくす（エディタ常時マウント）

作成日: 2026-06-19
対象バージョン: v4.1.1 ベース
ブランチ: develop で直接（小〜中・要・実機検証）
状態: **実装済み・検証完了（未コミット）**
- 実装: `StickyNote.tsx`（常時マウント＋visibility 切替）+ `RichTextEditor.tsx`（後述の回帰修正）
- 検証: `tsc --noEmit` OK / `npm test` 175件 OK / E2E sticky-note 18本 OK（2回連続）/ 1.2 を3回連続 OK / 実機でチラつき解消・Escape 終了・狙った場所から再編集を確認（2026-06-20）
- 残: コミット（ユーザー指示待ち）

### 常時マウント化で判明した実装バグ2件（修正済み・§5.5 参照）
1. **Escape で編集が終わらない回帰**: 常時マウントで CodeMirror が初回 mount 時の
   古い closure（isEditing=false）を握り、Escape→handleEditBlur が届かなかった。
   → RichTextEditor.tsx で onChange/onKeyDown/onBlur/onSelectionChange/onFirstChar を
   最新 props ref 経由で呼ぶよう修正。
2. **再編集時の入力取りこぼし（1.2 flaky）**: editor 再利用時に cursorPosition effect が
   value 同期 effect より先に走り、rAF カーソル確定が type と競合。
   → RichTextEditor.tsx で value 同期 effect を前方へ移動し、カーソル/座標を同期 dispatch
   してから focus（rAF は補助に限定）。

---

## 1 目的（ユーザーの困りごと）

既存付箋をダブルクリックで編集に入る瞬間、**一瞬チラッと消える/待つ**挙動がある。
すぐ書きたいのにストレス。これをなくし、**ダブルクリックで即・チラつきなく**書ける状態にする。

---

## 2 原因（コードで確認済み）

`app/components/StickyNote.tsx`（現状 1841 行付近）の表示構造が：

```
isEditing ? ( 編集モード=RichTextEditor ) : ( 表示モード=MarkdownRenderer )
```

ダブルクリックで `isEditing` が false→true になると:
1. 表示用 MarkdownRenderer が**アンマウント（消える）**
2. RichTextEditor が**新規マウント（作り直し・初期化）**

この「消える→作り直す」がチラつきの正体。先読み（import の先読み）だけでは
**作り直し自体**は消えないため、症状が残る（先読みは破棄済み）。

---

## 3 解決方針：エディタを常時マウントして visibility で切替

- RichTextEditor を**最初から常にマウント**しておき、アンマウントしない。
- 表示モード/編集モードは **`visibility` と `pointer-events`** で見せ消しするだけ。
- 作り直しが起きないのでチラつかない。

これは faf9844（旧 feature/arrange-by-tag）が実装していた手法。ただし faf9844 には
**opacity 処理（displayOpacity）が混入**しており、それは v4.1.1 のバグ源。
**opacity 関連は一切持ち込まない。常時マウントの構造変更だけを移植する。**

---

## 4 Codex への実装指示（再開後そのまま渡す）

### やること（StickyNote.tsx のみ・表示構造の変更）
1. `RichTextEditor = lazy(() => import('./RichTextEditor'))` を関数化して先読みも併用:
   ```
   const loadRichTextEditor = () => import('./RichTextEditor');
   const RichTextEditor = lazy(loadRichTextEditor);
   ```
   付箋を開いた直後に `useEffect(() => { if (test) return; void loadRichTextEditor(); }, [])` で先読み。
2. 表示部の `isEditing ? (編集) : (表示)` を、**両方マウントして visibility 切替**に変える:
   - エディタ host を常にマウント（`shouldKeepEditorMounted` 等）。
     `visibility: isEditing ? 'visible' : 'hidden'`、`pointerEvents: isEditing ? 'auto' : 'none'`、
     重なり順 z-index を編集時に上げる。
   - 表示用 MarkdownRenderer は `!isEditing` のとき表示。
   - エディタの `onChange`/`onBlur`/`onSelectionChange`/`onFirstChar` は **isEditing のときだけ**有効化
     （非編集時に副作用が走らないようガード。faf9844 と同じ）。
   - Suspense fallback は、読み込み中も本文がそれっぽく見えるプレースホルダにする（任意）。

### 絶対に持ち込まないもの（faf9844 からの除外）
- `extractOpacityFromFrontmatter` 関数
- `displayOpacity` を使う opacity 適用の useEffect
- `fusen_set_opacity` 呼び出しの追加
- → opacity は v4.1.1 で別途修正済み。触らない。

### 厳守
- 変更は `app/components/StickyNote.tsx` のみを基本とする（必要なら RichTextEditor.tsx の
  `import React` 追加程度まで）。整列・opacity・他機能は触らない。
- データを壊さない（本文・タグ・色・位置）。保存ロジックは変えない。
- `npx tsc --noEmit` と `npm test`（175件）が通ること。

---

## 5 検証（実機必須）

このバグは「アプリ起動後いちばん最初に既存付箋を編集するとき」に出る。テストだけでは
チラつきを判定できないので **実機で確認**:
- 既存付箋をダブルクリック → **一瞬も消えずに即編集**できる。
- 編集→表示→再編集を繰り返してもチラつかない。
- 新規(Ctrl+N)・Pool 窓が今までどおり動く（回帰）。
- 透明度（v4.1.1）が壊れていない（opacity を触らない確認）。

### テスト追加（ユーザー要望・別途）
今回の opacity バグの教訓として「**新規ファイルに書ける / 過去ファイルに書ける**」の
2パターンをテスト化したい（→ `editor-write-test-plan` として別管理）。本計画とは分ける。

---

## 5.5 E2E 不具合と Codex への修正指示（2026-06-20 切り分け済み）

pre-commit の E2E（`e2e/sticky-note.spec.ts`）で **1.2 / 1.5** が落ちる。develop 素では
3本とも pass、本変更を入れると落ちる＝**本変更の副作用**（切り分け実証済み）。

### 確定した原因（推測なし・実ログで確認）
常時マウントでエディタ（`.cm-content`）が**非編集時も DOM に残る**ため、テストの前提が崩れた:

1. **1.2 失敗**: `getByText('Heading')` が **2 要素**にマッチ（strict mode violation）。
   表示用 MarkdownRenderer 側と、非表示エディタ側の両方に "Heading" が存在するため。
   - 当初 `onChange` に足した `if(!isEditing) return` が入力を握り潰す副作用もあったが、
     **そのガードは既に除去済み**（`# Heading` が保存されることを確認）。残るは getByText の二重マッチ。
2. **1.5 失敗**: `expect(.cm-content).not.toBeVisible()` が **visible 判定で失敗**。
   `visibility:hidden` でも CodeMirror が高さを持つため Playwright が visible とみなす。
   非編集時にエディタが見えていない状態を満たせていない。

### Codex への修正指示（テスト側で実装の正しさを保つ）
実アプリは正常（チラつき解消・実機OK）。テストのセレクタ/アサーションを常時マウント構造へ:
- 1.2: `page.getByText('Heading'|'TaskItem')` を **`page.locator('article.notePaper').getByText(...)`**
  に限定（表示用 MarkdownRenderer 配下のみ）。`page.locator('strong')` も `article.notePaper strong` に。
- 1.5: `.cm-content` の表示判定を、常時マウント前提に合わせる。非編集時は親エディタ host が
  `visibility:hidden`。`expect(.cm-content).not.toBeVisible()` を、`editorHost` の
  `visibility` か `aria-hidden` を見る形に変える（実装の見え方＝「非編集時はエディタが見えない」を検証）。
- **実装（StickyNote.tsx）の表示構造は変えない**。テストだけ直す。tsc・unit 175件は維持。

### 厳守（再掲）
- 実機のチラつき解消を壊さない。opacity 一切触らない。
- 直すのは `e2e/sticky-note.spec.ts` のみを基本とする。

---

## 6 改版履歴

| No | 日付 | 変更内容 |
|----|------|----------|
| 1 | 26-06-19 | 初版。チラつきの原因（表示↔編集でエディタ作り直し）を特定。解決＝常時マウント＋visibility切替。faf9844 から opacity を除外して移植する方針。先読みだけでは不足と確認。 |
| 2 | 26-06-20 | 実装完了。常時マウント＋visibility 切替を StickyNote.tsx に反映。tsc OK・テスト175件 OK・実機でチラつき解消を確認。コミット待ち。 |
| 3 | 26-06-20 | pre-commit の E2E（1.2/1.5）失敗を切り分け。原因＝常時マウントでエディタが DOM に残りテスト前提が崩れた件。onChange の過剰ガードは除去済み。残りはテスト側のセレクタ調整（§5.5）。修正は Codex に依頼。 |
| 4 | 26-06-20 | 常時マウント化で実装バグ2件（Escape で編集終了しない／再編集時の入力取りこぼし flaky）が判明。いずれも RichTextEditor.tsx の closure・effect 順序が原因で Codex が修正。E2E 18本・unit 175・tsc 全緑、実機OK。1.4 は 1.2 の巻き添えで自然解消。コミット可。 |
