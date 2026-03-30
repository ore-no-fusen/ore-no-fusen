---
phase: 07-pc-receive
plan: 02
subsystem: api
tags: [google-drive, rust, tauri, image-upload, binary-download, regex]

# Dependency graph
requires:
  - phase: 07-01
    provides: fusen:note_from_iphone listen handler と polling loop
provides:
  - viewer/page.tsx: 画像を Drive ファイルとしてアップロードし body にファイル名参照を格納
  - gdrive.rs: download_binary 関数でバイナリファイルを Drive からダウンロード
  - lib.rs: fusen_download_iphone_images コマンドで body の画像参照をローカル絶対パスに解決
affects: [08-pc-receive-verify, future image handling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drive画像分離: JSON本体に base64 を埋め込まず Drive に独立ファイルとして保存、body にはファイル名参照のみ格納"
    - "画像冪等ダウンロード: local_path.exists() チェックで再ダウンロードをスキップ"
    - "Rust regex キャプチャ: captures_iter + HashSet で重複排除してファイル名リストを構築"

key-files:
  created: []
  modified:
    - app/viewer/page.tsx
    - src-tauri/src/gdrive.rs
    - src-tauri/src/lib.rs
    - app/page.tsx

key-decisions:
  - "uploadImageToDrive はフォルダID取得後に multipart POST で Drive にアップロード（uploadToDrive と同パターン）"
  - "download_binary は download_json と同じ Drive 全体検索（fusen_img_{timestamp} はタイムスタンプ一意のため親フォルダ限定不要）"
  - "画像ダウンロード失敗時はエラーをログに残して継続（致命的エラーにしない）"
  - "resizeImageToBase64 は送信フローから除去（import も削除）"

patterns-established:
  - "Drive binary upload: FormData multipart POST with metadata Blob + file Blob"
  - "Idempotent download: check local file existence before Drive call"

requirements-completed: [POLL-02]

# Metrics
duration: 25min
completed: 2026-03-30
---

# Phase 7 Plan 02: Drive画像ファイル分離（iPhone送信→PC受信） Summary

**iPhone画像を base64 埋め込みではなく Drive 独立ファイルとして管理し、PC受信時に {folderPath}/images/ にローカル保存してから付箋に絶対パスで表示する**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-30T09:00:00Z
- **Completed:** 2026-03-30T09:25:00Z
- **Tasks:** 2 (+ 1 checkpoint)
- **Files modified:** 4

## Accomplishments
- viewer/page.tsx: `uploadImageToDrive` / `uploadImageWithAutoRefresh` を追加し、画像選択時に Drive へバイナリアップロード
- viewer/page.tsx: サムネイル表示をファイル名テキストに変更、body 生成をファイル名参照に変更
- gdrive.rs: `download_binary` 関数を追加（`download_json` と同パターン、bytes() で返す）
- lib.rs: `fusen_download_iphone_images` コマンドを追加（regex で fusen_img_* を検出 → Drive download → local save → body 書き換え）
- app/page.tsx: fusen:note_from_iphone handler を `fusen_download_iphone_images` → `fusen_save_note` の順序に変更

## Task Commits

1. **タスクA: iPhone側の画像アップロード方式を Drive ファイルに変更** - `e07bb41` (feat)
2. **タスクB: Rust 側の download_binary と fusen_download_iphone_images 実装** - `6dd86c6` (feat)

## Files Created/Modified
- `app/viewer/page.tsx` - uploadImageToDrive/uploadImageWithAutoRefresh 追加、画像選択ハンドラ変更、サムネイル変更、fullBody 変更
- `src-tauri/src/gdrive.rs` - download_binary 関数を追加
- `src-tauri/src/lib.rs` - fusen_download_iphone_images コマンド追加・登録
- `app/page.tsx` - fusen:note_from_iphone ハンドラで fusen_download_iphone_images を invoke

## Decisions Made
- `resizeImageToBase64` は送信フローから完全除去（import も削除）。`fusen_img_{Date.now()}.jpg` のファイル名生成のみで十分
- `Cargo.toml` の `regex = "1"` は既存のため B-0 ステップはスキップ
- 画像ダウンロード失敗は致命的エラーとせずログのみ（付箋は表示エラーになるが作成は完了）

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- タスクA・B の実装とコンパイル確認（`cargo check` + `npx tsc --noEmit` 両方エラーゼロ）完了
- タスクC（実機確認チェックポイント）が pending — iPhone から画像付きノートを送信して PC 受信を確認する必要あり
- チェックポイント通過後、Phase 7 完了となる

---
*Phase: 07-pc-receive*
*Completed: 2026-03-30*
