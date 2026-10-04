# Discord返信のサーバー取り込み

作者PCを経由せず、Cloudflare Cronから約1分ごとに環境別の取り込みAPIを呼ぶ。
ユーザーの既存Store版は会話APIを読むので、このWorkerの有効化にアプリ更新は不要。
これは定期確認であり、即時プッシュではない。

- 本番と開発の宛先はコードで固定。secretを別のURLへ転送しない。
- 開発は別Worker・別Secret設定・別Durable Object。本番の確認位置を共有しない。
- 開発の取り込み前にPreview APIの環境を確認し、分離未対応のAPIにはPOSTしない。
- 公開HTTPトリガーなし。Durable Objectの1個の実体で取り込みを直列化。
- 確認済みIDはサーバーに永続保存。成功して新しいIDがある時だけ更新。
- 失敗時は確認位置を保持し、5分後に再試行。ログに本文やsecretを出さない。
- 初回は既存APIの直近50件。古い未達会話の復旧をこの初回確認だけで保証しない。

## 開発を先に検証する

1. APIの環境分離修正をローカルで確認し、developへ統合・pushする。
2. develop Previewの下記URLへGETして、405と`environment: "development"`を確認する。
   `https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback/discord/ingest`
3. 開発用Workerだけに管理secretを設定し、`--env development`でデプロイする。
4. 開発版アプリの「開発者とのやりとり」から問い合わせを送る。Discordに「環境: 開発（検証用）」と出た通知へ返信する。会話画面を開いたまま、更新ボタンなしで返信が表示されることを確認する。正常時は目安約2分。

開発の保存先は`feedback_environments/development`配下。本番の既存会話を移動しない。
旧Previewの共有場所の履歴はコピーせず、新しい問い合わせで検証する。
作者PCの手動取り込み・旧自動取り込みを使わずに検証し、本番への混入も確認する。
Cron成功だけを、返信保存・ユーザー画面への表示成功と扱わない。

```powershell
node --test src/index.test.mjs
wrangler deploy --env development --dry-run --outdir .build/development
wrangler secret put FEEDBACK_CONVERSATION_INGEST_SECRET --env development
wrangler deploy --env development
wrangler tail --env development --format json
```

環境を省略すると本番が対象になる。開発検証では必ず`--env development`を付ける。
開発の実往復確認に合格してから本番の変更を行う。

## 本番の確認と有効化

```powershell
node --test src/index.test.mjs
wrangler deploy --dry-run --outdir .build
```

本番有効化は、開発での実往復確認、管理用secretをCloudflareに保存する許可と対象アカウントの確認後に行う。
配布するアプリ、Git、wrangler.tomlにはsecretを書かない。

```powershell
wrangler whoami
wrangler secret put FEEDBACK_CONVERSATION_INGEST_SECRET
wrangler deploy
wrangler tail --format json
```

Cronの反映には最大15分程度かかる場合がある。作者PCの手動取り込みを使わず、
Discordの対象通知への返信が本番の対象会話に保存され、別PCで表示されることを確認する。
合格後、作者PCの旧自動取り込みをオフにする。日次Vercel Cronは予備として残す。

停止・復帰は`wrangler.toml`の`crons = []`へ変更して再デプロイする。
Durable Objectや確認位置を削除しない。必要なら作者PCの既存取り込みを一時的に使い、
原因を解消したら`crons = ["* * * * *"]`を戻す。
