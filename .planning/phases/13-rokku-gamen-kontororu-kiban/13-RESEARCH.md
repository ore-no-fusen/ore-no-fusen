# Phase 13: ロック画面コントロール基盤 - Research

**Researched:** 2026-04-09
**Domain:** Service Worker Notification API / IndexedDB / PWA (iPhone Safari)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- 🔔ボタンは一覧の各メモカード右カラムに、🗑️ボタンの左隣に横並びで配置（全メモ対象・常時表示）
- OFF（未ロック）: `text-gray-400`、ON（ロック中）: `text-blue-500`、タップで楽観的UI更新
- 通知タイトル: メモ先頭行（`#` 除去）、通知body: 残り先頭40文字
- 無題メモ: 本文先頭20文字をタイトル、残り先頭40文字をbody
- 通知タグ: `fusen-lock-<noteId>`（既存 `fusen-<id>` と衝突しない）
- ロック状態永続化: `DraftRecord` 型に `locked?: true` フィールドを追加（DBバージョンアップ不要）
- メモ削除時は既存 `deleteDraft()` でロック状態も自動消去
- 通知権限: 初回🔔タップ時のみ `Notification.requestPermission()` を呼ぶ
- 権限 `'denied'` 時: エラートースト「通知権限が必要です。設定から有効にしてください」
- 権限リクエスト中は🔔ボタンを一時的に `disabled`
- 起動時復元: `step === 'list'` 遷移時の既存 `useEffect`（line 864〜）に復元ロジックを追加
- 変更ファイル: `app/viewer/page.tsx` 主体

### Claude's Discretion

- エラートーストの実装方法（既存 `errorMessage` state を流用するか新規 state を追加するか）
- 通知 icon/badge: 既存の `/icon-192.png` を使用（確定）
- ロック状態変化時の `historyNotes` state 更新方法（直接 state 更新か再 loadAllDrafts か）

### Deferred Ideas (OUT OF SCOPE)

- EXT-01（本文N文字のリッチ通知）— v2 スコープ
- EXT-02（通知タップでPWAを開いてメモにジャンプ）— Phase 14 以降
- エディタヘッダーへの🔔ボタン追加 — Phase 14（EDIT-01, EDIT-02）スコープ
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LOCK-01 | 一覧の任意のメモをタップひとつでロック画面に通知として表示できる | SW `registration.showNotification()` + 🔔ボタン実装 |
| LOCK-02 | ロック画面に表示中のメモを一覧から消せる（通知が消える） | SW `CLOSE_NOTIFICATION` メッセージ（既存）流用 |
| LOCK-03 | ロック中メモは一覧で視覚的に識別できる | `lockedNoteIds` state + `text-blue-500` クラス切り替え |
| LOCK-04 | 複数メモを同時にロック画面に表示できる（独立した通知） | 通知タグ `fusen-lock-<id>` で自動的に独立管理 |
| LOCK-05 | ロック画面表示状態はアプリを閉じても保持される | `DraftRecord.locked` IndexedDB 永続化 + 起動時再発火 |
</phase_requirements>

---

## Summary

Phase 13 の実装ドメインは **iPhone Safari PWA における Service Worker Notification API と IndexedDB の連携**である。すでに Phase 7〜12 で構築した SW インフラ（`GET_NOTIFICATIONS` / `CLOSE_NOTIFICATION` メッセージ、push 通知登録、IndexedDB `fusen-drafts`）がそのまま流用できる。新たに手を加えるのは 2 点のみ：(1) `DraftRecord` 型への `locked?: true` フィールド追加と、(2) 一覧カードへの🔔ボタン追加（表示・消去・状態復元のロジックを含む）。

既存の `worker-mgtBAhqrihgq5AmSMpYK8.js`（SW 側）は `showNotification`・`getNotifications`・`notificationclick` を実装済みだが、**メッセージハンドラは `GET_NOTIFICATIONS` と `CLOSE_NOTIFICATION` の 2 種類のみ**。`SHOW_NOTIFICATION` メッセージハンドラは存在しない。ロック通知の表示は **フロントエンドから直接 `registration.showNotification()` を呼ぶ**方式を採用する（SW にメッセージを送る必要なし）。

`GET_NOTIFICATIONS` は全通知のタグを返すが、現在の実装は `tag.replace("fusen-","")` で id を抽出している。ロック通知のタグ `fusen-lock-<id>` に対してこの変換を適用すると `lock-<id>` になる点に注意が必要。`activeNotifIds` はロック通知の管理には**流用しない**（別 state `lockedNoteIds` を使う）。

**Primary recommendation:** `lockedNoteIds: string[]` state を新設し、IndexedDB の `locked` フラグを信頼源として管理する。SW `registration.showNotification()` は permission check 後に直接呼ぶ。

---

## Standard Stack

### Core

| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| Web Notifications API | ブラウザ標準 | ロック画面通知の表示・消去 | iPhone Safari 16.4+ で PWA から利用可能 |
| Service Worker API | ブラウザ標準 | `registration.showNotification()` 経由で通知を発火 | モバイルでは `new Notification()` 非対応のため必須 |
| IndexedDB | ブラウザ標準 | `locked` フラグの永続化 | 既存 `fusen-drafts` DB に追加するだけ |

### Supporting

| API | Purpose | Notes |
|-----|---------|-------|
| `Notification.permission` | 権限状態確認 | `'granted'` / `'denied'` / `'default'` |
| `Notification.requestPermission()` | 権限リクエスト | iOS 16.4+ Safari PWA で動作、WebページはNG |
| `navigator.serviceWorker.ready` | SW 参照取得 | 既存パターンと同一 |
| `registration.getNotifications({ tag })` | 通知存在確認 | `CLOSE_NOTIFICATION` で既に使用中 |

---

## Architecture Patterns

### 既存コードの流用ポイント

```
app/viewer/page.tsx
├── DraftRecord 型 (line 389)          ← locked?: true を追加
├── saveDraft() / loadAllDrafts()       ← そのまま流用
├── list step useEffect (line 864)      ← 起動時復元ロジックを追加
├── 一覧カード右カラム (line 1725)     ← 🔔ボタンを🗑️の左隣に追加
└── activeNotifIds state (line 668)    ← ロック用には使わない（別 state を作る）
```

### Pattern 1: ロック通知の表示（showLockNotification）

**What:** `Notification.permission` を確認後 `registration.showNotification()` を呼ぶ
**When to use:** 🔔ボタンタップ（OFF → ON 切り替え時）

```typescript
// Source: MDN Web Notifications API (高信頼)
async function showLockNotification(noteId: string, title: string, body: string) {
  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') throw new Error('denied');
  }
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title || '（無題）', {
    body: body.slice(0, 40),
    tag: `fusen-lock-${noteId}`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  });
}
```

### Pattern 2: ロック通知の消去（closeLockNotification）

**What:** 既存 `CLOSE_NOTIFICATION` パターンを `fusen-lock-<id>` タグで流用
**When to use:** 🔔ボタンタップ（ON → OFF 切り替え時）

```typescript
// Source: 既存コード (line 1733-1735) の fusen-lock バリエーション
const reg = await navigator.serviceWorker.ready;
reg.active?.postMessage({ type: 'CLOSE_NOTIFICATION', tag: `fusen-lock-${noteId}` });
```

### Pattern 3: ロック状態の永続化

**What:** `saveDraft` で `locked` フラグを更新する
**When to use:** 🔔 ON/OFF 切り替え時

```typescript
// ロック ON
const draft = await loadDraft(noteId);
if (draft) await saveDraft({ ...draft, locked: true });

// ロック OFF
const draft = await loadDraft(noteId);
if (draft) {
  const { locked, ...rest } = draft;
  await saveDraft(rest as DraftRecord);
}
```

### Pattern 4: 起動時ロック復元（list useEffect に追加）

**What:** `loadAllDrafts()` から `locked === true` のメモを抽出して `showNotification` を再発火
**When to use:** `step === 'list'` 遷移時（既存 useEffect に追加）

```typescript
// Source: 既存 line 864-899 のパターンに追加
draftsPromise.then(async (drafts) => {
  const lockedIds = drafts.filter(d => d.locked).map(d => d.id);
  setLockedNoteIds(lockedIds);

  // 通知を再発火（既に存在する場合は同一タグで上書き）
  if (lockedIds.length > 0 && Notification.permission === 'granted') {
    const reg = await navigator.serviceWorker.ready;
    for (const d of drafts.filter(d => d.locked)) {
      const notifTitle = d.title || d.body.slice(0, 20) || '（無題）';
      const notifBody = d.title ? d.body.slice(0, 40) : d.body.slice(20, 60);
      await reg.showNotification(notifTitle, {
        body: notifBody,
        tag: `fusen-lock-${d.id}`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      });
    }
  }
});
```

### Pattern 5: 楽観的 UI 更新（🔔ボタンハンドラ）

**What:** `lockedNoteIds` を先に更新し、非同期処理が失敗したらロールバック
**When to use:** 🔔ボタンタップ時

```typescript
const handleLockToggle = async (e: React.MouseEvent, note: IphoneNote) => {
  e.stopPropagation();
  const isLocked = lockedNoteIds.includes(note.id);

  // 楽観的更新
  if (isLocked) {
    setLockedNoteIds(prev => prev.filter(id => id !== note.id));
  } else {
    setLockedNoteIds(prev => [...prev, note.id]);
  }

  try {
    if (isLocked) {
      // ロック解除
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: 'CLOSE_NOTIFICATION', tag: `fusen-lock-${note.id}` });
      const draft = await loadDraft(note.id);
      if (draft) { const { locked, ...rest } = draft; await saveDraft(rest as DraftRecord); }
    } else {
      // ロック ON（権限チェック付き）
      if (Notification.permission === 'default') {
        setIsLockPermissionPending(true); // disabled 制御
        const result = await Notification.requestPermission();
        setIsLockPermissionPending(false);
        if (result !== 'granted') {
          setLockedNoteIds(prev => prev.filter(id => id !== note.id)); // ロールバック
          setErrorMessage('通知権限が必要です。設定から有効にしてください');
          return;
        }
      } else if (Notification.permission === 'denied') {
        setLockedNoteIds(prev => prev.filter(id => id !== note.id)); // ロールバック
        setErrorMessage('通知権限が必要です。設定から有効にしてください');
        return;
      }
      await showLockNotification(note.id, note.title, note.body);
      const draft = await loadDraft(note.id);
      if (draft) await saveDraft({ ...draft, locked: true });
    }
  } catch {
    // ロールバック
    if (isLocked) {
      setLockedNoteIds(prev => [...prev, note.id]);
    } else {
      setLockedNoteIds(prev => prev.filter(id => id !== note.id));
    }
  }
};
```

### Anti-Patterns to Avoid

- **`new Notification()` を直接使う:** モバイル Safari では動作しない。必ず `registration.showNotification()` を使う
- **`activeNotifIds` にロック通知IDを混在させる:** `activeNotifIds` は PC受信通知（`fusen-<id>`）専用。タグ形式が異なるため `GET_NOTIFICATIONS` の変換結果と整合しない
- **SW にメッセージを送って通知表示する:** 既存 SW worker に `SHOW_NOTIFICATION` ハンドラは存在しない。フロントエンドから直接 `registration.showNotification()` を呼ぶ
- **`locked: undefined` を `saveDraft` に渡す:** `undefined` フィールドは IndexedDB に保存されないため問題ないが、spread 時に明示的に除外する方が安全

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 通知権限の状態管理 | 独自の権限状態 state | `Notification.permission` 読み取りのまま | ブラウザが正式な信頼源 |
| 通知の存在確認 | 独自の通知 state | `registration.getNotifications({ tag })` | SW が実態を把握している |
| 通知タグによる上書き | 重複チェックロジック | 同一タグで `showNotification` | タグが同じなら自動上書きが仕様 |

---

## Common Pitfalls

### Pitfall 1: iPhone Safari での通知権限リクエスト

**What goes wrong:** `Notification.requestPermission()` がホーム画面追加（PWA インストール）前は機能しない
**Why it happens:** iOS 16.4 以降、通知権限は PWA（standalone mode）でのみ要求・付与できる
**How to avoid:** `isStandalone` が `false` の場合は🔔ボタンを非表示にするか disabled にする。既に `isStandalone` state が実装済み（line 682〜）
**Warning signs:** `Notification.requestPermission()` が `'denied'` を即返す

### Pitfall 2: GET_NOTIFICATIONS の返す ID 形式

**What goes wrong:** `GET_NOTIFICATIONS` は全通知のタグを `tag.replace("fusen-","")` で処理して返す。ロック通知タグ `fusen-lock-<id>` だと `lock-<id>` が返る
**Why it happens:** SW 側の変換ロジックが `fusen-` プレフィックスのみを除去するため
**How to avoid:** ロック通知の管理には `activeNotifIds` を使わない。`lockedNoteIds` state を IndexedDB の `locked` フラグを信頼源として独立管理する
**Warning signs:** ロック状態の UI が通知の実態と乖離する

### Pitfall 3: loadDraft 結果が null の場合

**What goes wrong:** `loadDraft(note.id)` が `null` を返す場合に `saveDraft` を呼ぶと、メモのデータが失われる
**Why it happens:** `received_pc` メモは Drive から来るため、IndexedDB に draft が存在しない可能性がある
**How to avoid:** `loadDraft` が `null` の場合は `locked` フラグだけを含む最小レコードを作るか、`lockedNoteIds` state のみで管理し DB 永続化をスキップする。ただし LOCK-05 の要件（アプリ再起動後の復元）を満たすには永続化が必要なため、最小レコード方式が現実的。

### Pitfall 4: 起動時復元と permission の競合

**What goes wrong:** 起動時ロック復元（LOCK-05）で `showNotification` を呼ぶ際、permission が `'granted'` でない場合は何もしない必要がある（権限リクエストを起動時に自動実行すべきではない）
**Why it happens:** 権限リクエストはユーザージェスチャーに紐づく必要がある（iOS 制約）
**How to avoid:** 起動時復元では `Notification.permission === 'granted'` チェックを必ず行い、granted でない場合は通知再発火をスキップして `lockedNoteIds` の状態表示だけを復元する

### Pitfall 5: 削除時のロック解除漏れ

**What goes wrong:** メモを削除しても通知がロック画面に残り続ける
**Why it happens:** `deleteDraft()` は IndexedDB のレコードを削除するが SW の通知には影響しない
**How to avoid:** 削除ハンドラ（line 1748〜）に `CLOSE_NOTIFICATION` 送信と `lockedNoteIds` 更新を追加する。ロック中かどうかは `lockedNoteIds.includes(note.id)` で確認してから実行

---

## Code Examples

### 既存 🔕 ボタンのパターン（line 1726〜）— 🔔ボタンの実装参考

```typescript
// Source: app/viewer/page.tsx line 1726-1743（既存コード）
{note.status === 'received_pc' && activeNotifIds.includes(note.id) && (
  <button
    className="p-2 text-gray-400 hover:text-blue-500"
    aria-label="通知を削除"
    onClick={async (e) => {
      e.stopPropagation();
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'CLOSE_NOTIFICATION', tag: 'fusen-' + note.id });
        setActiveNotifIds((prev) => prev.filter((id) => id !== note.id));
      } catch {
        // エラー無視
      }
    }}
  >
    🔕
  </button>
)}
```

### 🔔ボタンの配置位置（line 1725）

```tsx
{/* 既存: line 1725 */}
<div className="flex items-center gap-0">
  {/* 新規: ここに 🔔 ボタンを追加 */}
  <button
    className={`p-2 ${lockedNoteIds.includes(note.id) ? 'text-blue-500' : 'text-gray-400'} hover:text-blue-500`}
    aria-label={lockedNoteIds.includes(note.id) ? 'ロック解除' : 'ロック画面に表示'}
    disabled={isLockPermissionPending}
    onClick={(e) => handleLockToggle(e, note)}
  >
    🔔
  </button>
  {/* 既存: 🔕 ボタン（line 1726〜）*/}
  {/* 既存: 🗑️ ボタン（line 1744〜）*/}
</div>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `new Notification()` | `registration.showNotification()` | モバイル対応に必須 |
| 通知タグなし | タグ付き通知（`fusen-lock-<id>`）| 個別削除・上書きが可能 |

---

## Open Questions

1. **`received_pc` メモの `loadDraft` が null の場合の永続化**
   - What we know: `received_pc` メモは Drive から IndexedDB に保存される。`saveDraft` で `locked: true` を付けて保存する想定
   - What's unclear: Phase 8〜12 の実装で `received_pc` メモが確実に `fusen-drafts` に存在するか要確認
   - Recommendation: 実装前に `loadDraft(note.id)` の null チェックを確認し、null の場合は最小レコードを生成してから `locked: true` で保存する

2. **`errorMessage` state の流用 vs 新規 state**
   - What we know: CONTEXT.md で Claude's Discretion として明示
   - What's unclear: 既存 `errorMessage` の型・リセットタイミングが不明
   - Recommendation: 既存 `errorMessage` state を流用する（新規 state を増やさない）。既存のエラー表示 UI と一貫性が保てる

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright |
| Config file | playwright.config.ts |
| Quick run command | `npx playwright test --grep "ロック"` |
| Full suite command | `npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOCK-01 | 🔔タップで通知が表示される | manual-only | — | — |
| LOCK-02 | 🔔再タップで通知が消える | manual-only | — | — |
| LOCK-03 | ロック中メモの🔔が `text-blue-500` になる | unit | `npx playwright test --grep "LOCK-03"` | ❌ Wave 0 |
| LOCK-04 | 複数メモが独立した通知タグを持つ | unit | `npx playwright test --grep "LOCK-04"` | ❌ Wave 0 |
| LOCK-05 | DB の `locked` フラグが永続化される | unit | `npx playwright test --grep "LOCK-05"` | ❌ Wave 0 |

**Note:** LOCK-01 / LOCK-02 はiPhone実機での Service Worker 通知表示が必要なため manual-only とする（Playwright で SW 通知表示を自動検証する手段がない）。

### Sampling Rate

- **Per task commit:** `npx playwright test --grep "LOCK"` （LOCK-03〜05 の UI 検証）
- **Per wave merge:** `npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/lock-notification.spec.ts` — LOCK-03/04/05 UI 検証
- [ ] mock-tauri.ts に SW 通知 API のモックが必要かどうか確認（現在の mock-tauri.ts は Tauri API のみモック）

---

## Sources

### Primary (HIGH confidence)

- MDN Web Notifications API — `registration.showNotification()` の仕様、`tag` による上書き挙動
- MDN Service Worker API — `getNotifications()` の仕様
- `app/viewer/page.tsx` — 既存コード（直接読取）
- `public/worker-mgtBAhqrihgq5AmSMpYK8.js` — 既存 SW コード（直接読取）

### Secondary (MEDIUM confidence)

- iOS 16.4 リリースノート — PWA でのプッシュ通知・Web Notifications 対応（複数ソースで確認済み）

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ブラウザ標準 API + 既存 SW コードの直接確認
- Architecture: HIGH — 既存コードの行番号レベルの確認済み
- Pitfalls: HIGH — 既存実装パターンから導出、iOS 制約は既知事実
- State management: HIGH — CONTEXT.md で設計確定済み

**Research date:** 2026-04-09
**Valid until:** 2026-05-09（Web Notifications API は安定仕様のため）
