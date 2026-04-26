---
description: バージョンを上げる
---

バージョン更新はGitHub Actionsで行う。ユーザーに以下を伝える：

1. GitHubリポジトリの「Actions」タブを開く
2. 「Do Release」ワークフローを選択
3. 「Run workflow」ボタンを押す
4. 新しいバージョン番号を入力して実行する

Actions が以下を自動で行う：
- develop → main マージ
- package.json / Cargo.toml / package-lock.json のバージョン更新
- コミット・タグ作成・push
- ビルド・署名・GitHubリリース作成
