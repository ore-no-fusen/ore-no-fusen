# ore-no-fusen ランディングページ デプロイガイド

Next.jsで作成したランディングページをVercelにデプロイする手順です。

## 🚀 Vercelへのデプロイ

### 前提条件

- GitHubアカウント
- Vercelアカウント（無料）
  - https://vercel.com/ でサインアップ
  - GitHubアカウントで連携可能

---

## 📝 デプロイ手順

### 1. Vercelにログイン

1. https://vercel.com/ にアクセス
2. 「Sign Up」または「Log In」
3. GitHubアカウントで連携

### 2. 新しいプロジェクトを作成

1. Vercelダッシュボードで「Add New...」→「Project」をクリック
2. GitHubリポジトリを選択
   - `ore-no-fusen/ore-no-fusen` を選択
3. 「Import」をクリック

### 3. プロジェクト設定

**Framework Preset**: Next.js（自動検出されるはず）

**Root Directory**: 
- デフォルト（`.`）のまま

**Build and Output Settings**:
- **Build Command**: `npm run build`
- **Output Directory**: `out`
- **Install Command**: `npm install`

**Environment Variables**:
- 現時点では不要

### 4. デプロイ

1. 「Deploy」ボタンをクリック
2. ビルドが完了するまで待つ（1-3分）
3. デプロイ完了!

---

## 🔗 デプロイ後の確認

### URL確認

デプロイが完了すると、以下のようなURLが発行されます:
```
https://ore-no-fusen.vercel.app
```

または
```
https://ore-no-fusen-[ランダム文字列].vercel.app
```

### カスタムドメイン設定（オプション）

1. Vercelダッシュボードで「Settings」→「Domains」
2. カスタムドメインを追加
3. DNS設定を更新

---

## ⚙️ 設定の調整

### ランディングページのみをデプロイする場合

現在の設定では、ore-no-fusenアプリ全体がビルドされます。
ランディングページのみをデプロイしたい場合は、以下の設定を調整してください:

#### オプション1: 別リポジトリを作成

1. `ore-no-fusen-landing` という新しいリポジトリを作成
2. `app/landing/` の内容をコピー
3. 必要な設定ファイルをコピー
4. Vercelで新しいリポジトリをデプロイ

#### オプション2: ブランチを分ける

1. `landing` ブランチを作成
2. ランディングページ用の設定に変更
3. Vercelで `landing` ブランチをデプロイ

---

## 🔄 自動デプロイ

Vercelは、GitHubにプッシュすると自動的にデプロイされます。

- **main ブランチ**: 本番環境にデプロイ
- **その他のブランチ**: プレビュー環境にデプロイ

---

## 📊 パフォーマンス最適化

### Lighthouse スコア目標

- **Performance**: 90+
- **Accessibility**: 90+
- **Best Practices**: 90+
- **SEO**: 90+

### 最適化のポイント

1. **画像最適化**
   - WebP形式を使用
   - 適切なサイズにリサイズ
   - 遅延読み込み（lazy loading）

2. **コード分割**
   - Next.jsが自動的に行う

3. **キャッシュ設定**
   - Vercelが自動的に最適化

---

## 🐛 トラブルシューティング

### ビルドエラーが発生する

**原因**: 依存関係の問題、TypeScriptエラーなど

**解決方法**:
1. ローカルで `npm run build` を実行して確認
2. エラーメッセージを確認
3. 必要に応じて修正してプッシュ

### ページが表示されない

**原因**: ルーティングの問題

**解決方法**:
1. `/landing` にアクセスしてみる
2. Vercelのログを確認
3. `next.config.mjs` の設定を確認

### スタイルが適用されない

**原因**: Tailwind CSSの設定問題

**解決方法**:
1. `tailwind.config.js` の `content` 設定を確認
2. `globals.css` が正しくインポートされているか確認

---

## 📈 アナリティクス（オプション）

### Vercel Analytics

1. Vercelダッシュボードで「Analytics」タブ
2. 「Enable Analytics」をクリック
3. 無料プランで基本的なアナリティクスが利用可能

### Google Analytics（オプション）

1. Google Analyticsでプロパティを作成
2. トラッキングIDを取得
3. Next.jsアプリに統合

---

## ✅ デプロイ完了後のチェックリスト

- [ ] URLにアクセスして表示を確認
- [ ] 全セクションが正しく表示される
- [ ] リンクが正しく機能する
- [ ] レスポンシブデザインが機能する（モバイル、タブレット、デスクトップ）
- [ ] ダウンロードボタンが最新リリースにリンクしている
- [ ] Lighthouse スコアを確認（90+目標）
- [ ] README.mdのランディングページURLを更新

---

## 🔗 参考リンク

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Vercel Analytics](https://vercel.com/analytics)

---

デプロイが完了したら、URLをREADMEとSNSでシェアしましょう!🎉
