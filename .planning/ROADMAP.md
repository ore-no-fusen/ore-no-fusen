# Roadmap — 俺の付箋

## Milestones

- ✅ **v1.0 品質改善** — Phases 1-3 (shipped 2026-03-23)
- ✅ **v2.0 iPhone連携** — Phases 4-5 (shipped 2026-03-29)
- 📋 **v3.0 iPhone→PC送信** — Phases 6-7 (planned)

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
- [ ] **Phase 7: PC受信** — DriveポーリングでPCに自動着信する状態

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
| 6. iPhone送信UI | 2/5 | In Progress|  | — |
| 7. PC受信 | v3.0 | 0/? | Not started | — |
