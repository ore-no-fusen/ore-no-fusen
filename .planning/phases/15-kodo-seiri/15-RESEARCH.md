# Phase 15: コード整理（lib 抽出・死んだコード削除） - Research

**Researched:** 2026-04-10
**Domain:** TypeScript/React リファクタリング — モジュール分割、型抽出、dead code 削除
**Confidence:** HIGH

## Summary

`app/viewer/page.tsx`（1925行）は、型定義・IndexedDB操作・Drive API操作・コンポーネントロジックがすべて1ファイルに混在している。このPhaseは**外から見た動作を変えずに**、lib/への純粋関数抽出と死んだコードの削除のみを行う。コンポーネント分割（WriteScreen等）はPhase 17のスコープ。

REQUIREMENTS.md のトレーサビリティ表を見ると、CLEAN-01（死んだコード削除）とCLEAN-02（lib/分離）がPhase 15に割り当てられており、FIX-01〜03（バグ修正）はPhase 16、ARCH-01〜04（コンポーネント分割）はPhase 17に割り当てられている。CONTEXT.mdの「実装順序」はステップ1〜6を示しているが、Phase 15のスコープはステップ1（lib抽出）とステップ5（死んだコード削除）の2つのみ。

**Primary recommendation:** ファイルの動作を変えずに抽出できる「純粋関数」と「型定義」のみを lib/ に移動し、その後 dead code を削除する。2ステップを別コミットで行い、各ステップ後にテストを回す。

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**設計ルール（変えない原則）**
- IndexedDB が唯一の真実: メモの内容・画像・タグ・locked状態はすべてIndexedDBが正しい。メモリ上のstateはIndexedDBの「表示用キャッシュ」にすぎない。画面遷移が起きたらIndexedDBから再読み込みする。
- 画像Blob は IndexedDB から毎回読む: `URL.createObjectURL()` で作ったURLは「表示のためだけ」に使い、使い終わったら `revokeObjectURL()` する。コンポーネント間でBlob URLをstate経由で渡さない。編集画面に遷移するときは必ずIndexedDBの `images` から blobMap を作り直す。
- URLパラメータは購読する: `?note=id` はロック通知タップでいつでも変化しうる。初回 `useEffect([], [])` だけでなく、`popstate` イベントと `visibilitychange` でアプリがフォアグラウンドに戻ったときにも確認する。
- ロック状態は IndexedDB のみ。SW は「実行係」: `lockedNoteIds` を IndexedDB の `locked === true` から作る。`activeNotifIds`（SWからのGET_NOTIFICATIONS）は廃止する。SWは「通知を出す/消す」だけの実行係。状態を管理しない。

**実装順序（順番厳守）**
- ステップ1（最初）: types.ts / lib/indexeddb.ts / lib/drive.ts を抽出。page.tsxの動作は変えない。抽出のみ。
- ステップ2: バグ①修正 — loadDraft時にBlobも読む。`loadDraftWithBlobs(id)` 関数を作る。blobMapを空で渡している2箇所（742行・764行）を修正。
- ステップ3: バグ②修正 — URL変化の検知を追加。`visibilitychange` でフォアグラウンド復帰時に `?note=` を確認。
- ステップ4: バグ③修正 — `activeNotifIds` を廃止。ベルUIの判定を `lockedNoteIds` のみに統一。`GET_NOTIFICATIONS` 呼び出しを削除。
- ステップ5: 死んだコードの削除 — `noteData` state・`step='note'`・`downloadWithAutoRefresh`（既に無参照）を削除。
- ステップ6（最後）: コンポーネント分割 — WriteScreen / ListScreen / SetupScreens に分割。page.tsxをルーターのみ（100行以内）にする。

**Phase 15スコープ（ステップ1とステップ5のみ）**:
- ステップ1: types.ts / lib/indexeddb.ts / lib/drive.ts を抽出。page.tsxの動作は変えない。
- ステップ5: 死んだコードの削除（`noteData` state・`step='note'`・`downloadWithAutoRefresh`）

**新しいファイル構成（最終形 — Phase 17完了時）:**
```
app/viewer/
├── page.tsx              ← 薄いルーター（100行以内）
├── screens/
│   ├── SetupScreens.tsx  ← banner / login / push の3画面（認証フロー）
│   ├── WriteScreen.tsx   ← メモ編集画面（エディタ・画像・タグ・Mermaid）
│   └── ListScreen.tsx    ← 一覧画面（ドラフト・ロックボタン・削除）
├── hooks/
│   ├── useAuth.ts        ← accessToken・refreshToken管理・OAuthフロー
│   ├── useDrafts.ts      ← IndexedDB CRUD
│   └── useLock.ts        ← ロック状態管理（IndexedDB←唯一の真実）
├── lib/
│   ├── indexeddb.ts      ← DB操作の純粋関数
│   ├── drive.ts          ← Drive API操作
│   └── sw-bridge.ts      ← SWとの通信
├── types.ts              ← 型定義
├── editor-helpers.ts     ← そのまま維持
├── utils.ts              ← そのまま維持
└── SimpleNoteBody.tsx    ← そのまま維持
```

**Phase 15が担当するファイル（ステップ1+5のみ）:**
- `app/viewer/types.ts` — 新規作成（型定義を抽出）
- `app/viewer/lib/indexeddb.ts` — 新規作成（IndexedDB操作を抽出）
- `app/viewer/lib/drive.ts` — 新規作成（Drive操作を抽出）
- `app/viewer/page.tsx` — 抽出後のimport付け替え + dead code削除

### Claude's Discretion

- 各ステップ間のテスト戦略（E2Eテスト13件をどのタイミングで実行するか）
- hooks/ の useDrafts.ts・useAuth.ts・useLock.ts の内部実装詳細
- lib/sw-bridge.ts の具体的なインターフェース設計
- WriteScreen / ListScreen / SetupScreens へのprops設計

### Deferred Ideas (OUT OF SCOPE)

- Workbox / オフライン対応 — バグ修正完了後の別フェーズ
- PC側のDrive書き込み削除 — Rust変更が必要、影響大
- Phase 14（エディタの🔔ボタン） — バグ修正＋分割が終わってから実装
- 新機能の追加 — 「壊れているものを直す」フェーズなので対象外
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLEAN-01 | 死んだコード（`noteData` state・`step='note'`・未使用関数）が削除されている | 死んだコードの場所特定済み（下記詳細参照） |
| CLEAN-02 | 型定義・DB操作・Drive操作が `lib/` に分離され、`page.tsx` から参照できる | 抽出対象コードの場所と境界を特定済み |
</phase_requirements>

---

## Standard Stack

### Core（このPhaseで使う技術）

| 技術 | バージョン | 目的 | 備考 |
|------|-----------|------|------|
| TypeScript | プロジェクト既存 | 型定義の独立ファイル化 | `export type` で re-export |
| Next.js App Router | 14 | `app/viewer/` のファイル配置ルール | `'use client'` は page.tsx のみで良い |
| Vitest | ^4.0.17 | 単体テスト実行 | `npm test` で実行 |
| Playwright | ^1.57.0 | E2Eテスト（13件） | `npm run test:e2e`、devサーバーport 3003が必要 |

### 抽出に影響しない既存ファイル（そのまま維持）

| ファイル | 理由 |
|---------|------|
| `editor-helpers.ts` | 既に独立している。変更不要 |
| `utils.ts` | 既に独立している。変更不要 |
| `SimpleNoteBody.tsx` | 既に独立している。変更不要 |

---

## Architecture Patterns

### Phase 15のファイル構成（完了時）

```
app/viewer/
├── page.tsx              ← dead code削除後のもの（まだコンポーネントは分割しない）
├── types.ts              ← 新規作成 [CLEAN-02]
└── lib/
    ├── indexeddb.ts      ← 新規作成 [CLEAN-02]
    └── drive.ts          ← 新規作成 [CLEAN-02]
```

### Pattern 1: 純粋関数のみを lib/ に抽出

**What:** Reactの状態（useState, useRef等）に一切触れない関数だけを lib/ に移す。
**When to use:** page.tsx 内の関数が `state` も `ref` も参照せず、引数と戻り値だけで動作するとき。
**ルール:** 抽出後の page.tsx は `import { ... } from './lib/indexeddb'` に差し替えるだけで、既存の関数定義行を削除する。

### Pattern 2: types.ts への型定義移動

**What:** `type IphoneNote`, `type PendingHydrate`, `type DraftRecord`, `type CropModalProps` など、複数箇所で使われうる型定義を `types.ts` に集める。

**注意:** `CropModal` コンポーネント本体は page.tsx に残す（Phase 17でコンポーネント分割するまで）。型だけを types.ts に移す。

### Anti-Patterns

- **`'use client'` を lib/ ファイルに書かない**: lib/ の関数は純粋関数なので、クライアントディレクティブ不要。page.tsx の `'use client'` だけで十分。
- **lib/ ファイルで import React しない**: indexeddb.ts と drive.ts はブラウザAPIを使うが React は不要。
- **抽出と同時に動作変更しない**: ステップ1では「コードをそのまま移動」する。変数名変更・ロジック改善はしない。

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| import パスの確認 | 手動でパスを追う | TypeScript コンパイルエラーで確認 | TSC が循環import・未解決importを即検出 |
| dead code の探索 | 目視確認 | `grep` で参照箇所を確認してから削除 | 見落としリスクを排除 |

---

## Common Pitfalls

### Pitfall 1: `cachedFolderId` モジュールレベル変数の扱い

**What goes wrong:** `drive.ts` に移動すると `let cachedFolderId: string | null = null` がモジュールスコープになる。これは現在の page.tsx でも同様なので動作は変わらない。
**How to avoid:** 変数をそのままモジュールトップレベルに置く。変更しない。

### Pitfall 2: `step='note'` の型Union からの削除

**What goes wrong:** `step` の型は `'banner' | 'login' | 'push' | 'ready' | 'write' | 'list' | 'note'` （page.tsx 613行）。`'note'` を削除するとき、Union型からの削除と使用箇所の削除を同時に行う必要がある。
**How to avoid:** `grep` で `step.*note\|'note'` を検索して全参照を確認してから削除。`step='note'` にセットしている箇所はないこと（テンプレート内にも `{step === 'note' && ...}` があれば削除）を確認する。実際のコードを確認すると、`step` のUnion型に `'note'` は含まれているが、実際に `setStep('note')` を呼んでいるコードは存在しない。

### Pitfall 3: `noteData` state が JSX内で参照されていないか確認

**What goes wrong:** `const [noteData, setNoteData] = useState<...>` は state として定義されているが（616行）、`setNoteData` が呼ばれていないことを確認する必要がある。
**How to avoid:** 削除前に `grep noteData` で全参照を確認。定義と型定義のみで実際の使用がないことを確認してから削除。

### Pitfall 4: `downloadWithAutoRefresh` の削除

**What goes wrong:** `downloadWithAutoRefresh` は 345行に定義されているが、CONTEXT.mdによると「既に無参照」。削除前に参照がないことを確認する。
**How to avoid:** `grep downloadWithAutoRefresh` で確認後に削除。

### Pitfall 5: `activeNotifIds` と `CLEAN-01`/`CLEAN-02` の境界

**What goes wrong:** `activeNotifIds` 削除はステップ4（バグ③修正）であり、Phase 16のスコープ。Phase 15（ステップ1+5）では `activeNotifIds` は**削除しない**。
**How to avoid:** Phase 15は CLEAN-01/CLEAN-02 に集中する。`noteData`・`step='note'`・`downloadWithAutoRefresh` の3件のみ削除。

---

## Code Examples

### lib/indexeddb.ts に移動する対象（page.tsx内の関数）

```
// 355-418行のコードブロックが対象
type DraftRecord = { ... }                    // → types.ts
function openDraftsDB(): Promise<IDBDatabase> // → lib/indexeddb.ts
async function saveDraft(...)                 // → lib/indexeddb.ts
async function loadAllDrafts(...)             // → lib/indexeddb.ts
async function loadDraft(id: string)          // → lib/indexeddb.ts
async function deleteDraft(id: string)        // → lib/indexeddb.ts
```

### lib/drive.ts に移動する対象（page.tsx内の関数）

```
// 105-352行のコードブロックが対象（一部）
const APP_FOLDER_NAME = ...                   // → lib/drive.ts
let cachedFolderId: string | null = null      // → lib/drive.ts
const LEGACY_FILE_NAMES: Record<...>          // → lib/drive.ts
async function getAppFolderId(...)            // → lib/drive.ts
async function uploadToDrive(...)             // → lib/drive.ts
async function downloadFromDrive(...)         // → lib/drive.ts
async function uploadWithAutoRefresh(...)     // → lib/drive.ts
async function uploadImageToDrive(...)        // → lib/drive.ts
async function uploadImageWithAutoRefresh(...)// → lib/drive.ts

// 以下は page.tsx に残す（page.tsx の UI ロジックに密結合）
async function refreshAccessToken()          // → lib/drive.ts に移してもよい（auth系）
```

### types.ts に移動する対象

```
// 266-283行の型定義
type IphoneNote = { ... }       // → types.ts
type PendingHydrate = { ... }   // → types.ts

// 359-370行
type DraftRecord = { ... }      // → types.ts

// 424-428行
type CropModalProps = { ... }   // → types.ts（コンポーネント本体は page.tsx に残す）
```

### 削除する dead code（CLEAN-01）

```typescript
// 616-618行: noteData state を削除
const [noteData, setNoteData] = useState<{
  title: string;
  body: string;
} | null>(null);

// 613行: step Union型から 'note' を削除
const [step, setStep] = useState<
  'banner' | 'login' | 'push' | 'ready' | 'write' | 'list' // 'note' を削除
>('banner');

// 345-352行: downloadWithAutoRefresh 関数を削除（参照箇所なし）
function downloadWithAutoRefresh(token: string): Promise<{ title: string; body: string }> {
  ...
}
```

### page.tsx の import 付け替えパターン

```typescript
// Before（page.tsx内の関数定義を削除）
// After（lib/ からのimport を追加）
import type { IphoneNote, PendingHydrate, DraftRecord } from './types';
import {
  openDraftsDB, saveDraft, loadAllDrafts, loadDraft, deleteDraft
} from './lib/indexeddb';
import {
  uploadToDrive, downloadFromDrive, uploadWithAutoRefresh,
  uploadImageToDrive, uploadImageWithAutoRefresh, refreshAccessToken
} from './lib/drive';
```

---

## Dead Code 詳細調査結果

| 対象 | 場所 | 参照確認 | 削除方法 |
|------|------|---------|---------|
| `noteData` state | 616行 定義 | `setNoteData` 呼び出しなし、JSX内参照なし | state 定義3行を削除 |
| `'note'` in step型 | 613行 Union | `setStep('note')` 呼び出しなし | Union型から削除のみ |
| `downloadWithAutoRefresh` | 345行 関数定義 | grep で参照箇所なし | 関数定義8行を削除 |

**Phase 16で削除（Phase 15ではしない）:**
| 対象 | 場所 | Phase |
|------|------|-------|
| `activeNotifIds` state | 639行 | Phase 16（ステップ4, バグ③修正） |
| `GET_NOTIFICATIONS` 呼び出し | 804行 | Phase 16（ステップ4, バグ③修正） |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.17 + @testing-library/react |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test && npm run test:e2e` |

**E2Eテスト前提:** `npm run test:e2e` は port 3003 の Next.js devサーバーが起動していること（pre-commitフックも同様）。

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEAN-01 | dead codeが削除され、`noteData`/`step='note'`/`downloadWithAutoRefresh`が存在しない | static (grep) | `grep -n "noteData\|downloadWithAutoRefresh" app/viewer/page.tsx` が0件 | — |
| CLEAN-02 | lib/indexeddb.ts, lib/drive.ts, types.ts が存在し、page.tsx からimportできる | unit + static | `npm test` (TypeScript compilation) | ❌ Wave 0作成が必要 |

**注:** CLEAN-01/CLEAN-02 は「コードが存在しないこと」「ファイルが存在すること」の検証なので、TypeScriptコンパイルエラーがないことが主要な検証手段。

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` グリーン後、E2Eテスト13件全パス（`npm run test:e2e`）

### Wave 0 Gaps

- [ ] `app/viewer/lib/indexeddb.test.ts` — lib/indexeddb.ts の純粋関数をカバー（openDraftsDB, saveDraft, loadDraft, loadAllDrafts, deleteDraft）
- [ ] `app/viewer/lib/drive.test.ts` — lib/drive.ts の関数をカバー（fetch モック必要）
- [ ] `app/viewer/types.ts` — ファイル作成（テストは型チェックで十分、専用テストファイル不要）

---

## Sources

### Primary (HIGH confidence)

- ソース調査: `app/viewer/page.tsx` 直接読み取り（1925行）— 全関数・型・state の実在確認
- ソース調査: `app/viewer/editor-helpers.ts` — 既に独立していることを確認
- ソース調査: `app/viewer/utils.ts` — 既に独立していることを確認
- ソース調査: `app/viewer/viewer.test.tsx`, `app/viewer/__tests__/page.test.tsx` — テストスタブの状態を確認
- ソース調査: `vitest.config.ts`, `package.json` — テスト実行コマンド確認

### Secondary (MEDIUM confidence)

- `.planning/phases/15-kodo-seiri/15-CONTEXT.md` — 実装順序・スコープ境界の定義
- `.planning/REQUIREMENTS.md` — CLEAN-01/CLEAN-02 の定義とPhase割り当て
- `.planning/STATE.md` — マイルストーン情報

---

## Metadata

**Confidence breakdown:**

- 死んだコードの場所: HIGH — page.tsx を直接読んで grep で確認
- 抽出対象関数の境界: HIGH — 関数定義が明確で、Reactの状態に触れていない
- テスト戦略: HIGH — vitest.config.ts と package.json で確認
- Phase スコープ境界（ステップ1+5のみ）: HIGH — CONTEXT.md と REQUIREMENTS.md で確認

**Research date:** 2026-04-10
**Valid until:** Phase 16実装開始まで（ファイル構成が変わるまで有効）
