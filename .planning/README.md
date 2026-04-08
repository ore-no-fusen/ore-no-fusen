# .planning/ ファイル一覧

このディレクトリのファイルは GSD（Get Shit Done）ツールが自動管理します。
ファイルを手動で作成・編集するときの参考として、作成順と役割を記載します。

## ファイル作成順と役割

| 順番 | ファイル | 役割 | 作成タイミング |
|------|---------|------|--------------|
| 01 | [PROJECT.md](PROJECT.md) | プロジェクト全体の目的・技術スタック・決定事項 | プロジェクト開始時（`/gsd:new-project`） |
| 02 | [REQUIREMENTS.md](REQUIREMENTS.md) | 各マイルストーンの要件一覧（REQ-IDで管理） | マイルストーン開始時（`/gsd:new-milestone`） |
| 03 | [MILESTONES.md](MILESTONES.md) | 完了済みマイルストーンのアーカイブ | マイルストーン完了時（`/gsd:complete-milestone`） |
| 04 | [ROADMAP.md](ROADMAP.md) | フェーズ分解・成功基準・進捗 | ロードマップ作成時（`/gsd:new-milestone`） |
| 05 | [STATE.md](STATE.md) | 現在地・直近の決定事項・ブロッカー | 自動更新（各フェーズ実行のたびに更新） |
| 06 | [config.json](config.json) | GSD設定（モデル・research有効化など） | 初回設定時 |

## サブディレクトリ

| ディレクトリ | 内容 |
|-------------|------|
| `phases/` | 各フェーズの PLAN.md（実行計画） |
| `milestones/` | 完了マイルストーンのアーカイブ |
| `research/` | リサーチエージェントが書いた調査結果 |
| `quick/` | `/gsd:quick` で実行したクイックタスクの記録 |

## 現在の状態

- **現在のマイルストーン**: v4.0 ロック画面コントロール
- **次のアクション**: `/gsd:plan-phase 13`
