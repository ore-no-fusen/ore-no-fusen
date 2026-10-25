# 俺の付箋 ユーザーガイド

漫画・マニュアル・FAQ・更新情報・規約を公開します。

https://ore-no-fusen.github.io/ore-no-fusen-guide/

アプリのコード、内部設計書、管理用データはこのリポジトリに含めません。
原稿と公開用素材は開発側の `public-guide/` を正本とします。
公開の更新は対象ファイルだけをコピーした独立PRで確認します。

## ローカル確認

Node.js 24以上で `npm ci`、`npm run build`、`npm run preview` を実行します。
build後に内部資料の混入とページ内リンクも検査します。
