# リリース手順

## 作業開始ゲート（毎回必須）

リリースに関する操作を始める前に、作業者は必ずこの手順書を最初から確認する。

1. 現在のSTEP番号、実施場所、入力ファイル、出力先を確認する。
2. ユーザーへの進捗報告は、この手順書のSTEP番号で統一する。
3. 手順にない保存場所、URL、ビルド方法、テスト方法をその場で作らない。
4. 新しい決定が必要になった場合は、実行前にこの手順書へ保存場所と具体的手順を追記する。
5. 同じ成果物が既に存在する場合は、実行中プロセス、保存先、完了状態を確認し、未完了の場合だけ再実行する。

通常のアプリ開発とMicrosoft Store公開は、次の4ステップで運用する。**通常公開の前に、このPCで開発署名したMSIXを実機確認する。**

GitHub Release、Gitタグ、Winget公開、GitHub ActionsからのMicrosoft Store自動提出は行わない。旧利用者の移行のため、GitHub Release `v5.0.0` の資産だけは保持する。

### 実施場所の定義

| 表記 | 実施場所・役割 |
|---|---|
| このPC | ソース修正、対象テスト、Tauri本番実行ファイル作成、開発署名MSIXの作成・インストール・確認を行う。Store提出物は`Documents\俺の付箋-Store提出\<バージョン>\`へ保存する |
| GitHub develop | 確認対象ソースを保管し、Vercel Previewへのデプロイ元になる。アプリを実行する場所ではない |
| Vercel Preview | GitHub developの内容を公開するiPhone PWAの確認環境 |
| iPhone | Vercel PreviewからインストールしたPWA、通知、PCとの送受信を実機確認する |
| GitHub main | Storeへ提出する版のソースとバージョンを保管する |
| Partner Center | 完成したStore用MSIXをアップロードしてMicrosoft Storeへ申請する |

### Codexの役割分担

| Codex | 担当範囲 | 主な作業 |
|---|---|---|
| VS Code版Codex | STEP 0〜2 | ソース修正、対象テスト、実機確認用ビルド、開発署名MSIX確認、Store用MSIX作成、`main`・`develop`反映 |
| Windows版Codex | STEP 3 | サインイン済みブラウザでPartner Centerを操作し、MSIXアップロード、日本語・英語のリリースノート更新、申請内容確認、認定提出、公開状態確認 |

通常はVS Code版CodexがSTEP 0〜2を完了し、固定保存先のStore用MSIXと実施結果をWindows版Codexへ引き継ぐ。Partner Centerの画面操作が必要なSTEP 3はWindows版Codexで行う。Windows版CodexだけでSTEP 0から一貫して作業できる場合は、同じ手順書と同じSTEP番号に従って全工程を実施してよい。

VS Code版CodexからWindows版Codexへの引き継ぎでは、少なくとも次を伝える。

- 対象バージョン
- Store用MSIXの絶対パス
- STEP 0〜2の完了状況
- 日本語・英語のリリースノートに記載する実際の変更内容

### 概要図

```mermaid
flowchart LR
    A["STEP 0<br/>修正・対象テスト<br/>PC確認・iPhone PWA確認"]
    B["STEP 1<br/>このPCで<br/>開発署名MSIXを実機確認"]
    C["STEP 2<br/>同じ実行ファイルから<br/>Store用MSIXを作成"]
    D["STEP 3<br/>CodexがPartner Centerへ<br/>提出"]

    A -->|成功| B
    B -->|成功| C
    C --> D

    style A fill:#e8f4ff,stroke:#1976d2,color:#111
    style B fill:#fff8e1,stroke:#f57c00,color:#111
    style C fill:#e8f5e9,stroke:#388e3c,color:#111
    style D fill:#f3e5f5,stroke:#7b1fa2,color:#111
```

### 詳細図（失敗時の戻り先）

```mermaid
flowchart TD
    A["STEP 0-1・このPC<br/>原因調査・最小修正<br/>時間を計測"]
    B["STEP 0-2・このPC<br/>対象テスト<br/>予想 10〜60秒"]
    C["STEP 0-3<br/>このPCでPC機能確認<br/>iPhoneはVercel PreviewでPWA確認"]
    D["STEP 1-1・このPC<br/>候補バージョン設定<br/>予想 1〜5秒"]
    E["STEP 1-2・このPC<br/>本番実行ファイル作成<br/>予想 300〜900秒・要実測"]
    F["STEP 1-3〜1-4・このPC<br/>開発署名MSIX作成・インストール<br/>予想 16〜36秒"]
    G["STEP 1-5・このPC<br/>MSIX実機確認<br/>予想 60〜180秒"]
    H["STEP 2・このPC→GitHub<br/>同一実行ファイルからStore用MSIX<br/>ソース・版数をmain/developへpush"]
    I["STEP 3・Codex＋Partner Center<br/>Store用MSIXを提出"]

    A --> B
    B -->|失敗| A
    B -->|成功| C
    C -->|失敗| A
    C -->|成功・リリース候補確定| D
    D --> E --> F --> G
    G -->|コードの不具合| A
    G -->|Manifest・署名・梱包だけの不具合| F
    G -->|成功| H
    H --> I

    style A fill:#e8f4ff,stroke:#1976d2,color:#111
    style B fill:#e8f4ff,stroke:#1976d2,color:#111
    style C fill:#e8f4ff,stroke:#1976d2,color:#111
    style D fill:#fff8e1,stroke:#f57c00,color:#111
    style E fill:#fff8e1,stroke:#f57c00,color:#111
    style F fill:#fff8e1,stroke:#f57c00,color:#111
    style G fill:#fff8e1,stroke:#f57c00,color:#111
    style H fill:#e8f5e9,stroke:#388e3c,color:#111
    style I fill:#f3e5f5,stroke:#7b1fa2,color:#111
```

## STEP 0：原因調査・修正

1. **STEP 0-1**：`develop`、または`develop`から作った作業ブランチで原因を特定し、最小範囲だけ修正する。調査開始から修正完了までを計測する。
2. **STEP 0-2**：対象テストだけを実行する。予想は10〜60秒。失敗したらSTEP 0-1へ戻り、新しい試行として時間を記録する。
3. **STEP 0-3**：PC機能はこのPCの開発環境、iPhone PWAはGitHub developからデプロイされたVercel PreviewをiPhoneで開いて確認する。予想は30〜120秒。失敗したらSTEP 0-1へ戻る。
4. 設計仕様（`docs-v2/`）と必要な手順書を更新する。

修正途中ではMSIXを作らない。対象テストと開発環境の確認が成功した場合だけSTEP 1へ進む。

## STEP 1：このPCでMSIXを作成・実機確認

1. **STEP 1-1**：リリース候補バージョンを先に設定する。予想は1〜5秒。
2. **STEP 1-2**：このPCで本番実行ファイルを1回作成する。現時点の予想は300〜900秒であり、実測値を必ず記録する。
3. **STEP 1-3**：STEP 1-2の実行ファイルから開発署名MSIXを作成する。梱包・署名の実測目安は約6秒。
4. **STEP 1-4**：MSIXをインストールして起動する。予想は10〜30秒。
5. **STEP 1-5**：不具合の再現手順と影響範囲を実機確認する。予想は60〜180秒。

MSIX固有の修正は、アプリを終了してからこのPCで次を実行し、開発署名MSIXを作成・インストール・起動する。

```powershell
.\packaging\msix\test-msix.ps1
```

STEP 1-1の版番号設定は、このPCで次を実行する。5ファイルを一括更新し、現在以下の版番号や不正な形式を拒否する。

```powershell
node scripts/set-release-version.mjs <X.Y.Z>
```

Store版とはパッケージIDと署名が異なるが、同じTauri実行コードとMSIX環境で、起動、保存、画像、同期をStore提出前に確認できる。Google Drive連携を確認する場合は、本番と同じ`GDRIVE_CLIENT_ID`と`GDRIVE_CLIENT_SECRET`をビルド時に使用する。

STEP 1-5で失敗した場合は、原因により戻り先を分ける。

- コードの不具合：STEP 0-1へ戻る。コード変更後はSTEP 1-2で新しい実行ファイルを作る。
- Manifest・署名・梱包だけの不具合：STEP 1-3へ戻り、合格済みの実行ファイルを再利用する。
- 再試行では、成功・失敗にかかわらず別の試行として時間を記録する。

リリースしない通常作業は、STEP 0で完了である。

### 工程別の予想時間

| 工程 | 実施場所 | 内容 | 予想時間 | 根拠 |
|---|---|---|---:|---|
| STEP 0-1 | このPC | 原因調査・最小修正 | 不具合による | 毎回実測して蓄積する |
| STEP 0-2 | このPC | 対象テスト | 10〜60秒 | 次回以降に実測更新する |
| STEP 0-3 | このPC | PC機能を開発環境で確認 | 30〜120秒 | 操作時間を含む |
| STEP 0-3 | Vercel Preview＋iPhone | iPhone PWA、通知、PCとの送受信を確認 | 操作による | GitHub developのデプロイ完了後に行う |
| STEP 1-1 | このPC | 候補バージョン設定 | 1〜5秒 | 次回以降に実測更新する |
| STEP 1-2 | このPC | 本番実行ファイル作成 | 300〜900秒 | 未計測。最優先で実測する |
| STEP 1-3 | このPC | 開発署名MSIX作成 | 約6秒 | MSIX梱包の実測値 |
| STEP 1-4 | このPC | インストール・起動 | 10〜30秒 | 次回以降に実測更新する |
| STEP 1-5 | このPC | MSIX実機確認 | 60〜180秒 | 操作時間を含む |
| STEP 2-1 | このPC | Store用MSIX作成 | 約6秒 | 同じ実行ファイルを再利用する |
| STEP 2-2 | このPC | Store用形式確認 | 約2秒 | 5項目の形式確認 |
| STEP 2-3 | このPC→GitHub main/develop | 同じソースと版数をpush | 約28秒 | 5.1.3での実測値 |
| STEP 3 | Partner Center | Store用MSIXをアップロード・申請 | 通信・審査による | Microsoft側の処理時間を含む |

### 実測時間の記録

公開バージョンごとに1行を追加し、直前バージョンとの差分を確認する。時間は不具合修正・PWA実機確認・Microsoft審査を除く、版設定からGitHub反映までのMSIXリリース工程を集計する。

| 日付 | バージョン | 結果 | リリース工程 | 前回比 | 内訳（秒） | 備考 |
|---|---|---|---:|---:|---|---|
| 26-08-11 | 5.1.4 | 申請完了 | 320秒（5分20秒）＋実機操作 | 約30分→5分20秒（約82%短縮） | 版設定1、exe作成273、Dev MSIX 7、導入7、Store MSIX 6、検証1、GitHub反映25 | 合格済みexeを再利用。前回値は約30分の概算 |
| 26-08-16 | 5.1.5 | 認定申請完了 | 546秒（9分6秒）＋実機操作 | 5.1.4比226秒増加 | exe・Dev MSIX・導入253、Store MSIX 6、検証2、pre-commit 275、develop push 5.3、main push 4.8 | 旧自動起動の再登録防止。合格済みexeをStore用MSIXへ再利用。Submission 14をCodexが申請し、認定中を確認。全テストhookが増加要因 |
| 26-08-30 | 5.2.0 | 公開完了 | 1,138秒（18分58秒）＋実機・申請操作 | 5.1.5比592秒増加 | 版設定3、誤ったフロント単体ビルド301、exe作成337、Dev MSIX・導入16、Store MSIX 7、検証3、pre-commit・統合455、GitHub反映16 | 折りたたみ機能と匿名利用状況集計。合格exeをStore用MSIXへ再利用し、Submission 16を送信。26-08-31にPartner Centerで製品更新・Store入手可能を確認 |
| 26-09-02 | 5.2.1 | STEP 2完了 | 727秒（12分7秒）＋実機操作 | 5.2.0比411秒短縮 | pre-commit・コミット331、exe・Dev MSIX・導入387、Store MSIX・検証・固定保存8 | 折りたたみ・アラームを含む完全複製を実機確認。Store申請とmain反映は未実施 |

各試行の詳細は「補足」の「詳細試行ログ」に残す。記録が3件以上たまった工程は、直近3件の中央値を次回の予想時間にする。

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

LP、README、`docs/`だけの変更も、まず`develop`で確認する。確認後は **Do Non-App Release** で`main`へ反映する。StoreリリースのSTEP 1〜3は不要である。

## STEP 2：合格した実行ファイルからStore提出用MSIXを作る

STEP 1-5で合格した実行ファイルを、そのままStore提出用MSIXへ梱包する。GitHub上で同じ実行ファイルを再コンパイルしない。

1. **STEP 2-1**：STEP 1-2の実行ファイルから、Store用ID・未署名のMSIXを作る。予想は約6秒。
2. **STEP 2-2**：名前、発行者、バージョン、x64、未署名の5項目を確認する。予想は約2秒。
3. **STEP 2-3**：実機確認した実行ファイルに対応する同じソースと版数を`main`と`develop`へ反映する。予想は約28秒。

STEP 2の自動化は、次の条件をすべて満たすこと。

- STEP 1-5で合格した実行ファイルとStore提出物の実行ファイルが同一である。
- STEP 2ではNext.js・Rust・Tauri実行ファイルを再ビルドしない。
- STEP 0とSTEP 1で済んだテストを繰り返さない。
- 各工程の開始・終了・秒数を実測時間表へ記録する。

版番号は次の5ファイルへ自動反映される。手で変更しない。

| ファイル | 版番号 |
|---|---|
| `package.json` / `package-lock.json` | `X.Y.Z` |
| `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock` | `X.Y.Z` |
| `packaging/msix/AppxManifest.xml` | `X.Y.Z.0` |

## STEP 3：CodexがMicrosoft Storeへ申請

1. **STEP 3-1（このPC）**：STEP 2で作成した`ore-no-fusen.msix`を、`D:\Users\uck\Documents\俺の付箋-Store提出\<バージョン>\ore-no-fusen.msix`へ準備する。一時フォルダやリポジトリ内には置かない。
2. **STEP 3-2（Codex＋Partner Center）**：ユーザーがCodexへStore申請を依頼する。Codexはこの手順書と`store-submission.md`を全文確認し、サインイン済みのブラウザで「俺の付箋」の新しい更新申請を作成して、固定保存先の`ore-no-fusen.msix`をアップロードする。アップロード後にファイル名、Version、Architecture、検証成功を画面で確認して保存する。
3. **STEP 3-3（Codex＋Partner Center）**：Codexは日本語・英語の「このバージョンの最新情報」を今回の版番号と実際の変更内容に更新する。あわせて既存の説明、画像、プライバシー、年齢区分、Capabilityの説明、公開設定が「変更なし」または意図した内容であることを確認する。外部公開申請を開始する直前にユーザーの明示承認を受けてから「送信して認定を受ける」を実行し、申請番号と「認定中」を確認して報告する。
4. **STEP 3-4（Microsoft Store＋このPC）**：認定・公開後、Storeからインストールまたは更新し、バージョンと起動を確認する。

CodexがPartner Centerを操作できない場合だけ、ユーザーが同じ手順を手動で行う。サインイン、MFA、CAPTCHAなど本人操作が必要な画面ではCodexは操作を止め、該当画面を開いたままユーザーへ引き継ぎ、完了後に再開する。

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

### 詳細試行ログ

失敗した試行も削除せず、次回の予想時間と改善判断に使う。

| 日付 | バージョン | 試行 | 結果・失敗工程 | 0-1 | 0-2 | 0-3 | 1-1 | 1-2 | 1-3 | 1-4 | 1-5 | 2-1 | 2-2 | 2-3 | 合計秒 | 改善メモ |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 26-08-11 | 5.1.4-pwa.1 | 1 | 0-3失敗 |  |  | 506 | - | - | - | - | - | - | - | - | 506 | 同一通知が3件表示。復帰イベント3種の同時実行を特定 |
| 26-08-11 | 5.1.4-pwa.1 | 2 | 0-3成功 |  |  | 604 | - | - | - | - | - | - | - | - | 604 | Vercel完了12:51:10から実機確認完了まで。通知1件、SW版数も確認 |
| 26-08-11 | 5.1.4-pwa.6 | 3 | 0-3失敗・MSIX優先へ切替 |  |  |  | - | - | - | - | - | - | - | - |  | iPhoneでtouchendとlocation.assign開始を記録したが遷移なし。PWAリンク修正を保留し、ユーザー判断でMSIX作成を優先 |
| 26-08-11 | 5.1.4 | 1 | 1-5失敗 |  |  | - | 1 | 273 | 9 | 8 |  | - | - | - | 291 | 開発MSIX作成時にStartupTask拡張を削除しており、設定画面で確認不能。本番exeは合格として再利用 |
| 26-08-11 | 5.1.4 | 2 | 1-5失敗 | - | - | - | - | - | 7 | 7 |  | - | - | - | 14 | StartupTaskは登録できたがStore版とDev版が同名表示となり識別不能 |
| 26-08-11 | 5.1.4 | 3 | STEP 1成功 | - | - | - | - | - | 7 | 7 | 成功 | - | - | - | 14+操作 | Dev表示名をOre No Fusen Devへ固定。ボタンでWindows設定を開き、旧debug・Store版を無効化後の再起動でDev版の自動起動に成功 |
| 26-08-11 | 5.1.4 | 4 | STEP 2成功 | - | - | - | - | - | - | - | - | 6 | 1 | 25 | 32 | 合格済みexeを再ビルドせずStore用MSIXへ梱包。5項目とexeのSHA-256一致を確認し、同じソースをdevelop/mainへ反映 |
| 26-08-16 | 5.1.5 | 1 | 1-5失敗 |  |  |  |  | 603（1-3〜1-4込み） | - | - | 失敗 | - | - | - | 603 | MSIXレジストリ仮想化により実HKCU Runを削除できないことを実機で特定 |
| 26-08-16 | 5.1.5 | 2 | STEP 1・2成功 | - | 69 | - | - | 253（1-3〜1-4込み） | - | - | 成功 | 6 | 2 | 285 | 615+操作 | 共有`auto_start`をfalseへ移行。Dev実機・Store形式5項目・exe SHA-256一致、pre-commit全検証38件成功・5件skip、develop/main反映を確認 |
| 26-08-30 | 5.2.0 | 1 | STEP 1・2成功 | - | 547件・E2E 38件成功 | ユーザー確認成功 | 3 | 638（誤ったフロント単体301を含む） | 7 | 9 | 成功 | 7 | 3 | 471（pre-commit455を含む） | 1,138+操作 | 5.2.0.0、x64、未署名、Store用MSIX内exeのSHA-256一致。`main`・`develop`とも`9232742` |
| 26-09-02 | 5.2.1 | 1 | STEP 1・2成功 | - | 554件・E2E 38件成功 | ユーザー確認成功 | - | 387（1-3〜1-4込み） | - | - | 成功 | 8 | 同時実施 | 未実施 | 727+操作 | pre-commit・コミット331秒。5.2.1.0、x64、未署名、Store用MSIX staging exeのSHA-256一致。固定提出先へ保存 |

## 更新履歴

| No. | 日付 | 内容 |
|---:|---|---|
| 16 | 26-07-27 | Store手動提出へ切替。タグ・GitHub Release・Winget・自動Store提出を廃止し、5.0.0の移行用資産だけを保持した。 |
| 17 | 26-07-28 | 事前検証・版確定・MSIX作成を、版番号を一度だけ入力する単一ワークフローへ統合した。 |
| 18 | 26-07-28 | 開発・Store公開の運用をSTEP 1〜3へ整理し、旧手順と未実装案を削除した。 |
| 19 | 26-08-03 | 通常公開前の必須ゲートとしてパッケージフライトを追加。Store署名済みMSIXで画像保存・画像付き複製・既存データ・更新を最終確認してから公開する4ステップ運用へ変更した。 |
| 20 | 26-08-03 | Store MSIX作成の通常目標を10分以内とし、Node系検証とRust releaseテストの並列化、同一run内でのRust成果物再利用を明記した。5.1.1の緊急例外も記録した。 |
| 21 | 26-08-10 | パッケージフライトを必須手順から外し、開発署名MSIXをこのPCで作成・実機確認してからStoreへ通常申請する3ステップ運用へ変更した。 |
| 22 | 26-08-10 | STEP 0〜3の失敗時フローと工程別時間記録を追加し、実機確認済み実行ファイルをStore用MSIXへ再利用して重複ビルドしない手順へ変更した。 |
| 23 | 26-08-11 | リリース時間をバージョンごとに1行で比較する集計表を追加し、試行ごとの記録を詳細試行ログへ移動した。 |
| 24 | 26-08-16 | STEP 3をCodexによるPartner Center申請へ変更し、アップロード確認、日本語・英語のリリースノート更新、ユーザー承認、認定中の確認、本人操作が必要な場合の引き継ぎを明記した。 |
| 25 | 26-08-16 | VS Code版CodexをSTEP 0〜2、Windows版CodexをSTEP 3の担当とし、Store申請時の引き継ぎ項目を明記した。 |
| 26 | 26-09-06 | STEP 1-1でこのPCから5つの版番号ファイルだけを安全に一括更新する固定コマンドを追加した。 |
