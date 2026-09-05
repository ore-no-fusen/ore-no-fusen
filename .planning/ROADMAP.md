# Roadmap — 俺の付箋

## Milestones

- ✅ **v1.0 品質改善** — Phases 1-3 (shipped 2026-03-23)
- ✅ **v2.0 iPhone連携** — Phases 4-5 (shipped 2026-03-29)
- ✅ **v3.0 iPhone→PC送信** — Phases 6-12 (shipped 2026-04-10)
- ✅ **v4.0 ロック画面コントロール** — Phases 13-14 (shipped 2026-04-10)
- ✅ **v5.0 iPhone PWA 安定化** — Phases 15-18 (shipped 2026-05-02)
- ✅ **v6.0 起動性能 300ms 達成（Pool）** — Phase 19 (shipped 2026-05-02)

## Phases

<details>
<summary>✅ v1.0 品質改善 (Phases 1-3) — SHIPPED 2026-03-23</summary>

- [x] Phase 1: コードレビュー (3/3 plans) — completed 2026-03-23
- [x] Phase 2: バグ修正 (2/2 plans) — completed 2026-03-23
- [x] Phase 3: 確認・検証 (2/2 plans) — completed 2026-03-23

See: `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 iPhone連携 (Phases 4-5) — SHIPPED 2026-03-29</summary>

- [x] Phase 4: Rust バックエンド（Google Drive + APNs）(5/5 plans) — completed 2026-03-23
- [x] Phase 5: iPhone PWA + Rust送信 (5/5 plans) — completed 2026-03-29

See: `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v3.0 iPhone→PC送信 (Phases 6-12) — CLOSED 2026-04-10</summary>

- [x] Phase 6: iPhone送信UI — closed
- [x] Phase 7: PC受信 — completed 2026-03-30
- [x] Phase 8: iPhoneノートアプリ化 — completed 2026-04-01
- [x] Phase 9: iPhone付箋管理 — closed
- [x] Phase 10: iPhone UX改善 + 送信高速化 — completed 2026-04-03
- [x] Phase 11: PC→iPhone受信履歴保存 — closed
- [x] Phase 12: チェックボックスTODO一覧インライントグル — closed

</details>

<details>
<summary>✅ v4.0 ロック画面コントロール (Phases 13-14) — CLOSED 2026-04-10</summary>

- [x] Phase 13: ロック画面コントロール基盤 — closed (実装済み、v5.0で統合)
- [x] Phase 14: エディタ連携 + 再起動復元 — deferred to Phase 18

</details>

---

## Phase Details

### Phase 6: iPhone送信UI

**Goal**: iPhoneのviewer画面からテキスト・画像・Mermaidを作成してDriveに送信でき、履歴で確認できる
**Depends on**: Phase 5（viewer/page.tsx が稼働済み・Drive アクセス可能）
**Requirements**: SEND-01, SEND-02, SEND-03, SEND-04, HIST-01, HIST-02, REND-01
**Success Criteria** (what must be TRUE):

  1. iPhoneのviewer画面を開くと即「書く」画面（write ステップ）が表示される
  2. テキストを入力して「PCに送る」を押すと、Drive上に fusen_from_iphone.json が作成される（Drive console で確認可能）
  3. 「iPhoneに置いておく」で送信せずに下書きとして保存でき、送信履歴画面に「下書き」として表示される
  4. カメラ/ライブラリから写真を選択すると本文にMarkdown画像として挿入され、送信内容に含まれる
  5. Mermaidコードを入力してプレビューを確認後に挿入でき、viewer内で図（SVG）として描画される

**Plans**: 5 plans

Plans:

- [ ] 06-01-PLAN.md — Wave 0: 全要件のテストスタブ先行作成
- [ ] 06-02-PLAN.md — Wave 1: step 型拡張・write 画面 UI・PCへの送信と下書き保存（SEND-01, SEND-02）
- [ ] 06-03-PLAN.md — Wave 2: 画像添付テスト GREEN（SEND-03）
- [ ] 06-04-PLAN.md — Wave 2: Mermaid モーダルと SimpleNoteBody レンダリング（SEND-04, REND-01）
- [ ] 06-05-PLAN.md — Wave 3: 履歴画面（HIST-01, HIST-02）

### Phase 7: PC受信

**Goal**: iPhoneから送信された付箋がPC上に30秒以内に新規ウィンドウとして自動表示される
**Depends on**: Phase 6（Drive上に fusen_from_iphone.json が存在すること）
**Requirements**: POLL-01, POLL-02, POLL-03
**Success Criteria** (what must be TRUE):

  1. PC起動中にiPhoneで「PCに送る」を押すと、30秒以内に新規付箋ウィンドウが自動で開く
  2. 開いた付箋にiPhoneで入力したテキストが（画像・Mermaid含む）正確に入っている
  3. 同じノートを2回受信しない（PC再起動後も received_at マークにより重複が防止される）

**Plans**: 2 plans

Plans:

- [x] 07-01-PLAN.md — Wave 1: Rustポーリングループ・JS受信リスナー・赤ドットUI（POLL-01, POLL-02, POLL-03）
- [ ] 07-02-PLAN.md — Wave 2: 画像を Drive ファイルとして管理しローカル保存（POLL-02 拡張）

### Phase 8: iPhoneノートアプリ化

**Status**: COMPLETE (2026-04-01)
**Goal**: iPhoneでノートの作成・編集・一覧・PCへの送信が付箋アプリと同等の操作感でできる
**Depends on**: Phase 6・7（viewer/page.tsx・app/page.tsx 稼働済み）
**Requirements**: IPHONE-UI-01, IPHONE-UI-02, IPHONE-UI-03, IPHONE-UI-04, IPHONE-UI-05, IPHONE-UI-06
**Success Criteria** (what must be TRUE):

  1. 書く画面にタイトル入力欄がなく、1行目が自動的にタイトル/ファイル名になる
  2. ヘッダー右に 📷 🔷 ☑ 🏷️ が並び、PC編集モードのツールバーと同スタイル（min-w-[32px]、hover:bg-gray-100）
  3. 📷→アルバム選択→トリミングモーダル（ドラッグで範囲指定）→「貼り付け」でカーソル位置にミニ画像がインライン表示
  4. 🔷でMermaidを入力・挿入するとカーソル位置にレンダリング済み図がインライン表示
  5. 一覧に下書き・送信済みの両方が表示され、どちらもタップして編集・再送信できる
  6. タグを追加でき「PCに送る」でPC側の付箋にも反映される

**Plans**: 4 plans

Plans:

- [x] 08-01-PLAN.md — Wave 1: contenteditable基盤（型変更・state変更・ヘルパー関数5つ・write UI差し替え）
- [x] 08-02-PLAN.md — Wave 2: ヘッダーツールバー（📷🔷☑）+ CropModal + Mermaidインライン挿入
- [x] 08-03-PLAN.md — Wave 3: タグUI（🏷️）+ 送信payload拡張 + PC受信タグ適用
- [x] 08-04-PLAN.md — Wave 4: 一覧から送信済み・下書き編集対応

### Phase 9: iPhone付箋管理

**Goal**: iPhoneを単体の付箋アプリとして使えるようにする（一覧から作成・編集・保存・削除）、PCへの送信も引き続き可能
**Depends on**: Phase 8（viewer/page.tsx の contenteditable エディタ稼働済み）
**Requirements**: IPHONE-MGT-01, IPHONE-MGT-02, IPHONE-MGT-03, IPHONE-MGT-04, IPHONE-MGT-05
**Success Criteria** (what must be TRUE):

  1. 一覧（下書き・送信済み）からノートをタップするとエディタに内容が正しく読み込まれる（現バグ修正）
  2. エディタで編集後「iPhoneに置いておく」を押すと、既存下書きは上書き保存・新規は新規作成される
  3. 一覧画面に「＋」ボタンがあり、タップするとエディタをクリアして新規作成モードで開く
  4. 一覧から付箋を削除できる（IndexedDBから削除、一覧から消える）
  5. 「PCに送る」は引き続き動作し、iPhone内の付箋をPCに送信できる

**Plans**: 3 plans

Plans:

- [ ] 09-01-PLAN.md — Wave 1: バグ修正（pendingHydrate）一覧→エディタ読み込み（IPHONE-MGT-01）
- [ ] 09-02-PLAN.md — Wave 2: 一覧リニューアル（＋ボタン・削除・「履歴」→「一覧」）+ 保存フロー（IPHONE-MGT-02, 03, 04）
- [ ] 09-03-PLAN.md — Wave 3: 送信フロー維持確認・全フロー統合検証（IPHONE-MGT-05）

### Phase 10: iPhone UX改善 + 送信高速化

**Status**: COMPLETE (2026-04-03)
**Goal:** チェックボックスの行頭挿入・インタラクティブトグル・タグサジェスト・送信高速化（5秒以内）を実現する
**Requirements**: REQ-CB-LINE, REQ-CB-TOGGLE, REQ-CB-SERIALIZE, REQ-CB-HYDRATE, REQ-TAG-SUGGEST, REQ-TAG-PERSIST, REQ-FOLDER-CACHE, REQ-SEND-PARALLEL, REQ-SEND-NONBLOCKING
**Depends on:** Phase 9
**Plans:** 3/3 plans complete

Plans:

- [x] 10-01-PLAN.md — Wave 1: チェックボックス行頭挿入 + インタラクティブ変換（REQ-CB-*）
- [x] 10-02-PLAN.md — Wave 1: タグサジェストUI + 永続化（REQ-TAG-*）（並列実行可）
- [x] 10-03-PLAN.md — Wave 2: 送信高速化（キャッシュ・並列化・ノンブロッキング）（REQ-FOLDER-CACHE, REQ-SEND-PARALLEL, REQ-SEND-NONBLOCKING）

### Phase 11: PC→iPhone受信履歴保存

**Goal:** PCからiPhoneに送ったノートを、通知を消した後も一覧から閲覧・編集できるようにする。複数通知は取り違えない。
**Requirements**: P11-SCHEMA, P11-WORKER, P11-SAVE, P11-LIST, P11-DISMISS
**Depends on:** Phase 10
**Plans:** 3/4 plans executed

Plans:

- [ ] 11-01-PLAN.md — Wave 0: テストスタブ先行作成（P11-01〜04）
- [ ] 11-02-PLAN.md — Wave 1: Rust 配列スキーマ化 + worker.js 通知タグ変更（P11-SCHEMA, P11-WORKER）
- [ ] 11-03-PLAN.md — Wave 1: JS 受信フロー + 一覧表示 + ボタン変更（P11-SAVE, P11-LIST, P11-DISMISS）
- [ ] 11-04-PLAN.md — Wave 2: 統合検証（checkpoint:human-verify）

### Phase 12: チェックボックスTODO一覧インライントグル

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 11
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd:plan-phase 12 to break down)

### Phase 13: ロック画面コントロール基盤

**Goal**: iPhoneの一覧から任意のメモをロック画面に表示でき、複数メモを独立した通知として同時管理できる
**Depends on**: Phase 12
**Requirements**: LOCK-01, LOCK-02, LOCK-03, LOCK-04, LOCK-05
**Success Criteria** (what must be TRUE):

  1. 一覧の各メモ行に🔔ボタンがあり、タップするとiPhoneのロック画面に通知として表示される
  2. ロック画面に表示中のメモの🔔ボタンを再タップすると、ロック画面の通知が消える
  3. ロック画面に表示中のメモは一覧で🔔アイコンが強調表示（ON状態）で視覚的に識別できる
  4. 2件以上のメモを同時にロック画面に表示でき、それぞれが独立した通知として存在する
  5. アプリを閉じて再度開いても、ロック中だったメモの🔔状態が一覧に復元されている

**Plans**: 4 plans

Plans:

- [ ] 13-01-PLAN.md — Wave 1: テストスタブ先行作成（LOCK-03/04/05）
- [ ] 13-02-PLAN.md — Wave 2: DraftRecord 型拡張・lockedNoteIds state・🔔ハンドラ・一覧 UI（LOCK-01〜04）
- [ ] 13-03-PLAN.md — Wave 3: 起動時ロック復元 + 削除時ロック解除（LOCK-05 + LOCK-02 補完）
- [ ] 13-04-PLAN.md — Wave 4: iPhone 実機検証チェックポイント（LOCK-01〜05）

### Phase 14: エディタ連携 + 再起動復元

**Status**: DEFERRED — Phase 18 に移動（viewer/page.tsx 分割完了後に実施）
**Goal**: エディタ画面からもロック画面トグルを操作でき、アプリ起動時にロック中メモの通知が自動再表示される
**Depends on**: Phase 13
**Requirements**: EDIT-01, EDIT-02, RESUME-01
**Plans**: → Phase 18 で実施

---

### 📋 v5.0 iPhone PWA 安定化

**Milestone Goal:** viewer/page.tsx の根本的なバグを修正し、コンポーネントを正しく分割して、継続的に壊れない土台を作る

### Phase 15: コード整理（lib 抽出・死んだコード削除）

**Goal**: viewer/page.tsx から型定義・DB操作・Drive操作を lib/ に切り出し、死んだコードを削除する
**Depends on**: Phase 13
**Requirements**: CLEAN-01, CLEAN-02
**Success Criteria** (what must be TRUE):

  1. `types.ts` に DraftRecord / IphoneNote 等の型定義が移動し、page.tsx から import されている
  2. `lib/indexeddb.ts` に openDraftsDB / saveDraft / loadAllDrafts / loadDraft / deleteDraft が移動している
  3. `lib/drive.ts` に Drive API 操作関数が移動している
  4. `noteData` state・`step='note'`・`downloadWithAutoRefresh` 等の死んだコードが削除されている
  5. E2E テスト（13件）が引き続き全パスする

**Plans**: 3 plans

Plans:

- [ ] 15-01-PLAN.md — Wave 0: テストスタブ先行作成（lib/indexeddb.test.ts, lib/drive.test.ts）（CLEAN-02）
- [ ] 15-02-PLAN.md — Wave 1: types.ts / lib/indexeddb.ts / lib/drive.ts 作成 + page.tsx import 切り替え（CLEAN-02）
- [ ] 15-03-PLAN.md — Wave 2: dead code 削除（noteData / step='note' / downloadWithAutoRefresh）+ E2E 全件確認（CLEAN-01）

### Phase 16: バグ修正（画像消失・URL変化未検知・ロック状態ズレ）

**Goal**: 一覧↔編集往復で画像が消えるバグ、通知タップで別メモが開くバグ、ロック状態の二重管理ズレを修正する
**Depends on**: Phase 15
**Requirements**: FIX-01, FIX-02, FIX-03
**Success Criteria** (what must be TRUE):

  1. 一覧→編集→一覧→編集を繰り返しても添付画像が消えず正しく表示される（FIX-01）
  2. メモAを開いている状態でメモBの通知をタップすると、メモBの内容が正しく開く（FIX-02）
  3. 一覧のベルアイコンが IndexedDB の locked フィールドのみを信頼源とし、SW の activeNotifIds に依存しない（FIX-03）

**Plans**: TBD

### Phase 17: コンポーネント分割（WriteScreen / ListScreen / SetupScreens）

**Goal**: 1925行の viewer/page.tsx を薄いルーター（100行以内）+ 3つの画面コンポーネント + hooks/ + lib/ に分割する
**Depends on**: Phase 16
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04
**Success Criteria** (what must be TRUE):

  1. `screens/WriteScreen.tsx` が独立し、編集画面の責務だけを持つ（ARCH-01）
  2. `screens/ListScreen.tsx` が独立し、一覧画面の責務だけを持つ（ARCH-02）
  3. `screens/SetupScreens.tsx` が独立し、banner/login/push 画面を担う（ARCH-03）
  4. `hooks/useAuth.ts`・`hooks/useDrafts.ts`・`hooks/useLock.ts` に状態管理が分離されている（ARCH-04）
  5. E2E テスト（13件）が引き続き全パスし、iPhone 実機で動作確認できる

**Plans**: TBD

### Phase 18: エディタ連携 + 再起動復元（旧 Phase 14）

**Goal**: エディタ画面からもロック画面トグルを操作でき、アプリ起動時にロック中メモの通知が自動再表示される
**Depends on**: Phase 17
**Requirements**: LOCK-06, LOCK-07, LOCK-08
**Success Criteria** (what must be TRUE):

  1. エディタ（WriteScreen）のヘッダーツールバーに🔔ボタンがあり、タップでロック画面への表示をトグルできる
  2. エディタの🔔ボタンは現在のロック状態を反映し、ON/OFFが視覚的に区別できる（一覧側と状態が一致する）
  3. アプリを完全終了して再起動すると、IndexedDBに保存されたロック中メモの通知がロック画面に自動表示される

**Plans**: TBD

### Phase 19: 起動性能300ms達成（Pool 透明→不透明アーキテクチャ）

**Goal**: Ctrl+N 押下から 1 文字目入力可能（T2_READY）まで 300ms 以内を達成する。MVP「すぐ書ける」の核心実装。
**Depends on**: Phase 18（独立実装可能だが順序は 18 後）
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-06, PERF-07, PERF-08
**Success Criteria** (what must be TRUE):

  1. Ctrl+N → T2_READY が **5回中央値で 300ms 以下**（実測ログで確認）
  2. **連打耐性**: 1.5秒間に 3 回 Ctrl+N を押しても破綻しない（プール枯渇時はフォールバック動作）
  3. **負荷耐性**: 既存 17 付箋同時起動下でも 300ms 達成
  4. **データ整合性**: 1 文字も入力されないまま閉じた場合 `.md` ファイルがゴミとして残らない
  5. Pool 窓は透明状態で事前完全準備（描画完了・CodeMirror マウント済・編集モード待機）
  6. Ctrl+N 時は Win32 レベルで α=0→255 と SetWindowPos 位置移動のみで実現（新規生成しない）

**Plans**: 5 plans

Plans:

- [ ] 19-01-wave0-test-scaffolding-PLAN.md — Wave 1: テスト・スクリプト・ログ基盤の先行作成（perflog.rs, perf-check.mjs, e2e specs, manual-verify 手順書）
- [ ] 19-02-rust-core-layered-pool-PLAN.md — Wave 2: Rust 側コア（WS_EX_LAYERED + α=0/255 制御、fusen_create_note_lazy）
- [ ] 19-03-js-side-firstchar-ready-PLAN.md — Wave 3: JS 側（onFirstChar、firstCharFiredRef、PoolWaitToast、JS スロットル撤去）
- [ ] 19-04-replenish-global-shortcut-PLAN.md — Wave 4: Pool 補充オーケストレーション + グローバル Ctrl+N + settings.json カスタマイズ
- [ ] 19-05-perf-verification-checkpoint-PLAN.md — Wave 5: 5 サンプル計測 + REQUIREMENTS 追記 + 手動検証チェックポイント

### Phase 20: 起動時データ保護と最小レスキューモード

**Goal:** 設定・保存先の読み込み異常を初回起動と誤認せず、データを変更しない安全策と、設定二重破損時にも付箋利用を継続できる最小自動復旧を提供する
**Requirements**: SAFE-01, SAFE-02
**Depends on:** Phase 19
**Success Criteria** (what must be TRUE):

  1. 設定または保存先が読めない起動では、初期付箋を作らず、自動保存・削除・設定上書きを行わない
  2. `settings.json` が壊れても正常な `.bak` があれば従来どおり直前世代を使用する
  3. 本体と `.bak` が両方壊れた場合だけ、両方を日時付きで退避し、安全な既定保存先を持つ正常設定を再作成する
  4. 自動復旧後は黄色い案内付箋1枚で異常とデータ非削除を伝え、ユーザーは通常どおり付箋を作成できる
  5. 再起動後は同じ保存先と付箋を復元し、案内付箋を重複作成しない

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 20 to break down)

### Phase 21: MSIX正式版への一本化

**Goal:** Microsoft Store を主配布経路とする MSIX 正式版へ一本化し、winget、更新、既存ユーザー移行、自動起動を安全に継続する
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04, DIST-05, DIST-06, DIST-07, DIST-08
**Depends on:** Phase 20
**Success Criteria** (what must be TRUE):

  1. 移行開始版5.0.0で最後のNSIS・MSIとStore MSIXを提供し、移行完了版5.1.0以降の正式配布物はStore MSIXの1種類となる
  2. アプリの各リリースが Store 提出工程を通り、Store が唯一の自動更新経路になる
  3. winget から Store 版を導入でき、従来の community package 利用者に移行手順がある
  4. MSI/NSIS 版から MSIX 版へ移行しても付箋・画像・設定を失わない
  5. MSIX の StartupTask で設定画面の自動起動 ON/OFF が動作し、Windows 側で無効化された場合の案内が表示される
  6. 設計書・ユーザーガイド・README・リリース手順・画面表示が MSIX 正式版に統一される

**Plans:** 5 plans

Plans:

- [ ] 21-00-MIGRATION-RELEASE-PLAN.md — 5.0.0移行開始から5.1.0一本化完了までのリリース運用
- [ ] 21-01-PLAN.md — MSIX単一成果物とStore提出パイプライン
- [ ] 21-02-PLAN.md — 実行時の配布分岐・更新・自動起動・版表示の整理
- [ ] 21-03-PLAN.md — winget移行、既存ユーザー移行、設計書・マニュアル同期
- [ ] 21-04-PLAN.md — Store署名版による更新・移行・自動起動の統合検証

### Phase 22: しまった付箋の選択復元

**Goal:** タスクトレイから Archive・タグフォルダ内の付箋を選び、安全にデータ保存先直下へ戻してデスクトップへ即時表示できる
**Requirements**: RESTORE-01, RESTORE-02, RESTORE-03, RESTORE-04, RESTORE-05
**Depends on:** Phase 21
**Success Criteria** (what must be TRUE):

  1. タスクトレイの「しまった付箋を取り出す」から復元画面を開ける
  2. 最近しまった5件、件数付きのArchive・タグ一覧、文字検索から対象へ到達し、背景色・本文3行・画像サムネイル付きカードを1枚以上選んでまとめて取り出せる
  3. 選択した付箋と関連画像だけが保存先直下へ安全に移動し、元フォルダから削除される
  4. 同名付箋が保存先直下にある項目は上書きせず、他の選択項目は継続して結果を表示する
  5. 取り出した付箋が再起動不要でデスクトップへ表示される

**Plans:** 2 plans

Plans:
**Wave 1**

- [ ] 22-01-PLAN.md — Wave 1: しまった付箋の列挙と安全な一括移動コマンド

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 22-02-PLAN.md — Wave 2: タスクトレイ導線・選択復元画面・即時表示

---

## Progress

| Phase | Milestone | Status | Completed |
|-------|-----------|--------|-----------|
| 1. コードレビュー | v1.0 | Complete | 2026-03-23 |
| 2. バグ修正| v1.0 | Complete | 2026-03-23 |
| 3. 確認・検証 | v1.0 | Complete | 2026-03-23 |
| 4. Rust バックエンド（Drive+APNs） | v2.0 | Complete | 2026-03-23 |
| 5. iPhone PWA + Rust送信 | v2.0 | Complete | 2026-03-29 |
| 6. iPhone送信UI | v3.0 | Closed | 2026-04-10 |
| 7. PC受信 | v3.0 | Complete | 2026-03-30 |
| 8. iPhoneノートアプリ化 | v3.0 | Complete | 2026-04-01 |
| 9. iPhone付箋管理 | v3.0 | Closed | 2026-04-10 |
| 10. iPhone UX改善 + 送信高速化 | v3.0 | Complete | 2026-04-03 |
| 11. PC→iPhone受信履歴保存 | v3.0 | Closed | 2026-04-10 |
| 12. チェックボックスTODO一覧インライントグル | v3.0 | Closed | 2026-04-10 |
| 13. ロック画面コントロール基盤 | v4.0 | Closed | 2026-04-10 |
| 14. エディタ連携 + 再起動復元 | v4.0 | Deferred → Phase 18 | — |
| 15. コード整理（lib 抽出・死んだコード削除） | v5.0 | Complete | 2026-05-02 |
| 16. バグ修正（画像・URL・ロック状態） | v5.0 | Complete | 2026-05-02 |
| 17. コンポーネント分割 | v5.0 | Complete | 2026-05-02 |
| 18. エディタ連携 + 再起動復元 | v5.0 | Complete | 2026-05-02 |
| 19. 起動性能300ms達成（Pool） | v6.0 | Complete | 2026-05-02 |
| 20. 起動時データ保護と最小レスキューモード | safety | In Progress（実装・自動テスト済み、実機確認待ち） | — |
| 21. MSIX正式版への一本化 | distribution | Planned | — |
