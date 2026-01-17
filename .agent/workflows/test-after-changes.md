---
description: コード修正後にテストを実行する
---

# コード修正後のテスト実行ワークフロー

コードを修正したら、以下のテストを実行して動作確認を行う。

## 1. TypeScriptユニットテスト（フロントエンド）
// turbo
```bash
npm test
```

## 2. Rustユニットテスト（バックエンド）
// turbo
```bash
cd src-tauri && cargo test
```

## 3. E2Eテスト（統合テスト）
// turbo
```bash
npm run test:e2e
```

## 注意事項
- Tauriアプリ（npm run tauri dev）が起動中の場合、Rustテストは失敗する可能性がある
- E2Eテストは開発サーバーを自動起動するため、ポート3002が空いている必要がある
