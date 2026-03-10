# FINDINGS.md — 俺の付箋 コードレビュー結果

**フェーズ**: Phase 1: コードレビュー
**日付**: 2026-03-11
**対象ファイル**: StickyNote.tsx, useNoteFile.ts, useEditMode.ts, lib.rs, storage.rs, logic.rs, tray.rs

---

## 1. 確認済み（既修正）

MEMORY.md 記載の修正済み項目をコードで確認した結果。

| ID | 項目 | 状態 | 確認箇所 |
|----|------|------|---------|
| C-1 | fusen_update_geometry デッドコード削除 | コードで確認済み | lib.rs（呼び出しなし） |
| C-2 | reload_note 空body スキップ | コードで確認済み | StickyNote.tsx L664-668: `if (!body) return` |
| H-1 | hasLoadedRef 空body ブロック | コードで確認済み | useNoteFile.ts L111-115: ガード2（hasLoadedRef + 空body） |
| isNewNote | ダブルクリック時 setIsNewNote(false) | コードで確認済み | StickyNote.tsx L1415: ハンドラ冒頭で `setIsNewNote(false)` |
| Win32 | fusen_show_at_position 末尾 win.show() | コードで確認済み | lib.rs L1134: `let _ = win.show()` |
| STAB-01 | 全 listen() リークなし（6箇所すべて） | コードで確認済み | StickyNote.tsx 全 useEffect: isMounted/cancelled/mounted フラグパターン |
| DATA-01 | hasLoadedRef 3重ガード | コードで確認済み | useNoteFile.ts L55(初期化), L111-115(ガード2), L119-123(ガード3) |
| DATA-02 | autoSave 競合状態なし（savePending ガード） | コードで確認済み | useNoteFile.ts L159: `if (!savePending) return` |
| UI-01 | isNewNote カーソル位置バグ修正 | コードで確認済み | StickyNote.tsx L1415 + RichTextEditor.tsx L1222-1240 |

---

## 2. 残存リスク（Phase 2 修正対象）

Phase 2 で対処すべき問題。優先度順に記載。

### STAB-02-1: tray.rs:55 の本番 unwrap()

- **ファイル**: src-tauri/src/tray.rs
- **ライン**: 55
- **コード**: `state.lock().unwrap()`
- **コンテキスト**: トレイメニュー構築時に呼ばれる
- **リスク**: Mutex ポイズン（別スレッドでパニック発生時の lock 取得）でアプリ全体が停止する
- **優先度**: 高
- **推奨修正**: `state.lock().unwrap_or_else(|p| p.into_inner())` に変更

### STAB-02-2: tray.rs:131 の本番 unwrap()

- **ファイル**: src-tauri/src/tray.rs
- **ライン**: 131
- **コード**: `state.lock().unwrap()`
- **コンテキスト**: タグトグル時に呼ばれる
- **リスク**: STAB-02-1 と同一。Mutex ポイズンでパニック
- **優先度**: 高
- **推奨修正**: `state.lock().unwrap_or_else(|p| p.into_inner())` に変更

### STAB-02-3: logic.rs:371 の本番 unwrap()

- **ファイル**: src-tauri/src/logic.rs
- **ライン**: 371
- **コード**: `content.find("---").unwrap()`
- **コンテキスト**: フロントマター解析時。呼び出し前に `starts_with("---")` チェックあり
- **リスク**: 現状は保護条件あり（実質安全）。将来のリファクタリングで保護が外れた場合にパニック
- **優先度**: 中
- **推奨修正**: `content.find("---").ok()?` または `unwrap_or(0)` に変更して早期リターン

---

## 3. 要確認（低優先）

動作上の問題は低いが、コード品質・将来リスクの観点で記録。Phase 2 以降で判断。

### LOW-01: isPool リスナーの wrapUnlisten 未使用

- **ファイル**: app/components/StickyNote.tsx
- **ライン**: 631-638
- **概要**: `fusen:promote_from_pool` リスナーが `wrapUnlisten` を使わず `u()` を直接呼ぶ
- **判定**: 問題なし。`UnlistenFn` は同期関数（`() => void` 型）であり、Promise を返さないため `.catch()` なしでも未捕捉 Promise エラーは発生しない。他のリスナーが `wrapUnlisten` を使用しているのに対してスタイル不統一のみ（低優先度の改善候補）

### LOW-02: startEditing の initialContent 依存

- **ファイル**: app/hooks/useEditMode.ts
- **ライン**: 77-90
- **概要**: `startEditing` の `useCallback` deps が `[isEditing, initialContent]`。ロード中（`content=''`）に `startEditing` が呼ばれると空のエディタになる
- **判定**: 理論上のリスクは存在するが、実用上は現フローで防止済み（プールウィンドウはロード完了後のみ昇格、ユーザー操作はUI表示後のみ可能）。改善候補（低優先度）

### LOW-03: handleGlobalPointer の isHover deps

- **ファイル**: app/components/StickyNote.tsx
- **ライン**: 1087-1129
- **概要**: `useEffect` deps に `isHover` を含み、マウスオーバー/アウト時にリスナーが再登録される
- **判定**: 深刻度低。`isHover` は `pointermove` ハンドラ内で変化しないため悪循環なし。リスナー再登録コスト（removeEventListener + addEventListener）のみ。改善候補（低優先度）

### LOW-04: logic.rs の regex unwrap() 複数箇所

- **ファイル**: src-tauri/src/logic.rs
- **ライン**: 89-96, 139, 380
- **コード**: `regex::Regex::new(...).unwrap()`
- **判定**: コンパイル時リテラル文字列による正規表現のため実質パニックしない。低リスク。`lazy_static!` または `once_cell::sync::Lazy` への移行で明示的に安全化可能（低優先度）

### LOW-05: storage.rs の regex unwrap() 複数箇所

- **ファイル**: src-tauri/src/storage.rs
- **ライン**: 279, 306
- **コード**: `regex::Regex::new(...).unwrap()`
- **判定**: LOW-04 と同一。コンパイル時リテラルのため実質安全。低優先度

---

## Phase 2 修正リスト（優先順）

1. **[高優先度]** tray.rs:55 — `state.lock().unwrap()` → `unwrap_or_else(|p| p.into_inner())`
2. **[高優先度]** tray.rs:131 — `state.lock().unwrap()` → `unwrap_or_else(|p| p.into_inner())`
3. **[中優先度]** logic.rs:371 — `content.find("---").unwrap()` → `ok()?` 伝播
4. **[低優先度]** LOW-02: `useEditMode.startEditing` の `initialContent` 依存を `useRef` 化
5. **[低優先度]** LOW-01: `fusen:promote_from_pool` の `u()` 直接呼び出しを `wrapUnlisten` 統一
6. **[低優先度]** LOW-03: `handleGlobalPointer` deps を `[]` + `isHoverRef` パターンに変更
7. **[低優先度]** LOW-04/05: regex `unwrap()` を `lazy_static!` / `once_cell` で安全化

---

## Phase 1 Success Criteria 達成確認

| Criteria | 状態 |
|----------|------|
| 全 useEffect 内の async listen() の解除確認（6箇所すべて） | ✅ |
| Rust unwrap() 残存リストアップ（ファイル・ライン付き） | ✅ |
| 空body上書きリスク箇所の特定（3重ガード確認） | ✅ |
| 競合状態の可能性箇所の特定（autoSave savePending ガード確認） | ✅ |
| FINDINGS.md 文書化 | ✅ |
