# 俺の付箋

Markdownファイルをデスクトップ上の付箋として表示するTauriアプリケーションです。

## 📥 インストール

### 一般ユーザー向け（推奨）

1. [Releases ページ](https://github.com/ore-no-fusen/ore-no-fusen/releases)を開く
2. 最新版の **`ore-no-fusen_x.x.x_x64-setup.exe`** をダウンロード
3. ダウンロードしたファイルをダブルクリックしてインストール
4. インストール完了後、スタートメニューから「俺の付箋」を起動

### 開発者向け

#### 前提条件
- Node.js 18以上
- Rust（[rustup](https://rustup.rs/)からインストール）

#### セットアップ手順

1. リポジトリをクローン：
```bash
git clone https://github.com/ore-no-fusen/ore-no-fusen.git
cd ore-no-fusen
```

2. 依存関係をインストール：
```bash
npm install
```

3. 開発モードで起動：
```bash
npm run tauri dev
```

4. プロダクションビルド：
```bash
npm run tauri build
```

ビルド成果物は `src-tauri\target\release\bundle\nsis\` に生成されます。

## 🎯 主な機能

- デスクトップ上に付箋として表示
- Markdownのリアルタイムプレビュー
- タグ・アーカイブ機能
- システムトレイ統合
- 自動起動設定
- 効果音

## 🛠️ 技術スタック

### フロントエンド
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- CodeMirror 6

### バックエンド
- Tauri 2.x
- Rust

## 📝 ライセンス

MIT License

## 🤝 コントリビューション

Issue、Pull Requestを歓迎します！

