# Phase 21 Validation Strategy

## 自動化するもの

- 全既存テスト、型検査、lint、Web/設計書build
- MSIX manifest、version、architecture、capability、asset、署名状態
- CI artifact数と名前、Store提出workflowのartifact接続
- 旧配布文言・URL・wingetコマンドの残存検索
- package identityあり/なしの分岐と設定画面状態
- LPの上下CTA、Store URL、wingetコピー、日英文言、JSON-LD、metadata
- Next.js buildとLP/use-caseページの静的生成
- GitHub downloadバッジ、リンク、旧累計表示の残存・注記検査

## 実機でしか確認できないもの

- Store署名、認定、段階配信、更新反映
- StartupTaskとWindows設定の`DisabledByUser`
- 旧MSI/NSIS/community wingetからの移行
- 単一起動、保存先アクセス、アンインストール後のデータ
- winget `msstore` sourceの導入・upgrade挙動
- 公開LPからStore商品ページを経由した実インストール
- Partner CenterのAcquisitionsレポートで取得数とインストール数が計上されること

## 必須証跡

- CI run URLとartifact一覧
- Partner Center submission IDと結果
- 検証した旧版/新版version、Windows version、導入経路
- 移行前後の設定・付箋・画像件数
- StartupTask各状態のスクリーンショットまたはログ
- winget install/upgrade出力

## 失敗時の扱い

データ損失、Store更新不能、旧版との恒久的競合、StartupTask設定不能のいずれかがあれば一般公開しない。MSI/NSIS停止は延期し、原因修正後にマトリクスを再実行する。
