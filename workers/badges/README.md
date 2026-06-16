# ore-no-fusen badges Worker

README用のバッジSVGを返す Cloudflare Worker。

## 目的

- F5時にGitHub APIから最新値を取得する
- 取得成功時はKVへ前回成功値として保存する
- 取得失敗時はKVの前回成功値を返す
- READMEにshields.ioのエラー文言を出さない

## Endpoints

```text
/badges/release.svg
/badges/downloads-total.svg
/badges/downloads-latest.svg
```

## Cloudflare resources

```text
Worker: ore-no-fusen-badges
KV binding: BADGE_CACHE
Secret: GITHUB_TOKEN
```

`GITHUB_TOKEN` は public repository のrelease情報を読むだけのread-only tokenを使う。

## Deploy

```bash
cd workers/badges
wrangler kv namespace create ORE_NO_FUSEN_BADGE_CACHE
wrangler kv namespace create ORE_NO_FUSEN_BADGE_CACHE --preview
wrangler secret put GITHUB_TOKEN
wrangler deploy
```

作成されたKV namespace IDを `wrangler.toml` に反映してからdeployする。
