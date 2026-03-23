# Feature Research

**Domain:** iPhone連携 — デスクトップ付箋アプリ → iPhone Push通知 + PWA閲覧
**Researched:** 2026-03-23
**Confidence:** MEDIUM（Web Push/VAPID仕様はMDN公式確認済み。Apple固有制約は訓練データ + 部分的公式確認）

---

## Feature Landscape

### Table Stakes (ユーザーが当然期待するもの)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| iPhoneロック画面への通知 | 「iPhoneに送る」がコア機能。届かないなら意味がない | HIGH | APNs経由のWeb Push。Safari 16.4+（iOS 16.4+）が必要。`userVisibleOnly: true` 必須 |
| 通知タップで内容が見える | 通知が来ても内容確認できないと半完成 | MEDIUM | `notificationclick` イベント → PWA起動/前面表示 |
| 付箋テキストが通知に表示される | 「何を送ったか」が通知本文に出ないと意味不明 | LOW | Push payloadの `title` / `body` に付箋内容を詰める |
| iPhoneで付箋全文が読める | ロック画面通知は短い。全文はPWAで読む | MEDIUM | PWAビューアーページ（読み取り専用）。Google Drive経由でノートJSON取得 |
| PWAインストール案内 | ユーザーが「ホーム画面に追加」しないとPush許可が取れない | MEDIUM | iOS 16.4+はSafariのシェアメニューから追加。`beforeinstallprompt` はiOSで**非対応**。手動案内UIが必要 |
| Push通知権限リクエスト | 許可なしでは何も届かない | LOW | PWAインストール後にのみ `Notification.requestPermission()` を呼べる（Safari 12.1+はユーザー操作が必要） |
| Push Subscription保存 | 購読情報（endpoint + keys）をサーバー側に保存しないと送れない | MEDIUM | Google Driveにjsonファイルとして保存する設計。シングルユーザー前提で認証不要 |
| HTTPS配信 | Push APIはHTTPS必須 | LOW | Vercel無料枠で解決済み。localhost開発はHTTPSなしでも動く |

### Differentiators (競争優位)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 右クリック一発で送信 | 操作コスト最小。「選んで右クリック→送る」で完結 | LOW | `ctx_send_to_iphone` が既存コードに `enabled: false` で実装済み。有効化するだけ |
| Google Drive中継（DBなし） | サーバーDB不要・費用ゼロ・ノートファイルをそのまま中継 | MEDIUM | Driveのファイルに subscription.json + note JSONを置く。OAuth認証が必要 |
| Vercel + Hono統合（新サーバー不要） | 既存Next.jsプロジェクト内で完結。インフラ変更なし | MEDIUM | `app/api/push/route.ts` をHonoルートとして実装。既存APIは移植しない |
| PWAビューアー（読み取り専用） | iPhoneでのインストールハードルが低い。書き込まないから壊れない | LOW | 閲覧専用ページ。編集機能は不要（v2.0スコープ外） |

### Anti-Features (スコープ外・入れてはいけない)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| iPhoneからの編集・保存 | 「せっかくiPhoneで見えるなら編集したい」 | デスクトップ←→iPhone双方向同期は競合解決が必要。v2.0の工数を3倍にする | v3.0（次マイルストーン）で実装。v2.0は読み取り専用 |
| Android対応 | 市場シェアが高い | Web PushはAndroidで動くが、テスト・QAコストが増える。APNs固有の問題切り分けが困難になる | v3.0以降。VAPID実装が共通なので後から追加は容易 |
| リアルタイム同期（WebSocket/SSE） | 「常に最新状態をiPhoneで見たい」 | Google Drive APIのポーリング遅延 + Vercel無料枠のFunctionタイムアウト制約 | Push通知を「更新トリガー」として使い、iPhoneはDriveからオンデマンド取得 |
| 複数デバイス・複数ユーザー管理 | 将来的な家族共有など | 認証・ACL・subscription管理が複雑化。シングルユーザー前提が崩れる | シングルユーザー設計を維持。必要になったら認証レイヤーを追加 |
| Push通知の既読管理 | UX改善 | Subscription endpoint + Google Drive読み書きで十分なストレージ操作が発生。複雑化に対してリターンが小さい | 通知はfireforget。既読はiPhoneOSが管理 |
| ネイティブiOSアプリ（Swift） | 「ちゃんとしたアプリにしたい」 | Apple Developer Program（年$99）+ Swiftビルド環境必要。工数が桁違い | PWA で同等体験を実現できる |

---

## Feature Dependencies

```
[Push通知受信（iPhone）]
    └──requires──> [PWAインストール（ホーム画面追加）]
                       └──requires──> [HTTPS配信（Vercel）]
                       └──requires──> [Service Worker登録]
                       └──requires──> [Web App Manifest]

[Push通知送信（PCから）]
    └──requires──> [Push Subscription保存（Google Drive）]
                       └──requires──> [Google OAuth認証]
                       └──requires──> [Hono APIエンドポイント]
    └──requires──> [VAPID鍵ペア生成・保存]

[Hono APIエンドポイント]
    └──requires──> [Next.js App Router（既存）]

[右クリック「iPhoneに送る」（PC側）]
    └──requires──> [Hono Push通知エンドポイント]
    └──requires──> [ctx_send_to_iphone 有効化（既存コードのenabled: false → true）]

[PWAビューアー（付箋全文表示）]
    └──requires──> [Google Drive ノートJSON読み取り]
    └──requires──> [notificationclick → PWA起動]
```

### Dependency Notes

- **PWAインストール requires HTTPS:** Push APIはセキュアコンテキスト必須。Vercel無料枠で自動対応。
- **Push通知受信 requires PWAインストール（iOS）:** iPhoneのSafariはホーム画面追加済みのPWAに対してのみPush許可を取れる。通常のSafariブラウザタブでは不可（iOS 16.4時点の制約）。
- **右クリック送信 requires ctx_send_to_iphone 有効化:** 既存コードに `enabled: false` フラグで実装済み。Hono APIが完成したら有効化するだけ。

---

## MVP Definition

### Launch With (v2.0)

- [ ] VAPID鍵ペア生成 + Hono APIエンドポイント（`/api/push/subscribe`, `/api/push/send`） — Push通知の土台
- [ ] Google Drive OAuth認証 + subscription.json 読み書き — DBなし設計の核心
- [ ] iPhone Safari PWA（Service Worker + Web App Manifest + 通知許可フロー） — ユーザーが手動でホーム画面追加する案内UI込み
- [ ] Push通知送信（付箋テキストをpayloadに含める） — コア機能
- [ ] 右クリック「iPhoneに送る」有効化 — 既存コードのフラグを外す
- [ ] PWAビューアーページ（読み取り専用・Google Driveからノート取得） — 全文確認

### Add After Validation (v2.x)

- [ ] Push通知の失敗時リトライ — subscription期限切れ検出 + 再登録促進
- [ ] 複数付箋の一括送信 — 「今日のタスクをまとめて送る」ユースケース

### Future Consideration (v3+)

- [ ] iPhoneからの編集（双方向同期） — 競合解決が必要
- [ ] Android対応 — VAPID共通なので追加は容易
- [ ] 複数デバイス管理 — subscription配列管理

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| VAPID + Hono Push送信API | HIGH | MEDIUM | P1 |
| Google Drive subscription保存 | HIGH | MEDIUM | P1 |
| iPhone PWA（Service Worker + Manifest） | HIGH | MEDIUM | P1 |
| Push通知権限フロー + ホーム画面追加案内 | HIGH | LOW | P1 |
| 右クリック「iPhoneに送る」有効化 | HIGH | LOW | P1（既存コードあり） |
| PWAビューアー（読み取り専用） | HIGH | LOW | P1 |
| Google OAuth認証 | HIGH | MEDIUM | P1（他機能のブロッカー） |
| Push通知失敗リトライ | MEDIUM | LOW | P2 |
| 複数付箋一括送信 | LOW | MEDIUM | P3 |

**Priority key:**
- P1: v2.0で必須
- P2: v2.0完了後に追加
- P3: v3.0以降

---

## Web Push / APNs 技術メモ（実装時に参照）

### iOSでの制約（MEDIUM confidence、訓練データ + 部分的公式確認）

- **iOS 16.4+が必要。** それ以前はSafariでWeb Push未対応。
- **PWAインストール（ホーム画面追加）が必須。** Safariブラウザタブ内では `pushManager.subscribe()` が呼べない。
- **`userVisibleOnly: true` が必須。** Push受信時は必ず通知を表示しなければならない（バックグラウンドサイレント更新は不可）。
- **`beforeinstallprompt` は未対応。** iOS Safariはインストールプロンプトを自動表示しない。「シェア → ホーム画面に追加」の手順をUIで案内する必要がある。

### VAPID + Web Pushのフロー

```
1. サーバー: VAPID鍵ペア生成（公開鍵 + 秘密鍵）
2. iPhone PWA: pushManager.subscribe({ applicationServerKey: 公開鍵 })
3. iPhone: PushSubscription を Hono API に POST（endpoint + p256dh + auth）
4. Hono API: subscriptionをGoogle Driveに保存
5. PC右クリック「iPhoneに送る」:
   → Tauri invoke → Hono /api/push/send
   → Driveからsubscription取得
   → web-push ライブラリでVAPID署名 + 暗号化
   → APNsエンドポイントにHTTP POST
6. APNs → iPhone Safari Service Worker push イベント発火
7. Service Worker: showNotification(付箋タイトル, { body: 付箋テキスト })
8. ユーザーが通知タップ → PWAが前面に出てノート全文表示
```

### ペイロード制限

- APNsのWeb Pushペイロードは最大4KB。付箋テキストが長い場合は冒頭を通知に、全文はPWAで表示する設計が妥当。

### `web-push` npm ライブラリについて

- Node.js向け。VAPID署名・RFC 8291暗号化・HTTP/2送信を統合する標準ライブラリ。
- Honoルート（Next.js App Router内、Node.jsランタイム）で使用可能。
- Apple/iOSのAPNsエンドポイントも同一ライブラリで送信可能（標準Web Push仕様に準拠しているため）。

---

## Sources

- MDN Web Docs — Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API （HIGH confidence）
- MDN Web Docs — PushSubscription: https://developer.mozilla.org/en-US/docs/Web/API/PushSubscription （HIGH confidence）
- MDN Web Docs — Making PWAs installable: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable （HIGH confidence）
- MDN Web Docs — Offline and background operation: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation （HIGH confidence）
- MDN Web Docs — Push Notifications Best Practices: https://developer.mozilla.org/en-US/docs/Web/API/Push_API/Best_Practices （HIGH confidence）
- Apple固有制約（iOS 16.4要件、PWAインストール必須）: 訓練データ + 部分的確認 （MEDIUM confidence）

---

*Feature research for: iPhone連携（Hono + Web Push + Google Drive）*
*Researched: 2026-03-23*
