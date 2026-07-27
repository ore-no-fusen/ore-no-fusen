# Microsoft Store 手動提出手順

## 方針

- 5.0.0は旧MSI・NSIS利用者をStore版へ案内する移行版として、GitHub Release資産を保持する。
- 5.1.0以降はStore MSIXだけを正式配布する。
- GitHub Actionsは未署名MSIX artifactを作るだけで、Partner Centerへの提出・公開は行わない。

## 提出前提

1. `Release Lockfile Dry Run`を、対象`develop`と次期版で成功させる。
2. `Prepare Store Release`を実行し、`main`と`develop`の5つの版ファイルが同じ版になっている。
3. `Build Store Package`を、`source_ref=main`・確定版で実行している。
4. runのArtifactsに`store-msix`が1件あり、MSIX検査が成功している。

## Partner Centerへの手動提出

1. GitHub Actionsの`Build Store Package` runから`store-msix` artifactをダウンロードする。
2. Partner Centerで製品`9N4MW0V2MVVG`の新しい申請を作成する。
3. artifact内の`ore-no-fusen.msix`をアップロードする。
4. Package IdentityとVersionを確認する。
5. 説明、画像、プライバシー、年齢区分、制限付きCapabilityの説明を確認する。
6. 認定へ提出する。
7. 認定・公開後、Storeから実際にインストールまたは更新し、Store画面の［開く］から起動する。
8. Store版ショートカット、起動設定、既存付箋・設定を確認する。

Storeが配布用MSIXへ署名するため、提出ファイルは未署名でよい。

## 公開後確認

```powershell
winget source update
winget show --id 9N4MW0V2MVVG --source msstore
winget upgrade --id 9N4MW0V2MVVG --source msstore
```

Partner Centerで認定状態、取得数、インストール数を確認する。

## 禁止事項

- 未署名MSIXを一般ユーザーへ配布しない。
- 5.0.0のGitHub Release資産を移行完了前に削除・置換しない。
- 5.1.0以降のGitタグ、GitHub Release、MSI、NSIS、winget community packageを新規作成しない。
- 旧版を先にアンインストールするよう案内しない。
