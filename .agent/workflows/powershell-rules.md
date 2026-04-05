---
description: PowerShell（Windows）でコマンドを実行するときの必須ルール（run_command使用前に必ず確認）
---

# ⚠️ PowerShell 必須ルール

このプロジェクトは **Windows / PowerShell** 環境。
`run_command` を使う前に**必ずこのリストを確認**すること。

---

## 1. コマンド連結: `&&` は使わない → `;` を使う

```powershell
# ❌ 毎回失敗する
git add . && git commit -m "..."

# ✅ 正しい
git add .; git commit -m "..."
```

---

## 2. Unix系コマンドは存在しない → PowerShell版を使う

| ❌ bash | ✅ PowerShell |
|---|---|
| `tail -20` | `Select-Object -Last 20` |
| `grep pattern file` | `Select-String pattern file` |
| `cat file` | `Get-Content file` |
| `which cmd` | `Get-Command cmd` |
| `rm -rf dir` | `Remove-Item -Recurse -Force dir` |
| `cp -r src dst` | `Copy-Item -Recurse src dst` |
| `mkdir -p dir` | `New-Item -ItemType Directory -Force dir` |
| `touch file` | `New-Item file` |
| `export VAR=val` | `$env:VAR = "val"` |

---

## 3. cargo build の出力をパイプするときは PowerShell 版で

```powershell
# ❌
cargo build 2>&1 | tail -20

# ✅
cargo build 2>&1 | Select-Object -Last 20
```

※ ただし cargo build はビルドエラーをstderrに出力するため、
`2>&1` でマージしても PowerShell のパイプエラーが出る場合がある。
その場合はパイプせず単体で実行し、WaitMsBeforeAsync を長めに取る。

---

## 4. cargo build は時間がかかる（WaitMsBeforeAsync を十分に設定）

- 初回または変更が多い場合: **120000ms 以上**
- 差分ビルド（小変更后）: **60000ms 程度**
- `Finished` が出ればコンパイルエラーなし（exit code が 1 でも PowerShell のパイプ由来の場合がある）

---

## 5. `cd` コマンドは使わない → `Cwd` パラメータを使う

```
# ❌
cd src-tauri; cargo build

# ✅ Cwd パラメータにディレクトリを指定する
CommandLine: "cargo build"
Cwd: "d:\\Users\\uck\\Documents\\curry-project\\ore-no-fusen\\src-tauri"
```

---

## 6. git commit メッセージの日本語はシングルクォートを使う場合がある

```powershell
# ダブルクォート内の日本語は問題ないが、特殊文字が含まれる場合はシングルクォートを検討
git commit -m "fix: 日本語メッセージ"      # 通常はこれでOK
git commit -m 'fix: 特殊文字$入り'         # $ などが入る場合
```

---

## 7. npm / pnpm コマンドも同様

```powershell
# ❌
npm run build && npm run test

# ✅
npm run build; npm run test
```
