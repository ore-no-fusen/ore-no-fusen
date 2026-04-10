# Phase 15: コード整理（lib 抽出・死んだコード削除） - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Source:** PRD Express Path (docs/viewer-redesign.html)

<domain>
## Phase Boundary

viewer/page.tsx（1925行）から型定義・DB操作・Drive操作を lib/ に切り出し、3つの致命的・中程度バグを修正し、死んだコードを削除する。コンポーネント分割（WriteScreen / ListScreen / SetupScreens）も含む。外から見た動作は変えない。

**スコープ外（やらないこと）:**
- Workbox / オフライン対応
- PC側のDrive書き込み削除（Rust変更が必要）
- Phase 14（エディタの🔔ボタン）
- 新機能の追加

</domain>

<decisions>
## Implementation Decisions

### 設計ルール（変えない原則）

- **IndexedDB が唯一の真実**: メモの内容・画像・タグ・locked状態はすべてIndexedDBが正しい。メモリ上のstateはIndexedDBの「表示用キャッシュ」にすぎない。画面遷移が起きたらIndexedDBから再読み込みする。
- **画像Blob は IndexedDB から毎回読む**: `URL.createObjectURL()` で作ったURLは「表示のためだけ」に使い、使い終わったら `revokeObjectURL()` する。コンポーネント間でBlob URLをstate経由で渡さない。編集画面に遷移するときは必ずIndexedDBの `images` から blobMap を作り直す。
- **URLパラメータは購読する**: `?note=id` はロック通知タップでいつでも変化しうる。初回 `useEffect([], [])` だけでなく、`popstate` イベントと `visibilitychange` でアプリがフォアグラウンドに戻ったときにも確認する。
- **ロック状態は IndexedDB のみ。SW は「実行係」**: `lockedNoteIds` を IndexedDB の `locked === true` から作る。`activeNotifIds`（SWからのGET_NOTIFICATIONS）は廃止する。SWは「通知を出す/消す」だけの実行係。状態を管理しない。

### 実装順序（順番厳守）

- **ステップ1（最初）**: types.ts / lib/indexeddb.ts / lib/drive.ts を抽出。page.tsxの動作は変えない。抽出のみ。
- **ステップ2**: バグ①修正 — loadDraft時にBlobも読む。`loadDraftWithBlobs(id)` 関数を作る。blobMapを空で渡している2箇所（742行・764行）を修正。
- **ステップ3**: バグ②修正 — URL変化の検知を追加。`visibilitychange` でフォアグラウンド復帰時に `?note=` を確認。
- **ステップ4**: バグ③修正 — `activeNotifIds` を廃止。ベルUIの判定を `lockedNoteIds` のみに統一。`GET_NOTIFICATIONS` 呼び出しを削除。
- **ステップ5**: 死んだコードの削除 — `noteData` state・`step='note'`・`downloadWithAutoRefresh`（既に無参照）を削除。
- **ステップ6（最後）**: コンポーネント分割 — WriteScreen / ListScreen / SetupScreens に分割。page.tsxをルーターのみ（100行以内）にする。

### バグ修正の具体的な設計

- **バグ①（画像が壊れる）**: `loadDraft(id).then(draft => setPendingHydrate({ blobMap: new Map() }))` の箇所を `blobMap: new Map(images.map(i => [i.fileName, i.blob]))` に修正。
- **バグ②（別の通知をタップしても反映されない）**: `visibilitychange`（アプリが前面に来たとき）と `popstate`（URLが変わったとき）を page.tsx のルーターで購読。`?note=` が変わっていれば WriteScreen に新しいIDを渡す。WriteScreen はIDが変わったら IndexedDB から再読み込みする。
- **バグ③（ロック状態の二重管理）**: ベルON判定を `lockedNoteIds.includes(id) || activeNotifIds.includes(id)` から `lockedNoteIds.includes(id)` のみに変更。`activeNotifIds` stateを完全削除。

### 新しいファイル構成

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

### Claude's Discretion

- 各ステップ間のテスト戦略（E2Eテスト13件をどのタイミングで実行するか）
- hooks/ の useDrafts.ts・useAuth.ts・useLock.ts の内部実装詳細
- lib/sw-bridge.ts の具体的なインターフェース設計
- WriteScreen / ListScreen / SetupScreens へのprops設計

</decisions>

<specifics>
## Specific Ideas

- **バグ①場所**: `loadDraft(id).then(...)` の742行・764行の2箇所
- **バグ②場所**: `useEffect(..., [])` の656行（初回マウント時のみ実行されている部分）
- **page.tsx の現在の行数**: 1925行（分割後は100行以内にする）
- **死んだコード**: `noteData` state、`step='note'`、`downloadWithAutoRefresh`（notes_to_iphone.json固定）
- **バグ③削除対象**: `GET_NOTIFICATIONS` 呼び出し、`activeNotifIds` state
- **E2Eテスト確認**: 全ステップ完了後にE2Eテスト（13件）が全パスすること
- **実機確認が必要なステップ**: 2（画像が消えないこと）、3（別通知タップで正しく切り替わること）、4（ベルON/OFF状態が正確に表示されること）

</specifics>

<deferred>
## Deferred Ideas

- Workbox / オフライン対応 — バグ修正完了後の別フェーズ
- PC側のDrive書き込み削除 — Rust変更が必要、影響大
- Phase 14（エディタの🔔ボタン） — バグ修正＋分割が終わってから実装
- 新機能の追加 — 「壊れているものを直す」フェーズなので対象外

</deferred>

---

*Phase: 15-kodo-seiri*
*Context gathered: 2026-04-10 via PRD Express Path*
