# Phase 19 手動検証手順書

Phase 19「起動性能 300ms 達成（Pool 窓 透明→不透明アーキテクチャ）」の手動検証手順を記載する。

自動化できない項目（Win32 ウィンドウ属性確認・グローバルホットキー・実機計測）を対象とする。

---

## 前提

- Tauri ビルド済みであること（`npm run tauri build` → インストーラ実行済み）
- または開発ビルド（`npm run tauri dev`）が起動済みであること
- Windows 10/11 環境（WSL 不可、物理 or 仮想マシン上の Windows）

---

## PERF-05: Spy++ で Pool 窓の WS_EX_LAYERED 確認

**目的**: Pool 窓が `WS_EX_LAYERED`（拡張スタイル 0x80000）を持ち、完全透明（α=0）で画面外に配置されていることを確認する。

### Spy++ の入手

1. Visual Studio インストーラを開く
2. 「個別のコンポーネント」→「Spy++」を選択してインストール
   - または: Visual Studio がインストール済みの場合、`C:\Program Files\Microsoft Visual Studio\...\Common7\Tools\spyxx_amd64.exe` を実行
3. Spy++ が見つからない場合: `winspy` で検索（Microsoft Store には非掲載のため、VS インストールが必要）

### 確認手順

1. 俺の付箋アプリを起動する（Ctrl+N を 1 回以上押して Pool 窓が初期化されていること）
2. Spy++ を管理者権限で起動する
3. メニュー「検索」→「ウィンドウ検索」を開く
4. ファインダーツール（照準アイコン）をデスクトップにドラッグして、俺の付箋のウィンドウをフォーカスする
5. Spy++ のウィンドウ一覧で `pool-window-` で始まるウィンドウを探す
6. 当該ウィンドウをダブルクリック → プロパティを開く
7. 「スタイル」タブを確認する

### 期待する値

| 項目 | 期待値 | 確認方法 |
|------|--------|----------|
| 拡張スタイル | `WS_EX_LAYERED` (0x80000) を含む | スタイル一覧に表示される |
| 位置 (X, Y) | 画面解像度を超えた座標（例: 99999, 99999）| 「位置」タブまたはスタイル |
| Alpha 値 | 0（完全透明） | `GetLayeredWindowAttributes` で確認 |

### 判定基準

- `WS_EX_LAYERED` フラグが存在する → PASS
- Pool 窓が画面外に配置されている（座標が画面解像度を超えている） → PASS
- 5/5 で PASS → PERF-05 達成

---

## PERF-07: グローバル Ctrl+N でメモ帳フォーカス中でも付箋が手前表示

**目的**: 俺の付箋がフォーカスを持っていない状態で Ctrl+N を押しても、付箋が最前面に表示されることを確認する。

### 確認手順

1. 俺の付箋アプリを起動する
2. メモ帳（notepad.exe）を起動し、フォーカスをメモ帳に移す
3. メモ帳がアクティブな状態で `Ctrl+N` を押す
4. 以下を確認する:
   - 俺の付箋の新しい付箋ウィンドウが表示される
   - 付箋がメモ帳の手前（前景）に表示される
   - 付箋に入力カーソルがある（入力可能状態）
   - メモ帳に「新しいファイル」ダイアログが出ていない（グローバルホットキーが正しく機能している場合、メモ帳側の Ctrl+N は無視される）

> **注意**: アプリ設定でグローバルホットキーが有効になっていることを確認すること。
> 初回起動時はグローバルホットキーが無効の場合がある。

### 繰り返し確認

上記を 5 回繰り返す。

### 判定基準

- 5/5 で付箋が手前に表示される → PERF-07 達成
- 4/5 以下 → 失敗（SetForegroundWindow の動作を確認）

---

## 300ms 実機計測手順

**目的**: Ctrl+N を押してから T2_READY（エディタにフォーカスが当たり入力可能になるまで）が 300ms 以内であることを計測・確認する。

### 計測の仕組み

| ポイント | 計測場所 | 意味 |
|----------|----------|------|
| T0 | StickyNote.tsx の keydown ハンドラ | Ctrl+N 押下時刻（`Date.now()`） |
| T1_RUST_ENTER | lib.rs `fusen_show_at_position` 入口 | Rust バックエンド到達時刻 |
| T2_READY | StickyNote.tsx promote_from_pool リスナー末尾 | エディタ focus 完了時刻 |

T0〜T2_READY の elapsed_ms が 300ms 以内であることが目標。

### 手順

1. Tauri アプリをビルドして起動する:
   ```
   npm run tauri build
   # インストーラを実行してインストール
   # または: npm run tauri dev
   ```

2. アプリが起動したら、付箋フォルダを選択する（未選択の場合）

3. Ctrl+N を 5 回以上押す（各操作の間隔は 2 秒以上空けること）

4. `%LOCALAPPDATA%\ore-no-fusen\perf.jsonl` が生成されていることを確認する:
   ```
   # エクスプローラーで確認: %LOCALAPPDATA%\ore-no-fusen\
   # または PowerShell:
   Get-Content "$env:LOCALAPPDATA\ore-no-fusen\perf.jsonl"
   ```

5. 中央値を計算する:
   ```
   npm run perf:check
   ```

6. 出力を確認する:
   ```
   [perf-check] Samples: 5
   [perf-check] T2_READY — min: 150ms, median: 180ms, max: 250ms
   [perf-check] 閾値: 300ms
   [perf-check] PASS: 中央値 180ms ≤ 300ms
   ```

### 判定基準

- `npm run perf:check` が exit 0 → PERF-01 達成（中央値 ≤ 300ms）
- exit 1 → 失敗（中央値 > 300ms または サンプル不足）

### 再計測する場合

`perf.jsonl` を削除してから再度 Ctrl+N を 5 回押す:
```
Remove-Item "$env:LOCALAPPDATA\ore-no-fusen\perf.jsonl"
```

---

## 連打耐性実機確認

**目的**: 起動完了後に 1.5 秒で 3 回連打しても、3 個の付箋が全て 300ms 以内に表示されることを確認する。

### 確認手順

1. 俺の付箋アプリを起動し、Pool 窓の初期化が完了するまで 5 秒程度待つ
   （起動直後は Pool 窓の初期化中のため、最初の Ctrl+N が遅い場合がある）

2. 既存の `perf.jsonl` を削除する:
   ```
   Remove-Item "$env:LOCALAPPDATA\ore-no-fusen\perf.jsonl"
   ```

3. Ctrl+N を 3 回、各 500ms 間隔で押す（合計 1.5 秒）

4. 3 つの付箋ウィンドウが開いていることを確認する

5. `npm run perf:check` を実行して、3 サンプル全ての elapsed_ms を確認する:
   - サンプル数が 3 未満の場合: スロットルが正常に動作している可能性がある
     （1.2 秒スロットルにより、500ms 間隔では 1 回目しか通らない）
   - **正しい連打テスト**: 1.2 秒以上の間隔で 3 回（例: 0ms, 1300ms, 2600ms）

> **スロットル仕様**:
> StickyNote.tsx の `lastCtrlNRef` は 1.2 秒スロットル。
> 連打テストは 1.2 秒以上の間隔で 3 回行うこと。

### 判定基準

- 3 回の Ctrl+N で 3 つの付箋が表示される（間隔 1.2 秒以上） → PERF-02 達成
- `npm run perf:check` の median が 300ms 以内 → 連打耐性 PASS
