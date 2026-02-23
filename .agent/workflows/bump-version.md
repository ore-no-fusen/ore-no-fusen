---
description: バージョンを上げる
---

// turbo-all

まず、ユーザーに新しいバージョン番号を確認する（例: 0.10.3）。

1. update-version.ps1 を使ってバージョンを一括更新する（package.json, tauri.conf.json, Cargo.toml, package-lock.json など）

// turbo
```powershell
.\update-version.ps1 -NewVersion "NEW_VERSION"
```

2. 変更をコミットしてタグを打つ

// turbo
```powershell
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to NEW_VERSION"
git tag vNEW_VERSION
```
