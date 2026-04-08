# Phase 13: ロック画面コントロール基盤 - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

iPhoneの一覧から任意のメモをタップひとつでロック画面（通知）に表示・解除できる基盤を作る。
Service Worker の `showNotification()` を使い、通知タグ `fusen-lock-<noteId>` で複数メモを独立した通知として管理する。
ロック状態は IndexedDB に永続化し、アプリ再起動後も復元できる。

変更ファイル: `app/viewer/page.tsx` 主体（SW メッセージは既存の `GET_NOTIFICATIONS` / `CLOSE_NOTIFICATION` を流用）。エディタヘッダーへのボタン追加は Phase 14 スコープ。

</domain>

<decisions>
## Implementation Decisions

### 🔔ボタンの配置
- 一覧の各メモカード右カラムに、既存の🗑️ボタンの左隣に🔔を横並びで配置
- 🔔🗑️の横並びを全メモに対して常時表示（draft / sent / received_pc を問わず）

### 🔔ON/OFF ビジュアル
- OFF（未ロック）: 🔔 グレー（`text-gray-400`）
- ON（ロック中）: 🔔 青色強調（`text-blue-500`）
- タップで即座に切り替わる（楽観的UI更新）

### ロック画面通知の内容
- 通知タイトル: メモの先頭行（`#` 見出しまたは最初の行）を使用
- 通知 body: タイトル行を除いた本文の先頭40文字
- 無題メモ（本文のみ）: 本文先頭20文字を通知タイトルとして使用、body は残りの先頭40文字
- 通知タグ: `fusen-lock-<noteId>`（PC受信通知の `fusen-<id>` と衝突しない）

### ロック状態の永続化
- `DraftRecord` 型に `locked?: true` フィールドを追加
- ロック時: `saveDraft({ ...existing, locked: true })`、解除時: `saveDraft({ ...existing, locked: undefined })`
- DB バージョンアップ不要（既存スキーマへの追加のみ）
- メモ削除時は既存の `deleteDraft()` でロック状態も自動消去される

### 通知権限フロー
- `Notification.requestPermission()` は初回🔔タップ時にのみ呼ぶ
- 権限が既に `'granted'` の場合はスキップ
- 権限が `'denied'` または拒否された場合: エラートースト「通知権限が必要です。設定から有効にしてください」を表示
- 権限リクエスト中は🔔ボタンを一時的に disabled にする

### 起動時の復元（LOCK-05）
- `step === 'list'` に遷移したときの既存 `useEffect` 内で、`loadAllDrafts()` の結果から `locked === true` のメモを抽出
- 各ロック中メモに対して `showNotification()` を再発火（通知が消えていた場合に再表示）
- 通知がすでに存在する場合は上書き（同一タグで `showNotification` すれば自動的に置き換わる）

### Claude's Discretion
- エラートーストの実装方法（既存の `errorMessage` state を流用するか、新規 state を追加するか）
- 通知 icon / badge の画像パス（既存の `/icon-192.png` を使用）
- ロック状態変化時の `historyNotes` state 更新方法（直接 state 更新か再 loadAllDrafts か）

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `activeNotifIds` state (line 668): `string[]` — 現在アクティブな通知 ID のリスト。ロック中メモのビジュアル状態と組み合わせて使える
- `GET_NOTIFICATIONS` SW メッセージ: 現在の通知 ID 一覧を取得（`step === 'list'` の useEffect で既に使用中）
- `CLOSE_NOTIFICATION` SW メッセージ: タグ指定で通知を閉じる（🔔解除時に使用）
- `saveDraft()` / `loadAllDrafts()` / `loadDraft()`: そのまま流用可能
- `DraftRecord` 型 (line 389): `locked?: true` フィールドを追加するだけ

### Established Patterns
- 🔕ボタン + `e.stopPropagation()` パターン: received_pc メモ向けに実装済み（line 1726〜）。🔔ボタンも同じパターンで実装する
- `navigator.serviceWorker.ready.then((reg) => { reg.active?.postMessage(...) })` パターン: 既存コードに多数あり
- list step の useEffect（line 864〜）: ドラフト読み込みと `GET_NOTIFICATIONS` が両方走る。ここにロック復元ロジックを追加する

### Integration Points
- 一覧カード右カラムのボタン群（line 1725〜）: 🔔を🗑️の左隣に追加する場所
- `DraftRecord` 型定義（line 389）: `locked?: true` を追加
- list step の useEffect（line 864〜）: 起動時ロック復元のトリガー

</code_context>

<specifics>
## Specific Ideas

- 通知タグは PC 受信通知（`fusen-<id>`）と区別するため `fusen-lock-<id>` プレフィックスを使う（STATE.md 確定済み）
- `activeNotifIds` は PC 受信通知向けだが、ロック通知 ID 管理には別 state（例: `lockedNoteIds`）を用意するか、`DraftRecord.locked` を信頼源にする方が整合性が高い
- `showNotification()` は SW の `registration.showNotification()` を使う（`new Notification()` はモバイルでは動作しない）
- ロック通知のアイコン: `/icon-192.png`（既存の push 通知と同じ）

</specifics>

<deferred>
## Deferred Ideas

- EXT-01（本文N文字のリッチ通知）— v2 スコープとして据え置き（今回は先頭40文字を body に含めることで実質的に対応済み）
- EXT-02（通知タップでPWAを開いてメモにジャンプ）— Phase 14 以降
- エディタヘッダーへの🔔ボタン追加 — Phase 14（EDIT-01, EDIT-02）スコープ

</deferred>

---

*Phase: 13-rokku-gamen-kontororu-kiban*
*Context gathered: 2026-04-09*
