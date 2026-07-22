# Phase 21 Research: 現状と変更点

## 現状

- `src-tauri/tauri.conf.json` は NSIS と MSI を生成する。
- `packaging/msix/build-msix.ps1` は release exe と resources から未署名 MSIX を生成する。
- `.github/workflows/release.yml` は MSI/NSIS を GitHub Release へ公開し、MSIX は Actions artifact に置く。
- `.github/workflows/store-submit.yml` は GitHub Release から MSIX を取得しようとしており、現行 release workflow の artifact 置き場と一致しない。
- winget community package `ONFStudios.OreNoFusen` は GitHub Release のインストーラーを参照する。
- `scripts/generate-latest-json.mjs` と `app/hooks/useUpdateCheck.ts` は Tauri updater 前提を含む。
- `src-tauri/src/distribution.rs` と `src-tauri/src/lib.rs` は Package Identity と StartupTask を扱える。
- 設定画面と `lib/i18n.ts` は Store版を「お試し版」、MSI版を「通常版」と表示する。
- `docs-v2/008_DISTRIBUTION.md`、ユーザーガイド、リリース手順、README、ランディングページも二版構成を前提とする。

## 修正対象

1. ビルド: Tauri の MSI/NSIS bundle を止め、exe/resources を作って MSIX を組み立てる単一経路へ変更する。
2. CI/CD: MSIX build artifact を Store 提出ジョブへ直接渡し、バージョン・identity・成果物名を検証する。
3. 更新: Store版で Tauri updater を使わない現行分岐を単一仕様へ整理し、不要な updater 生成物を廃止する。
4. 自動起動: MSIX StartupTask を正式仕様とし、`DisabledByUser` 時は Windows の「スタートアップ アプリ」を開く案内を維持する。
5. UI: お試し版/通常版/MSI入手リンクを削除し、Microsoft Store版として統一する。
6. winget: community package から Store Product ID を使う `msstore` 経路への移行手順を定める。
7. 文書: 配布設計、ユーザーガイド、トラブルシューティング、README、LP、リリース手順を同期する。

### LP・公開Webの確認結果

- `app/landing/page.tsx` は GitHub Release の `setup.exe` 直リンクをヒーロー部と最終CTAの2か所に持つ。
- 同ページは Microsoft Store、GitHubダウンロード、旧community wingetの3経路を併記している。
- wingetコピー処理、説明文、アクセス計測イベント名も旧配布方式を前提とする。
- `app/landing/layout.tsx` のSEOキーワードにwingetがあり、Store正式版の説明との整合確認が必要。
- `app/use-cases/windows-sticky-notes/page.tsx` は構造化データの`installUrl`、本文、コマンドでGitHub Releaseと旧wingetを案内する。
- `app/sitemap.ts`、`app/robots.ts` はURL変更がない限り原則変更不要だが、公開前にクロール対象を確認する。
- `.github/workflows/do-non-app-release.yml` はLPだけを先行公開できるため、Store公開前にLPが切り替わらないよう公開順序を制御する必要がある。
- `docs/011_VERCEL_SETUP.md` はLPを「インストーラーダウンロード」と説明しており、Store導線へ修正が必要。
- READMEの`downloads total` / `downloads latest`バッジは`workers/badges/src/index.js`がGitHub Release APIのasset `download_count`を合算している。MSIX一本化後は新規インストールを計測できない。
- StoreではPartner CenterのAcquisitionsレポートで「取得」と「インストール」を確認する。GitHub asset downloadとは定義が異なるため、旧累計との単純合算や同じ`downloads`表記は不正確になる。
- Store Analytics APIで自動取得する場合はMicrosoft Entra認証が必要であり、公開Workerへ認証情報を置く運用・API可用性・集計遅延を別途管理する必要がある。

## 主な懸念

- MSI/NSIS は MSIX へ自動的には置き換わらず、旧版とStore版が一時的に共存し得る。
- community winget ID と Store Product ID は別物であり、既存 winget 利用者の自動移行は保証できない。
- Store を唯一の更新経路にすると、軽微な修正版も Store 審査・段階配信・ロールバック方針が必要になる。
- 未署名 MSIX は一般ユーザー向け検証に使えない。開発証明書版と Store署名版を分けて検証する必要がある。
- `runFullTrust` capability は Store 認定時の説明が必要になる可能性がある。
- StartupTask が `DisabledByUser` になると、アプリ内スイッチだけでは再有効化できない。
- WindowsApps 配下は保存先にできない。通常の Documents/AppData の挙動を継続検証する。
- アンインストール、再インストール、旧版同居時の単一起動とファイル関連付けを確認する必要がある。

## 推奨移行順序

1. Store identity と Product ID を確定する。
2. MSIX-only CI を作るが、公開停止はまだ行わない。
3. 開発署名MSIXで新規導入・更新・自動起動・保存を確認する。
4. 旧 MSI/NSIS からのデータ移行と同居時挙動を確認する。
5. Partner Center の flight/private audience で Store署名版を確認する。
6. winget と文書を Store版へ切り替える。
7. 必要なら最終ブリッジ版で旧ユーザーへ案内し、その後 MSI/NSIS 公開を停止する。

LPはStore商品ページが公開され、実際にインストールできることを確認した後に切り替える。審査中にGitHubダウンロード導線を消さない。

公開バッジは最小運用を優先し、GitHub downloadバッジをStore切替時に削除する。旧実績を残す場合は本文に「GitHub配布時代の累計」と注記し固定値で記録する。Store取得数の公開自動バッジ化は初回公開後の任意課題とする。
