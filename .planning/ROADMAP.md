# Roadmap — 俺の付箋

## Milestones

- ✅ **v1.0 品質改善** — Phases 1-3 (shipped 2026-03-23)
- ✅ **v2.0 iPhone連携** — Phases 4-5 (shipped 2026-03-29)
- 📋 **v3.0 iPhone→PC送信** — Phases 6-9 (planned)

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


### Phase 10: PCから来たノートを一覧に追加

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 9
**Plans:** 3/3 plans complete

Plans:
- [ ] TBD (run /gsd:plan-phase 10 to break down)

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
| 7. PC受信 | 2/2 | Complete   | 2026-03-30 | — |
