# Phase 6: iPhone送信UI - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

iPhoneのviewer画面（Next.js PWA）にテキスト・画像・Mermaidの作成と送信機能を追加する。
Drive経由でPCに送るか下書きとして保存でき、履歴で確認できる。
PC受信（Phase 7）は対象外。

</domain>

<decisions>
## Implementation Decisions

### ステップ構成・フロー

- **readyステップを廃止** — writeがホーム画面になる
- **ステップ型に追加**: `'write'` と `'list'`（既存: banner / login / push / note は変更しない）
- PWAアイコンタップ → ログイン済みなら即 `write`（新規作成画面）
- 初回: login → push → write
- `note`「消す」後 → `write`（iOSのPWAはwindow.closeが使えないため。余分な画面は出さない）

### 書く画面（writeステップ）

- タイトル欄あり（1行テキスト、任意入力）
- 本文テキストエリアは画面の大半（約70%）
- レイアウト（上から順）:
  1. ヘッダー: 左に「📋 履歴」ボタン、中央に「書く」
  2. タイトル入力欄（1行）
  3. 本文テキストエリア（大半）
  4. 添付ツールバー: 📷（画像）、「Mermaid」ボタン
  5. アクションボタン行: 「iPhoneに置いておく」（左）、「PCに送る」（右・青）
- 「キャンセル」ボタンなし（readyが廃止されたため戻り先がない）
- 送信中: 「PCに送る」ボタンを「送信中...」にして無効化
- 「PCに送る」成功後: 入力欄をクリアして write に留まる（成功メッセージ表示）
- 「iPhoneに置いておく」後: 下書き保存 → list に遷移

### 添付機能

- 📷 ボタン: iOS標準のカメラ/ライブラリ選択シートを出す（`<input type="file" accept="image/*" capture>`）
- 画像選択後: Canvas APIでリサイズ → base64 → カーソル位置に `![](data:...)` として挿入
- Mermaid ボタン: モーダル（全画面）で入力
  - コード入力欄 + 「プレビュー」ボタン（押したときのみSVG描画）
  - 「挿入」で ` ```mermaid\n...\n``` ` ブロックとして本文のカーソル位置に挿入

### 履歴画面（listステップ）

- 最新10件表示（要件: HIST-01）
- 1件あたりの表示: sent/draftバッジ + タイムスタンプ（相対時刻）+ 本文冒頭テキスト（約20文字）
- 下書き（draft）タップ → write に遷移して編集再開（HIST-02）
- 送信済み（sent）タップ → 何もしない（参照のみ、操作不要）
- ヘッダー左に「← 戻る」→ write に戻る

### Mermaidレンダリング（viewerでの表示）

- viewer内で ` ```mermaid ` コードブロックを検出してSVG描画（REND-01）
- `mermaid@^11.12.3` を dynamic import で使用（既存パッケージ、新規追加なし）
- SimpleNoteBody.tsx を拡張してMermaidブロックを処理する

### Claude's Discretion

- 添付ツールバーのアイコンデザイン・サイズ
- Mermaidモーダルのサイズ・閉じるボタンの位置
- 送信成功メッセージの表示方法（トースト等）
- Mermaidプレビューエラー時のエラー表示
- 冒頭テキストの文字数（約20文字の±調整）

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `uploadToDrive(accessToken, fileName, data)` — Drive へのJSON書き込み（既実装）。`fusen_from_iphone.json` と `fusen_iphone_notes.json` の送信に使用
- `downloadFromDrive(accessToken, fileName)` — DriveからのJSON読み込み（既実装）。履歴取得に使用
- `refreshAccessToken()` — アクセストークン自動更新（既実装）
- `SimpleNoteBody.tsx` — Markdown画像（`![](data:...)`）の描画に対応済み。Mermaidブロック対応を追加する
- `step` state + Tailwind + 青ボタンパターン — 既存スタイルに統一する

### Established Patterns

- ステップ管理: `useState<'banner' | 'login' | 'push' | 'ready' | 'note'>('banner')` → `'write'` と `'list'` を追加
- Drive通信: multipart FormData で JSON をアップロード
- エラー表示: `setErrorMessage` + `<p className="text-red-600 text-sm">`
- ローディング: `setIsLoading(true/false)` + ボタンの `disabled={isLoading}`

### Integration Points

- `viewer/page.tsx` — ステップ型拡張とwrite/listの描画を追加
- `viewer/SimpleNoteBody.tsx` — Mermaidブロック検出・SVG描画を追加
- Drive上のファイル: `fusen_from_iphone.json`（PC宛送信）、`fusen_iphone_notes.json`（履歴）

</code_context>

<specifics>
## Specific Ideas

- 「書く」画面がホーム。PWAアイコンを押したら即メモが書ける
- 「消す」（note）後はiOS制約によりwrite画面に戻る。特別な案内画面は出さない
- 送信済みの履歴はタップしても何も起きない（操作させない）
- Mermaidプレビューはボタンを押したときだけ（リアルタイムは不要）

</specifics>

<deferred>
## Deferred Ideas

なし — 議論はPhase 6のスコープ内に収まった

</deferred>

---

*Phase: 06-iphone-send-ui*
*Context gathered: 2026-03-29*
