# アラーム機能 実装進捗

## ステータス一覧

| # | タスク | ファイル | 状態 |
|---|--------|---------|------|
| 1 | i18n キー追加（ja/en） | `lib/i18n.ts` | ✅ 完了 |
| 2 | AlarmDialog 新規作成（相対タブ・日時指定タブ・通知音） | `app/components/AlarmDialog.tsx` | ✅ 完了 |
| 3 | 右クリックメニューに追加 | `app/hooks/useStickyNoteContextMenu.ts` | ✅ 完了 |
| 4 | 点滅アニメCSS追加 | `app/globals.css` | ✅ 完了 |
| 5 | StickyNote: state・setInterval・発火ロジック | `app/components/StickyNote.tsx` | ✅ 完了 |
| 6 | StickyNote: ⏰アイコン＋ツールチップ | `app/components/StickyNote.tsx` | ✅ 完了 |
| 7 | StickyNote: 点滅バー＋停止ボタン | `app/components/StickyNote.tsx` | ✅ 完了 |
| 8 | StickyNote: 最前面制御（発火時ON・停止時復元） | `app/components/StickyNote.tsx` | ✅ 完了 |
| 9 | E2Eテスト追加 | `tests/` | ⏳ 未着手 |
| 10 | 動作確認・デグレチェック | — | ⏳ 未着手 |
| 11 | バージョン v1.2.2 に更新 | `tauri.conf.json` 等 | ✅ 完了 |

## 凡例
- ⏳ 未着手
- 🔧 作業中
- ✅ 完了
- ❌ 問題あり
