# Technology Stack

**Project:** 俺の付箋 — iPhone→PC 送信機能追加マイルストーン
**Researched:** 2026-03-29
**Confidence:** HIGH (package.json / Cargo.toml 直接参照 + 公式ドキュメント + WebSearch検証)

---

## Context: 既存スタック（変更不要）

このマイルストーンは**追加のみ**。既存パッケージを変更・移植しない。

| 既存 | バージョン | 状態 |
|------|-----------|------|
| next | ^14.2.5 | Active |
| react / react-dom | ^18.3.1 | Active |
| mermaid | ^11.12.3 | **既にインストール済み** — 追加不要 |
| next-pwa | ^5.6.0 | Active（Vercel上で動作確認済み） |
| tokio | 1 (features: ["rt"]) | Active — timeフィーチャー追加が必要 |
| reqwest | 0.12 (features: ["json", "rustls-tls", "multipart"]) | Active — 追加不要 |
| base64 | 0.22 | Active |
| serde_json | 1.0 | Active |

---

## 新機能ごとの必要スタック

### 1. Mermaid図レンダリング（PWA /viewer）

**結論: 新規インストール不要。`mermaid@^11.12.3` は既にインストール済み。**

| 対応 | 内容 | 理由 |
|------|------|------|
| 使用API | `mermaid.render(id, definition)` → `{ svg }` を返す | v11 の正式 async API。DOM を直接書き換えない |
| SSR回避 | `next/dynamic(() => import('./MermaidBlock'), { ssr: false })` | mermaid は `window` に依存するためSSRで失敗する |
| 初期化 | `mermaid.initialize({ startOnLoad: false })` を useEffect 内で1回実行 | startOnLoad: true のままだと全 `.mermaid` クラス要素を自動走査してしまう |
| バンドル | mermaid は約 2MB超の大型ライブラリ。dynamic import + ssr:false により PWA の初期バンドルから除外される | /viewer ページのみで読み込まれる |

**実装パターン（HIGH confidence — mermaid公式ドキュメント + React実装例複数一致）:**

```typescript
// app/viewer/MermaidBlock.tsx  ('use client' + dynamic importで使う)
'use client';
import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

export function MermaidBlock({ definition }: { definition: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    mermaid.render(id, definition).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    });
  }, [definition]);

  return <div ref={ref} />;
}
```

SimpleNoteBody.tsx の中でこのコンポーネントをインポートする際は、
`````````text
const MermaidBlock = dynamic(() => import('./MermaidBlock').then(m => ({ default: m.MermaidBlock })), { ssr: false });
`````````
のパターンで取り込む。

**代替ライブラリを使わない理由:**

| 代替 | 却下理由 |
|------|---------|
| react-x-mermaid | mermaid を内包した wrapper。既に mermaid が入っているため二重管理になる |
| @mermaid-js/mermaid-react | 非公式。mermaid 本体 API で十分 |
| mermaid-to-svg (Node.js server-side) | サーバー不要のPWAクライアント描画には不適 |

---

### 2. 画像アップロード/キャプチャ（PWA）

**結論: 新規ライブラリ不要。ブラウザ標準API（FileReader + fetch）で完結。**

| 対応 | 方法 | 理由 |
|------|------|------|
| カメラ/ライブラリ選択 | `<input type="file" accept="image/*" capture="environment">` | iPhone Safari PWA で動作確認済みの唯一の標準手段 |
| リサイズ | Canvas API（`drawImage` + `toDataURL('image/jpeg', 0.7)`） | 新規ライブラリなしで実現。JPEG 70% 品質で 1MB 以下に圧縮 |
| Drive送信形式 | base64 data URL をそのまま Markdown に埋め込み（`![alt](data:image/jpeg;base64,...)`） | 既存 SimpleNoteBody.tsx が `data:` URI を img タグで表示する実装済み。Drive の fusen_note.json の body フィールドに含める |
| サイズ上限 | Drive multipart upload の推奨上限は 5MB。base64 は元サイズの約1.33倍。Canvas リサイズで元画像を ~750KB 以下に収めれば安全 | HIGH confidence — Google Drive 公式ドキュメント |

**サイズガイドライン（MEDIUM confidence — Google Drive 公式 + 実装慣例）:**

- Canvas resize: 最大長辺 1200px に収める
- JPEG品質: 0.7（約70%）
- 目標: base64 encode 後のJSON全体が 4MB 以下
- Drive multipart limit: 5MB（メタデータ + ファイル合計）

**何を追加しないか:**

| 避けるもの | 理由 |
|----------|------|
| Blob URL + Drive メディアファイル個別アップロード | fusen_note.json の body に含める現行設計と競合。Drive file ID の管理が増える |
| sharp（サーバーサイドリサイズ） | iPhone PWA はサーバーに頼らずクライアントで完結させる設計 |
| Compressor.js / browser-image-compression | Canvas API で十分。依存増加を避ける |

---

### 3. Drive ポーリング（Rust側）

**結論: 新規クレート不要。tokio の `time` フィーチャー追加のみ必要。**

現在の Cargo.toml:
```toml
tokio = { version = "1", features = ["rt"] }
```

必要な変更:
```toml
tokio = { version = "1", features = ["rt", "time"] }
```

`tokio::time::interval` は `time` フィーチャーで提供される。現在 `rt` のみで `time` が含まれていないため、`interval` を使うとコンパイルエラーになる（HIGH confidence — Cargo.toml 直接確認）。

**ポーリングパターン（tokio + reqwest、追加クレートなし）:**

```rust
tokio::spawn(async move {
    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(30));
    loop {
        ticker.tick().await;
        // reqwest で Drive API を叩く（既存クライアント再利用）
    }
});
```

reqwest 0.12 + rustls-tls + multipart は既にインストール済みで Drive API の multipart upload に対応している（HIGH confidence — Cargo.toml 直接確認）。

---

### 4. Drive ファイル一覧/履歴（iPhoneノートリスト）

**結論: 新規クレート・ライブラリ不要。**

- Drive API `GET /drive/v3/files?q=name+contains+'fusen_'` を fetch（PWA側）または reqwest（Rust側）で叩くだけ
- serde_json 1.0（既存）でJSON解析
- フロント側は既存の `downloadFromDrive` ヘルパー（viewer/page.tsx）を拡張する形で実装可能

---

## 変更サマリー

### package.json — 追加なし

mermaid は既にインストール済み。追加インストール不要。

### Cargo.toml — 1行変更のみ

```toml
# 変更前
tokio = { version = "1", features = ["rt"] }

# 変更後
tokio = { version = "1", features = ["rt", "time"] }
```

それ以外の Rust クレートは追加不要。

---

## バージョン互換性

| Package/Crate | 既存バージョン | 新機能との互換性 |
|---------------|-------------|----------------|
| mermaid | ^11.12.3（最新 11.13.0） | `mermaid.render()` API は v10+ から安定。v11 で async に変更済み。互換あり |
| tokio | 1 | `time` フィーチャー追加は後方互換。既存コードに影響なし |
| reqwest | 0.12 (rustls-tls + multipart) | Drive API multipart upload に対応済み。変更不要 |
| next-pwa | ^5.6.0 | dynamic import の動作に影響なし |
| next | ^14.2.5 | `next/dynamic` + `ssr: false` パターンは 13.2+ から対応。互換あり |

---

## 何を追加しないか（重要）

| 追加しない | 理由 |
|-----------|------|
| react-mermaid / react-x-mermaid 等の wrapper ライブラリ | mermaid 本体が既にある。wrapper は mermaid を内包するため二重になる |
| browser-image-compression / Compressor.js | Canvas API で代替可能。依存増加のデメリットが大きい |
| sharp | サーバーサイド専用。PWAクライアントでは使えない |
| googleapis（npm） | /viewer は Drive API を直接 fetch で叩く設計（googleapis クライアントライブラリ不要） |
| hono 追加エンドポイント | 既存 /api/auth/token, /api/auth/refresh で十分。iPhone→PC 送信に新規サーバーAPIは不要 |
| 新規 Rust クレート | reqwest + tokio(time) + serde_json の組み合わせで全てのDrive操作が賄える |

---

## Sources

- `package.json`（直接確認）— HIGH confidence
- `src-tauri/Cargo.toml`（直接確認）— HIGH confidence
- `app/viewer/SimpleNoteBody.tsx`（直接確認 — data: URI 処理済みを確認）— HIGH confidence
- mermaid 公式 Usage ドキュメント: https://mermaid.js.org/config/usage.html — HIGH confidence
- mermaid npm: https://www.npmjs.com/package/mermaid（最新 11.13.0 確認）— HIGH confidence
- Google Drive Upload 公式: https://developers.google.com/drive/api/guides/manage-uploads — HIGH confidence
- Mermaid React パターン（複数ソース一致）: https://rendazhang.medium.com/why-mermaid-charts-disappear-in-react-and-how-to-fix-it-351545ef1ebc — MEDIUM confidence
- tokio time feature: https://tokio.rs/ — HIGH confidence

---

*Stack research for: iPhone→PC 送信機能追加マイルストーン*
*Researched: 2026-03-29*
