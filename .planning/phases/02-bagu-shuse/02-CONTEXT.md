# Phase 2: バグ修正 - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 の FINDINGS.md で特定された問題を最小変更で修正する。新機能追加・リファクタリング・スタイル統一は対象外。

</domain>

<decisions>
## Implementation Decisions

### Rust unwrap() 修正方針
- tray.rs:55 / tray.rs:131（高優先度）: `state.lock().unwrap_or_else(|p| p.into_inner())` に変更してMutexポイズン時もアプリを継続
- logic.rs:371（中優先度）: `content.find("---")` のunwrap除去 — 具体的なパターン（`ok()?` vs `unwrap_or(0)`）はClaude's Discretion
- コミット粒度: 1修正 = 1コミット（ROADMAP.md Success Criteria 通り）

### STAB-03（Win32 API後のTauri状態同期）
- 対応方針: コードを積次的に確認し、実装済みと判断したら要件をチェックする
- 新規コード変更なし（lib.rs の fusen_set_always_on_top Win32直接実装・fusen_show_at_position の win.show() 追加は確認済み）

### UI-02（FloatingFormatBar blur除外）
- 対応方針: StickyNote.tsx の blur ロジックを確認し、`.floatBar` 除外チェックが正しく機能していれば REQUIREMENTS.md をチェック済みに更新する
- 新規コード変更なし（StickyNote.tsx L960/L1073 に `.floatBar` 除外チェックが実装済み）

### Claude's Discretion
- logic.rs:371 の unwrap() 除去パターン（`ok()?` 早期リターン vs `unwrap_or(0)` フォールバック）

</decisions>

<code_context>
## Existing Code Insights

### 修正対象ファイル
- `src-tauri/src/tray.rs:55,131`: `state.lock().unwrap()` → `unwrap_or_else(|p| p.into_inner())`
- `src-tauri/src/logic.rs:371`: `content.find("---").unwrap()` → パターン要選択
- `src-tauri/src/lib.rs`: STAB-03 検証対象（fusen_set_always_on_top / fusen_show_at_position）
- `app/components/StickyNote.tsx:960,1073`: UI-02 検証対象（`.floatBar` 除外チェック）

### Established Patterns
- Rust unwrap() 除去: 他29箇所は `unwrap_or_else(|p| p.into_inner())` パターンで修正済み（MEMORY.md記載）
- Win32後のTauri状態同期: lib.rs に `let _ = win.show()` パターンで実装済み
- blur除外: `.hoverBar` / `.floatBar` / `.editorHost` のクラス名による relatedTarget チェック

### Integration Points
- REQUIREMENTS.md の STAB-03 / UI-02 チェックボックスを更新する
- 各修正は個別コミットで記録する

</code_context>

<specifics>
## Specific Ideas

- 低優先度項目（LOW-01〜05）は今フェーズに含めない（スコープ外）
- STAB-03 / UI-02 は新規コード変更なし、検証確認のみ

</specifics>

<deferred>
## Deferred Ideas

- LOW-01: isPool の `u()` 直接呼び出し → `wrapUnlisten` 統一 — 別フェーズ
- LOW-02: useEditMode.startEditing の `initialContent` 依存 → `useRef` 化 — 別フェーズ
- LOW-03: handleGlobalPointer deps の `[]` + `isHoverRef` パターン化 — 別フェーズ
- LOW-04/05: regex `unwrap()` の `lazy_static!` / `once_cell` 安全化 — 別フェーズ

</deferred>

---

*Phase: 02-bagu-shuse*
*Context gathered: 2026-03-11*
