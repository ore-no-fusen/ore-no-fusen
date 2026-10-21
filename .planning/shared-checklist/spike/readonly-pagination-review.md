# Driveページング試験の読取専用性レビュー

## 結論

`drive-server.mjs` の `/pagination` 処理本体は、保存済み検証IDのメタデータ取得、Drive一覧のページ読み取り、対象JSONの取得だけを行う。`testPagination()` 中はDriveへの非GET/HEAD要求を拒否する。ただし、同サーバー全体には保存・更新等の別POST経路があるため、既存の読み取り専用Webサーバーへ処理をそのまま移植するか、旧サーバーをユーザー向けに起動し直す方法は安全でない。

## 対象ID・判定

- 最初に `fixture.local.json` の `folderId`、`noteId`、`imageId` を各1回、メタデータGETして `generation`、親、MIME type、削除状態を検証。不足/不一致なら停止。
- 一覧は `appProperties.fusenSpike = generation` かつ `trashed=false`、`pageSize=3` で `nextPageToken` がなくなるまで読む（最大10ページ）。その中から operationId が `A, B, C, R, late-E, ACK-A, REVOKE, delayed-old` の記録を選び、各ファイル本文をGETする。
- 本文を重複除去し、8 IDの完全性、複数ページ、解決後head `R`、旧枝隔離、逆順で同じ結果、解除後の世代更新と旧世代保留を検証する。8 IDが揃わないなど1条件でも失敗すれば `safe=false`。
- 試験データは既存の専用fixtureおよび、同じgenerationで事前保存済みの8操作記録に依存する。ページング試験自身は記録を作らない。fixtureだけで操作記録がない場合、読み取りはするが合格しない。保存済み操作がない状況で `/causal` を先に押すのはDrive書込みになるため、この読み取り専用確認の一部として行ってはいけない。

## Drive要求数

式は **3 + P + N**（fixtureメタデータ3回 + 一覧ページP回 + 見つかった対象記録本文N回）。想定fixture 3ファイル、操作記録8件なら `P=4, N=8` として通常15回。過去記録にある観測値は6ページ・8本文で、同式なら17回。API呼び出しの上限30回に対して余裕はあるが、同generationの残存記録が多い場合は件数が増える。現在のfixtureにある個々の記録数は内容本文を開かずには確定できない。

## 読取専用ハーネスへの最小統合案

1. OAuthや認証状態を旧サーバーから移さず、既存読み取り専用ハーネスの認証済みトークンとDrive GET関数を再利用する。
2. Drive接続先を `files/{id}` のみ許す現在の検査を拡張し、Drive APIの `GET /drive/v3/files` 一覧クエリだけを厳密に許可する。`q` はfixture generationと `trashed=false` に固定、`fields/pageSize/pageToken` のみ許可し、URL/host・ページ上限・合計要求数30を検査する。
3. 既存fixtureの3メタデータを先に検査してから一覧・対象本文を読む。対象IDは検証済みgenerationの一覧結果に限り、`operationId` の期待集合で絞る。DriveへのPOST/PATCH/DELETE経路や `/causal` は追加しない。
4. 画面結果にページ数、読んだ件数、API要求数、8個の判定条件を表示する。認証済みの実行トークンを維持したまま試験する。

したがって「ページング処理だけをGETで試す」こと自体は本番付箋を変更せず実行可能。ただし必要な8操作記録が同じ専用検証fixtureに既に存在すること、一覧GETを許可した読み取り専用ハーネスの最小改修が前提。
