---
title: 100 プライバシーポリシー
outline: deep
---

# 100 プライバシーポリシー

<p class="lead-text">
俺の付箋におけるデータの取り扱い、Google Drive 連携、ログ、問い合わせについて説明します。
</p>

<p class="version-info">
プライバシーポリシー v1.2 / 2026-05-14
</p>

---

## 1 基本方針

俺の付箋は、ユーザーのメモをできるだけユーザー自身の管理下に置くことを重視します。

PC 版の付箋データは、ユーザーの PC 上のローカルフォルダに保存されます。iPhone 連携を利用する場合のみ、PC と iPhone の間でデータを受け渡すために、ユーザー自身の Google Drive を使用します。

開発者が管理するサーバーには、付箋本文、添付画像、添付動画、ユーザーの Google Drive 内ファイルの内容を保存しません。

---

## 2 取得・保存する情報

### 2.1 PC 版アプリ

PC 版アプリは、以下の情報をユーザーの PC 上に保存します。

<p class="table-caption">表 2.1-1　PC 版アプリで保存する情報</p>

| No | 種別 | 内容 | 保存先 |
|:---|:---|:---|:---|
| 1 | 付箋データ | ユーザーが作成したメモ本文、タグ、表示設定など | ユーザーが指定したローカルフォルダ |
| 2 | アプリ設定 | 表示、保存場所、自動起動、効果音などの設定 | PC 上のアプリ設定領域 |
| 3 | 技術ログ | アプリ起動、エラー、設定変更などの最小限の診断情報 | PC 上のローカルログファイル |

技術ログには、付箋本文、個人情報、フォルダのフルパスを意図的に記録しません。

### 2.2 iPhone 連携

iPhone 連携を利用する場合、以下の情報をユーザー自身の Google Drive に保存します。

<p class="table-caption">表 2.2-1　iPhone 連携で Google Drive に保存する情報</p>

| No | ファイル | 用途 |
|:---|:---|:---|
| 1 | `notes_to_iphone.json` | PC から iPhone に送るメモの一時中継 |
| 2 | `notes_from_iphone.json` | iPhone から PC に送るメモの一時中継 |
| 3 | `push_devices.json` | Web Push 通知の送信先端末情報 |
| 4 | `push_keys.json` | ユーザーごとの Web Push 用 VAPID 鍵 |
| 5 | `fusen_img_*` | 添付画像の一時中継 |
| 6 | `fusen_video_*` | 添付動画の一時中継 |

これらは、ユーザーの Google Drive 内に作成される `ore-no-fusen` フォルダで管理されます。

---

## 3 Google Drive の利用

俺の付箋は、Google Drive API を使用して、ユーザー自身の Google Drive に同期用ファイルを作成・読み書きします。

使用する OAuth スコープは以下です。

```txt
https://www.googleapis.com/auth/drive.file
```

このスコープは、アプリが作成またはユーザーがこのアプリで開いたファイルを扱うために使用します。Google Drive 全体を読み取ることを目的としていません。

Google Drive は、PC と iPhone の間の中継場所として使用します。付箋データは開発者のサーバーではなく、ユーザー自身の Google Drive に保存されます。

### 3.1 Google ユーザーデータとしてアクセスする情報

俺の付箋が Google API を通じてアクセス、収集、または操作する Google ユーザーデータは以下です。

<p class="table-caption">表 3.1-1　Google API を通じてアクセスする情報</p>

| No | 種別 | 内容 | 用途 |
|:---|:---|:---|:---|
| 1 | Google Drive のファイルメタデータ | `ore-no-fusen` フォルダおよびアプリが作成・利用するファイルの名前、ID、親フォルダ、削除状態など | 同期用フォルダと同期用ファイルを検索、作成、更新、削除するため |
| 2 | Google Drive のファイル内容 | `notes_to_iphone.json`、`notes_from_iphone.json`、`push_devices.json`、`push_keys.json`、`fusen_img_*`、`fusen_video_*` など、俺の付箋が作成・利用するファイルの内容 | PC と iPhone の間でメモ、添付画像、添付動画、通知設定を受け渡すため |
| 3 | Google アカウント情報 | Google Drive API の `about` から取得できるメールアドレス、表示名、プロフィール画像 URL | PC と iPhone が同じ Google アカウントで連携しているかをユーザーに分かりやすく表示し、通知端末を識別しやすくするため |
| 4 | Google OAuth トークン | Google Drive API を呼び出すためのアクセストークンとリフレッシュトークン | ユーザーが許可した範囲で Drive API を呼び出し、再ログインなしで連携を継続するため |

俺の付箋は、Google Drive 全体のファイル一覧を収集することや、アプリと無関係なファイルの内容を読み取ることを目的としていません。

### 3.2 Google ユーザーデータの使用、保存、共有

Google ユーザーデータの使用、保存、共有の方針は以下です。

<p class="table-caption">表 3.2-1　Google ユーザーデータの取り扱い</p>

| No | 項目 | 内容 |
|:---|:---|:---|
| 1 | 使用目的 | PC と iPhone の間で付箋本文、添付画像、添付動画、通知設定を同期・中継するためにのみ使用します。 |
| 2 | PC 側の保存 | Google OAuth トークンは PC のローカルアプリデータ領域に保存します。付箋データはユーザーが指定した PC 上の保存先に保存します。 |
| 3 | iPhone PWA 側の保存 | アクセストークン、リフレッシュトークン、通知用の端末 ID などを iPhone のブラウザ内ストレージ（localStorage / IndexedDB）に保存します。 |
| 4 | Vercel 側の処理 | Vercel API Routes は Google OAuth のトークン交換・更新のために認可コードまたはリフレッシュトークンを Google に転送します。Vercel は Google OAuth トークン、付箋本文、添付画像、添付動画、Drive ファイル内容を保存しません。 |
| 5 | 第三者提供 | 開発者は Google ユーザーデータを販売、貸与、広告目的で共有しません。アプリの動作に必要な Google Drive API、Google OAuth、Vercel、Push 通知サービス以外へ提供しません。 |
| 6 | AI / ML 学習 | Google ユーザーデータを AI / ML モデルの学習、改善、推論データセット作成には使用しません。 |
| 7 | 人による閲覧 | 開発者は、ユーザーの Google Drive 内の同期ファイルや付箋本文を通常運用で閲覧しません。ユーザーが自分で GitHub Issues などに情報を投稿した場合を除き、サポート目的でも Drive 内データへアクセスしません。 |

---

## 4 Vercel の利用

iPhone PWA は Vercel 上で配信されます。

開発者が守る `client_secret` を iPhone PWA に入れないため、Vercel の API Routes を OAuth トークン交換・更新のために使用します。これはユーザーに秘密値の管理を求めるためではなく、アプリ側で開発者用の秘密値を守るための設計です。

Vercel は、以下の目的にのみ使用します。

<p class="table-caption">表 4-1　Vercel の利用目的</p>

| No | 用途 | 内容 |
|:---|:---|:---|
| 1 | PWA 配信 | iPhone で使用する Web アプリの配信 |
| 2 | OAuth トークン交換 | Google OAuth の認可コードをアクセストークンへ交換する。トークンは保存しない |
| 3 | OAuth トークン更新 | リフレッシュトークンを使って新しいアクセストークンを取得する。トークンは保存しない |

Vercel には、付箋本文や添付画像・添付動画を保存しません。

---

## 5 第三者提供

開発者は、ユーザーの付箋本文、添付画像、添付動画、Google Drive 内の同期ファイルの内容を第三者へ販売、貸与、共有しません。

ただし、アプリの動作に必要な範囲で、以下の外部サービスを利用します。

<p class="table-caption">表 5-1　利用する外部サービス</p>

| No | サービス | 用途 |
|:---|:---|:---|
| 1 | Google Drive API | ユーザー自身の Drive への同期ファイル保存 |
| 2 | Google OAuth | Google Drive 連携の認可 |
| 3 | Vercel | iPhone PWA 配信および OAuth トークン交換 |
| 4 | Apple Push Notification Service / Push サービス | iPhone への Web Push 通知 |

---

## 6 データの削除

ユーザーは、以下の方法でデータを削除できます。

<p class="table-caption">表 6-1　データの削除方法</p>

| No | データ | 削除方法 |
|:---|:---|:---|
| 1 | PC 上の付箋データ | アプリの保存フォルダ内のファイルを削除 |
| 2 | PC 上の設定（保存先パス、PC 識別子など） | `%APPDATA%\OreNoFusen\settings.json` を削除（アンインストールでは消えません） |
| 3 | PC 上のログ・Drive アクセストークン | `%LOCALAPPDATA%\ore-no-fusen\` 配下を削除（アンインストールで自動削除されます） |
| 4 | Google Drive 上の同期データ | Google Drive の `ore-no-fusen` フォルダ内のファイルを削除（アプリ内「管理者ツール」からも個別削除可能） |
| 5 | Google 連携の許可 | Google アカウントの「サードパーティ製アプリとサービス」から俺の付箋のアクセス権を削除 |

Google Drive 上の同期ファイルを削除すると、iPhone 連携や通知送信が利用できなくなる場合があります。

---

## 7 セキュリティ

### 7.1 開発者が守るもの

Google OAuth の `client_secret` は、開発者が管理します。
この値は iPhone PWA には含めず、Vercel のサーバー側だけで使用します。
Vercel は Google OAuth のトークン交換・更新を行いますが、付箋本文、添付画像、添付動画、Google Drive 上の中継ファイルは保存しません。
ユーザーの Google Drive 用トークンも、Vercel には保存しません。

<p class="table-caption">表 7-1　守るものと責任の分担</p>

| No | 守るもの | 主に守る人 | 理由 |
|:---|:---|:---|:---|
| 1 | Google OAuth の `client_secret` | 開発者 | 俺の付箋アプリが本物であることを Google に示す秘密値のため。iPhone PWA や公開リポジトリには入れない。 |
| 2 | GitHub Secrets / Vercel 環境変数 | 開発者 | リリース、PWA 配信、OAuth トークン交換に使う秘密値を含むため。 |
| 3 | Google Drive の `ore-no-fusen` フォルダ | ユーザー | 送受信中の付箋、添付画像、添付動画、Push 通知用設定が入るため。第三者に共有・公開しない。 |

### 7.2 ユーザーにお願いしたいこと

Google Drive の `ore-no-fusen` フォルダや、その中のファイルを第三者に共有・公開しないでください。
このフォルダには、PC と iPhone の連携に使う一時ファイルや通知用の設定ファイルが入ります。

<p class="table-caption">表 7-2　Drive を第三者に見せた場合に起き得ること</p>

| No | 見られる可能性があるもの | 起き得ること |
|:---|:---|:---|
| 1 | `notes_to_iphone.json` / `notes_from_iphone.json` | PC と iPhone の間で送受信中のメモ本文やタグを見られる可能性があります。 |
| 2 | `fusen_img_*` / `fusen_video_*` | 送受信中の添付画像・添付動画を見られる可能性があります。 |
| 3 | `push_keys.json` と `push_devices.json` | 攻撃者が俺の付箋のふりをして、登録済み iPhone に偽の通知を送る可能性があります。 |

特に `push_keys.json` と `push_devices.json` の両方が見られると、攻撃者が偽の付箋通知をロック画面に表示したり、大量の通知で利用を妨害したりする可能性があります。
ただし、これらのファイルだけで Google アカウントのパスワードや Google Drive 全体を直接読むことはできません。

このアプリが要求する Google Drive の権限は `drive.file` であり、主に俺の付箋が作成・利用する Drive ファイルを扱うための権限です。
Google Drive 全体を自由に読む設計ではありません。

---

## 8 子どものプライバシー

俺の付箋は、13歳未満の子どもを主な対象として設計されたサービスではありません。

---

## 9 改定

本ポリシーは、機能追加、法令変更、運用方針の変更に応じて更新される場合があります。重要な変更がある場合は、アプリまたは公開ドキュメント上で告知します。

---

## 10 問い合わせ

プライバシーに関する問い合わせは、GitHub Issues またはアプリ公開ページに記載されたサポート窓口から連絡してください。

- GitHub: https://github.com/ore-no-fusen/ore-no-fusen

---

## 11 変更履歴

<p class="table-caption">表 11-1　変更履歴</p>

| No | バージョン | 日付 | 変更内容 |
|:---|:---|:---|:---|
| 1 | 1.0 | 26-05-05 | 新規作成。データの取り扱い、Google Drive 連携、外部サービス利用、削除方法を整理。 |
| 2 | 1.1 | 26-05-06 | 2.1〜2.2 取得・保存する情報、4 Vercel の利用、5 第三者提供、6 データの削除、7.1〜7.2 セキュリティを修正。全表に表名と No を追加し、ユーザー向けと開発者向けの責任分担を表で明記。Vercel はトークンを保存しないこと、ユーザーが守る対象は Drive の `ore-no-fusen` フォルダであることを明確化。 |
| 3 | 1.2 | 26-05-14 | 3.1〜3.2 を追加。Google API でアクセスする Google ユーザーデータ、利用目的、保存場所、Vercel での処理、第三者提供しないこと、AI / ML 学習に使わないことを明記。 |
| 4 | 1.3 | 26-05-25 | iPhone 連携で扱う添付動画 `fusen_video_*` を追加。Vercel には付箋本文・添付画像・添付動画を保存しないこと、Drive の一時動画はユーザー自身の管理対象であることを追記。 |
