---
title: 000 要求仕様
outline: deep
---

# 📋 000 要求仕様 (Requirements)

<p class="lead-text">
機能要件・非機能要件・USDM
</p>

<p class="version-info">
v2.17 | 2026-07-19 | USDM (Universal Specification Describing Manner)
</p>

---

## 1 全体概要
このプロダクトが何者で、どの品質基準を満たすかを定義します。

### 1.1 製品定義

<!-- ① きっかけ：渇望 -->
<div style="background:#1e3a5f;border-radius:12px;padding:22px 28px;margin:16px 0 8px;border-left:4px solid #60a5fa;">
  <p style="font-size:15px;font-weight:700;color:#bfdbfe;margin:0 0 10px;">毎日、アプリを渡り歩いていた。</p>
  <p style="font-size:12px;color:#93c5fd;margin:0 0 14px;line-height:1.8;">付箋アプリ・テキストエディタ・スプレッドシート・ノートアプリ・メッセージアプリ……<br>それぞれ「惜しい」。全部揃ったものが、ない。</p>
  <p style="font-size:24px;font-weight:900;color:white;margin:0 0 14px;letter-spacing:-0.02em;">欲しいものが、ない。</p>
  <p style="font-size:13px;color:#60a5fa;margin:0;font-weight:700;">だから作った。</p>
</div>

<!-- ② 設計の芯：原動力 -->
<div style="margin:8px 0 4px;">
<img src="/design-concept.png" alt="設計の芯：各ツールの良いところだけを、ストレスなく一つに" style="width:100%;max-width:100%;height:auto;display:block;"/>
</div>
<p class="mermaid-caption">図 1-1　設計の芯：各ツールの良いところだけを、ストレスなく一つに</p>

<!-- ③ ユースケース図：できること -->
<div style="display:flex;justify-content:center;margin:8px 0 4px;">
<svg width="580" height="292" viewBox="0 0 580 292" xmlns="http://www.w3.org/2000/svg" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <!-- PC グループ境界 -->
  <rect x="115" y="6" width="460" height="184" rx="8" fill="#eff6ff" stroke="#93c5fd" stroke-width="2"/>
  <text x="345" y="22" text-anchor="middle" font-size="11" font-weight="700" fill="#1e40af">💻 PC アプリ（§2〜8）</text>
  <!-- iPhone グループ境界 -->
  <rect x="115" y="194" width="460" height="92" rx="8" fill="#f0fdf4" stroke="#86efac" stroke-width="2"/>
  <text x="345" y="210" text-anchor="middle" font-size="11" font-weight="700" fill="#14532d">📱 iPhone PWA（§9）</text>
  <!-- ユーザー（アクター） -->
  <ellipse cx="55" cy="143" rx="52" ry="20" fill="#1e3a5f" stroke="#60a5fa" stroke-width="2"/>
  <text x="55" y="148" text-anchor="middle" font-size="12" font-weight="700" fill="#bfdbfe">👤 ユーザー</text>
  <!-- PC への接続線 -->
  <line x1="107" y1="143" x2="177" y2="42"  stroke="#93c5fd" stroke-width="1.2"/>
  <line x1="107" y1="143" x2="177" y2="70"  stroke="#93c5fd" stroke-width="1.2"/>
  <line x1="107" y1="143" x2="177" y2="98"  stroke="#93c5fd" stroke-width="1.2"/>
  <line x1="107" y1="143" x2="177" y2="126" stroke="#93c5fd" stroke-width="1.2"/>
  <line x1="107" y1="143" x2="177" y2="154" stroke="#93c5fd" stroke-width="1.2"/>
  <line x1="107" y1="143" x2="177" y2="182" stroke="#93c5fd" stroke-width="1.2"/>
  <!-- iPhone への接続線 -->
  <line x1="107" y1="143" x2="177" y2="222" stroke="#86efac" stroke-width="1.2"/>
  <line x1="107" y1="143" x2="177" y2="252" stroke="#86efac" stroke-width="1.2"/>
  <line x1="107" y1="143" x2="177" y2="278" stroke="#86efac" stroke-width="1.2"/>
  <!-- PC ユースケース楕円 -->
  <ellipse cx="345" cy="42"  rx="168" ry="12" fill="white" stroke="#93c5fd" stroke-width="1.5"/>
  <text x="345" y="46"  text-anchor="middle" font-size="11" fill="#1e40af">① 付箋を作成する<tspan font-size="9" fill="#64748b"> §2.3</tspan></text>
  <ellipse cx="345" cy="70"  rx="168" ry="12" fill="white" stroke="#93c5fd" stroke-width="1.5"/>
  <text x="345" y="74"  text-anchor="middle" font-size="11" fill="#1e40af">② テキスト・画像を編集する<tspan font-size="9" fill="#64748b"> §4.1 §4.2</tspan></text>
  <ellipse cx="345" cy="98"  rx="168" ry="12" fill="white" stroke="#93c5fd" stroke-width="1.5"/>
  <text x="345" y="102" text-anchor="middle" font-size="11" fill="#1e40af">③ 全文検索する<tspan font-size="9" fill="#64748b"> §5.1</tspan></text>
  <ellipse cx="345" cy="126" rx="168" ry="12" fill="white" stroke="#93c5fd" stroke-width="1.5"/>
  <text x="345" y="130" text-anchor="middle" font-size="11" fill="#1e40af">④ タグで整理する<tspan font-size="9" fill="#64748b"> §5.2</tspan></text>
  <ellipse cx="345" cy="154" rx="168" ry="12" fill="white" stroke="#93c5fd" stroke-width="1.5"/>
  <text x="345" y="158" text-anchor="middle" font-size="11" fill="#1e40af">⑤ アーカイブ・削除する<tspan font-size="9" fill="#64748b"> §5.3</tspan></text>
  <ellipse cx="345" cy="182" rx="168" ry="12" fill="white" stroke="#93c5fd" stroke-width="1.5"/>
  <text x="345" y="186" text-anchor="middle" font-size="11" fill="#1e40af">⑥ iPhone に送る<tspan font-size="9" fill="#64748b"> §9.1</tspan></text>
  <!-- iPhone ユースケース楕円 -->
  <ellipse cx="345" cy="222" rx="168" ry="12" fill="white" stroke="#86efac" stroke-width="1.5"/>
  <text x="345" y="226" text-anchor="middle" font-size="11" fill="#14532d">⑦ ロック画面で確認する<tspan font-size="9" fill="#64748b"> §9.4</tspan></text>
  <ellipse cx="345" cy="252" rx="168" ry="12" fill="white" stroke="#86efac" stroke-width="1.5"/>
  <text x="345" y="256" text-anchor="middle" font-size="11" fill="#14532d">⑧ 通知を常駐させる<tspan font-size="9" fill="#64748b"> §9.3</tspan></text>
  <ellipse cx="345" cy="278" rx="168" ry="12" fill="white" stroke="#86efac" stroke-width="1.5"/>
  <text x="345" y="282" text-anchor="middle" font-size="11" fill="#14532d">⑨ PC に返す<tspan font-size="9" fill="#64748b"> §9.2</tspan></text>
</svg>
</div>
<p class="mermaid-caption">図 1-2　ユースケース概要</p>

<!-- ④ 製品定義：要求・仕様 -->
<p class="table-caption">表 1.1-1　製品定義</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="4" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_OV_01</td>
      <td rowspan="4" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、デスクトップ上で手軽にメモを取り、それらをファイルとして永続化・管理できるアプリケーションを求めている。<br><br>
        <strong>【理由】</strong><br>
        既存の付箋アプリはデータのポータビリティが低く、テキストエディタは起動や管理が手軽でないため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OV-01-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">アプリケーション名は「俺の付箋 (OreNoFusen)」とする。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OV-01-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">Windows デスクトップアプリケーションとして動作し、.exe 形式で配布される（Tauri v2 環境）。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OV-01-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">データの実体はプレーンテキスト（Markdown）とし、独自データベースを持たない。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-OV-01-04</td>
      <td style="">iPhone PWA（<code>/viewer</code>）を補助アプリとして提供し、Google Drive 経由で PC と双方向同期する。</td>
    </tr>
  </tbody>
</table>

### 1.2 品質保証
<p class="table-caption">表 1.2-1　品質保証</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_OV_02</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、日常的に安心して使用できる安定した品質を求めている。<br><br>
        <strong>【理由】</strong><br>
        メモアプリは毎日使うツールであり、予期しないクラッシュやデータ欠損が起きると信頼を失うため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OV-02-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">リリース前に Backend（Rust）ユニットテスト・Frontend E2E テストをクリアすること。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-OV-02-02</td>
      <td style="">既知の許容不具合（v2.10 時点）：パブリッシャー情報が一部 OS 画面で表示されない（仕様として許容）。</td>
    </tr>
  </tbody>
</table>

---

## 2 ライフサイクル要件
アプリの起動・終了・作成・削除など、付箋のライフサイクル全体を定義します。

### 2.1 アプリケーションの常駐と起動
<p class="table-caption">表 2.1-1　アプリケーションの常駐と起動</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="4" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_LF_01</td>
      <td rowspan="4" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、アプリを常に起動状態のまま維持し、必要な時に素早くメモを確認したい。<br><br>
        <strong>【理由】</strong><br>
        メモを取りたい瞬間に起動待ち時間が発生すると、思考が中断されるため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-01-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">アプリケーションはシステムトレイに常駐する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-01-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">起動時、設定されたフォルダ（Vault）をスキャンし、以前の状態（位置・サイズ）で付箋ウィンドウを復元する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-01-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">ウィンドウの復元は、負荷分散のためキューシステムを用いて順次行う。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-LF-01-04</td>
      <td style="">二重起動を防止する（<code>tauri-plugin-single-instance</code>）。</td>
    </tr>
  </tbody>
</table>

### 2.2 初回セットアップ
<p class="table-caption">表 2.2-1　初回セットアップ</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_LF_02</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、最初にアプリを使用した際に、メモの保存場所を自分で決めたい。<br><br>
        <strong>【理由】</strong><br>
        デフォルトの場所に勝手に保存されると、ユーザーのファイル管理ポリシーに反する場合があるため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-02-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">初回起動時（設定ファイルが存在しない場合）、セットアップ画面を表示する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-02-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">ユーザーにフォルダ選択ダイアログを提示し、選択されたパスを「ベースフォルダ」として保存する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-LF-02-03</td>
      <td style="">セットアップ完了後、メインウィンドウをダッシュボードモード（小型）に切り替える。</td>
    </tr>
  </tbody>
</table>

### 2.3 新規付箋の作成
<p class="table-caption">表 2.3-1　新規付箋の作成</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_LF_03</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、思いついたその瞬間に新しいメモを書き始めたい。<br><br>
        <strong>【理由】</strong><br>
        操作の手数が多すぎると、メモを取る意欲が減退するため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-03-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">システムトレイメニュー、または既存付箋の右クリックメニューから「新規メモ」を実行できる。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-03-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">作成操作後、即座に新しいウィンドウが開き、入力可能な状態（カーソルが1文字目に当たっている）になる。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-LF-03-03</td>
      <td style="">ファイル名は作成日時から自動生成（<code>NNNN_YYYY-MM-DD_Context.md</code>）し、ユーザーに入力を求めない。</td>
    </tr>
  </tbody>
</table>

### 2.4 アプリケーションの終了
<p class="table-caption">表 2.4-1　アプリケーションの終了</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_LF_04</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、メンテナンスや PC 終了時にアプリを完全に停止させたい。<br><br>
        <strong>【理由】</strong><br>
        常駐アプリであっても、ユーザーの意思でプロセスを終了させる手段が必要不可欠であるため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-04-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">個別の付箋を「閉じる（非表示にする）」汎用ボタンは提供しない。「アーカイブ」または「削除」を選択することで付箋をデスクトップから消去する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-LF-04-02</td>
      <td style="">システムトレイメニューの「終了」を選択した場合のみ、全プロセスを終了する。</td>
    </tr>
  </tbody>
</table>

### 2.5 アラーム機能
<p class="table-caption">表 2.5-1　アラーム機能</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_LF_05</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、指定した時刻に付箋をデスクトップ通知として受け取りたい。<br><br>
        <strong>【理由】</strong><br>
        重要なメモを決まった時刻に気づけるようにするためのリマインダーが必要なため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-05-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">付箋ごとにアラーム日時を設定できる。設定はフッターエリアのボタンから行う。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-LF-05-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">指定時刻にデスクトップ通知（OS ネイティブ）を表示し、通知クリックで該当付箋を前面に表示する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-LF-05-03</td>
      <td style="">アラームは一度発火したら解除される（繰り返しなし）。</td>
    </tr>
  </tbody>
</table>

---

## 3 データ管理要件
付箋データの保存形式・メタデータ・自動保存の仕組みを定義します。

### 3.1 Markdown 形式での保存
<p class="table-caption">表 3.1-1　Markdown 形式での保存</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_DT_01</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、メモの内容を他のテキストエディタやツールでも閲覧・編集したい。<br><br>
        <strong>【理由】</strong><br>
        独自フォーマットによるベンダーロックインを避け、長期的なデータの可読性を保証するため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-DT-01-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">ファイル拡張子は <code>.md</code> とする。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-DT-01-02</td>
      <td style="">本文は標準的な Markdown 記法で保存する。</td>
    </tr>
  </tbody>
</table>

### 3.2 メタデータの管理
<p class="table-caption">表 3.2-1　メタデータの管理</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_DT_02</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、前回終了時のウィンドウ位置・サイズ・色を維持したい。<br><br>
        <strong>【理由】</strong><br>
        デスクトップ上の配置自体が情報の整理・優先度付けの意味を持つため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-DT-02-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>windowX</code>, <code>windowY</code>, <code>width</code>, <code>height</code>, <code>backgroundColor</code>, <code>tags</code>, <code>alwaysOnTop</code> 等を YAML Frontmatter 形式でファイル先頭に記録する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-DT-02-02</td>
      <td style="">アプリ以外のエディタで開いた際も、本文の可読性を損なわない形式とする。</td>
    </tr>
  </tbody>
</table>

### 3.3 ファイル名の自動同期
<p class="table-caption">表 3.3-1　ファイル名の自動同期</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_DT_03</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、ファイル名を管理する手間から解放されたい。<br><br>
        <strong>【理由】</strong><br>
        ファイル名を考える時間はメモの本質的な価値とは無関係であり、認知負荷を下げるため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-DT-03-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">本文の1行目をファイル名の「コンテキスト」部分として使用する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-DT-03-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">1行目が変更された場合、0.8 秒の待機時間（デバウンス）を経て自動的にリネームを実行する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-DT-03-03</td>
      <td style="">ファイルシステムで使用できない文字（<code>\ / : * ? " &lt; &gt; |</code>）は自動置換してサニタイズする。</td>
    </tr>
  </tbody>
</table>

### 3.4 変更の自動保存
<p class="table-caption">表 3.4-1　変更の自動保存</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_DT_04</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、保存ボタンを押す操作を意識したくない。<br><br>
        <strong>【理由】</strong><br>
        保存忘れによるデータ消失を防ぎ、紙の付箋のような「書けば残る」体験を提供するため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-DT-04-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">テキスト変更後、自動的にファイルシステムへ書き込みを行う（アトミック処理でデータ破損を防ぐ）。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-DT-04-02</td>
      <td style="">ウィンドウからフォーカスが外れた（Blur）時点で、未保存の変更があれば即座に保存する。</td>
    </tr>
  </tbody>
</table>

---

## 4 編集・表示要件
付箋の編集体験と表示機能を定義します。

### 4.1 リッチテキスト編集
<p class="table-caption">表 4.1-1　リッチテキスト編集</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="5" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_ED_01</td>
      <td rowspan="5" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、強調やリストなどの構造を使ってメモを見やすくしたい。<br><br>
        <strong>【理由】</strong><br>
        プレーンテキストだけでは情報のメリハリが付けにくく、視認性が低いため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-ED-01-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>**太字**</code> は赤色・太字で表示する（重要事項の強調）。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-ED-01-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code># 見出し</code> はフォントサイズを大きく表示する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-ED-01-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>[ ]</code> / <code>[x]</code> はクリック可能なチェックボックスとして表示する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-ED-01-04</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">編集モードと表示モードをダブルクリックで切り替える。クリック位置（余白・テキスト・フッター）によって編集開始位置をインテリジェントに制御する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-ED-01-05</td>
      <td style="">元に戻す / やり直し（Undo/Redo）をサポートする。</td>
    </tr>
  </tbody>
</table>

### 4.2 画像の取り込み
<p class="table-caption">表 4.2-1　画像の取り込み</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_ED_02</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、画面上の情報をスクリーンショットとして素早くメモに貼りたい。<br><br>
        <strong>【理由】</strong><br>
        テキスト化しにくいビジュアル情報を、コンテキストを失わずに保存するため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-ED-02-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">ツールバーのカメラボタン押下で、OS のスクリーンショットツールを起動する（Windows Snipping Tool 連携）。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-ED-02-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">クリップボード内の画像を <code>assets</code> フォルダに自動保存し、Markdown リンクとして挿入する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-ED-02-03</td>
      <td style="">エディタ上の画像はドラッグ操作で表示サイズ（倍率）を変更できる。</td>
    </tr>
  </tbody>
</table>

---

## 5 検索・整理要件
付箋の検索・タグ管理・アーカイブ・削除を定義します。

### 5.1 全文検索
<p class="table-caption">表 5.1-1　全文検索</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="4" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_OR_01</td>
      <td rowspan="4" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、大量のメモの中から特定のキーワードを含むものを即座に見つけたい。<br><br>
        <strong>【理由】</strong><br>
        メモが増えるにつれて、視覚的な探索だけでは目的の情報に到達するのが困難になるため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OR-01-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>Ctrl+F</code> またはトレイメニューから検索画面を開く。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OR-01-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">入力されたキーワードで全 <code>.md</code> ファイルを Grep 検索し、結果をオーバーレイのリスト UI で表示する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OR-01-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">検索結果をクリックすると、該当する付箋ウィンドウを開き最前面へ移動する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-OR-01-04</td>
      <td style="">検索ウィンドウは「×」ボタン押下時に破棄・非表示にし、システムリソースを節約する。</td>
    </tr>
  </tbody>
</table>

### 5.2 タグによるコンテキスト切り替え
<p class="table-caption">表 5.2-1　タグによるコンテキスト切り替え</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_OR_02</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、現在の作業（仕事・プライベートなど）に関連するメモだけを表示したい。<br><br>
        <strong>【理由】</strong><br>
        無関係なメモがデスクトップにあると集中を阻害するため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OR-02-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">右クリックメニューから付箋に任意のタグ（複数可）を追加できる。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OR-02-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">全付箋から特定タグを一括グローバル削除できる削除モードをコンテキストメニュー内に提供する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-OR-02-03</td>
      <td style="">「タグで絞り込み」機能により、選択したタグを持つ付箋のみを表示し、それ以外を非表示にする。</td>
    </tr>
  </tbody>
</table>

### 5.3 不要メモの整理（アーカイブ・削除）
<p class="table-caption">表 5.3-1　不要メモの整理（アーカイブ・削除）</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_OR_03</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、アクティブでないメモをデスクトップから退避させたい。<br><br>
        <strong>【理由】</strong><br>
        デスクトップ領域は有限であり、常に現在進行形の情報のみを配置したいため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-OR-03-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><strong>タグフォルダへ移動</strong>: 通常ノートは <code>Archive/</code> フォルダへ移動。タグ付きノートは最初のタグフォルダ（例: <code>tags/Work/</code>）へ移動し、関連アセット（<code>assets/</code>内の画像）も同時に移動する。付箋右下のタグバッジを押すと、そのタグフォルダを開く。タグフォルダがまだ存在しない場合は親の <code>tags/</code> フォルダを開き、<code>tags/</code> 自体がまだ存在しない場合は保存先フォルダを開く。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-OR-03-02</td>
      <td style=""><strong>削除</strong>: ノートを <code>Trash/</code> フォルダへ移動する。論理削除ではなく物理移動とする。</td>
    </tr>
  </tbody>
</table>

---

## 6 UI/UX 仕様
付箋ウィンドウの外観・コンテキストメニュー・効果音を定義します。

### 6.1 ウィンドウデザイン・外観
<p class="table-caption">表 6.1-1　ウィンドウデザイン・外観</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_UI_01</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、愛着の持てる「かわいくてシンプル」な外観を求めている。<br><br>
        <strong>【理由】</strong><br>
        デスクトップに常駐するアプリは毎日目に入るため、視覚的な心地よさがモチベーション維持に直結するため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-UI-01-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">ウィンドウ枠（Decorations）を無効化し、背景を透過・角丸デザインとする。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-UI-01-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">背景色はユーザーが任意に選択できる（デフォルト: 淡い黄色）。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-UI-01-03</td>
      <td style="">ツールバーの各種操作アイコンは、付箋へのホバー時のみ表示され、閲覧時のノイズにならないようにする。</td>
    </tr>
  </tbody>
</table>

### 6.2 コンテキストメニュー
<p class="table-caption">表 6.2-1　コンテキストメニュー</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="4" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_UI_02</td>
      <td rowspan="4" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、付箋に対する操作を右クリックから直感的に行いたい。<br><br>
        <strong>【理由】</strong><br>
        ショートカットを知らなくても直感的に機能にアクセスできるようにするため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-UI-02-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">右クリック時に Tauri 連携による独自カスタムメニューを表示する（現在のモードに応じてメニューを切り替える）。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-UI-02-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><strong>閲覧モード時</strong>: フォルダを開く / 新規メモ / 色を変更 / 常に手前 / タグ / タグフォルダへ移動 / 削除 の7項目を基本構造とする。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-UI-02-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><strong>編集モード時</strong>: Undo/Redo / Cut/Copy/Paste/Select All / 日付挿入 / 時刻挿入 のテキスト操作特化メニューを表示する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-UI-02-04</td>
      <td style="">タグサブメニューには「削除モード（Delete Mode）」を提供し、タグのグローバル一括削除を安全に行える。</td>
    </tr>
  </tbody>
</table>

### 6.3 効果音
<p class="table-caption">表 6.3-1　効果音</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_UI_03</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、無効化しない限り、付箋の操作時に心地よいフィードバックを得たい。<br><br>
        <strong>【理由】</strong><br>
        視覚以外のフィードバックが操作の確実性を高めるため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-UI-03-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">効果音設定は設定画面でグローバルに ON/OFF 切り替え可能とする。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-UI-03-02</td>
      <td style="">設定変更は全ウィンドウに即座に反映されること。</td>
    </tr>
  </tbody>
</table>

---

## 7 インターフェース仕様
フロントエンド↔バックエンド間の通信と設定永続化の仕様を定義します。

### 7.1 フロントエンド–バックエンド間通信
<p class="table-caption">表 7.1-1　フロントエンド–バックエンド間通信</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_IF_01</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        UI 操作は、安全かつ効率的にファイルシステムへ反映されなければならない。<br><br>
        <strong>【理由】</strong><br>
        フロントエンドとバックエンドが分離した Tauri 構成では、通信の仕組みを明示しないと実装が散乱し、バグ混入やリソースリークが起きやすいため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IF-01-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">Tauri v2 の非同期コマンド（<code>invoke</code>）を使用してファイル操作を要求する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IF-01-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">未処理の Floating Promise 防止設計を取り入れ、<code>unlisten</code> 等イベント解除の例外によるクラッシュをガードする。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-IF-01-03</td>
      <td style="">システムイベント（設定変更・外部リロード・画面更新）は Tauri イベントシステム（<code>emit</code> / <code>listen</code>）で通知・同期する。</td>
    </tr>
  </tbody>
</table>

### 7.2 設定の永続化
<p class="table-caption">表 7.2-1　設定の永続化</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_IF_02</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        アプリの設定（ベースフォルダ等）は再起動しても維持されなければならない。<br><br>
        <strong>【理由】</strong><br>
        起動のたびに設定を求められるアプリは使い続けるのが苦痛になるため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IF-02-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">アプリのグローバル設定は JSON 形式で AppData ディレクトリに保存・参照する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-IF-02-02</td>
      <td style="">PWA 機能（Service Worker）は開発モードでは無効化し、エラーを抑制する。</td>
    </tr>
  </tbody>
</table>

---

## 8 非機能要件
ショートカット・マルチモニター・セキュリティ・パフォーマンス・多言語化を定義します。

### 8.1 キーボードショートカット操作
<p class="table-caption">表 8.1-1　キーボードショートカット操作</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="9" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_NF_01</td>
      <td rowspan="9" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、キーボードから手を離さずに主要な操作を素早く実行したい。<br><br>
        <strong>【理由】</strong><br>
        思考のスピードを落とさないため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-01-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>Ctrl+N</code>: 新規付箋の作成</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-01-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>Ctrl+F</code>: 全文検索ウィンドウの呼び出し</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-01-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>Ctrl+S</code>: 明示的保存（基本は自動保存のため安心感の提供用）</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-01-04</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>Esc</code>: 開いているモーダル・ダイアログを閉じる</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-01-05</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>Ctrl+B</code>: 太字トグル（編集中）</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-01-06</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>Ctrl+H</code>: 見出し1トグル（編集中）</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-01-07</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>Ctrl+L</code>: 箇条書きトグル（編集中）</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-01-08</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>Ctrl+Shift+C</code>: チェックボックストグル（編集中）</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-NF-01-09</td>
      <td style=""><code>Ctrl+Shift+H</code>: 全付箋を一括で隠す / 戻す</td>
    </tr>
  </tbody>
</table>

### 8.2 デスクトップショートカット

- `REQ_NF_02`: Microsoft Storeからインストールした利用者が、初回起動後もアプリを迷わず再起動できること。
- `SPEC-NF-02-01`: LP・Store説明・移行マニュアルは、インストール後にStore画面の［開く］を押すところまで案内する。
- `SPEC-NF-02-02`: MSIX版の初回起動時に、デスクトップショートカットを作成するか1回だけ確認する。
- `SPEC-NF-02-03`: 確認文は「デスクトップにショートカットを作成しますか？」「毎日使う場合は作成をおすすめします。」「後から設定画面でも作成できます。」、選択肢は［作成する］［今回は作成しない］とする。
- `SPEC-NF-02-04`: MSIX版では「俺の付箋（Store版）」という名称を使い、5.0.0移行期間の旧版ショートカットを上書きしない。
- `SPEC-NF-02-05`: 設定画面から作成、作り直し、削除ができること。
- `SPEC-NF-02-06`: Store更新でインストール先の版番号が変わっても同じショートカットから起動できること。

### 8.3 マルチモニター・環境変動対応
<p class="table-caption">表 8.2-1　マルチモニター・環境変動対応</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_NF_02</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        外部ディスプレイの抜き差し等で、付箋が画面外に取り残されてしまう事故を防ぎたい。<br><br>
        <strong>【理由】</strong><br>
        見えない場所に行った付箋を探すのは大きなストレスになるため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-02-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">定期的または環境変化検知時に全付箋の座標を評価する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-NF-02-02</td>
      <td style="">付箋がすべてのアクティブモニターの論理領域外に存在する場合、メインモニターの安全な領域へ自動再配置（レスキュー）する。</td>
    </tr>
  </tbody>
</table>

### 8.4 セキュリティ・プライバシー
<p class="table-caption">表 8.3-1　セキュリティ・プライバシー</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="4" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_NF_03</td>
      <td rowspan="4" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        メモという極めてプライベートなデータを扱うため、情報漏洩や不正利用を防ぎたい。<br><br>
        <strong>【理由】</strong><br>
        情報の安全性が担保されないツールは使用できないため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-03-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><strong>PC アプリはローカル動作</strong>: PCアプリ単体では外部サーバーと通信しない。ファイルはユーザー指定の Vault 内にのみ保存する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-03-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><strong>iPhone 連携時のデータ経路</strong>: 付箋データの中継はユーザー自身の Google Drive のみを使用する。第三者のサーバーに付箋の内容を送信しない。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-03-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><strong>Vercel の役割は開発者用シークレット保護とトークン交換のみ</strong>: Vercel は開発者が守る Google OAuth2 の <code>client_secret</code> を iPhone PWA に入れないために使用する。付箋本文、添付画像、添付動画、Drive 中継ファイル、Google Drive 用トークンは保持・参照しない。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-NF-03-04</td>
      <td style=""><strong>ノー・テレメトリー</strong>: 開発者や第三者への利用状況送信・エラーレポートの自動送信は一切行わない。</td>
    </tr>
  </tbody>
</table>

### 8.5 パフォーマンス・リソース制約
<p class="table-caption">表 8.4-1　パフォーマンス・リソース制約</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="2" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_NF_04</td>
      <td rowspan="2" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        常駐アプリであるため、作業の邪魔にならない程度の軽快さと低負荷を維持したい。<br><br>
        <strong>【理由】</strong><br>
        メイン作業のパフォーマンスを落としてしまっては本末転倒なため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-04-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">最大 500 枚程度の付箋が Vault 内に存在しても、高速な起動処理を意識した設計とする。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-NF-04-02</td>
      <td style="">ファイル数増加に伴う線形的な負荷増加は、UI 描画の遅延評価（Lazy load）などで防ぐ。</td>
    </tr>
  </tbody>
</table>

### 8.6 多言語化・i18n 要件
<p class="table-caption">表 8.5-1　多言語化・i18n 要件</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="6" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_NF_05</td>
      <td rowspan="6" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        環境に縛られず、様々な言語話者が直感的にツールを使用できること。<br><br>
        <strong>【理由】</strong><br>
        より多くのユーザーに利用可能とするため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-05-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">起動時に OS のロケール設定を自動取得し、UI 言語を決定する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-05-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">サポート言語は日本語（<code>ja</code>）および英語（<code>en</code>）を基本とする。設定画面からも強制切替可能。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-05-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">コンテキストメニュー・ツールバーヒント・各種ボタンはすべて翻訳定義を通じた動的出力とする。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-05-04</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">英語UIから開くWebページには言語を引き継ぎ、サポートページを英語で表示する。利用者が編集した名称・支援者名・コメントなどのユーザーデータは自動翻訳しない。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-NF-05-05</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">設定画面は全タブ、展開内部、確認・エラー・診断結果まで選択言語で表示する。ひな形の既定節名は日本語・英語間で双方向変換し、独自の節名は保持する。</td>
    </tr>
    <tr>
      <td style="text-align:center;">SPEC-NF-05-06</td>
      <td>ユーザーガイドは日本語・英語を提供し、Microsoft Store MSIXを標準導入経路、<code>winget --source msstore</code>を補助経路として案内する。旧MSI・NSISは5.0.0の移行用途に限定し、画面・保存先・操作説明を現行実装と一致させる。</td>
    </tr>
  </tbody>
</table>

---

## 9 iPhone 連携要件
PCとiPhoneを繋ぐ双方向同期・通知・PWA機能を定義します。v2.10で追加。

### 9.1 PC → iPhone 送信（プッシュ通知）
<p class="table-caption">表 9.1-1　PC → iPhone 送信（プッシュ通知）</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="6" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_IP_01</td>
      <td rowspan="6" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、PC で書いた付箋の内容をiPhone のロック画面通知として受け取りたい。複数のiPhone / iPadを同じGoogle Driveに接続している場合は、登録済み端末へ同じ付箋を届けたい。<br><br>
        <strong>【理由】</strong><br>
        移動中でも PC の重要メモを目に入る場所（ロック画面）に残しておけるようにするため。「そこに残る」という付箋の本質をモバイルでも実現する。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-01-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">PC アプリの「iPhone に送る」ボタン押下で、Google Drive の <code>notes_to_iphone.json</code> に送信データを書き込む。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-01-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">VAPID を使用した Web Push 通知を APNs/FCM 経由で iPhone に送信する。VAPID 鍵は俺の付箋アプリ開発者の秘密ではなく、ユーザー本人の Google Drive に置かれる「ユーザーが許可した端末群の共有通知鍵」であり、ユーザー本人の iPhone へ通知を送る権利を表す。漏えいすると悪意ある第三者が正規通知のように見える Push 通知を送れる可能性があるため、Google Drive の <code>push_keys.json</code> 1 個を正とし、各PCのローカル鍵で共有鍵を上書きしてはならない。詳細は <a href="./003_IPHONE.html#sec3-0">003_IPHONE「3.0 鍵の前提」</a> を参照。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-01-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">Service Worker が Push を受信し、本文・画像（<code>fusen_img_*</code>）を Drive からダウンロードして IndexedDB（<code>fusen-drafts</code>）に保存する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-01-04</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">Drive に書き込んだ画像ファイルは、IndexedDB 保存完了後に即座に削除する（Drive は未処理キューであり、処理済みは残さない）。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-IP-01-05</td>
      <td style="">iPhone のロック画面に通知として表示し、タップすると PWA の該当ノートへ遷移する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-IP-01-06</td>
      <td style="">PC から iPhone へ送る場合、<code>push_devices.json</code> に登録されている複数端末へ送信できる。現行仕様では個別の iPhone を選択して送る UI はなく、登録済み通知端末へ同報送信する。PC → iPhone は各端末へ Push を配る同報配信であり、複数端末が同じ付箋を受け取ってもPC側の未処理キューを取り合う構造ではない。</td>
    </tr>
  </tbody>
</table>

### 9.2 iPhone → PC 送信
<p class="table-caption">表 9.2-1　iPhone → PC 送信</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="8" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_IP_02</td>
      <td rowspan="8" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、外出先で iPhone に書いたメモ、画像、動画を PC に戻ったとき付箋として受け取りたい。複数PCを同じGoogle Driveに接続している場合は、iPhone PWAから送信先PCを選びたい。<br><br>
        <strong>【理由】</strong><br>
        外出先のアイデアや素材をデスクトップに自動で届けることで、「転記」や手作業のファイル移動をなくすため。画像・動画は付箋の本文を置き換えるものではなく、ユーザーの思考に紐づく添付メディアとして扱う。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-02-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">iPhone PWA の write 画面で「PC に送る」を押すと、テキスト、画像、動画を Google Drive に送信する（<code>notes_from_iphone.json</code> ＋ <code>fusen_img_*</code> ＋ <code>fusen_video_*</code>）。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-02-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">PC アプリが 30 秒ポーリングで Drive を監視し、受信後に付箋として新規ウィンドウを開く。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-02-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">PC 受信後、Drive 上の JSON から処理済みアイテムを除外して書き戻す（空になったらファイルごと削除）。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-02-04</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">PC 受信後、Drive 上の画像・動画ファイルは即座に削除する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-02-05</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">動画は <code>mp4</code> / <code>mov</code> を対象とし、PWA で選択した時点では送信しない。現在の付箋に添付し、「PC に送る」実行時に画像と同じ送信単位で Drive へアップロードする。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-02-06</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">PC 受信後、動画ファイルはユーザーの保存先配下の <code>assets/video/</code> に保存し、付箋本文には保存先パスを追記する。動画バイナリを付箋 DB や Markdown 本文へ埋め込まない。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-02-07</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">ユーザーが入力した本文、1行目、タグ、添付一覧は別々の情報として扱う。動画の元ファイル名、Drive 一時ファイル名、PC 保存パスを本文やタイトルの代わりに上書きしてはならない。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-IP-02-08</td>
      <td style="">複数 PC を同じ Google Drive に接続する場合、PC は Google 連携完了時または手動登録時に限り、<code>pc_devices.json</code> に自分の <code>pcId</code> と表示名を登録する。iPhone PWA は送信直前に送信先 PC 一覧を確認して送信先 PC を選択し、<code>notes_from_iphone.json</code> の各アイテムに <code>targetPcId</code> を付与する。iPhone → PC は複数PCが同じ未処理キューを読むため、送信先指定なしでは取り合いになる。PC アプリは自分宛のアイテムのみ受信し、他 PC 宛の未処理アイテムを削除してはならない。</td>
    </tr>
  </tbody>
</table>

### 9.3 通知の常駐（ロックだぜ）
<p class="table-caption">表 9.3-1　通知の常駐（ロックだぜ）</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_IP_03</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、重要な通知を意図的に消すまでiPhone のロック画面に表示し続けたい。<br><br>
        <strong>【理由】</strong><br>
        紙の付箋のように「消す意思がないかぎり目に入る場所にある」体験をモバイルでも実現するため。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-03-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">list 画面の 🔔 ボタンで通知常駐（<code>locked: true</code>）を ON/OFF できる。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-03-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;"><code>locked: true</code> のノートは notificationclick 時に通知を再表示する（自動再通知）。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-IP-03-03</td>
      <td style=""><code>locked</code> フラグは IndexedDB（<code>fusen-drafts</code>）の boolean フィールドで管理する。</td>
    </tr>
  </tbody>
</table>

### 9.4 iPhoneロック画面常駐体験
<p class="table-caption">表 9.4-1　iPhoneロック画面常駐体験</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="4" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_IP_05</td>
      <td rowspan="4" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、PC で送った付箋が iPhone のロック画面に「消す意思がないかぎり」ずっと残り続け、タップすれば内容を確認でき、確認後もロック画面から消えないという体験を得たい。<br><br>
        <strong>【理由】</strong><br>
        紙の付箋は「剥がすまで目に入る場所にある」。この体験を iPhone のロック画面で再現することで、「そこに残る」というプロダクトの本質をモバイルでも実現する。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-05-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">① PC から送信すると、iPhone のロック画面に通知が表示され、ポップアップが出る。このとき通知常駐（🔔）は ON のまま。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-05-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">② ポップアップをタップすると PWA が開き付箋の内容が表示される。表示後、通知を再表示してロック画面から消えない状態を維持する。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-05-03</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">③ ①② のサイクルは、ユーザーが明示的に通知を OFF にするまで繰り返す。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-IP-05-04</td>
      <td style="">④ ユーザーが list 画面の 🔔 ボタンで通知を OFF にすると、ロック画面からも通知が消え、以降ポップアップもしない。</td>
    </tr>
  </tbody>
</table>

### 9.5 iPhone PWA の認証と持続可能性
<p class="table-caption">表 9.5-1　iPhone PWA の認証と持続可能性</p>
<table class="module-table" style="font-size:12px; width:100%; border-collapse: collapse; margin-bottom:24px;">
  <thead>
    <tr>
      <th colspan="2" style="background-color:#1e293b; color:#fff; text-align:center;">要求（Requirement）</th>
      <th colspan="2" style="background-color:#0f172a; color:#fff; text-align:center;">仕様（Specification）</th>
    </tr>
    <tr>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">要求事項・理由</th>
      <th style="width:10%; text-align:center;">ID</th>
      <th style="width:40%;">仕様・制約</th>
    </tr>
  </thead>
  <tbody>
    <tr>
            <td rowspan="3" style="vertical-align:top; text-align:center; font-weight:bold; background-color:#f8fafc;">REQ_IP_04</td>
      <td rowspan="3" style="vertical-align:top; background-color:#f8fafc;">
        <strong>【要求】</strong><br>
        ユーザーは、複雑な手順なしに iPhone PWA にログインでき、セッションが途切れても自動で再接続されたい。<br><br>
        <strong>【理由】</strong><br>
        モバイルでの再ログイン手順が複雑だと、機能そのものが使われなくなるため。また Vercel 無料枠・Google API 制限の範囲内で運用を続けられる設計が必要。
      </td>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-04-01</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">Google OAuth2 + PKCE でログインする。ユーザーは「俺の付箋が Drive のアプリ用ファイルを扱うこと」を Google に許可する。開発者が守る <code>client_secret</code> は Vercel API Routes でのみ使用し、iPhone 側には渡さない。</td>
    </tr>
    <tr>
      <td style="border-bottom: 1px dotted #cbd5e1; text-align:center;">SPEC-IP-04-02</td>
      <td style="border-bottom: 1px dotted #cbd5e1;">アクセストークンの有効期限切れを検知した場合、Vercel 経由で自動リフレッシュしてから処理を続行する。</td>
    </tr>
    <tr>
      <td style=" text-align:center;">SPEC-IP-04-03</td>
      <td style="">Vercel は無料枠、Google API は標準クォータの範囲内で運用できる設計とする（ポーリング頻度・Drive アクセス回数を意識する）。</td>
    </tr>
  </tbody>
</table>

---

## 10 改版履歴

<div class="history-table">
<p class="table-caption">表 10-1　改版履歴</p>

| No | バージョン | 日付 | 変更内容 |
|:---|:---|:---|:---|
| 1 | v2.0 | 26-02-22 | ベータリリース時の初版（Markdown形式） |
| 2 | v2.10 | 26-04-19 | HTML化・iPhone連携要件追加・ショートカット更新等 |
| 3 | **v2.11** | 26-04-20 | REQ_IP_05「iPhoneロック画面常駐体験」追加 |
| 4 | **v2.12** | 26-05-06 | 8.3 セキュリティ・プライバシー、9.5 iPhone PWA の認証と持続可能性を修正。OAuth / Vercel の要件説明を見直し、ユーザーが許可するものと開発者が守るものを分けて記載。 |
| 5 | v2.13 | 26-05-25 | 9.2 iPhone → PC 送信に VideoDrop を追加。画像・動画を同じ添付メディアとして扱い、ユーザー本文を上書きしないこと、動画を `assets/video/` に保存することを明記。 |
| 6 | v2.14 | 26-05-29 | 9.2 iPhone → PC 送信に複数 PC の送信先選択を追加。`pc_devices.json` と `targetPcId` により、自分宛のアイテムのみ受信する制約と、PC 名簿を書き込むタイミングを明記。 |
| 7 | v2.15 | 26-05-30 | 9.1 PC → iPhone 送信で、VAPID 鍵はユーザー本人の Google Drive に置かれる連携端末群の共有通知鍵であり、盗まれると第三者が正規通知のように見える Push 通知を送れる可能性があること、Drive の `push_keys.json` 1 個を正とし、各PCのローカル鍵で共有鍵を上書きしてはならない制約を追加。 |
| 8 | v2.16 | 26-05-31 | SPEC-IP-01-02 の VAPID 鍵説明を **3 者（ユーザー / 俺の付箋アプリ開発者 / 悪意ある第三者）** の語彙に統一。「開発者」「第三者」表記の揺れを解消し、設計書 003「3.0 鍵の前提」と 005「0 登場人物と関係」への参照を追加。 |
| 9 | v2.17 | 26-07-19 | §8.2へMicrosoft Storeの［開く］、MSIX初回起動時の確認、「俺の付箋（Store版）」ショートカット、設定画面からの再作成、更新後の継続利用要件を追加。 |
| 10 | **v2.18** | 26-07-19 | SPEC-NF-05-06を追加。日英ユーザーガイド、Store MSIX標準導入、winget補助導入、5.0.0旧版移行、現行実装との整合を要求化。 |

</div>
