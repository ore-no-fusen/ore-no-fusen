# リリース手順

## バージョンの仕組み

### 更新が必要なファイル（2つだけ）

| ファイル | ビルドシステム | 役割 |
|---------|--------------|------|
| `package.json` | npm（Node.js） | JS/React側のパッケージ定義 |
| `src-tauri/Cargo.toml` | Cargo（Rust） | Rust側のパッケージ定義 |

2つのビルドシステム（Node.jsとRust）が共存するTauriアプリの構造上、それぞれに1つずつ必要。これ以上減らすことはできない。

### 自動追従するもの（更新不要）

| ファイル | 仕組み |
|---------|-------|
| `src-tauri/tauri.conf.json` | `version` フィールドなし。Tauriがビルド时に `Cargo.toml` から自動取得 |
| `package-lock.json` | `npm install --package-lock-only` で `package.json` に追従 |
| ランディングページ | `next.config.mjs` がビルド時に `package.json` を読み `NEXT_PUBLIC_APP_VERSION` にセット |

---

## バージョン番号の規則

セマンティックバージョニング（SemVer）を使用する。

```
MAJOR.MINOR.PATCH
```

| 種別 | 基準 | 例 |
|------|------|----|
| PATCH | バグ修正 | 2.8.0 → 2.8.1 |
| MINOR | 後方互換のある機能追加 | 2.8.0 → 2.9.0 |
| MAJOR | 互換性のない大きな変更 | 2.8.0 → 3.0.0 |

---

## 開発からリリースまでの流れ

```mermaid
flowchart TD
    subgraph legend [凡例]
        L1["① 人間が実施"]
        L2["➊ 機械が自動実施"]
    end
    style L2 fill:#fefece,stroke:#aaaa33,color:#333333
    style legend fill:#ffffff,stroke:#999999
    style H1 fill:#fefece,stroke:#aaaa33,color:#333333
    style H2 fill:#fefece,stroke:#aaaa33,color:#333333
    style H3 fill:#fefece,stroke:#aaaa33,color:#333333
    style R1 fill:#fefece,stroke:#aaaa33,color:#333333
    style R2 fill:#fefece,stroke:#aaaa33,color:#333333
    style R3 fill:#fefece,stroke:#aaaa33,color:#333333
    style R4 fill:#fefece,stroke:#aaaa33,color:#333333
    style R5 fill:#fefece,stroke:#aaaa33,color:#333333
    style R6 fill:#fefece,stroke:#aaaa33,color:#333333
    style J1 fill:#fefece,stroke:#aaaa33,color:#333333
    style J2 fill:#fefece,stroke:#aaaa33,color:#333333
    style J3 fill:#fefece,stroke:#aaaa33,color:#333333
    style J4 fill:#fefece,stroke:#aaaa33,color:#333333
    style J5 fill:#fefece,stroke:#aaaa33,color:#333333
    style D1 fill:#fefece,stroke:#aaaa33,color:#333333
    style D2 fill:#fefece,stroke:#aaaa33,color:#333333
    style D3 fill:#fefece,stroke:#aaaa33,color:#333333

    A["① ソース修正<br/>（develop ブランチで）"]
    A --> CM["② git commit"]

    subgraph hook [Husky: pre-commit]
        H1["➊ TypeScript型チェック<br/>tsc --noEmit"]
        H2["➋ Vitest 単体テスト"]
        H3["➌ Playwright E2Eテスト"]
        H1 --> H2 --> H3
    end
    CM --- hook

    hook -->|失敗| HF["❌ コミット中断 → ①に戻る"]
    hook -->|成功| B2["③ git push origin develop"]
    B2 --> B3["④ iPhone で動作確認<br/>Vercel Preview URL を Safari で開く"]
    B3 --> C2{問題あり?}
    C2 -->|あり| RF["→ ①に戻る"]
    C2 -->|なし| B["⑤ ローカルビルドで動作確認<br/>npm run tauri build"]
    B --> C{問題あり?}
    C -->|あり| RF2["→ ①に戻る"]
    C -->|なし| REL["⑥ GitHub Actions「Do Release」を実行<br/>新バージョンを入力して Run workflow"]

    subgraph do_release [GitHub Actions: do-release.yml]
        R1["➍ develop → main マージ"]
        R2["➎ 2ファイルを一括更新<br/>package.json / Cargo.toml"]
        R3["➏ package-lock.json 更新"]
        R4["➐ git commit & push"]
        R5["➑ git tag vX.X.X & push"]
        R6["➒ main → develop 戻し"]
        R1 --> R2 --> R3 --> R4 --> R5 --> R6
    end
    REL --- do_release

    subgraph actions [GitHub Actions: release.yml]
        J1["➓ npm ci"]
        J2["⓫ Rustツールチェーン準備"]
        J3["⓬ tauri-action<br/>Next.jsビルド + Rustビルド"]
        J4["⓭ インストーラー署名"]
        J5["⓮ GitHubリリース作成"]
        J1 --> J2 --> J3 --> J4 --> J5
    end
    R5 --- actions

    J5 --> K["✅ GitHubリリースページに<br/>署名付きインストーラーが出現"]

    subgraph docs_deploy [GitHub Actions: docs.yml]
        D1["⓯ docs-v2/ の変更を検知"]
        D2["⓰ VitePress ビルド"]
        D3["⓱ GitHub Pages にデプロイ"]
        D1 --> D2 --> D3
    end
    REL -.->|docs-v2/** の変更がある場合| docs_deploy
    D3 -.-> DK["✅ ドキュメントサイト更新"]
```

---

## ローカルビルド（動作確認用・署名なし）

```bash
npm run tauri build
```

> Windowsが「発行元不明」と警告を出すが動作確認には使える。配布には使わない。

---

## ⚠️ 注意事項

### タグは Actions が単体でプッシュする（手動でやらない）

```bash
# ❌ NG: 絶対にやってはいけない
git push origin main --tags
```

**なぜダメか（実際に起きた事故）:**
- `--tags` はローカルに溜まっている**未プッシュのタグを全部まとめて**送る
- 過去タグが残っていると複数タグが同時にプッシュされる
- GitHub Actions がタグの数だけ起動し、それぞれ異なるコミットでビルドが走る
- 結果: 1つのリリースに複数バージョンのインストーラーが混在し、リリースが壊れる
- → **v1.1.6 でこれが発生。リリースを削除して v1.1.7 を作り直すことになった**

### リリースは手動で作らない

`gh release create` や GitHub Web UI でリリースを手動作成しないこと。
`tauri-action` がビルド完了後に自動でリリースとインストーラーを作成する。
手動作成すると競合して CD が失敗する。
