# リリース手順

RELEASE.md の手順に従って正式リリースを実施する。

## 最初にやること

1. `package.json` を読んで現在の `version` フィールドを取得する
2. ユーザーに「現在のバージョンは X.X.X です。新しいバージョンを教えてください」と聞く
3. ユーザーが答えたバージョンを NEW_VERSION とする

## 手順

1. **未コミットの変更確認**
   - `git status` で未コミットの変更がないことを確認する
   - ある場合はユーザーに報告して止まる

2. **タグの重複確認**
   - `git tag` で `vNEW_VERSION` のタグが既に存在しないか確認する
   - 存在する場合はユーザーに報告して止まる

3. **3ファイルのバージョンを一括更新**
   - `package.json` の `"version"` を NEW_VERSION に更新
   - `src-tauri/tauri.conf.json` の `"version"` を NEW_VERSION に更新
   - `src-tauri/Cargo.toml` の `version = "..."` を NEW_VERSION に更新
   - 更新後、3ファイルすべてが同じバージョンになっていることを確認する

4. **バージョン更新をコミット**
   - `git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`
   - `git commit -m "chore: バージョンを vNEW_VERSION に更新"`

5. **タグ作成**
   - `git tag vNEW_VERSION`

6. **main ブランチを push**
   - `git push origin main`

7. **タグを個別に push**
   - `git push origin vNEW_VERSION`
   - ⚠️ `--tags` は使わない（複数タグ同時プッシュでCDが起動しないことがある）
   - ⚠️ `gh release create` は使わない（tauri-actionが自動で作成する）

8. **完了報告**
   - push されたタグ（`vNEW_VERSION`）とブランチを報告する
   - GitHub Actions が15〜25分でビルド・署名・リリースを行うことをユーザーに伝える
