# Pitfalls Research

**Domain:** iPhone→PC双方向同期 — Drive polling background task + PWA image handling + Rust async spawn
**Researched:** 2026-03-29
**Confidence:** HIGH (project codebase + domain knowledge; confirmed against existing implementation patterns)

---

## Critical Pitfalls

### Pitfall 1: tokio::spawn を Tauri setup() でブロッキング実行してしまう

**What goes wrong:**
Drive ポーリングを `setup()` 内で `tauri::async_runtime::block_on()` または `std::thread::spawn` で起動し、その中でネットワーク待機が発生する。Tauri の `setup()` はメインスレッドで同期的に実行される。ここでブロックすると Tauri ウィンドウが開かないまま数秒フリーズし、最悪タイムアウトでクラッシュする。

**Why it happens:**
"バックグラウンドでポーリングしたい" → `setup()` に書くのが直感的に見える。`block_on()` は非同期コードを同期に変換するため、気づかずに使ってしまう。

**How to avoid:**
`tauri::async_runtime::spawn()` を使い、`setup()` に渡すのは起動の予約だけにする。
```rust
// setup() 内でこう書く
let app_handle = app.handle().clone();
tauri::async_runtime::spawn(async move {
    drive_poll_loop(app_handle).await;
});
// setup() はここで即 return する — ブロックしない
```
tokio の features に `"rt-multi-thread"` が必要。現在の `Cargo.toml` は `features = ["rt"]` のみなので `"rt-multi-thread"` を追加する必要がある。

**Warning signs:**
- アプリ起動後にウィンドウが数秒間真っ白
- `setup()` 内の `await` や `recv_timeout()` が長い

**Phase to address:**
Drive ポーリング実装フェーズ（最初にスケルトンを書く段階で正しいパターンを確立する）

---

### Pitfall 2: Drive ポーリングがネットワークエラーで panic してアプリごとクラッシュする

**What goes wrong:**
`tauri::async_runtime::spawn()` 内の async タスクが `unwrap()` または `?` で早期リターンせず panic する。Tokio のタスク panic はスレッド単位で隔離されるが、Tauri のメインランタイムが終了するとアプリが無応答になる。ポーリングタスクが死ぬとその後ポーリングが二度と動かない（再起動まで）。

**Why it happens:**
Rust のエラー伝播 (`?`) がタスクのトップレベルで使えないため、`unwrap()` を使いたくなる。ネットワークエラーは「一時的なもの」と思い込みエラーハンドリングを後回しにする。

**How to avoid:**
ポーリングループ全体を `Result` を返す内部関数にし、タスクのトップレベルでは `loop { if let Err(e) = inner().await { log_error(e); sleep(30s).await; } }` パターンを使う。panic が来ても外側のループで再試行する。
```rust
async fn drive_poll_loop(app: AppHandle) {
    loop {
        if let Err(e) = poll_once(&app).await {
            logger::log_error(&format!("[poll] error: {}", e));
        }
        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}
```
既存プロジェクトの `unwrap_or_else(|p| p.into_inner())` パターン（`state.lock()`）を同様にポーリング内でも使う。

**Warning signs:**
- ポーリングが最初の1回しか動いていない
- ログに `[poll] error:` が出た後に次のポーリングログが来ない
- アプリが無応答になる

**Phase to address:**
Drive ポーリング実装フェーズ（エラーハンドリングをスケルトン段階で設計する）

---

### Pitfall 3: Drive ポーリングとユーザー操作による重複ノート作成

**What goes wrong:**
PC が5秒ごとに Drive の `fusen_iphone_notes.json` をポーリングし、新しいノートを検出してローカルファイルを作成する。同じファイルが2回読まれると（Drive API の応答遅延 + ポーリングタイミングが重なる）、同じノートが2回作成される。

**Why it happens:**
Drive の `modifiedTime` を確認するだけでは不十分。Drive API の `files.get` は eventually consistent であり、更新直後は古い `modifiedTime` を返すことがある。また、PC 側でクラッシュ後に再起動した場合、処理済みの既読 ID を覚えていない。

**How to avoid:**
ポーリング後に「処理済みノートID」を AppState（またはローカルファイル）に保存する。Drive JSON に `id` フィールドを持たせ、PC 側は "最後に処理した id" を比較する。
```rust
// fusen_iphone_notes.json のスキーマ
{
  "notes": [
    { "id": "uuid", "title": "...", "body": "...", "created_at": "..." }
  ]
}
// PC は最後に処理した created_at または id リストを state に保持
```
ポーリング間隔は5秒より長く（30秒程度）して Drive API レート制限（100 req/100s per user）内に収める。

**Warning signs:**
- 同じタイトルのノートファイルが2つ存在する
- ファイル名にタイムスタンプが付いていて重複が見える
- Drive API が 429 を返す

**Phase to address:**
Drive ポーリング実装フェーズ（Drive JSON スキーマ設計段階で id フィールドを入れる）

---

### Pitfall 4: PWA カメラ画像がそのまま base64 で Drive にアップロードされて容量・速度問題になる

**What goes wrong:**
iPhone カメラの写真は 3〜12MB。これを `<input type="file" capture>` で取得し、`FileReader.readAsDataURL()` で base64 化すると 4〜16MB のテキストになる。Drive にアップロードするだけで数十秒かかり、その後 PC がポーリングで取得するときも同様に遅い。Drive の 15GB 上限も圧迫する。

**Why it happens:**
Web API で画像をリサイズする処理は一手間かかるので省略したくなる。base64 はブラウザで完結するため「とりあえず動く」実装として選ばれやすい。

**How to avoid:**
アップロード前に Canvas でリサイズ＋JPEG 圧縮する。
```typescript
async function compressImage(file: File, maxWidth = 1280): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.75));
}
```
目標: 1280px幅・JPEG 0.75品質 → 約100〜300KB。Drive に base64 ではなくバイナリ（`image/jpeg`）として保存する。PC 側は Rust の `bytes()` で受け取り、ファイルとして保存する。

**Warning signs:**
- アップロードに10秒以上かかる
- Drive の使用量が急増する
- PC 側のポーリングで JSON デシリアライズが遅い（base64 文字列が大きすぎる）

**Phase to address:**
PWA 画像投稿フェーズ（最初の実装から圧縮を入れる。後から追加するのはデータ形式変更になり困難）

---

### Pitfall 5: Mermaid.js を Next.js Server Component または SSR で import してクラッシュする

**What goes wrong:**
`import mermaid from 'mermaid'` を `app/viewer/page.tsx` のトップレベルや Server Component で行うと、`window is not defined` または `document is not defined` でビルドエラー・ランタイムエラーが発生する。Next.js 14 の App Router は `'use client'` でもサーバーサイドで初回レンダリングされるためこの罠に引っかかる。

**Why it happens:**
Mermaid は `window` と `document` に直接アクセスする。`'use client'` ディレクティブはクライアント専用と思われがちだが、Next.js の App Router では SSR でも実行される。

**How to avoid:**
`dynamic()` で `ssr: false` を使うか、`useEffect` 内で dynamic import する。
```typescript
// 正しいアプローチ
useEffect(() => {
  import('mermaid').then(m => {
    m.default.initialize({ startOnLoad: false });
    m.default.run({ querySelector: '.mermaid' });
  });
}, []);
```
または `next/dynamic` で `ssr: false` のラッパーコンポーネントを作る。現在の `SimpleNoteBody.tsx` がどう実装されているか確認してからアプローチを決める。

**Warning signs:**
- `Error: window is not defined` at build time または runtime
- Vercel ビルドは成功するが `/viewer` ページがブランクになる
- `next build` の console に mermaid 関連の警告

**Phase to address:**
ノート表示フェーズ（Mermaid を viewer に追加する際に最初から dynamic import を使う）

---

### Pitfall 6: iPhone 側の Drive アクセストークンが期限切れでサイレント失敗する

**What goes wrong:**
iPhone PWA の `viewer_access_token` は localStorage に保存されている（既存実装確認済み）。有効期限は1時間。ユーザーがアプリを数時間ぶりに開くとトークンが切れており、Drive へのアップロードが 401 で失敗するが、UI 上は何も表示されない（エラーハンドリング漏れ）。

**Why it happens:**
既存の `refreshAccessToken()` は Drive ダウンロード失敗時のみ呼ばれる（`downloadWithAutoRefresh` パターン）。アップロード側には同様のリフレッシュラッパーがない。

**How to avoid:**
アップロード関数にも `uploadWithAutoRefresh` ラッパーを作る。既存の `refreshAccessToken()` を共通化して全 Drive 操作で使えるようにする。
```typescript
async function withAutoRefresh<T>(
  token: string,
  fn: (t: string) => Promise<T>
): Promise<T> {
  try {
    return await fn(token);
  } catch {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('session expired');
    return fn(newToken);
  }
}
```

**Warning signs:**
- 朝一番にアプリを開いた時だけ画像アップロードが無言で失敗する
- `localStorage.viewer_expires_at` の値が現在時刻より過去
- ネットワークタブで Drive API が 401 を返している

**Phase to address:**
PWA 画像投稿フェーズ（アップロード実装と同時にトークンリフレッシュを入れる）

---

### Pitfall 7: Service Worker が新しい /viewer 画像投稿ルートを古い precache で返す

**What goes wrong:**
既存の `sw.js` は Workbox の precache リストをビルド時に生成している（確認済み: `public/sw.js` 内の `precacheAndRoute([...])`）。新しいルートを追加してデプロイしても、iPhone の Service Worker が古い sw.js をキャッシュしていて新しいコードが動かない。`self.skipWaiting()` は入っているが、古い SW が active のままだと `skipWaiting` は次のナビゲーションまで反映されない。

**Why it happens:**
iPhone Safari の Service Worker キャッシュは非常に保守的。`sw.js` 自体がキャッシュされていると更新が届かない。Workbox の `clientsClaim()` は入っているが、既存の active SW を強制置換するには条件がある。

**How to avoid:**
- `sw.js` を `public/` に直置きしていてもバージョン管理を行う（ビルドごとに `sw.js` の中身が変わることを確認する）
- デプロイ後にテスト端末で Safari → 設定 → 詳細 → Web サイトデータ削除、または PWA を一度削除して再インストールして確認する
- 開発中は `next-pwa` のキャッシュを無効にするか `sw.js` を手書きに切り替えてデバッグする

**Warning signs:**
- デプロイ後も iPhone で古い UI が表示される
- `navigator.serviceWorker.controller.scriptURL` が古い URL を指している
- Chrome DevTools の Application > Service Workers に "waiting" ステータスが出る

**Phase to address:**
PWA 画像投稿フェーズ（新機能追加後に必ず実機で Service Worker の更新を確認する）

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| ポーリング間隔を5秒以下にする | 即時性が高い | Drive API レート制限 (100 req/100s) に当たる。1ユーザーでも付箋10枚で詰まる | never — 30秒以上が安全 |
| 圧縮なしで画像を base64 で Drive に保存 | 実装が速い | Drive 容量圧迫 + PC 側のポーリング遅延 | never |
| アップロード失敗をサイレントに無視 | 実装が速い | ユーザーが投稿できていないことに気づかない | never |
| 処理済みノート ID を AppState のみに保存（ファイルなし） | 実装が速い | アプリ再起動後に重複作成が起きる | MVP 期間中の一時的な許容（すぐに永続化する） |
| tokio `"rt"` feature のみ（シングルスレッド） | Cargo.toml 変更不要 | ポーリングタスクがメインスレッドをブロックする可能性 | never — `"rt-multi-thread"` が必要 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google Drive API（Rust） | `upload_json()` の中で `ensure_folder()` を毎回呼ぶ | フォルダ ID を AppState にキャッシュして初回のみ取得（既存 `gdrive.rs` は毎回呼んでいる — 要改善） |
| Google Drive API（PWA） | `files?q=name='...'` クエリに URL エンコードを忘れる | ファイル名にシングルクォートが含まれると検索が壊れる — `encodeURIComponent` を使う |
| tokio in Tauri | `tauri::async_runtime::block_on()` でポーリングを起動する | `tauri::async_runtime::spawn()` で分離したタスクとして起動する |
| Next.js + Mermaid | Server Component またはトップレベルで import する | `useEffect` + dynamic import または `next/dynamic` with `ssr: false` |
| iPhone PWA + Drive | アップロード成功を HTTP 200 だけで判定する | Drive API はファイル作成失敗でも 200 を返す場合がある — レスポンス JSON の `id` フィールドの存在を確認する |
| Workbox precache | `sw.js` をビルド外で手動編集する | Workbox 生成ファイルは手動編集すると次のビルドで上書きされる — カスタムコードは `worker-*.js` に書く |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Drive ポーリングごとに `ensure_folder()` を呼ぶ | ポーリング1回あたり余分に1 API コール | フォルダ ID を起動時に1回取得して AppState に保存 | Drive API レート制限に達した時（シングルユーザーでも連続操作で発生） |
| 画像を base64 JSON に埋め込む | ポーリングのデシリアライズが遅い、Drive 容量大 | 画像はバイナリファイルとして Drive に別途保存、JSON にはファイル ID だけ入れる | ノート本文が 1MB を超える時点で即座に遅くなる |
| Access token の有効期限チェックをせずに毎回リフレッシュ | Google API に無駄なリクエスト | `expires_at` と現在時刻を比較し、60秒以上余裕があれば既存トークンを使う（既存 `gdrive.rs` の実装を参照） | Drive API のトークンリフレッシュレート制限に当たると詰まる |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| iPhone からアップロードされたノートを PC 側で検証なしに実行する | 悪意のある Markdown/HTML をノートに埋め込まれる | PC 側の表示は既存の RichTextEditor と同じサニタイズを通す。特にリンクの `href` を検証する |
| Drive の `fusen_iphone_notes.json` を誰でも読めるように設定する | Drive API はデフォルトで作成したユーザーのみアクセス可 — 問題ない。ただし `drive` スコープではなく `drive.file` スコープを使っていることを確認する | `drive.file` スコープ（アプリが作成したファイルのみ）を使う（既存実装確認済み: `drive.file` スコープ使用） |
| Vercel の Route Handler に `GOOGLE_CLIENT_SECRET_PWA` を `NEXT_PUBLIC_` で設定する | シークレットがブラウザに露出 | `GOOGLE_CLIENT_SECRET_PWA`（`NEXT_PUBLIC_` なし）のまま維持（既存実装は正しい） |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| ノートが PC に届くまで iPhone 側にフィードバックがない | 「投稿できたのか？」が分からない | アップロード完了後に「送りました」トーストを表示し、エラー時は「失敗しました。再試行しますか？」を表示する |
| PC 側でポーリング中にノートが突然現れる（アニメーションなし） | ノートがどこから来たか分からず驚く | 新規ノート作成時に既存の create サウンドを再生 + アニメーションで出現させる |
| 画像の圧縮中に UI がフリーズする | iPhone で Canvas 処理中に操作不能になる | `createImageBitmap()` は Web Workers でも実行できる。または圧縮中にローディングスピナーを表示する |
| ポーリングが止まっていることにユーザーが気づかない | iPhone から送ったノートが来ない状態が続く | PC 側で最後の正常ポーリング時刻を表示する設定画面項目を追加する |

---

## "Looks Done But Isn't" Checklist

- [ ] **ポーリングタスク起動:** `setup()` 内で `block_on()` ではなく `spawn()` を使っているか確認
- [ ] **ポーリングエラーハンドリング:** ネットワーク失敗時にタスクが終了せずリトライするか確認
- [ ] **重複ノート防止:** 処理済みノート ID をアプリ再起動後も保持しているか確認（ファイルまたは AppState 永続化）
- [ ] **画像圧縮:** アップロード前に Canvas で 1280px/JPEG 0.75 に圧縮されているか確認
- [ ] **トークンリフレッシュ（アップロード側）:** アップロード関数も 401 時に自動リフレッシュするか確認
- [ ] **Mermaid の dynamic import:** `window is not defined` エラーが出ないか SSR で確認
- [ ] **Service Worker 更新:** デプロイ後に実機 iPhone で新しい UI が表示されるか確認
- [ ] **Drive フォルダ ID キャッシュ:** ポーリングのたびに `ensure_folder()` を呼んでいないか確認
- [ ] **tokio features:** `Cargo.toml` に `"rt-multi-thread"` があるか確認

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| ポーリングタスクが panic で停止 | LOW | アプリ再起動でリカバリ。根本修正: パニックハンドラをタスク内に入れてループ継続 |
| 重複ノートが作成された | LOW | 重複ファイルを手動削除。根本修正: 処理済み ID 保存ロジックを追加 |
| 画像が巨大で Drive 容量を圧迫 | MEDIUM | Drive の `fusen_iphone_notes.json` を手動で空にする + 圧縮コードを追加してデプロイ |
| Service Worker が古いコードをキャッシュ | LOW | iPhone で PWA を削除して再インストール。または Safari の「Web サイトデータを削除」 |
| iPhone のトークンが失効してアップロード不能 | LOW | iPhone PWA で再ログイン（既存のログアウト→ログインフローを使う） |
| tokio がシングルスレッドでポーリングがブロック | MEDIUM | `Cargo.toml` に `"rt-multi-thread"` を追加してビルド。既存のコマンドへの影響を確認する |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| tokio::spawn のブロッキング | Drive ポーリング基盤フェーズ | アプリ起動が2秒以内に完了すること |
| ポーリングタスクの panic/停止 | Drive ポーリング基盤フェーズ | ネットワーク切断状態でのテスト（Wi-Fi オフ）でアプリが継続動作すること |
| 重複ノート作成 | Drive ポーリング基盤フェーズ | 同じ JSON を2回ポーリングしても1ファイルしか作られないことを確認 |
| 画像サイズ問題 | PWA 画像投稿フェーズ | アップロードファイルサイズが 500KB 以下であることを確認 |
| Mermaid SSR クラッシュ | ノート表示フェーズ | `next build` が警告なく完了し `/viewer` がブランクにならないことを確認 |
| iPhone トークンリフレッシュ漏れ | PWA 画像投稿フェーズ | トークン期限切れ状態でアップロードが自動リフレッシュして成功することを確認 |
| Service Worker 古いキャッシュ | PWA 画像投稿フェーズ | デプロイ後に実機 iPhone で新機能が反映されていることを確認 |

---

## Sources

- プロジェクトコードベース直接確認: `src-tauri/src/gdrive.rs`, `src-tauri/src/lib.rs`, `app/viewer/page.tsx`, `public/sw.js`
- `src-tauri/Cargo.toml`: `tokio = { version = "1", features = ["rt"] }` — `"rt-multi-thread"` 未追加を確認
- プロジェクトメモリ: 全隠し/全表示スタックオーバーフロー修正（v1.0.6）— `tauri::async_runtime::spawn` と Win32 SendMessage の非同期問題の先例
- プロジェクトメモリ: Listener Leak パターン — async タスクの deps 管理の先例
- Google Drive API v3 ドキュメント: レート制限 100 requests / 100 seconds / user
- Workbox ドキュメント: precache + `skipWaiting` + `clientsClaim` の動作
- MDN Web Docs: `createImageBitmap()` + Canvas API による画像リサイズ
- Next.js 14 App Router ドキュメント: SSR と `'use client'` の動作（`window` アクセスの落とし穴）

---

*Pitfalls research for: iPhone→PC双方向同期 (Drive polling + PWA image + Rust async)*
*Researched: 2026-03-29*
