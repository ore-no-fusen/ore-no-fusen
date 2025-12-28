# 俺の付箋

ObsidianのVault（ローカルフォルダ）内のMarkdownファイルを付箋UIで表示するPWAアプリです。

## 機能

- File System Access APIを使用したローカルフォルダ選択
- フォルダ内の`.md`ファイル一覧表示
- MarkdownのHTMLレンダリング表示
- 最後に選択したファイル名の自動保存・復元
- 再読み込み機能

## セットアップ

### 前提条件

- Node.js 18以上がインストールされていること

### インストール手順

1. プロジェクトディレクトリに移動：
```bash
cd ore-no-fusen
```

2. 依存関係をインストール：
```bash
npm install
```

3. 開発サーバーを起動：
```bash
npm run dev
```

4. ブラウザで `http://localhost:3000` を開く

## 使い方

1. 「Vaultフォルダを選択」ボタンをクリック
2. ObsidianのVaultフォルダ（またはMarkdownファイルが入っているフォルダ）を選択
3. 左側のファイル一覧から表示したい`.md`ファイルをクリック
4. 右側にMarkdownがレンダリングされて表示されます
5. 「再読み込み」ボタンで選択中のファイルを再読み込みできます

## 注意事項

- File System Access APIは、Chrome、Edge、OperaなどのChromiumベースのブラウザでのみ利用可能です
- FirefoxやSafariでは動作しません
- ローカルファイルへのアクセスには、ブラウザの許可が必要です

## ビルド

本番用ビルド：
```bash
npm run build
npm start
```

## プロジェクト構造

```
ore-no-fusen/
├── app/
│   ├── layout.tsx      # ルートレイアウト
│   ├── page.tsx        # メインページ（ファイル選択・表示機能）
│   └── globals.css     # グローバルスタイル
├── public/
│   └── manifest.json   # PWAマニフェスト
├── types/
│   └── filesystem.d.ts   # File System Access APIの型定義
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
└── README.md
```

## 技術スタック

- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- react-markdown
- remark-gfm

