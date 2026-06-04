# 開発者とのやりとり: 右クリック新着表示 実装計画

作成日: 26-06-04

## 目的

開発者から未読返信がある場合、付箋の右クリックメニュー上でユーザーに気づけるようにする。
右クリック時は通信せず、PCアプリがローカルに保存した未読状態だけを参照する。

## 仕様

- Vercel Cron は JST 3:00 に Discord 返信を Firestore へ取り込む。
- PCアプリは JST 4:00 以降に1日1回だけ `conversation/poll` を呼ぶ。
- 未読の開発者返信があれば、ローカルに `has_unread_developer_reply=true` を保存する。
- 右クリックメニューはローカル状態だけを読み、未読ありなら `● 新着あり` を表示する。
- 「開発者とのやりとり」画面を開いたら最新メッセージを取得し、表示できた開発者返信を `conversation/ack` で既読化する。
- 開発者専用エリアに、検証用の「未読チェック実行」ボタンを置く。このボタンは未読状態だけ更新し、既読化はしない。

## 修正場所

- `app/utils/feedbackConversation.ts`
  - 会話ID取得、未読状態、JST 4:00 日次判定、poll/ack helper を追加する。
- `app/hooks/useFeedbackConversationUnreadCheck.ts`
  - メインウィンドウだけで日次未読チェックを実行する。
- `app/page.tsx`
  - メインウィンドウに未読チェック hook を接続する。
- `app/hooks/useStickyNoteContextMenu.ts`
  - 右クリックメニュー文言をローカル未読状態で切り替える。
- `components/ui/settings-page.tsx`
  - 会話表示時の既読化と、開発者専用の手動未読チェックを追加する。
- `docs-v2/002_PC.md` / `docs-v2/007_COMMUNICATION.md`
  - 仕様として、日次確認、右クリック表示、既読化、手動未読チェックを反映する。

## テスト方針

Codex が実施する:

- `npx tsc --noEmit --pretty false`
- `npm test -- feedbackConversation`
- `npm test`
- `npm run lint`
- `npm run build`
- `docs-v2` の `npm run docs:build`

ユーザーが実施する:

- Discord 返信を取り込む。
- 管理者ツールの「未読チェック実行」を押す。
- 右クリックメニューに `● 新着あり` が出ることを確認する。
- 「開発者とのやりとり」を開き、返信が表示されることを確認する。
- 開いた後に右クリックメニューから `● 新着あり` が消えることを確認する。

## 影響範囲

- 付箋右クリックメニューの表示文言。
- 開発者とのやりとり画面の poll/ack 処理。
- PCローカルの `localStorage` に保存する会話補助情報。
- 開発者専用の管理者ツール表示。

iPhone連携、Discord取り込みロジック、Firestore の既存データ構造、Vercel Cron のスケジュールには影響しない。
