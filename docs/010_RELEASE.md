# リリース手順

通常のアプリ開発とMicrosoft Store公開は、次の3ステップだけで運用する。**通常公開の前に、このPCで開発署名したMSIXを実機確認する。**

GitHub Release、Gitタグ、Winget公開、GitHub ActionsからのMicrosoft Store自動提出は行わない。旧利用者の移行のため、GitHub Release `v5.0.0` の資産だけは保持する。

```mermaid
flowchart LR
    A["STEP 1<br/>アプリ確認<br/><br/>PCで修正<br/>開発署名MSIX・iPhone実機確認<br/>developへpush"]
    B["STEP 2<br/>版数を付ける<br/><br/>版数を1回入力<br/>自動検証<br/>MSIX artifact作成"]
    C["STEP 3<br/>手動Storeリリース<br/><br/>MSIXを通常申請<br/>Store公開後に確認"]

    A -->|リリースすると決めたら| B
    B -->|artifact作成成功| C

    style A fill:#e8f4ff,stroke:#1976d2,color:#111
    style B fill:#fff8e1,stroke:#f57c00,color:#111
    style C fill:#f3e5f5,stroke:#7b1fa2,color:#111
```

## STEP 1：アプリ確認

1. `develop`、または`develop`から作った作業ブランチで修正する。
2. 対象テスト、型検査、必要なビルドを実行する。
3. 設計仕様（`docs-v2/`）と必要な手順書を更新する。
4. `develop`へpushする。
5. CIが成功したことを確認し、影響範囲に応じてPCのTauriアプリ、iPhoneのPreviewを実機確認する。

MSIX固有の修正は、アプリを終了してからこのPCで次を実行し、開発署名MSIXを作成・インストール・起動する。

```powershell
.\packaging\msix\test-msix.ps1
```

Store版とはパッケージIDと署名が異なるが、同じTauri実行コードとMSIX環境で、起動、保存、画像、同期をStore提出前に確認できる。Google Drive連携を確認する場合は、本番と同じ`GDRIVE_CLIENT_ID`と`GDRIVE_CLIENT_SECRET`をビルド時に使用する。

問題があれば、このSTEPへ戻って修正する。リリースしない通常作業は、ここで完了である。

### 通常作業の確認

| 確認項目 | 実施条件 |
|---|---|
| 対象テスト・型検査 | 常に実施する |
| `cargo check --locked` | Rustを確認する場合。通常修正で依存を更新しない |
| PC実機確認 | Tauri、付箋、保存、同期、ショートカットなどを変更した場合。MSIX固有の変更は開発署名MSIXで確認する |
| iPhone実機確認 | PWA、Service Worker、iPhone同期を変更した場合 |
| SW_VERSION更新 | PWA / Service Workerを変更した場合 |

`Cargo.toml` / `Cargo.lock` は通常の機能修正では変更しない。依存ライブラリを更新する場合は、機能修正と混ぜず、理由・対象・影響範囲を分けて確認する。

### アプリ本体に影響しない変更

LP、README、`docs/`だけの変更も、まず`develop`で確認する。確認後は **Do Non-App Release** で`main`へ反映する。StoreリリースのSTEP 2〜4は不要である。

## STEP 2：版数を付けてStore提出用ファイルを作る

STEP 1の確認が終わり、正式リリースすると決めた時だけ、GitHub Actionsの **Prepare and Build Store Package** を実行する。

1. 次の版番号を一度だけ入力する。例：`5.1.0`
2. 実行結果が成功するまで待つ。
3. `store-msix` artifactが作成されたことを確認する。

ワークフローは自動で次を行う。

1. `develop`に対して、指定版を一時適用した`Cargo.lock`差分検証と`cargo check --locked`を実行する。
2. 成功した場合だけ、`develop`を`main`へ反映し、アプリ版を更新する。
3. 更新した`main`を`develop`へ戻す。
4. 確定した`main`コミットから未署名MSIXを作成・検査し、`store-msix` artifactとして30日間保存する。

キャッシュが有効な通常実行では、Action開始から`store-msix` artifact作成まで **10分以内** を目標とする。Node系検証とRust releaseテストは別runnerで並列実行し、Rust releaseテストのコンパイル成果物を同じrunのMSIXビルドへ再利用する。10分を超えた場合は、そのまま常態化させず、各step時間とキャッシュヒット状況を記録し、次のリリース前に原因を解消する。

最初の検証で失敗した場合、版番号コミットもMSIX作成も行われない。MSIX作成だけが失敗した場合、版番号コミットは残るが、公開やStore提出は行われない。原因を修正して、同じ版番号で再実行する。

版番号は次の5ファイルへ自動反映される。手で変更しない。

| ファイル | 版番号 |
|---|---|
| `package.json` / `package-lock.json` | `X.Y.Z` |
| `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` | `X.Y.Z` |
| `packaging/msix/AppxManifest.xml` | `X.Y.Z.0` |

## STEP 3：Microsoft Storeで手動リリース

1. STEP 2で作成した`ore-no-fusen.msix`を通常の製品申請へアップロードする。
2. 説明、画像、プライバシー、年齢区分、公開設定を確認して認定へ提出する。
3. 認定後、公開を開始する。
4. Store公開後、Storeからインストールまたは更新し、バージョンと起動を確認する。

Partner Centerでの画面操作と確認項目は、[store-submission.md](./store-submission.md)を参照する。

## 補足

### バージョン番号

`MAJOR.MINOR.PATCH`形式を使う。

| 種別 | 用途 | 例 |
|---|---|---|
| PATCH | バグ修正 | `5.0.0` → `5.0.1` |
| MINOR | 後方互換のある機能追加 | `5.0.0` → `5.1.0` |
| MAJOR | 互換性のない大きな変更 | `5.0.0` → `6.0.0` |

### PWA / Service Worker

PWAまたはService Workerを変更した場合だけ、`worker/index.js`の`SW_VERSION`を`本体バージョン-pwa.N`形式で更新する。画面右下の`SW`表示で反映を確認する。

### 5.0.0からStore版への移行

GitHub Release `v5.0.0` の`latest.json`、MSI、NSIS、署名ファイルは、旧版利用者が5.0.0へ更新するために残す。5.1.0以降はGitHub Releaseを新規作成せず、Microsoft Store版だけを正式配布する。

## 更新履歴

| No. | 日付 | 内容 |
|---:|---|---|
| 16 | 26-07-27 | Store手動提出へ切替。タグ・GitHub Release・Winget・自動Store提出を廃止し、5.0.0の移行用資産だけを保持した。 |
| 17 | 26-07-28 | 事前検証・版確定・MSIX作成を、版番号を一度だけ入力する単一ワークフローへ統合した。 |
| 18 | 26-07-28 | 開発・Store公開の運用をSTEP 1〜3へ整理し、旧手順と未実装案を削除した。 |
| 19 | 26-08-03 | 通常公開前の必須ゲートとしてパッケージフライトを追加。Store署名済みMSIXで画像保存・画像付き複製・既存データ・更新を最終確認してから公開する4ステップ運用へ変更した。 |
| 20 | 26-08-03 | Store MSIX作成の通常目標を10分以内とし、Node系検証とRust releaseテストの並列化、同一run内でのRust成果物再利用を明記した。5.1.1の緊急例外も記録した。 |
| 21 | 26-08-10 | パッケージフライトを必須手順から外し、開発署名MSIXをこのPCで作成・実機確認してからStoreへ通常申請する3ステップ運用へ変更した。 |
