# Phase 3: 確認・検証 - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 で施した修正（tray.rs ×2・logic.rs ×1）に対して回帰テストと動作確認を行い、全7要件（STAB-01〜03, DATA-01〜02, UI-01〜02）を満たす状態を確認する。新機能追加・リファクタリングはスコープ外。

</domain>

<decisions>
## Implementation Decisions

### テスト失敗時の対応方針
- **Playwright / vitest 失敗**: Phase 3 内でその場で修正する（小さな修正のみ）。大規模な修正が必要な場合は別フェーズに切り出す。
- **Tauri ビルド失敗**: コンパイルエラー等の小さな問題はその場で修正する。大規模な問題は別フェーズに移す。
- **手動テストで新たな回帰発見**: その場では修正しない。内容を記録して Phase 4 以降で対処する。

### 修正規模の上限
- Phase 3 内での修正は最小変更のみ（CLAUDE.md ルール準拠）
- 修正が必要な場合でも、FINDINGS.md 相当の記録を残してから着手する

### Claude's Discretion
- vitest コマンドの存在確認と実行方法の調整
- Playwright のポート設定（MEMORY.md 記載: PC再起動後は3002、ゾンビソケットがある場合は3003）
- 手動テストの具体的なシナリオ選定（修正3箇所を中心に）
- 回帰発見時の記録フォーマット

</decisions>

<code_context>
## Existing Code Insights

### 修正済みファイル（確認対象）
- `src-tauri/src/tray.rs:55,131`: `unwrap_or_else(|p| p.into_inner())` に修正済み
- `src-tauri/src/logic.rs:371`: `unwrap_or(0)` に修正済み

### テスト環境
- Playwright E2E: `npx playwright test`（13件、ポート3002 or 3003）
- Unit tests: `npm run test`（vitest）
- Tauri ビルド: `npm run tauri build`

### Established Patterns
- CLAUDE.md: 最小修正ルール（問題を解決する最小変更のみ）
- Phase 2 のコミット粒度: 1修正 = 1コミット

</code_context>

<specifics>
## Specific Ideas

- Playwright のポート設定は MEMORY.md に記録済み（PC再起動後は3002 に戻してよい）
- 手動テストの重点: tray.rs 修正（Mutexポイズン時の継続動作）・logic.rs 修正（frontmatterなしノートの扱い）

</specifics>

<deferred>
## Deferred Ideas

- LOW-01〜05（Phase 2 から持ち越し）: wrapUnlisten 統一・useRef 化・regex unwrap 安全化 — 別フェーズ
- 手動テストで新たな回帰が発見された場合の修正 — Phase 4 以降

</deferred>

---

*Phase: 03-kakunin-kensho*
*Context gathered: 2026-03-11*
