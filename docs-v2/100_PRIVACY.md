---
title: 100 プライバシーポリシー
outline: deep
---

# 100 プライバシーポリシー

<p class="lead-text">
俺の付箋におけるデータの取り扱い、Google Drive 連携、ログ、問い合わせについて説明します。
</p>

<p class="version-info">
プライバシーポリシー v1.0 / 2026-05-05
</p>

---

## 1 基本方針

俺の付箋は、ユーザーのメモをできるだけユーザー自身の管理下に置くことを重視します。

PC 版の付箋データは、ユーザーの PC 上のローカルフォルダに保存されます。iPhone 連携を利用する場合のみ、PC と iPhone の間でデータを受け渡すために、ユーザー自身の Google Drive を使用します。

開発者が管理するサーバーには、付箋本文、添付画像、ユーザーの Google Drive 内ファイルの内容を保存しません。

---

## 2 取得・保存する情報

### 2.1 PC 版アプリ

PC 版アプリは、以下の情報をユーザーの PC 上に保存します。

| 種別 | 内容 | 保存先 |
|:---|:---|:---|
| 付箋データ | ユーザーが作成したメモ本文、タグ、表示設定など | ユーザーが指定したローカルフォルダ |
| アプリ設定 | 表示、保存場所、自動起動、効果音などの設定 | PC 上のアプリ設定領域 |
| 技術ログ | アプリ起動、エラー、設定変更などの最小限の診断情報 | PC 上のローカルログファイル |

技術ログには、付箋本文、個人情報、フォルダのフルパスを意図的に記録しません。

### 2.2 iPhone 連携

iPhone 連携を利用する場合、以下の情報をユーザー自身の Google Drive に保存します。

| ファイル | 用途 |
|:---|:---|
| `notes_to_iphone.json` | PC から iPhone に送るメモの一時中継 |
| `notes_from_iphone.json` | iPhone から PC に送るメモの一時中継 |
| `push_devices.json` | Web Push 通知の送信先端末情報 |
| `push_keys.json` | ユーザーごとの Web Push 用 VAPID 鍵 |
| `fusen_img_*` | 添付画像の一時中継 |

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

---

## 4 Vercel の利用

iPhone PWA は Vercel 上で配信されます。また、Google OAuth の `client_secret` をブラウザに渡さないため、Vercel の API Routes を OAuth トークン交換・更新のために使用します。

Vercel は、以下の目的にのみ使用します。

| 用途 | 内容 |
|:---|:---|
| PWA 配信 | iPhone で使用する Web アプリの配信 |
| OAuth トークン交換 | Google OAuth の認可コードをアクセストークンへ交換 |
| OAuth トークン更新 | リフレッシュトークンを使ったアクセストークン更新 |

Vercel には、付箋本文や添付画像を保存しません。

---

## 5 第三者提供

開発者は、ユーザーの付箋本文、添付画像、Google Drive 内の同期ファイルの内容を第三者へ販売、貸与、共有しません。

ただし、アプリの動作に必要な範囲で、以下の外部サービスを利用します。

| サービス | 用途 |
|:---|:---|
| Google Drive API | ユーザー自身の Drive への同期ファイル保存 |
| Google OAuth | Google Drive 連携の認可 |
| Vercel | iPhone PWA 配信および OAuth トークン交換 |
| Apple Push Notification Service / Push サービス | iPhone への Web Push 通知 |

---

## 6 データの削除

ユーザーは、以下の方法でデータを削除できます。

| データ | 削除方法 |
|:---|:---|
| PC 上の付箋データ | アプリの保存フォルダ内のファイルを削除 |
| PC 上のログ | `%LOCALAPPDATA%\ore-no-fusen\app.log` を削除 |
| Google Drive 上の同期データ | Google Drive の `ore-no-fusen` フォルダ内のファイルを削除 |
| Google 連携の許可 | Google アカウントの「サードパーティ製アプリとサービス」から俺の付箋のアクセス権を削除 |

Google Drive 上の同期ファイルを削除すると、iPhone 連携や通知送信が利用できなくなる場合があります。

---

## 7 セキュリティ

Google OAuth の `client_secret` は、iPhone のブラウザには配布せず、Vercel のサーバーサイドでのみ使用します。

Web Push 用の VAPID 鍵は、ユーザーごとに生成され、ユーザー自身の Google Drive に保存されます。iPhone はこの公開鍵を使って Push 購読を行い、PC は対応する秘密鍵で通知を送信します。

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

