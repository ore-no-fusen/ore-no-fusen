# MSIX移行リリース計画（5.0.0 → 5.1.0）

## 結論

- **5.0.0**: 移行開始版。NSIS・MSI・Microsoft Store MSIXの3形式を最後に提供する。
- **5.1.0**: 移行完了版。Microsoft Store MSIXだけを正式配布する。
- **5.1.0以降**: 更新はMicrosoft Store、wingetは`msstore`、GitHub Releaseは変更履歴とソース公開に限定する。

この計画でいう「3つ」は、5.0.0のNSIS・MSI・Store MSIXという3つの配布形式を指す。

## なぜこの版番号にするか

5.0.0は配布方式と更新方式が変わるため、メジャーバージョンを上げる理由が明確である。5.1.0は機能上の大型変更ではなく、5.0.0で開始した移行を完了し、旧配布経路を終了する区切りとして扱う。

## Release A: 5.0.0 移行開始版

### 配布物

1. 最終NSIS: GitHub Releaseに配置し、既存Tauri Updaterの対象にする。
2. 最終MSI: GitHub Releaseに配置する。
3. Store MSIX: Partner Centerへ提出し、Microsoft Storeで公開する。未署名MSIXをGitHub Releaseへ置かない。

### アプリ内対応

- NSIS/MSI版にStore移行案内を追加する。
- 「Microsoft Store版を入手」「あとで」「移行手順」の導線を用意する。
- Store版を先に導入し、付箋・画像・設定を確認してから旧版を削除するよう案内する。
- 旧版を自動アンインストールしない。
- Tauri Updaterは5.0.0を既存利用者へ届けるため維持する。

### Web・文書

- Store公開まではLPの旧ダウンロード導線を維持する。
- Store公開確認後、LPの主ボタンをStoreへ変更し、旧版は「既存利用者向け移行版」と明示する。
- 初回のStore一般公開後は商品ページURLを継続利用できるため、5.1.0以降の更新審査中にLPをGitHub版へ戻さない。
- 初回のLP切替はアプリの版を上げず、`Do Non-App Release`でLP関連ファイルだけをmainへ反映する。
- GitHub Release本文、README、ユーザーガイドに移行手順を掲載する。
- 旧community winget利用者へStore版コマンドを案内する。

### 必須テスト

- NSIS 4.4.2以前 → NSIS 5.0.0 → Store 5.0.0
- MSI 4.4.2以前 → MSI 5.0.0 → Store 5.0.0
- community winget版 → Store 5.0.0
- 各経路で付箋、画像、タグ、設定、保存先、ショートカット、Drive設定を照合する。
- Store版確認後に旧版をアンインストールし、データが残ることを確認する。

### 5.0.0公開ゲート

- Phase 20の実機確認が完了している。
- Store Identity、Product ID、Publisherが確定している。
- Store 5.0.0の認定と一般公開が完了している。
- `winget --source msstore`でStore版を導入できる。
- 旧版とStore版の共存時にデータ損失がない。

## 移行期間

期間を日付だけで決めず、次の条件で終了判断する。

- 5.0.0のTauri Updater配信が正常に機能している。
- LP・README・マニュアルがStoreを主経路としている。
- Storeの取得数・インストール数がPartner Centerで確認できる。
- 重大な移行問い合わせやデータ損失報告がない。
- NSIS・MSI・旧winget各経路の移行証跡が揃っている。

## Release B: 5.1.0 移行完了版

### 配布物

- Microsoft Store MSIXのみ。
- GitHub ReleaseにはリリースノートとGitHub自動生成の`Source code (zip)` / `Source code (tar.gz)`だけを基本とする。

### 廃止するもの

- MSI/NSISの生成とGitHub Releaseへの添付
- Tauri Updaterによるダウンロード・インストール
- `latest.json`と`.sig`の新規生成
- `TAURI_SIGNING_PRIVATE_KEY`のCI利用
- community wingetへの更新PRと`WINGET_TOKEN`
- GitHub asset download数を現在利用数として示すバッジ

### 継続するもの

- 過去GitHub Releaseの履歴。ただし旧版・非推奨と明記する。
- GitHub Releaseの変更履歴。
- Microsoft Storeの自動更新。
- `winget --source msstore`による導入と更新。
- Partner Centerでの取得数・インストール数確認。

### 5.1.0公開ゲート

- Store 5.0.0 → 5.1.0の自動更新を実機確認している。
- 旧版移行テストがすべて完了している。
- 5.0.0の移行案内が十分な期間利用可能だったことを確認している。
- LP、README、設計書、マニュアル、FAQ、SEOページに旧正式配布導線が残っていない。
- GitHub ActionsがMSI/NSIS、updater artifact、community winget PRを生成しない。

## ロールバック

5.0.0のStore版で移行障害が見つかった場合、5.1.0へ進まない。Store版を修正し、5.0.xとして再提出する。NSIS/MSIの新機能版を増やさず、5.0.0の移行案内経路は維持する。

5.1.0公開後に問題が見つかった場合は、Storeへ5.1.x修正版を提出する。原則としてMSI/NSIS配布は再開しない。

## 最終状態

| 項目 | 5.0.0 | 5.1.0以降 |
|---|---|---|
| NSIS | 最終移行版 | 新規公開なし |
| MSI | 最終移行版 | 新規公開なし |
| Store MSIX | 正式版・移行先 | 唯一の正式版 |
| Tauri Updater | 移行案内版の配信に使用 | 廃止 |
| winget community | 旧利用者の移行対象 | 更新PRなし |
| winget msstore | 新しい導入経路 | 継続 |
| GitHub Release Assets | 最終旧版を掲載 | ソースアーカイブのみ |
| 利用数確認 | GitHub旧実績＋Partner Center | Partner Center |
