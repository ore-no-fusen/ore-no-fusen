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

    G --> REL["リリースしたくなったら\nClaudeに「リリースして」と伝える"]

    subgraph cmd [Claude が .claude/skills/do-release.md を読んで実行]
        R1["新バージョンをユーザーに確認"]
        R2["3ファイルを一括更新\npackage.json\ntauri.conf.json\nCargo.toml"]
        R3["git commit\nchore: バージョンを vX.X.X に更新"]
        R4["git tag vX.X.X"]
        R5["git push origin main"]
        R6["git push origin vX.X.X\n※--tags は使わない"]
        R1 --> R2 --> R3 --> R4 --> R5 --> R6
    end
    REL --- cmd

    R6 --> J[GitHub Actions 起動]

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

## ローカルビルド（動作確認用・署名なし）

```bash
npm run tauri build
```

> Windowsが「発行元不明」と警告を出すが動作確認には使える。配布には使わない。

## 正式リリース（署名付き）

Claude に「リリースして」と伝えるだけ。

Claude が `.claude/skills/do-release.md` を読んで以下を自動実行する：
1. 新バージョンをユーザーに確認
2. 3ファイルのバージョンを一括更新
3. バージョン更新コミット
4. タグ作成・push

GitHub Actionsが自動でビルド・署名・リリースを行う（所要時間：15〜25分）。

## ⚠️ 注意事項

### タグは必ず単体でプッシュする（do-release.md の手順が自動で守る）

```bash
# ❌ NG: --tags はローカルの未プッシュタグを全部送るため、複数タグ同時プッシュになり
#         GitHub Actions が正しくトリガーされないことがある
git push origin main --tags

# ✅ OK: タグは個別にプッシュする（/release はこの順序で実行する）
git push origin main
git push origin vX.X.X
```

### リリースは手動で作らない

`gh release create` や GitHub Web UI でリリースを手動作成しないこと。
`tauri-action` がビルド完了後に自動でリリースとインストーラーを作成する。
手動作成すると競合して CD が失敗する。
