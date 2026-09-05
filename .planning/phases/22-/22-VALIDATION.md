# Phase 22 Validation Strategy

## Automated

- `cargo test` — 一覧範囲、パス検証、同名拒否、部分成功、関連画像の安全な移動
- `npx vitest run app/components/ArchivedNotesRestoreDialog.test.tsx app/utils/archiveRestore.test.ts` — 検索、フィルター、選択、結果整形
- `npx playwright test e2e/archive-restore.spec.ts` — トレイイベントから画面表示、復元成功後の即時表示
- `npx tsc --noEmit --pretty false`
- `git diff --check`

## Manual UAT

1. タスクトレイ右クリックから復元画面が開く。
2. Archiveと異なるタグの付箋が正しい保存場所名で並ぶ。
3. 検索と保存場所フィルターを併用できる。
4. 通常付箋・画像付き付箋をまとめて取り出せる。
5. 復元成功後、元フォルダからMarkdownが消え、データ保存先直下へ移り、デスクトップに表示される。
6. 同名付箋がある項目は上書きされず、同時選択した別項目は復元される。
7. 失敗理由が画面に残り、閉じるまで確認できる。
