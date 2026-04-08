# リリース手順

## 最初にやること

1. `package.json` を読んで現在の `version` フィールドを取得する
2. ユーザーに「現在のバージョンは X.X.X です。新しいバージョンを教えてください」と聞く
3. ユーザーが答えたバージョンを NEW_VERSION とする

## 手順

### Step 0: ブランチ確認
- `git branch --show-current` を実行して現在のブランチを確認する
- `develop` ブランチにいる場合は以下を実行してから続行する：
  ```
  git checkout main
  git merge develop
  ```
- `main` 以外の予期しないブランチにいる場合はユーザーに報告して**止まる**

### Step 1: 未コミットの変更確認
- `git status` を実行する
- 未コミットの変更がある場合はユーザーに報告して**止まる**

### Step 2: タグの重複確認
- `git tag` で `vNEW_VERSION` のタグがローカルに存在しないか確認する
- 存在する場合はユーザーに報告して**止まる**

### Step 3: ローカルの未 push コミット確認
- `git log origin/main..HEAD --oneline` を実行する
- 未 push コミットがある場合はユーザーに内容を報告し、それらも含めてリリースするか確認する
- ユーザーが「含める」と答えた場合はそのまま続行する

### Step 4: 3ファイルのバージョンを一括更新
- `package.json` の `"version"` を NEW_VERSION に更新
- `src-tauri/tauri.conf.json` の `"version"` を NEW_VERSION に更新
- `src-tauri/Cargo.toml` の `version = "..."` を NEW_VERSION に更新
- ℹ️ ランディングページのバージョン表記は `package.json` から自動生成されるため手動更新不要

### Step 5: バージョン一致の確認（必須）
更新後に3ファイルを読み直し、すべてが NEW_VERSION になっていることを確認する。
1つでも違う場合は修正してからステップ5を再実行する。

### Step 6: バージョン更新をコミット
```
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: バージョンを vNEW_VERSION に更新"
```

### Step 7: main ブランチを push（タグより先に行う）
```
git push origin main
```
- ⚠️ **タグより先に push する**（CI がバージョン更新済みのコードをビルドするために必須）
- push 後に `git log origin/main..HEAD --oneline` を実行し、出力が空（差分ゼロ）であることを確認する
- 空でない場合はユーザーに報告して**止まる**

### Step 8: タグ作成前の最終確認
`git log --oneline -1` を実行して直近コミットを表示し、それがバージョン更新コミットであることをユーザーに確認する。
確認が取れたらタグを作成する：
```
git tag vNEW_VERSION
```

### Step 9: タグを push（CI トリガー）
```
git push origin vNEW_VERSION
```
- ⚠️ `--tags` は使わない（複数タグ同時プッシュでCDが起動しないことがある）
- ⚠️ `gh release create` は使わない（tauri-action が自動で作成する）

### Step 10: develop に戻す
main のバージョン更新を develop に取り込み、開発ブランチに戻る：
```
git checkout develop
git merge main
```

### Step 11: 完了報告
- push されたタグ（`vNEW_VERSION`）とブランチを報告する
- 現在のブランチが `develop` であることを報告する
- GitHub Actions が15〜25分でビルド・署名・リリースを行うことをユーザーに伝える
- GitHub Actions のステータスは `https://github.com/ore-no-fusen/ore-no-fusen/actions` で確認できることを伝える
