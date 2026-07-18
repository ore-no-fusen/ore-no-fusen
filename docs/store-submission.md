# Microsoft Store提出手順

## 方針

- 5.0.0はNSIS・MSI・Store MSIXを提供する移行開始版。
- 5.1.0以降はStore MSIXだけを正式配布する。
- 未署名MSIXをGitHub Release Assetsへ置かない。
- Release workflowの`store-msix` artifactをPartner Centerへ提出する。
- 初回提出と自動提出有効化前は必ず手動確認する。

## Repository設定

Repository variable:

```text
MICROSOFT_STORE_PRODUCT_ID=9N4MW0V2MVVG
```

自動提出を使う場合のSecrets:

```text
AZURE_AD_TENANT_ID
SELLER_ID
AZURE_AD_APPLICATION_CLIENT_ID
AZURE_AD_APPLICATION_SECRET
```

## 提出前提

1. `Do Release`が成功している。
2. タグに対応する`Release` workflowが成功している。
3. Release workflowのrun IDを控えている。
4. runのArtifactsに`store-msix`が1件ある。
5. MSIXのIdentity、Publisher、Version、x64、未署名検査が成功している。

## 初回または手動提出

1. GitHub ActionsのRelease runから`store-msix` artifactを取得する。
2. Partner Centerで製品`9N4MW0V2MVVG`の新しい申請を作成する。
3. artifact内の`ore-no-fusen.msix`をアップロードする。
4. Package IdentityとVersionを確認する。
5. 説明、画像、プライバシー、年齢区分、制限付きCapabilityの説明を確認する。
6. 認定へ提出する。
7. flightまたは一般公開後、Storeから実際にインストールする。

Storeが認定後の配布用MSIXへ署名するため、提出ファイルは未署名でよい。

## GitHub Actionsからの提出

初回の手動提出が認定・公開された後だけ使用する。

1. Actionsから`Microsoft Store Submit`を開く。
2. `Run workflow`を選ぶ。
3. `release_tag`へ例として`v5.0.0`を入力する。
4. `release_run_id`へ成功したRelease workflow run IDを入力する。
5. 最初は`submit_to_store=false`でdry runする。
6. artifact、Version、Product IDの表示を確認する。
7. 実提出時だけ`submit_to_store=true`にする。
8. `safety_ack`へ`FIRST_STORE_SUBMISSION_PASSED`を入力する。

workflowは指定runの`store-msix` artifactを取得し、MSIXを再検査してから`msstore publish`を実行する。

## 公開後確認

```powershell
winget source update
winget search "俺の付箋" --source msstore
winget show --id 9N4MW0V2MVVG --source msstore
winget install --id 9N4MW0V2MVVG --source msstore
```

更新版では次も確認する。

```powershell
winget upgrade --id 9N4MW0V2MVVG --source msstore
```

Partner Centerで取得数とインストール数を確認する。GitHub Release assetのdownload数とは合算しない。

## 禁止事項

- 未署名MSIXを一般ユーザーへ配布しない。
- Store公開前にLPのGitHub導線を削除しない。
- 旧版を先にアンインストールするよう案内しない。
- Store認定前に`submit_to_store=true`を常用しない。
- GitHub ReleaseのMSI・NSISを5.1.0以降も生成しない。
