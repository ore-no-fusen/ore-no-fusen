# CI Repair Autopilot

`script/autopilot.py` ではなく **`scripts/autopilot.py`** を使用します。

このMVPはPC上で常駐し、MSIX CIを30秒ごとに確認します。

```text
GitHub Actions
  ↓
失敗Runを検出
  ↓
失敗ログ取得
  ↓
関連ソースを収集
  ↓
OpenAI Responses APIへ原因修正を依頼
  ↓
unified diffのみ受領
  ↓
編集可能パスを検査
  ↓
git apply --check
  ↓
ローカルテスト
  ↓
commit / push
  ↓
次のMSIX CIを監視
```

## 必要なもの

- Windows上の俺の付箋リポジトリ
- Python 3.11以上
- Git
- GitHub CLI (`gh`)
- OpenAI API key
- 利用するOpenAI API model名

GitHub CLIは事前にログインしてください。

```powershell
gh auth login
gh auth status
```

## API設定

PowerShellの現在のウィンドウだけに設定する例です。

```powershell
$env:OPENAI_API_KEY = "あなたのAPIキー"
$env:OPENAI_MODEL = "あなたのAPIプロジェクトで利用可能なモデル名"
```

APIキーはリポジトリ、`autopilot.json`、`.env`へ保存しないでください。

## まず安全確認だけする

AIが修正パッチを作成しますが、ファイルへ適用・pushしません。

```powershell
python scripts/autopilot.py --dry-run --once
```

成功すると提案パッチが `.git/autopilot-proposed.patch` に残ります。

## オートパイロット開始

```powershell
python scripts/autopilot.py
```

停止は `Ctrl+C` です。

## 暴走防止

`autopilot.json` の初期設定では以下を行います。

- 修正試行は最大5回
- 同じ失敗が2回を超えて繰り返したら停止
- `allowed_prefixes` 外の変更を拒否
- secret / credential / `.env` 系ファイルの変更を拒否
- `git apply --check` に失敗したパッチを拒否
- ローカル検証に失敗した場合は `git reset --hard HEAD` でAI修正だけを戻して停止
- 作業ツリーに未コミット変更がある状態では開始しない

## 現在のローカル検証

初期設定ではAI修正後、push前に以下を実行します。

```powershell
npm test -- app/components/ImageAnnotationModal.test.ts
npm run build
```

必要に応じて `autopilot.json` の `validation_commands` を増やせます。

## 注意

このMVPは「失敗したCIを自律修復する」ためのものです。AIが生成した修正を無制限に適用する設計にはしていません。最大試行回数と編集範囲の制限を残したまま利用してください。
