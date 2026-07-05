# 俺の付箋

<div align="center">

*Read this in other languages: [English](README.md) | **日本語***

![Ore-no-Fusen Desktop](public/screenshots/ScreenShot_OreNoFusen.png)

**デスクトップに、思考を貼り付けよう**

Markdownで書ける、美しい付箋アプリ

[![GitHub release](https://ore-no-fusen-badges.ore-no-fusen-g8.workers.dev/badges/release.svg)](https://github.com/ore-no-fusen/ore-no-fusen/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Downloads](https://ore-no-fusen-badges.ore-no-fusen-g8.workers.dev/badges/downloads-total.svg)](https://github.com/ore-no-fusen/ore-no-fusen/releases)
[![Downloads Latest](https://ore-no-fusen-badges.ore-no-fusen-g8.workers.dev/badges/downloads-latest.svg)](https://github.com/ore-no-fusen/ore-no-fusen/releases/latest)

**累計1,000ダウンロードありがとうございます。**

[ダウンロード](https://github.com/ore-no-fusen/ore-no-fusen/releases/latest) • [オンラインドキュメント](https://ore-no-fusen.github.io/ore-no-fusen/) • [FAQ](docs/101_FAQ.md) • [ランディングページ](https://ore-no-fusen.vercel.app) • [🎥 漫画で学ぶ](https://github.com/ore-no-fusen/ore-no-fusen/wiki/%E6%BC%AB%E7%94%BB%E3%81%A7%E5%AD%A6%E3%81%B6%E4%BF%BA%E3%81%AE%E4%BB%98%E7%AE%8B)

</div>

---
# 俺の付箋

思いついたことを、すぐメモできる。

Markdownで書ける、デスクトップ付箋。

## インストール（10秒）
```bash
winget install ore-no-fusen
```

またはダウンロードページから：

[最新リリース](https://github.com/ore-no-fusen/ore-no-fusen/releases/latest)


## コンセプト

思考を止めずに、瞬時にアイデアをメモできる。

俺の付箋は、アイデアが浮かんだ瞬間にすぐ書き留められる、高速思考キャンバスです。

---


## ✨ 特徴

### 🎯 シンプルで強力

- **Markdownサポート** - 見出し、リスト、コードブロック、表、Mermaid図、画像など豊富な記法をサポート
- **ワンクリック編集** - クリックした場所からすぐ入力開始。自動保存で手間なし
- **フローティングフォーマットバー** - テキスト選択時に自動表示。太字・見出し・リスト・チェックボックスをワンクリックで
- **タグ・アーカイブ** - 付箋を整理して管理。フォルダ構造で見やすく
- **全文検索** - 正規表現対応の全文検索で瞬時に発見。該当行に自動ジャンプ・ハイライト
- **最前面固定（ピン留め）** - 📌ボタンで他のウィンドウの手前に常に表示
- **システムトレイ統合** - 常駐して、いつでもアクセス可能
- **自動起動** - システム起動時に自動で立ち上がる
- **効果音** - 心地よいフィードバックで快適な操作感

### 🔒 プライバシー重視

- **完全ローカル** - データは全てローカルに保存。クラウド不要
- **オフライン動作** - インターネット接続不要で動作
- **オープンソース** - コードは全て公開。安心して使える

---

## 📸 スクリーンショット

![メイン画面](public/screenshots/ScreenShot_OreNoFusen.png)

---

## 📥 インストール

### 一般ユーザー向け（推奨）

1. [最新リリースページ](https://github.com/ore-no-fusen/ore-no-fusen/releases/latest)を開く
2. 最新版の **`ore-no-fusen_x.x.x_x64-setup.exe`** をダウンロード
3. ダウンロードしたファイルをダブルクリックしてインストール
4. インストール完了後、スタートメニューから「俺の付箋」を起動

**システム要件:**
- OS: Windows 10/11 (64-bit)
- 容量: 約 100MB
- メモリ: 4GB以上推奨

詳しいインストール手順は[ユーザーガイド（Wiki・第1章）](https://github.com/ore-no-fusen/ore-no-fusen/wiki/01-はじめに-インストール)をご覧ください。

### ⚠️ インストール時の「SmartScreen」警告について

インストール時に「**Windows によって PC が保護されました**」という画面が表示される場合があります。

**これは何？**  
SmartScreen とは、Windows に搭載されたセキュリティ機能です。ダウンロード数が少ないアプリや、有料の「コード署名証明書」を持たないアプリに対して自動的に警告を表示します。ウイルスを検出したわけではありません。

**対処方法:**

1. 「詳細情報」をクリック
2. 「実行」ボタンが表示されるのでクリック

これで通常通りインストールできます。

> 💡 **ご安心ください** — ore-no-fusen はオープンソースです。ソースコードは [GitHub](https://github.com/ore-no-fusen/ore-no-fusen) で全て公開されており、誰でも内容を確認できます。

詳しいインストール手順は[ユーザーガイド（Wiki・第1章）](https://github.com/ore-no-fusen/ore-no-fusen/wiki/01-はじめに-インストール)をご覧ください。

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

---

## 🎯 使い方

### 基本操作

1. **付箋を作成** - システムトレイのアイコンを右クリック → 「新しい付箋」
2. **編集** - 付箋をダブルクリック
3. **検索** - `Ctrl+F` で検索ウィンドウを開く
4. **タグ付け** - 付箋の内容に `#タグ名` を記述

詳しい使い方は[ユーザーガイド（Wiki）](https://github.com/ore-no-fusen/ore-no-fusen/wiki)をご覧ください。

### Markdownの例

```markdown
# 今日のタスク

## 重要
- [ ] プレゼン資料作成
- [x] メール返信

## メモ
**締切**: 2026/02/15
*担当*: 山田さん

| 項目 | 状態 |
|------|------|
| 資料 | 作成中 |
| 確認 | 待ち  |

#仕事 #重要
```

---

## 💡 ユースケース

### 📝 タスク管理
チェックリストとタグで、日々のタスクを整理。完了したタスクはアーカイブへ。

### 💭 アイデアメモ
思いついたアイデアを即座にメモ。Markdownで構造化して整理。

### 📚 学習ノート
学習内容をタグで分類。検索機能で復習も簡単。

### 🔖 リンク集
よく使うリンクを付箋に保存。タグで分類して管理。

---

## 🛠️ 技術スタック

### フロントエンド
- **Next.js 14** (App Router)
- **React 18**
- **TypeScript**
- **Tailwind CSS**
- **CodeMirror 6** (Markdownエディタ)

### バックエンド
- **Tauri 2.x** (デスクトップアプリフレームワーク)
- **Rust** (高速・安全なバックエンド)

### アーキテクチャ
- **DOD (Data-Oriented Design)** - データ中心設計
- **Effect Pattern** - 副作用の明示的な管理
- **AppState (SSOT)** - 単一の信頼できる情報源

---

## 📖 ドキュメント

- [オンラインドキュメント (GitHub Pages)](https://ore-no-fusen.github.io/ore-no-fusen/) - システム設計・仕様書
- [ユーザーガイド（Wiki）](https://github.com/ore-no-fusen/ore-no-fusen/wiki) - 詳しい使い方（章分割・サイドバー付き）
- [FAQ](docs/101_FAQ.md) - よくある質問

---

## 🤝 コントリビューション

Issue、Pull Requestを歓迎します！

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Requestを作成

詳しくは Issue または Pull Request でご相談ください。

---

## 📝 ライセンス

MIT License - 詳細は[LICENSE](LICENSE)をご覧ください。

---

## 🙏 謝辞

ore-no-fusenは以下のオープンソースプロジェクトを使用しています:

- [Tauri](https://tauri.app/)
- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [CodeMirror](https://codemirror.net/)
- [Tailwind CSS](https://tailwindcss.com/)

---

## 📞 サポート

- **バグ報告**: [GitHub Issues](https://github.com/ore-no-fusen/ore-no-fusen/issues)
- **機能リクエスト**: [GitHub Discussions](https://github.com/ore-no-fusen/ore-no-fusen/discussions)
- **質問**: [FAQ](docs/101_FAQ.md)

---

<div align="center">

**ore-no-fusenで、思考整理をもっと楽しく** 🎉

Made with ❤️ by ONF Studios

</div>
