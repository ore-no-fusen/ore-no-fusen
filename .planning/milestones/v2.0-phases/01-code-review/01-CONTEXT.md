# Phase 1: コードレビュー - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

既存コードベースを横断的にレビューし、潜在バグ・不安定要素を洗い出して `.planning/research/FINDINGS.md` に文書化する。修正は Phase 2 の対象であり、このフェーズではコードを変更しない。

</domain>

<decisions>
## Implementation Decisions

### 調査対象ファイル

リスク高のファイルに集中する（全ファイル均等スキャンはしない）。

- **StickyNote.tsx** — データ保存・Listenerリーク・競合状態の修正履歴が最多
- **lib.rs / storage.rs** — Rust主要ロジック。unwrap・Win32状態同期・saveロジック
- **useNoteFile.ts / hooks/** — ノート読み込み・hasLoadedRef制御・競合状態の起点

その他コンポーネント（FloatingFormatBar, RichTextEditor, MarkdownRenderer 等）は今回の調査対象外。

### 調査するリスクパターン

**優先1: データ消失・クラッシュリスク**
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

</decisions>

<specifics>
## Specific Ideas

- データ消失・クラッシュに直結するリスクを最優先。UIの些細な不具合は今回の対象外。
- パフォーマンスは「無駄な再レンダリング」のみ。メモリリーク・過剰API呼び出しは含めない。

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- `StickyNote.tsx` — 最大のファイル。Listenerリーク修正済みパターン（cancelledフラグ + ref参照）が既に存在
- `lib.rs` — `unwrap_or_else` 変換済み（29箇所）の実績あり。残存チェックが必要

### Established Patterns

- **Listenerリーク対策**: `cancelled` フラグ + ハンドラ内は state ではなく ref 経由（MEMORY.md に記録済み）
- **空body保護**: `hasLoadedRef` によるブロックパターン（修正済み）
- **Win32後Tauri同期**: `win.show()` で状態を同期するパターン（修正済み）

### Integration Points

- `StickyNote.tsx` → `useNoteFile.ts` → `lib.rs` (`invoke()`) の保存/読み込みフロー
- Tauri イベント（`reload_note`, `scroll_to_line`）が StickyNote.tsx に到達する経路

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-code-review*
*Context gathered: 2026-03-11*
