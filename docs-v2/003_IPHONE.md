---
title: 003 クラウド同期・iPhone設計
outline: deep
---

# 📱 003 クラウド同期・iPhone設計

<p class="lead-text">
画面構成・Service Worker・データ構造・データフロー
</p>

<p class="version-info">
設計書 v1.5 / 2026-05-06
</p>

---

## 1 画面構成

iPhone PWA は <code>step</code> state で切り替わる5画面の単一ページアプリです。

<Note type="success">
iPhone PWA は <code>page.tsx</code> 内の <code>step</code> state で表示画面を切り替える単一ページアプリ。
<strong>step の値は5種類：banner / login / push / list / write</strong>。
URLバーなしのネイティブアプリ風で動作する（PWA起動時）。
</Note>

### 1.1 各画面の役割

banner・login・push・list・write の5画面それぞれの表示条件と役割を説明します。各画面に画面 ID（`step` の値）と画面名（日本語）を付けて一覧にします。画面 ID は `app/viewer/page.tsx` の `step` state に対応します。

<p class="table-caption">表 1.1-1　iPhone PWA の画面一覧</p>

| 画面 ID（`step`） | 画面名 | 表示される条件 |
|---|---|---|
| `banner` | インストール案内 | Safari で URL を直接開いた（PWA ではない） |
| `login` | ログイン | アクセストークンが無い（初回 or 期限切れ） |
| `push` | 通知設定 | トークンあり ＋ `viewer_push_done` が未設定 |
| `list` | メモ一覧 | 編集画面から一覧を開いた場合 |
| `write` | 編集 | トークンあり ＋ `viewer_push_done=true`（通常起動）、list からメモ選択・新規作成、または通知タップ |

<!-- インストール案内 -->
<div class="group-label group-safari">インストール案内画面 — Safariで /viewer を開いたとき（PWAではない）</div>
<div class="screens-grid">
  <!-- banner -->
  <div class="phone">
    <div class="phone-frame">
      <div class="phone-notch"></div>
      <div class="phone-screen" style="background:#F2F2F7; display:flex; flex-direction:column; padding:8px; gap:5px; overflow-y:auto;">
        <div style="font-size:8px; font-weight:700; color:#111827;">ホーム画面に<br>追加してください</div>
        <div class="mock-step-card">STEP 1 — 共有をタップ</div>
        <div style="background:#e5e7eb; border-radius:4px; height:28px;"></div>
        <div class="mock-step-card">STEP 2 — ホーム画面に追加</div>
        <div style="background:#e5e7eb; border-radius:4px; height:28px;"></div>
        <div class="mock-step-card">STEP 3 — 追加をタップ</div>
        <div style="background:#e5e7eb; border-radius:4px; height:28px;"></div>
        <div style="font-size:6px; color:#d1d5db; text-align:center; margin-top:2px;">app 2.9.x</div>
      </div>
    </div>
    <div class="screen-name">banner</div>
    <div class="screen-cond">step: banner</div>
  </div>
  <dl class="screen-def">
    <dt>表示条件</dt>
    <dd>SafariでURLを直接開いた（PWAではない）</dd>
    <dt>目的</dt>
    <dd>ホーム画面への追加手順を案内する。初回インストール時のみ使う。</dd>
    <dt>バージョン表示</dt>
    <dd><code>app x.x.x</code> のみ。ServiceWorkerは表示しない。</dd>
    <dt>備考</dt>
    <dd>skipWaiting導入済みのため、バージョンアップ目的で開く必要はない。</dd>
  </dl>
</div>

<!-- PWA画面 -->
<div class="group-label group-pwa">PWA画面 — ホーム画面アイコンから起動（URLバーなし・アプリとして動作）</div>
<div class="screens-grid">
  <!-- login -->
  <div class="phone">
    <div class="phone-frame">
      <div class="phone-notch"></div>
      <div class="phone-screen" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:8px;">
        <div class="mock-title" style="font-size:7px;">俺の付箋</div>
        <div class="mock-text">Googleでログイン<br>してください</div>
        <div class="mock-btn">Googleでログイン</div>
        <div class="phone-ver">app 2.9.x / ServiceWorker 2.9.x</div>
      </div>
    </div>
    <div class="screen-name">ログイン</div>
    <div class="screen-cond">step: login</div>
  </div>
  <dl class="screen-def">
    <dt>表示条件</dt>
    <dd>アクセストークンがない（初回 or 有効期限切れ）</dd>
    <dt>操作</dt>
    <dd>「Googleでログイン」ボタン → Google OAuth（PKCE）→ トークン取得後 push へ遷移</dd>
    <dt>バージョン表示</dt>
    <dd><code>app x.x.x / ServiceWorker x.x.x</code>（右下固定）</dd>
  </dl>
  <!-- push -->
  <div class="phone">
    <div class="phone-frame">
      <div class="phone-notch"></div>
      <div class="phone-screen" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:8px;">
        <div class="step-badge">セットアップ</div>
        <div class="mock-text">プッシュ通知を<br>有効にしてください</div>
        <div class="mock-btn">通知を許可する</div>
        <div class="phone-ver">app 2.9.x / ServiceWorker 2.9.x</div>
      </div>
    </div>
    <div class="screen-name">通知設定</div>
    <div class="screen-cond">step: push</div>
  </div>
  <dl class="screen-def">
    <dt>表示条件</dt>
    <dd>トークンあり + <code>viewer_push_done</code> が未設定</dd>
    <dt>操作</dt>
    <dd>「通知を許可する」→ OS権限ダイアログ → 許可後 list へ遷移。<code>viewer_push_done=true</code> を localStorage に保存。</dd>
    <dt>バージョン表示</dt>
    <dd><code>app x.x.x / ServiceWorker x.x.x</code>（右下固定）</dd>
  </dl>
  <!-- list -->
  <div class="phone">
    <div class="phone-frame">
      <div class="phone-notch"></div>
      <div class="phone-screen" style="background:#F2F2F7; display:flex; flex-direction:column; padding:6px; gap:4px;">
        <div class="mock-header">
          <span style="font-size:9px; font-weight:700; color:#111827;">メモ</span>
          <span style="font-size:9px; color:#111827;">＋</span>
        </div>
        <div class="mock-card"><div class="mock-dot mock-dot-blue"></div><span style="font-size:6px;">大事なメモ</span><span style="font-size:8px; margin-left:auto;">🔔</span></div>
        <div class="mock-card"><div class="mock-dot"></div><span style="font-size:6px;">買い物リスト</span><span style="font-size:8px; margin-left:auto;">🔕</span></div>
        <div class="mock-card"><div class="mock-dot"></div><span style="font-size:6px;">アイデアメモ</span><span style="font-size:8px; margin-left:auto;">🔕</span></div>
        <div class="phone-ver">app 2.9.x / ServiceWorker 2.9.x</div>
      </div>
    </div>
    <div class="screen-name">メモ一覧</div>
    <div class="screen-cond">step: list</div>
  </div>
  <dl class="screen-def">
    <dt>表示条件</dt>
    <dd>トークンあり + <code>viewer_push_done=true</code>（通常の起動時）</dd>
    <dt>操作</dt>
    <dd>＋ → write（新規）<br>メモタップ → write（編集）<br>🔔 → ロック画面に表示 ON/OFF<br>🗑️ → メモ削除</dd>
    <dt>バージョン表示</dt>
    <dd><code>app x.x.x / ServiceWorker x.x.x</code>（右下固定）</dd>
  </dl>
  <!-- write -->
  <div class="phone">
    <div class="phone-frame">
      <div class="phone-notch"></div>
      <div class="phone-screen" style="display:flex; flex-direction:column; padding:6px; gap:4px;">
        <div class="mock-header">
          <span style="font-size:7px; color:#3b82f6;">← 戻る</span>
          <span style="font-size:6px; color:#3b82f6;">PCへ送る</span>
        </div>
        <div class="mock-input">大事なメモ...</div>
        <div style="flex:1; background:#f9fafb; border-radius:4px;"></div>
        <div style="display:flex; gap:3px; padding:3px 2px;">
          <div class="mock-sub-btn">iPhoneに置く</div>
          <div class="mock-tool-btn">📷</div>
        </div>
        <div class="mock-toolbar">
          <div class="mock-tool-btn">B</div>
          <div class="mock-tool-btn">H1</div>
          <div class="mock-tool-btn">≡</div>
        </div>
        <div class="phone-ver">app 2.9.x / ServiceWorker 2.9.x</div>
      </div>
    </div>
    <div class="screen-name">編集</div>
    <div class="screen-cond">step: write</div>
  </div>
  <dl class="screen-def">
    <dt>表示条件</dt>
    <dd>① list からメモ選択・新規作成<br>② 通知タップ（notificationclick または pending_open）</dd>
    <dt>操作</dt>
    <dd>「PCへ送る」→ Drive経由でPC送信 → list へ<br>「iPhoneに置く」→ IndexedDBに下書き保存 → list へ<br>「← 戻る」→ list へ（保存なし）</dd>
    <dt>バージョン表示</dt>
    <dd><code>app x.x.x / ServiceWorker x.x.x</code>（右下固定）</dd>
  </dl>
</div>

### 1.2 起動時の遷移ルール

PWA起動時にどの画面から始まるかを決める4つのルールを定義します。

```mermaid
flowchart LR
    classDef safari fill:#7c2d12,stroke:#fb923c,color:#fed7aa,stroke-width:2px
    classDef pwa    fill:#14532d,stroke:#4ade80,color:#bbf7d0,stroke-width:2px
    classDef screen fill:#1e3a5f,stroke:#60a5fa,color:#bfdbfe,stroke-width:2px

    Safari["Safari で開く"]:::safari
    PWA["PWA 起動<br>（ホーム画面アイコン）"]:::pwa

    Banner["banner<br>ホーム追加案内"]:::screen
    Login["login<br>Google認証"]:::screen
    Push["push<br>通知設定"]:::screen
    List["list<br>ノート一覧"]:::screen
    Write["write<br>編集"]:::screen

    Safari --> Banner
    PWA -->|"トークンなし"| Login
    PWA -->|"OAuthコールバック ?code="| Login
    Login --> Push
    Push --> List
    List <--> Write
    PWA -->|"トークンあり + 通知設定済み"| Write
    PWA -->|"通知タップ / pending_open"| Write
```
<p class="mermaid-caption">図 3-1　起動時の画面遷移ルール</p>

<p class="table-caption">表 1.2-1　起動時画面遷移ルール</p>

| No | 起動時の状態 | 遷移先 |
|:---|:---|:---|
| 1 | 非 standalone（Safariで開いた） | banner |
| 2 | URL に `?code=`（OAuthコールバック） | Vercel でトークン取得 → push |
| 3 | URL に `?note=`（通知タップで起動） | IndexedDB からノート読み込み → write |
| 4 | token あり・pending_open あり（30分以内） | IndexedDB からノート読み込み → write |
| 5 | token あり・`viewer_push_done=true` | write（通常起動。IndexedDB の通知確認を待たず入力可能にする） |
| 6 | token あり・push 未設定 | push（通知セットアップ） |
| 7 | token なし | login |

<Note type="warning">
<strong>pending_open とは：</strong>iOS では通知タップ時に <code>notificationclick</code> が発火しないケースがある。
その補完として SW は Push 受信時に <code>fusen-meta</code>（IndexedDB）へノート ID を記録する。
次回 PWA 起動時に <code>useAppInit</code> がこれを読んで、対象ノートを write で自動表示する。
</Note>

---

## 2 モジュール構造

フロントエンド・Service Worker・Vercel API の3層構成です。

### 2.1 フロントエンド（TypeScript / React）

画面を構成するコンポーネント・フックの依存関係を示します。
また、図には現れない共通ユーティリティファイルも以下の表に一覧します。

<p class="table-caption">表 2.1-1　共通ユーティリティ（viewer/ 配下）</p>
<table class="module-table" style="font-size:12px; margin-bottom: 16px;">
  <thead>
    <tr><th style="width:40px;text-align:center">No</th><th style="width:160px">ファイル名</th><th>役割</th></tr>
  </thead>
  <tbody>
    <tr><td style="text-align:center;color:#94a3b8;font-weight:700">1</td><td><code>types.ts</code></td><td>フロントエンド全体で共有する型定義（<code>DraftRecord</code> 等）</td></tr>
    <tr><td style="text-align:center;color:#94a3b8;font-weight:700">2</td><td><code>utils.ts</code></td><td>依存を持たない汎用的なユーティリティ関数群</td></tr>
    <tr><td style="text-align:center;color:#94a3b8;font-weight:700">3</td><td><code>editor-helpers.ts</code></td><td>テキストエリア操作やタグ管理（localStorageとの連携）を担うヘルパー</td></tr>
  </tbody>
</table>

```mermaid
graph LR
    classDef page  fill:#14532d,stroke:#4ade80,color:#bbf7d0,stroke-width:2px
    classDef hook  fill:#1a1a5f,stroke:#a78bfa,color:#ddd6fe,stroke-width:2px
    classDef comp  fill:#1e3a5f,stroke:#60a5fa,color:#bfdbfe,stroke-width:2px
    classDef lib   fill:#3d1a00,stroke:#fb923c,color:#fed7aa,stroke-width:2px

    Page["viewer/page.tsx"]:::page

    subgraph Comps ["viewer/"]
        NoteListStep["NoteListStep.tsx"]:::comp
        WriteStep["WriteStep.tsx"]:::comp
        PushStep["PushStep.tsx"]:::comp
        Crop["CropModal.tsx"]:::comp
        Mermaid["MermaidModal.tsx"]:::comp
        SimpleNote["SimpleNoteBody.tsx"]:::comp
    end

    subgraph Hooks ["viewer/hooks/"]
        Init["useAppInit.ts<br>起動時初期化"]:::hook
        NoteList["useNoteList.ts<br>Drive→IndexedDB 同期"]:::hook
        Lock["useLockToggle.ts<br>ロック画面に表示 ON/OFF"]:::hook
        
        AutoSave["useAutoSave.ts<br>800ms 自動保存"]:::hook
        VisSave["useVisibilitySave.ts<br>BG遷移時保存"]:::hook
        BgSend["useBackgroundSend.ts<br>PCへ送信"]:::hook
        
        Init ~~~ AutoSave
        NoteList ~~~ VisSave
        Lock ~~~ BgSend
    end

    subgraph Lib ["viewer/lib/"]
        Drive["drive.ts<br>Drive API ラッパー"]:::lib
        IDB["indexeddb.ts<br>fusen-drafts 読み書き"]:::lib
        Auth["auth.ts<br>PKCE / OAuth"]:::lib
        Push["push.ts<br>Push 登録"]:::lib
        
        Drive ~~~ Auth
        IDB ~~~ Push
    end

    %% レイアウト階層の強制（4行構成）
    Page ~~~ NoteListStep
    NoteListStep ~~~ Drive
    Auth ~~~ Init

    %% 依存関係（実際の矢印）
    Page --> Init
    Page --> NoteList
    Page --> Lock
    Page --> AutoSave
    Page --> VisSave
    Page --> BgSend
    Page --> NoteListStep
    Page --> WriteStep
    Page --> PushStep

    WriteStep --> Crop
    WriteStep --> Mermaid
    NoteListStep --> SimpleNote

    Init --> IDB
    Init --> Auth
    NoteList --> Drive
    NoteList --> IDB
    Lock --> IDB
    AutoSave --> IDB
    VisSave --> IDB
    BgSend --> Drive
    Push --> Drive
```
<p class="mermaid-caption">図 3-2　フロントエンドモジュール構成</p>

### 2.2 Service Worker（worker/index.js）

push受信・notificationclick等を処理するSWのイベントハンドラ5点を一覧します。

<p class="table-caption">表 2.2-1　SW イベントハンドラ一覧</p>

| No | イベント | 処理内容 |
|:---|:---|:---|
| 1 | `install` | `skipWaiting()` 呼び出し。新バージョンを即時有効化。 |
| 2 | `activate` | `clients.claim()` でページの制御を取得。SW バージョンをログに記録。 |
| 3 | `push` | ① Push ペイロード（title / body_rich / id）を取得<br>② `fusen-meta` からアクセストークンを取得<br>③ Drive から画像をダウンロード<br>④ `fusen-drafts` に元のノートタイトルのまま保存<br>⑤ Drive から画像ファイルを削除<br>⑥ `notes_to_iphone.json` から当該 ID を削除<br>⑦ `pending_open` を `fusen-meta` に記録<br>⑧ 既存の同 ID 通知を閉じ、空タイトルの場合だけ通知名を日本語環境では「俺の付箋」、それ以外では「FUSEN」として新規通知を表示 |
| 4 | `notificationclick` | 通知をタップ → `locked` 確認 → true なら再通知・アプリを前面に出す。<br><strong style="color:#f59e0b">⚠️ iOS では発火しない（既知の制約）。</strong>タップ後の再通知は `page.tsx` の `pending_open` フローが代替。 |
| 5 | `message` | アプリからの通信を受信。`CLOSE_NOTIFICATION` で通知を閉じる、`GET_VERSION` で SW のバージョンを返す等の処理。 |

<Note type="warning">
<strong>ログ：</strong>SW の動作は全て <code>fusen-logs</code>（IndexedDB）に記録される。
PC の Chrome で PWA を開き、DevTools → Application → IndexedDB → fusen-logs で確認できる。
</Note>

### 2.3 サーバーサイド（Vercel API Routes）

この節は、主に開発者・保守担当向けです。iPhone PWA が Google Drive 用トークンを取得・更新するときに使う Vercel API エンドポイント2点を説明します。

<Note type="info">
<code>client_secret</code> は、開発者が Google Cloud Console で発行する「俺の付箋アプリが本物であることを Google に示すための秘密値」。
ユーザーに守ってもらうものではなく、開発者が守る。
iPhone PWA へ入れると端末上で読めてしまうため、Vercel のサーバー側だけに置く。
iPhone は Vercel 経由でトークン交換・更新を依頼し、Vercel はトークンを保存しない。
</Note>

<p class="table-caption">表 2.3-1　Vercel API Routes 一覧</p>

| No | ファイル | 役割 |
|:---|:---|:---|
| 1 | `app/api/auth/token/route.ts` | OAuth 認証コード → アクセストークン＋リフレッシュトークン交換。初回ログイン時のみ呼ばれる。 |
| 2 | `app/api/auth/refresh/route.ts` | リフレッシュトークン → 新しいアクセストークン取得。Drive API 呼び出し時にトークン期限切れを検出したら自動呼び出し。 |

#### 環境変数（Vercel）

Vercel の Environment Variables に設定する変数の一覧です。`.env` ファイルやコードにハードコードしないこと。

<p class="table-caption">表 2.3-2　Vercel 環境変数一覧</p>

| No | 変数名 | 公開範囲 | 取得元 | 用途 |
|:---|:---|:---|:---|:---|
| 1 | `GOOGLE_CLIENT_SECRET_PWA` | サーバー専用 | Google Cloud Console → 認証情報 → OAuth 2.0 クライアント（PWA用） → クライアント シークレット | 開発者が守る値。iPhone PWA が Google Drive 用トークンを取得・更新できるように、Vercel サーバーから Google へ提示する。iPhone PWA には入れない。端末上で読める場所に置くと、第三者が俺の付箋のアプリ名義で OAuth 処理を悪用する恐れがあるため。 |
| 2 | `NEXT_PUBLIC_GDRIVE_CLIENT_ID` | 公開可 | Google Cloud Console → 認証情報 → OAuth 2.0 クライアント（PWA用） → クライアント ID | iPhone PWA が Google OAuth フローを開始するために使う公開ID。ここでいう client はユーザー端末ではなく Google に登録した「俺の付箋アプリ」を指す。公開前提なので iPhone PWA に含めてよい。 |
| 3 | `DISCORD_WEBHOOK_URL` | サーバー専用 | Discord サーバー → チャンネル設定 → 連携サービス → Webhook → URL をコピー | PC 設定画面のフィードバック送信を Discord へ転送するために、Vercel サーバー側で使う。 |

<Note type="info">
<code>NEXT_PUBLIC_APP_VERSION</code> は Vercel への手動設定不要。<code>next.config.ts</code> がビルド時に <code>package.json</code> の <code>version</code> フィールドから自動設定する。
</Note>

<Note type="warning">
<code>GOOGLE_CLIENT_SECRET_PWA</code> は Vercel が「Needs Attention」と表示する場合がある。Google Cloud Console（APIとサービス → 認証情報 → 該当クライアント）でステータスが「有効」であれば実害なし。値が一致していれば無視してよい。
</Note>

---

## 3 データ構造

この節は、主に開発者・保守担当向けです。IndexedDB・localStorage・Google Drive の3か所に保存するデータと、障害時に確認する場所を定義します。

<Note type="success">
<strong>データの正：</strong>iPhone 画面に表示する付箋の唯一の保存先は <strong>IndexedDB（fusen-drafts）</strong>。
Drive は中継所（未処理キュー）に過ぎない。Drive に残っているものは「まだ処理していない」を意味する。処理済みは即削除。
</Note>

<Note type="info">
<strong>iPhone送信の鍵をひと言で言うと：</strong>
<code>push_keys.json</code> は「このGoogle Drive連携グループの合い鍵」、
<code>push_devices.json</code> は「その合い鍵で通知を受け取れるiPhone / iPadの名簿」です。
同じGoogle DriveにつながるPC・iPhoneは、Drive上の1つの <code>push_keys.json</code> を共有し、各iPhoneの通知先は <code>push_devices.json</code> に登録されます。
数の前提は、<code>push_keys.json</code> は1つのGoogle Drive連携グループにつき最大1個、
<code>push_devices.json</code> は1ファイルの中に複数のiPhone / iPadを登録できる名簿です。
現行仕様では <code>push_devices.json</code> の登録台数にアプリ側の固定上限は設けていませんが、実運用はユーザー本人の数台程度を想定します。
</Note>

<a id="sec3-0"></a>
### 3.0 鍵の前提（先に読む）

俺の付箋の鍵の話は、まず **登場人物の整理** から始めます。3 者の関係を理解せずに鍵単体の話を読んでも、空回りします。

#### 3.0.1 登場人物（3 者）

<p class="table-caption">表 3.0-1　登場人物と守るもの</p>

| No | 登場人物 | 役割 | 守るもの |
|:---|:---|:---|:---|
| 1 | **ユーザー** | 俺の付箋を使う人 | 自分の付箋本文・添付・iPhone への通知の門・Google Drive の `ore-no-fusen` フォルダ |
| 2 | **俺の付箋アプリ開発者** | アプリを作り、Vercel に PWA を配信、Google Cloud Console で OAuth を登録 | `client_secret`、Vercel 環境変数、GitHub Secrets |
| 3 | **悪意ある第三者** | 上の 2 者ではない攻撃者 | （守らない・攻撃する側） |

<p class="table-caption">表 3.0-2　3 者の警戒関係</p>

| 警戒する人 | 警戒する相手 | 警戒の理由 |
|:---|:---|:---|
| **ユーザー** | 悪意ある第三者 | 付箋を盗まれない・偽通知を受け取らない |
| **ユーザー** | 俺の付箋アプリ開発者 | 開発者を盲目的に信頼しない。必要以上の権限を要求するアプリではないか見極める |
| **俺の付箋アプリ開発者** | 悪意ある第三者 | `client_secret` を奪われない・悪用されない |
| **俺の付箋アプリ開発者** | ユーザー | `client_secret` をユーザーに渡さない（PWA・コード・公開リポジトリに含めない）。ユーザー環境が侵害された場合に被害が広がらないよう設計する |

<Note type="info">
<strong>大前提：</strong>
「<strong>3 者すべてが、他の 2 者を警戒する</strong>」。特に「ユーザー → アプリ開発者」と「アプリ開発者 → ユーザー」は<strong>対等で</strong>、どちらか一方を信頼し切る設計にはしません。
鍵・トークン・秘密値の置き場所は、すべてこの 3 者関係から論理的に導かれます。
</Note>

#### 3.0.2 鍵を記述する 3 観点

鍵は登場人物のうち**所有者**が決まらないと置き場所が定まりません。すべての鍵を次の 3 観点で記述します。

<p class="table-caption">表 3.0-3　鍵を記述する 3 観点</p>

| 観点 | 意味 |
|:---|:---|
| **所有者** | 3 者のうち誰のための鍵か |
| **目的** | 誰から、何を、どう守るのか |
| **防衛手段** | どこに置き、どう使うか（置き場所は所有者と目的から論理的に導かれる） |

<Note type="warning">
<strong>「秘密」という言葉のワナ：</strong>
「秘密鍵」「秘密」は、<strong>誰の秘密か</strong>を明示しないと意味が変わります。
「俺の付箋アプリ開発者の秘密」「ユーザー本人の秘密」「ユーザーが許可した端末群の共有秘密」は、置き場所も扱いも違います。
業界一般の「秘密鍵は外に出すな」というルールは「アプリ開発者の秘密」を前提にしています。
それを「ユーザーの秘密」や「ユーザーが許可した端末群の共有秘密」に当てはめると、逆に間違った設計になります。
</Note>

#### 3.0.3 俺の付箋に登場する鍵の一覧

<p class="table-caption">表 3.0-4　鍵の一覧（詳細は各セクション参照）</p>

| 鍵 | 所有者 | 主目的 | 主な置き場所 |
|:---|:---|:---|:---|
| **VAPID 鍵**（`push_keys.json`） | **ユーザー本人**（ユーザーが許可した全 PC・全 iPhone で共有） | 悪意ある第三者や別鍵PCが、ユーザーの iPhone へ偽通知を送れないようにする | ユーザーの Drive 1 個を正。PC は送信時に Drive から読み、ローカルに保存しない |
| **ECDH 鍵**（`push_devices.json` 内 `keys`） | **個々の iPhone**（ユーザーのもの） | 通知本文の暗号化（端末ごと） | ユーザーの Drive、端末ごとに 1 組 |
| **OAuth トークン**（`gdrive_token.json`） | **ユーザー本人**（その PC のみ） | Drive へのアクセス権を一時的に証明する | PC のローカル（`%LOCALAPPDATA%`） |
| **`client_secret`** | **俺の付箋アプリ開発者** | 「俺の付箋」を名乗る他アプリが Google OAuth を通れないようにする | Vercel のサーバー（コードに含めない） |

<Note type="info">
<strong>識別子は「鍵」ではない：</strong>
<code>pc_id</code>（PC ごとの UUID）や <code>device_id</code>（iPhone ごとの UUID）は単なる識別子であり、鍵ではありません。
漏れても攻撃には使えない（「ID が知られる」だけで「何かを偽る権利を得る」わけではない）ので、上の一覧には含めません。
</Note>

#### 3.0.4 VAPID 鍵の補足

VAPID 鍵については特に誤解されやすい点があるので、ここで補足します。

<Note type="warning">
<strong>VAPID 鍵はユーザーごとに別物：</strong>
俺の付箋アプリ全体で 1 個ではありません。<strong>ユーザーごとに別の鍵</strong>が、そのユーザーの PC で初回起動時にランダム生成されます（<code>webpush.rs::generate_vapid_keys</code>）。
俺の付箋アプリ開発者の鍵というものは存在せず、ユーザー A の鍵とユーザー B の鍵は全くの別物で、相互に関係ありません。
表 3.0-4 で「所有者：ユーザー本人」と書いているのは、<strong>そのユーザーが所有する全 PC・全 iPhone</strong>のことを指します。
</Note>

<Note type="info">
<strong>「鍵を持つ = 権限を持つ」と読み替える：</strong>
VAPID 鍵の「秘密」は「データを隠す」ではなく「<strong>誰にこの権限を持たせるか</strong>」を意味します。
鍵 = 「<strong>このユーザーの iPhone に通知を送る権限の証明書</strong>」と捉えると分かりやすい。

<ul>
<li>鍵を作る = ユーザーが「<strong>この PC からの送信を許可する</strong>」と決める</li>
<li>鍵を Drive に置く = ユーザーが「<strong>自分の他の PC にも同じ送信を許可する</strong>」</li>
<li>鍵が漏れる = 「<strong>悪意ある第三者にも自分の iPhone への送信権限を与えてしまう</strong>」</li>
<li>鍵を作り直す = 「<strong>今までの送信権限を全部取り消し、新しい権限に切り替える</strong>」</li>
</ul>

つまり VAPID は「<strong>ユーザーが許可した PC からの送信を、ユーザー本人が技術的に認可する</strong>」仕組みです。
</Note>

### 3.1 IndexedDB

PWA端末内に保存されるfusen-drafts・fusen-meta・fusen-logsの3ストアを定義します。

<div class="store-card store-idb" style="margin-bottom:16px">
  <h4 id="sec3-0-1">3.1.1 🗄 fusen-drafts（ノートデータ）</h4>
  <p class="table-caption">表 3-4　fusen-drafts スキーマ</p>
  <table class="module-table" style="font-size:11px">
    <thead><tr><th style="width:36px;text-align:center;white-space:nowrap">No</th><th style="width:120px">フィールド</th><th style="width:80px">型</th><th>用途・内容</th></tr></thead>
    <tbody>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">1</td><td><code>id</code></td><td>string</td><td>主キー（UUID）</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">2</td><td><code>title</code></td><td>string</td><td>ノートタイトル</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">3</td><td><code>body</code></td><td>string</td><td>本文（Markdown）</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">4</td><td><code>images</code></td><td>Object[]</td><td>添付画像（<code>{ fileName: string, blob: Blob }[]</code>）</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">5</td><td><code>videos</code></td><td>Object[]</td><td>添付動画（<code>{ fileName: string, blob: Blob }[]</code>）。ユーザー本文とは別に保持する</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">6</td><td><code>tags</code></td><td>string[]</td><td>付与されたタグの配列</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">7</td><td><code>locked</code></td><td>boolean</td><td>ロック画面に表示が ON なら true</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">8</td><td><code>created_at</code></td><td>string</td><td>作成日時（JST ISO 8601）</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">9</td><td><code>sent_at</code></td><td>string</td><td>送信日時（未送信時は undefined）</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">10</td><td><code>received_pc</code></td><td>boolean</td><td>PC 側が受信済みかどうか</td></tr>
    </tbody>
  </table>
</div>
<div class="store-grid">
  <div class="store-card store-idb">
    <h4 id="sec3-0-2">3.1.2 🗄 fusen-meta（メタ情報）</h4>
    <p class="table-caption">表 3-5　fusen-meta スキーマ</p>
    <table class="module-table" style="font-size:11px">
      <thead><tr><th style="width:36px;text-align:center">No</th><th style="width:130px">キー</th><th>用途・内容</th></tr></thead>
      <tbody>
        <tr><td style="text-align:center;color:#94a3b8;font-weight:700">1</td><td><code>access_token</code></td><td>Google Drive アクセストークン（SW が参照）</td></tr>
        <tr><td style="text-align:center;color:#94a3b8;font-weight:700">2</td><td><code>pending_open</code></td><td>次回起動時に開くノートの情報。<code>{ id: string, t: number }</code></td></tr>
      </tbody>
    </table>
  </div>
  <div class="store-card store-idb">
    <h4 id="sec3-0-3">3.1.3 🗄 fusen-logs（デバッグログ）</h4>
    <p class="table-caption">表 3-6　fusen-logs スキーマ</p>
    <table class="module-table" style="font-size:11px">
      <thead><tr><th style="width:36px;text-align:center">No</th><th style="width:80px">フィールド</th><th>用途・内容</th></tr></thead>
      <tbody>
        <tr><td style="text-align:center;color:#94a3b8;font-weight:700">1</td><td><code>t</code></td><td>タイムスタンプ（JST）</td></tr>
        <tr><td style="text-align:center;color:#94a3b8;font-weight:700">2</td><td><code>msg</code></td><td>ログメッセージ</td></tr>
      </tbody>
    </table>
  </div>
</div>

### 3.2 localStorage

セッション管理に使うlocalStorageのキーと値の一覧です。

<div class="store-card store-ls" style="max-width:600px">
  <h4 id="sec3-0-4">3.2.1 🔑 認証・設定フラグ</h4>
  <p class="table-caption">表 3-7　localStorage キー一覧</p>
  <table class="module-table" style="font-size:11px">
    <thead><tr><th style="width:44px;text-align:center">No</th><th>キー</th><th>用途・内容</th></tr></thead>
    <tbody>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">1</td><td><code>viewer_access_token</code></td><td>Google API アクセストークン</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">2</td><td><code>viewer_refresh_token</code></td><td>リフレッシュトークン（Vercel API 経由で更新）</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">3</td><td><code>viewer_expires_at</code></td><td>アクセストークンの有効期限（ms）</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">4</td><td><code>viewer_push_done</code></td><td><code>"true"</code> なら通知設定済み → list へ直行</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">5</td><td><code>pkce_verifier</code></td><td>OAuth PKCE の code_verifier（認証中のみ存在）</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">6</td><td><code>pending_note</code></td><td>PKCE 認証後に自動で開くノート ID</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">7</td><td><code>viewer_device_id</code></td><td>Web Push 用のクライアント識別子</td></tr>
      <tr><td style="text-align:center;color:#94a3b8;font-weight:700">8</td><td><code>fusen_known_tags</code></td><td>過去に入力したタグの履歴（サジェスト用）</td></tr>
    </tbody>
  </table>
</div>

### 3.3 Google Drive ファイル

PCとiPhone間の中継、および Web Push 設定に使う Drive ファイルの種類と書き込み/削除責務を説明します。

<Note type="success">
<strong>Drive 設計原則：</strong>
<code>notes_to_iphone.json</code>、<code>notes_from_iphone.json</code>、<code>fusen_img_*</code>、<code>fusen_video_*</code> は未処理キュー。処理済みは即削除。
<code>push_keys.json</code>、<code>push_devices.json</code>、<code>pc_devices.json</code> は接続設定ファイルなので、セットアップ後も残す。
</Note>

<Note type="warning">
未処理キューが宛先違い・古いPWA・通信中断などで残った場合、設定画面の接続状態から件数を確認し、<code>notes_to_iphone.json</code> / <code>notes_from_iphone.json</code> の中身を表示できる。
ユーザーが明示確認した場合だけ、同画面から該当キューJSONを削除できる。これは未処理付箋の破棄なので、自動削除しない。
</Note>

<p class="table-caption">表 3.3-1　Google Drive ファイル一覧</p>
<table class="module-table" style="font-size:12px; table-layout: fixed;">
  <thead>
    <tr>
      <th style="width:40px;text-align:center">No</th>
      <th style="width:180px">ファイル名</th>
      <th style="width:140px">書き込み</th>
      <th style="width:140px">読み取り・削除</th>
      <th>用途</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:center;color:#94a3b8;font-weight:700">1</td>
      <td><code>notes_to_iphone.json</code></td>
      <td>PC（gdrive.rs）</td>
      <td>iPhone SW<br>（push受信時）</td>
      <td>PC から iPhone へメモ本文と添付画像名を渡すために、未処理ノートを一時保存する。SW が受信して IndexedDB に保存後、当該 ID を除いて書き戻す（または全削除）する。</td>
    </tr>
    <tr>
      <td style="text-align:center;color:#94a3b8;font-weight:700">2</td>
      <td><code>notes_from_iphone.json</code></td>
      <td>iPhone<br>（useBackgroundSend）</td>
      <td>PC（gdrive.rs<br>30秒ポーリング）</td>
      <td>iPhone から PC へメモ本文、添付画像名、添付動画名を渡すために、未処理ノートを一時保存する。PC 受信後は処理済みアイテムを除いた残りのみ書き戻す。</td>
    </tr>
    <tr>
      <td style="text-align:center;color:#94a3b8;font-weight:700">3</td>
      <td><code>fusen_img_*.jpg</code></td>
      <td>iPhone<br>または PC</td>
      <td>受信側が処理後に削除</td>
      <td>Push ペイロードや JSON に大きな画像バイナリを直接入れないために、添付画像だけを一時ファイルとして保存する。受信側が IndexedDB または PC の <code>assets/</code> に保存後、削除する。</td>
    </tr>
    <tr>
      <td style="text-align:center;color:#94a3b8;font-weight:700">4</td>
      <td><code>fusen_video_*.mp4</code><br><code>fusen_video_*.mov</code></td>
      <td>iPhone<br>（useBackgroundSend）</td>
      <td>PC（gdrive.rs<br>30秒ポーリング）</td>
      <td>動画バイナリを JSON や付箋本文に埋め込まないために、添付動画を一時ファイルとして保存する。PC が <code>assets/video/</code> に保存し、付箋本文へ保存先パスを追記した後に削除する。</td>
    </tr>
    <tr>
      <td style="text-align:center;color:#94a3b8;font-weight:700">5</td>
      <td><code>push_keys.json</code></td>
      <td>PC（webpush.rs）<br>初回のみ作成</td>
      <td>iPhone（lib/push.ts）が<br>公開鍵を読む<br>PC（webpush.rs）が<br>秘密鍵を読む</td>
      <td>VAPID 鍵ペア。iPhone は公開鍵で Push 購読、PC は秘密鍵で送信時に署名する。鍵の所有者・目的・防衛手段は <a href="#sec3-0">3.0 鍵の前提</a>、詳細は <a href="#sec3-3-2-push-keys">表 3.3-4</a> を参照。</td>
    </tr>
    <tr>
      <td style="text-align:center;color:#94a3b8;font-weight:700">6</td>
      <td><code>push_devices.json</code></td>
      <td>iPhone（lib/push.ts）<br>が upsert</td>
      <td>PC（webpush.rs）が<br>全端末へ Push 送信</td>
      <td>PC が登録済み iPhone へ Push を送るために、端末ごとの <code>device_id</code> / <code>endpoint</code> / 暗号化鍵を保存する。複数端末へ送るために、端末一覧として保持する。</td>
    </tr>
    <tr>
      <td style="text-align:center;color:#94a3b8;font-weight:700">7</td>
      <td><code>pc_devices.json</code></td>
      <td>PC（Google連携完了時<br>または手動登録時）</td>
      <td>iPhone PWA<br>（送信直前に読む）</td>
      <td>iPhone から PC へ送るときの送信先 PC 名簿。PCごとの <code>pcId</code> / 表示名 / 更新時刻を保存する。PC起動時や受信ポーリング時に勝手に書き込まない。</td>
    </tr>
  </tbody>
</table>

<Note type="info">
<strong>Drive 一時ファイルの手動整理：</strong>
管理者ツールの「Drive 一時ファイル」では、<code>fusen_img_*</code> / <code>fusen_video_*</code> だけを一覧表示し、画像はサムネイル、その他はファイル名・更新日時・サイズを確認してから選択削除できる。
<code>notes_to_iphone.json</code> / <code>notes_from_iphone.json</code> から参照されている一時ファイルは「使用中」として保護し、選択削除の対象にしない。
設定ファイル（<code>push_keys.json</code> / <code>push_devices.json</code> / <code>pc_devices.json</code>）とキューJSONはこの機能では削除しない。
</Note>

### 3.3.1 複数 iPhone・複数 PC の接続モデル

同じ Google Drive の <code>ore-no-fusen</code> フォルダを共有領域として使い、複数 iPhone / iPad と複数 PC を接続できる。
現行仕様では、1台のPCアプリが同時に使える Google Drive は1つだけである。
同じPCから「iPhone A は Drive 1」「iPhone B は Drive 2」のように複数Driveを同時に使い分ける運用は非対応とする。
Driveを切り替える場合は、PC側でGoogle Driveを再接続し、そのDriveに登録されているiPhone / iPadが送信対象になる。

```mermaid
flowchart TD
    Threat["守りたいこと<br>悪意ある第三者や別鍵PCが<br>勝手にiPhoneへ通知しない"] --> Rule["そのためのルール<br>push_keys.json は<br>Drive上の1個だけを正にする"]

    Rule --> PC1["PC-A<br>Drive鍵で送信"]
    Rule --> PC2["PC-B<br>Drive鍵で送信"]
    Rule --> IP1["iPhone A<br>同じ公開鍵で購読"]
    Rule --> IP2["iPhone B<br>同じ公開鍵で購読"]

    IP1 --> Devices["push_devices.json<br>iPhoneごとの宛先"]
    IP2 --> Devices
    PC1 -->|"共有秘密鍵で署名"| APNs["APNs / Push Service<br>署名を検証"]
    PC2 -->|"共有秘密鍵で署名"| APNs
    Devices --> APNs
    APNs -->|"正しければ通知"| IP1
    APNs -->|"正しければ通知"| IP2
```

<p class="mermaid-caption">図 3.3.1-1　Push鍵は「勝手に通知されない」ために1個だけ共有する</p>

<Note type="info">
鍵の所有者・目的・防衛手段は <a href="#sec3-0">3.0 鍵の前提</a>、詳細仕様は <a href="#sec3-3-2-push-keys">表 3.3-4 push_keys.json</a> を参照。
</Note>

```mermaid
flowchart LR
    PC["PC<br>付箋を送る"] -->|"① notes_to_iphone.json<br>未処理キュー"| Drive["Google Drive<br>ore-no-fusen"]
    PC -->|"② push_devices.json<br>送信直前に再取得"| Drive
    PC -->|"③ 登録済み全端末へPush"| Push["APNs / FCM"]
    Push --> IP1["iPhone A<br>IndexedDBに保存"]
    Push --> IP2["iPhone B<br>IndexedDBに保存"]
    Push --> IP3["iPad<br>IndexedDBに保存"]
    Drive -.->|"フォールバック取得"| IP1
    Drive -.->|"フォールバック取得"| IP2
    Drive -.->|"フォールバック取得"| IP3
```

<p class="mermaid-caption">図 3.3.1-2　PC → iPhone は登録済み端末への同報送信</p>

<Note type="warning">
PC → iPhone は <code>push_devices.json</code> の登録端末へ同報送信する。現行仕様では個別 iPhone を選んで送る UI はない。
PC は送信直前に Drive から <code>push_devices.json</code> を再取得し、起動中に残った古いメモリキャッシュで送らない。
</Note>

```mermaid
flowchart LR
    IP["iPhone PWA<br>PCに送る"] -->|"① 送信直前に読む"| Devices["pc_devices.json<br>PC名簿"]
    Devices -->|"② 送信先PCを選ぶ"| IP
    IP -->|"③ notes_from_iphone.json<br>targetPcId=PC-B"| Drive["Google Drive<br>ore-no-fusen"]
    Drive -->|"30秒ポーリング"| PCA["PC-A<br>targetPcId不一致<br>触らない"]
    Drive -->|"30秒ポーリング"| PCB["PC-B<br>targetPcId一致<br>受信して削除"]
```

<p class="mermaid-caption">図 3.3.1-3　iPhone → PC は targetPcId で送信先PCを指定</p>

<Note type="info">
iPhone → PC は複数PCが同じ <code>notes_from_iphone.json</code> を読むため、送信先指定がないと取り合いになる。そのため <code>targetPcId</code> が必要。
</Note>

### 3.3.2 Drive JSON データ構成

表 3.3-1 に記載した各 JSON ファイルの構造は、この節に示す。
Drive 上の JSON は、以下の構成を基本とする。
実装上の参照元は、PC 側が `src-tauri/src/lib.rs` / `src-tauri/src/webpush.rs` / `src-tauri/src/gdrive.rs`、iPhone 側が `app/viewer/lib/push.ts` / `app/viewer/hooks/useBackgroundSend.ts` / `worker/index.js`。

<p class="table-caption">表 3.3-2　notes_to_iphone.json（PC → iPhone 未処理キュー）</p>

| No | フィールド | 型 | 必須 | 用途・内容 |
|:---|:---|:---|:---:|:---|
| 1 | `items` | `Object[]` | ○ | 未処理ノートの配列。最大20件を保持 |
| 2 | `items[].id` | `string` | ○ | ノートID（UUID） |
| 3 | `items[].title` | `string` | ○ | ノートの表示タイトル。空文字も保持し、通知名のフォールバックを保存データへ混入させない |
| 4 | `items[].body` | `string` | ○ | Markdown本文。画像は `fusen_img_*` 参照 |
| 5 | `items[].tags` | `string[]` | ○ | タグ一覧 |
| 6 | `items[].sent_at` | `string` | ○ | PC送信時刻 |
| 7 | `items[].received_at` | `null` | △ | 現行ソースが互換目的で出力している残項目。処理判定には使わない |

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "買い物",
      "body": "牛乳\n![photo](fusen_img_20260505_120000_0.jpg)",
      "tags": ["shopping"],
      "sent_at": "2026-05-05T12:00:00Z",
      "received_at": null
    }
  ]
}
```

<p class="table-caption">表 3.3-3　notes_from_iphone.json（iPhone → PC 未処理キュー）</p>

| No | フィールド | 型 | 必須 | 用途・内容 |
|:---|:---|:---|:---:|:---|
| 1 | `items` | `Object[]` | ○ | 未処理ノートの配列 |
| 2 | `items[].id` | `string` | ○ | ノートID（UUID） |
| 3 | `items[].title` | `string` | ○ | ノートタイトル |
| 4 | `items[].body` | `string` | ○ | Markdown本文。画像は `fusen_img_*` 参照。ユーザーが入力した本文であり、添付動画のファイル名で上書きしない |
| 5 | `items[].sent_at` | `string` | ○ | iPhone送信時刻 |
| 6 | `items[].tags` | `string[]` | ○ | タグ一覧 |
| 7 | `items[].images` | `Object[]` | △ | 添付画像一覧。各要素は Drive 一時ファイル名を持つ |
| 8 | `items[].videos` | `Object[]` | △ | 添付動画一覧。各要素は <code>{ videoFileName, originalFileName }</code> を持つ。複数動画可 |
| 9 | `items[].videoFileName` / `items[].originalFileName` | `string` | △ | 旧実装互換用の先頭動画情報。新規実装では <code>videos[]</code> を正とする |
| 10 | `items[].targetPcId` | `string` | △ | 複数PC接続時の送信先PC ID。未指定の旧データは従来互換として全PCが受信対象にできる |

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "外出先メモ",
      "body": "帰ったら確認\n![](fusen_img_20260505_120000_0.jpg)",
      "sent_at": "2026-05-05T12:00:00+09:00",
      "targetPcId": "pc-uuid",
      "tags": [],
      "videos": [
        {
          "videoFileName": "fusen_video_20260525_073000_0.mp4",
          "originalFileName": "dance.mp4"
        }
      ]
    }
  ]
}
```

<a id="sec3-3-2-push-keys"></a>
<p class="table-caption">表 3.3-4　push_keys.json（VAPID 鍵）の鍵プロファイル</p>

| 観点 | 値 |
|:---|:---|
| **所有者** | **ユーザー本人**（ユーザーが許可した全 PC・全 iPhone で共有する「許可された端末群の共有秘密」） |
| **目的** | 悪意ある第三者や別鍵PCが、ユーザーの iPhone へ偽通知を送れないようにする |
| **防衛手段** | Drive 上の 1 個を正とする。PC は送信時に Drive から秘密鍵を読み、メモリ上で署名に使う。iPhone は同じ鍵の公開鍵で購読する。PC ローカルには保存しない |
| **漏えい時** | 悪意ある第三者が「正規の通知」に見える Push を送れる可能性。付箋本文・添付メディアは別途 Drive 権限が必要なので読めないが、通知を送れること自体が被害。対応：Drive 上の `push_keys.json` を作り直し、iPhone 側で再購読する |
| **欠落時** | PC は VAPID 署名を作れず Push 送信不可。iPhone 受信は list 画面でのフォールバック取得頼みになる |

<Note type="warning">
<strong>同期ルール：</strong>
Drive 鍵を正とし、PC は送信時に Drive から読み込んでメモリ上で使う。
<strong>PC ローカルに push_keys.json を保存しない。</strong>
Drive に共有鍵が存在しない初回セットアップ時だけ、新規生成して Drive へ保存する。
</Note>

<p class="table-caption">表 3.3-4-2　push_keys.json フィールド</p>

| No | フィールド | 型 | 必須 | 用途 |
|:---|:---|:---|:---:|:---|
| 1 | `public_key_b64url` | `string` | ○ | iPhone が `pushManager.subscribe()` の `applicationServerKey` に渡す |
| 2 | `private_key_b64url` | `string` | ○ | PC が VAPID JWT に署名し `Authorization: vapid t=...,k=...` として送る |
| 3 | `subject` | `string` | ○ | VAPID JWT の `sub`。現行値は `mailto:ore-no-fusen@example.com` |

```json
{
  "public_key_b64url": "BASE64URL_PUBLIC_KEY",
  "private_key_b64url": "BASE64URL_PRIVATE_KEY",
  "subject": "mailto:ore-no-fusen@example.com"
}
```

<p class="table-caption">表 3.3-5　push_devices.json 内 ECDH 鍵（`keys.p256dh` / `keys.auth`）の鍵プロファイル</p>

| 観点 | 値 |
|:---|:---|
| **所有者** | 個々の iPhone（端末ごとに 1 組） |
| **目的** | Push 通知本文の暗号化。iPhone 自身だけが本文を復号できるようにする |
| **防衛手段** | iPhone が購読時に生成し、Drive の `push_devices.json` に upsert。PC は送信時にその鍵で本文を暗号化する |
| **漏えい時** | その iPhone への暗号化済み通知の本文を悪意ある第三者が復号できる可能性。VAPID 鍵（送信権）とは別軸。対応：iPhone PWA で再購読し、新しい鍵で `push_devices.json` を更新 |
| **欠落時** | PC は暗号化済み通知を作れず、その iPhone への送信が失敗する |

<p class="table-caption">表 3.3-5-2　push_devices.json フィールド</p>

| No | フィールド | 型 | 必須 | 用途・内容 |
|:---|:---|:---|:---:|:---|
| 1 | `devices` | `Object[]` | ○ | 登録済み端末の配列 |
| 2 | `devices[].device_id` | `string` | ○ | 端末ID。iPhone PWA が `localStorage` に保持 |
| 3 | `devices[].endpoint` | `string` | ○ | APNs / Push Service の送信先URL |
| 4 | `devices[].keys.p256dh` | `string` | ○ | Push 暗号化用の公開鍵（ECDH） |
| 5 | `devices[].keys.auth` | `string` | ○ | Push 暗号化用の認証シークレット |
| 6 | `devices[].registered_at` | `string` | ○ | 登録時刻 |
| 7 | `devices[].device_name` | `string` | △ | 表示用端末名 |
| 8 | `devices[].google_account_email` | `string` | △ | Drive接続アカウントのメール |
| 9 | `devices[].google_account_name` | `string` | △ | Drive接続アカウント名 |
| 10 | `devices[].google_account_photo` | `string` | △ | Drive接続アカウントの画像URL |

```json
{
  "devices": [
    {
      "device_id": "uuid",
      "endpoint": "https://web.push.apple.com/...",
      "keys": {
        "p256dh": "BASE64URL_P256DH",
        "auth": "BASE64URL_AUTH"
      },
      "registered_at": "2026-05-05T12:00:00+09:00",
      "device_name": "iPhone",
      "google_account_email": "user@example.com"
    }
  ]
}
```

<Note type="info">
<code>push_devices.json</code> は旧スキーマ <code>{ endpoint, keys, created_at }</code> が残っていても、iPhone 側と PC 側で新スキーマへ読み替える。
</Note>

<p class="table-caption">表 3.3-6　pc_devices.json（iPhone → PC 送信先一覧）</p>

| No | フィールド | 型 | 必須 | 用途・内容 |
|:---|:---|:---|:---:|:---|
| 1 | `pcs` | `Object[]` | ○ | 登録済みPCの配列 |
| 2 | `pcs[].pcId` | `string` | ○ | PCを一意に識別するID。PC側ローカルにも保持し、受信時の自分宛判定に使う |
| 3 | `pcs[].pcName` | `string` | ○ | PWAの送信先プルダウンに表示するPC名 |
| 4 | `pcs[].registeredAt` | `string` | △ | 初回登録時刻 |
| 5 | `pcs[].updatedAt` | `string` | △ | 最終更新時刻 |
| 6 | `pcs[].googleAccountEmail` | `string` | △ | どのGoogleアカウントで登録されたPCかを確認するためのメールアドレス |

PWA の通常画面では、ユーザーに `pcId` を選ばせない。送信先は「家のPC」「会社のPC」のような `pcName` で選ばせる。同じ `pcName` の登録が複数ある場合は、PWA側で `updatedAt` が最も新しい登録を採用し、古い同名登録は通常候補に出さない。`pcId` は受信判定とトラブル診断用の内部IDであり、通常操作の判断材料にしない。

```json
{
  "pcs": [
    {
      "pcId": "pc-uuid",
      "pcName": "DESKTOP-01",
      "registeredAt": "2026-05-29T12:00:00+09:00",
      "updatedAt": "2026-05-29T12:00:00+09:00",
      "googleAccountEmail": "user@example.com"
    }
  ]
}
```

---

## 4 データフロー

PC→iPhone の初回セットアップ、初回以降の通常送信、iPhone→PC送信、通知ON/OFFのシーケンス図を示します。

### 4.1 PC → iPhone 初回セットアップと通常送信

初回は、ユーザーがPCで「iPhoneに送る」を押したことをきっかけに設定画面へ誘導し、PC側でGoogle Drive接続と `push_keys.json` の準備を行ってから、iPhone PWAをセットアップします。
「iPhoneに送る」は右クリックメニューに常に表示し、未設定のときは送信せず設定画面の iPhone 連携タブへ直行します。
初回以降は、PCの「iPhoneに送る」操作だけで通知が届きます。

<Note type="info">
シーケンス図では、<strong>①②③</strong> はユーザーが実施する操作、<strong>❶❷❸</strong> はアプリ・Drive・Service Worker が自動実行する処理を表します。
</Note>

```mermaid
%%{init: {'sequence': {'messageMargin': 8, 'mirrorActors': false, 'height': 24, 'boxMargin': 4, 'noteMargin': 6}}}%%
sequenceDiagram
    actor UserPC as ユーザー（PC）
    box PC アプリ
        participant PC as 1⃣ PC アプリ
    end
    box Google Drive / APNs
        participant Drive as 4⃣ Google Drive
        participant APNs as 7⃣ APNs / FCM
    end
    box iPhone PWA
        participant PWA as 2⃣ iPhone PWA
    end
    box Service Worker
        participant SW as 3⃣ Service Worker
    end
    box Vercel / Google OAuth2
        participant Vercel as 5⃣ Vercel
        participant OAuth as 6⃣ Google OAuth2
    end
    actor UserPhone as ユーザー（iPhone）

    rect rgb(240, 253, 244)
        Note over UserPC,UserPhone: 初回セットアップ（①〜⑤）
        UserPC->>PC: ① 付箋を右クリック →「iPhoneに送る」
        PC->>PC: ❶ iPhone送信の準備不足を検出
        PC->>UserPC: ❷ 設定画面 > iPhone連携へ誘導
        UserPC->>PC: ② PC側でGoogle Driveを許可
        PC->>Drive: ❸ push_keys.json を確認<br>既存ならDrive鍵を使用、無ければ初回生成
        PC->>UserPC: ❹ QRコードと次の手順を表示

        UserPhone->>PWA: ③ Safariで /viewer を開く → ホーム画面に追加 → PWA起動
        UserPhone->>PWA: ④ PWA側でGoogle Driveを許可
        PWA->>OAuth: ❺ PKCE OAuth リダイレクト
        OAuth->>PWA: ❻ ?code=... コールバック
        PWA->>Vercel: ❼ POST /api/auth/token
        Vercel->>OAuth: ❽ トークン交換
        OAuth-->>Vercel: ❾ access_token + refresh_token
        Vercel-->>PWA: ❿ トークン返却 → localStorage に保存

        UserPhone->>PWA: ⑤ 通知を許可する
        PWA->>Drive: ⓫ push_keys.json から VAPID 公開鍵を取得
        PWA->>SW: ⓬ Service Worker 登録 + Push購読
        SW-->>PWA: ⓭ endpoint + keys
        PWA->>Drive: ⓮ push_devices.json に端末情報とGoogleアカウントを upsert
        PWA->>UserPhone: ⓯ セットアップ完了 → list 画面へ
    end

    rect rgb(239, 246, 255)
        Note over UserPC,UserPhone: 初回以降の通常送信
        UserPC->>PC: ① 付箋を右クリック →「iPhoneに送る」
        PC->>Drive: ❶ notes_to_iphone.json を読み込み<br>取得失敗時は既存キュー保護のため中止
        PC->>Drive: ❷ fusen_img_*.jpg を書き込み（添付画像）
        PC->>Drive: ❸ notes_to_iphone.json を保存
        PC->>Drive: ❹ push_devices.json を送信直前に再取得
        PC->>APNs: ❺ Web Push送信（push_keys.json の秘密鍵でVAPID認証）
        APNs->>SW: ❻ Push受信
        SW->>Drive: ❼ 添付画像をダウンロード
        SW->>SW: ❽ ノートをIndexedDBに保存
        SW->>Drive: ❾ 処理済みファイルを削除
        SW->>UserPhone: ❿ ロック画面に通知を表示
        UserPhone->>PWA: ② 通知をタップ
        PWA->>PWA: ⓫ pending_open を確認<br>IndexedDBからノートデータを読み込み
        PWA->>UserPhone: ⓬ write画面でノートを表示
    end
```
<p class="mermaid-caption">図 3-3　PC → iPhone 初回セットアップと通常送信シーケンス</p>

### 4.2 PC → iPhone 受信の補足

図 3-3 の初回セットアップで `push_keys.json` と `push_devices.json` が準備済みであれば、以降はPC側の「iPhoneに送る」操作だけで送信できます。

- `push_keys.json`：Drive 上の 1 個を正とする Web Push 用共有VAPID鍵。iPhoneは公開鍵を使ってPush購読し、PCは送信時にDriveから秘密鍵を読み、メモリ上でWeb Push署名に使う。PCローカルには保存しない。
- `push_devices.json`：iPhone側が作成・更新する通知先デバイス一覧。PCは送信直前に Drive から再取得し、この一覧を見て送信先を決める。
- `notes_to_iphone.json`：PCからiPhoneへ渡す未処理キュー。Service Workerが受信後に処理済みファイルを削除する。

<Note type="warning">
<strong>送信時のエラー保護：</strong>
PC は <code>notes_to_iphone.json</code> の読み込みに失敗した場合、空配列で上書きしない。
Drive 上に既存の未処理キューがある可能性を優先し、送信を中止してエラーを返す。
また、<code>notes_to_iphone.json</code> の保存が成功してから Web Push を送る。
Web Push 送信直前には <code>push_devices.json</code> を Drive から再取得し、PC起動中に残った古い購読情報キャッシュによる VAPID 鍵不一致を避ける。
Push 失敗時は APNs / Push Service のステータスを見て、400（鍵・購読不整合）、404/410（購読期限切れ）、413（本文過大）、429（送信過多）、5xx/通信失敗を分けて表示する。
</Note>

<Note type="info">
<strong>body_rich：</strong>Markdown 本文（画像タグ含む）は Push ペイロードに直接含まれる。
Drive へのフェッチは画像バイナリのダウンロードのみ。JSON の再取得は不要。
PC付箋の先頭行が画像Markdownの場合はタイトルへ分離せず本文に残し、画像をDriveへアップロードして <code>fusen_img_*</code> 参照へ変換する。
</Note>

<Note type="warning">
<strong>ユーザー体験の全体像（<a href="./000_REQUIREMENTS#sec9-4-iphoneロック画面常駐体験">REQ_IP_05</a>）：</strong>
図 3-3 の通常送信は、送信〜初回表示までを示す。通知をタップした後も再通知されロック画面から消えない体験、および OFF 操作は 4.4 を参照。
</Note>

### 4.3 iPhone → PC 送信（ユーザー体験 + 内部処理）

iPhoneのwrite画面で「PCに送る」を押した瞬間から、PCに新しい付箋が開くまでの全体フロー。

```mermaid
%%{init: {'sequence': {'messageMargin': 8, 'mirrorActors': false, 'height': 24, 'boxMargin': 4, 'noteMargin': 6}}}%%
sequenceDiagram
    actor UserPC as ユーザー（PC）
    box PC アプリ
        participant PC as 1⃣ PC アプリ
    end
    box Google Drive
        participant Drive as 4⃣ Google Drive
    end
    box iPhone PWA
        participant PWA as 2⃣ iPhone PWA
    end
    actor UserPhone as ユーザー（iPhone）

    Note over UserPhone: メモを書いている
    UserPhone->>PWA: ① 「PCに送る」ボタン
    PWA->>PWA: ❶ トークン期限を確認<br>必要なら /api/auth/refresh
    PWA->>Drive: ❷ fusen_img_*.jpg / fusen_video_* を並列アップロード（添付がある場合）
    PWA->>Drive: ❸ notes_from_iphone.json を取得<br>旧スキーマなら配列へ変換
    PWA->>Drive: ❹ notes_from_iphone.json に追記して上書き
    PWA->>PWA: ❺ IndexedDB に sent_at を保存
    PWA->>UserPhone: ❻ 送信完了を表示
    Note over UserPhone: iPhoneの操作はここまで

    Note over Drive,PC: 30秒ポーリングで自動検出
    PC->>Drive: ❼ notes_from_iphone.json を確認
    Drive-->>PC: ❽ 新着データ + 画像/動画ファイル名
    PC->>Drive: ❾ fusen_img_*.jpg / fusen_video_* をダウンロード
    PC->>PC: ❿ 受信IDハッシュを確認<br>未保存なら Vault に .md / assets / assets/video を保存
    PC->>Drive: ⓫ 処理済みアイテムまたはキューファイルを削除
    PC->>Drive: ⓬ fusen_img_*.jpg / fusen_video_* を削除
    PC->>UserPC: ⓭ 新規付箋ウィンドウを開く
    UserPC->>PC: ② 内容を確認する
```
<p class="mermaid-caption">図 3-4　iPhone → PC 送信シーケンス</p>

<Note type="success">
<strong>「iPhoneに置いておく」との違い：</strong>Drive を使わない。テキスト＋画像＋動画を IndexedDB のみに保存。PC への送信は発生しない。
</Note>

<Note type="warning">
<strong>本文保護：</strong>ユーザーが入力した <code>body</code> と、添付ファイルの元ファイル名・Drive 一時ファイル名・PC 保存パスは別の情報として扱う。
動画を選んでも本文をファイル名で上書きしてはならない。PC 受信時は既存本文の後ろに保存先パスを追記する。
</Note>

<Note type="warning">
<strong>送信キュー保護：</strong>iPhone PWA は <code>notes_from_iphone.json</code> の読み込みに失敗した場合、空配列で上書きしない。
ファイル未作成の場合だけ空キューとして扱い、それ以外の Drive 失敗では送信を中止する。
これにより、一時的な Drive エラーで他の未処理送信を消さない。
</Note>

<Note type="warning">
<strong>PC再受信時の重複防止：</strong>PCは受信IDをハッシュ化して作成した付箋の管理情報へ保存する。
PC保存後、Driveの処理済み更新前にアプリが終了して同じIDを再受信した場合は、新しい付箋や添付ファイルを作らず、Driveの処理済み更新だけを再試行する。
</Note>

### 4.4 ロック画面に表示 ON/OFF と再通知サイクル（<a href="./000_REQUIREMENTS#sec9-4-iphoneロック画面常駐体験">REQ_IP_05</a>）

「消す意思がないかぎりロック画面から消えない」体験を実現する ON/OFF 操作と、タップ後の再通知サイクル。
シーケンス図では、<strong>①②③</strong> はユーザーが実施する操作、<strong>❶❷❸</strong> は PWA・Service Worker・IndexedDB が自動実行する処理を表します。

<Note type="warning">
<strong>iOS の制約：</strong><code>notificationclick</code> イベントは iOS では発火しない（既知の仕様制約）。
そのため「タップ → 再通知」を SW で直接処理できない。
代わりに push 受信時に <code>pending_open</code> を記録しておき、
アプリ復帰時に <code>page.tsx</code> が <code>locked: true</code> を確認して再通知する。
</Note>

<div class="seq-small">

```mermaid
%%{init: {'sequence': {'messageMargin': 8, 'mirrorActors': false, 'height': 24, 'boxMargin': 4, 'noteMargin': 6}}}%%
sequenceDiagram
    actor UserPhone as ユーザー（iPhone）
    box iPhone PWA
        participant PWA as 2⃣ page.tsx
    end
    box Service Worker
        participant SW as 3⃣ Service Worker
    end

    Note over SW,UserPhone: 常駐サイクル（locked: true が前提）

    SW->>SW: ❶ push 受信 → IndexedDB 保存（locked: true）
    SW->>SW: ❷ pending_open {id} を fusen-meta に保存
    SW->>UserPhone: ❸ 🔔 ロック画面に通知を表示

    UserPhone->>PWA: ① 通知をタップ → iOS がアプリを直接起動
    Note over UserPhone,PWA: notificationclick は発火しない（iOS 制約）
    PWA->>PWA: ❹ visibilitychange 発火
    PWA->>PWA: ❺ pending_open 確認 → id あり・30 分以内
    PWA->>PWA: ❻ pending_open 削除
    PWA->>PWA: ❼ IndexedDB から draft 取得 → locked === true
    PWA->>SW: ❽ reg.showNotification()
    SW->>UserPhone: ❾ 🔔 通知を再表示（ロック画面から消えない）
    PWA->>UserPhone: ❿ 付箋の内容を表示（write 画面）

    Note over SW,UserPhone: ① と ❹〜❿ を繰り返す（タップのたびに再通知）

    Note over PWA,UserPhone: ユーザーが明示的に OFF にする
    UserPhone->>PWA: ② 🔔 ボタンをタップ（list 画面）
    alt 🔕 OFF にする（locked: true → false）
        PWA->>PWA: ⓫ IndexedDB に locked: false を保存
        PWA->>SW: ⓬ getNotifications → close()
        SW->>UserPhone: ⓭ 🔕 ロック画面の通知が消える
    else 🔔 ON にする（locked: false → true）
        PWA->>PWA: ⓫ IndexedDB に locked: true を保存
        PWA->>SW: ⓬ showNotification()
        SW->>UserPhone: ⓭ 🔔 ロック画面に常駐再開
    end
```
<p class="mermaid-caption">図 3-5　ロック画面常駐サイクル（ON/OFF と再通知の実装フロー）</p>
</div>

<Note type="info">
<strong>pending_open の役割：</strong>SW は push 受信時に通知を表示する直前に
<code>fusen-meta</code> へ <code>{id, t}</code> を保存する。
これが「直近の通知 ID の痕跡」となり、アプリ復帰時に
<code>page.tsx</code> が「通知からの起動である」と判断できる唯一の根拠になる。
30 分で失効。読んだら即削除。
</Note>

<Note type="success">
<strong>locked の初期値：</strong>push 受信時の IndexedDB 保存で <code>locked: true</code> を設定する（SW の <code>saveToIndexedDB</code>）。
ユーザーが 🔔 ボタンを押す前から ①〜③ のサイクルが自動で有効になる。
</Note>

<Note type="warning">
<strong>通知を消せるのは SW だけ：</strong>表示済みの通知を非表示にするには
<code>registration.getNotifications()</code> で取得して <code>n.close()</code> を呼ぶ必要がある。
<code>useLockToggle</code> は SW へのメッセージ送信でこれを実現する。
</Note>

---

## 5 UI インタラクション

<Note type="info">
iPhone PWA は「リストモード」と「ライトモード」の 2 画面構成をベースに、タップ・アイコン操作で全機能にアクセスできる。
</Note>

### 5.1 画面モード定義

リスト・ライトの 2 モードとその遷移条件を定義します。

<p class="table-caption">表 5.1-1　画面モード定義</p>

| No | モード | 状態 | 遷移トリガー |
|:---|:---|:---|:---|
| 1 | **リストモード** | Drive から同期した付箋を一覧表示している状態 | ライトモードから一覧を開く |
| 2 | **ライトモード** | 1 枚の付箋を全画面で編集している状態（800ms 自動保存） | 通常起動、通知タップ、またはリストの付箋タップ・＋ボタン |

```mermaid
graph LR
    classDef list  fill:#e2e8f0,stroke:#94a3b8,color:#1e293b,font-size:13px
    classDef write fill:#ede9fe,stroke:#a78bfa,color:#3b0764,font-size:13px

    L["リストモード"]:::list
    W["ライトモード"]:::write

    L -->|"付箋タップ / +ボタン"| W
    W -->|"戻る（保存確定）"| L
```
<p class="mermaid-caption">図 3-6　画面モード遷移図</p>

### 5.2 各モードの操作一覧

<p class="table-caption">表 3-10　リストモードの操作</p>

| No | 操作 | 対象 | 結果 |
|:---|:---|:---|:---|
| 1 | タップ | 付箋アイテム | ライトモードへ遷移 |
| 2 | 🔔 タップ | ロック画面に表示ボタン | `locked` フラグの ON/OFF 切り替え |
| 3 | 🗑️ タップ | 削除ボタン | 確認ダイアログ → Drive から削除 |
| 4 | ＋ タップ | 新規ボタン | 空のライトモードへ遷移 |

<p class="table-caption">表 3-11　ライトモードの操作</p>

| No | 操作 | 対象 | 結果 |
|:---|:---|:---|:---|
| 1 | 文字入力 | エディタ | 800ms debounce で自動保存 |
| 2 | 画像貼り付け | エディタ | IndexedDB に保存・プレビュー表示 |
| 3 | ← タップ | 戻るボタン | リストモードへ遷移（保存確定） |
| 4 | 本文画像をタップ | 画像 | 黒背景の全画面プレビューを表示。背景または閉じるボタンで戻る |

### 5.3 インタラクション・マトリックス

<p class="table-caption">表 5.3-1　インタラクション・マトリックス</p>

| No | 操作 | リストモード | ライトモード |
|:---|:---|:---|:---|
| 1 | タップ | ライトモードへ | - |
| 2 | 🔔 | locked ON/OFF | - |
| 3 | 🗑️ | 削除確認ダイアログ | - |
| 4 | 文字入力 | - | 自動保存 |
| 5 | ← 戻る | - | リストモードへ |
| 6 | 画像タップ | - | 全画面プレビュー |

---

## 6 機能一覧

画面ごとの機能と、各機能の設計意図を記します。

### 6.1 メモ一覧画面（list）

<p class="table-caption">表 6.1-1　メモ一覧画面の機能</p>

| No | 機能 | 設計意図・工夫 |
|:---|:---|:---|
| 1 | Drive → IndexedDB 同期 | 一覧を開いたらIndexedDBの保存済み一覧を先に表示し、Drive通信を待たせない。その後 `notes_to_iphone.json` をバックグラウンドで取得し、ローカルにない新着ノートをIndexedDBへ取り込んで一覧を更新する。取り込み後はDriveファイルを削除（Drive = 未処理キュー）。Drive失敗時は先に表示したIndexedDBの一覧を維持する |
| 2 | 画像サムネイル | 添付画像がある場合、IndexedDB の Blob から `URL.createObjectURL()` で URL を生成してサムネイルを表示。アンマウント時に `URL.revokeObjectURL()` で解放する |
| 3 | ステータスバッジ | draft（下書き）/ sent（PC送信済み）/ PC受信 の3状態を `sent_at` フィールドの有無と `received_pc` フラグで判定して色分け表示する |
| 4 | 相対時間表示 | `created_at` から「3分前」「1時間前」「昨日」の形式に変換（`formatRelativeTime()`）。 数字と絶対時刻を並べるより一目で新鮮度がわかる |
| 5 | 🔔/🔕 ロック画面常駐 | 後述（6.2）|
| 6 | 🗑️ 削除 | 削除 ID を `fusen-meta` に記録してから IndexedDB から削除し、`notes_to_iphone.json` の同 ID だけを除去する。Drive処理が遅延・失敗してキューが残っても、削除 ID は一覧同期の再取込対象外とし、他の未配達ノートは保持する |
| 7 | ＋ 新規作成 | 新しい下書き ID を `crypto.randomUUID()` で生成し write 画面へ遷移 |
| 8 | 🔔 デバイス再登録（フッター） | `silentReRegisterIfNeeded()` を呼び出し、`push_devices.json` に自デバイスが存在しない場合のみ静かに再登録する。既存デバイスがいれば何もしない |

### 6.2 ロック画面常駐（🔔）

このアプリの核心機能。「消す意思がないかぎり、ロック画面から消えない」体験を実現する。

<p class="table-caption">表 6.2-1　ロック画面常駐の仕組みと設計意図</p>

| No | 観点 | 設計意図・工夫 |
|:---|:---|:---|
| 1 | 通知表示の方式 | iOS ではメインスレッドの `new Notification()` が動かない。`navigator.serviceWorker.ready` → `reg.showNotification()` を使う。これが iOS で通知を出せる唯一の方法 |
| 2 | 重複防止 | `reg.getNotifications()` で既存通知を取得し、同じ `data.id` を持つものをすべて `n.close()` してから新規通知を表示する |
| 3 | タイトル・本文の生成 | `# タイトル` 行があれば it を通知タイトルに。なければ本文冒頭20文字をタイトルに使う。本文から画像タグ `![](...)` を正規表現で除去してから40〜60文字を表示する |
| 4 | 楽観的更新 | ボタンを押した瞬間に UI の 🔔/🔕 を切り替える。SW 操作や IndexedDB 書き込みに失敗した場合のみロールバックする。ユーザーに「レスポンスが遅い」と感じさせない |
| 5 | 通知権限の動的確認 | `Notification.permission === 'default'` なら許可ダイアログを表示。`denied` なら UI を元に戻してエラーを表示する |
| 6 | 通知を消す権限 | ロック解除時に `reg.active?.postMessage({ type: 'CLOSE_NOTIFICATION', tag })` で SW に通知クローズを依頼する。メインスレッドは通知を直接閉じられない |
| 7 | locked フラグの永続化 | `locked: true/false` を IndexedDB に書き込む。次回 Push 受信時に SW がこの値を参照して再通知を行うかどうかを決める |
| 8 | 効果音 | ON 時は `bell_on.wav`、OFF 時は `bell_off.wav` を `Audio` API で再生。操作の結果をユーザーが音で確認できる |

### 6.3 メモ編集画面（write）

<p class="table-caption">表 6.3-1　メモ編集画面の機能</p>

| No | 機能 | 設計意図・工夫 |
|:---|:---|:---|
| 1 | contenteditable エディタ | `contentEditable="true"` の `div` で実装。React の `value/onChange` モデルを使わず DOM を直接操作。`serializeEditor()` が HTML → Markdown 形式に変換する |
| 2 | 3秒自動保存 | 入力のたびにタイマーをリセット。3秒間入力がなければ IndexedDB に保存（`useAutoSave`）。Drive は使わない。ネットワーク不要・オフライン動作 |
| 3 | バックグラウンド遷移時の強制保存 | `visibilitychange` で非表示になった瞬間にも保存（`useVisibilitySave`）。アプリを閉じてもデータが消えない |
| 4 | 📷 画像添付 | ファイル選択 → `CropModal` でトリミング → IndexedDB に Blob 保存 → `buildImageFileName()` でファイル名生成 → カーソル位置に `![]()` を挿入。PCへ送るときに Drive に実際にアップロードされる |
| 5 | 🔷 Mermaid | `MermaidModal` でフローチャートのコードを書いて確定するとエディタに挿入される |
| 6 | ☑ チェックボックス | カーソルのある行を `data-checkbox-line` 属性を持つ `<span>` に変換（再押しで解除）。行頭が IMG ノードの場合は次の兄弟ノードに処理を移す特殊ケース対応あり |
| 7 | 🏷️ タグ | タグバーを展開。Enter または Space で確定。過去に入力したタグを `localStorage（fusen_known_tags）` から自動サジェスト。送信時に `mergeKnownTags()` で履歴に追加 |
| 8 | ← 一覧に戻る | 内容がある場合は IndexedDB に下書き保存してから list 画面へ遷移。保存はサイレントに行われ、確認ダイアログは不要 |
| 9 | 「iPhoneに置いておく」 | Drive を一切使わず IndexedDB のみに保存。ネットワーク不要。削除するまで端末に残り続ける |
| 10 | 「PCへ送る」 | 後述（6.4）|
| 11 | 🎬 VideoDrop | `mp4` / `mov` を選択して現在の付箋に添付し、「PCへ送る」を押したときに Drive 経由で PC へ送る。画像と同じく付箋の添付部品であり、選択時に本文を上書きしない。PC側で `assets/video/` に保存された絶対パスを付箋本文の末尾へ追記する |
| 12 | 画像全画面プレビュー | 本文内の画像をタップすると、保存済みBlob URLを黒背景のオーバーレイへ縦横比を維持して最大表示する。プレビューは表示だけで、本文・画像Blob・送信内容を変更しない |

### 6.4 「PCへ送る」

<p class="table-caption">表 6.4-1　PCへ送る の処理ステップ</p>

| No | ステップ | 設計意図・工夫 |
|:---|:---|:---|
| 1 | ① トークン有効期限確認 | `viewer_expires_at` と `Date.now()` を比較。**期限5分前**を切っていたら送信前に Vercel `/api/auth/refresh` を呼んでトークンを更新する。送信中に突然期限切れにならないための先読み更新 |
| 2 | ② セッション切れ処理 | リフレッシュが失敗した場合は localStorage のトークンを削除し、login 画面へ遷移。エラーメッセージを5秒表示して消す |
| 3 | ③ 添付アップロード | 添付画像・動画を `Promise.all()` で並列アップロード。直列より速い |
| 4 | ④ キューへの追記 | `notes_from_iphone.json` を Drive から読み取り、既存アイテムの末尾に新しいアイテムを追加して上書き（read-modify-write）。旧スキーマのファイルが残っていても自動変換して引き継ぐ後方互換処理あり |
| 5 | ⑤ IndexedDB に sent を記録 | 送信後、同 ID のレコードに `sent_at` をセットして IndexedDB を更新。一覧画面に「送信済み」バッジが表示される |
| 6 | ⑥ 成功フィードバック | 3秒間 `backgroundSendSuccess = true` にして UI に成功インジケータを表示。その後自動で消える |
| 7 | ⑦ VideoDrop | 🎬で選ばれた動画は選択時点では送信しない。「PCへ送る」時に `fusen_video_*.mp4/mov` として Drive へアップロードし、キューには `videos[]` を入れる。PC側は受信時に `assets/video/` へ保存し、本文にはクリック可能な絶対パスを末尾へ追記し、ack後にDrive上の一時動画を削除する |

### 6.5 通知許可・デバイス登録（push 画面）

<p class="table-caption">表 6.5-1　プッシュ通知登録の処理ステップ</p>

| No | ステップ | 設計意図・工夫 |
|:---|:---|:---|
| 1 | ① 通知権限取得 | `Notification.requestPermission()` で OS レベルの許可ダイアログを表示。拒否された場合はエラーを表示して処理を停止 |
| 2 | ② 購読の再生成 | 既存の Push 購読があれば一度 `unsubscribe()` してから再登録する。クリーンな状態を保つためのリセット処理 |
| 3 | ③ VAPID 鍵での購読 | Drive の `push_keys.json` から `public_key_b64url` を取得し、その公開鍵を使って `pushManager.subscribe()` を実行。この公開鍵は PC 側の WebPush 送信時に使う `private_key_b64url` と対になる。`push_keys.json` が未作成の場合は、PC 側で Drive 接続後に iPhone 送信準備を行うよう案内する |
| 4 | ④ デバイス ID の永続化 | `crypto.randomUUID()` で端末固有の `device_id` を生成。localStorage に保存し以降の再登録でも同一 ID を使う |
| 5 | ⑤ push_devices.json への upsert | Drive から `push_devices.json` を取得し、同 `device_id` のエントリを更新（または新規追加）して上書き保存。旧スキーマ（`endpoint` 直下方式）は自動的に新スキーマに移行する |

---

## 7 エラーハンドリング・リカバリ方針

<Note type="info">
各エラーケースの実施状況。<span style="color:#dc2626;font-weight:700">⚠️ 未実施</span> は現時点での課題。
</Note>

### 7.1 通信・認証エラー

#### 7.1.1 Drive API エラーとトークン自動更新
Drive API 呼び出し（ダウンロードやアップロード）が失敗した場合、<code>drive.ts</code> 内の <code>downloadWithAutoRefresh</code> 等によりトークンの自動リフレッシュが試行される（実施済み）。
リフレッシュにも失敗した場合は例外がスローされ、呼び出し元の React コンポーネント側でキャッチされる。
送信・通知設定・ログインなどユーザー操作に紐づく失敗は画面上のエラーメッセージとして表示する（実施済み）。
ただし、一覧表示時の Drive 同期失敗はフォールセーフとして IndexedDB の既存データだけで表示を続け、ユーザー操作を妨げる割り込み表示は行わない。

#### 7.1.2 認証切れ時のフォールバック
トークンリフレッシュ（Vercel API <code>/api/auth/refresh</code>）が 4xx 等で失敗し、リフレッシュトークン自体が失効していると判定された場合、<code>localStorage</code> からトークン情報を破棄し <code>null</code> を返す。
これによりアプリは未認証状態とみなされ、自動的にログイン画面（<code>login</code> ステップ）へフォールバックする（実施済み）。

#### 7.1.3 PCアプリ側での Drive API 失敗（gdrive.rs）
PC アプリ（Rust）が Drive API 呼び出しに失敗した場合、<code>Err(String)</code> を返して Tauri コマンド経由でPCフロントエンドにエラーを通知する。
PC側のアクセストークンは期限到来の 60 秒前に自動リフレッシュされ、失敗時は「Googleの認証が切れました」と返す。
PC→iPhone 送信などユーザー操作から発生した失敗は、PCフロントエンド側でエラー表示する（実施済み）。
汎用トーストではなく、操作元のUIで成功トーストまたは失敗ダイアログとして表示する。

#### 7.1.4 PCからの Web Push 送信失敗
PC アプリから APNs / FCM へのプッシュ送信が失敗した場合（201 以外の HTTP ステータス）、エラーコードを含む <code>Err</code> を返す。
PC は送信直前に <code>push_devices.json</code> を Drive から再取得し、古いメモリキャッシュによる VAPID 鍵不一致を事前に避ける（実施済み）。
429 / 5xx / timeout / reqwest error など一時的な失敗は、短い待機を挟んで最大3回まで自動リトライする（実施済み）。
400 / 404 / 410 / 413 など設定不整合・購読期限切れ・本文過大に分類できる失敗は、リトライしても回復しないため即時にエラーとして返す。
エラー表示では APNs / Push Service のステータスごとに原因カテゴリを分け、ユーザーが取れる操作（Drive再接続、PWA再インストール、通信確認など）を示す。

### 7.2 バックグラウンド処理・リカバリ

#### 7.2.1 Push 受信時のフォールバック（画像DL失敗時）
Service Worker (<code>worker/index.js</code>) 内での Push 受信処理では、画像（<code>fusen_img_*</code>）の Drive ダウンロードがネットワークエラー等で失敗した場合でも**処理を中断しない**フェイルセーフ機構がある。
画像取得に失敗した場合でも、テキスト本文のみを IndexedDB（<code>fusen-drafts</code>）に保存し、ユーザーへの OS 通知を確実に表示する（実施済み）。

#### 7.2.2 デバッグログの運用方針（fusen-logs）
UIを持たない Service Worker 内で発生した処理結果やエラー（トークン取得失敗、画像保存失敗など）は、IndexedDB の <code>fusen-logs</code> ストアに対して <code>fire-and-forget</code> で記録される（実施済み）。
後から Chrome DevTools 等で内部状態や Push 受信時のエラー原因を追跡できるようになっている。

#### 7.2.3 iOS特有の制約とリカバリサイクル
iOS の PWA 環境では、バックグラウンドでの通知タップ時（<code>notificationclick</code> イベント）が正常に発火しない・あるいは Web API へのアクセスが制限されるケースがある。
この制限に対するリカバリとして、通知受信時に次回開くべきノート ID を IndexedDB に保存（<code>pending_open</code>）し、次にユーザーがアプリを開いた際（<code>page.tsx</code> マウント時）に自動的にそのノートを表示するサイクルを構築している（実施済み）。

#### 7.2.4 Service Worker の更新
<code>skipWaiting()</code> + <code>clients.claim()</code> で新しい SW が即時有効化される。バグ修正版をリリースした際に古い SW が動き続けることはない。

---

## 8 改版履歴

<div class="history-table">
<p class="table-caption">表 8-1　改版履歴</p>

| No | バージョン | 日付 | 変更内容 |
|:---|:---|:---|:---|
| 1 | 1.0 | 26-04-19 | 新規作成。005_VIEWER_SCREENS.html / 007_VIEWER_CODE_STRUCTURE.html / 004_PWA_DATA_FLOW.html の内容を統合・整理 |
| 2 | 1.1 | 26-04-20 | 4.4 にロック画面常駐体験（REQ_IP_05）の再通知サイクル（①②③④）を追加。4.2 に REQ_IP_05 への参照を追加 |
| 3 | 1.2 | 26-04-20 | 4.4 の再通知フローを実態に合わせて修正。iOS では notificationclick が発火しないため pending_open + page.tsx が再通知を担う仕組みを図入りで明記。2.2 の notificationclick 説明に iOS 制約を追記 |
| 4 | 1.3 | 26-04-24 | モジュール構造図を `graph LR`（横向き）に変更。スクロールなしで全体が見えるよう改善。 |
| 5 | 1.4 | 26-04-27 | セクション6「機能一覧」を新規追加。メモ一覧・ロック画面常駐・メモ編集・PCへ送る・プッシュ登録の設計意図を記載。旧6→7、旧7→8に繰り下げ。 |
| 6 | 1.5 | 26-05-06 | 2.3 Vercel / OAuth、3 データ構造、6.1〜6.5 機能一覧を修正。説明対象を開発者・保守担当向けとして明記し、client_secret は開発者が守る値であること、Vercel がトークンを保存しないことを追記。表の「意味」を「用途・内容」に変更し、6.1-1 以降の表へ No を追加。 |
| 7 | 1.6 | 26-05-24 | 6.3 / 6.4 に VideoDrop を追加。PWAから `mp4` / `mov` をDrive経由でPCへ送り、PC側で `assets/video/` に保存して付箋本文へパスを記録する仕様を追記。 |
| 8 | 1.7 | 26-05-24 | VideoDrop を動画選択即送信から付箋添付後に「PCへ送る」で送信する方式へ変更。PC側本文にはクリック可能な絶対パスを記録する仕様へ更新。 |
| 9 | 1.8 | 26-05-25 | VideoDrop を複数動画対応の添付メディア仕様へ更新。`videos[]`、IndexedDB の `videos`、Drive 一時ファイル `fusen_video_*`、本文保護ルールを追加。 |
| 10 | 1.9 | 26-05-30 | 複数iPhone・複数PCの接続モデルを追加。PC→iPhoneは登録済み通知端末への同報送信、iPhone→PCは`pc_devices.json`と`targetPcId`で送信先PCを選択する仕様を明記。 |
| 11 | 1.10 | 26-05-30 | Web Push共有鍵の目的・保護対象・誰にとっての秘密かを追記。`push_keys.json` はユーザー本人のDrive上の1個を正とし、PCローカル鍵で上書きしないルールを明記。 |
| 12 | 1.11 | 26-05-30 | PC→iPhone / iPhone→PC 送信時のキュー保護を明記。Driveキュー取得失敗時は空配列で上書きせず送信を中止し、PC→iPhoneはDrive保存成功後にPushを送る。Push失敗はHTTPステータス別に分類して表示する。 |
| 13 | 1.12 | 26-05-30 | PC右クリックメニューの「iPhoneに送る」を常時表示し、未設定時は設定画面の iPhone 連携タブへ誘導する仕様を明記。 |
| 14 | 1.13 | 26-05-31 | 3.0「鍵の前提」を新設。鍵を **所有者・目的・防衛手段** の 3 観点で記述するルールと、登場する鍵の一覧表を追加。VAPID 鍵セクションの 6 つの Note を 1 つの鍵プロファイル表と同期ルールに統合し、重複を削減。push_devices.json 内 ECDH 鍵にも同じ枠組みを適用。 |
| 15 | 1.14 | 26-05-31 | 3.0 を「3 者の登場人物と関係 → 鍵の枠組み → 鍵一覧 → VAPID 補足」の順に再編成。**ユーザー / 俺の付箋アプリ開発者 / 悪意ある第三者** の 3 者と互いの警戒関係を表で明示。「作者」「攻撃者」「第三者」表記を統一し、用語の揺れを解消。 |
| 16 | 1.15 | 26-05-31 | PWAの送信先PC選択は `pcName` を通常表示とし、同名PCが複数ある場合は `updatedAt` が最新の登録へ自動的に寄せる仕様を追記。`pcId` は受信判定・診断用の内部IDであり、通常操作でユーザーに選ばせないことを明記。 |
| 17 | 1.16 | 26-05-31 | 設定画面の接続状態で Drive 未処理キューの中身確認と、ユーザー確認付きのキューJSON削除を行える仕様を追記。 |
| 18 | 1.17 | 26-06-05 | PC→iPhone送信直前に `push_devices.json` を Drive から再取得する仕様を明記。予見可能なPush不整合はアプリ側で回避し、エラー時はユーザーが取れる復旧手順を表示する方針を追記。 |
| 19 | 1.18 | 26-06-26 | §1.1 に iPhone PWA の画面一覧表（表 1.1-1）を追加。各画面に画面 ID（`step` = banner / login / push / list / write）と画面名を付け、PC 側設計書（002_PC §1.3）と体裁を統一。 |
| 20 | 1.19 | 26-07-13 | 図3-4のiPhone→PC受信に受信IDハッシュによる冪等化を追加。PC保存後・Drive処理済み更新前に終了しても、再受信で付箋と添付を重複作成しない仕様を明記。 |
| 21 | 1.20 | 26-07-22 | 通常起動先を編集画面へ変更。通知メモ確認を待たず入力可能にし、入力開始済みなら通知メモによる上書きを防止する。`/viewer` は2回目以降キャッシュを即時表示してバックグラウンド更新する。 |
| 22 | **1.21** | 26-07-22 | §1.1と§5.1に残っていた旧仕様「通常起動先は一覧」を訂正し、通常起動先が編集画面であることを全記述で統一。 |
| 23 | 1.22 | 26-07-27 | メモ一覧はIndexedDBの保存済み内容を先に表示し、Drive同期をバックグラウンド化。PC付箋の先頭画像をタイトルと誤認せず、本文画像としてiPhoneへ送る規則を追加。 |
| 24 | 1.23 | 26-07-27 | 本文画像のタップで、本文や保存データを変更しない全画面プレビューを表示する操作を追加。 |
| 25 | **1.24** | 26-07-28 | 空タイトルのPC付箋では通知名だけを日本語「俺の付箋」・英語「FUSEN」とし、PWAのノートタイトル・本文には混入させない仕様を追加。 |
| 26 | **1.25** | 26-07-29 | 一覧で削除したPC受信ノートのIDを端末内へ記録し、Drive未処理キューの残留・同期競合があっても再取込しない削除規則を追加。 |

</div>
