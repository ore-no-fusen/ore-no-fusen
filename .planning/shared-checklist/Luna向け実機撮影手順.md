# Luna向け実機試験・PNG保存手順

2026-10-18にWindows実機とアプリ内ブラウザーでPNG保存を実施した手順。試験結果は同日の実機結果表を参照。

1. AGENTS.md、CURRENT.md、ore-no-fusen-live-testとcomputer-useのSKILL.md、guidance/api/confirmationsを読む。常設ルートのdevelopと未保存変更を確認する。
2. 既存付箋と3002の使用状況を確認。二重起動を避け、必要な場合だけ通常の `npm run tauri dev` を使う。sandboxでの照会失敗・待受なしをホスト全体の証拠としない。Ready/Runningだけで起動合格にしない。
3. node_replで `@oai/sky` のskyを初期化する。結果を表示するには必ず `nodeRepl.write(...)` を使う。式だけでは出力が空になる。
4. `sky.list_windows()` の実結果から付箋アプリを選ぶ。複数ある場合は `get_window_state({window,include_screenshot:false,include_text:true})` で試験題名/URLを確認する。最初の窓を無条件に選ばない。
5. 画面使用を利用者に知らせ、対象窓を `activate_window` で前面化。`get_window` で現行ハンドルを取得し、`get_window_state` で撮影。隠れた窓は別画面が写る場合があった。必ず画像内容を目視して対象付箋が写っているか確認する。
6. 今回のPNG保全に使ったNodeコード（stateは直前の実取得値）:

```js
const fs = await import('node:fs/promises');
const dir = 'D:/Users/uck/Documents/curry-project/ore-no-fusen/my/保全/共通Web実機試験-20261018';
await fs.mkdir(dir, {recursive:true});
await fs.writeFile(dir + '/Windows.png', Buffer.from(state.screenshots[0].url.split(',')[1], 'base64'));
```

7. Webはcua_replで `cua.getState()`→既存の認証済み `/shared` タブを `getTab` で取得。ブラウザー操作前に `cua.rewriteDocumentation()` で現在のAPIを読む。DOMとOSアクセシビリティで役割が異なる場合がある（今回のタグはAXではcheckbox、Playwrightではbutton）。操作失敗時はDOMを取り直す。
8. 実画面の操作に `tab.playwright.getByRole(...).click()/fill()`、確認に `domSnapshot()` を使う。1操作後に状態を確認する。「Webを更新」はdisabledが解除された状態まで確認し、読み込み途中を完了証拠にしない。
9. ブラウザー画像は `await fs.writeFile(absolutePath, await tab.screenshot({fullPage:true}))` で保存する。fsはcua_repl内でnode:fs/promisesをimport。画像加工やモック生成はしない。保存後は実ファイルをview_imageで確認する。
10. 各No.に期待結果・実操作・観察・PNG名・判定を記録。未実施に画像を捏造しない。利用者の画像、こちらの撮影、ファイル読取、自動試験は区別する。
11. 最終回答は絶対パスのMarkdown画像 `![Web結果](D:/.../Web.png)` とファイルリンクを使用する。ツール内表示だけを「利用者に見せた」と言わない。
12. 接続拒否/安全停止が出たら迂回せず、指定回復手順に従う。ログイン認証画面は本人へ依頼する。必要なら利用者の許可済みSol相談を使い、失敗を繰り返さない。

## 2026-10-19 Sol相談で確認した補足

IABの `tab.screenshot({fullPage:true})` が取得不能でも、正規の `tab.getScreenshot()` / `getAXStateAndScreenshot()` では取得できた。返却PNGをそのまま保存する。今回のPNGは1014×815。view_imageで同一画像の左上だけのように見えたが、ファイル寸法と中央/下部の画素を読むと黄色いフォームが保存されていた。表示側の差分表現をファイル破損と即断しない。画像の再合成・生成やCodex本体のUI操作へ迂回しない。保存PNGの絶対パスを渡して利用者が開けるようにする。
