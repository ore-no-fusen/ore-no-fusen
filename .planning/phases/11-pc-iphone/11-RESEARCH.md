# Phase 11: PC→iPhone受信履歴保存 - Research

**Researched:** 2026-04-06
**Domain:** IndexedDB, Drive JSON スキーマ変更, Service Worker 通知タグ, React state パターン
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### IndexedDB保存タイミング
- note ステップ表示直後（通知タップ後、Drive からダウンロードが完了した時点）に保存する
- 「通知を消して一覧へ」ボタン押下前に保存 → クラッシュ・レイアウト変更に対応できる
- ID で重複チェックし、すでに存在する場合は上書き保存（再通知タップ対応）

#### IndexedDB データ構造
- 既存の `'drafts'` objectStore を使いまわす（新 store・DB バージョンアップ不要）
- `DraftRecord` 型と同じ構造 `{ id, title, body, created_at, images: [], tags }` で保存
- `images` は空配列（PC 受信ノートの画像は base64 埋め込みのまま body に含む）
- 区別用フィールド: `DraftRecord` に `received_pc?: true` フラグを追加して管理
  - `IphoneNote.status = 'received_pc'` として一覧に表示

#### 複数ノート対応（fusen_note.json 配列化）
- `fusen_note.json` のスキーマを `{ items: [{ id, title, body, sent_at, received_at? }] }` に変更
- PC 側（Rust `fusen_send_to_iphone`）: 送信時に既存 items を読み込み、新ノートを末尾に追加して最新 20 件まで保持
- **通知のtag**: `'fusen-<note_id>'`（固有ID ベース）
  - 異なるノート → 異なる通知タグ → ロック画面に独立して複数表示
  - 同一ノートを再送信 → 後発通知が前の通知を置き換える
- 通知タップ時の処理（`?note=<id>` 受信後）:
  1. `fusen_note.json` から `received_at` が null の全件（未読）を取得
  2. 全件を IndexedDB に一括保存（上書き方式）
  3. `setStep('list')` で一覧へ遷移

#### PC受信ノートの一覧表示・操作
- 一覧で「PC受信」バッジ（水色）表示（`status: 'received_pc'`）
- 一覧からタップ → `write` ステップで内容を編集可能（note ステップには遷移しない）
- 「iPhoneに置いておく」で保存 → `status: 'received_pc'` のまま・内容だけ更新
- 「PCに送る」→ 普通に送信。IndexedDB の受信履歴はそのまま残る（送信済みバッジは付けない）
- 一覧から 🗑️ で削除可能（IndexedDB から削除）

#### 「通知を消して一覧へ」ボタン（旧「消す」）
- ボタンラベル: 「通知を消して一覧へ」
- 動作:
  1. SW の通知をすべてクローズ（既存コード）
  2. **Drive の `fusen_note.json` 全 items に `received_at` を付けて書き戻す**（次回通知タップ時の再取得防止）
  3. `setStep('list')` → 一覧へ（現状は 'write' に遷移していたのを修正）
- ボタン下のサブテキスト: 「→ 一覧に履歴として残ります」

### Claude's Discretion

なし（すべての実装詳細がロック済み）

### Deferred Ideas (OUT OF SCOPE)

- APNs リッチ通知（画像プレビュー付き通知）— コスト・複雑性が高い
- PC 受信ノートをそのまま別の付箋ウィンドウで開く（PC → iPhone 送信の逆方向）
- 受信通知の既読バッジをアプリアイコンに表示
</user_constraints>

---

## Summary

Phase 11 は「PCからiPhoneに送られたノートを、通知を消した後もiPhone側の一覧から閲覧・編集できるようにする」フェーズ。変更は4ファイルに集中している。

**核心の変更は3点。**
1. `fusen_note.json` のスキーマを単体オブジェクトから `{ items: [...] }` 配列に変更（Rust側 + JS側）。
2. Service Workerの通知tagを `'fusen'` 固定から `'fusen-<note_id>'` に変更（複数ノートを取り違えない）。
3. `app/viewer/page.tsx` の `note` ステップで、表示後すぐ IndexedDB に保存し、「通知を消して一覧へ」ボタンで received_at 書き戻し → list 遷移する。

既存の `saveDraft` / `loadAllDrafts` / `deleteDraft` / `DraftRecord` はそのまま使いまわせる。新規ライブラリ不要、IndexedDB バージョンアップ不要。

**Primary recommendation:** Rust `fusen_send_to_iphone` の read-modify-write を先に実装し、次に JS 受信側（note ステップ保存 → 一覧表示）の順で進める。スキーマ変更は旧形式互換チェックを含める。

---

## Standard Stack

### Core（変更なし）

| 技術 | バージョン | 用途 |
|------|-----------|------|
| IndexedDB `'fusen-drafts'` DB / `'drafts'` store | 既存 v1 | PC受信ノートをドラフトとして保存 |
| `saveDraft` / `loadAllDrafts` / `deleteDraft` | 既存関数 | そのまま再利用 |
| `uploadWithAutoRefresh` | 既存関数 | fusen_note.json 書き戻しに使用 |
| `downloadWithAutoRefresh` | 既存関数 | fusen_note.json 取得（配列対応後） |
| Rust `gdrive::upload_json` / `download_json` | 既存 | Rust側スキーマ変更に使用 |
| Service Worker (`worker/index.js`) | 既存 | 通知tag変更のみ |

### 変更が必要なファイル

| ファイル | 変更内容 |
|---------|---------|
| `worker/index.js` | `tag: 'fusen'` → `tag: 'fusen-' + (data.id ?? 'unknown')`（push + notificationclick の両イベント） |
| `app/viewer/page.tsx` | 型追加・note ステップ保存ロジック・一覧表示・ボタン変更 |
| `src-tauri/src/lib.rs` | `fusen_send_to_iphone` を read-modify-write 配列追加に変更 |
| `src-tauri/src/gdrive.rs` | NOTE_FILE 定数は変更不要 |

---

## Architecture Patterns

### 現在の fusen_note.json スキーマ（旧）

```json
{
  "title": "ノートタイトル",
  "body": "本文",
  "tags": [],
  "sent_at": "2026-04-06T..."
}
```

### Phase 11 後の fusen_note.json スキーマ（新）

```json
{
  "items": [
    {
      "id": "uuid-or-sent_at",
      "title": "ノートタイトル",
      "body": "本文",
      "sent_at": "2026-04-06T...",
      "received_at": null
    }
  ]
}
```

- `id`: Rust 側で `sent_at` 文字列を ID として使うか、`uuid::Uuid::new_v4().to_string()` を生成する（NOTE: uuid クレートが既に依存に含まれているか確認が必要）
- `received_at`: null = 未読、文字列 = 既読済み
- 上限: 最新 20 件（Rust 側で古いものから削除）

### Rust 側の read-modify-write パターン（lib.rs line 1346 の変更）

```rust
// 旧: 単純アップロード
tokio::spawn(async move {
    gdrive::upload_json(&bg_client, &bg_token, "fusen_note.json", &note_json_drive).await
});

// 新: read-modify-write（バックグラウンド）
tokio::spawn(async move {
    // 既存を取得（失敗時は空配列扱い）
    let mut items: Vec<serde_json::Value> = match gdrive::download_json(&bg_client, &bg_token, "fusen_note.json").await {
        Ok(v) => v["items"].as_array().cloned().unwrap_or_default(),
        Err(_) => vec![],
    };
    // 新ノートを末尾に追加し、最新20件に切り詰め
    items.push(note_json_drive);
    if items.len() > 20 {
        let start = items.len() - 20;
        items = items[start..].to_vec();
    }
    let data = serde_json::json!({ "items": items });
    gdrive::upload_json(&bg_client, &bg_token, "fusen_note.json", &data).await
});
```

NOTE: `note_json_drive` に `id` フィールドを追加する必要がある（`sent_at` をIDとして使用 or uuid生成）。

### JS 側: note ステップ保存ロジック（配列対応後の downloadWithAutoRefresh）

現在の `downloadWithAutoRefresh` は `fusen_note.json` から `{ title, body }` を返す。Phase 11 では配列スキーマに対応し、未読 items を全件返すよう変更する。

```typescript
// 新しいダウンロード関数（配列スキーマ対応）
async function downloadFusenNoteItems(token: string): Promise<FusenNoteItem[]> {
  const data = await downloadFromDrive(token, 'fusen_note.json').catch(() =>
    refreshAccessToken().then((t) => {
      if (!t) throw new Error('session expired');
      return downloadFromDrive(t, 'fusen_note.json');
    })
  );
  // 旧スキーマ互換: items 配列がなければ単体を配列化
  if (Array.isArray(data?.items)) {
    return data.items.filter((item: FusenNoteItem) => item.received_at == null);
  }
  // 旧スキーマ（単体オブジェクト）
  if (data?.title || data?.body) {
    return [{ id: data.sent_at ?? 'legacy', title: data.title, body: data.body, sent_at: data.sent_at ?? '', received_at: null }];
  }
  return [];
}
```

### DraftRecord 型拡張（最小変更）

```typescript
// 既存
type DraftRecord = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  images: { fileName: string; blob: Blob }[];
  tags?: string[];
};

// Phase 11 追加（1フィールドのみ）
type DraftRecord = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  images: { fileName: string; blob: Blob }[];
  tags?: string[];
  received_pc?: true;   // ← 追加
};
```

### IphoneNote 型拡張

```typescript
// 既存
type IphoneNote = {
  id: string;
  status: 'sent' | 'draft';
  // ...
};

// Phase 11 追加
type IphoneNote = {
  id: string;
  status: 'sent' | 'draft' | 'received_pc';  // ← 'received_pc' 追加
  // ...
};
```

### note ステップでの保存タイミング（viewer/page.tsx）

通知タップ → `?note=<id>` パラメータを受け取り → Drive download → **全未読 items を IndexedDB 保存** → `setStep('list')` に直接遷移（note ステップは通過点として使うか、またはskipする）

CONTEXT.md によると: 「note ステップ表示直後に保存」かつ「通知タップ時の処理は全件を一括保存した後 setStep('list') で一覧へ」。つまり note ステップを経由せず list へ直接遷移する設計。

実装場所: `useEffect` 内の `?note=` パラメータ処理（現在 line 697-722 付近）:

```typescript
// 現行（line 710-714）
downloadWithAutoRefresh(token)
  .then((data) => {
    setNoteData(data);
    setStep('note');  // ← これを変更
  })

// Phase 11 後
downloadFusenNoteItems(token)
  .then(async (items) => {
    // 全未読を IndexedDB に一括保存
    for (const item of items) {
      await saveDraft({
        id: item.id,
        title: item.title,
        body: item.body,
        created_at: item.sent_at,
        images: [],
        tags: [],
        received_pc: true,
      });
    }
    setStep('list');  // note ステップをスキップして直接 list へ
  })
```

### 「通知を消して一覧へ」ボタン（旧「消す」ボタン、line 1588-1600 付近）

```typescript
// 現行
onClick={() => {
  navigator.serviceWorker.ready.then((reg) => {
    reg.getNotifications({ tag: 'fusen' }).then((ns) => ns.forEach((n) => n.close()));
  });
  setStep('write');
}}

// Phase 11 後
onClick={async () => {
  // 1. 全通知クローズ（tag 指定なし → 全件）
  navigator.serviceWorker.ready.then((reg) => {
    reg.getNotifications().then((ns) => ns.forEach((n) => n.close()));
  });
  // 2. Drive の fusen_note.json 全 items に received_at を付けて書き戻す
  if (accessToken) {
    try {
      const data = await downloadFromDrive(accessToken, 'fusen_note.json');
      const items = (data?.items ?? []).map((item: FusenNoteItem) => ({
        ...item,
        received_at: item.received_at ?? new Date().toISOString(),
      }));
      await uploadWithAutoRefresh(accessToken, 'fusen_note.json', { items });
    } catch { /* エラーは無視 */ }
  }
  // 3. list へ
  setStep('list');
}}
```

### list ステップでの received_pc 表示

現行の削除ボタン表示条件は `note.status === 'draft'` のみ。Phase 11 では `'received_pc'` にも削除ボタンを表示する。

一覧ロード時（list ステップの useEffect）は、`loadAllDrafts()` の結果に `received_pc: true` のレコードが含まれるため、追加の Drive アクセスは不要。

```typescript
// 既存（line 768-771）
const draftNotes: IphoneNote[] = drafts.map((d) => ({
  id: d.id, title: d.title, body: d.body,
  status: 'draft' as const, created_at: d.created_at, tags: d.tags,
}));

// Phase 11 後
const draftNotes: IphoneNote[] = drafts.map((d) => ({
  id: d.id, title: d.title, body: d.body,
  status: d.received_pc ? ('received_pc' as const) : ('draft' as const),
  created_at: d.created_at, tags: d.tags,
}));
```

### worker/index.js 通知タグ変更

```javascript
// 旧
tag: 'fusen',

// 新（push イベント）
tag: 'fusen-' + (data.id ?? 'unknown'),

// 新（notificationclick で再表示）
tag: 'fusen-' + (event.notification.data?.id ?? 'unknown'),
```

`data.id` は Rust 側 `fusen_send_to_iphone` が Web Push payload に含める `id` フィールドと対応する。Rust 側 `note_json_push` にも `id` フィールドを追加する必要がある。

---

## Don't Hand-Roll

| 問題 | 使う既存機能 |
|------|------------|
| IndexedDB CRUD | `saveDraft` / `loadAllDrafts` / `deleteDraft`（変更不要） |
| Drive upload/download | `uploadWithAutoRefresh` / `downloadWithAutoRefresh` / `downloadFromDrive`（変更不要） |
| トークンリフレッシュ | `refreshAccessToken`（変更不要） |
| pendingHydrate パターン | Phase 9 で確立済み。received_pc ノートタップ→write 遷移にそのまま使用 |

---

## Common Pitfalls

### Pitfall 1: note_json_push への id フィールド追加忘れ

**何が起きるか:** worker/index.js が `data.id` を参照するが undefined になり、通知タグが全件 `'fusen-unknown'` になる。複数ノート対応が機能しない。
**回避策:** Rust 側で `note_json_push` と `note_json_drive` の両方に同じ `id` フィールドを含める。

### Pitfall 2: 旧スキーマ互換チェックの漏れ

**何が起きるか:** 既存の `fusen_note.json` が単体オブジェクト形式（`{ title, body, ... }`）の場合、`data.items` が undefined で `filter` クラッシュ。
**回避策:** `Array.isArray(data?.items)` で分岐し、旧スキーマは単体アイテムとして処理（CONTEXT.md に明記済み）。

### Pitfall 3: getNotifications でタグ指定の変更忘れ

**現行コード（line 1592）:** `reg.getNotifications({ tag: 'fusen' })` → 新タグ `'fusen-<id>'` にはマッチしない。
**回避策:** 「通知を消して一覧へ」ボタンでは `reg.getNotifications()` (タグ指定なし) で全通知を取得してクローズ。

### Pitfall 4: saveDraft を複数回呼ぶ際の IndexedDB 競合

**何が起きるか:** 未読 items を for ループで連続 saveDraft すると、同一 DB connection を複数 transaction で開く。
**回避策:** 既存 `saveDraft` は毎回 `openDraftsDB()` を呼ぶ（connection pooling なし）。複数件でも問題ないが、`Promise.all` より `for...of with await` の方が安全（connection 数を制限）。

### Pitfall 5: received_pc ノートのドラフト ID 衝突

**何が起きるか:** Rust 側で `sent_at` を ID にすると、1秒以内に複数送信した場合に ID が重複する可能性。
**回避策:** `uuid::Uuid::new_v4()` を ID として使用する方が安全。uuid クレートが未使用なら `chrono::Utc::now().timestamp_millis().to_string()` でも代替可能（衝突リスク低）。

### Pitfall 6: list ステップの historyNotes reload

**何が起きるか:** note タップ → list 遷移後、`step === 'list'` useEffect が再実行されるが、IndexedDB には保存済みのため正しく表示される。ただし `accessToken` が null の場合は historyNotes の Drive 部分が空になる。
**回避策:** `?note=<id>` 経由のフローでは accessToken は設定済みのため問題なし（フロー確認済み）。

---

## Code Examples

### 既存の saveDraft 呼び出しパターン（参考）

```typescript
// app/viewer/page.tsx line 1193 付近
await saveDraft({
  id: currentDraftId ?? crypto.randomUUID(),
  title: titleText,
  body: bodyText,
  created_at: new Date().toISOString(),
  images: attachedImagesList,
  tags: writeTags,
});
```

PC受信ノートの保存では `images: []`、`received_pc: true` を追加するのみ。

### 既存の pendingHydrate 使用パターン（参考）

```typescript
// list → write 遷移（line 1517 付近）
setPendingHydrate({
  markdown: fullText,
  blobMap: new Map(),
  draftId: note.id,
  tags: note.tags ?? [],
});
setStep('write');
```

received_pc ノートのタップでも同じパターンを使用（`draftId: note.id` を設定することで「iPhoneに置いておく」で更新保存される）。

---

## State of the Art

| 旧アプローチ | Phase 11 後 |
|------------|------------|
| `fusen_note.json` = 単体オブジェクト（最新1件） | `fusen_note.json` = `{ items: [...] }` 配列（最新20件） |
| 通知タグ = `'fusen'` 固定 | 通知タグ = `'fusen-<note_id>'`（ノートごとに固有） |
| note 表示後に「消す」→ write ステップ | note 表示直後 IndexedDB 保存→「通知を消して一覧へ」→ list ステップ |
| 一覧に draft / sent のみ | 一覧に draft / sent / received_pc の3種 |

---

## Open Questions

1. **uuid クレートの既存依存確認**
   - 何がわかるか: `Cargo.toml` に uuid クレートがあれば `Uuid::new_v4()` が使える
   - 不明点: 未確認（調査所要 5分）
   - 推奨: `sent_at` の timestamp_millis でも衝突リスクは低いため、uuid 未使用なら `chrono::Utc::now().timestamp_millis().to_string()` を ID に使用する方が Cargo.toml 変更を避けられる

2. **notificationclick の targetUrl 変更**
   - 現行: `targetUrl = self.location.origin + '/viewer?note=1'`（固定値）
   - Phase 11 では: `'/viewer?note=' + (data.id ?? 'unknown')` に変更が必要
   - 現行 worker/index.js の `notificationclick` ハンドラで `event.notification.data` から id を取得する

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run app/viewer/viewer.test.tsx` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| ID | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| P11-01 | DraftRecord に received_pc フラグを追加して saveDraft で保存できる | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ (スタブ追加) |
| P11-02 | loadAllDrafts で received_pc: true のレコードが returned される | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ (スタブ追加) |
| P11-03 | 配列スキーマの fusen_note.json を旧スキーマとして後方互換処理できる | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ (スタブ追加) |
| P11-04 | worker/index.js の push tag が 'fusen-<id>' になる | unit | `npx vitest run` (worker test) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run app/viewer/viewer.test.tsx`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/viewer/viewer.test.tsx` に P11-01〜03 のスタブ追加（既存ファイルへの追記）
- [ ] worker テスト（`worker/worker.test.js` または `app/viewer/viewer.test.tsx` 内でモック検証）— P11-04

---

## Sources

### Primary (HIGH confidence)

- `app/viewer/page.tsx` — 直接コード確認（line 239-395, 580-778, 1476-1606）
- `worker/index.js` — 直接コード確認（全件）
- `src-tauri/src/lib.rs` — `fusen_send_to_iphone` line 1240-1391 直接確認
- `src-tauri/src/gdrive.rs` — `upload_json` / `download_json` シグネチャ直接確認
- `.planning/phases/11-pc-iphone/11-CONTEXT.md` — 設計決定全件

### Secondary (MEDIUM confidence)

なし（全情報が既存コードから直接取得）

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 既存コードを直接読んで確認
- Architecture: HIGH — CONTEXT.md の決定＋既存コードのパターンを組み合わせ
- Pitfalls: HIGH — 既存コードの実装パターンとタグ変更の連鎖を直接確認

**Research date:** 2026-04-06
**Valid until:** 2026-05-06（既存コードベースが安定しているため）
