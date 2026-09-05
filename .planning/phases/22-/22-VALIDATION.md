# Phase 22 Validation Strategy

## Automated

- `cargo test` — 一覧範囲、パス検証、同名拒否、部分成功、関連画像の安全な移動
- `npx vitest run app/components/ArchivedNotesRestoreDialog.test.tsx app/utils/archiveRestore.test.ts` — 最近5件、保存場所、検索、付箋カード、選択、詳細、結果整形
- `npx playwright test e2e/archive-restore.spec.ts` — トレイイベントから画面表示、復元成功後の即時表示
- `npx tsc --noEmit --pretty false`
- `git diff --check`

## Manual UAT

1. タスクトレイ右クリックから復元画面が開く。
2. 初期画面に、保存場所を横断した最近しまった付箋5件が新しい順で表示される。
3. Archiveとタグが件数付きで並び、選択すると中の付箋がしまった日時の新しい順で表示される。
4. カードに背景色、本文冒頭3行、保存場所、しまった日付が表示される。
5. 画像付き付箋では最初の画像サムネイルが表示され、画像なしでは本文が横いっぱいに表示される。
6. 検索で全保存場所の名前・本文を探せる。
7. カードから本文全体を確認でき、閉じても選択状態が残る。
8. 通常付箋・画像付き付箋をまとめて取り出せる。
9. 復元成功後、元フォルダからMarkdownが消え、データ保存先直下へ移り、デスクトップに表示される。
10. 同名付箋がある項目は上書きされず、同時選択した別項目は復元される。
11. 失敗理由が画面に残り、閉じるまで確認できる。
