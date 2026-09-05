# Phase 22: しまった付箋の選択復元 - Context

**Gathered:** 2026-09-05
**Status:** Ready for planning
**Source:** User exploration in Codex session

<domain>
## Phase Boundary

タスクトレイから専用画面を開き、`Archive/` と `tags/<tag>/` にしまった通常付箋を選択して、データ保存先直下へ安全に戻す。既存の汎用インポートは残し、結晶フォルダ・Trash・外部フォルダの復元は対象にしない。

</domain>

<decisions>
## Implementation Decisions

### 入口
- D-01: タスクトレイの右クリックメニューに「📤 しまった付箋を取り出す」を追加する。
- メニュー選択時はメインウィンドウを専用の復元画面として表示する。

### 一覧と選択
- D-02: `Archive` と各タグフォルダを横断して一覧表示する。
- 「すべて」「Archive」「タグ名」で絞り込める。
- 付箋名と本文冒頭を文字検索できる。
- チェックボックスで複数選択し、最後に「N枚を取り出す」を押す。

### 復元の意味
- D-03: 復元はコピーではなく移動とする。
- 成功した付箋は元のしまったフォルダから削除する。
- 関連画像も失わず保存先直下の `assets/` で参照できる状態へ戻す。

### 衝突時の安全性
- D-04: 保存先直下に同名のMarkdownがある場合は上書きしない。
- 衝突した項目だけを失敗とし、衝突しない選択項目は復元を継続する。
- 完了画面で成功・失敗と理由を表示する。

### 即時表示
- D-05: 成功した付箋は再起動せずデスクトップへ表示する。
- 既存の付箋一覧再同期・取り込み付箋表示イベントを再利用する。

### the agent's Discretion
- 一覧行の厳密な寸法、空状態・読込中表示、検索の部分一致実装。
- Rustの戻り値型と内部ヘルパーの分割。ただし部分成功と項目別エラーを表現できること。

</decisions>

<canonical_refs>
## Canonical References

### PCの保存・画面仕様
- `docs-v2/002_PC.md` — §5.3、§6.1〜6.3、§7のアーカイブ、タスクトレイ、データ保護仕様
- `docs-v2/000_REQUIREMENTS.md` — §5.3の不要メモ整理要求

### 現行実装
- `src-tauri/src/tray.rs` — トレイメニュー生成とイベント処理
- `src-tauri/src/lib.rs` — `fusen_archive_note`、Tauriコマンド登録、状態更新
- `src-tauri/src/storage.rs` — 関連画像のコピー・削除とフォルダ処理
- `app/page.tsx` — メインウィンドウの検索・設定画面遷移と付箋即時表示
- `components/ui/settings-page.tsx` — 現行フォルダインポートUI
- `app/utils/importRefresh.ts` — 一覧再同期と取り込んだ付箋の表示イベント

</canonical_refs>

<specifics>
## Specific Ideas

画面は上部に検索欄、次に保存場所フィルター、中央にチェック可能な付箋一覧、下部に「キャンセル」「N枚を取り出す」を置く。付箋行にはタイトル、本文冒頭、しまった場所を表示する。

</specifics>

<deferred>
## Deferred Ideas

- 一覧から本文を編集する機能
- Trash、Recipes、QA、Termsからの復元
- 外部フォルダを選ぶ汎用インポートの置き換え
- 同名ファイルの上書き、改名、内容マージ

</deferred>

---

*Phase: 22-archive-restore*
*Context gathered: 2026-09-05*
