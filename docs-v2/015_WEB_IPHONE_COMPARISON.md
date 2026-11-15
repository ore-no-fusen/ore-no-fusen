---
pageClass: feature-comparison-page
---

# Web版とiPhone版の機能比較

Web版はブラウザーの共有画面 `/shared`、iPhone版はホーム画面から使う `/viewer`。どちらもiPhoneで開けるが、別の画面・連携方式である。以下は現行実装の概要であり、詳しい条件は [Web共有](013_WEB_SHARE.md) と [iPhone版](003_IPHONE.md) を参照する。

<p class="table-caption">表15-1　Web版とiPhone版の主な機能（2026-11-15時点）</p>

| 項目 | Web版 `/shared` | iPhone版 `/viewer` |
|---|---|---|
| 主な用途 | PCのクイックランチャーに登録した付箋を閲覧・編集する。 | PCから送った付箋を受け取り、メモや添付をPCへ送る。 |
| PCからの反映 | PCの「Webと同期」で共有内容を反映。 | PCから「iPhoneに送る」で送信。 |
| 本文の編集とPCへの反映 | 共有付箋の本文やチェックを変更し、PCの手動同期で反映。 | 受信した付箋を編集してPCへ送り、PCの確認画面で反映方法を選ぶ。 |
| 新規作成 | 文字・Markdownの付箋を作り、対象PCへ送る。 | メモを作り、端末に保存するかPCへ送る。 |
| 画像 | PCから共有された画像を表示。新規作成時の画像添付は対象外。 | 画像を添付してPCへ送ることができる。 |
| 動画 | 新規付箋への動画添付・付箋内再生は未対応。 | MP4/MOVを選んでPCへ送れる。送信済み付箋での再生は現行未対応で、修正中。 |
| 通知 | この共有画面はiPhone受信通知とは別。 | 設定した端末でPCからの通知を受けられる。 |

動画再生の修正は完了・実機確認後にこの表を更新する。保存容量やバックグラウンド処理は端末・ブラウザーの制約を受ける。


<style>
.feature-comparison-page .vp-doc table { display: table; table-layout: fixed; width: 100%; }
.feature-comparison-page .vp-doc table th:first-child,
.feature-comparison-page .vp-doc table td:first-child { width: 22% !important; min-width: 0 !important; max-width: none !important; white-space: normal !important; text-align: left !important; padding: 10px !important; }
.feature-comparison-page .vp-doc td { overflow-wrap: anywhere; }
</style>
