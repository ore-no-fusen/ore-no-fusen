# Vercel セットアップガイド

> **注意**: 通常のリリース作業（[010_RELEASE.md](010_RELEASE.md)）ではこのファイルは不要。  
> Vercelプロジェクトを**新規作成・再設定する時だけ**参照すること。

---

## このVercelプロジェクトが担っているもの

- **ランディングページ** (`/landing`) — アプリの紹介・インストーラーダウンロード
- **iPhone PWA** (`/viewer`) — iPhoneからの付箋送受信

---

## 初期セットアップ手順

### 1. Vercelにログイン

1. https://vercel.com/ にアクセス
2. GitHubアカウントでログイン

### 2. 新しいプロジェクトを作成

1. 「Add New...」→「Project」
2. `ore-no-fusen/ore-no-fusen` リポジトリを選択
3. 「Import」をクリック

### 3. プロジェクト設定

**Framework Preset**: Next.js（自動検出）

**Build and Output Settings**:
- **Build Command**: `npm run build`
- **Install Command**: `npm install`

### 4. 環境変数の設定

以下をVercelの「Environment Variables」に登録する。

| 変数名 | 用途 | 備考 |
|--------|------|------|
| `NEXT_PUBLIC_GDRIVE_CLIENT_ID` | Google Drive OAuth クライアントID | Google Cloud Consoleで取得 |
| `GOOGLE_CLIENT_SECRET_PWA` | Google Drive OAuth クライアントシークレット | Google Cloud Consoleで取得 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | プッシュ通知用VAPIDキー | `npx web-push generate-vapid-keys` で生成 |
| `DISCORD_WEBHOOK_URL` | フィードバック通知用Discord Webhook | Discordチャンネル設定で取得 |

> `NEXT_PUBLIC_APP_VERSION` はVercelへの設定不要。`next.config.mjs` がビルド時に `package.json` から自動設定する。

### 5. デプロイ

「Deploy」ボタンをクリック。完了後、以下のようなURLが発行される：

```
https://ore-no-fusen.vercel.app
```

---

## 自動デプロイの仕組み

GitHubにpushすると自動でデプロイされる。

| ブランチ | デプロイ先 |
|---------|-----------|
| `main` | 本番環境 |
| `develop` その他 | プレビュー環境（iPhone動作確認に使う） |

---

## トラブルシューティング

### ビルドエラーが発生する

ローカルで `npm run build` を実行してエラーを確認してから修正する。

### 環境変数が効いていない

Vercelダッシュボードの「Settings」→「Environment Variables」で登録内容を確認する。  
追加・変更後は再デプロイが必要。
