# ore-no-fusen バージョン管理

ore-no-fusenのバージョンは、以下のファイルで管理されています。

---

## バージョン管理ファイル

ore-no-fusenのバージョンを更新する際は、以下の**4つのファイル**を更新する必要があります:

| ファイル | 場所 | 役割 |
|---------|------|------|
| [`package.json`](file:///d:/Users/uck/Documents/curry-project/ore-no-fusen/package.json) | 3行目 | Node.jsプロジェクトのバージョン |
| [`src-tauri/tauri.conf.json`](file:///d:/Users/uck/Documents/curry-project/ore-no-fusen/src-tauri/tauri.conf.json) | 4行目 | Tauriアプリのバージョン（ファイルバージョン） |
| [`src-tauri/Cargo.toml`](file:///d:/Users/uck/Documents/curry-project/ore-no-fusen/src-tauri/Cargo.toml) | 3行目 | Rustパッケージのバージョン（**製品バージョン**） |
| `package-lock.json` | - | 依存関係のロック（`npm install --package-lock-only`で自動更新） |

> **重要**: `getVersion()` APIは、**`Cargo.toml`のバージョン**を返します!

---

## バージョン更新方法

### 自動更新スクリプト（推奨）

ore-no-fusenには、バージョンを一括更新するスクリプトが用意されています。

#### 使い方

```powershell
# 新しいバージョンを指定して実行
.\update-version.ps1 -NewVersion "0.1.5"
```

#### スクリプトが実行する処理

1. `package.json`のバージョンを更新
2. `src-tauri/tauri.conf.json`のバージョンを更新
3. `src-tauri/Cargo.toml`のバージョンを更新（[package]セクションのみ）
4. `package-lock.json`を更新（`npm install --package-lock-only`）

#### 出力例

```
🔄 ore-no-fusen バージョン更新スクリプト
新しいバージョン: 0.1.5

📝 package.json を更新中...
   ✅ 0.1.4 → 0.1.5
📝 src-tauri/tauri.conf.json を更新中...
   ✅ 0.1.4 → 0.1.5
📝 src-tauri/Cargo.toml を更新中...
   ✅ 更新完了
📝 package-lock.json を更新中...
   ✅ 更新完了

✨ バージョン更新完了!

次のステップ:
  1. git add .
  2. git commit -m "chore: bump version to 0.1.5"
  3. git tag v0.1.5
  4. npm run tauri build
  5. git push && git push --tags
```

---

## リリース手順

### 1. バージョン更新

```powershell
.\update-version.ps1 -NewVersion "0.1.5"
```

### 2. コミット

```bash
git add .
git commit -m "chore: bump version to 0.1.5"
```

### 3. タグ作成

```bash
git tag v0.1.5
```

### 4. ビルド

```bash
npm run tauri build
```

インストーラーが以下に作成されます:
```
src-tauri\target\release\bundle\nsis\ore-no-fusen_0.1.5_x64-setup.exe
```

### 5. プッシュ

```bash
git push
git push --tags
```

### 6. GitHub Releasesで公開

1. https://github.com/[ユーザー名]/ore-no-fusen/releases/new にアクセス
2. タグ: `v0.1.5` を選択
3. リリースタイトル: `v0.1.5`
4. リリースノートを記入
5. インストーラーをアップロード:
   ```
   src-tauri\target\release\bundle\nsis\ore-no-fusen_0.1.5_x64-setup.exe
   ```
6. 「Publish release」をクリック

---

## バージョン番号の規則

ore-no-fusenは、セマンティックバージョニング（SemVer）を使用します:

```
MAJOR.MINOR.PATCH
```

- **MAJOR**: 互換性のない変更（例: 1.0.0）
- **MINOR**: 後方互換性のある機能追加（例: 0.2.0）
- **PATCH**: 後方互換性のあるバグ修正（例: 0.1.5）

### 例

- `0.1.4` → `0.1.5`: バグ修正
- `0.1.4` → `0.2.0`: 新機能追加
- `0.1.4` → `1.0.0`: 大きな変更（正式リリース）

---

## トラブルシューティング

### スクリプトがエラーになった場合

エラーが発生した場合は、以下のコマンドで変更をロールバックできます:

```powershell
git checkout package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml package-lock.json
```

### 手動更新が必要な場合

スクリプトが使えない場合は、手動で更新してください:

1. `package.json`の3行目: `"version": "0.1.X"`
2. `src-tauri/tauri.conf.json`の4行目: `"version": "0.1.X"`
3. `src-tauri/Cargo.toml`の3行目: `version = "0.1.X"`（[package]セクションのみ）
4. `npm install --package-lock-only`を実行

---

## 参考資料

- [セマンティックバージョニング（SemVer）](https://semver.org/lang/ja/)
- [Tauri公式ドキュメント](https://tauri.app/)
- [Cargo.tomlリファレンス](https://doc.rust-lang.org/cargo/reference/manifest.html)
