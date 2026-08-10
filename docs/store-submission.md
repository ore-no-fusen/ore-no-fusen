# Microsoft Store 手動提出手順

## 方針

- 5.0.0は旧MSI・NSIS利用者をStore版へ案内する移行版として、GitHub Release資産を保持する。
- 5.1.0以降はStore MSIXだけを正式配布する。
- GitHub Actionsは未署名MSIX artifactを作るだけで、Partner Centerへの提出・公開は行わない。
- 通常公開の前に、このPCで開発署名MSIXを作成し、MSIX固有動作を実機確認する。

## 提出前提

1. GitHub Actionsの`Prepare and Build Store Package`に次期版を一度だけ入力して実行する。
2. 最初のロックファイル検証と`cargo check --locked`が成功している。
3. `main`と`develop`の5つの版ファイルが同じ版になっている。
4. runのArtifactsに`store-msix`が1件あり、MSIX検査が成功している。

キャッシュが有効な通常実行では、Action開始からMSIX artifact作成まで10分以内を目標とする。Node系検証とRust releaseテストを並列実行し、同じrunのRust成果物をMSIXビルドへ再利用する。超過時は各step時間とRustキャッシュのヒット状況を記録し、次のリリース前に原因を解消する。

## このPCでの提出前MSIX確認

1. アプリを終了する。
2. `develop`または作業ブランチで`.\packaging\msix\test-msix.ps1`を実行する。
3. 作成・インストールされた開発署名MSIXを起動し、次の必須項目を確認する。

| 必須確認 | 合格条件 |
|---|---|
| 既存データ | 既存付箋と設定が更新前から引き継がれる |
| 画像描き込み保存 | 線などを保存した直後に、変更後の画像が表示される |
| 画像付き付箋の複製 | 本文と画像を含む複製が隣に開く |
| iPhone連携 | PCとiPhoneの送受信、画像表示、通知遷移が動作する |

すべて合格するまで通常公開へ進まない。不合格の場合は修正をやり直し、開発署名MSIXを再作成する。

## 通常の製品申請

提出用MSIXは、版ごとに次の固定場所へ保存する。一時フォルダやリポジトリ内には置かない。

```text
D:\Users\uck\Documents\俺の付箋-Store提出\<バージョン>\ore-no-fusen.msix
```

例：`5.1.3`は`D:\Users\uck\Documents\俺の付箋-Store提出\5.1.3\ore-no-fusen.msix`へ保存する。

1. 固定保存先の`ore-no-fusen.msix`を、製品の新しい申請へアップロードする。
2. Package IdentityとVersionを確認する。
3. 説明、画像、プライバシー、年齢区分、制限付きCapabilityの説明を確認する。
4. 認定へ提出する。
5. 認定後に公開を開始する。
6. 公開後、Storeから実際にインストールまたは更新し、Store画面の［開く］から起動する。
7. バージョン、Store版ショートカット、起動設定を確認する。

Storeが配布用MSIXへ署名するため、提出ファイルは未署名でよい。

## 公開後確認

```powershell
winget source update
winget show --id 9N4MW0V2MVVG --source msstore
winget upgrade --id 9N4MW0V2MVVG --source msstore
```

Partner Centerで認定状態、取得数、インストール数を確認する。

## 利用状況の確認

全体の入手数、インストール数、利用状況、正常性は Microsoft Partner Center の製品分析で確認する。これは Store 側の集計であり、PC アプリの GA4 同意有無とは分離する。

同意した利用者の操作改善データは Google Analytics 4 で確認する。

| 確認対象 | 画面・イベント |
|---|---|
| アプリを利用した全体規模 | Partner Center の取得・利用状況 |
| 同意後の起動 | GA4 `app_started` |
| 付箋作成 | GA4 `note_created` |
| 新規付箋の初回保存 | GA4 `first_note_saved` |
| 付箋作成失敗 | GA4 `note_create_failed` |

GA4では `event_category`、`app_version`、`distribution`、`creation_path`、`error_category` だけを分析対象とし、本文、タイトル、タグ、ファイル名、保存先、検索語をカスタムディメンションへ登録しない。ユーザー単位データの保持期間は2か月に設定する。

## 禁止事項

- 未署名MSIXを一般ユーザーへ配布しない。
- 5.0.0のGitHub Release資産を移行完了前に削除・置換しない。
- 5.1.0以降のGitタグ、GitHub Release、MSI、NSIS、winget community packageを新規作成しない。
- 旧版を先にアンインストールするよう案内しない。
