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
| 設定(%APPDATA%) | 実体 | 仮想化され LocalCache に化ける |
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

### Stage 2：自動更新の振り分け ― ⬜ **未着手（MSIX の必須項目①）**

- desktop：従来通り Tauri updater
- MSIX：Tauri updater を止め、**更新があればボタンを出す**
  - 起動時の自動 updater チェック（`app/hooks/useUpdateCheck.ts`）を MSIX 時は無効化
  - 更新確認を Rust コマンドに一本化し配布形式で分岐
  - 「更新検知ボタン」は StoreContext API で更新有無を取得する実装（Win32 では HWND 紐付けが要る）
  - ※ 簡易版（常に「Storeで更新」ボタン）と本命版（更新検知）の選択 → **本命版を採用**

### Stage 3：自動起動の振り分け ― ⬜ **未着手（MSIX の必須項目②・前提待ち）**

- desktop：従来の tauri-plugin-autostart（レジストリ）
- MSIX：manifest の `windows.startupTask` で**デフォルト常駐起動**（管理者権限不要）
  - Rust：MSIX 時は autostart プラグインを使わず StartupTask（windows crate）で状態取得・有効化
  - 制約：ユーザーが Windows 設定で自分でオフにすると**アプリから再オンにできない** → UI に表示
- **前提：現行 AppxManifest.xml（または Packaging Tool プロジェクト）の提供が必要**（StartupTask は manifest 宣言が要る）

### Stage 4：MSIX 資材 ＋ お試し版案内 ＋ docs ― ⬜ **未着手**

- `packaging/msix/` に AppxManifest.xml と生成スクリプト
- release.yml に MSIX 生成ジョブ追加（store-submit.yml は現方式のまま）
- 設定画面に「MSIX お試し版／MSI 本気版」の表示と案内
- docs：割り切り事項を**制約として明記**
  - 「付箋データ（Documents）は MSIX↔MSI で共有／設定（%APPDATA%）は引き継がれない」
  - 「symlink での多タグ配置は非対応」「片側のタグフォルダへ移動する仕様」

### （未割当）assets の扱い ― ⬜ **Stage 未定**

画像 asset を実体コピーに統一し、symlink asset を検出したらログ、という方針は合意済みだが、どの Stage でやるかは **未定**。

---

## 4. MSIX の割り切り事項（ユーザーに制約として説明する）

- 設定は MSIX↔MSI で引き継がれない（付箋データは引き継がれる）
- 高度なファイル運用（symlink 等）は MSIX では推奨しない／MSI 版推奨
- 読取専用インストール先のため、保存先を特殊な場所にできない

---

## 5. 現在地（2026-06-13 時点）

- **Stage 1（symlink 削除版）が完成**。`cargo test` 97 passed。
- ブランチ `stage1-msix-data-safety`、develop へ **PR #4** オープン中。CI（test.yml）は緑運用。
- **symlink 削除の修正はまだ未コミット**（write_note を元の atomic write に戻す／symlink テスト削除／test.yml の symlink ステップ削除）。
- 次の一手：symlink 削除をコミット → PR #4 を develop にマージ → Stage 2（自動更新）/ Stage 3（自動起動）へ。

---

## 6. 未確定事項

- 自動更新「更新検知ボタン」の StoreContext + HWND 実装の詳細
- AppxManifest / Partner Center の識別情報（提供待ち＝Stage 3 の前提）
- assets 対応を実施する Stage
- MSIX 実機検証（インストール／再起動後の自動起動／更新ボタン／両版同時起動）は **ユーザー側作業**で未実施
