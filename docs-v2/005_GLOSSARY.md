---
title: 005 用語集
outline: deep
---

# 📖 005 用語集

<p class="lead-text">
専門用語・略語一覧。一般的な定義ではなく、俺の付箋で誰が何のために使うかを中心に説明します。
</p>

<p class="version-info">
v1.1 / 2026-05-06
</p>

---

<a id="sec0"></a>
## 0 登場人物と関係（先に読む）

俺の付箋の設計を語るときには **3 者** が登場します。それぞれ守るものが違い、互いに警戒する関係にあります。

<div class="glossary-table">
<p class="table-caption">表 0-1　3 者の役割と守るもの</p>

| No | 登場人物 | 何者か | 守るもの |
|:---|:---|:---|:---|
| 1 | **ユーザー** | 俺の付箋を使う人。PC と iPhone を所有し、自分の付箋データを管理する | 自分の付箋本文・添付・iPhone への通知の門。Google Drive の `ore-no-fusen` フォルダ |
| 2 | **俺の付箋アプリ開発者** | 俺の付箋アプリそのものを作り、Vercel に PWA を配信する人。OAuth の `client_secret` を Google Cloud Console で管理する | `client_secret`、Vercel 環境変数、GitHub Secrets |
| 3 | **悪意ある第三者** | 上の 2 者ではない攻撃者。データを盗み、偽の通知を送り、なりすますことを目的とする | （守らない・攻撃する側） |

</div>

<div class="glossary-table">
<p class="table-caption">表 0-2　3 者の関係（誰が誰を警戒するか）</p>

| 警戒する人 | 警戒する相手 | 警戒の理由 |
|:---|:---|:---|
| **ユーザー** | 悪意ある第三者 | 自分の付箋を盗まれない、偽通知を受け取らない |
| **ユーザー** | 俺の付箋アプリ開発者 | 開発者を盲目的に信頼しない。必要以上の権限を要求しないアプリを選ぶ |
| **俺の付箋アプリ開発者** | 悪意ある第三者 | `client_secret` を奪われない、悪用されない |
| **俺の付箋アプリ開発者** | ユーザー | `client_secret` をユーザーに渡さない（PWA・コード・公開リポジトリに含めない）。ユーザー環境が侵害された場合に被害が広がらないよう設計する |

</div>

<Note type="info">
<strong>大事なこと：</strong>
「<strong>3 者すべてが、他の 2 者を警戒する</strong>」という前提で設計が組まれています。
特に「<strong>ユーザー → アプリ開発者を警戒</strong>」と「<strong>アプリ開発者 → ユーザーを警戒</strong>」は対等で、どちらか一方を信頼し切る設計にはしません。
鍵・トークン・秘密値の置き場所は、すべてこの 3 者関係から論理的に導かれます。詳細は <a href="/003_IPHONE.html#sec3-0">003_IPHONE 「3.0 鍵の前提」</a> を参照。
</Note>

---

## 1 認証・セキュリティ

<div class="glossary-table">
<p class="table-caption">表 1-1　認証・セキュリティ用語</p>

| No | 用語 | 解説 | 主な対象 | 関連ファイル |
|:---|:---|:---|:---|:---|
| 1 | OAuth 2.0 | ユーザーが Google に「俺の付箋に、Drive のアプリ用ファイルを読み書きしてよい」と許可するための仕組み。認証は「Google アカウントの本人確認」、認可は「俺の付箋にどこまで操作を許すか」を決めること。俺の付箋では認可の結果として Drive 操作用のトークンを受け取る。 | ユーザー / 開発者 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 2 | PKCE | Google ログインの途中で発行される一時コードを、別人に横取りされにくくするための照合手順。俺の付箋では、iPhone PWA と PC アプリがログイン開始時に一時的な合言葉を作り、トークン交換時に同じ合言葉を出せる場合だけ処理を進める。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 3 | アクセストークン | 俺の付箋が Google Drive API を呼ぶための短時間の許可証。有効期限は約 1 時間。PC 側はローカルに、iPhone 側は端末内に持つ。Vercel には保存しない。漏れると期限内は Drive のアプリ用ファイルを読まれたり書き換えられたりする可能性がある。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 4 | リフレッシュトークン | アクセストークンが切れたとき、ユーザーに何度も Google ログインさせずに新しいアクセストークンを取るための長めの許可証。PC 側は `gdrive_token.json`、iPhone 側は localStorage に保存する。Vercel は更新処理に使うだけで保存しない。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 5 | client_id | Google Cloud Console に登録した「俺の付箋アプリ」を Google が見分けるための公開ID。ここでいう client はユーザーの iPhone や PC ではなく、Google に登録したアプリのこと。公開前提なので iPhone PWA に含めてよい。 | 開発者 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 6 | client_secret | Google Cloud Console に登録した「俺の付箋アプリ」が本物であることを Google に示すための秘密値。**俺の付箋アプリ開発者**が守るもので、ユーザーには渡さない。「俺の付箋」を名乗る他アプリが Google OAuth を通れないようにするため、Vercel 環境変数で守り、iPhone PWA・PC アプリ本体・公開リポジトリには含めない。詳細は <a href="/005_GLOSSARY.html#sec0">表 0-2</a> の 3 者関係を参照。 | 俺の付箋アプリ開発者 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 7 | JWT | 署名付きの短いメッセージ形式。俺の付箋では、PC が Web Push を送るときに「このユーザーの通知送信者です」と Push Service に示す VAPID 署名の入れ物として使う。ユーザーが直接扱うものではない。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) |
| 8 | ECDH / P-256 | Web Push の本文を暗号化するために使う鍵交換方式。俺の付箋では、iPhone の Push 購読情報に含まれる `p256dh` / `auth` と組み合わせ、PC が通知本文を暗号化する。これが合わないと Push Service までは届いても iPhone 側で正しく読めない。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) |

</div>

---

## 2 Push 通知

<div class="glossary-table">
<p class="table-caption">表 2-1　Push 通知用語</p>

| No | 用語 | 解説 | 主な対象 | 関連ファイル |
|:---|:---|:---|:---|:---|
| 1 | Web Push | PC から iPhone PWA の Service Worker を起こし、ロック画面通知を表示するためのブラウザ標準の通知仕組み。俺の付箋では、通知そのものは APNs / Push Service が届け、実際の付箋本文や画像は Drive から取得して IndexedDB に保存する。 | 開発者 / 保守担当 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 2 | VAPID | Web Push の「送信権」を公開鍵暗号で証明する仕組み。**俺の付箋アプリ開発者**ではなく**ユーザー本人**が所有者で、「自分が許可した PC からの送信を自分の iPhone で受ける」というユーザー本人の意思表示を技術的に成立させるためのもの。秘密鍵を持つ PC だけが署名でき、APNs / Push Service は対応する公開鍵で署名を検証する。詳細は <a href="/003_IPHONE.html#sec3-3-2-push-keys">003_IPHONE 「push_keys.json」</a>。 | 俺の付箋アプリ開発者 / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 3 | APNs | Apple が運営する iPhone 向け通知配信サービス。俺の付箋では、PC が Push 送信すると最終的に APNs が iPhone の Service Worker を起こす。開発者のサーバーに付箋本文を保存するためのものではない。 | 保守担当 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [002_PC.md](/002_PC.html) |
| 4 | AES-128-GCM | PC から Push Service へ送る通知ペイロードを暗号化する方式。Push Service が通知を中継しても、本文をそのまま読めないようにするために使う。`webpush.rs` の `encrypt_payload` 関数で実装する。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) |
| 5 | pending_open | iOS で通知タップ時の `notificationclick` が発火しない場合に備え、Service Worker が IndexedDB に残す「直近に開くべき通知ID」。PWA 起動時に `page.tsx` がこれを読んで、通知から開いたように付箋を表示・再通知する。30 分で失効し、読んだら削除する。 | 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |

</div>

---

## 3 ブラウザ技術

<div class="glossary-table">
<p class="table-caption">表 3-1　ブラウザ技術用語</p>

| No | 用語 | 解説 | 主な対象 | 関連ファイル |
|:---|:---|:---|:---|:---|
| 1 | PWA | iPhone で Safari からホーム画面に追加して使う Web アプリ。俺の付箋では `/viewer` が iPhone 版 PWA で、PC から受け取った付箋の閲覧、iPhone から PC への送信、Push 通知設定を行う。 | ユーザー / 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |
| 2 | Service Worker（SW） | iPhone PWA の裏方として動く JavaScript。俺の付箋では、アプリ画面を閉じていても Push を受け取り、Drive から本文・画像を取得し、IndexedDB に保存して通知を表示する。 | 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |
| 3 | IndexedDB | iPhone 端末内にあるブラウザ内データベース。俺の付箋では、iPhone 版の付箋本体（`fusen-drafts`）、ログ（`fusen-logs`）、トークンや通知IDなどのメタ情報（`fusen-meta`）を保存する。Vercel には保存しない。 | 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |
| 4 | frontmatter | Markdown ファイルの先頭に置くメタデータ領域。俺の付箋では、PC 側の .md ファイルにタイトル、タグ、アラーム日時、色、位置などを保存する。本文とは別にアプリが管理したい情報を入れる場所。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 5 | skipWaiting / clients.claim | 新しい Service Worker をすぐ有効化するための API。俺の付箋では、iPhone PWA のバグ修正版を出した後、古い Service Worker が残り続けて Push 受信や保存処理が古いままになることを防ぐ。 | 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |
| 6 | locked（フラグ） | iPhone 側の付箋に付く「ロック画面へ通知を残し続けるか」の値。`true` なら通知を再表示する。ユーザーは 🔔 ボタンで ON/OFF し、保守担当は通知が消えない/消える問題の確認点として見る。 | ユーザー / 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |

</div>

---

## 4 フレームワーク・ランタイム

<div class="glossary-table">
<p class="table-caption">表 4-1　フレームワーク・ランタイム用語</p>

| No | 用語 | 解説 | 主な対象 | 関連ファイル |
|:---|:---|:---|:---|:---|
| 1 | Tauri | PC 版アプリを作るための実行基盤。俺の付箋では、画面は WebView、OS 操作・ファイル保存・Google Drive 連携・Push 送信は Rust 側が担当する。PC で落ちる/保存できない問題の調査では Tauri と Rust 側を見る。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) |
| 2 | Next.js | React ベースの Web アプリ基盤。俺の付箋では、PC 版の画面、iPhone PWA、Vercel API Routes を同じプロジェクト内で実装するために使う。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 3 | Vercel | 開発者が管理するサーバー側の実行場所。俺の付箋では iPhone PWA を配信し、`client_secret` を iPhone に渡さず Google OAuth のトークン交換・更新を行う。付箋本文、添付画像、添付動画、Drive 中継ファイル、Google Drive 用トークンは保存しない。 | 開発者 / 保守担当 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 4 | Vitest | TypeScript / React の小さな単位の動作を確認するテスト基盤。俺の付箋では、部品や関数の変更で既存動作を壊していないかを見るために使う。 | 開発者 | [004_TEST.md](/004_TEST.html) |
| 5 | Playwright | 実際の画面操作に近い形でアプリを自動操作するテスト基盤。俺の付箋では、クリック、入力、保存、画面遷移など、ユーザー操作の流れが壊れていないかを見るために使う。 | 開発者 / 保守担当 | [004_TEST.md](/004_TEST.html) |

</div>

---

## 5 設計用語

<div class="glossary-table">
<p class="table-caption">表 5-1　設計用語</p>

| No | 用語 | 解説 | 主な対象 | 関連ファイル |
|:---|:---|:---|:---|:---|
| 1 | USDM | 要求、理由、仕様を分けて書くための設計書の書き方。俺の付箋では、なぜその機能が必要かと、実装で何を満たすべきかを混ぜないために `000_REQUIREMENTS.md` で使う。 | 開発者 / 保守担当 | [000_REQUIREMENTS.md](/000_REQUIREMENTS.html) |
| 2 | DOD | データの形と変換を中心に処理を設計する考え方。俺の付箋では、Rust 側で状態変更と副作用を見通しやすくし、保存や移動の失敗で詰まらないようにするために使う。 | 開発者 | [002_PC.md](/002_PC.html) |
| 3 | Effect Pattern | Logic 層が「何をすべきか」を Effect として返し、Command 層が実際のファイル書き込みや API 呼び出しを行う設計。俺の付箋では、保存・削除・移動の失敗時に原因を分けて追いやすくするために使う。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) |
| 4 | SSOT | データの正を一か所に決める考え方。俺の付箋では、PC 側は `AppState`、iPhone 側は IndexedDB を正にすることで、画面ごとに状態がずれて戻れなくなる状況を減らす。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 5 | AppState | PC アプリの Rust 側で持つ単一状態。ノート一覧、設定、VAPID 鍵、デバイス情報などを保持し、各 Tauri コマンドがここを通して状態を確認・更新する。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) |
| 6 | Vault | PC 上の付箋 .md ファイルの保存先フォルダ。ユーザーが選ぶ場所で、俺の付箋の本文データの実体。バックアップや直接編集の確認点になる。 | ユーザー / 保守担当 | [002_PC.md](/002_PC.html) |
| 7 | 鍵（key） | ある人が、ある悪いことを防ぐために、ある場所に置く道具。すべての鍵は **所有者・目的・防衛手段** の 3 観点で記述する。所有者を最初に決めないと、置き場所が間違う。 | 全員 | [003_IPHONE.md](/003_IPHONE.html#sec3-0) |
| 8 | 秘密鍵（private key） | 「外に出してはいけない鍵」ではなく、「秘密の所有者だけが持つべき鍵」。**所有者は <a href="/005_GLOSSARY.html#sec0">3 者</a>のうちのいずれか**で、置き場所はそれぞれ違う：**俺の付箋アプリ開発者の秘密**（例: `client_secret`、Vercel サーバーに置く）、**ユーザー本人の秘密**（例: OAuth トークン、ユーザーの PC ローカル）、**ユーザーが許可した端末群の共有秘密**（例: VAPID 秘密鍵、ユーザーの Drive で共有）。「秘密鍵は外に出すな」は俺の付箋アプリ開発者の秘密だけに当てはまる業界一般則であり、他の所有者には当てはまらない。 | 全員 | [003_IPHONE.md](/003_IPHONE.html#sec3-0) |
| 9 | VAPID 鍵 | iPhone への偽通知を防ぐための鍵。**ユーザー本人**が所有し、ユーザーが許可した全 PC・全 iPhone で共有する。Drive 上の 1 個を正、各 PC ローカルはキャッシュ。漏えいすると**悪意ある第三者**が「正規の通知」に見える Push を送れる可能性があるが、付箋本文・添付メディアは別途 Drive 権限が必要なので読めない。 | 俺の付箋アプリ開発者 / 保守担当 | [003_IPHONE.md](/003_IPHONE.html#sec3-3-2-push-keys) |

</div>

---

## 6 Google Drive API

<div class="glossary-table">
<p class="table-caption">表 6-1　Google Drive API 用語</p>

| No | 用語 | 解説 | 主な対象 | 関連ファイル |
|:---|:---|:---|:---|:---|
| 1 | Google Drive API v3 | 俺の付箋がユーザー自身の Google Drive にファイルを作成・読み書きするための API。PC と iPhone は直接通信せず、Drive 上の中継ファイルを介してやり取りする。 | 開発者 / 保守担当 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 2 | multipart upload | JSON のメタ情報とファイル本体を1回のリクエストで Drive に送る方式。俺の付箋では、メモ用 JSON や添付画像を Drive に置くときに使う。アップロード失敗時の調査ではこの方式の処理を見る。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 3 | ore-no-fusen フォルダ | Google Drive 上に自動作成される俺の付箋専用フォルダ。PC と iPhone の中継ファイル、添付画像、Push 用設定を置く。ユーザー向けの注意として、このフォルダを**悪意ある第三者**を含む外部に共有・公開しない。 | ユーザー / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 4 | notes_to_iphone.json | PC から iPhone へ送る付箋を一時的に入れる Drive ファイル。PC が書き込み、Service Worker が読み込んで IndexedDB に保存した後、処理済み分を削除する。 | 保守担当 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 5 | notes_from_iphone.json | iPhone から PC へ送る付箋を一時的に入れる Drive ファイル。iPhone PWA が書き込み、PC が 30 秒ごとに読み込んで付箋を作った後、処理済み分を削除する。 | 保守担当 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 6 | push_devices.json | iPhone の Push 通知送信先情報を保存する Drive ファイル。endpoint、`p256dh`、`auth` などを持つ。これがないと PC はどの iPhone に通知すればよいか分からない。 | 保守担当 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [002_PC.md](/002_PC.html) |
| 7 | push_keys.json | ユーザーごとの VAPID 公開鍵・秘密鍵を保存する Drive ファイル。公開鍵は iPhone の Push 購読に使い、秘密鍵は PC が Web Push 送信者であることを署名するために使う。**悪意ある第三者**に `push_devices.json` と一緒に見られると、偽の通知を送られる可能性がある。詳細は <a href="/003_IPHONE.html#sec3-3-2-push-keys">003_IPHONE 「push_keys.json」</a>。 | ユーザー / 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |
| 8 | fusen_video_* | iPhone PWA から PC へ動画を送るとき、Google Drive に一時保存する動画ファイル名。PC が受信して `assets/video/` に保存した後に削除する。ユーザーが入力した本文や元ファイル名とは別の一時名として扱う。 | 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |

</div>

---

## 7 データ形式

<div class="glossary-table">
<p class="table-caption">表 7-1　データ形式用語</p>

| No | 用語 | 解説 | 主な対象 | 関連ファイル |
|:---|:---|:---|:---|:---|
| 1 | YAML | 人が読みやすいキー・値形式のテキスト。俺の付箋では、PC 側の .md ファイル先頭にある frontmatter で、色、タグ、位置、アラームなどを保存する。 | 開発者 / 保守担当 | [002_PC.md](/002_PC.html) |
| 2 | JSON | アプリ同士がデータを受け渡すためのテキスト形式。俺の付箋では、Drive 上の `notes_to_iphone.json`、`push_devices.json` などの中継ファイルや API レスポンスに使う。 | 開発者 / 保守担当 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 3 | Blob | 画像や動画などのバイナリデータをブラウザ内で扱うための形式。俺の付箋では、iPhone PWA が添付メディアを IndexedDB に保存し、送信時に Drive へアップロードするために使う。 | 開発者 / 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |
| 4 | Markdown（.md） | 付箋本文の保存形式。PC 側では Vault フォルダ内の .md ファイルが付箋の実体で、frontmatter と本文を1つのテキストファイルとして持つ。 | ユーザー / 保守担当 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 5 | 添付メディア | 付箋本文とは別に紐づく画像・動画などのファイル。ユーザーの思考やメモに素材を添える部品であり、本文やタイトルを置き換えるものではない。 | ユーザー / 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |
| 6 | VideoDrop | iPhone PWA から `mp4` / `mov` を PC へ送る機能。Windows ユーザー向けの AirDrop 的な使い方だが、俺の付箋では動画管理アプリではなく、付箋に動画ファイルの保存先パスを紐づける添付機能として扱う。 | ユーザー / 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |
| 7 | originalFileName | ユーザーが選んだ動画の元ファイル名。Drive に置く一時ファイル名や PC 保存パスとは別物。表示・確認には使えるが、ユーザーが入力した本文を上書きする根拠にしてはならない。 | 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |
| 8 | videos[] | `notes_from_iphone.json` と IndexedDB で使う添付動画の配列。複数動画を同じ付箋に紐づけるための正規フィールド。旧互換の `videoFileName` 単体フィールドより優先する。 | 保守担当 | [003_IPHONE.md](/003_IPHONE.html) |

</div>

---

## 8 改版履歴

<div class="history-table">
<p class="table-caption">表 8-1　改版履歴</p>

| No | バージョン | 日付 | 変更内容 |
|:---|:---|:---|:---|
| 1 | 1.0 | 26-04-20 | 新規作成。設計書に登場する専門用語を整理。 |
| 2 | 1.1 | 26-05-06 | 1 認証・セキュリティ、2 Push 通知、3 ブラウザ技術、4 フレームワーク・ランタイム、5 設計用語、6 Google Drive API、7 データ形式を修正。全表に「主な対象」を追加し、OAuth / client_secret / VAPID / Drive ファイルを「俺の付箋で何のために使うか」が分かる表現へ修正。 |
| 3 | 1.2 | 26-05-25 | VideoDrop、添付メディア、`fusen_video_*`、`videos[]`、`originalFileName` を追加。本文・元ファイル名・Drive 一時名・PC 保存パスを混同しない用語境界を明記。 |
| 4 | 1.3 | 26-05-31 | 0 章「登場人物と関係」を新設。3 者（ユーザー / 俺の付箋アプリ開発者 / 悪意ある第三者）と互いの警戒関係を表で明記。VAPID / 秘密鍵 / push_keys.json / client_secret / ore-no-fusen フォルダの記述を 3 者語彙に統一。「作者」「攻撃者」「第三者」表記を整理。 |

</div>
