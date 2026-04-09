# Roadmap — 俺の付箋

## Milestones

- ✅ **v1.0 品質改善** — Phases 1-3 (shipped 2026-03-23)
- ✅ **v2.0 iPhone連携** — Phases 4-5 (shipped 2026-03-29)
- 📋 **v3.0 iPhone→PC送信** — Phases 6-12 (planned)
- 📋 **v4.0 ロック画面コントロール** — Phases 13-14 (planned)

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

### 📋 v3.0 iPhone→PC送信

**Milestone Goal:** iPhoneで書いたメモ・写真・MermaidをPCに送ると、30秒以内に新規付箋ウィンドウが開く

- [ ] **Phase 6: iPhone送信UI** — iPhoneで書いてDriveに送れる状態（PCなしで検証可能）
- [x] **Phase 7: PC受信** — DriveポーリングでPCに自動着信する状態（07-01完了・07-02実装中） (completed 2026-03-30)
- [x] **Phase 8: iPhoneノートアプリ化** — contenteditable・画像・タグ・一覧 (completed 2026-04-01)
- [x] **Phase 9: iPhone付箋管理** — 一覧から作成・編集・保存・削除、PCへの送信も可能 (completed 2026-04-01)
- [ ] **Phase 10: iPhone UX改善 + 送信高速化** — チェックボックス・タグサジェスト・5秒以内送信
- [ ] **Phase 11: PC→iPhone受信履歴保存** — 通知消去後も一覧で閲覧・編集
- [ ] **Phase 12: チェックボックスTODO一覧インライントグル** — TBD

### 📋 v4.0 ロック画面コントロール

**Milestone Goal:** iPhoneの一覧にある任意のメモをロック画面に自由に出す/消すを自分でコントロールできる

- [ ] **Phase 13: ロック画面コントロール基盤** — 一覧の🔔ボタンでロック画面への表示トグル・複数メモ同時表示・IndexedDB永続化
- [ ] **Phase 14: エディタ連携 + 再起動復元** — エディタヘッダーの🔔ボタン・ロック状態反映・アプリ起動時の通知自動再表示

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
**Goal**: エディタ画面からもロック画面トグルを操作でき、アプリ起動時にロック中メモの通知が自動再表示される
**Depends on**: Phase 13
**Requirements**: EDIT-01, EDIT-02, RESUME-01
**Success Criteria** (what must be TRUE):
  1. エディタのヘッダーツールバーに🔔ボタンがあり、タップでロック画面への表示をトグルできる
  2. エディタの🔔ボタンは現在のロック状態を反映し、ON/OFFが視覚的に区別できる（一覧側と状態が一致する）
  3. アプリを完全終了して再起動すると、IndexedDBに保存されたロック中メモの通知がロック画面に自動表示される
**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. コードレビュー | v1.0 | 3/3 | Complete | 2026-03-23 |
| 2. バグ修正 | v1.0 | 2/2 | Complete | 2026-03-23 |
| 3. 確認・検証 | v1.0 | 2/2 | Complete | 2026-03-23 |
| 4. Rust バックエンド（Drive+APNs） | v2.0 | 5/5 | Complete | 2026-03-23 |
| 5. iPhone PWA + Rust送信 | v2.0 | 5/5 | Complete | 2026-03-29 |
| 6. iPhone送信UI | v3.0 | 4/5 | In Progress | — |
| 7. PC受信 | v3.0 | 2/2 | Complete | 2026-03-30 |
| 8. iPhoneノートアプリ化 | v3.0 | 4/4 | Complete | 2026-04-01 |
| 9. iPhone付箋管理 | v3.0 | 0/3 | Not started | — |
| 10. iPhone UX改善 + 送信高速化 | v3.0 | 3/3 | Complete | 2026-04-03 |
| 11. PC→iPhone受信履歴保存 | v3.0 | 0/4 | Not started | — |
| 12. チェックボックスTODO一覧インライントグル | v3.0 | 0/0 | Not started | — |
| 13. ロック画面コントロール基盤 | 2/4 | In Progress|  | — |
| 14. エディタ連携 + 再起動復元 | v4.0 | 0/0 | Not started | — |
