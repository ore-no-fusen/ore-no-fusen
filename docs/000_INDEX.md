# 運用文書の一覧

番号はdocs/内の分類。docs-v2/の設計書番号とは別体系。既存の000・100番台を保ち、テストを200番台へ集約する。番号は文書の識別子として固定し、削除しても再利用・詰め直しをしない。新規文書は同じ分類の空き番号を使い、この一覧と参照元を同時更新する。過去の作業記録・固定コミットURLは改名しない。

表1：番号帯と役割

|番号帯|役割|
|---|---|
|000〜099|索引・リリース・開発環境|
|100〜199|利用者向け案内|
|200〜299|テストの選択・索引・確認|
|300〜399|日常運用・保守|
|400〜499|計画・検討資料|

表2：文書一覧

|番号|ファイル|内容|
|---|---|---|
|010|[010_RELEASE.md](010_RELEASE.md)|リリース手順|
|011|[011_VERCEL_SETUP.md](011_VERCEL_SETUP.md)|Vercel セットアップガイド|
|012|[012_BADGE_WORKER_SETUP.md](012_BADGE_WORKER_SETUP.md)|READMEバッジ Worker セットアップガイド|
|013|[013_STORE_SUBMISSION.md](013_STORE_SUBMISSION.md)|Store提出手順|
|014|[014_CI_MERGE_POLICY.md](014_CI_MERGE_POLICY.md)|PC中心の統合と検査|
|015|[015_DEPENDENCY_SECURITY.md](015_DEPENDENCY_SECURITY.md)|リリース依存の維持方針|
|016|[016_AUTOMATION_OPERATIONS.md](016_AUTOMATION_OPERATIONS.md)|自動化の待機・再開・証拠の運用|
|100|[100_USER_GUIDE.md](100_USER_GUIDE.md)|俺の付箋 ユーザーガイド|
|101|[101_FAQ.md](101_FAQ.md)|よくある質問 (FAQ)|
|102|[102_LOG_PRIVACY.md](102_LOG_PRIVACY.md)|ログファイルについて - プライバシーと透明性|
|200|[200_TEST_SELECTION_MATRIX.md](200_TEST_SELECTION_MATRIX.md)|何を直したら、何をテストするか|
|201|[201_TEST_SELECTION_POLICY.md](201_TEST_SELECTION_POLICY.md)|機能単位で選ぶテストと実行分担|
|202|[202_TEST_FILE_INDEX.md](202_TEST_FILE_INDEX.md)|テストファイル全一覧（機能別）|
|203|[203_TEST_EXECUTION_MATRIX.md](203_TEST_EXECUTION_MATRIX.md)|テスト・検査の一覧|
|204|[204_TEST_USE_CASE_MATRIX.md](204_TEST_USE_CASE_MATRIX.md)|作業パターン×テスト・検査マトリクス|
|206|[206_MANUAL_VERIFY_PHASE19.md](206_MANUAL_VERIFY_PHASE19.md)|Phase 19 手動検証手順書|
|300|[300_SCREENSHOT_REPORTING.md](300_SCREENSHOT_REPORTING.md)|修正結果のキャプチャ報告|
|301|[301_MEMBER_USAGE_OPERATIONS.md](301_MEMBER_USAGE_OPERATIONS.md)|会員別・全体の週次機能利用状況を見る|
|302|[302_PUBLIC_GUIDE_MAINTENANCE.md](302_PUBLIC_GUIDE_MAINTENANCE.md)|利用者向け公開資料の分離（6.1.0準備）|
|400|[400_WIKI_RICH_HELP_PLAN.md](400_WIKI_RICH_HELP_PLAN.md)|ユーザー向けリッチヘルプサイト化計画|
|401|[401_DASHBOARD_IMPROVEMENT_SIMULATION.md](401_DASHBOARD_IMPROVEMENT_SIMULATION.md)||
