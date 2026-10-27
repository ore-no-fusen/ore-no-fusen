# 自動化の待機・再開・証拠の運用

2026-10-26改定。CI統合条件は[CI_MERGE_POLICY.md](CI_MERGE_POLICY.md)、正式リリースは[010_RELEASE.md](010_RELEASE.md)を正本とする。今回の変更はdevelop向けの実装で、main・Store版・Gatewayの本番有効化を自動的に変更しない。

## 入力待ちを始める前に止める

リリースマシンはGitの対話入力とPowerShellの対話入力を無効にする。ローカルDev証明書の秘密鍵・期限30日超・CurrentUser Rootの信頼がない場合は、ビルド前に停止する。初回のみ利用者が見えるPowerShellで `./packaging/msix/test-msix.ps1 -PrepareCertificateOnly` を実行し、Windowsの信頼確認を自分で判断する。CIでは専用の一時証明書を非対話準備する。通常アプリの証明書やStore署名とは別である。

画面の通信は15秒、通常の外部コマンドは2分、ローカルBuild工程は35分を上限とする。1分ごとの継続表示は制限時間の延長ではない。期限超過では所有する子プロセスのツリーだけを停止し、ログ・停止工程を保存する。再開ボタンは既に照合済みの合格成果物を再利用する。PR確認中は工程状態を保存して応答し、CIが終わるまでビルドを保持しない。承認待ちをビルドの再実行理由にしない。

## ソースと開発環境を守る

Tauri用フロントビルドは `my/tauri-build/stage-*` に必要な入力をコピーし、コピー側だけAPIのroute.tsを除外する。元のAPIファイルを移動しない。元入力のリンク、同時ビルド、古い退避との内容競合は停止する。生成済みoutはtransactionで切替え、中断した切替えは次回の起動で完了・復旧する。旧 `.tauri-build-api-*` は生存PID・復元先のリンク・内容競合を確認し、復旧後も原本をmy配下へ保全する。内容不明の退避を削除しない。

E2Eは空きポートと固有のNext出力を使う。終了・中断時には自分のPlaywrightとNextの子ツリーを停止してから固有の出力を整理する。commitフックは常設3002の利用者プロセスを停止しない。手動で強制終了した場合は所有PIDと固有出力を照合してから復旧する。

## CIの役割と期限

### Tauri画面ビルドの重複を避ける

MSIXが必要な変更ではfrontendの単独build:tauriを省略し、MSIX jobのtauri buildがbeforeBuildCommandで行う画面ビルドへ集約する。MSIX不要のコード変更ではfrontendのbuild:tauriを残す。判定が不明ならfrontendのビルドを残し、gateは不正なscopeを拒否する。文書だけは従来どおりアプリ検査対象外。

画面ビルド失敗はTauri exe作成を失敗させ、梱包・導入を進めずMSIX jobとgateを失敗させる。単独MSIX起動の前提テストやWeb/API production buildは省略しない。失敗の検知は先行job合格後のexe作成時へ移る。MSIX時の画面buildは2回から1回になる。通常開発の全件Vitest・型検査はGitHubのPR検査へ集約する。PC hookは差分検査と対象時のアプリE2E（--grep-invert @ci-guide）を担当し、ガイド日英2件はCIで検査する。修正中の対象テストと実機確認はPCに残す。

表1 CIの工程上限（分）

| 工程 | 上限 | 補足 |
|---|---:|---|
| scope / 分析 / gate | 各3 | gateは前提失敗・キャンセル・不明を拒否 |
| frontend / Rust | 各30 | 全単体・型・E2E・静的出力 / all-target locked tests |
| MSIX全体 | 70 | 単独呼出しのテスト時間も含む上限 |
| 証明書 / npm ci / Web production | 2 / 5 / 10 | Web/API検証は静的ビルドで代用しない |
| Rust単独検査 / Tauri実行ファイル | 15 / 25 | 通常Test合格済みなら同一SHAの単体/Rust再検査だけ省略 |
| 梱包署名 / 署名検証 / 導入起動 | 5 / 2 / 3 | OS処理にも工程上限を適用 |
| 公開ガイドのbuild / deploy | 各10 | 独立した公開repoにも同じ設定 |

旧do-release/do-non-app-releaseは直接push経路を廃止し、明示的に失敗終了する案内専用へ変更する。リモートの旧エントリーも無効化し、正規のリリースマシンと保護PRを使う。Rust Windows Testは独立した手動診断専用とし、通常PRではTestの全target検査へ集約する。前提検査が失敗したときは高価なMSIXビルドを始めない。TestはPR/branch単位で実行を直列化し、実行中の古いSHAを自動取消しない。待機中はGitHubの最新1件に集約されるため、未開始の古いrunの取消しと計算済み工程の破棄を区別する。修正コミット追加で旧SHAの検査が不要になった場合に手動取消するなら、旧SHA・理由を保存し、新しいheadの全CI合格を別に確認する。確認待ちだけを理由に同じSHAのビルドを再実行しない。PowerShell構文検査はfeature pushとPRの二重実行を避け、PRとmain/develop統合後に行う。

status JSONはrun ID・attempt・SHAごとの成果物へ保存する。必須工程がskip/失敗/未完了なら補助JSONをsuccessにしない。共有ci-statusブランチへの書込みは廃止する。成果物保存自体が失敗した場合もGitHub jobの結果を確認する。最新head/baseのすべての適用対象チェックと統合後CIの合格を要求する条件は変わらない。

### PR成功証跡を使う統合後検証

develop統合後のfrontend・rust・msixは、現在SHAで同じrepoの最新成功PR、親base/head、ソースtree全体、OS image版・Node/Rust・関連環境設定、24時間以内の証跡を照合する。artifactのdigestと単一JSONを検証し、gateも参照元の最新成功を再確認する。欠落・期限切れ・不一致・API障害は通常の全検査に戻る。再利用後に参照元が変わればgateを失敗させる。main・PR・手動実行・2回目以降のattemptは全検査を行う。正式提出物・実機確認は従来どおり実施する。全条件は [CI_MERGE_POLICY.md](CI_MERGE_POLICY.md) に従う。

ログの `Verified ... identical tree/parents/environment` と参照元run、gateの `Audited ... remains successful` を確認する。MSIX状態は `overall: reused` / `created: false` と参照元を記録し、新規パッケージは生成しない。署名・導入の成功根拠は参照元runに残る。新規診断パッケージが必要なら手動MSIXを使う。参照元の変化でgateが失敗したら原因を調べ、ActionsのRe-run jobsで全検査を行う。確認待ちだけを理由に同じSHAを再実行しない。

小さなsuite別JSON証跡も1日保持とする。整理後は次の統合時に全検査へ戻る。PC署名鍵・常設runnerは追加しない。

## Discord取込と配送

REST取込はCloudflareの環境別Durable Objectだけがcheckpointを管理する。REST呼出し自体も401/403では同じ認証設定で再送せず、修復したcredentialの変更で再開する。429はRetry-Afterと標準5分の長い方まで待機する。Discord本体の401/403と429も、APIが依存先別のエラー情報として返して停止・待機を伝搬する。Bot設定の認証停止はAPIの取込secret不一致と区別する。Bot設定修復後はWorkerの非秘密変数 `INGEST_REPAIR_REVISION` を変更して再デプロイし、同じcheckpointから再開する。公開HTTPを有効にしている運用だけは、取込secretで認証した `POST /ingest/retry` でも再開できる。現在のworkers_dev=falseを再開のため勝手に公開しない。Vercelの日次Cronは廃止し、認証済み旧入口は410、未認証は401を返す。重複する無状態の実行器へ戻さない。APIは1回20件・全体12秒の予算内で進め、before/high-water/floorと環境・channelをcontinuationへ返す。小分けの途中では全体cursorを進めず、継続位置をstorage transactionで保存する。全部終わってからhigh-waterを確定する。保存途中の失敗後も同じmessage IDの冪等保存で再開する。外部通信は本文読取まで期限を適用し、書込の無条件自動再送はしない。

Gatewayの配送は環境別の走査位置と時間予算を保持し、先頭100件が非有効環境向けの保留証拠でも後続へ進む。非有効環境の証拠は消さない。401/403は当該環境だけを停止する。secret変更、または設定修復後にcontrol secretで認証した `POST /gateway/retry-delivery` で再開する。`GET /gateway/status` も認証必須で、診断には本文・secretを含めない。429はRetry-Afterを優先し、その他の一時障害は上限5分の指数待機を使う。成功した他環境をやり直さない。Gatewayの本番有効化・課金判断・実会話往復確認は通信仕様の別途条件を守る。

## 成果物の容量と保全

新しい診断成果物はMSIX・状態・導入ログだけを1日保持し、PDBを添付しない。Store提出物は別管理であり、この整理の対象外。容量・件数を見て不要な診断成果物だけを次の順で整理する。

1. `node scripts/ci-artifact-policy.mjs --directory my/ci-artifact-archive` で対象を計画する。標準は24時間以上前の完了済みMSIX CIだけ。Pages・Store・実行中・open PR・全体最新成功3件・main/develop最新の成功と失敗を保持する。調査中のrunは `--protect-runs ID1,ID2` で追加する。
2. 同じ引数に `--archive` を付け、zipとGitHub digestを照合する。失敗時は削除へ進まず再開する。ダウンロードは各10分上限、最大4本。manifestとzipはmy/保全へ保存し、重要な調査IDが除外されていることを確認する。
3. 表示されたmanifest SHA256を確認し `--apply --manifest-sha256 <SHA256>` で適用する。zipのハッシュとリモートID/サイズ/SHA、現在の保護対象を再確認して、保存済みIDだけを削除する。保護対象に変化があれば停止して再計画する。削除結果はdeleted.jsonlへ追記する。

原本Wikiは全履歴bundleへ保全してから、.gitmodulesがないwiki-temp gitlinkだけを追跡対象から除く。利用者向け公開原稿の正本はpublic-guideであり、Wiki原本を上書き・削除しない。

開発Workerは既存の `v1 / DiscordIngestCoordinator` migrationを環境別に明示し、本番側の未有効Gateway登録v2を継承しない。既存のWorker名・DO binding・cron・HTTP非公開を維持して更新する。配布前にはリモートの現在migration tagと解決済み設定を照合し、既に適用済みのmigrationを巻き戻さない。
