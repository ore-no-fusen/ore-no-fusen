# CIとPR統合の標準手順

2026-10-25改定。通常開発は独立ブランチ→対象テスト→PR→CI確認→失敗原因の修正→全適用対象成功→最新状態確認→developへマージ→マージ後CI/反映確認とする。mainへの統合は010_RELEASE.mdの別途リリース判断に従う。この改定のためにVer.6.0を再リリースしない。

## 必須の確認

- PR作成はマージ承認ではない。最新head SHA、base SHA、テスト対象のmerge SHAを照合する。新しいコミットがあれば古い成功を流用しない。
- 失敗、未完了、キャンセル、結果不明の適用対象チェックが1件でもあればマージしない。無関係に見える失敗も原因を確認して解決する。失敗を正常扱いする例外は設けない。
- CI gate、すべての起動済みワークフロー、必要なデプロイ結果、競合なし、baseへの追随、保護条件を最終確認する。APIによるマージは確認済みhead SHAを必ず指定する。
- admin merge、force push、チェック削除、continue-on-error、直接pushで失敗を回避しない。失敗した試行のログを残し、修正後の成功と区別する。
- マージ後はmerge SHAのCIを確認する。失敗した場合は次の統合を止め、新しい修正PRまたはrevert PRで回復する。共有履歴を書き換えない。

## テスト構成

- Testはpull_request、main/developへのpush、merge_groupで起動し、pathsフィルターを付けない。
- frontendは全フロント単体テスト、型検査、Tauri向けフロントビルドを必ず実行する。rustはlocked all-target tests、Dashboard analysis regression testsは分析Nodeテストを実行する。botによるpushでも省略しない。
- scopeは実際のgit diffをNUL区切りで読み、リネームの両側も調べる。既知の分析/文書/LPだけならMSIXを省略できる。アプリ、components、worker、public、依存、設定、CI、未知のパスを含む変更はMSIX必須。空差分・判定失敗で成功扱いしない。
- MSIX CIはTestから再利用する。単独の手動診断も可能。MSIXを必要とする変更では、梱包・署名検証・インストール・起動まで成功を要求する。インストーラー生成だけで合格にしない。
- CI gateはalwaysで結果を集約する。前提ジョブの失敗/キャンセル/予期しないskipを拒否し、scopeが明示的にfalseの場合だけMSIXのskipを許可する。pathsで起動しないMSIXジョブ自体を一律必須指定しない。
- 他の起動済みCI（docs、PowerShell検査、Rust Windows Test等）の失敗も最終確認で見落とさない。

## GitHub保護設定（管理者による設定が必要）

2026-10-25、管理者の本人確認後にRuleset `main-develop-required-ci`（ID 25801862）をActiveで作成済み。main/developの両方にPR必須・GitHub ActionsのCI gate必須・strict更新・削除/force push禁止を適用し、bypass一覧は空。APIで保存結果と両PRのBLOCKEDを確認した。以下は再設定時の手順と、設定前の調査記録である。

文書やworkflowの追加だけではGitHub側の強制力は生じない。2026-10-25調査時、main/developはprotected=false、rulesetsは空。CLI認証はadmin=false/push=falseで管理権限なし。接続GitHub Appはコード/PR更新が可能だが、管理設定の更新APIを提供しない。

1. Settings → Rules → Rulesets → New branch ruleset。名前は「main/develop CI必須」、Enforcement statusはActive、対象をrefs/heads/mainとrefs/heads/developに限定する。
2. Restrict deletions、Block force pushes、Require a pull request before mergingを有効にする。管理者や日常利用者をbypass一覧へ追加しない。
3. Require status checks to passを有効にし、実際に成功したチェック名「CI gate」（提供元GitHub Actions）を必須にする。Require branches to be up to date before mergingも有効にする。全コミット共通の必須チェックにpaths付きジョブを指定しない。
4. 保存後に両ブランチの有効ルールをAPI/画面で再確認する。通常のPRでgate未完了/失敗/キャンセル時のマージ禁止と、base更新後の再検証要求を確認する。直接push・削除・force pushを試験のために共有ブランチへ実行しない。
5. 正規リリースAppを許可する場合も全ルールを無制限にbypassさせない。PR要件とCI要件を別rulesetに分け、必要ならAppにはPR要件の「For pull requests only」だけを許可する。CI必須rulesetにはbypassを設けない。ユーザー/管理者の恒久例外は作らない。

リリースマシンは版番号更新のdevelop PR完了を前提に、専用候補ブランチで実機検証・MSIX保全を行う。main宛てPRとmain→develop同期PRはGitHub画面で全CI成功後に通常マージし、同じボタンで再開する。各統合後CIと候補tree一致を検証し、直接push・保護回避を行わない。旧do-release/do-non-app-releaseは案内専用へ廃止し、リモートでも無効化して利用せず、この正規経路を使う。今回はリリース操作を行わない。

## 早すぎるマージの是正

まずmerge SHAと差分、失敗ログ、main/配布先への到達を確認する。必要な修正を失わない。原因と回復をテストで裏付けられる場合は前進修正PRを使う。安全性を説明できなければrevert PRと再導入PRを分ける。どちらも全適用対象CI成功前にはマージしない。元の失敗記録を成功に書き換えない。


待機上限・再開・成果物保全の詳細は [AUTOMATION_OPERATIONS.md](AUTOMATION_OPERATIONS.md) を参照する。
