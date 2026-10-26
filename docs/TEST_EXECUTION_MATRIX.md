# テスト・検査の実行場所と省略候補

2026-10-27。文書CI修正後の構成。個々の975件ではなく、実行コマンド・確認作業のまとまりで番号を付けています。個々のテストファイルは [別一覧](TEST_FILE_INDEX.md) に全件掲載します。

◎＝自動、対象時＝手動で必要範囲を実施、—＝なし。**通常**は文書コンテンツだけではない変更。PR列はPR更新ごと、統合後列はdevelop/mainへのpushごとです。今回はPC結果のGitHubへの移管・証跡再利用はまだ実装していません。

## 今回修正した範囲

- 文書コンテンツだけなら、T01/T02/T04〜T14/T19/T21等のfrontend/Rust/分析とMSIXを起動しません。scope、文書検査、必要な文書build、CI gateを実施します。
- 設計書build（T31）をTestへ集約し、別workflowのpushによる二重起動をなくしました。
- 文書フォルダー内でも設定・依存・実行コードの変更、アプリとの混在、判定不能は通常の検査を残します。

## 全検査の番号表

|番号|検査|PC：修正中/必要時|PC：コミット直前|GitHub：PR更新時|GitHub：develop/main統合後|省略・重複の判断|
|---|---|---|---|---|---|---|
|T01|単体テスト（Vitest）|対象を手動|◎ 文書以外|◎ 通常|◎ 通常|候補：PC・PR・統合後で反復。証跡照合ができれば再利用|
|T02|TypeScript型検査|対象時|◎ 文書以外|◎ 通常|◎ 通常|候補：PC/CIとNext build内で反復。対象の違いを照合|
|T03|画面操作E2E・全体|対象時|◎ PC画面/Tauri等|—|—|PCの全体試験。CIは同じ全体を実行していない|
|T04|公開ガイド設定リンクE2E（日英）|対象時|T03に含む場合|◎ 通常|◎ 通常|候補：T03と同じ2件。PC結果の一致記録が必要|
|T05|リリース処理・隔離Git試験|対象時|—|◎ 通常|◎ 通常|PC hookにない。移管するならPCでの検査に追加|
|T06|リリース画面のブラウザ試験|対象時|—|◎ 通常|◎ 通常|PC hookにない。移管後に同一結果を再利用できる|
|T07|外部コマンド・停止/再開試験|対象時|—|◎ 通常|◎ 通常|PC hookにない。運用コードを変えた場合は必要|
|T08|隔離フロントbuild・復旧試験|対象時|—|◎ 通常|◎ 通常|原本破損/途中失敗の回帰。未実施のまま省略しない|
|T09|MSIX結果の成功/失敗判定試験|対象時|—|◎ 通常|◎ 通常|失敗や未実施を成功扱いしない確認|
|T10|自動化・CI構成の規則試験|対象時|—|◎ 通常|◎ 通常|規則やworkflowの変更時に必要。PC移管候補|
|T11|成果物保全・削除条件試験|対象時|—|◎ 通常|◎ 通常|削除対象/対象外の確認。結果なしで省略しない|
|T12|外部通信期限の試験|対象時|—|◎ 通常|◎ 通常|期限/失敗回復の確認。PC移管するなら対象に追加|
|T13|Discord Worker配送・取込試験|対象時|—|◎ 通常|◎ 通常|Rust/画面とは別。Vitestに含まれない|
|T14|利用状況分析の回帰試験|対象時|—|◎ 通常|◎ 通常|候補：無関係な変更では対象外にできる余地|
|T15|会員集計スクリプトの試験|対象時|—|—|—|手動対象。現在のCI一覧には含まれない|
|T16|CI対象分類・gateの回帰試験|対象時|—|◎ 全変更|◎ 全変更|今回強化。文書のみ/混在/移動/失敗を確認。軽いため残す|
|T17|実際の変更範囲の判定|手動調査時|hook独自判定|◎ 全変更|◎ 全変更|候補：PC/CIの分類を共通化。今は判定器が別|
|T18|CI結果の集約・統合可否|リリース時にも照合|—|◎ 全変更|◎ 全変更|残す。必要な検査の失敗/不明/予期しないskipは拒否|
|T19|Rustテスト|Rust対象時|—|◎ 通常|◎ 通常|候補：PCへ実施を集約して証跡再利用。hookにはない|
|T20|Rustコンパイル検査|Rust対象時|—|手動診断のみ|手動診断のみ|cargo testと重なる部分あり。独立Rust workflowは手動専用|
|T21|Tauri用画面の静的build|必要時|—|◎ 通常（MSIX時2回）※|◎ 通常（MSIX時2回）※|候補：frontendとTauri本体のbeforeBuildで二重。未修正|
|T22|Web/API用の本番build|必要時|—|◎ MSIX対象時|◎ MSIX対象時|T21とは対象/出力が異なる。Vercelとの同等性は別確認|
|T23|Tauri/Rust実行ファイルbuild|MSIX/リリース時|—|◎ MSIX対象時|◎ MSIX対象時|候補：PC移管で枠節約。ただしCIのダミー環境と提出物は別|
|T24|開発証明書の準備・信頼確認|初回/失効時・build前|—|◎ MSIX対象時|◎ MSIX対象時|PCと使い捨てCIの証明書は別。単純な同一扱い不可|
|T25|開発用MSIX梱包・署名|実機/リリース時|—|◎ MSIX対象時|◎ MSIX対象時|同一exeは再buildせず梱包へ再利用する|
|T26|MSIX署名の検証|実機/リリース時|—|◎ MSIX対象時|◎ MSIX対象時|対象のMSIXと証明書ごとの確認。別成果物の成功を流用不可|
|T27|MSIXインストール・起動確認|実機/リリース時|—|◎ MSIX対象時|◎ MSIX対象時|CIは使い捨て環境、PCは実機。データ保全が必要|
|T28|PowerShell/XMLの構文検査|対象時|—|◎ 該当変更時|◎ 該当変更時|候補：PC検査を準備すれば再利用可能。短時間|
|T29|公開原稿のexport境界試験|対象時|—|◎ 通常|◎ 通常|公開ファイルに内部資料を混ぜない確認|
|T30|公開マニュアルbuild・リンク検査|原稿変更時|—|◎ 通常/ガイド文書|◎ 通常/ガイド文書|候補：本体と公開repoの原稿一致を確認して再利用|
|T31|設計書build・リンク検査|設計書変更時|—|◎ docs-v2変更時|◎ docs-v2変更時|今回：Testから1回だけ呼ぶ。独立pushとの二重起動を解消|
|T32|設計書HTMLリンク処理の単体試験|対象時|—|—|—|手動対象。設計書buildのリンク検査とは別|
|T33|実Windows SDKでのMSIX回帰|梱包処理変更時|—|—|—|PCの隔離試験。署名/導入はしない。T25/T27と別|
|T34|Store提出物の形式/同一exe検証|STEP 2|—|—|—|残す。実機合格exeを再利用し、再コンパイルしない|
|T35|版番号限定コミットの検査|STEP 0の版番号更新|◎ 限定モードのみ|通常CIへ|通常CIへ|既存の限定例外。任意のコード変更に使えない|
|T36|文書だけの差分・空白検査|文書変更時|—|◎ 文書のみ|◎ 文書のみ|今回追加。文書のみでアプリ検査を省略する代わりに実施|
|T37|Lint・コード規約検査|対象時|独立実行なし|build内に含む|build内に含む|候補：独立実行とbuild内の重複。ただし対象範囲を照合|
|T38|テストカバレッジ集計|必要時のみ|—|—|—|常時実行ではない。不要な毎回実行を追加しない|
|T39|性能ログ集計・性能確認|性能変更/実測時|—|—|—|実測が必要な対象で実施。T03/T01の関連試験とは別|
|T40|PCアプリの実機動作確認|修正箇所/影響範囲|—|—|—|TauriモックやCI起動だけでは代替できない|
|T41|iPhone/PWAの実機確認|Preview統合後|—|—|○ 配信後に人が実施|ブラウザの模擬試験と端末実機は別。必要変更時に残す|
|T42|Store公開後の導入/更新確認|正式公開後|—|—|—|開発用MSIXとは署名/配布経路が異なるため残す|
|T43|VercelのWeb/API自動build|—|—|◎ 外部サービス|◎ 外部サービス|候補：文書変更の外部buildは今回の削減対象外。設定/環境の別確認が必要|
|T44|リリース候補・CI・tree・exe照合|STEP 1/2・再開時|—|CIを参照|CIを参照|残す。確認待ちでbuildをやり直さず同一exeを使用|
|T45|共有チェックリスト試作の回帰|試作変更時|—|—|—|計画内の試作。製品の単体/CIに含まれない|

※T21の2回はfrontendの単体buildと、T23のbeforeBuildCommandからのbuild。別jobなので出力は自動共有されません。今回の文書分岐修正では、通常変更時の二重buildはまだ解消していません。

GitHubの手動診断は通常のPR/統合後列と別です。Rust Windows Testはcargo checkとcargo testを行います。MSIX CIを単独起動した場合はprevalidated=falseでT01/T19も実施し、通常のTestからの呼出しでは合格済みのためその2件を再実行しません。旧do-release/do-non-app-releaseは無効化済みの案内専用で、検査を実行しません。公開ガイド別リポジトリのbuild/配信はT30の重複候補として含めています。

## PCの「自動」の前提

新しいworktreeでは、node_modulesを共有しただけではHuskyの起動用ファイルが作られず、Git設定があってもhookが実行されない場合があります。**作業場所ごとに `npm run prepare` を実行し、`.husky/_/pre-commit` の存在を確認**します。`HUSKY=0`等の無効化がないことも確認します。今回は未準備を検出して準備し直し、全975件と型検査の成功を確認しました。

また、hookは作業フォルダーを検査するため、未ステージの変更を混ぜたまま「コミット対象を検査した」とは保証できません。PC結果をGitHubで再利用する前に、候補内容・base・依存・条件・結果を一致させる仕組みが必要です。

## 次に省ける候補と順序

|優先|対象番号|案|まだ必要な準備|
|---|---|---|---|
|1|T21|MSIXが必要なときは画面buildを1回へ集約|環境条件・生成物の受渡し/所有者を整理|
|2|T01/T02/T04|PCで確認した同じ内容の結果を再利用|正確な候補内容と条件を記録・照合|
|3|T05〜T14/T19|CIだけの検査もPCの共通実行入口へ集約|PC側の未網羅を埋め、失敗/未実施を区別|
|4|T01〜T31の該当項目|同じ内容のPR合格を統合後に再利用|treeだけでなく環境・依存・Git参照条件も照合|
|5|T30/T43|公開ガイド/外部buildの再実行を整理|原稿一致・配信環境・サービス側の設定を確認|

## 実測の参考

直近PR98の検査23.20 job分、同じソースtreeの統合後23.52 job分、計46.72 job分。単体98秒＋型12秒だけの再利用なら約1.8分/回であり、全体の大幅削減にはbuildや統合後の再利用も必要です。正式な請求分数でも、PCの待ち時間でもありません。

## 各番号の実行コマンド・根拠

|番号|主な入口|
|---|---|
|T01|`npm test`|
|T02|`npx tsc --noEmit`|
|T03|`npm run test:e2e`|
|T04|`npm run test:e2e -- e2e/public-guide-links.spec.ts`|
|T05|`node --test scripts/release-machine/engine.test.mjs`|
|T06|`node --test scripts/release-machine/ui.test.mjs`|
|T07|`node --test scripts/release-machine/runner.test.mjs`|
|T08|`node --test scripts/tauri-frontend-stage.test.mjs`|
|T09|`node --test scripts/msix-status.test.mjs`|
|T10|`node --test scripts/automation-policy.test.mjs`|
|T11|`node --test scripts/ci-artifact-policy.test.mjs`|
|T12|`node --test scripts/network-deadline.test.mjs`|
|T13|`node --test workers/discord-replies/src/index.test.mjs`|
|T14|`node --test scripts/member-usage-analysis.test.mjs`|
|T15|`node --test scripts/member-stats.test.mjs`|
|T16|`node --test scripts/ci-scope.test.mjs`|
|T17|`node scripts/ci-scope.mjs BASE HEAD`|
|T18|`node scripts/ci-scope.mjs gate`|
|T19|`cargo test --locked（src-tauri）`|
|T20|`cargo check --manifest-path src-tauri/Cargo.toml / Rust Windows Test`|
|T21|`npm run build:tauri`|
|T22|`npm run build`|
|T23|`npx tauri build --no-bundle --ci（CI）`|
|T24|`ci-msix-certificate.ps1 / test-msix.ps1 -PrepareCertificateOnly`|
|T25|`test-msix.ps1 -SkipBuild -NoInstall`|
|T26|`Get-AuthenticodeSignature等`|
|T27|`ci-msix-smoke.ps1 / windows.ps1 -Action Install`|
|T28|`MSIX Script Check`|
|T29|`node --test scripts/export-public-guide.test.mjs`|
|T30|`npm --prefix public-guide run build`|
|T31|`npm run docs:build（docs-v2）`|
|T32|`npm run docs:test-links（docs-v2）`|
|T33|`node --test scripts/release-machine/msix.test.mjs`|
|T34|`validate-msix.ps1 / SHA256照合`|
|T35|`check-version-commit.mjs`|
|T36|`node scripts/ci-scope.mjs documents BASE HEAD`|
|T37|`npm run lint / Next build内`|
|T38|`npm run test:coverage`|
|T39|`npm run perf:check / 実機測定`|
|T40|`保存・復元・同期・ショートカット等`|
|T41|`docs/010_RELEASE.md STEP 0-3`|
|T42|`STEP 3-4`|
|T43|`GitHub連携のVercel build`|
|T44|`release-machine/github.mjs・engine.mjs`|
|T45|`node --test .planning/shared-checklist/spike/*.test.mjs`|

根拠は `.husky/pre-commit`、`.github/workflows/`、各設定/スクリプト、`docs/010_RELEASE.md`。正式リリースは専用手順に従い、CIのMSIXをStore提出exeへ取り違えません。
