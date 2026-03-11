# リリース手順

## 開発からリリースまでの流れ

```mermaid
flowchart TD
    A[ソース修正] --> B[ローカルビルドで動作確認\nnpm run tauri build]
    B --> C{問題あり?}
    C -->|あり| A
    C -->|なし| D[git commit]
    D --> E{pre-commit hook\nHusky}

    subgraph hook [pre-commit で自動実行]
        E1[Vitest\n単体テスト]
        E2[Playwright\nE2Eテスト]
        E1 --> E2
    end
    E --- hook

    E -->|失敗| F[❌ コミット中断\n修正して再挑戦]
    F --> A
    E -->|成功| G[✅ コミット完了]

    G --> H[バージョン番号を更新\npackage.json\nsrc-tauri/tauri.conf.json\nsrc-tauri/Cargo.toml]
    H --> I["git commit\ngit tag vX.X.X\ngit push origin main\ngit push origin vX.X.X"]
    I --> WARN["⚠️ 注意\n・--tags は使わない\n  複数タグ同時プッシュでCDが起動しないことがある\n・gh release create は使わない\n  tauri-actionが自動で作成する"]
    WARN --> J[GitHub Actions 起動]

    style WARN fill:#fff3cd,stroke:#f0ad4e,color:#333

    subgraph actions [GitHub Actions: release.yml]
        J1[npm ci]
        J2[Rustツールチェーン準備]
        J3[tauri-action\nNext.jsビルド + Rustビルド]
        J4[インストーラー署名]
        J5[GitHubリリース作成]
        J1 --> J2 --> J3 --> J4 --> J5
    end
    J --- actions

    J5 --> K[✅ GitHubリリースページに\n署名付きインストーラーが出現]
```

## バージョン更新ファイル

| ファイル | 場所 |
|------|------|
| `package.json` | `"version": "x.x.x"` |
| `src-tauri/tauri.conf.json` | `"version": "x.x.x"` |

## ローカルビルド（動作確認用・署名なし）

```bash
npm run tauri build
```

> Windowsが「発行元不明」と警告を出すが動作確認には使える。配布には使わない。

## 正式リリース（署名付き）

```bash
# バージョン更新後
git commit -m "chore: バージョンを vX.X.X に更新"
git tag vX.X.X
git push origin main
git push origin vX.X.X
```

GitHub Actionsが自動でビルド・署名・リリースを行う（所要時間：15〜25分）。

## ⚠️ 注意事項

### タグは必ず単体でプッシュする

```bash
# ❌ NG: --tags はローカルの未プッシュタグを全部送るため、複数タグ同時プッシュになり
#         GitHub Actions が正しくトリガーされないことがある
git push origin main --tags

# ✅ OK: タグは個別にプッシュする
git push origin main
git push origin vX.X.X
```

### リリースは手動で作らない

`gh release create` や GitHub Web UI でリリースを手動作成しないこと。
`tauri-action` がビルド完了後に自動でリリースとインストーラーを作成する。
手動作成すると競合して CD が失敗する。
