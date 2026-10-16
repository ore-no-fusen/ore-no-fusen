# Discord返信のサーバー取り込み

現在の方式はCloudflare WorkerのCronが約1分ごとにDiscordを確認する定期取り込み。ユーザー画面の確認間隔（表示中は約1分）は別の処理で、この変更では変えない。

この変更案はDiscord Gatewayの新着イベントをDurable Object 1個で受け、返信イベントを環境別APIへ届ける。利用者の右クリック「返信」操作とDiscord側のメッセージ形式はそのまま。Gatewayが受け取るのはID等のメタデータで、本文は各APIがDiscord RESTから取得する。Gatewayは既定で無効。

## 無料枠の運用条件

- CloudflareアカウントはWorkers Free。Durable Objectsの無料枠は13,000 GB-s/日で、超過しても課金ではなく操作が失敗する。
- 確認時点の前日実績は既存の本番・開発Coordinator合計6.72k GB-s/日。128 MBで常時稼働するGateway 1個は概算約11,059 GB-s/日なので、現状のCoordinator 2個を一緒に終日動かすと無料上限を超える。
- したがって、開発試験中はGatewayを短時間だけ動かす。本番の往復確認に合格した後、本番・開発両方のGateway配送を有効にしてから、両Coordinatorの定期確認を止める。最終構成はGateway 1個を常時接続し、Workers Freeの上限内か実績を監視する。Paidへの変更・自動課金はしない。
- Gatewayを停止してもinboxとDiscord sequenceは保持する。旧定期取り込みを止める前に、Gateway受信・再接続・両環境への配送と表示を実地確認する。

## 段階移行

### 1. 開発だけで短時間の往復確認

1. 先にこの変更をローカルで確認し、developへ統合・pushする。
2. develop Preview APIをGETし、405、`environment: "development"`、`developmentReplyMapping: "notification-only"`を確認する。
   `https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/api/feedback/discord/ingest`
3. Gateway管理secret、Discord Bot token、開発取り込みsecretをCloudflareへ設定する。Gateway有効化の前に、Discord Developer PortalでBotのMessage Content accessが許可されていることを確認する。REST API側にもこの権限が必要。
4. 本番Workerで`DISCORD_GATEWAY_ENABLED=true`、`GATEWAY_DELIVERY_ENVIRONMENTS=development`を一時設定する。Gatewayは一個だけ起動し、既存の本番Cronは継続する。
5. 新規の開発問い合わせをDiscordへ通知し、その通知に右クリックで返信する。開発会話画面で更新操作なしに返信が表示されること、保存先が開発だけであることを確認する。
6. 確認が終わったらGatewayを停止するか、すぐ本番移行へ進む。Gatewayが開発配送のみのまま長時間稼働しないようにする。

### 2. 本番と開発をGatewayへ切替

1. 開発往復確認に合格後、本番Workerの`GATEWAY_DELIVERY_ENVIRONMENTS`を`production,development`にする。
2. 新規の本番問い合わせへのDiscord返信が本番会話へ保存され、開発側へ混入しないことを別PCの画面で確認する。開発への配送も継続確認する。
3. Discord Gatewayの切断・再接続・API一時失敗後の再配送、重複返信の抑止を確認する。Message Content accessがなければ本文取得APIが再試行し、イベントを成功扱いにしない。
4. 両環境の往復確認に合格した後、開発WorkerのCronを停止し、本番Workerの旧Coordinator呼び出しも停止する。Gatewayの1分ごとのwatchdogだけを残し、返信の定期REST走査は行わない。
5. CloudflareのDurable Objects使用量を確認する。無料枠の余裕が足りない場合はGatewayを停止し、課金設定を変更せず既存Cronへ戻す。

## 設定と確認

Gatewayの秘密値はCloudflare Worker secretsにのみ設定し、`wrangler.toml`、Git、ログへ書かない。API secret、Discord Bot token、Channel/Guild ID、返信を許可するDiscord user IDを環境に合わせる。設定変更前後にアカウントと対象Workerを確認する。

```powershell
node --test src/index.test.mjs
wrangler deploy --dry-run --outdir .build
```

`wrangler deploy`やsecret設定は本番環境を変更する。ローカルのテストやdry-runだけではCloudflare上の起動・無料枠使用量・Discord権限の確認にならないため、実地切替前に段階1・2の前提を満たす。

開発用Workerは現在Gateway Durable Objectをbindせず、旧Cronだけを持つ。本番Workerにある単一Gatewayが開発Preview APIへ固定URLで配送する。開発APIの環境宣言と通知対応表が一致しない場合、開発データへのPOSTは行わない。
