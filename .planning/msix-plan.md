# 計画書：MSIX / MSI 配布対応

作成日: 2026-06-13
最終更新: 2026-06-15（008章追加・symlink/高度運用の記述を両版同等に訂正）
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

### Stage 3：自動起動の振り分け ― ✅ **3a・3b 完了（実機検証は 3b のみ未）**

- ✅ **3a 完了・コミット済み（e7b455e）**: MSIX 時は tauri-plugin-autostart（レジストリ）を使わず、manifest の StartupTask に委譲。
  - 実 MSIX で `MSIX: registry autostart skipped (StartupTask 使用)` を確認。
  - `AppxManifest.xml` に `windows.startupTask` を Enabled=true で宣言済み＝デフォルト常駐起動。
- ✅ **3b 完了**: 設定トグルで StartupTask を ON/OFF。disabled_by_user 時は警告＋Windows 設定導線、i18n(ja/en)対応。実装: `lib.rs`（`fusen_get_startup_state`/`fusen_set_startup_enabled`・`is_msix_packaged` ガード・パニックなし）、`Cargo.toml`（windows feature ApplicationModel/Foundation）、`settings-page.tsx`、`i18n.ts`。**実機テスト（§3b の受け入れ条件1〜5）は未実施**＝最新ビルドで再インストール後にトグル動作・再起動を確認する。
- 注: ログイン時に実際に自動起動するかの最終確認（再起動テスト）は未実施。

#### §3b 詳細計画（✅ 実装済み・以下は策定時の計画とテスト基準）

**目的**: MSIX 版で、設定の「ログイン時に起動」トグルが StartupTask を ON/OFF し、Windows 側で無効化された状態も UI に反映する。MSI/desktop は従来どおり（レジストリ方式）。

**実装方針（最小）**
- Rust: windows crate の `Windows.ApplicationModel.StartupTask`（packaged のみ動作）。Cargo.toml に StartupTask 用 feature 追加。
  - TaskId は manifest と一致: `OreNoFusenStartup`。
  - `StartupTask::GetAsync` → `.State()` で状態取得、`.RequestEnableAsync()` / `.Disable()` で切替（WinRT 非同期は `.get()` でブロック）。
- Tauri コマンド2つ（どちらも `distribution::is_msix_packaged()` でガード。非MSIX では API を呼ばない＝例外回避）:
  - `fusen_get_startup_state() -> String`: "enabled" / "disabled" / "disabled_by_user" / "disabled_by_policy"。非MSIX は "desktop"。
  - `fusen_set_startup_enabled(enabled: bool) -> String`: MSIX 時のみ切替し結果状態を返す。非MSIX は no-op。
- UI（settings）: MSIX 時、トグル操作で `fusen_set_startup_enabled` を呼ぶ。戻りが "disabled_by_user" なら「Windows のスタートアップ設定で無効になっています（アプリからは再有効化できません）」を表示し、Windows 設定へ誘導。

**テスト基準（受け入れ条件）**
- 自動: cargo check 通過・既存テスト不変。非MSIX 経路で StartupTask API を呼ばない（panic/例外なし）。
- 実機（インストール済み MSIX）:
  1. 既定で `fusen_get_startup_state` = "enabled"（manifest Enabled=true）。
  2. トグル OFF → "disabled"（Get-StartApps / Windows 設定 / コマンド戻りで確認）。
  3. トグル ON → "enabled" に戻る。
  4. Windows 設定で手動オフ → "disabled_by_user"、set_enabled(true) で上書き不可、UI にメッセージ。
  5. 再起動して OFF 時は自動起動しない／ON 時は自動起動する（ユーザー操作）。
- desktop/MSI: 既存の自動起動が回帰していない。

**未確定 / 確認点**
- トグル変更は UI から直接コマンドを呼ぶ方式を採用（settings.rs 側では拾わない・最小）。
- windows crate の必要 feature 名はビルドで確定。

### Stage 4：MSIX 資材 ＋ お試し版案内 ＋ docs ― ✅ **全完了（資材・docs・UI・CI）※CI 実行検証はタグ push 時**

- ✅ **資材 完了・コミット済み（107cf67）**: `packaging/msix/AppxManifest.xml`（ダミー識別子・runFullTrust・StartupTask 宣言）と `build-msix.ps1`（Tauri 成果物を包んで自己署名 MSIX 生成）。実行で署名済み MSIX 生成を実証。
- ✅ **docs 完了**: 設計書に新章 `docs-v2/008_DISTRIBUTION.md`「配布設計（MSIX / MSI）」を追加（7セクション）＋ `docs-v2/index.md` に章登録（badge/一覧/読む順序/doc-grid）。VitePress ビルド通過。
- ✅ **UI 完了**: `AboutSection` に版表示（MSIX お試し版 / 通常版）。MSIX 時のみお試し説明＋「通常版（MSI）を入手」（Vercel）。i18n(ja/en)。実装: `settings-page.tsx`・`i18n.ts`。
- ✅ **CI 完了**: release.yml の tauri-action 後に build-msix.ps1 実行＋自己署名 MSIX を Actions アーティファクト化（`msix-selfsigned`）。**実行検証は次のタグ push 時**。Store 提出署名は別フロー。

#### §4-docs 詳細計画（✅ 実装済み・以下は策定時の計画）

**範囲**: 今回は **docs のみ**。UI（版表示・案内）と CI（release.yml の MSIX ジョブ）は対象外（docs 完了後に別計画）。

**何を書くか（内容・すべて実測/確定済みの事実のみ。§4・§5 と矛盾させない）**
ユーザー向けに「MSIX お試し版 と MSI 本気版の違いと注意」を1か所にまとめる:
1. 配布形態: MSIX＝Microsoft Store の**お試し版** / MSI・NSIS＝**本気版**
2. データ共有: 設定・付箋は**両版で共有**（同じ Documents・%APPDATA% を使う。お試し版も実データを使う＝隔離ではない）
3. 同時起動不可: MSI 版と MSIX 版は**同時に動かせない**（片方ずつ・single-instance）
4. 自動起動: MSIX は Windows スタートアップ（StartupTask）。**Windows 設定でオフにするとアプリから戻せない**
5. 自動更新: MSIX は **Store が自動更新** / MSI は**アプリ内更新**（Tauri updater）
6. シンボリックリンク（ファイル）作成は OS 制約（管理者権限/開発者モード必要）で **MSIX・MSI とも一般ユーザー不可**（配布形態の差ではない）。アプリは symlink を作らない
7. 保存先: MSIX では読取専用領域などを保存先にできない（危険パス拒否）

**どこに書くか（決定: 設計書 docs-v2 に新章）**
- 設計書 `docs-v2/` に **新章 `008_DISTRIBUTION.md`「008 配布設計（MSIX / MSI）」** を追加（既存 000〜007 の連番に続ける）。MSIX 機能差分を1章にまとめる。
- 体裁は `007_COMMUNICATION.md` に準拠: frontmatter（title/outline）／`# 008 …`／`<p class="lead-text">`／`<p class="version-info">`／番号セクション／`<p class="table-caption">表 N-M …`（表の**上**）／`<Note>`／末尾に改版履歴 `<div class="history-table">`。
- `docs-v2/index.md` に章登録: `.badge-008` CSS、設計書一覧テーブルの行、読む順序チェーン末尾、doc-grid カード（TOC）。
- 言語: 日本語（既存設計書に合わせる）。

**章構成（案）**
1 目的 ／ 2 配布形態（MSIX お試し版 / MSI 本気版）／ 3 共通の前提（設定・付箋の共有・同時起動不可）／ 4 自動起動（StartupTask / レジストリ）／ 5 自動更新（Store / アプリ内）／ 6 制約と割り切り（symlink は両版とも作成不可・保存先・読取専用）／ 7 改版履歴

**テスト/受け入れ基準（docs はレビュー基準）**
- 記載が実測/確定事実と一致（§4・§5 と矛盾しない）。前述の7項目を網羅。
- docs-v2 整形ルール厳守（CLAUDE.md）: 表キャプは表の**上**・図キャプは図の**下**・表番号 `表 N-M`・改版履歴 `YY-MM-DD`／古い→新しい／`<div class="history-table">`。
- VitePress ビルドが通る・リンク切れ無し・`index.md` 登録と一致。
- 005_GLOSSARY と用語が一致（用語追加が要るなら別途）。

**未確定 / ★着手前に確認**
- 章タイトル「008 配布設計（MSIX / MSI）」でよいか。
- 改版履歴の起点（版数・日付）。

#### §4-ui 詳細計画（✅ 実装済み）

**範囲**: お試し版UI のみ（CI は別途）。

**目的**: ユーザーが今使っている版（MSIX お試し版 / MSI 本気版）を認識でき、MSIX 版では「お試し版」であることと本気版（MSI）への導線を示す。

**どこに**: `components/ui/settings-page.tsx` の `AboutSection`（バージョン表示の近く。既存の website/GitHub ボタンと同じ並び）。

**実装方針（最小）**
- AboutSection で `fusen_get_distribution_info` を呼び版を判定（"msix" / "desktop"）。
- 版表示: バージョン付近に「Microsoft Store 版（お試し版）」/「通常版」を表示。
- MSIX 時のみ: お試し版の短い説明＋「通常版（MSI）を入手」ボタン（既存の `plugin-shell` の `open` でリンクを開く）。
- 文言は i18n（ja/en）。

**テスト/受け入れ基準**
- 自動: tsc / npm run lint 通過・既存テスト不変。
- 手動/実機: MSIX 版で「お試し版」表示＋案内＋入手ボタンが出る。MSI/desktop は「通常版」表示のみ（案内・ボタンは出さない）。i18n ja/en で正しい文言。
- desktop の AboutSection 既存表示が回帰しない。

**決定（ユーザー確定）**
1. 「通常版（MSI）を入手」リンク = `https://ore-no-fusen.vercel.app`
2. 説明文言 = 例文どおり採用。
3. desktop も版ラベル「通常版」を表示（お試し説明・入手ボタンは MSIX のみ）。

#### §4-ci 詳細計画（✅ 実装済み・実行検証はタグ push 時）

**範囲**: `release.yml` に MSIX 生成を追加（A 案＝自己署名アーティファクト。Store 提出署名は別フロー）。
**実装**: `release` ジョブの tauri-action の後に `build-msix.ps1` を実行して MSIX を生成し、`actions/upload-artifact` でアップロード（store-submit と混同しないよう release 資産にはしない）。
**テスト基準**: タグ push で release ジョブが MSIX を生成・アップロード／既存の NSIS・MSI・winget を壊さない／build-msix.ps1 が windows-latest で動作（SDK ツール検出・自己署名）。
**注**: 自己署名 MSIX は配布テスト用。Store 提出は本物の証明書で別途（store-submit.yml）。

### （未割当）assets の扱い ― ⬜ **Stage 未定**

画像 asset を実体コピーに統一し、symlink asset を検出したらログ、という方針は合意済みだが、どの Stage でやるかは **未定**。

---

## 4. MSIX の割り切り事項（ユーザーに制約として説明する）

- 設定・付箋とも MSI↔MSIX で**共有される**（AppData 非仮想化を実測。MSIX お試し版は隔離サンドボックスではなく実データを使う点に注意）
- MSI 版と MSIX 版は single-instance により**同時起動できない**（先発が後発を弾く・実測）
- シンボリックリンク（ファイル）作成は OS 制約で **MSIX・MSI とも一般ユーザーは作れない**（配布形態の差ではない）。アプリは symlink を作らない
- 読取専用インストール先のため、保存先を特殊な場所にできない

---

## 5. 現在地（2026-06-14 時点）

- ブランチ `stage1-msix-data-safety`、develop **未マージ**（PR #4 オープン中）。**作業ツリー clean・未コミットなし**。
- コミット済み: Stage 1（データ安全・symlink 削除）／MSIX 資材（manifest + build-msix.ps1）／Stage 2 ゲート（c61c093）／Stage 3a（e7b455e）／Stage 3b 自動起動トグル／Stage 4 docs（008章）／Stage 4 お試し版UI／**Stage 4 CI（MSIX アーティファクト）**／計画書・連携ログ。
- 実 MSIX で検証済み: `distribution_kind=msix`・`MSIX: registry autostart skipped`（MSIX 専用分岐が本物のパッケージで効くことを実証）。
- 実測知見: **MSIX は AppData を仮想化せず、設定・付箋を MSI と共有**。MSI 版と MSIX 版は single-instance により同時起動不可（いずれも §4 に反映済み）。
- 次の候補: Stage 2 更新検知UI（本物の Store 識別子待ち＝Store 提出準備時）。**MSIX の主要作業（Stage 1〜4）は完了**。
- 実機検証（OreNoFusen.Dev 3.6.5）: Stage 2 更新ゲート（更新通知が出ない）・Stage 4 UI（お試し版表示・入手ボタン）を**確認済み** ✓。紛らわしい古い MSIX（ONFStudios.FUSEN 3.6.1 / FUSEN.Test 3.6.0）はアンインストール済み、残るは OreNoFusen.Dev 3.6.5 のみ。
- 残るユーザー作業: Stage 3b 自動起動トグルの動作 ＋ 再起動でログイン時に自動起動するかの確認。

---

## 6. 未確定事項

- 自動更新「更新検知ボタン」の StoreContext + HWND 実装の詳細
- Partner Center の本物の識別情報（Store 提出の最後に差し替え）。AppxManifest はダミー識別子で作成済み。
- assets 対応を実施する Stage
- MSIX 実機検証: インストール・配布判定・registry autostart skip は **確認済み**。**再起動後の自動起動の最終確認は未実施**（ユーザー側作業）。

---

## 7. 進行ルール（このMSIX作業に適用）

### Claude ↔ Codex 連携
- 実装は Codex にやらせ、Claude はレビューに専念する（トークン節約）
- Codex に実装させたら、毎回この4点を連携ログ（`.planning/msix-codex-log.md`）に必ず記録する。例外なし:
  1. Codex に出した指示
  2. Codex が変更したファイルと差分の要点
  3. レビュー結果（合格/不合格と理由）
  4. コミットハッシュと、そのコミットに「コード＋計画書」が両方入っているか

### 計画書の扱い
- 計画書はユーザーと Claude をつなぐ唯一の対話の場。現実とズレたまま放置しない
- コードを変えたら、計画書も必ず同じコミットで現実に合わせる（置き去り厳禁）
- コミットは専用ブランチなので自由。ただし計画書を必ず同伴させる

---

## 8. リリース〜ストア提出の手順（会話が消えても、これを読めば進められる）

### いまの到達点（2026-06-15）
- MSIX のコード（Stage 1〜4）は完成。実機で Stage 2/4 検証 OK（最新版 = 無印「俺の付箋」OreNoFusen.Dev 3.6.5）。
- 残るユーザー作業: **再起動テスト**（ログイン時に自動で「俺の付箋」がトレイに出るか）。これが OK なら検証完了。

### この後の順番（なぜこの順かは §後述）
1. **再起動テスト**（ユーザー）→ OK なら次へ
2. **develop へマージ**（PR #4）
3. **develop → main（Do Release）→ タグ → Release ワークフロー**で MSI/NSIS + MSIX アーティファクト生成
4. **ストア提出**（下記）。← develop/main で「出すコードが確定」してから行う手続き。先にやると二度手間

### ストア提出の仕組み（調査済み・推測でなく `store-submit.yml` を読んで確認）
- **署名は自分でやらない**。`msstore publish` で Partner Center に**パッケージを送るだけ**。Microsoft 側が処理する（だから「Publisher と証明書 Subject の一致」を自分で署名する形では扱わない）。
- 動かすのは GitHub Actions の **`store-submit.yml`**（workflow_dispatch で手動実行）。
- **安全装置あり**: `submit_to_store=false` で **dry run（送信しない確認）**ができる。本番送信は `safety_ack=FIRST_STORE_SUBMISSION_PASSED` を入れないと拒否される。
- 本物の識別子（AppxManifest に入れる／既に判明済み）:
  - Name = `ONFStudios.FUSEN` / Publisher = `CN=4820A467-BFE8-46A3-A142-42A0E840F3A5` / PublisherDisplayName = `ONF Studios`
  - Store ID（product_id）= `9N4MW0V2MVVG` / PFN = `ONFStudios.FUSEN_bjrn10gahtsj2`
  - ※ 開発版 AppxManifest はダミー（`OreNoFusen.Dev` / `CN=OreNoFusenDev`）。本物提出時に上記へ差し替える。

### 【最優先・難所】ストア提出の認証情報がまだ未登録（2026-06-15 確認済み）
方針: **自動化（store-submit.yml）で出す**と決定。仕組み（yml）は作成済み。だが動かす鍵が無い。難所なので**先に潰す**。

- 1回目のストア提出は **Partner Center 画面から手動**でやった（だから GitHub には鍵を入れていない）。2回目以降は自動化に移行する。
- `gh secret list` / 環境 / org を全確認 → **以下5つは1つも登録されていない**:
  - `AZURE_AD_TENANT_ID`（secret）
  - `SELLER_ID`（secret）
  - `AZURE_AD_APPLICATION_CLIENT_ID`（secret）
  - `AZURE_AD_APPLICATION_SECRET`（secret）
  - `MICROSOFT_STORE_PRODUCT_ID`（variable・値は 9N4MW0V2MVVG で判明済み）
- **登録するまで store-submit.yml は動かない**。これが今日のリリースの最大の難所。

#### 5つの値の在処（Microsoft 公式ドキュメントで確認済み・2026-06-15）
| 値 | どこで取るか |
|---|---|
| `SELLER_ID` | Partner Center「**概要**」ページの **Partner Center ID**（短い数字）がこれ |
| `AZURE_AD_TENANT_ID` | 「**ユーザー管理**」→ 追加した Azure AD アプリの設定画面に表示。または entra.microsoft.com の Azure AD 概要 |
| `AZURE_AD_APPLICATION_CLIENT_ID` | 「**ユーザー管理**」→ Azure AD アプリの設定画面に表示 |
| `AZURE_AD_APPLICATION_SECRET` | 「**ユーザー管理**」→ Azure AD アプリの「**Key（キー）を新規発行**」した値（= Client secret） |
| `MICROSOFT_STORE_PRODUCT_ID` | `9N4MW0V2MVVG`（判明済み） |

※ 難所の4つは全部「**ユーザー管理**」に集約されている。手順:
1. Partner Center →「ユーザー管理」→「**Azure AD アプリケーションの追加**」（無ければ新規作成）
2. 追加したアプリ名をクリック → **Tenant ID / Client ID をコピー**
3. 「**Key（キー）**」を新規発行 → それが **Client Secret**（発行直後しか全文表示されないので即コピー）
※ 注意: Identifiers ページの「Windows パブリッシャー ID（CN=4820A467-…）」は **Seller ID ではない**（Publisher）。混同しない。

#### 取得後、GitHub に登録（リポジトリ ore-no-fusen）
- `gh secret set AZURE_AD_TENANT_ID` /`SELLER_ID` /`AZURE_AD_APPLICATION_CLIENT_ID` /`AZURE_AD_APPLICATION_SECRET` の4つ
- `gh variable set MICROSOFT_STORE_PRODUCT_ID --body 9N4MW0V2MVVG`
- 登録後 `gh secret list` で5つ揃ったか確認
- **dry run**（store-submit.yml を submit_to_store=false）で疎通 → OK なら本番（safety_ack=FIRST_STORE_SUBMISSION_PASSED）

参考: Microsoft Learn「Publish app updates to Microsoft Store with GitHub Actions」/「CI/CD Environments」。
