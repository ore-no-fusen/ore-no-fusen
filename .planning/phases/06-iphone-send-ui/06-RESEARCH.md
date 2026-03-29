# Phase 6: iPhone送信UI - Research

**Researched:** 2026-03-29
**Domain:** Next.js PWA / iOS Safari / Canvas API / Mermaid / Google Drive JSON
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### ステップ構成・フロー
- readyステップを廃止 — writeがホーム画面になる
- ステップ型に追加: `'write'` と `'list'`（既存: banner / login / push / note は変更しない）
- PWAアイコンタップ → ログイン済みなら即 `write`（新規作成画面）
- 初回: login → push → write
- `note`「消す」後 → `write`（iOSのPWAはwindow.closeが使えないため。余分な画面は出さない）

#### 書く画面（writeステップ）
- タイトル欄あり（1行テキスト、任意入力）
- 本文テキストエリアは画面の大半（約70%）
- レイアウト（上から順）:
  1. ヘッダー: 左に「📋 履歴」ボタン、中央に「書く」
  2. タイトル入力欄（1行）
  3. 本文テキストエリア（大半）
  4. 添付ツールバー: 📷（画像）、「Mermaid」ボタン
  5. アクションボタン行: 「iPhoneに置いておく」（左）、「PCに送る」（右・青）
- 「キャンセル」ボタンなし（readyが廃止されたため戻り先がない）
- 送信中: 「PCに送る」ボタンを「送信中...」にして無効化
- 「PCに送る」成功後: 入力欄をクリアして write に留まる（成功メッセージ表示）
- 「iPhoneに置いておく」後: 下書き保存 → list に遷移

#### 添付機能
- 📷 ボタン: iOS標準のカメラ/ライブラリ選択シートを出す（`<input type="file" accept="image/*" capture>`）
- 画像選択後: Canvas APIでリサイズ → base64 → カーソル位置に `![](data:...)` として挿入
- Mermaid ボタン: モーダル（全画面）で入力
  - コード入力欄 + 「プレビュー」ボタン（押したときのみSVG描画）
  - 「挿入」で ` ```mermaid\n...\n``` ` ブロックとして本文のカーソル位置に挿入

#### 履歴画面（listステップ）
- 最新10件表示（要件: HIST-01）
- 1件あたりの表示: sent/draftバッジ + タイムスタンプ（相対時刻）+ 本文冒頭テキスト（約20文字）
- 下書き（draft）タップ → write に遷移して編集再開（HIST-02）
- 送信済み（sent）タップ → 何もしない（参照のみ、操作不要）
- ヘッダー左に「← 戻る」→ write に戻る

#### Mermaidレンダリング（viewerでの表示）
- viewer内で ` ```mermaid ` コードブロックを検出してSVG描画（REND-01）
- `mermaid@^11.12.3` を dynamic import で使用（既存パッケージ、新規追加なし）
- SimpleNoteBody.tsx を拡張してMermaidブロックを処理する

#### Drive上のファイル
- `fusen_from_iphone.json`（PC宛送信）
- `fusen_iphone_notes.json`（履歴）

### Claude's Discretion
- 添付ツールバーのアイコンデザイン・サイズ
- Mermaidモーダルのサイズ・閉じるボタンの位置
- 送信成功メッセージの表示方法（トースト等）
- Mermaidプレビューエラー時のエラー表示
- 冒頭テキストの文字数（約20文字の±調整）

### Deferred Ideas (OUT OF SCOPE)
なし — 議論はPhase 6のスコープ内に収まった
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEND-01 | iPhoneでテキストを入力して「PCに送る」で付箋をDriveに送信できる | uploadToDrive() が実装済み。fusen_from_iphone.json への書き込みパターンを確立する |
| SEND-02 | 「iPhoneに置いておく」で下書きとしてiPhone履歴に保存できる（PCには送らない） | fusen_iphone_notes.json への書き込み。downloadFromDrive + uploadToDrive の組み合わせ |
| SEND-03 | 画像追加ボタンでカメラ/ライブラリから写真を付箋に添付できる（Canvas圧縮→Markdown画像） | Canvas API パターン確認済み。input[type=file capture] の iOS挙動を文書化 |
| SEND-04 | Mermaidボタンでコード入力欄+プレビューを開き、本文に mermaid ブロックとして挿入できる | mermaid@^11.12.3 既存。dynamic import + mermaid.render() パターンを文書化 |
| HIST-01 | 送信後に送信済み+下書きの履歴リストを表示できる（最新10件、sent/draft 区別） | fusen_iphone_notes.json スキーマ設計、downloadFromDrive() で取得 |
| HIST-02 | 履歴から下書きを選んで編集・送信できる | write ステップへの遷移 + 初期値ロードパターン |
| REND-01 | viewer内で mermaid コードブロックを図（SVG）として描画できる | SimpleNoteBody.tsx 拡張。mermaid.render() の SSR回避パターン |
</phase_requirements>

---

## Summary

Phase 6はiPhone向けPWA（viewer/page.tsx）に「書く」「保存する」「履歴を見る」のUIを追加するフェーズ。技術的な新規導入はなく、すでに動いているコードの拡張が中心。

`viewer/page.tsx` は448行の単一ファイルでステップ管理UIを実装している。既存のstep型（`'banner' | 'login' | 'push' | 'ready' | 'note'`）に `'write'` と `'list'` を追加し、readyを廃止する。`uploadToDrive()` / `downloadFromDrive()` / `refreshAccessToken()` はすでに実装済みで再利用する。

主要な実装課題は3点：(1) Mermaid dynamic importのSSR回避とレンダリングタイミング、(2) iOS Safariでのファイル選択とCanvas API処理、(3) SimpleNoteBody.tsxのMermaidブロック検出（現在は画像のみ対応）。すべて既存スタックで解決可能で、新規パッケージの追加は不要。

**Primary recommendation:** viewer/page.tsx のステップ型拡張から始め、write/listステップUIを追加後、SimpleNoteBody.tsxのMermaid対応で締める順序で実装する。

---

## Standard Stack

### Core（確認済み・変更なし）

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^14.2.5 | PWA フレームワーク | 既存。App Router + 'use client' |
| React | ^18.3.1 | UI | 既存 |
| Tailwind CSS | ^3.4.19 | スタイリング | 既存。青ボタン・エラー表示パターン確立済み |
| mermaid | ^11.12.3 | Mermaid SVG描画 | 既存パッケージ。dynamic importで使用 |
| next-pwa | ^5.6.0 | PWA対応（SW登録） | 既存 |

### Supporting（確認済み）

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Canvas API | ブラウザ標準 | 画像リサイズ | ライブラリ不要。`canvas.toDataURL('image/jpeg', 0.7)` で base64変換 |
| Google Drive API v3 | REST | JSON ファイル保存 | 既実装。multipart FormData パターン |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas API直接 | browser-image-compression | 不要。決定済み。軽量のCanvas APIで十分 |
| mermaid dynamic import | SSR時に静的importを試みる | NG。mermaidはブラウザのみで動作。dynamic importが必須 |

**Installation:** 追加インストール不要（すべて既存）

---

## Architecture Patterns

### Recommended Project Structure（変更なし）

```
app/viewer/
├── page.tsx          # ステップ管理UI（write/list追加）
└── SimpleNoteBody.tsx # Markdown+Mermaidレンダラ（拡張）
```

### Pattern 1: ステップ型の拡張

**What:** 既存の union type に `'write' | 'list'` を追加し、ready を廃止
**When to use:** 新しい画面を追加する場合

```typescript
// 変更前
const [step, setStep] = useState<'banner' | 'login' | 'push' | 'ready' | 'note'>('banner');

// 変更後（ready は型から除去せず、遷移先から除くだけでもよい）
const [step, setStep] = useState<'banner' | 'login' | 'push' | 'write' | 'list' | 'note'>('banner');
```

既存の useEffect の deps は `[]` なので変更不要（STATE.md の決定事項）。

### Pattern 2: Mermaid dynamic import

**What:** mermaid はブラウザAPIに依存するため、SSR環境では import できない。`dynamic(() => import(...), { ssr: false })` または `import()` を関数内部で呼び出す
**When to use:** `SimpleNoteBody.tsx` 内のMermaidレンダリング、Mermaidモーダルのプレビュー

```typescript
// Source: mermaid 公式ドキュメント + 既存プロジェクト方針
// SimpleNoteBody.tsx 内（useEffect の中で呼ぶ）
useEffect(() => {
  import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false });
    mermaid.render('mermaid-svg-id', code).then(({ svg }) => {
      containerRef.current!.innerHTML = svg;
    });
  });
}, [code]);
```

**注意:** `mermaid.render()` の第1引数はユニークなID。複数ブロックがある場合は `mermaid-0`, `mermaid-1` のように連番にする。

### Pattern 3: Canvas API 画像圧縮 → base64

**What:** input[type=file] で選択した File を Canvas でリサイズし、base64文字列に変換
**When to use:** 📷 ボタン押下時

```typescript
// Source: MDN Web Docs Canvas API
async function resizeImageToBase64(file: File, maxWidth = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}
```

iOS Safariの制約: `capture` 属性を `accept="image/*"` と組み合わせると標準シートが出る。`capture="camera"` にするとカメラ直接起動になる。決定では両方選べるシートを出すため `capture` 属性は省略（`accept="image/*"` のみ）。

### Pattern 4: Drive の履歴ファイル（fusen_iphone_notes.json）スキーマ

**What:** 最新50件上限の配列。先頭が最新

```typescript
// fusen_iphone_notes.json の構造
type IphoneNote = {
  id: string;           // crypto.randomUUID()
  status: 'sent' | 'draft';
  title: string;
  body: string;
  created_at: string;   // ISO 8601
  sent_at?: string;     // PCに送った場合
};

type IphoneNotesFile = {
  notes: IphoneNote[];  // 最大50件（push後にslice(0, 50)）
};
```

**読み込み:** `downloadFromDrive(token, 'fusen_iphone_notes.json')` → `data.notes ?? []`
**書き込み:** `uploadToDrive(token, 'fusen_iphone_notes.json', { notes: [...] })`

### Pattern 5: fusen_from_iphone.json（PC宛送信キュー）スキーマ

```typescript
// fusen_from_iphone.json の構造（Phase 7 のポーリング対象）
type FromIphoneFile = {
  id: string;
  title: string;
  body: string;
  sent_at: string;     // ISO 8601
  received_at?: string; // Phase 7 がマーク
};
```

既存の `uploadToDrive()` でそのまま上書きする（最新1件キュー方式）。

### Pattern 6: テキストエリアのカーソル位置への挿入

**What:** `<textarea>` の `selectionStart` / `selectionEnd` を使ってカーソル位置にテキストを挿入し、その後 React state を更新する

```typescript
// textareaRef.current が <textarea> の場合
function insertAtCursor(textareaEl: HTMLTextAreaElement, insertion: string): string {
  const { selectionStart, selectionEnd, value } = textareaEl;
  const newValue =
    value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
  // React の状態更新後、カーソルを挿入末尾に移動
  requestAnimationFrame(() => {
    const pos = selectionStart + insertion.length;
    textareaEl.selectionStart = pos;
    textareaEl.selectionEnd = pos;
  });
  return newValue;
}
```

### Anti-Patterns to Avoid

- **mermaid を useEffect 外で import:** `window is not defined` エラー。必ず useEffect 内または dynamic import で
- **mermaid.render() に重複ID:** 同じIDを複数回呼ぶとDOMエラー。連番ID必須
- **画像 base64 をリサイズせずそのまま送信:** Drive APIの4MB/リクエスト制限とJSON肥大化。Canvas圧縮は必須
- **履歴取得の失敗を致命的エラーとして扱う:** 初回（ファイル未作成）は 404 が返る。`not found` エラーを空配列として扱う
- **ready ステップへの新しい遷移を追加する:** readyは廃止。push後は write に遷移

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mermaid SVG生成 | 独自パーサー | `mermaid.render()` | 既存パッケージ。複雑な文法・テーマ対応が組み込み |
| 画像圧縮 | 独自圧縮ロジック | Canvas API `toDataURL('image/jpeg', 0.7)` | ブラウザ標準。品質パラメータで十分 |
| Drive ファイル操作 | 新しい関数 | 既存 `uploadToDrive()` / `downloadFromDrive()` | 検索+PATCH+POSTの複雑さを隠蔽済み |
| 相対時刻表示 | 独自フォーマッター | `Intl.RelativeTimeFormat` | ブラウザ標準。日本語対応済み |
| UUID生成 | Math.random() | `crypto.randomUUID()` | 既にviewer/page.tsxで使用済み |

**Key insight:** このフェーズは新技術導入なし。既存コードとブラウザ標準APIで全要件を満たせる。

---

## Common Pitfalls

### Pitfall 1: mermaid SSR エラー（`window is not defined`）

**What goes wrong:** `SimpleNoteBody.tsx` はサーバー側でも実行される可能性がある。mermaid が top-level で import されると Next.js SSR でクラッシュ
**Why it happens:** mermaid は `document` / `window` を直接参照する
**How to avoid:** `useEffect` 内で `import('mermaid')` する。`'use client'` ディレクティブを `SimpleNoteBody.tsx` に追加
**Warning signs:** ビルド時に `ReferenceError: window is not defined`

### Pitfall 2: 履歴ファイルが存在しない（初回起動）

**What goes wrong:** `downloadFromDrive(token, 'fusen_iphone_notes.json')` が初回は `not found` エラーをスロー。list ステップがクラッシュ
**Why it happens:** `downloadFromDrive()` の実装（line 92: `throw new Error(...)`)
**How to avoid:** `.catch(() => ({ notes: [] }))` でフォールバック
**Warning signs:** 履歴画面が空白のままエラーメッセージが表示される

### Pitfall 3: push ステップ完了後の遷移先

**What goes wrong:** 現在の実装は push ステップ完了後に `setStep('ready')` している（page.tsx line 385）。`ready` が廃止されると UI が空白になる
**Why it happens:** 既存コードが `ready` に遷移している
**How to avoid:** push ステップの `setStep('ready')` を `setStep('write')` に変更する
**Warning signs:** push 完了後に何も表示されない

### Pitfall 4: note「消す」後の遷移先

**What goes wrong:** 現在の実装は「消す」ボタンが `setStep('ready')` に遷移している（page.tsx line 424）
**Why it happens:** ready が廃止されるため
**How to avoid:** `setStep('write')` に変更
**Warning signs:** 付箋を消した後に何も表示されない

### Pitfall 5: iOS でのキーボード表示時のレイアウト崩れ

**What goes wrong:** iOS Safari でソフトウェアキーボードが開くと `100vh` が正しく機能せず、textarea が画面外にはみ出す
**Why it happens:** iOS Safariはキーボード表示時に viewport height を変更しない
**How to avoid:** `min-h-screen` の代わりに `min-h-[100dvh]` を使用（Tailwind 3.4+対応）。または固定レイアウトではなくスクロール可能なflexboxレイアウトにする
**Warning signs:** iPhoneでテキスト入力時にボタンが隠れる

### Pitfall 6: mermaid.render() のID重複

**What goes wrong:** `SimpleNoteBody.tsx` が複数の mermaid ブロックを描画する場合、同じ ID を使うとDOMエラーが発生
**Why it happens:** mermaid の内部でIDが使われるため
**How to avoid:** ブロックのインデックスを使って `mermaid-${index}` でユニークIDを生成
**Warning signs:** 2番目以降の mermaid ブロックが描画されない

---

## Code Examples

### SimpleNoteBody.tsx Mermaid ブロック拡張パターン

```typescript
// 現在の実装（画像のみ）は imgRe で正規表現マッチを行っている
// Mermaid は ```mermaid\n...\n``` のコードブロックを検出する

// 検出用正規表現（改行を含むため m フラグなし、s フラグで . が改行にマッチ）
const mermaidRe = /```mermaid\n([\s\S]*?)```/g;

// MermaidBlock コンポーネント（useEffect で mermaid を dynamic import）
// 'use client' が必要
```

### 相対時刻の表示

```typescript
// Source: MDN Intl.RelativeTimeFormat
function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' });
  if (diff < 60_000) return rtf.format(-Math.floor(diff / 1000), 'seconds');
  if (diff < 3_600_000) return rtf.format(-Math.floor(diff / 60_000), 'minutes');
  if (diff < 86_400_000) return rtf.format(-Math.floor(diff / 3_600_000), 'hours');
  return rtf.format(-Math.floor(diff / 86_400_000), 'days');
}
```

### Drive 履歴の読み込み（初回ファイルなし対応）

```typescript
async function loadIphoneNotes(token: string): Promise<IphoneNote[]> {
  return downloadFromDrive(token, 'fusen_iphone_notes.json')
    .then((data) => data.notes ?? [])
    .catch(() => []); // ファイル未作成の初回は空配列
}
```

### 履歴への追記と上限管理

```typescript
async function saveToHistory(token: string, note: IphoneNote) {
  const existing = await loadIphoneNotes(token);
  // 同じIDが既にあれば更新（下書き→送信済みに変更する場合）
  const filtered = existing.filter((n) => n.id !== note.id);
  const updated = [note, ...filtered].slice(0, 50); // 最新50件
  await uploadToDrive(token, 'fusen_iphone_notes.json', { notes: updated });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ready ステップがホーム | write ステップがホーム | Phase 6 | PWAアイコンタップで即書ける |
| PC→iPhone 方向のみ | iPhone→PC 双方向 | Phase 6 | Drive経由の最新1件キュー |
| SimpleNoteBody: 画像のみ | Mermaid SVGも描画 | Phase 6 | mermaidブロックが図として見える |

**Deprecated/outdated:**
- `step === 'ready'` のレンダリングブロック: Phase 6 で廃止。`setStep('write')` に置き換え

---

## Open Questions

1. **mermaid.render() の非同期エラーハンドリング**
   - What we know: `mermaid.render()` は構文エラーがある場合に reject する
   - What's unclear: エラーメッセージのフォーマット（ユーザーに見せるか、赤テキストで表示するか）
   - Recommendation: Claudeの裁量（CONTEXT.md に記載済み）。`catch` でエラーテキストを表示するシンプルな方法で十分

2. **accessToken 期限切れ時の write/list ステップの自動リフレッシュ**
   - What we know: `refreshAccessToken()` は実装済み。`downloadWithAutoRefresh()` は note ステップ向けに実装済み
   - What's unclear: write/list ステップでも同様のリフレッシュ処理が必要か（uploadToDrive が失敗した場合）
   - Recommendation: upload/download 呼び出しを `try/catch` で囲み、失敗時は `refreshAccessToken()` を試みる関数を共通化する

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.17 + @testing-library/react ^16.3.1 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run app/viewer/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEND-01 | uploadToDrive が fusen_from_iphone.json に正しいペイロードを送信する | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存ファイル（新テスト追加） |
| SEND-02 | 下書き保存が fusen_iphone_notes.json に status:'draft' で保存される | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存ファイル（新テスト追加） |
| SEND-03 | Canvas API でリサイズされた base64 が Markdown 画像として body に挿入される | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存ファイル（新テスト追加） |
| SEND-04 | mermaid ブロックが本文カーソル位置に挿入される | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存ファイル（新テスト追加） |
| HIST-01 | 履歴ファイルから最新10件を表示する | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存ファイル（新テスト追加） |
| HIST-02 | 下書きタップで write ステップに遷移し、body が復元される | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存ファイル（新テスト追加） |
| REND-01 | SimpleNoteBody が mermaid ブロックを SVG として描画する | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存ファイル（新テスト追加） |

**注意:** mermaid と Canvas API はブラウザAPIに依存するため、vitest (jsdom) でモックが必要。

#### jsdom でのモック方針
- `mermaid`: `vi.mock('mermaid', ...)` で `render` 関数をスタブ（`{ svg: '<svg>mock</svg>' }` を返す）
- Canvas API: jsdom はCanvasをサポートしない。`HTMLCanvasElement.prototype.getContext` を `vi.fn()` でモック

### Sampling Rate
- **Per task commit:** `npx vitest run app/viewer/viewer.test.tsx`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/viewer/viewer.test.tsx` — SEND-01〜04, HIST-01〜02, REND-01 のテストケースを追加（スタブとして先行作成）
- [ ] `vi.mock('mermaid')` のセットアップ — mermaid の jsdom 対応モック

*(既存の test infrastructure は存在するが、Phase 6 要件のテストケースが未追加)*

---

## Sources

### Primary (HIGH confidence)
- 直接コード読み取り: `app/viewer/page.tsx` (448行全体) — 既存ステップ型、uploadToDrive、downloadFromDrive の実装
- 直接コード読み取り: `app/viewer/SimpleNoteBody.tsx` — 現在の画像レンダリング実装
- 直接コード読み取り: `app/viewer/viewer.test.tsx` — テストパターン
- 直接コード読み取り: `package.json` — mermaid ^11.12.3 の存在確認
- 直接コード読み取り: `.planning/phases/06-iphone-send-ui/06-CONTEXT.md` — すべてのロック済み決定事項
- 直接コード読み取り: `.planning/STATE.md` — v3.0 アーキテクチャ決定事項

### Secondary (MEDIUM confidence)
- mermaid 公式 GitHub (mermaid-js/mermaid): `mermaid.render(id, code)` の API 確認（mermaid@11.x系のAPI）
- MDN Web Docs: Canvas API `toDataURL`, `Intl.RelativeTimeFormat`

### Tertiary (LOW confidence)
- なし

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 全ライブラリが既存プロジェクトに存在し、package.jsonで確認済み
- Architecture: HIGH — 既存コードを直接読んだ。パターンはすでに確立済み
- Pitfalls: HIGH — 既存コードのピットフォール（ready遷移の変更漏れ等）はコードから直接確認。iOS固有の問題はプロジェクト歴史から確認

**Research date:** 2026-03-29
**Valid until:** 2026-04-29（安定スタックのため30日）
