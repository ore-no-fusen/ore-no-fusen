# リリース依存の維持方針

2026-11-14：Vite・zipの自動セキュリティ更新が親依存の制約で解決できなかったため、次の最小範囲で更新する。警告のdismissやCIの除外では解消しない。

表1：今回の依存更新範囲。

| 対象 | 更新方針 |
|---|---|
| PC更新プラグイン | Rust/JS updater 2.14.1以上と必要なTauri 2.12系へ揃える。zipはlockfileで修正版9系へ解決する。Rust最低版は1.90。Store更新方式はStoreContextを維持する。 |
| 公開ガイド・設計書 | 安定VitePress 1.6.4を維持し、npm overridesでVite 6.4.5へ固定する。VitePress 2のalpha移行とMermaidプラグインのpeer範囲変更を避け、両サイトのビルド・リンクと実表示で互換性を確認する。上流が修正版Viteへ対応したらoverrideの除去を再検討する。 |
| アプリの試験環境 | Vite 7系は7.3.8へ固定する。アプリの画面・本文保存・同期方式はこの依存指定では変更しない。 |

VitePress 1.6.4の宣言はVite 5系なので、Vite 6のoverrideは互換性検証を必要とする明示的な上書きである。単にインストールできたことを合格としない。更新確認の配布判定失敗時はdesktopへフォールバックせず停止し、Store確認失敗時にも旧更新プラグインを呼ばない。

確認するものは、解決後の依存ツリー・対象Vite監査、Store/desktop/不明の更新分岐、Windows配布判定、文書ビルド/リンク/図、全適用PR CI、新Dev MSIXの起動/保存/再起動/トレイ/ショートカット/QLである。既存exeの合格を更新後exeへ転用しない。

一次資料：[Tauri updater 2.14.1](https://github.com/tauri-apps/plugins-workspace/releases/tag/updater-v2.14.1)、[updater依存](https://crates.io/api/v1/crates/tauri-plugin-updater/2.14.1/dependencies)、[VitePress 1.6.4公開メタデータ](https://registry.npmjs.org/vitepress/1.6.4)、[npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides)。
