# 計画書：MSIX / MSI 配布対応

作成日: 2026-06-13
最終更新: 2026-06-13（symlink 対応を削除・MSIX 採用を確定）
ブランチ: stage1-msix-data-safety（develop へ PR #4 オープン中）
独立計画ファイル（GSD の ROADMAP.md / STATE.md とは別管理）

---

## 0. 基本方針（確定）

- **ソースコードは1つ**。実行時に「MSIX として動いているか」を判定して挙動を切り替える。
- **MSIX はやる**。MSIX 版＝Microsoft Store のお試し版、MSI/NSIS 版＝本気版。
- MSIX で**必ず作り込むのは2つ＝自動起動・自動更新**。これが成立しないとアプリの良さ（常駐してすぐ書ける）が失われるため。
- **それ以外の MSIX 制約は割り切り**、制約としてユーザーに説明して飲んでもらう。
- データ破壊防止のうち **symlink 対応は不要として削除**（理由は §1）。

---

## 1. symlink 対応を削除した理由（重要な確定事項）

当初 Stage 1 に入れた「symlink の付箋を壊さない」処理は**削除した**。根拠:

- アプリは付箋ファイルを symlink にする処理を**持っていない**（リポジトリ全体を調査済み。生成系のリンク作成は皆無）。
- タグが2つ以上の付箋を整理すると、ソース上は「**移動先タグを1つ選び、そのフォルダへ移動（コピー＋元削除）**」する（`fusen_archive_note` lib.rs / `useStickyNoteContextMenu.ts`）。symlink は作らない。
- 本来は「両方のタグフォルダに置き、片方をリンク」にしたかったが、**Windows ではファイル symlink 作成に管理者権限／開発者モードが必要**（今回 CI でも `error 1314` を確認）。一般ユーザー権限で動く本アプリでは作れないため、当時「片側だけに移動」に割り切った経緯がある。
- よって symlink の付箋は現実に発生せず、修正は出番がない → 削除。
- 将来「付箋を両方のタグフォルダに」を本当にやるなら、Windows で現実的なのは **symlink ではなく ①実体コピー2つ ②ハードリンク**。その時に方式に合わせて設計する（今 symlink 用に作り込まない）。

---

## 2. MSI と MSIX の違い（採否の前提整理）

| 項目 | MSI / NSIS（本気版） | MSIX（お試し版） |
|---|---|---|
| インストール先 | 書込可フォルダ | WindowsApps 配下＝読取専用・更新毎にパス変化 |
| 任意フォルダ読み書き | できる | できる（runFullTrust 同等） |
| symlink を作る | 権限次第（OSの話・差なし） | 権限次第（差なし） |
| 設定(%APPDATA%) | 実体 | 実体（実測: 仮想化されず MSI と共有） |
| 付箋データ(Documents) | 実体 | 実体（仮想化対象外）＝両版で共有可 |
| 自動更新 | Tauri updater | Store 管理（Tauri updater は効かない） |
| 自動起動 | レジストリ Run キー | Run キーは効かない → StartupTask 必須 |
| 配布準備 | インストーラ生成のみ | AppxManifest・署名・Store 審査・runFullTrust |

→ MSIX を入れる意味は「機能増」ではなく「**Store 配布で導入が楽・更新を Store に任せる**」というチャネル利点。その代わり上表の制約を恒久的に受け入れる。

---

## 3. 各 Stage の内容と状態

### Stage 1：配布判定 ＋ データ安全（symlink を除く）― ✅ **ほぼ完了**

MSIX 分岐の土台と、共通の保存先防御。

- 配布形式判定 `src-tauri/src/distribution.rs`（`is_msix_packaged` / `get_distribution_kind`）
  - ※ 自動起動・自動更新の MSIX 分岐の**土台**。これが無いと Stage 2・3 が始まらない
- 危険な保存先の拒否：WindowsApps 配下・exe 配下を MSIX/MSI 共通で拒否
- 起動時診断ログ：配布形式・パス・APPDATA など
- settings には canonicalize せずユーザー選択パスをそのまま保存
- 付随：pre-commit のポート開放バグ修正、テスト CI `test.yml` 新設
- **symlink 対応は削除済み**（§1）。テスト CI からも symlink ステップを除去

### Stage 2：自動更新の振り分け ― 🟡 **ゲートは完了 / 更新検知UIは未着手**

- ✅ **完了・コミット済み（c61c093）**: MSIX 時は起動時の Tauri updater 自動チェックをスキップ。
  - `lib.rs` に `fusen_get_distribution_info` コマンド追加、`useUpdateCheck.ts` で MSIX 時 return。
  - 実 MSIX で `distribution_kind=msix` を確認＝更新チェックが走らないことを保証。
  - desktop/MSI は従来どおり Tauri updater。
- ⬜ **未着手**: 「更新があればボタン」の更新検知UI（StoreContext API、Win32 では HWND 紐付け要・本物の Store 識別子が必要）。

### Stage 3：自動起動の振り分け ― 🟡 **3a 完了 / 3b 未着手**

- ✅ **3a 完了・コミット済み（e7b455e）**: MSIX 時は tauri-plugin-autostart（レジストリ）を使わず、manifest の StartupTask に委譲。
  - 実 MSIX で `MSIX: registry autostart skipped (StartupTask 使用)` を確認。
  - `AppxManifest.xml` に `windows.startupTask` を Enabled=true で宣言済み＝デフォルト常駐起動。
- ⬜ **3b 未着手**: 設定の「ログイン時に起動」トグルで StartupTask を ON/OFF（windows crate で状態取得・有効化）。Windows 設定でオフにされたら再オンできない旨の UI 表示も。
- 注: ログイン時に実際に自動起動するかの最終確認（再起動テスト）は未実施。

### Stage 4：MSIX 資材 ＋ お試し版案内 ＋ docs ― 🟡 **資材は完了 / UI・docs・CI は未着手**

- ✅ **完了・コミット済み（107cf67）**: `packaging/msix/AppxManifest.xml`（ダミー識別子・runFullTrust・StartupTask 宣言）と `build-msix.ps1`（Tauri 成果物を包んで自己署名 MSIX 生成）。実行で署名済み MSIX 生成を実証。
- ⬜ **未着手**: release.yml に MSIX 生成ジョブ追加。設定画面の「MSIX お試し版／MSI 本気版」表示と案内。docs（割り切り事項・symlink 非対応など）。

### （未割当）assets の扱い ― ⬜ **Stage 未定**

画像 asset を実体コピーに統一し、symlink asset を検出したらログ、という方針は合意済みだが、どの Stage でやるかは **未定**。

---

## 4. MSIX の割り切り事項（ユーザーに制約として説明する）

- 設定・付箋とも MSI↔MSIX で**共有される**（AppData 非仮想化を実測。MSIX お試し版は隔離サンドボックスではなく実データを使う点に注意）
- MSI 版と MSIX 版は single-instance により**同時起動できない**（先発が後発を弾く・実測）
- 高度なファイル運用（symlink 等）は MSIX では推奨しない／MSI 版推奨
- 読取専用インストール先のため、保存先を特殊な場所にできない

---

## 5. 現在地（2026-06-14 時点）

- ブランチ `stage1-msix-data-safety`、develop **未マージ**（PR #4 オープン中）。**作業ツリー clean・未コミットなし**。
- コミット済み: Stage 1（データ安全・symlink 削除）／MSIX 資材（manifest + build-msix.ps1）／Stage 2 ゲート（c61c093）／Stage 3a（e7b455e）／計画書・連携ログ。
- 実 MSIX で検証済み: `distribution_kind=msix`・`MSIX: registry autostart skipped`（MSIX 専用分岐が本物のパッケージで効くことを実証）。
- 実測知見: **MSIX は AppData を仮想化せず、設定・付箋を MSI と共有**。MSI 版と MSIX 版は single-instance により同時起動不可（いずれも §4 に反映済み）。
- 次の候補: Stage 3b（自動起動トグル）／Stage 2 更新検知UI／Stage 4（お試し版UI・docs・CI）／自動起動の再起動テスト（ユーザー作業）。

---

## 6. 未確定事項

- 自動更新「更新検知ボタン」の StoreContext + HWND 実装の詳細
- Partner Center の本物の識別情報（Store 提出の最後に差し替え）。AppxManifest はダミー識別子で作成済み。
- assets 対応を実施する Stage
- MSIX 実機検証: インストール・配布判定・registry autostart skip は **確認済み**。**再起動後の自動起動の最終確認は未実施**（ユーザー側作業）。
