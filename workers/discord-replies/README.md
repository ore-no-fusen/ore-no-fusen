# Discord返信のサーバー取り込み

作者PCを経由せず、Cloudflare Cronから約1分ごとに本番の取り込みAPIを呼ぶ。
ユーザーの既存Store版は会話APIを読むので、このWorkerの有効化にアプリ更新は不要。
これは定期確認であり、即時プッシュではない。

- 本番宛先はコードで固定。secretを別のURLへ転送しない。
- 公開HTTPトリガーなし。Durable Objectの1個の実体で取り込みを直列化。
- 確認済みIDはサーバーに永続保存。成功して新しいIDがある時だけ更新。
- 失敗時は確認位置を保持し、5分後に再試行。ログに本文やsecretを出さない。
- 初回は既存APIの直近50件。古い未達会話の復旧をこの初回確認だけで保証しない。

## 確認と有効化

```powershell
node --test src/index.test.mjs
wrangler deploy --dry-run --outdir .build
```

本番有効化は、管理用secretをCloudflareに保存する許可と対象アカウントの確認後に行う。
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
