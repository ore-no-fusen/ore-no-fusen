# Phase 2: バグ修正 - Research

**Researched:** 2026-03-11
**Domain:** Rust unwrap() 安全化、Win32/Tauri 状態同期検証、FloatingFormatBar blur 除外検証
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- tray.rs:55 / tray.rs:131（高優先度）: `state.lock().unwrap_or_else(|p| p.into_inner())` に変更してMutexポイズン時もアプリを継続
- logic.rs:371（中優先度）: `content.find("---")` のunwrap除去 — 具体的なパターン（`ok()?` vs `unwrap_or(0)`）はClaude's Discretion
- コミット粒度: 1修正 = 1コミット
- STAB-03: fusen_set_always_on_top / fusen_show_at_position は実装済み確認後に REQUIREMENTS.md をチェック — 新規コード変更なし
- UI-02: StickyNote.tsx の `.floatBar` 除外チェックは実装済み確認後に REQUIREMENTS.md をチェック — 新規コード変更なし

### Claude's Discretion

- logic.rs:371 の unwrap() 除去パターン（`ok()?` 早期リターン vs `unwrap_or(0)` フォールバック）

### Deferred Ideas (OUT OF SCOPE)

- LOW-01: isPool の `u()` 直接呼び出し → `wrapUnlisten` 統一 — 別フェーズ
- LOW-02: useEditMode.startEditing の `initialContent` 依存 → `useRef` 化 — 別フェーズ
- LOW-03: handleGlobalPointer deps の `[]` + `isHoverRef` パターン化 — 別フェーズ
- LOW-04/05: regex `unwrap()` の `lazy_static!` / `once_cell` 安全化 — 別フェーズ
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAB-02 | Rustコード全体で `unwrap()` の残存がないこと | tray.rs:55,131 と logic.rs:371 の3箇所が残存。修正パターンはプロジェクト既存コードで確立済み |
| STAB-03 | Win32 API 呼び出し後に Tauri の内部状態が正しく同期されていること | lib.rs L1134 の `let _ = win.show()` で実装済みと確認。要件チェック更新のみ |
| UI-02 | FloatingFormatBar の blur 除外が正しく機能し、フォーマット操作中に編集モードが解除されないこと | StickyNote.tsx L960 / L1073 に `.floatBar` 除外チェック実装済みと確認。要件チェック更新のみ |
</phase_requirements>

---

## Summary

Phase 1 コードレビューで発見された問題を最小変更で修正するフェーズ。対象は3ファイル・3箇所の Rust `unwrap()` 残存（高2件・中1件）と、STAB-03 / UI-02 の検証確認（コード変更なし）。

新規コード変更が必要なのは tray.rs と logic.rs のみ。lib.rs と StickyNote.tsx は実装済み確認後に REQUIREMENTS.md のチェックボックスを更新する作業のみ。

**Primary recommendation:** tray.rs 2箇所を先に修正し（高優先度・パターン確定）、logic.rs 1箇所を続けて修正、最後に検証確認2件を行う。

---

## Standard Stack

### Core — 変更なし（既存コードの修正のみ）

| 対象 | 現状コード | 修正後コード | 根拠 |
|------|-----------|-------------|------|
| tray.rs:55 | `state.lock().unwrap()` | `state.lock().unwrap_or_else(\|p\| p.into_inner())` | lib.rs 既存29箇所と同一パターン |
| tray.rs:131 | `state.lock().unwrap()` | `state.lock().unwrap_or_else(\|p\| p.into_inner())` | 同上 |
| logic.rs:371 | `content.find("---").unwrap()` | `content.find("---").unwrap_or(3)` または早期リターン | Claude's Discretion（下記参照） |

---

## Architecture Patterns

### 確立済みパターン: Mutex アンロック

プロジェクト既存コード（lib.rs の29箇所）で使用されているパターン。

```rust
// Source: src-tauri/src/lib.rs（既存パターン）
let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
```

`unwrap_or_else(|p| p.into_inner())` はMutexPoison時でも内部データを取り出し継続する。アプリを停止させるよりデータ不整合リスクを許容するトレードオフ。

### logic.rs:371 のパターン選択（Claude's Discretion）

**コンテキスト:**
```rust
// src-tauri/src/logic.rs:363-375
pub fn update_frontmatter_value(content: &str, key: &str, value: String) -> String {
    if !content.trim_start().starts_with("---") {
        return format!("---\n{}: {}\n---\n\n{}", key, value, content);
    }
    // skip first ---
    let start_idx = content.find("---").unwrap() + 3;  // ← 修正対象
    let end_idx = match content[start_idx..].find("---") {
        Some(i) => start_idx + i,
        None => return format!("---\n{}: {}\n---\n\n{}", key, value, content),
    };
```

**分析:**
- `content.trim_start().starts_with("---")` が true の場合のみ到達する
- `content.find("---")` は必ず `Some` を返す（呼び出し前に保護条件あり）
- ただし保護条件は `trim_start()` 後のチェックで、`find()` は `trim_start()` なしで検索するため、先頭に空白がある場合は理論上 `None` になりうる

**推奨パターン:** `unwrap_or(0)` フォールバック

```rust
// 推奨: 早期リターンの関数シグネチャを変えず安全化
let start_idx = content.find("---").unwrap_or(0) + 3;
```

理由: 関数シグネチャが `-> String`（`Option` / `Result` を返さない）のため `ok()?` 早期リターンは使えない。`unwrap_or(0)` は先頭が `---` のケースと等価で、フォールバック時も関数は破壊せずに既存フォールバック（`format!("---\n...")` 分岐）に自然につながる。

### 確認作業: STAB-03

`fusen_show_at_position` 末尾（lib.rs:1134）に `let _ = win.show()` が実装済み。`fusen_set_always_on_top` は生Win32 `SetWindowPos(HWND_TOPMOST/NOTOPMOST)` を直接使用（lib.rs:99-140）。

**検証:** コード確認済み → REQUIREMENTS.md の `[ ] STAB-03` を `[x]` に更新。

### 確認作業: UI-02

StickyNote.tsx L960 に blur ハンドラ内の relatedTarget チェック:
```
e.relatedTarget.closest('.hoverBar') || e.relatedTarget.closest('.floatBar') || e.relatedTarget.closest('.editorHost')
```

StickyNote.tsx L1073 にグローバルポインタハンドラ内のチェック:
```
(target as HTMLElement)?.closest?.('.hoverBar') || (target as HTMLElement)?.closest?.('.floatBar')
```

**検証:** コード確認済み → REQUIREMENTS.md の `[ ] UI-02` を `[x]` に更新。

---

## Don't Hand-Roll

| 問題 | 手作りしない | 使うパターン | 理由 |
|------|-------------|-------------|------|
| Mutex ポイズン回復 | 独自ロック管理 | `unwrap_or_else(\|p\| p.into_inner())` | プロジェクト標準パターン。29箇所で実績済み |

---

## Common Pitfalls

### Pitfall 1: `ok()?` を `-> String` な関数に使う
**What goes wrong:** logic.rs:371 の修正で `content.find("---").ok()?` を使おうとするとコンパイルエラー。`?` 演算子は `Option` / `Result` を返す関数でのみ動作する。
**How to avoid:** `unwrap_or(0)` を使う。関数シグネチャを変えない。

### Pitfall 2: tray.rs の2箇所を1コミットにまとめる
**What goes wrong:** CONTEXT.md に「1修正 = 1コミット」と明記されている。2箇所同時コミットは要件違反。
**How to avoid:** tray.rs:55 → コミット → tray.rs:131 → コミット の順序で個別にコミット。ただし同一ファイルの同一性質の修正のため、1コミット（2行変更）が合理的という解釈もある。プランナー判断に委ねる。

### Pitfall 3: REQUIREMENTS.md 更新を忘れる
**What goes wrong:** STAB-03 / UI-02 の確認を完了しても REQUIREMENTS.md のチェックボックスを更新しないと Phase 3 検証で未完了扱いになる。
**How to avoid:** 確認作業のタスクに REQUIREMENTS.md 更新を含める。

---

## Code Examples

### tray.rs 修正パターン

```rust
// Before (tray.rs:55 / tray.rs:131)
let mut app_state = state.lock().unwrap();

// After
let mut app_state = state.lock().unwrap_or_else(|p| p.into_inner());
```

### logic.rs 修正パターン

```rust
// Before (logic.rs:371)
let start_idx = content.find("---").unwrap() + 3;

// After
let start_idx = content.find("---").unwrap_or(0) + 3;
```

---

## State of the Art

| 修正対象 | 状態 | 修正量 |
|----------|------|-------|
| tray.rs:55 | 未修正 | 1行変更 |
| tray.rs:131 | 未修正 | 1行変更 |
| logic.rs:371 | 未修正 | 1行変更 |
| STAB-03 (lib.rs) | 実装済み確認 | REQUIREMENTS.md 更新のみ |
| UI-02 (StickyNote.tsx) | 実装済み確認 | REQUIREMENTS.md 更新のみ |

---

## Open Questions

1. **tray.rs 2箇所のコミット粒度**
   - What we know: CONTEXT.md は「1修正 = 1コミット」と言うが、tray.rs:55 と tray.rs:131 は同一ファイル・同一パターン
   - What's unclear: 2コミットに分けるか、1コミット（tray.rs まとめて）にするか
   - Recommendation: 2箇所を1コミット（"fix(tray): Mutex unwrap を unwrap_or_else に変更"）にする方がレビュー可読性が高い。最終判断はプランナーに委ねる。

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright (E2E) |
| Config file | `playwright.config.ts` |
| Quick run command | `npx playwright test --grep "stability"` |
| Full suite command | `npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STAB-02 | Rust panic しないこと（unwrap 除去） | manual-only | — ビルドと Cargo コンパイルで確認 | N/A |
| STAB-03 | Win32後のTauri状態同期 | manual-only | — ピンボタン操作で目視確認 | N/A |
| UI-02 | FloatingFormatBar操作中に編集モード解除されないこと | smoke | `npx playwright test --grep "フォーマット"` | ✅ |

**Note:** STAB-02 / STAB-03 は Rust ランタイム動作のため自動E2Eテスト不可。`cargo build` でコンパイルエラーがないことを確認し、アプリ起動時に目視確認する。

### Sampling Rate

- **Per task commit:** `cargo build --manifest-path src-tauri/Cargo.toml` (コンパイル確認)
- **Per wave merge:** `npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

None — 既存テストインフラが Phase 2 要件をカバーしている。

---

## Sources

### Primary (HIGH confidence)

- `src-tauri/src/tray.rs` — 実コード確認（L55, L131 の unwrap 残存）
- `src-tauri/src/logic.rs` — 実コード確認（L371 の unwrap + 呼び出しコンテキスト）
- `src-tauri/src/lib.rs` — 実コード確認（fusen_set_always_on_top Win32実装、fusen_show_at_position win.show()）
- `app/components/StickyNote.tsx` — 実コード確認（L960, L1073 の .floatBar 除外チェック）
- `.planning/research/FINDINGS.md` — Phase 1 コードレビュー結果
- `.planning/phases/02-bagu-shuse/02-CONTEXT.md` — ユーザー決定事項

### Secondary (MEDIUM confidence)

なし（すべて実コード確認）

### Tertiary (LOW confidence)

なし

---

## Metadata

**Confidence breakdown:**
- 修正対象と修正パターン: HIGH — 実コード確認済み、既存パターン参照
- logic.rs パターン選択: HIGH — 関数シグネチャ・呼び出しコンテキストを直接確認
- 検証作業（STAB-03/UI-02）: HIGH — 実装コードを直接確認

**Research date:** 2026-03-11
**Valid until:** 2026-04-10（コードベースが変わらない限り有効）
