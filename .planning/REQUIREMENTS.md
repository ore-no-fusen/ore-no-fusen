# Requirements: 俺の付箋

**Defined:** 2026-03-29
**Core Value:** すぐ書けて、そこに残る。それだけ確実に動く。

## v3.0 Requirements

### iPhone送信（SEND）

- [x] **SEND-01**: iPhoneでテキストを入力して「PCに送る」で付箋をDriveに送信できる
- [x] **SEND-02**: 「iPhoneに置いておく」で下書きとしてiPhone履歴に保存できる（PCには送らない）
- [x] **SEND-03**: 画像追加ボタンでカメラ/ライブラリから写真を付箋に添付できる（Canvas圧縮→Markdown画像）
- [x] **SEND-04**: Mermaidボタンでコード入力欄+プレビューを開き、本文に ```mermaid ブロックとして挿入できる

### iPhone履歴（HIST）

- [x] **HIST-01**: 送信後に送信済み+下書きの履歴リストを表示できる（最新10件、sent/draft 区別）
- [x] **HIST-02**: 履歴から下書きを選んで編集・送信できる

### Mermaidレンダリング（REND）

- [x] **REND-01**: viewer内で ```mermaid コードブロックを図（SVG）として描画できる

### PC受信（POLL）

- [ ] **POLL-01**: PCがDriveを30秒間隔でポーリングして新着iPhoneノートを検出できる
- [ ] **POLL-02**: 新着ノートをPC側で自動的に新規付箋ウィンドウとして開ける
- [ ] **POLL-03**: 重複受信防止（received_atマーク＋last_seen_idによるスキップ）

## Future Requirements

（v4.0以降で検討）

### 双方向同期
- iPhoneからPC付箋を編集・更新できる — 競合解決が必要で工数大

## Out of Scope

| Feature | Reason |
|---------|--------|
| Android対応 | シングルユーザー・iPhone前提のため当面不要 |
| ユーザー認証（複数ユーザー） | シングルユーザー前提のため不要 |
| リアルタイム同期（WebSocket/SSE） | Drive polling で代替。Vercel無料枠の制約もあり |
| iPhoneからPC付箋の編集 | 双方向同期は競合解決が必要。v4.0以降 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEND-01 | Phase 6 | Complete |
| SEND-02 | Phase 6 | Complete |
| SEND-03 | Phase 6 | Complete |
| SEND-04 | Phase 6 | Complete |
| HIST-01 | Phase 6 | Complete |
| HIST-02 | Phase 6 | Complete |
| REND-01 | Phase 6 | Complete |
| POLL-01 | Phase 7 | Pending |
| POLL-02 | Phase 7 | Pending |
| POLL-03 | Phase 7 | Pending |

**Coverage:**
- v3.0 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after roadmap creation*
