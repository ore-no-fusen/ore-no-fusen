# Claude 作業ルール

## 1. 修正前に説明する
コード変更前に必ず説明する。
1. 不具合の場所
2. 根本原因
3. 影響範囲
4. 最小の修正方法
ユーザーの確認後に修正する。
---
## 2. 最小修正
- 不要なリファクタリング禁止
- 問題を解決する最小変更のみ
- 無関係なコードは変更しない
---
## 3. 出力ルール
- 長い説明は禁止
- 結論 → 根拠 → 修正
- 必要なコードのみ提示
- 調査ログは出力しない
- 不要な思考ログを出さない
---
## 4. 調査ルール
- 必要なファイルのみ読む
- 不要なフォルダは探索しない
- 大量ファイル読み込み禁止
主に読む場所
app/components  
app/hooks  
app/utils  
src-tauri/src  
---
## 5. プロジェクト構造
Frontend  
React components in `app/`
Backend  
Rust commands in `src-tauri/src/`
Communication  
Tauri `invoke()` between frontend and Rust backend
---
## 6. 状態管理
唯一の状態
Rust `AppState`
フロントエンドで状態を持たない。
状態変更は必ず Rust backend 経由。
---
## 7. マルチウィンドウ
このアプリは **Tauri multi-window app**
各付箋は独立 window。
状態同期方法
- Rust backend
- Tauri event