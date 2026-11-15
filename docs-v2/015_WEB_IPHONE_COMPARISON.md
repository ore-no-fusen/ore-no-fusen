---
pageClass: feature-comparison-page
---

# Web版とiPhone版の機能比較

**送れる＝相手側で見られる・使える。** 主な7項目を抜粋。

○ できる　△ 一部・条件付き　× 未対応

<div class="comparison-directions">
<section class="comparison-direction">
<h2>① 往路</h2>
<div class="comparison-flow"><span>PC</span><b aria-hidden="true">→</b><span>Web ／ iPhone</span></div>
<table><caption>表15-1　PC外で見られるもの</caption><thead><tr><th>送るもの</th><th>Webへ</th><th>iPhoneへ</th></tr></thead><tbody>
<tr class="comparison-group"><th colspan="3" scope="colgroup">文字</th></tr>
<tr><td>文字</td><td>○</td><td>○</td></tr>
<tr><td>赤文字</td><td>○</td><td>○</td></tr>
<tr class="comparison-group"><th colspan="3" scope="colgroup">構造</th></tr>
<tr><td>チェック</td><td>○</td><td>○</td></tr>
<tr><td>図（Mermaid）</td><td>○</td><td>○</td></tr>
<tr class="comparison-group"><th colspan="3" scope="colgroup">添付</th></tr>
<tr><td>静止画</td><td>○</td><td>○</td></tr>
<tr><td>動画</td><td>×</td><td>×</td></tr>
<tr><td>ファイル</td><td>×</td><td>×</td></tr>
</tbody></table>

</section>
<section class="comparison-direction">
<h2>② 復路</h2>
<div class="comparison-flow"><span>Web ／ iPhone</span><b aria-hidden="true">→</b><span>PC</span></div>
<table><caption>表15-2　PCで見られるもの</caption><thead><tr><th>送るもの</th><th>Webから</th><th>iPhoneから</th></tr></thead><tbody>
<tr class="comparison-group"><th colspan="3" scope="colgroup">文字</th></tr>
<tr><td>文字</td><td>○</td><td>○</td></tr>
<tr><td>赤文字</td><td>○</td><td>○</td></tr>
<tr class="comparison-group"><th colspan="3" scope="colgroup">構造</th></tr>
<tr><td>チェック</td><td>○</td><td>○</td></tr>
<tr><td>図（Mermaid）</td><td>○</td><td>○</td></tr>
<tr class="comparison-group"><th colspan="3" scope="colgroup">添付</th></tr>
<tr><td>静止画</td><td>△</td><td>○</td></tr>
<tr><td>動画</td><td>×</td><td>○</td></tr>
<tr><td>ファイル</td><td>×</td><td>△</td></tr>
</tbody></table>
<p class="comparison-condition">△ 静止画：受信済み画像の返送のみ<br>△ ファイル：対応アプリで開く</p>
</section>
</div>

<div class="comparison-basis">
<p>Web＝共有画面 ／ iPhone＝ホーム画面アプリ</p>
<details><summary>整理の根拠を見る（全機能71件から抽出）</summary>
<p>機能ツリー → 送る内容を抽出 → 往路・復路 → 相手側での利用可否。</p>

[元資料・分類・採用／除外理由・確認結果](015_WEB_IPHONE_COMPARISON_BASIS.md)

</details>
</div>

[詳しい条件：Web共有](013_WEB_SHARE.md) ／ [iPhone版](003_IPHONE.md)

<style>
.feature-comparison-page .comparison-directions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 24px; }
.feature-comparison-page .comparison-direction { min-width: 0; border: 1px solid #d9dee5; border-radius: 10px; padding: 16px; }
.feature-comparison-page .comparison-direction h2 { margin: 0 0 14px; padding: 0; border: 0; font-size: 20px; }
.feature-comparison-page .comparison-flow { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.feature-comparison-page .comparison-flow span { flex: 1; border: 1px solid #abb6c3; border-radius: 6px; padding: 7px 2px; text-align: center; font-weight: 600; font-size: 14px; }
.feature-comparison-page .vp-doc .comparison-direction table { display: table; table-layout: fixed; width: 100%; margin: 12px 0 0; }
.feature-comparison-page .comparison-direction caption { caption-side: top; text-align: left; font-size: 12px; color: #52606d; margin-bottom: 7px; }
.feature-comparison-page .vp-doc .comparison-direction th,
.feature-comparison-page .vp-doc .comparison-direction td { min-width: 0 !important; max-width: none !important; padding: 6px 7px !important; white-space: normal !important; text-align: center !important; overflow-wrap: anywhere; }
.feature-comparison-page .vp-doc .comparison-direction th:first-child,
.feature-comparison-page .vp-doc .comparison-direction td:first-child { width: 50% !important; text-align: left !important; }
.feature-comparison-page .vp-doc .comparison-direction .comparison-group th { width: auto !important; background: #f0f3f6; color: #334155; font-size: 13px; }
.feature-comparison-page .comparison-condition { font-size: 12px; line-height: 1.7; margin: 10px 0 0; }
.feature-comparison-page .comparison-basis { font-size: 13px; margin-top: 18px; }
@media (max-width: 640px) { .feature-comparison-page .comparison-directions { grid-template-columns: minmax(0, 1fr); } }
</style>
