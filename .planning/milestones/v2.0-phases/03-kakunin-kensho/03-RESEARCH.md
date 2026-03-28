# Phase 3: 確認・検証 - Research

**Researched:** 2026-03-11
**Domain:** テスト実行・回帰確認（Playwright E2E / Vitest unit / Tauri build）
**Confidence:** HIGH

## Summary

Phase 3 は新機能追加なし・検証専用フェーズ。Phase 2 で施した3箇所の修正（tray.rs:55, tray.rs:131, logic.rs:371）に対して、既存テストスイートを実行して回帰がないことを確認し、手動テストで修正箇所の動作を確認する。

テストインフラはすでに整備済み。Playwright 13件（ポート3003固定）・Vitest 5ファイル・Tauri ビルドの3種類を順に実行するだけでよい。修正が必要な場合は最小変更のみ。手動で新たな回帰を発見した場合は修正せず記録のみ行い Phase 4 以降に委ねる。

**Primary recommendation:** `npx playwright test` → `npm run test` → ビルド確認 → 手動確認の順で実行し、各ステップの結果を記録する。

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Playwright / vitest 失敗**: Phase 3 内でその場で修正する（小さな修正のみ）。大規模な修正が必要な場合は別フェーズに切り出す。
- **Tauri ビルド失敗**: コンパイルエラー等の小さな問題はその場で修正する。大規模な問題は別フェーズに移す。
- **手動テストで新たな回帰発見**: その場では修正しない。内容を記録して Phase 4 以降で対処する。
- Phase 3 内での修正は最小変更のみ（CLAUDE.md ルール準拠）
- 修正が必要な場合でも、FINDINGS.md 相当の記録を残してから着手する

### Claude's Discretion
- vitest コマンドの存在確認と実行方法の調整
- Playwright のポート設定（MEMORY.md 記載: PC再起動後は3002、ゾンビソケットがある場合は3003）
- 手動テストの具体的なシナリオ選定（修正3箇所を中心に）
- 回帰発見時の記録フォーマット

### Deferred Ideas (OUT OF SCOPE)
- LOW-01〜05（Phase 2 から持ち越し）: wrapUnlisten 統一・useRef 化・regex unwrap 安全化 — 別フェーズ
- 手動テストで新たな回帰が発見された場合の修正 — Phase 4 以降
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAB-01 | Listener Leak が新たに発生していないこと | Playwright E2E テスト 全13件 + vitest でカバー |
| STAB-02 | Rust コード全体で `unwrap()` の残存がないこと | tray.rs / logic.rs の修正済みコードを `cargo check` + Tauri ビルドで確認 |
| STAB-03 | Win32 API 呼び出し後に Tauri の内部状態が正しく同期されていること | 手動テスト（ピンボタン操作）でウィンドウ消失が起きないことを確認 |
| DATA-01 | 空 body によるノートデータ上書きが発生しないこと | Playwright E2E テスト（3.1, 3.2 保存系）でカバー |
| DATA-02 | ノートロード時の競合状態がないこと | Playwright E2E テスト全13件 + 手動テストでカバー |
| UI-01 | 編集開始時のカーソル位置が正しいこと | Playwright E2E テスト 1.1, 1.2 でカバー |
| UI-02 | FloatingFormatBar の blur 除外が正しく機能すること | Playwright E2E テスト 1.7, 2.1 でカバー |
</phase_requirements>

---

## Standard Stack

### Core（既存・変更なし）
| ツール | バージョン | 用途 |
|--------|-----------|------|
| Playwright | ^1.57.0 | E2E テスト（13件） |
| Vitest | ^4.0.17 | Unit テスト（5ファイル） |
| @tauri-apps/cli | ^2.9.6 | Tauri ビルド |

### テストコマンド早見表
| コマンド | 内容 | 所要時間目安 |
|---------|------|------------|
| `npx playwright test` | E2E 13件（ポート3003） | 1〜2分 |
| `npm run test` | vitest 全ファイル | 30秒以内 |
| `npm run tauri build` | Rust + Next.js ビルド | 5〜10分 |

## Architecture Patterns

### テスト実行順序（推奨）
1. **Vitest（高速・副作用なし）** — 先に実行して unit レベルの壊れを検出
2. **Playwright E2E** — ポート3003 で dev server が自動起動（playwright.config.ts 設定済み）
3. **Tauri ビルド** — 最も時間がかかる。Rust コンパイルで unwrap 残存を最終確認
4. **手動テスト** — 修正3箇所を中心に実施

### ポート設定（MEMORY.md 確認済み）
- playwright.config.ts は **ポート3003** に固定済み（`baseURL: 'http://localhost:3003'`・`command: 'npm run dev -- -p 3003'`）
- Tauri ビルド後にゾンビソケットが残る場合は3003のまま
- PC 再起動後は `next.config.mjs` または playwright.config.ts を3002に戻してよい（ユーザー裁量）

### 手動テストシナリオ（修正3箇所を中心に）
1. **tray.rs:55,131（Mutex ポイズン対応）**
   - トレイアイコン右クリック → メニュー表示 → 正常動作確認
   - 複数の付箋を開いた状態でトレイ操作 → クラッシュしないことを確認
2. **logic.rs:371（frontmatter なしノートの行数計算）**
   - frontmatter なしのノートを開く → 行ジャンプ動作の確認
   - 空のノートでの動作確認
3. **STAB-03（ピンボタン後ウィンドウ消失）**
   - 新規付箋作成 → ピンボタン押下 → ウィンドウが消えないことを確認

### 回帰発見時の記録フォーマット
```
## 発見した回帰（Phase 3 手動テスト）

| # | 発見日 | 操作 | 期待 | 実際 | 関連ファイル | 深刻度 |
|---|--------|------|------|------|------------|--------|
| 1 | 2026-03-11 | [操作内容] | [期待動作] | [実際の動作] | [ファイル] | HIGH/MED/LOW |

→ Phase 4 以降で対処
```

## Don't Hand-Roll

| 問題 | カスタム実装禁止 | 使うもの | 理由 |
|------|----------------|---------|------|
| E2E テスト | 独自スクリプト | `npx playwright test` | 設定済み・mock-tauri.ts も整備済み |
| ユニットテスト | 独自テストランナー | `npm run test` | vitest 設定済み |
| Rust コンパイル確認 | 手動コード読み | `cargo check` / `npm run tauri build` | コンパイラが確実 |

## Common Pitfalls

### Pitfall 1: Tauri ビルド後の Next.js キャッシュ破損
**What goes wrong:** `npm run tauri build` 後に Playwright テストが全件失敗する
**Why it happens:** Tauri ビルドが Next.js のキャッシュを破壊することがある
**How to avoid:** ビルド後にテストが失敗したら `npx next dev -p 3003` を再起動する
**Warning signs:** テストが全件 "page not found" や connection refused で失敗

### Pitfall 2: ポートの不一致
**What goes wrong:** playwright.config.ts は3003固定だが `npm run dev` はデフォルト3002
**Why it happens:** package.json の `dev` スクリプトは `-p 3002` だが、playwright.config.ts は `npm run dev -- -p 3003` を起動する
**How to avoid:** `reuseExistingServer` が true のため、3003でサーバーが起動していれば自動再利用。手動で3002で起動していると playwright が3003への接続に失敗する
**Warning signs:** "could not connect to localhost:3003"

### Pitfall 3: 手動テスト中に修正してしまう
**What goes wrong:** 回帰を発見したとき「ついでに直そう」と修正を始める
**Why it happens:** エンジニアの本能
**How to avoid:** CONTEXT.md ルール: 手動テスト中の新たな回帰は記録のみ、修正は Phase 4 以降
**Warning signs:** 修正しようとしている自分に気づいたら止める

### Pitfall 4: vitest の coverage 閾値
**What goes wrong:** `npm run test:coverage` が閾値（lines:30, functions:30, branches:20）を下回って失敗する
**Why it happens:** Phase 3 は新規テスト追加なし。カバレッジが下がることはないが注意
**How to avoid:** `npm run test`（`vitest run`）を使う。coverage 実行は不要

## Code Examples

### Playwright 実行（ポート確認付き）
```bash
# Source: playwright.config.ts（プロジェクト内）
# reuseExistingServer: true なので既存サーバーを再利用
npx playwright test

# 特定テストのみ実行
npx playwright test --grep "すぐ書ける"

# デバッグ付き実行
npx playwright test --debug
```

### Vitest 実行
```bash
# Source: package.json scripts.test
npm run test          # vitest run（全件・1回実行）
npm run test:watch    # vitest（watch モード）
```

### Tauri ビルド（Windows）
```bash
# Source: package.json scripts.tauri
npm run tauri build
# または
npm run release       # ビルド + generate-latest-json
```

### 手動確認用 cargo check（Rust のみ）
```bash
cd src-tauri
cargo check
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| E2E Framework | Playwright ^1.57.0 |
| Unit Framework | Vitest ^4.0.17 |
| E2E Config | `playwright.config.ts` |
| Unit Config | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npx playwright test && npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STAB-01 | Listener Leak なし | E2E | `npx playwright test` (全13件) | ✅ e2e/sticky-note.spec.ts |
| STAB-02 | Rust unwrap 残存なし | Build | `npm run tauri build` | ✅ src-tauri/src/tray.rs, logic.rs |
| STAB-03 | Win32/Tauri 状態同期 | Manual | 手動: ピンボタン操作 | manual-only |
| DATA-01 | 空body上書きなし | E2E | `npx playwright test --grep "保存"` | ✅ e2e/sticky-note.spec.ts (3.1, 3.2) |
| DATA-02 | race condition なし | E2E | `npx playwright test` | ✅ e2e/sticky-note.spec.ts |
| UI-01 | カーソル位置正確 | E2E | `npx playwright test --grep "すぐ書ける"` | ✅ e2e/sticky-note.spec.ts (1.1, 1.2) |
| UI-02 | FloatingFormatBar blur 除外 | E2E | `npx playwright test --grep "書式"` | ✅ e2e/sticky-note.spec.ts (1.7, 2.1) |

**manual-only 理由（STAB-03）:** Tauri の Win32 API 呼び出し後のウィンドウ可視性はブラウザベース E2E では検証不可。実Tauri環境での手動確認が必要。

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npx playwright test && npm run test`
- **Phase gate:** Playwright 全13件 + vitest 全件グリーン + Tauri ビルド成功 + 手動テスト完了

### Wave 0 Gaps
None — 既存テストインフラが全フェーズ要件をカバーしている。新規テストファイルの作成は不要。

## Sources

### Primary (HIGH confidence)
- `playwright.config.ts`（プロジェクト内）— ポート・コマンド・設定を直接確認
- `vitest.config.ts`（プロジェクト内）— テスト環境・include パターン確認
- `package.json`（プロジェクト内）— スクリプト・バージョン確認
- `e2e/sticky-note.spec.ts`（プロジェクト内）— 13件の内容確認
- `.planning/phases/03-kakunin-kensho/03-CONTEXT.md`（プロジェクト内）— ユーザー決定事項確認

### Secondary (MEDIUM confidence)
- `MEMORY.md`（ユーザーメモリ）— ポートゾンビ・キャッシュ破損の既知パターン

## Metadata

**Confidence breakdown:**
- テストコマンド: HIGH — 設定ファイルを直接確認
- 手動テストシナリオ: HIGH — CONTEXT.md の修正箇所から直接導出
- ビルド手順: HIGH — package.json scripts から確認
- Pitfalls: HIGH — MEMORY.md の既知パターン + 設定ファイルから確認

**Research date:** 2026-03-11
**Valid until:** 2026-04-11（依存関係バージョン固定のため安定）
