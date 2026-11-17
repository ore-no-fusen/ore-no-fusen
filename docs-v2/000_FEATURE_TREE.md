---
pageClass: feature-traceability-page
---

# 俺の付箋 機能ツリー（マスターツリー）

## 位置づけと更新ルール

> **この文書はマスター（正本）である。** 「俺の付箋」の全機能を、コンセプト→要求→実現案→実画面→モジュール→テストの1本のツリーに整理したもの。設計書（docs-v2）・テスト・LP・プログラムは、すべてこのツリーを元にする。

### 更新ルール

1. **機能の追加・変更・削除を行う PR では、同じ PR でこのファイルも更新する。** ツリーと実装・仕様・テストが食い違ったままマージしない。レビューでは「ツリーが更新されているか」を確認項目とする。
2. **新しい実現案は、まずツリーに置いてから実装する。** 置く場所は「どのコンセプトの、どの要求を満たすか」で決める。要求の有効順（中核に近い順）に従って並べる。
3. **3コンセプト（すぐ書ける／強調できる／そこにある）に繋がらない機能は追加しない。** これが機能追加の判断基準である。3つのどれにも属さないものは、3つすべてを下から支える「基盤」、または日常利用の一巡先にある「発展」の補助ブランチに置けるかを検討し、どちらにも置けないものは追加しない（無駄な機能を増やさない）。
4. **根拠なき項目を書かない。** 各実現案には仕様書・要求ID・コードの根拠を併記する。実在しない機能、ファイル名からの連想だけの項目は入れない（付録B参照）。確定できないものは「要確認」として付録Aに分離する。
5. テスト対応（第2〜4部）の評価が変わったら（テスト追加・CI 化など）、同じ PR で評価も更新する。

### 2026-11-15：要求からテストを選ぶ運用

この3コンセプトをすべての要求・テスト整理の起点とする。第4部の既存ソース対応を正本として使い、新たな製品分類は作らない。基盤・発展もどの要求を支えるかを併記する。機能の変更時は、その要求・画面・モジュール・正常/失敗/境界の合格条件から対象テストを選び、共有するテストは重複実行しない。

通常修正は関係する対象テスト、採用分をまとめたリリース候補は全体テストを1回。同じ合格候補をmain/Storeへ移すだけでは全体をやり直さない。分担と移行条件は開発リポジトリの `docs/TEST_SELECTION_POLICY.md` と `docs/010_RELEASE.md`を参照。現在のCIは必要時の手動実行。修正は対象確認、候補は全体1回という現行手順を使う。

第4部の充足度や監査時の件数は、その時点の評価。最新ケースを読んで要求との対応・重複・不足を更新するまでは全量整理済みとしない。対応不明の機能/テストは要確認として保持する。今回の変更は運用整理であり、テストの削除や全量再監査の完了ではない。

### この文書の来歴

- 2026-11-08：全量確認（docs-v2 全仕様書＋ユーザーガイド、src-tauri/src 全モジュールと Tauri コマンド一覧、app/ 主要コンポーネント）に基づき初版を作成。対象バージョン v6.1.0。
- 2026-11-09：テスト充足度監査の結果（実現案→モジュール→テスト対応表）を第2部として統合し、本ファイルを正本の永続ドキュメントとしてリポジトリ（docs-v2）に収めた。

## 凡例（根拠の読み方）

- 各「実現案」ノードの末尾に根拠を併記する。
  - 〔仕様：002_PC §6.2〕= docs-v2 の仕様書と章番号
  - 〔要求：REQ_LF_01〕= 000_REQUIREMENTS.md の要求ID
  - 〔コード：lib.rs / clipboard.rs〕= Rust モジュール（Tauri コマンド名が分かる場合は併記）
  - 〔コード：StickyNote.tsx〕= フロントエンドのコンポーネント
  - 〔ガイド：basic〕= docs-v2/user-guide の利用者向け説明
- **「要確認」** と付けたノードは、コマンドや部品の存在は確認できたが、利用者向けの現れ方まで確定できなかったもの。断定せず別掲の要確認一覧にも載せる。
- 実在しない機能は書かない。過去に誤って挙げた「URLカード表示（link-preview）」のような、ファイル名からの連想だけの項目は入れていない（付録B参照）。

## テストの対応を見る場所

**[要求 → 機能 → ソースとテストの一覧](./TEST_TRACEABILITY_LIST.md)**：番号・テストファイル・日本語概要・不足を同じ表で確認する。

|段階|確認すること|このファイルの参照先|
|---|---|---|
|要求|利用者の目的を満たすか|[第2部・受入/E2E](#requirement-tests)|
|機能|操作から結果までつながるか|[第3部・機能テスト](#function-tests)|
|ソース|個々の処理が正しいか|[第4部・既存のソース試験](#source-tests)|
|環境・実機|どこまで本物か、最後に何を確認するか|[環境と実機確認](#test-environments)|

同じケースを複数段階から参照してよい。要求用/機能用という理由で別テストを作らず、実行も重複させない。以下は対応と不足の整理であり、今回のテスト実行結果ではない。

## ツリーの階層

| 階層 | 軸 | 内容 |
|---|---|---|
| 1 | 製品 | 俺の付箋 |
| 2 | コンセプト軸 | すぐ書ける／強調できる／そこにある |
| 3 | 要求軸 | ユーザーがどうありたいか（「〜したい／〜してほしい」） |
| 4 | 実現案軸 | その要求を満たす具体機能・仕組み |
| 5 | 実画面軸 | どの画面・UIで現れるか |
| 6 | 実装・テスト軸 | 実装モジュールとテストの対応・充足度（第2〜4部） |

- 要求は各コンセプトの中で、要求の強い順に並べ、番号も表示順と一致させる。音声送信はコンセプト1の末尾（1-6）で、未完成。
- 3コンセプトに収まらないものは無理に押し込まず、**基盤**（保存・バックアップ・設定などの土台）と **発展**（結晶化・会員・ホットラインなど）の補助ブランチに置いた。各ブランチの冒頭にその旨を注記する。


---

# 第1部　機能ツリー（コンセプト→要求→実現案→実画面）

# 俺の付箋

## コンセプト1：すぐ書ける


### 要求1-1　思いついた瞬間に、書ける状態になっていてほしい

要求テスト → [合格条件・担当ケース・不足](#req-1-1)

- **プールウィンドウ方式**：初期化済みの非表示ウィンドウを1枚待機させ、作成要求で即座に昇格・表示する。昇格後は次のプールを補充し、要求は最大4件のFIFO待ち行列で捌く〔仕様：002_PC §6.1〕
  - 実画面：新規付箋ウィンドウ（開いた直後から入力可能、カーソルは1文字目）〔要求：SPEC-LF-03-02〕
- **グローバルホットキー Ctrl+N**（既定）で新規付箋〔仕様：002_PC §10.1／要求：SPEC-NF-01-01〕
  - 実画面：どのアプリの上からでも新規付箋ウィンドウ
- **Ctrl 2回押し／Shift 2回押しトリガー**：キーを占有しない新規作成方式（他アプリの Ctrl+N を潰さない）〔仕様：002_PC §10.2・§10.4〕
  - 実画面：設定画面「ホットキー」タブで方式を3択から選択
- **システムトレイ常駐＋トレイメニュー「新規メモ」**：トレイからはマウスのある画面の中央に表示〔要求：REQ_LF_01／仕様：002_PC §6.1〕
  - 実画面：システムトレイメニュー
- **付箋上の「＋」ボタン／右クリック「新規メモ」**：付箋上では右隣に新しい付箋が出る〔仕様：002_PC §6.2・§6.3／ガイド：basic〕
  - 実画面：付箋ウィンドウのツールバー／右クリックメニュー
- **自動起動**：PC起動時にアプリを常駐させる〔コード：lib.rs `fusen_set_startup_enabled`／仕様：008_DISTRIBUTION §6〕
  - 実画面：設定画面「一般」タブ
  - 起動中のロゴ・進み具合の表示を一般⑧でオン/オフ。次回起動から反映、エラー/要設定は表示〔仕様：002_PC 図2-4直下〕
### 要求1-2　画面上のもの・手元のものを、そのまま付箋にしたい

要求テスト → [合格条件・担当ケース・不足](#req-1-2)

- **画面キャプチャ**：ツールバーのカメラボタンで OS の Snipping Tool を起動し、撮った画像を `assets/` に保存して本文へ挿入〔要求：SPEC-ED-02-01／仕様：002_PC §6.2／コード：capture.rs `fusen_capture_screen`〕
  - 実画面：付箋の編集モード（カメラボタン）
- **クリップボード画像の貼り付け**：クリップボード内の画像を `assets/` へ自動保存し、Markdownリンクとして挿入〔要求：SPEC-ED-02-02／コード：clipboard.rs `fusen_get_image_from_clipboard`〕
  - 実画面：付箋エディタ
- **エディタへの画像ドロップ貼り付け**：ドロップした画像データを保存して本文へ取り込む〔コード：clipboard.rs `fusen_save_dropped_image_data`〕
  - 実画面：付箋エディタ
### 要求1-3　書いたら、保存を考えたくない（保存忘れで消えるのが怖い）

要求テスト → [合格条件・担当ケース・不足](#req-1-3)

- **変更の自動保存**：テキスト変更後に自動でファイルへ書き込み、フォーカスが外れた時点でも即保存する〔要求：§3.4 SPEC-DT-04-01/02〕
  - 実画面：付箋ウィンドウ（保存ボタンなしで残る）
- **明示保存 Ctrl+S**：基本は自動保存のため、安心感のために用意された明示保存〔要求：SPEC-NF-01-03〕
  - 実画面：付箋ウィンドウ
### 要求1-4　ファイル名を考えたくない

要求テスト → [合格条件・担当ケース・不足](#req-1-4)

- **ファイル名の自動生成**：作成日時から `NNNN_YYYY-MM-DD_Context.md` 形式で自動生成し、入力を求めない〔要求：SPEC-LF-03-03〕
  - 実画面：付箋ファイル（Vault 内）
- **ファイル名の本文連動**：本文1行目をファイル名のコンテキスト部分に使い、1行目が変わると0.8秒のデバウンス後に自動リネーム。使用できない文字は自動置換〔要求：§3.3〕
  - 実画面：付箋ファイル（Vault 内）
### 要求1-5　保存場所は自分で決めたい

要求テスト → [合格条件・担当ケース・不足](#req-1-5)

- **初回セットアップで保存先（Vault）を選択**：初回起動時にフォルダ選択ダイアログを出し、選んだ場所をベースフォルダとして保存する〔要求：§2.2 REQ_LF_02〕
  - 実画面：初回セットアップ画面

### 要求1-6　手が離せないときは、声で送りたい

要求テスト → [合格条件・担当ケース・不足](#req-1-6)

- **Siri から PC に付箋を送る**（未完成・実験的：Siri→PC表示の通し確認は未了）：iOSショートカットが Vercel API 経由で Drive の中継ファイルを更新し、PC が30秒ポーリングで受け取って付箋として表示する（約30秒以内）〔仕様：200_SIRI_SETUP／コード：app/api/siri-send〕
  - 実画面：PC の付箋ウィンドウ（iPhone 側の PWA 一覧には残らない）
---

## コンセプト2：強調できる


### 要求2-1　大事な一文を、ひと目で目立たせたい

要求テスト → [合格条件・担当ケース・不足](#req-2-1)

- **太字の朱表示**：`**太字**` は赤色・太字で表示する（重要事項の強調）〔要求：SPEC-ED-01-01〕
  - 実画面：付箋の表示モード
- **フローティングフォーマットバー**：テキスト選択時に選択範囲の真上へ B／H1／箇条書き／チェックボックスの4ボタンが浮き上がる〔仕様：002_PC §6.2〕
  - 実画面：付箋の編集モード（選択時）
- **編集用ホットキー**：太字 Ctrl+B／見出し Ctrl+H／箇条書き Ctrl+L／チェックボックス Ctrl+Shift+C（各キーとも変更・無効化が可能）〔仕様：002_PC §10.1〕
  - 実画面：付箋の編集モード／設定画面「ホットキー」タブ
- **PWAの強調表示**：実際の一覧と編集本文で赤い太字を表示し、保存後も強調記号を保持〔仕様：003_IPHONE §1／コード：NoteListStep.tsx・editor-helpers.ts・inline-bold.ts〕

### 要求2-2　画像に、そのまま書き込みたい

要求テスト → [合格条件・担当ケース・不足](#req-2-2)

- **画像への描き込み**：ペン・蛍光ペン・矢印・四角・吹き出しの道具、色・太さ・濃さの調整、元に戻す／やり直す（保存までは道具をまたいで履歴保持）〔仕様：002_PC §6.2／ガイド：advanced／コード：ImageAnnotationModal.tsx〕
  - 実画面：画像描き込み画面（表示モードの画像左上「✏️ 描き込む」から開く）
- **トリミング**：画像上で残す矩形範囲をドラッグ選択し、保存時に元画像と描き込みを合成してから切り取る。失敗・キャンセルでは元画像を変更しない〔仕様：002_PC §6.2／コード：clipboard.rs `fusen_save_annotated_image`〕
  - 実画面：画像描き込み画面のトリミング
- **画像の表示サイズ変更**：エディタ上の画像をドラッグで表示倍率変更〔要求：SPEC-ED-02-03／コード：ResizableImage.tsx〕
  - 実画面：付箋エディタ内の画像
### 要求2-3　畳んでも、項目（見出し）は見えていてほしい

要求テスト → [合格条件・担当ケース・不足](#req-2-3)

- **付箋全体の折りたたみ（△／▽）**：タイトルバーの高さへ縮小し、本文の先頭（画像の場合は `[画像]` と続く文字列）を1行表示する。折りたたみ状態は frontmatter に保存され、再起動後も維持される。編集中でも畳める（6.1.0）〔仕様：002_PC §6.2／ガイド：basic〕
  - 実画面：付箋ウィンドウ右上の △／▽
- **本文の一部分の折りたたみ**：見出し単位、または Tab で字下げした親子行単位で配下を隠す。表示中と編集中で開閉状態を共有する（6.1.0以降）〔ガイド：advanced〕
  - 実画面：付箋本文の見出し・親行の左にある ⌄／›
### 要求2-4　構造を整理して見せたい

要求テスト → [合格条件・担当ケース・不足](#req-2-4)

- **見出し**：`#`〜`######` を表示モードで記号を隠し、階層に応じたサイズ・太字で表示〔要求：SPEC-ED-01-02〕
  - 実画面：付箋の表示モード
- **チェックリスト**：`[ ]`／`[x]` をクリック可能なチェックボックスとして表示〔要求：SPEC-ED-01-03〕
  - 実画面：付箋の表示モード（Web共有先のブラウザでも切り替え可能〔仕様：013_WEB_SHARE §4.4〕）
- **テーブル**：フォーマットバー／ツールバーから表を入れ、選択テキストを Markdown テーブルへ一発変換もできる〔仕様：002_PC §6.2／ガイド：basic・advanced〕
  - 実画面：付箋の編集モード
- **Mermaid 図**：フローチャート等のひな形挿入ボタンと図の表示〔仕様：002_PC §6.2／ガイド：advanced〕
  - 実画面：付箋の編集モード（🔷ボタン）／表示モード
- **日付・時刻の挿入**：編集モードの右クリックから今日の日付（曜日付き）・現在時刻・日付＋時刻を挿入。メニュー名自体に挿入後の実際の文字列を表示する〔仕様：002_PC §6.4〕
  - 実画面：付箋の編集モードの右クリックメニュー
### 要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）

要求テスト → [合格条件・担当ケース・不足](#req-2-5)

- **最前面に固定（ピン留め）**：画びょうボタンで他のアプリより手前に表示し、赤い画びょうが固定中の目印になる。固定の ON/OFF でピンの形と効果音が変わる〔ガイド：basic／仕様：002_PC §6.2〕
  - 実画面：付箋ウィンドウ右上の画びょうボタン
- **色分け（背景色5色）**：黄・ピンク・青・白・グレーから選ぶ〔コード：app/utils/noteAppearance.ts `NOTE_COLORS`／仕様：002_PC §6.3〕
  - 実画面：付箋の右クリックメニュー「色変更」
- **透明度3段階**：不透明／うすめ／かなり透ける。値は frontmatter に保存され即座に反映される〔仕様：002_PC §6.3／コード：lib.rs `fusen_set_opacity`〕
  - 実画面：付箋の右クリックメニュー「透明度」
- **文字サイズ**：付箋ごとに 小12／中16／大20／特大28 の4段階＋グローバル設定へ戻す〔仕様：002_PC §6.3／コード：noteAppearance.ts `NOTE_FONT_SIZES`〕
  - 実画面：付箋の右クリックメニュー「文字サイズ」
### 要求2-6　時刻になったら知らせてほしい

要求テスト → [合格条件・担当ケース・不足](#req-2-6)

- **アラーム**：付箋ごとに日時を設定（「5分後」〜「1週間後」のクイックボタン＋日時直接指定）。時刻になると付箋が点滅し効果音が鳴って一時的に最前面へ表示され〔仕様：002_PC §6.3／コード：AlarmDialog.tsx〕、OS のデスクトップ通知からも該当付箋を前面表示できる〔要求：§2.5 REQ_LF_05〕。発火は1回のみ（繰り返しなし）
  - 実画面：付箋フッターのアラームボタン／アラーム設定ダイアログ

---

## コンセプト3：そこにある


### 要求3-1　PCを開いたら、いつもの場所にいてほしい

要求テスト → [合格条件・担当ケース・不足](#req-3-1)

- **起動時の状態復元**：起動時に Vault をスキャンし、位置・サイズ・色・タグ・最前面・折りたたみ状態を frontmatter から復元する。復元はキューで順次処理し、二重起動は防止する〔要求：REQ_LF_01・REQ_DT_02／仕様：002_PC §7.1.3〕
  - 実画面：デスクトップ上の付箋ウィンドウ群
- **マルチモニター救済**：環境変化時に全付箋の座標を評価し、すべてのモニターの領域外にある付箋をメインモニターの安全な領域へ自動再配置する〔要求：§8.3 SPEC-NF-02-01/02〕
  - 実画面：デスクトップ上の付箋ウィンドウ
### 要求3-2　家の外でも見たい・続きをしたい

要求テスト → [合格条件・担当ケース・不足](#req-3-2)

- **iPhone に送る（PC → iPhone）**：付箋の内容を自分の Google Drive 経由で送り、Web Push で iPhone のロック画面へ通知する。受信したメモは端末内に保存され、PWA でオフラインでも読める。登録済みの複数端末へ同報送信する〔要求：§9.1 REQ_IP_01／仕様：003_IPHONE §4.1・§6.1／コード：lib.rs `fusen_send_to_iphone`・webpush.rs・gdrive.rs〕
  - 実画面：付箋の右クリック「iPhoneに送る」／iPhone PWA のメモ一覧画面
- **通知常駐（ロックだぜ）**：重要なメモは 🔔 を ON にすると、タップして確認した後も通知が再表示され、意図的に消すまでロック画面に残り続ける〔要求：§9.3・§9.4／仕様：003_IPHONE §6.2〕
  - 実画面：iPhone のロック画面／PWA メモ一覧の 🔔 ボタン
- **iPhone から PC へ送る**：PWA の書く画面からテキスト・画像・動画（mp4/mov、PC 側では `assets/video/` に保存）・汎用ファイル添付を送れる。PC は30秒ポーリングで受け取り、受信時は確認ダイアログを出して取り込み／取り消しができる。複数の PC を同じ Drive に繋いでいる場合は送信先 PC を選べる〔要求：§9.2 REQ_IP_02／仕様：003_IPHONE §6.3・§6.4・§6.4.1／コード：IphoneReturnDialog.tsx・lib.rs `fusen_apply_iphone_return`〕
  - 動画の端末内コピーを付箋から再生。付箋削除でコピーも削除し、元動画とPC受信済み動画は保持。保存・送信は画面を開いている間に非同期処理〔仕様：003_IPHONE §6.4／コード：WriteStep.tsx・indexeddb.ts・useBackgroundSend.ts〕
  - 実画面：iPhone PWA の write 画面／PC の受信確認ダイアログ
- **Web共有**：クイックランチャー登録付箋を、自分の Google Drive 経由でブラウザから閲覧・本文編集・チェック切替・新規作成できる。同期は Windows 側の「Webと同期」を押したときだけの手動式で、競合・欠落・未確認の変更を自動で上書き・削除しない。共有の停止・再開、PCリンクとQRコードで同じ環境の共有画面を開く操作もある（Dev MSIXは検証Web、Store版は本番Web、判定不能時は開かない）〔仕様：013_WEB_SHARE §2・§4／コード：lib.rs `fusen_sync_quick_launcher_to_web`・web_share_snapshot.rs ほか／app/shared〕
  - PCランチャーの手動順を同期しWebへ適用。複数PCは表示順のPCを選択、順序だけの異常では本文閲覧を維持〔仕様：013_WEB_SHARE §4.0〕
  - 実画面：クイックランチャー「Webと同期」／ブラウザの共有画面 `/shared`
  - Web版とiPhone版の違いは [機能比較](015_WEB_IPHONE_COMPARISON.md) を参照。
  - ※ 013 §6 の画像予約と自動回収は実装済み。参照中・予約中の画像を除外し、条件付き更新に失敗した場合は削除しない。旧キャッシュ整理・端末メモリの実測は対象外とする

### 要求3-3　増えても、デスクトップが散らからないでほしい

要求テスト → [合格条件・担当ケース・不足](#req-3-3)

- **タグで整列（カンバン整列）**：全付箋を主ディスプレイへ、ユーザータグ＝横レーン×色（黄→ピンク→青）＝列で整列し、同色は左上が見える階段重ねにする。「整列を元に戻す」で直前の位置へ復帰できる〔仕様：002_PC §9／コード：arrange.rs `fusen_arrange_by_tag`・`fusen_arrange_undo`〕
  - 実画面：デスクトップ全体／トレイメニュー「タグで整列」（既定 Ctrl+Shift+L）
- **タグで絞り込み**：選んだタグを持つ付箋だけを表示し、それ以外を隠す〔要求：§5.2 SPEC-OR-02-03／仕様：002_PC §6.1〕
  - 実画面：トレイメニュー「タグで絞り込む」／デスクトップ
- **全部隠す／全部戻す**：全付箋を一括で非表示・再表示する〔仕様：002_PC §6.1・§10.1〕
  - 実画面：トレイメニュー／ホットキー（既定 Ctrl+Shift+H）
- **フォルダーに保管**：付箋をタグフォルダまたは Archive へ移動してデスクトップから片付ける（関連画像も一緒に移動）。取り出すときは専用画面で探して元の位置・大きさへ戻す〔要求：§5.3 SPEC-OR-03-01／仕様：002_PC §6.3・§6.3.1／ガイド：basic〕
  - 実画面：付箋右側の箱ボタン／右クリック「フォルダーに保管」、トレイ「保管した付箋を画面に戻す」画面〔コード：ArchivedNotesRestoreDialog.tsx〕
- **ランチャーに登録して画面から隠す**：ファイルを移動せず付箋の窓だけを隠してランチャーに収納する。タグ単位の「このタグをまとめて登録して隠す」もできる。登録は画面に表示し直しても維持し、登録解除を押したときだけ解除する。収納状態は PC ローカルの `favorite_storage.json` に保存され、再起動・全部戻す・整列でも勝手に表示されない〔仕様：002_PC §11.5／コード：favorite_storage.rs〕
  - 実画面：クイックランチャーの「ランチャーで隠した付箋」
### 要求3-4　昔のメモを、すぐ見つけたい

要求テスト → [合格条件・担当ケース・不足](#req-3-4)

- **全文検索**：Vault 内の全 .md を Rust 側で grep 検索し、結果リストから該当付箋を開いて最前面へ出す。Enter／Shift+Enter／F3 で結果を前後移動できる〔要求：§5.1 REQ_OR_01／仕様：002_PC §6.1／コード：SearchOverlay.tsx・lib.rs `fusen_search_notes`〕
  - 実画面：検索オーバーレイ（Ctrl+F、固定キー）
- **クイックランチャー**：登録した付箋と結晶の「棚」。名前・タグの部分一致検索、タグ区分（すべて／ユーザータグ／未分類）での絞り込み、狭い幅では1行・「すべてのタグ」で展開し選ぶと折りたたむ表示（選択中タグは維持）、完全手動の並び順（上下移動・名前変更・棚から外す）、開いた回数（リピート回数）の表示。作り置きウィンドウで即表示し、再起動後も保存した位置・サイズで付箋を戻す〔仕様：002_PC §11.5／コード：QuickLauncher.tsx・launcher.rs〕
  - 実画面：クイックランチャー（既定 Ctrl+P で開閉。トレイ／タスクバーのジャンプリストからも開ける。任意設定でマウス右ボタン3連打でも開ける〔仕様：002_PC §10.4〕）
- **タグ付けとタグフォルダ**：右クリックから複数タグの追加・切替ができ、タグバッジを押すとそのタグフォルダを開く。タグの全付箋一括削除（削除モード）もある〔要求：§5.2／仕様：002_PC §6.3〕
  - 実画面：付箋の右クリックメニュー「タグ」／付箋下部のタグバッジ

---

## 補助ブランチA：基盤（土台）

> ここにあるものは3コンセプトのどれか1つに属するのではなく、3つすべてを下から支える土台である。コンセプトに無理に押し込まず、基盤として独立に置く。

- **Markdown ファイル保存**：付箋は1枚＝1つの `.md` ファイル（YAML frontmatter＋本文）として Vault に保存され、他のエディタでも閲覧・編集できる。付箋から「フォルダを開く」でいつでも実ファイルに触れる〔要求：§3.1・§3.2／仕様：002_PC §3.1・§6.3〕
  - 実画面：付箋ファイル／付箋の右クリック「フォルダを開く」
- **アトミック保存と破損防止**：一時ファイルと `.bak` を使う原子的書き込みで、書き込み失敗時は元ファイルへ戻す〔仕様：002_PC §7.1.2・§6.5.2〕
- **手動バックアップ**：保存先とは別にバックアップを作成し、成功履歴を新しい順に2件保持する〔仕様：002_PC §6.5／コード：lib.rs `fusen_backup`〕
  - 実画面：設定画面「データ管理」／完了結果ダイアログ〔コード：BackupResultDialog.tsx〕
- **月次安全バックアップ**：既定で有効。30日（60日・90日も選択可）間隔で起動後に実行確認を出し、承認された場合だけ `Documents/OreNoFusen_Backup/Monthly` へ1世代を作成する。Trash の中身は既定で含めない〔仕様：002_PC §6.5.2・§6.5.4／コード：lib.rs `fusen_run_monthly_backup`・maintenance.rs〕
  - 実画面：設定画面「データ管理」
- **バックアップからの復旧**：原本を直接保存先にせず、Markdown の存在と件数を検証したコピーを固定の復旧先フォルダに作り、それを新しい保存先として再起動する〔仕様：002_PC §6.5／コード：lib.rs `fusen_restore_backup`〕
  - 実画面：設定画面「データ管理」
- **削除とごみ箱**：削除した付箋は保存先配下の `Trash/` フォルダへ物理移動する（OS のごみ箱とは別）。元に戻したい場合はエクスプローラーから取り出す〔要求：§5.3 SPEC-OR-03-02／コード：lib.rs `fusen_move_to_trash`・trash_history.rs〕
  - 実画面：付箋の右クリック「削除」（Ctrl+D）／右側のごみ箱ボタン
- **ごみ箱の90日整理**：初期設定はオフ。移動記録と本文・日時の証跡が一致する付箋だけを90日経過後に完全削除する（1回100件まで、画像は保持）。手動実行も対象一覧の確認が必須〔仕様：002_PC §6.5.3／コード：trash_cleanup.rs・lib.rs `fusen_trash_cleanup_preview` ほか〕
  - 実画面：設定画面「データ管理」〔コード：TrashRetentionSettings.tsx〕
- **インポート**：「Markdownのインポート＆しまったタグのインポート」で、外部の Markdown やタグフォルダへしまった付箋を、元ファイルを残したままコピーして取り込む〔仕様：002_PC §6.5／コード：import.rs・lib.rs `fusen_import_from_folder`〕
  - 実画面：設定画面「データ管理」
- **保存先（Vault）の変更**：データ保存先は最重要設定として常時表示され、変更後は全付箋を再スキャンして再生成する〔仕様：002_PC §6.5〕
  - 実画面：設定画面「データ管理」
- **プライバシー設計**：PC アプリ単体では外部サーバーと通信せず、ファイルはユーザー指定の Vault 内にのみ保存する。連携時の中継はユーザー自身の Google Drive のみで、Google トークンは Windows DPAPI で暗号化して PC ローカルにのみ保存する〔要求：§8.4 SPEC-NF-03-01/02／仕様：002_PC §6.5・100_PRIVACY〕
- **効果音**：作成・複製・しまう・削除・チェック・ピン・アラーム等の場面ごとに効果音が鳴る。プリセットは standard／soft／modern／wood／typewriter／alternate／silent の7種で、全体の ON/OFF も可能〔コード：app/utils/soundPreferences.ts・sound.rs／要求：§6.3〕
  - 実画面：設定画面「一般」タブ
- **多言語（日本語／英語）**：起動時に OS のロケールで自動決定し、設定画面からも切り替えできる。アプリが描画する固定 UI・ユーザーガイドが対象（利用者の本文・タグ名等は翻訳しない）〔要求：§8.6／仕様：002_PC §6.5.1〕
  - 実画面：設定画面「一般」タブ／各画面
- **デスクトップショートカット**：初回に作成を提案し、作成・削除・状態確認ができる〔仕様：008_DISTRIBUTION §6.1／コード：desktop_shortcut.rs〕
  - 実画面：初回起動時の提案／デスクトップ
- **設定画面**：タブは 一般／データ管理／iPhone連携／ホットキー／ひな形／使い方／このアプリについて／フィードバック。表示テーマ（ライト／ダーク／システム）は設定画面だけに適用される。ホットキーは8アクションすべてに個別の有効／無効スイッチと競合チェックがあり、登録失敗時は起動後に通知する〔仕様：002_PC §6.5・§10／コード：components/ui/settings-page.tsx〕
  - 実画面：設定画面（トレイメニュー「設定」／付箋右クリック「アプリ操作 → 設定を開く」）
- **ログと診断**〔要確認〕：ログフォルダを開く、iPhone 接続の診断、保存先の健全性チェックのコマンドが存在する〔コード：lib.rs `fusen_open_log_folder`・`fusen_diagnose_iphone_connection`・`fusen_check_storage_health`〕。画面上の配置（設定内の診断・管理者ツール相当）は要確認

---

- **PWAの版表示**：画面とSWはlib/pwa-version.mjsを共用。PWAの配信更新ごとに必ず番号を上げる〔仕様：003_IPHONE §1／手順：010_RELEASE〕

## 補助ブランチB：発展

> 3コンセプトの日常利用が一巡した先にある、育てる・繋がるための機能群。基盤の上に載るものとして独立に置く。

- **結晶化**：書き溜めた付箋を、再利用できる3種類の「結晶」に整理する〔仕様：002_PC §11／ガイド：advanced〕
  - **手順（レシピ）**：青付箋（こんなとき／どうする）と、きっかけになる黄色付箋から作る。ファイルは `Recipes/` に置かれ、使うたびに改善履歴が自動追記される〔仕様：002_PC §11.1〜§11.4／コード：RecipeCreateModal.tsx・lib.rs `fusen_create_recipe_note`〕
  - **QA**：問いと答えの5節形式で作り、`QA/` に置かれる〔仕様：002_PC §11.8／コード：QaCreateModal.tsx・lib.rs `fusen_create_qa_note`〕
  - **用語**：用語の意味を8節形式で作り、`Terms/` に置かれる〔仕様：002_PC §11.9／コード：TermCreateModal.tsx・lib.rs `fusen_create_term_note`〕
  - **結晶の棚と「閉じる（返す）」**：作った結晶はクイックランチャーの種類タブ（手順／QA／用語集）から探して開き、閉じるときは最新内容を保存して棚へ返す。結晶の作り置きウィンドウで再表示も速い〔仕様：002_PC §11.4・§11.5／コード：lib.rs `fusen_return_recipe`〕
  - **ひな形の編集**：新しく作る結晶の節名・役割・順序を種類別に設定できる〔仕様：002_PC §11.10／コード：launcher.rs `fusen_get_crystal_formats`・設定画面「ひな形」タブ〕
- **会員番号**：利用者を匿名の会員番号で識別し、設定画面で自分の番号を確認できる〔仕様：009_MEMBERSHIP §1・§2／コード：SupportMemberNumber.tsx・member_identity.rs〕
- **機能利用分析（同意制）**：「匿名の利用状況」と「会員別分析」の両方へ明示同意した場合だけ、機能ごとの週間使用回数を PC 内で集計して GA4 へ送る。付箋本文・タイトル・タグ名・検索語などの個人情報は送らない。拒否しても全機能を使え、設定からいつでも変更できる〔要求：§8.4 SPEC-NF-03-04／仕様：009_MEMBERSHIP §3／コード：AnalyticsConsentDialog.tsx〕
- **開発者ホットライン（お便り）**：開発者からのお知らせが会員認証付きで届き（常駐中に約3時間ごと確認）、設定画面の「開発者とのやりとり」に表示される。新着時は小窓で知らせ、お便りカードの直下から返信できる〔仕様：009_MEMBERSHIP §4／コード：lib.rs `member_announcements`・AnnouncementCard.tsx〕
- **開発者とのやりとり掲示板**：連絡先を入力しなくても、匿名の `conversation_id` で開発者と1対1のやりとりができる。ユーザーが明示的に選んだ画像を最大3枚まで添付でき、開発者の返信は Discord 経由で届く。既存の付箋本文や Drive 内ファイルは送信しない〔仕様：002_PC §6.6・007_COMMUNICATION〕
  - 実画面：設定画面「フィードバック」タブ／付箋右クリック「開発者とのやりとり」（未読時は「● 新着あり」）
- **開発を支援する**：寄付による開発支援と、支援者名・コメントを掲げる奉納帳（支援者エンドロール）〔コード：app/about-donation・EndrollMatsuri.tsx／仕様：002_PC §6.5〕
  - 実画面：設定画面「開発を支援する」／Web の奉納帳ページ
- **アップデート確認**：起動後に更新を確認し、更新があればダイアログで知らせる。配布は Microsoft Store（MSIX）が標準経路〔仕様：002_PC §1.3・008_DISTRIBUTION §7／コード：lib.rs `fusen_check_store_update`〕
  - StoreはStoreContext、desktopと正常判定した場合だけTauri updaterを使用。配布判定の失敗・不明、Store確認失敗では旧更新へ切り替えない〔コード：useUpdateCheck.ts／対象試験8件〕
  - 実画面：アップデート確認ダイアログ

---

<a id="requirement-tests"></a>

# 第2部　要求ごとのテスト（受入・E2E）

**要求全体の合格と、一部を確認する既存ケースを区別する。今回のアプリ試験実行は0。**

E2Eという形式だけで受入合格にしない。受け手・保存先・OSがモックなら、その先の成立は別確認。要求テストがない行は、ソース試験の成功で埋めない。同じケースIDは機能からも参照し、実行は1回。実機欄は条件付き候補であり、全項目を毎回実施する指示ではない。

<a id="req-1-1"></a>

### 要求1-1

表2-11：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|新規作成の操作から、待たされずに書き始められ、入力が残る|[新規メモへの入力](#case-b-new)|[PC画面（Tauriモック）](#env-e-pc)|[Windows起動・キー](#manual-m01)（該当変更だけ）|一部：ブラウザーの表示/入力。実OSキー/プール昇格/応答時間は不足|

<a id="req-1-2"></a>

### 要求1-2

表2-12：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|手元の画像/画面を付箋に取り込み、後から同じ内容を見られる|[ドロップ保存呼出・拒否](#case-c-drop)<br>[PWA受信画像の表示](#case-b-image-pwa)|[部品・フック（jsdom）](#env-e-ui)・[PWAブラウザー（通信モック）](#env-e-pwa)|[Windows画像取込](#manual-m02)・[PCの実画面](#manual-m04)（該当変更だけ）|一部：ドロップ部品と受信画像。実OSキャプチャ/クリップボードからの通しは不足|

<a id="req-1-3"></a>

### 要求1-3

表2-13：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|書いた内容が保存され、保存失敗・終了・再起動で失われない|[編集終了→保存呼出](#case-b-save)<br>[PWA再起動・オフライン復元](#case-b-recovery)<br>[保存成功/失敗・直列化](#case-c-file-save)|[PC画面（Tauriモック）](#env-e-pc)・[PWAブラウザー（通信モック）](#env-e-pwa)・[部品・フック（jsdom）](#env-e-ui)|[Windows実データ](#manual-m03)・[PC＋実iPhone](#manual-m07)（該当変更だけ）|一部：PC側は保存モック、PWAは検証データ。PC終了後の実ディスク復元は不足|

<a id="req-1-4"></a>

### 要求1-4

表2-14：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|名前を入力しなくても内容に応じたファイルが作られ、改名後も失わない|不足：対応ケース未同定|自動の上位ケースなし|[Windows実データ](#manual-m03)（該当変更だけ）|不足：命名/改名の単体はあるが利用者操作からの受入がない|

<a id="req-1-5"></a>

### 要求1-5

表2-15：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|自分で選んだ保存先へ残り、不適切な場所は安全に拒否される|[保存先を表示](#case-b-vault)|[PC画面（Tauriモック）](#env-e-pc)|[Windows実データ](#manual-m03)（該当変更だけ）|一部：現在の場所の表示だけ。初回選択と実保存/切替利用は不足|

<a id="req-1-6"></a>

### 要求1-6

表2-16：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|声で作ったメモが指定PCで読める|不足：対応ケース未同定|自動の上位ケースなし|[PC＋実iPhone](#manual-m07)・[実サービス接続](#manual-m10)（該当変更だけ）|不足：実Siri→中継→PC表示の受入がない。API単体で代替しない|

<a id="req-2-1"></a>

### 要求2-1

表2-21：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|重要な一文を強調でき、読む画面でも目立ち、開き直しても保持される|[PCの太字操作](#case-b-bold-pc)<br>[PWA赤文字・再表示](#case-b-bold-pwa)|[PC画面（Tauriモック）](#env-e-pc)・[PWAブラウザー（通信モック）](#env-e-pwa)|[PCの実画面](#manual-m04)・[PC＋実iPhone](#manual-m07)（該当変更だけ）|一部：PCの書式操作/PWAの赤色と保持。全端末/実配送ではない|

<a id="req-2-2"></a>

### 要求2-2

表2-22：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|画像に描き込み/切り取りを行い、保存した結果を再び見られる|不足：対応ケース未同定|自動の上位ケースなし|[PCの実画面](#manual-m04)（該当変更だけ）|不足：計算/履歴/再表示部品だけでは、描く→実保存→再表示の受入にならない|

<a id="req-2-3"></a>

### 要求2-3

表2-23：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|畳んでも見出しが分かり、戻せば隠れた本文が失われず使える|[編集/表示の折畳保持](#case-b-outline)|[PC画面（Tauriモック）](#env-e-pc)|[PCの実画面](#manual-m04)・[Windowsの窓](#manual-m05)（該当変更だけ）|一部：本文の部分折りたたみ。窓全体の折りたたみ/再起動保持は不足|

<a id="req-2-4"></a>

### 要求2-4

表2-24：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|見出し・チェック・表・図で内容を整理し、編集/保存後もその形で使える|[選択文字→表記法](#case-b-table)<br>[選択文字→図の記法](#case-b-diagram)<br>[編集/表示の折畳保持](#case-b-outline)|[PC画面（Tauriモック）](#env-e-pc)|[PCの実画面](#manual-m04)（該当変更だけ）|一部：生成操作と部分折りたたみ。全形式の保存/完成表示を通した受入は不足|

<a id="req-2-5"></a>

### 要求2-5

表2-25：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|選んだ見た目/最前面により、他の作業中でも付箋を見つけられる|不足：対応ケース未同定|自動の上位ケースなし|[Windowsの窓](#manual-m05)（該当変更だけ）|不足：値の定義/OS呼出のモックでは実際の目立ち方を判定できない|

<a id="req-2-6"></a>

### 要求2-6

表2-26：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|指定時刻に正しい付箋から通知され、気付いて開ける|不足：対応ケース未同定|自動の上位ケースなし|[Windows通知・音](#manual-m06)（該当変更だけ）|不足：日時/言語/前面判定の単体のみ。時刻発火→OS通知の受入はない|

<a id="req-3-1"></a>

### 要求3-1

表2-31：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|PCを起動し直すと、保存した付箋が使える位置と状態で戻る|不足：対応ケース未同定|自動の上位ケースなし|[Windows起動・キー](#manual-m01)・[Windowsの窓](#manual-m05)（該当変更だけ）|不足：復元順序/ファイルの単体のみ。実OS再起動からの受入は別|

<a id="req-3-2"></a>

### 要求3-2

表2-32：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|外で本文と添付を見て続きを送り返せ、元の内容を失わない|[PWA返送→PC比較選択](#case-b-return)<br>[PWA再起動・オフライン復元](#case-b-recovery)<br>[PWA送信済み動画の再生](#case-b-video)<br>[Web画像取得・草稿保持](#case-b-shared)|[PWAブラウザー（通信モック）](#env-e-pwa)・[Web画面（検証Drive）](#env-e-web)|[PC＋実iPhone](#manual-m07)・[PC＋実Web](#manual-m08)（該当変更だけ）|一部：ブラウザー/検証データ。実端末/実通信/PC配達は別。動画の送信済み化は模擬|

<a id="req-3-3"></a>

### 要求3-3

表2-33：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|付箋を整理して画面を片付け、必要になったら同じ内容へ戻れる|[保管の選択・復元操作](#case-b-restore)<br>[狭い一覧のタグ選択](#case-b-tags)<br>[隠す操作・失敗時保持](#case-c-storage)|[PC画面（Tauriモック）](#env-e-pc)・[部品・フック（jsdom）](#env-e-ui)|[Windows実データ](#manual-m03)・[Windowsの窓](#manual-m05)（該当変更だけ）|一部：UI/モック。実ファイル・実窓を一巡する受入は不足|

<a id="req-3-4"></a>

### 要求3-4

表2-34：要求の確認

|合格条件|担当する既存ケース|テスト環境|最後に必要になる実機確認|確認範囲・不足|
|---|---|---|---|---|
|探した語やタグから目的の過去メモを見つけて再利用できる|[検索からメモを選択](#case-b-search)<br>[狭い一覧のタグ選択](#case-b-tags)|[PC画面（Tauriモック）](#env-e-pc)|[Windows実データ](#manual-m03)・[PCの実画面](#manual-m04)（該当変更だけ）|一部：検証一覧の検索/タグ選択。実Vault全件/応答時間/実窓再利用は別|

基盤・発展は第1部で独立した要求IDを持たない補助ブランチ。新しい要求IDを勝手に作らず、次の機能表で個々の合格条件と不足を示す。

<a id="function-tests"></a>

# 第3部　機能ごとのテスト（結合・利用者操作）

**全71機能を省略せずに対応付ける。単体があるだけで機能全体を確認済みにしない。**

機能欄のケース参照は、操作または部品の接続を確認する既存試験。単体欄はソース試験の入口であり、全ケース監査済みの印ではない。空欄を推測で埋めず、不足を明示する。


### 要求1-1　思いついた瞬間に、書ける状態になっていてほしい

表3-1：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|プールウィンドウ方式<br>合格：準備済み窓を新規付箋へ昇格し、最初の入力を保持|[初回入力・プール解放](#case-c-pool)|[invisibleNotePool.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/invisibleNotePool.test.ts)<br>[freshRequestQueue.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/freshRequestQueue.test.ts)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windows起動・キー](#manual-m01)（条件付き）<br>一部。実OSの昇格/フォーカス/待ち時間は未確認|
|グローバルホットキー Ctrl+N<br>合格：別アプリ操作中のキーから入力可能な付箋を1枚開く|不足：対応ケース未同定|[hotkey_manager.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/hotkey_manager.rs)<br>[shortcutKey.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/shortcutKey.test.ts)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[Windows起動・キー](#manual-m01)（条件付き）<br>不足。OSキー→新規窓の通し確認は別途必要|
|Ctrl 2回押し／Shift 2回押しトリガー<br>合格：二度押しで1枚開き、他キー併用/無効設定では開かない|不足：対応ケース未同定|[double_tap.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/double_tap.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows起動・キー](#manual-m01)（条件付き）<br>不足。判定関数の単体はあるが実フック→窓は未確認|
|システムトレイ常駐＋トレイメニュー「新規メモ」<br>合格：常駐メニューから入力可能な付箋を開く|不足：対応ケース未同定|[tray.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/tray.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows起動・キー](#manual-m01)（条件付き）<br>不足。メニュー文字列の単体と実作成を区別|
|付箋上の「＋」ボタン／右クリック「新規メモ」<br>合格：操作から適切な場所に新規付箋を開き入力できる|[新規メモへの入力](#case-b-new)|[newNotePosition.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/newNotePosition.test.ts)<br>[useStickyNoteContextMenu.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useStickyNoteContextMenu.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windows起動・キー](#manual-m01)（条件付き）<br>一部。既存E2Eは新規URLを開くため＋/右クリック起点と実位置は未確認|
|自動起動<br>合格：設定ON/OFFに従い次回OSログイン時の常駐が変わる|不足：対応ケース未同定|[distribution.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/distribution.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows起動・キー](#manual-m01)（条件付き）<br>不足。設定移行の単体はあるがOSログイン受入は未確認|

### 要求1-2　画面上のもの・手元のものを、そのまま付箋にしたい

表3-2：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|画面キャプチャ<br>合格：撮影した画像が付箋に入り、キャンセル/失敗で原本が壊れない|不足：対応ケース未同定|専用試験未同定|機能：自動の上位ケースなし<br>単体：専用単体未同定|[Windows画像取込](#manual-m02)（条件付き）<br>不足。capture.rsの専用分岐試験なし。実OS撮影/キャンセル確認が必要|
|クリップボード画像の貼り付け<br>合格：貼付操作で画像が保存・表示され、続けて入力できる|不足：対応ケース未同定|[RichTextEditor.imagePaste.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/RichTextEditor.imagePaste.test.ts)<br>[clipboard.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/clipboard.rs)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Rust単体](#env-e-rust)|[Windows画像取込](#manual-m02)（条件付き）<br>不足。挿入位置/保存の単体はあるが実クリップボード→保存→表示の全体は未確認|
|エディタへの画像ドロップ貼り付け<br>合格：画像ドロップを保存して表示し、非対応ファイルを誤保存しない|[ドロップ保存呼出・拒否](#case-c-drop)|[droppedImage.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/droppedImage.test.ts)<br>[clipboard.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/clipboard.rs)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Rust単体](#env-e-rust)|[Windows画像取込](#manual-m02)（条件付き）<br>一部。保存呼出はモック。実Explorerとファイル書込は別|

### 要求1-3　書いたら、保存を考えたくない（保存忘れで消えるのが怖い）

表3-3：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|変更の自動保存<br>合格：編集後に保存され、失敗時も未保存本文と原本を守る|[編集終了→保存呼出](#case-b-save)<br>[保存成功/失敗・直列化](#case-c-file-save)|[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)<br>[logic.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/logic.rs)|機能：[PC画面（Tauriモック）](#env-e-pc)・[部品・フック（jsdom）](#env-e-ui)<br>単体：[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)（条件付き）<br>一部。実ディスク保存・終了後復元の通し確認は別|
|明示保存 Ctrl+S<br>合格：Ctrl+Sで現在の内容を保存し、失敗を成功扱いしない|[保存成功/失敗・直列化](#case-c-file-save)|[useNoteFile.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useNoteFile.test.tsx)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windows実データ](#manual-m03)（条件付き）<br>一部。共通保存経路まで。Ctrl+S起点の専用ケースは未同定|

### 要求1-4　ファイル名を考えたくない

表3-4：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|ファイル名の自動生成<br>合格：初回入力だけで有効なファイル名を生成・保存する|不足：対応ケース未同定|[logic.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/logic.rs)<br>[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)（条件付き）<br>不足。生成/保存の単体をつないだ新規作成の確認が必要|
|ファイル名の本文連動<br>合格：本文先頭を変えると名前が変わり、旧名で再保存しない|[保存成功/失敗・直列化](#case-c-file-save)|[logic.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/logic.rs)<br>[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)（条件付き）<br>一部。遅延保存の呼出順を確認。実ファイルの改名・再起動は別|

### 要求1-5　保存場所は自分で決めたい

表3-5：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|初回セットアップで保存先（Vault）を選択<br>合格：選んだ場所に保存し、不適切な場所を拒否する|[保存先を表示](#case-b-vault)|[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)<br>[settings-store.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/settings-store.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[Windows実データ](#manual-m03)（条件付き）<br>一部。既存E2Eは現在の保存先表示のみ。初回選択→実保存は未確認|

### 要求1-6　手が離せないときは、声で送りたい

表3-6：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|Siri から PC に付箋を送る<br>合格：声から作った本文が指定PCに付箋として届く|不足：対応ケース未同定|[route.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/api/siri-send/route.test.ts)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[実サービス接続](#manual-m10)（条件付き）<br>不足。API拒否/制限の単体だけで実Siri→PC到着を保証しない|

### 要求2-1　大事な一文を、ひと目で目立たせたい

表3-7：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|太字の朱表示<br>合格：強調操作の結果を赤い太字で表示する|[PCの太字操作](#case-b-bold-pc)|[MarkdownRenderer.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/__tests__/MarkdownRenderer.test.tsx)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。PC E2Eは書式操作を確認。PC赤色の視認条件までの専用assertは未同定|
|フローティングフォーマットバー<br>合格：選択から書式を適用し、選択と入力を失わない|[選択バーのボタン呼出](#case-c-bar)<br>[PCの太字操作](#case-b-bold-pc)|[FloatingFormatBar.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/FloatingFormatBar.test.tsx)|機能：[部品・フック（jsdom）](#env-e-ui)・[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。部品の呼出と太字操作。全ボタン/配置の実操作一式ではない|
|編集用ホットキー<br>合格：有効な編集キーが作用し、無効化/保存失敗時に状態を守る|[編集キー変更・失敗復帰](#case-b-edit-key)|[shortcutKey.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/shortcutKey.test.ts)<br>[hotkey_manager.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/hotkey_manager.rs)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Rust単体](#env-e-rust)|[PCの実画面](#manual-m04)（条件付き）<br>ブラウザーの編集キー範囲。全OSキー登録の保証ではない|
|PWAの強調表示<br>合格：一覧と編集本文で赤い太字になり、開き直しても保つ|[PWA赤文字・再表示](#case-b-bold-pwa)|[NoteListStep.rendering.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/NoteListStep.rendering.test.tsx)|機能：[PWAブラウザー（通信モック）](#env-e-pwa)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PC＋実iPhone](#manual-m07)（条件付き）<br>受信相当データによるブラウザー確認。実PC配送/実iOSは別|

### 要求2-2　画像に、そのまま書き込みたい

表3-8：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|画像への描き込み<br>合格：描いた内容を画像へ保存し、開き直して同じ絵が見える|[保存済み画像の再表示](#case-c-image)|[ImageAnnotationModal.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ImageAnnotationModal.test.ts)<br>[annotationHistory.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/annotationHistory.test.ts)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。保存済み画像の読込部品まで。描画→合成保存→再表示は不足|
|トリミング<br>合格：選択した範囲で保存・再表示し、失敗/取消時は元を守る|[保存済み画像の再表示](#case-c-image)|[imageCrop.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/imageCrop.test.ts)<br>[fitCroppedNote.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/fitCroppedNote.test.ts)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。矩形計算と再表示寸法はあるが操作から実保存まで不足|
|画像の表示サイズ変更<br>合格：変更した倍率で表示し、再読込後も寸法が正しい|[保存済み画像の再表示](#case-c-image)|[ResizableImage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ResizableImage.test.tsx)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。倍率を渡した再表示まで。ドラッグ→倍率保存の全体は別|

### 要求2-3　畳んでも、項目（見出し）は見えていてほしい

表3-9：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|付箋全体の折りたたみ（△／▽）<br>合格：畳むとタイトルだけになり、戻すと本文が復帰する|[本文展開・状態保存呼出](#case-c-fold)|[StickyNote.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.test.tsx)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windowsの窓](#manual-m05)（条件付き）<br>一部。展開と保存呼出のみ。実窓縮小/再起動保持は別|
|本文の一部分の折りたたみ<br>合格：表示/編集中で同じ範囲を開閉し、隠れた本文を消さない|[編集/表示の折畳保持](#case-b-outline)|[editorOutline.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/editorOutline.test.ts)<br>[outline.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/outline.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>Tauriモック。ブラウザー内の編集/表示接続を確認|

### 要求2-4　構造を整理して見せたい

表3-10：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|見出し<br>合格：見出し記法を階層表示し、編集時も内容を保つ|[編集/表示の折畳保持](#case-b-outline)|[MarkdownRenderer.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/__tests__/MarkdownRenderer.test.tsx)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。全見出しレベルは部品試験。全操作の通し確認ではない|
|チェックリスト<br>合格：チェックを切り替え、その状態が保存・再表示される|[Webチェック保存・失敗復帰](#case-c-check)|[checkboxToggle.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/checkboxToggle.test.ts)<br>[RichTextEditor.checkboxDecoration.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/RichTextEditor.checkboxDecoration.test.ts)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。Web共有の操作と保存呼出/失敗復帰。PCの実保存/再起動は別|
|テーブル<br>合格：選択した文章から表を作り、表として表示する|[選択文字→表記法](#case-b-table)|[MarkdownRenderer.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/__tests__/MarkdownRenderer.test.tsx)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。E2Eは表記法への変換まで。完成表の表示/再保存は未確認|
|Mermaid 図<br>合格：選択から図を作り、安全に図として表示・保存する|[選択文字→図の記法](#case-b-diagram)|[mermaid.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/mermaid.test.ts)<br>[mermaidSecurity.browser.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/mermaidSecurity.browser.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。ブロック変換と描画安全性は別試験。編集→保存→再表示の全体は不足|
|日付・時刻の挿入<br>合格：メニューの選択で期待する日時文字列が現在位置に入る|不足：対応ケース未同定|[useStickyNoteContextMenu.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useStickyNoteContextMenu.test.ts)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>不足。該当操作を通す専用ケースは未同定|

### 要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）

表3-11：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|最前面に固定（ピン留め）<br>合格：ONで他アプリの上に残り、OFFで解除する|不足：対応ケース未同定|[noteAppearance.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/noteAppearance.test.ts)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windowsの窓](#manual-m05)（条件付き）<br>不足。値/別窓のモック試験を、付箋の実OS最前面の成立にしない|
|色分け（背景色5色）<br>合格：選んだ色が付箋へ反映され保存後も保たれる|不足：対応ケース未同定|[noteAppearance.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/noteAppearance.test.ts)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windowsの窓](#manual-m05)（条件付き）<br>不足。色の定義の単体だけでは画面と保存までを確認できない|
|透明度3段階<br>合格：選んだ透明度が実窓に反映され、保存/復元できる|不足：対応ケース未同定|専用試験未同定|機能：自動の上位ケースなし<br>単体：専用単体未同定|[Windowsの窓](#manual-m05)（条件付き）<br>不足。lib.rsの実OS反映と保持は未確認|
|文字サイズ<br>合格：選んだ文字サイズが本文に反映され保存後も保たれる|不足：対応ケース未同定|[noteAppearance.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/noteAppearance.test.ts)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windowsの窓](#manual-m05)（条件付き）<br>不足。サイズの定義の単体だけでは画面と保存までを確認できない|

### 要求2-6　時刻になったら知らせてほしい

表3-12：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|アラーム<br>合格：指定時刻に該当付箋が通知・発光し、重複発火しない|不足：対応ケース未同定|[alarmDateTime.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/alarmDateTime.test.ts)<br>[alarmAlwaysOnTop.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/alarmAlwaysOnTop.test.ts)<br>[AlarmDialog.language.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/AlarmDialog.language.test.tsx)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windows通知・音](#manual-m06)（条件付き）<br>不足。日時/前面判定/言語だけで時刻発火の一連を保証しない|

### 要求3-1　PCを開いたら、いつもの場所にいてほしい

表3-13：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|起動時の状態復元<br>合格：起動後に保存済み付箋が元の状態で戻り、入力できる|不足：対応ケース未同定|[startupRestore.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/startupRestore.test.ts)<br>[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Rust単体](#env-e-rust)|[Windows起動・キー](#manual-m01)（条件付き）<br>不足。実再起動からの復元は別。起動順序の単体のみで合格にしない|
|マルチモニター救済<br>合格：画面外へ出た付箋を使える画面内へ戻す|不足：対応ケース未同定|[newNotePosition.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/newNotePosition.test.ts)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windowsの窓](#manual-m05)（条件付き）<br>不足。新規位置の計算は関連のみ。実モニター変更による既存窓救済は未確認|

### 要求3-2　家の外でも見たい・続きをしたい

表3-14：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|iPhone に送る（PC → iPhone）<br>合格：PC付箋の本文/画像が受信先で読め、通信不能でも再表示できる|[PWA受信画像の表示](#case-b-image-pwa)<br>[PWA再起動・オフライン復元](#case-b-recovery)<br>[PWA赤文字・再表示](#case-b-bold-pwa)|[lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)<br>[push.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/push.test.ts)|機能：[PWAブラウザー（通信モック）](#env-e-pwa)<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[PC＋実iPhone](#manual-m07)（条件付き）<br>一部。受信相当データの表示/端末保持。実PC→Drive→Push配送は別|
|通知常駐（ロックだぜ）<br>合格：指定した付箋の通知が設定どおり残り、正しい付箋を開く|[PWA通知API・開くID](#case-b-notice)|[notification-navigation.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/notification-navigation.test.ts)<br>[push.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/push.test.ts)|機能：[PWAブラウザー（通信モック）](#env-e-pwa)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PC＋実iPhone](#manual-m07)（条件付き）<br>一部。通知APIモック。実ロック画面での常駐/OS制約は別|
|iPhone から PC へ送る<br>合格：本文と添付がPCに届き、元付箋への反映を選択できる|[PWA返送→PC比較選択](#case-b-return)<br>[PC/iPhone比較・反映選択](#case-c-compare)<br>[添付送信・失敗時保持](#case-c-file-attach)<br>[複数動画・容量不足の拒否](#case-c-video-send)|[receiveIphoneNote.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/receiveIphoneNote.test.ts)<br>[lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|機能：[PWAブラウザー（通信モック）](#env-e-pwa)・[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Rust単体](#env-e-rust)|[PC＋実iPhone](#manual-m07)（条件付き）<br>一部。受渡し/PC/Driveはモック範囲。実到着は別。動画再生/端末保存は下位分岐参照|
|Web共有<br>合格：PCの共有付箋をWebで読み編集し、変更をPCへ戻せる|[Web画像取得・草稿保持](#case-b-shared)<br>[Webの並びと取得失敗](#case-b-order)|[page.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/shared/page.test.tsx)<br>[drive.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/shared/lib/drive.test.ts)<br>[web_share_snapshot.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/web_share_snapshot.rs)|機能：[Web画面（検証Drive）](#env-e-web)<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Rust単体](#env-e-rust)|[PC＋実Web](#manual-m08)（条件付き）<br>一部。検証用Drive応答。実PC/Driveへの到着と競合解消は別|

### 要求3-3　増えても、デスクトップが散らからないでほしい

表3-15：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|タグで整列（カンバン整列）<br>合格：タグ区分に従い窓が並び、不要な付箋を動かさない|不足：対応ケース未同定|[arrange.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/arrange.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windowsの窓](#manual-m05)（条件付き）<br>不足。配置計算の単体と実窓の並べ替えを区別|
|タグで絞り込み<br>合格：選んだタグだけが一覧に残り、切替後も選択が正しい|[狭い一覧のタグ選択](#case-b-tags)|[LauncherTagFilter.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/LauncherTagFilter.test.tsx)<br>[QuickLauncher.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。ランチャーのブラウザー範囲。実OSの窓を隠す処理とは別|
|全部隠す／全部戻す<br>合格：対象の窓だけを一括で隠し、同じ状態へ戻せる|不足：対応ケース未同定|[lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windowsの窓](#manual-m05)（条件付き）<br>不足。全窓の実OS操作を確認する専用機能試験は未同定|
|フォルダーに保管<br>合格：保管して窓を閉じ、必要なものを原本を守って戻せる|[保管の選択・復元操作](#case-b-restore)<br>[隠す操作・失敗時保持](#case-c-storage)<br>[保管選択・失敗復帰](#case-c-restore)|[archiveRestore.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/archiveRestore.test.ts)<br>[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|機能：[PC画面（Tauriモック）](#env-e-pc)・[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)（条件付き）<br>一部。UIの保管/復元はモック。実ファイル移動はRust単体で別確認|
|ランチャーに登録して画面から隠す<br>合格：登録した付箋を隠し、ランチャーから再表示できる|[隠す操作・失敗時保持](#case-c-storage)|[favorite_storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/favorite_storage.rs)<br>[QuickLauncher.storage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.storage.test.tsx)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[Windowsの窓](#manual-m05)（条件付き）<br>一部。API呼出/失敗時保持は確認。実窓再表示/再起動保持は別|

### 要求3-4　昔のメモを、すぐ見つけたい

表3-16：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|全文検索<br>合格：本文の語から目的の既存付箋を見つけ、同じ窓を開く|[検索からメモを選択](#case-b-search)|[lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)<br>[SearchOverlay.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/SearchOverlay.test.tsx)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。検索/前面化のモック。実Vault全体と応答時間は別|
|クイックランチャー<br>合格：登録した付箋を検索・タグで選び、開ける|[狭い一覧のタグ選択](#case-b-tags)<br>[隠す操作・失敗時保持](#case-c-storage)|[launcher.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/launcher.rs)<br>[QuickLauncher.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)・[部品・フック（jsdom）](#env-e-ui)<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。タグ/保管操作。実OSで開くこと・全タブの受入は別|
|タグ付けとタグフォルダ<br>合格：タグ追加/変更/削除が反映され、誤って本文を失わない|[タグ管理・部分失敗保持](#case-c-tag)|[reservedTags.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/reservedTags.test.ts)<br>[LauncherTagActions.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/LauncherTagActions.test.tsx)<br>[useTagManager.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useTagManager.test.ts)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。管理部品の追加/部分失敗まで。PCのタグフォルダを通す専用試験は未同定|

### 補助ブランチA：基盤（土台）

表3-17：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|Markdown ファイル保存<br>合格：本文と属性がMarkdownに残り、開き直して同じ内容になる|[編集終了→保存呼出](#case-b-save)<br>[保存成功/失敗・直列化](#case-c-file-save)|[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|機能：[PC画面（Tauriモック）](#env-e-pc)・[部品・フック（jsdom）](#env-e-ui)<br>単体：[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)（条件付き）<br>一部。ブラウザー側は保存モック。実読書きのRust試験と組み合わせてもOS終了復元は別|
|アトミック保存と破損防止<br>合格：途中失敗/競合で原本を壊さず復旧できる|不足：対応ケース未同定|[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)（条件付き）<br>不足。実ファイルの単体はあるが利用者操作から復旧までの上位試験は未同定|
|手動バックアップ<br>合格：指定先へ正しい内容を保全し、成否を誤表示しない|[バックアップ結果表示](#case-c-backup)|[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)<br>[BackupResultDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/BackupResultDialog.test.tsx)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[Windows実データ](#manual-m03)（条件付き）<br>一部。結果画面と保存処理は別。操作から成果物の照合まで不足|
|月次安全バックアップ<br>合格：期限と設定に従って保全し、中断から安全に再開する|不足：対応ケース未同定|[maintenance.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/maintenance.rs)<br>[monthlyBackupSettings.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/monthlyBackupSettings.test.ts)<br>[lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[Windows実データ](#manual-m03)（条件付き）<br>不足。月次処理の単体と実起動契機/日付をまたぐ動作を区別|
|バックアップからの復旧<br>合格：元データを保持し、正しい復旧先へ戻して利用できる|不足：対応ケース未同定|[lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)（条件付き）<br>不足。restore_backup_testsのファイル検証はあるが再起動利用までの通し確認は別|
|削除とごみ箱<br>合格：対象だけをごみ箱へ移し、削除対象外を守る|不足：対応ケース未同定|[trash_history.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/trash_history.rs)<br>[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)（条件付き）<br>不足。PCの実操作→ごみ箱→復元の専用上位試験は未同定。PWA削除とは別|
|ごみ箱の90日整理<br>合格：期限/履歴が確かな対象だけを整理し、不明なら止まる|不足：対応ケース未同定|[trash_cleanup.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/trash_cleanup.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)（条件付き）<br>一部の安全停止E2Eは後述。期限判定から実削除までの上位試験は未同定|
|インポート<br>合格：元を変更せずMarkdownと関連画像を取り込み利用できる|不足：対応ケース未同定|[import.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/import.rs)<br>[importRefresh.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/importRefresh.test.ts)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[Windows実データ](#manual-m03)（条件付き）<br>不足。ファイル処理と一覧再読取の単体だけで全操作成立としない|
|保存先（Vault）の変更<br>合格：変更先を再スキャンし、元の原本を消さず利用できる|[保存先を表示](#case-b-vault)|[storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)<br>[settings-store.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/settings-store.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[Rust単体](#env-e-rust)・[部品・フック（jsdom）](#env-e-ui)|[Windows実データ](#manual-m03)（条件付き）<br>一部。既存E2Eは保存先の表示のみ。切替後の実利用は未確認|
|プライバシー設計<br>合格：同意/接続範囲を越えて送らず、秘密情報を安全に扱う|不足：対応ケース未同定|[gdrive.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/gdrive.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows実データ](#manual-m03)・[実サービス接続](#manual-m10)（条件付き）<br>不足。暗号化/OAuthの単体だけで外部通信全体・保存先・ログの受入としない|
|効果音<br>合格：設定に従い該当操作で正しい音が鳴り、無効時は鳴らない|不足：対応ケース未同定|[soundPreferences.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/soundPreferences.test.ts)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[Windows通知・音](#manual-m06)（条件付き）<br>不足。設定値の単体のみ。実音の発生は別|
|多言語（日本語／英語）<br>合格：切替言語を画面間/再起動後も保持して表示する|[PC設定の英語表示](#case-b-pc-lang)<br>[PWA言語と再起動保持](#case-b-pwa-lang)|[i18n.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/i18n.test.ts)<br>[language.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/language.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)・[PWAブラウザー（通信モック）](#env-e-pwa)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。対象画面のブラウザー範囲。全画面/OSの言語受入ではない|
|デスクトップショートカット<br>合格：正しい対象のショートカットからいつものアプリが開く|不足：対応ケース未同定|[desktop_shortcut.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/desktop_shortcut.rs)|機能：自動の上位ケースなし<br>単体：[Rust単体](#env-e-rust)|[Windows起動・キー](#manual-m01)（条件付き）<br>不足。名前/起動先の単体のみ。OSから開く実操作は別|
|設定画面<br>合格：設定を変更・保存し、対象動作へ反映する|[PC設定の英語表示](#case-b-pc-lang)|[settingsPageText.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/settingsPageText.test.ts)<br>[settings-store.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/settings-store.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>一部。既存参照は言語表示。全設定の保存/実動作を確認した意味ではない|
|ログと診断<br>合格：必要な診断を出せ、本文や秘密値を不用意に含めない|不足：対応ケース未同定|[diagnostic-log.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/diagnostic-log.test.ts)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>不足。PWA診断の単体はあるがPC loggerを含む全経路ではない|
|PWAの版表示<br>合格：画面の版と配信されたSW/プログラムの版が一致する|不足：対応ケース未同定|専用試験未同定|機能：自動の上位ケースなし<br>単体：専用単体未同定|[PC＋実iPhone](#manual-m07)（条件付き）<br>不足。リリース時の配信照合は運用手順。版表示の専用自動機能試験は未同定|

### 補助ブランチB：発展

表3-18：機能とソースの確認

|機能・合格条件|担当する機能ケース|ソース単体の入口|テスト環境|実機候補・未確認範囲|
|---|---|---|---|---|
|結晶化<br>合格：選んだ内容から指定形式の付箋を作成・保存して再利用する|不足：対応ケース未同定|[crystalFormat.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/crystalFormat.test.ts)<br>[crystalFormatEditor.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/crystalFormatEditor.test.ts)<br>[CrystalCreateModals.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/CrystalCreateModals.test.tsx)|機能：自動の上位ケースなし<br>単体：[部品・フック（jsdom）](#env-e-ui)|[PCの実画面](#manual-m04)（条件付き）<br>不足。整形/モーダルの試験はあるが生成→保存→再利用の通し確認は未同定|
|会員番号<br>合格：登録状態に応じ正しい番号を割り当て表示し、失敗を隠さない|[会員番号・登録待ち表示](#case-c-member)|[service.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/api/members/lib/service.test.ts)<br>[member_identity.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/member_identity.rs)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Rust単体](#env-e-rust)|[実サービス接続](#manual-m10)（条件付き）<br>一部。番号表示とAPI処理は別。実登録→保存→再起動まで不足|
|機能利用分析（同意制）<br>合格：選んだ同意範囲だけで分析し、拒否/保留を守る|[同意保留・再確認](#case-c-consent)|[analytics.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/analytics.test.ts)<br>[analyticsConsentCompletion.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/analyticsConsentCompletion.test.ts)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[実サービス接続](#manual-m10)（条件付き）<br>一部。同意画面と送信判定の試験。実サービス集計までの上位確認は別|
|開発者ホットライン（お便り）<br>合格：本文/画像を送れ、失敗時に入力を守り未送信を伝える|[お便り画像失敗・入力保持](#case-b-letter)<br>[お便り返信操作](#case-c-card)|[feedbackConversation.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/feedbackConversation.test.ts)<br>[feedbackImage.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/feedbackImage.test.ts)|機能：[PC画面（Tauriモック）](#env-e-pc)・[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[実サービス接続](#manual-m10)（条件付き）<br>一部。通信先モック。実サービスへの到着は別|
|開発者とのやりとり掲示板<br>合格：会話と返信が順序どおり見え、新着に気付ける|[会話順序・新着表示](#case-b-reply)|[developerConversationTimeline.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/developerConversationTimeline.test.ts)<br>[index.test.mjs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/workers/discord-replies/src/index.test.mjs)|機能：[PC画面（Tauriモック）](#env-e-pc)<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Node単体](#env-e-node)|[実サービス接続](#manual-m10)（条件付き）<br>一部。受信相当データの表示。実Discord/サーバー間配送は別|
|開発を支援する<br>合格：支援の入口を開け、支援者情報を正しく表示する|[支援者の表示](#case-c-support)|[EndrollMatsuri.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/EndrollMatsuri.test.tsx)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)|[実サービス接続](#manual-m10)（条件付き）<br>一部。表示部品のみ。支援の手続き成立は別|
|アップデート確認<br>合格：配布方式に合う更新を通知し、許可なく別方式へ進まない|[配布方式別の更新確認](#case-c-update)|[useUpdateCheck.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useUpdateCheck.test.tsx)<br>[distribution.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/distribution.rs)|機能：[部品・フック（jsdom）](#env-e-ui)<br>単体：[部品・フック（jsdom）](#env-e-ui)・[Rust単体](#env-e-rust)|[Windows配布・更新](#manual-m09)（条件付き）<br>一部。更新サービスと導入はモック。Store取得/導入/再起動は別|

### 送受信の下位機能を分けて見る

表3-下位：動画を一括りにしない

|元機能|確認すること|担当ケース|範囲・不足|
|---|---|---|---|
|iPhoneからPCへ送る／動画の端末内再生|送信済み付箋を開き直して動画を再生・削除できる|[PWA送信済み動画の再生](#case-b-video)|実DB・動画再生。送信済み状態/PC配達は模擬|
|iPhoneからPCへ送る／動画・ファイルの送信|本文/添付/宛先を守り、失敗時に消さない|[複数動画・容量不足の拒否](#case-c-video-send)<br>[添付送信・失敗時保持](#case-c-file-attach)|Drive/PCの実通信は別|
|PCからiPhoneへ送る／受信後のオフライン閲覧|再読込後、Drive不通でも受信本文/画像を開ける|[PWA再起動・オフライン復元](#case-b-recovery)|受信相当データから。実Push配達は別|
|PWA付箋の削除|残ったキューから削除済み付箋が復活しない|[PWA削除後の復活防止](#case-b-delete-pwa)|検証用Driveキュー。実サービスの保持期限は別|

動画のDB保存/別画面削除はソース試験 [実DBの動画保持・削除競合](#case-b-video-db) を共用する。DBを変えた場合だけ選び、再生UIだけの修正に自動追加しない。

<a id="source-tests"></a>

# 第4部　ソースごとの既存テスト対応（従来の監査記録）

> 従来の対応と監査評価を保持する。●/◐/○は監査時点のソース中心の評価であり、第2部の要求や第3部の機能が全体合格した印ではない。最新のアプリ試験を今回実行した記録でもない。
>
> 初回評価：2026-11-09（テスト充足度監査）。テストが追加・変更されたら、同じ PR でこの表の評価も更新すること（更新ルール5）。
>
> 凡例：●＝充実／◐＝あり・薄い／○＝なし〜ほぼなし。充足度は「テスト件数 × データ損失リスクに対する検証の深さ」で判定。

初回監査時の記録：TS テスト179ファイル・実測983件パス／Rust 452件／E2E 21本／scripts系 16ファイル。現在の総数・成功は最新headのCI結果で確認する。
初回監査で挙がったWeb共有・バックアップ復旧・書式バーの不足は、本改訂で通常テストを追加した。安全系4E2Eの独立CIジョブはPR #134で導入した。capture.rsの分岐テストと実Drive・実機確認は残る。

## コンセプト1：すぐ書ける

### 要求1-1 思いついた瞬間に書ける状態
- プールウィンドウ方式 — app/utils/invisibleNotePool.test.ts・windowCreation.test.ts、StickyNote.pool.test.tsx、freshRequestQueue.test.ts — ●
- グローバルホットキー Ctrl+N — src-tauri/src/hotkey_manager.rs（7件、競合チェック含む）、app/utils/shortcutKey.test.ts、e2e/hotkey-disable.spec.ts（CI外） — ●
- Ctrl／Shift 2回押しトリガー — double_tap.rs（6件） — ◐（Rust 側のみ、設定UI側の検証なし）
- システムトレイ常駐＋新規メモ — tray.rs（3件） — ◐（メニュー表示整形のみ。本体動作は手動確認領域）
- 付箋上の「＋」／右クリック新規 — app/utils/newNotePosition.test.ts、app/hooks/useStickyNoteContextMenu.test.ts — ◐
- 自動起動 — distribution.rs（旧設定の無効化1件）、lib/storeMigration 系 — ◐（fusen_set_startup_enabled 自体の検証は薄い）

### 要求1-2 画面・手元のものをそのまま付箋に
- **画面キャプチャ — capture.rs（168行） — ○ テストゼロ**（Snipping Tool 起動・失敗・キャンセル時の分岐が無検証）
- クリップボード画像の貼り付け — clipboard.rs（12件）、RichTextEditor.imagePaste.test.ts — ●
- エディタへの画像ドロップ — app/utils/droppedImage.test.ts、clipboard.rs `fusen_save_dropped_image_data` — ●

### 要求1-3 保存を考えたくない
- 変更の自動保存 — storage.rs（条件付き書き込み・復旧下書き・世代バックアップ）、logic.rs（リネーム後の遅延保存で旧ファイルを再作成しない検証） — ●
- 明示保存 Ctrl+S — 自動保存と同一経路 — ◐（専用検証なし、低リスク）

### 要求1-4 ファイル名を考えたくない
- ファイル名自動生成・本文連動リネーム — logic.rs（sanitize／parse_filename／select_context_line 群）、storage.rs（rename 系） — ●

### 要求1-5 保存場所は自分で決めたい
- 初回セットアップで Vault 選択 — storage.rs（validate_storage_path／check_storage_health）、lib/settings-store.test.ts — ◐（初回セットアップ画面自体の E2E なし）

### 要求1-6 声で送りたい
- Siri → PC 付箋 — app/api/siri-send/route.test.ts — ◐（API 側のみ。PC のポーリング受信→付箋化の結合は薄い。実験的機能のため優先度低）

---

## コンセプト2：強調できる

### 要求2-1 大事な一文を目立たせたい
- 太字の朱表示 — app/components/__tests__/MarkdownRenderer.test.tsx — ●（PC表示）。※iPhone ビューア側の朱太字テストは PR #125 で追加、未マージのため main 未収録 — ◐
- フローティングフォーマットバー — app/components/FloatingFormatBar.tsx、FloatingFormatBar.test.tsx（8件：日英ラベル・配置・各操作・選択保持） — ●
- 編集用ホットキー — shortcutKey.test.ts、hotkey_manager.rs — ◐

### 要求2-2 画像に書き込みたい
- 画像への描き込み — ImageAnnotationModal.test.ts、app/utils/annotationHistory.test.ts — ●
- トリミング — app/utils/imageCrop.test.ts、fitCroppedNote.test.ts — ●／clipboard.rs `fusen_save_annotated_image`（合成保存）の Rust 側検証は薄い — ◐
- 画像の表示サイズ変更 — ResizableImage.test.tsx — ●

### 要求2-3 畳んでも項目は見える
- 付箋全体の折りたたみ — StickyNote.test.tsx、app/utils/editorOutline.test.ts — ◐
- 本文の一部分の折りたたみ — editorOutline.test.ts、outline.test.ts、e2e/editor-outline.spec.ts（CI外） — ●

### 要求2-4 構造を整理して見せたい
- 見出し／チェックリスト／テーブル — MarkdownRenderer.test.tsx、checkboxToggle.test.ts、RichTextEditor.checkboxDecoration.test.ts — ●
- Mermaid 図 — app/utils/mermaid.test.ts、mermaidSecurity.browser.test.ts — ●
- 日付・時刻の挿入 — useStickyNoteContextMenu.test.ts に内包 — ◐

### 要求2-5 付箋そのものを目立たせたい
- 最前面固定／色分け／文字サイズ — app/utils/noteAppearance.test.ts — ●
- 透明度3段階 — lib.rs `fusen_set_opacity` の Rust 側検証は薄い — ◐

### 要求2-6 時刻になったら知らせてほしい
- アラーム — app/utils/alarmDateTime.test.ts、alarmAlwaysOnTop.test.ts、AlarmDialog.language.test.tsx — ◐（日時計算と言語のみ。発火の一連の結合テストなし）

---

## コンセプト3：そこにある

### 要求3-1 いつもの場所にいてほしい
- 起動時の状態復元 — app/utils/startupRestore.test.ts、storage.rs、lib.rs — ●
- マルチモニター救済 — lib.rs — ◐（実モニター構成依存部は検証不能領域）

### 要求3-2 家の外でも見たい
- 遅い同期完了による古い一覧の再表示防止 — useNoteList.ts、useNoteList.test.tsx（遅い通信完了・最新DB読取失敗）、e2e/data-safety.spec.ts — ●（通信を保留した回帰試験で確認）
- iPhone に送る（PC→iPhone） — lib.rs（push ペイロード系）、webpush.rs（3件）、gdrive.rs（8件：トークン暗号化・OAuth state 検証は●） — ●
- 通知常駐（ロックだぜ） — e2e/lock-notification.spec.ts — ◐（CI で回らない）
- iPhone から PC へ送る — IphoneReturnDialog.test.tsx、app/utils/receiveIphoneNote.test.ts、file_drop.rs（5件）、lib.rs — ●
- **Web共有 — TS 側 ●／Rust 側 ●（通常テストの範囲）**：web_share_snapshot.rsは通常10件（整合性・scope/digest・CAS競合時の上書き拒否・GCゲート失敗時の削除0・重複競合の保留）。実Drive fixture1件はignoreであり未実施と区別する。web_share_contract.rs・web_share_markdown.rs・web_sharing_state.rs・web_share_read_cache.rs・web_share_download.rsも参照。実Driveの委譲経路の通し確認は通常テストの成功だけで代替しない。

### 要求3-3 散らからないでほしい
- タグで整列 — arrange.rs（23件） — ●
- タグで絞り込み／全部隠す・戻す — tray.rs、lib.rs に部分的に内包 — ◐
- フォルダーに保管・保管した付箋を画面に戻す — storage.rs（restore_archived_note）、app/utils/archiveRestore.test.ts、ArchivedNotesRestoreDialog.test.tsx、e2e/archive-restore.spec.ts — ●
- ランチャーに登録・画面から隠す／画面に表示 — favorite_storage.rs（12件）、QuickLauncher.storage／lifecycle.test、lib.rs — ●

### 要求3-4 すぐ見つけたい
- 全文検索 — lib.rs `test_search_logic`、SearchOverlay.test.tsx — ●
- クイックランチャー — launcher.rs（38件）、QuickLauncher.test 群 — ●
- タグ付けとタグフォルダ／タグ一括削除 — logic.rs、app/utils/reservedTags.test.ts — ●

---

## 補助ブランチA：基盤

- Markdown ファイル保存／アトミック保存と破損防止 — storage.rs（65件） — ●（全体で最も手厚い）
- 手動バックアップ — storage.rs、BackupResultDialog.test.tsx — ●
- 月次安全バックアップ — maintenance.rs、app/utils/monthlyBackupSettings.test.ts、lib.rsのmonthly_backup_tests（3件：世代更新・Trash指定・中断再開） — ●
- **バックアップからの復旧 — lib.rs `fusen_restore_backup`、restore_backup_tests（5件：不存在・Markdownなし・件数不一致・原本保持・固定復旧先） — ●**。Trashを含むバックアップの件数不一致による拒否は既存動作の記録であり、正常復旧できる保証とは区別する。
- 削除とごみ箱 — trash_history.rs（6件）、storage.rs、lib.rs — ●
- ごみ箱の90日整理 — trash_cleanup.rs（15件）、e2e/trash-maintenance.spec.ts（独立安全系CI） — ●
- インポート — import.rs（3件）、app/utils/importRefresh.test.ts — ◐
- 保存先（Vault）の変更 — storage.rs — ●
- プライバシー設計（トークン DPAPI 暗号化） — gdrive.rs — ●
- 効果音 — app/utils/soundPreferences.test.ts — ●／sound.rs は0件 — ○（優先度低）
- 多言語 — lib/i18n.test.ts＋各所の .language.test 群 — ●
- デスクトップショートカット — desktop_shortcut.rs（2件） — ◐
- 設定画面 — components/ui/settings-page.tsx（5,014行）に対し文言テスト中心で結合テストは薄い。Rust settings.rs は1件 — ◐
- ログと診断 — logger.rs — ○（0件。低優先）

## 補助ブランチB：発展

- 結晶化 — app/utils/crystalFormat 系テスト群、logic.rs、CrystalCreateModals.test.tsx — ●
- 会員番号 — member_identity.rs（28件）、app/api/members テスト群 — ●
- 機能利用分析（同意制） — AnalyticsConsentDialog.test.tsx、app/utils/analytics 系、scripts — ●
- 開発者ホットライン（お知らせ） — AnnouncementCard.test.tsx 等 — ●
- 開発者とのやりとり掲示板 — app/utils/feedbackConversation 系、workers/discord-replies — ●
- 開発を支援する（寄付・エンドロール） — EndrollMatsuri.test.tsx、app/endroll — ◐
- アップデート確認 — distribution.rs（3件） — ◐（lib.rs `fusen_check_store_update` 自体の検証は薄い）

---

## 横断：CI・テスト基盤

- CI（.github/workflows/test.yml）：PR／main・develop push／merge_groupで全件Vitest・型・Rust・scriptsを検証。日英ガイドは既存frontend、データ保持・ごみ箱安全停止・保管復元・PWA削除維持の4ファイル7件は独立e2e-safetyで実行する。文書のみ以外ではgateが安全系E2E成功を必須とし、失敗・キャンセル・未実行・不明を拒否する。その他のアプリE2EはPC hookの対象。
- 監査時の実行結果（TS のみ実測）：179ファイル中178ファイルパス、983件パス。唯一の失敗は mermaidSecurity.browser.test.ts で、監査環境に Playwright Chromium 未導入という環境要因。Rust は監査環境に toolchain がなく未実行（CI で担保）。
- vitest の include 範囲は app／lib／worker のみで、トップレベル components/ は対象外。

## 追加すべきテスト（重要度順）

1. 【対応済み・PR134】安全系 E2E の段階的 CI 導入（data-safety、trash-maintenance、archive-restore、pwa-delete-persistence）
2. 【対応済み】Web共有 Rust 側スナップショットの通常テスト化（#[ignore] の fixture ローカル化、「競合時に自動上書きしない」ケース追加）
3. 【対応済み】fusen_restore_backup の専用テスト
4. capture.rs の分岐テスト（起動失敗・キャンセル・保存失敗時の後始末）
5. 【対応済み】FloatingFormatBar の単体テスト
6. 【対応済み】fusen_run_monthly_backup抽出処理とfusen_check_store_updateの件数判定を検証追加（OSのStore API自体は対象外）
7. 【対応済み】viewer テストの古い「スタブ／TODO」コメントとダミー試験を整理（既存の本体試験は維持）

---



# 第5部　共有して参照する既存ケース

同じIDは同じケース集合を指す。要求・機能の両方に出ても実行は1回。表の表示名は短縮し、以下に正確なケース名を残す。IDはこの文書の参照用であり、既存のDATA/LOCK/IPHONE等のテストIDやコードの名前は変更しない。実行結果は対象ソース/環境とともに運用記録へ残す。ここは試験定義と確認範囲の整理である。コードへのリンクは整理対象ソース74d9f8c1c8350fd795b5e71c19f09dec19d3d333に固定し、将来の変更時はケース名/範囲を再照合する。

<a id="case-b-new"></a>

### B-NEW：新規メモへの入力

- ファイル：[sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts#L52)
- 実在するケース名：`1.1 新しい付箋をすぐ作れる`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認

<a id="case-c-drop"></a>

### C-DROP：ドロップ保存呼出・拒否

- ファイル：[StickyNote.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.test.tsx#L241)
- 実在するケース名：`Explorerの画像ドロップを保存して表示モードでは本文末尾へ追加する`／`非対応ファイルを含むドロップは全件拒否して理由を表示する`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない

<a id="case-b-image-pwa"></a>

### B-IMAGE-PWA：PWA受信画像の表示

- ファイル：[pc-to-iphone-image.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pc-to-iphone-image.spec.ts#L17)
- 実在するケース名：`[IPHONE-IMG-01] PC送信の先頭画像が一覧と本文で画像表示される`
- 形式：ブラウザーE2E
- 環境：[PWAブラウザー（通信モック）](#env-e-pwa)
- 範囲：ブラウザー上のPWA画面と端末保存。受信データ/Google/Pushは検証用。実iOS・実通信は別確認。受信相当の検証データを使用

<a id="case-b-save"></a>

### B-SAVE：編集終了→保存呼出

- ファイル：[sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts#L327)
- 実在するケース名：`3.1 付箋から離れると自動で保存される`／`3.2 書いた内容がそのまま保存される`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認。保存呼出/内容の確認でありディスク復旧試験ではない

<a id="case-b-recovery"></a>

### B-RECOVERY：PWA再起動・オフライン復元

- ファイル：[pwa-recovery.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-recovery.spec.ts#L4)
- 実在するケース名：`[PWA-RECOVERY-01] PC受信本文はDriveが使えない再起動後も端末保存から開ける`／`[PWA-RECOVERY-02] ローカル画像は再起動後もIndexedDBから一覧と本文へ復元される`
- 形式：ブラウザーE2E
- 環境：[PWAブラウザー（通信モック）](#env-e-pwa)
- 範囲：ブラウザー上のPWA画面と端末保存。受信データ/Google/Pushは検証用。実iOS・実通信は別確認。Drive不通時の再読込とローカル画像の復元

<a id="case-c-file-save"></a>

### C-FILE-SAVE：保存成功/失敗・直列化

- ファイル：[useNoteFile.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useNoteFile.test.tsx#L17)
- 実在するケース名：`returns true only after the actual write succeeds and propagates write failure`／`serializes overlapping saves and uses the renamed path before parent rerender`
- 形式：フック結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。書込先はモック

<a id="case-b-vault"></a>

### B-VAULT：保存先を表示

- ファイル：[sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts#L413)
- 実在するケース名：`3.5 設定画面で付箋の保存先フォルダを確認できる`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認。保存先の表示だけ

<a id="case-b-bold-pc"></a>

### B-BOLD-PC：PCの太字操作

- ファイル：[sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts#L249)
- 実在するケース名：`2.1 文字を選んでボタンを押すだけで太字にできる`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認

<a id="case-b-bold-pwa"></a>

### B-BOLD-PWA：PWA赤文字・再表示

- ファイル：[pwa-bold.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-bold.spec.ts#L4)
- 実在するケース名：`PC受信の太字をPWAの一覧と編集画面で赤く表示し、再表示後も保持する`
- 形式：ブラウザーE2E
- 環境：[PWAブラウザー（通信モック）](#env-e-pwa)
- 範囲：ブラウザー上のPWA画面と端末保存。受信データ/Google/Pushは検証用。実iOS・実通信は別確認

<a id="case-b-outline"></a>

### B-OUTLINE：編集/表示の折畳保持

- ファイル：[editor-outline.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/editor-outline.spec.ts#L4)
- 実在するケース名：`editing and reading share folding without deleting hidden text`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認

<a id="case-b-table"></a>

### B-TABLE：選択文字→表記法

- ファイル：[sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts#L265)
- 実在するケース名：`2.2 行の途中を選択して表ボタンを押すと行全体が表に変換される`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認

<a id="case-b-diagram"></a>

### B-DIAGRAM：選択文字→図の記法

- ファイル：[sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts#L292)
- 実在するケース名：`2.3 行の途中を選択してMermaidボタンを押すと行全体がMermaidブロックに変換される`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認

<a id="case-b-return"></a>

### B-RETURN：PWA返送→PC比較選択

- ファイル：[iphone-roundtrip.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/iphone-roundtrip.spec.ts#L11)
- 実在するケース名：`ブラウザでPC付箋を編集して返送し、PC側で比較して反映を選ぶ`
- 形式：ブラウザーE2E
- 環境：[PWAブラウザー（通信モック）](#env-e-pwa)
- 範囲：PWA編集→返送データ→PC比較画面を接続。DriveとTauriの受渡しはモック

<a id="case-b-video"></a>

### B-VIDEO：PWA送信済み動画の再生

- ファイル：[pwa-video-local.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-video-local.spec.ts#L6)
- 実在するケース名：`iPhoneモックの送信済み付箋から動画を再生して削除する`
- 形式：ブラウザーE2E
- 環境：[PWAブラウザー（通信モック）](#env-e-pwa)
- 範囲：ブラウザー上のPWA画面と端末保存。受信データ/Google/Pushは検証用。実iOS・実通信は別確認。送信済み状態をDBへ設定しておりPC配達は確認していない

<a id="case-b-shared"></a>

### B-SHARED：Web画像取得・草稿保持

- ファイル：[shared-storage.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/shared-storage.spec.ts#L7)
- 実在するケース名：`検証Drive画面で画像の遅延取得・本文だけの保存・下書き復元を確認する`
- 形式：ブラウザーE2E
- 環境：[Web画面（検証Drive）](#env-e-web)
- 範囲：Web共有の実画面。検証用Drive応答で画像取得/本文保存/下書きを確認。実Driveではない

<a id="case-b-restore"></a>

### B-RESTORE：保管の選択・復元操作

- ファイル：[archive-restore.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/archive-restore.spec.ts#L4)
- 実在するケース名：`しまった付箋を保存場所から選んで取り出せる`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認

<a id="case-b-tags"></a>

### B-TAGS：狭い一覧のタグ選択

- ファイル：[quick-launcher.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/quick-launcher.spec.ts#L95)
- 実在するケース名：`compact tags expand within a narrow launcher and keep the chosen long tag visible`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認。狭幅でのタグ展開・選択・保持

<a id="case-c-storage"></a>

### C-STORAGE：隠す操作・失敗時保持

- ファイル：[QuickLauncher.storage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.storage.test.tsx#L28)
- 実在するケース名：`stores the selected favorite without opening its row or hiding the launcher`／`reports a save failure and leaves the favorite accessible`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。保管APIはモック

<a id="case-b-search"></a>

### B-SEARCH：検索からメモを選択

- ファイル：[sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts#L206)
- 実在するケース名：`1.6 キーワードで目的の付箋をすぐ見つけられる`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認

<a id="case-c-pool"></a>

### C-POOL：初回入力・プール解放

- ファイル：[StickyNote.pool.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.pool.test.tsx#L89)
- 実在するケース名：`1 文字目が入った時に onFirstChar コールバックが 1 回だけ呼ばれる`／`pool_slot_released イベントを受信すると usedPoolWindowsRef からラベルが削除される`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない

<a id="case-c-bar"></a>

### C-BAR：選択バーのボタン呼出

- ファイル：[FloatingFormatBar.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/FloatingFormatBar.test.tsx#L47)
- 実在するケース名：`太字ボタンを押すと onBold だけが呼ばれる`／`見出しボタンを押すと onHeading だけが呼ばれる`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。ボタンとコールバックまで

<a id="case-b-edit-key"></a>

### B-EDIT-KEY：編集キー変更・失敗復帰

- ファイル：[hotkey-disable.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/hotkey-disable.spec.ts#L71)
- 実在するケース名：`changing editor hotkey availability keeps undo history and applies immediately`／`an editor hotkey stays enabled when saving the disabled state fails`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認。エディタ内キーの設定・失敗時維持。グローバルOSキー登録は対象外

<a id="case-c-image"></a>

### C-IMAGE：保存済み画像の再表示

- ファイル：[ResizableImage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ResizableImage.test.tsx#L34)
- 実在するケース名：`reports the reloaded crop dimensions at the saved display scale`／`reloads an annotated local image directly from Rust without using the MSIX asset cache`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。保存済み画像の再表示・寸法を確認。描き込みの操作全体は対象外

<a id="case-c-fold"></a>

### C-FOLD：本文展開・状態保存呼出

- ファイル：[StickyNote.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.test.tsx#L394)
- 実在するケース名：`折りたたんだ本文を押して展開すると、再起動用のfolded状態も保存する`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。展開とfolded保存呼出。実窓縮小/OS再起動は対象外

<a id="case-c-check"></a>

### C-CHECK：Webチェック保存・失敗復帰

- ファイル：[page.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/shared/page.test.tsx#L166)
- 実在するケース名：`チェックは直ちに反応し、保存中を示し、通信失敗なら元へ戻す`／`閲覧中のクリックだけでチェックを保存し、本文・色・画像を保つ`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。Web共有のチェック表示/保存呼出/失敗復帰。PC保存先は対象外

<a id="case-b-notice"></a>

### B-NOTICE：PWA通知API・開くID

- ファイル：[lock-notification.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/lock-notification.spec.ts#L85)
- 実在するケース名：`[LOCK-BUG-01] 🔔ボタンクリック時に showNotification が data.id を含む`／`[LOCK-BUG-02] 一覧に戻るたびに locked メモの通知が再発火しない`
- 形式：ブラウザーE2E
- 環境：[PWAブラウザー（通信モック）](#env-e-pwa)
- 範囲：ブラウザー上のPWA画面と端末保存。受信データ/Google/Pushは検証用。実iOS・実通信は別確認。通知APIはモック。実ロック画面での残留は確認しない

<a id="case-c-compare"></a>

### C-COMPARE：PC/iPhone比較・反映選択

- ファイル：[IphoneReturnDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/IphoneReturnDialog.test.tsx#L13)
- 実在するケース名：`PCとiPhoneの内容を並べ、PC側も変わったことを知らせて選択を受ける`／`元の付箋がないときは反映を禁止し、新規保存と保留を選べる`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない

<a id="case-c-file-attach"></a>

### C-FILE-ATTACH：添付送信・失敗時保持

- ファイル：[FileAttachmentSemantics.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/__tests__/FileAttachmentSemantics.test.tsx#L30)
- 実在するケース名：`PDF・画像・動画を同じキューへ送り、本文・タグ・宛先・既存項目を保持する`／`添付アップロード失敗時はキュー更新も送信済み保存もしない`
- 形式：フック結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。送信キュー/失敗時の保持。PCへの実到着は別確認

<a id="case-c-video-send"></a>

### C-VIDEO-SEND：複数動画・容量不足の拒否

- ファイル：[VideoAttachmentSemantics.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/__tests__/VideoAttachmentSemantics.test.tsx#L150)
- 実在するケース名：`複数動画でも本文はそのまま、動画だけ videos 配列に分けて送る`／`動画の端末保存が容量不足ならDriveへ送信しない`
- 形式：フック結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。Drive呼出とローカル保存先はモック

<a id="case-b-order"></a>

### B-ORDER：Webの並びと取得失敗

- ファイル：[shared-launcher-order.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/shared-launcher-order.spec.ts#L5)
- 実在するケース名：`PCの順序だけの変更をWebへ反映し、取得失敗時も前回順と本文を保持する`
- 形式：ブラウザーE2E
- 環境：[Web画面（検証Drive）](#env-e-web)
- 範囲：Web共有の検証データ/通信応答。実PCとDrive間の同期は対象外

<a id="case-c-restore"></a>

### C-RESTORE：保管選択・失敗復帰

- ファイル：[ArchivedNotesRestoreDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ArchivedNotesRestoreDialog.test.tsx#L47)
- 実在するケース名：`keeps card selection when opening a location`／`shows an error and re-enables restore when the restore command fails`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない

<a id="case-c-tag"></a>

### C-TAG：タグ管理・部分失敗保持

- ファイル：[LauncherTagActions.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/LauncherTagActions.test.tsx#L18)
- 実在するケース名：`creates an unused tag and refreshes without assigning it to any note`／`keeps the current filter on partial rename and offers recovery`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。共通タグ管理の操作。PCの実タグフォルダ移動は対象外

<a id="case-c-backup"></a>

### C-BACKUP：バックアップ結果表示

- ファイル：[BackupResultDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/BackupResultDialog.test.tsx#L9)
- 実在するケース名：`shows an unmistakable success result and backup facts`／`keeps the result visible until the user closes it`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。結果画面のみ。バックアップの実内容とは別

<a id="case-b-pc-lang"></a>

### B-PC-LANG：PC設定の英語表示

- ファイル：[settings-english.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/settings-english.spec.ts#L6)
- 実在するケース名：`English settings tabs and expanded cards do not leak Japanese UI text`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認

<a id="case-b-pwa-lang"></a>

### B-PWA-LANG：PWA言語と再起動保持

- ファイル：[pwa-language.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-language.spec.ts#L3)
- 実在するケース名：`[PWA-LANG-01] PWAの言語は日本語から手動で英語へ切り替え、再起動後も保持する`
- 形式：ブラウザーE2E
- 環境：[PWAブラウザー（通信モック）](#env-e-pwa)
- 範囲：ブラウザー上のPWA画面と端末保存。受信データ/Google/Pushは検証用。実iOS・実通信は別確認

<a id="case-c-member"></a>

### C-MEMBER：会員番号・登録待ち表示

- ファイル：[SupportMemberNumber.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/SupportMemberNumber.test.tsx#L12)
- 実在するケース名：`shows the locally assigned number as automatically attached`／`does not show an identifier while registration is pending`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。番号の割当てサービスは別

<a id="case-c-consent"></a>

### C-CONSENT：同意保留・再確認

- ファイル：[AnalyticsConsentDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/AnalyticsConsentDialog.test.tsx#L77)
- 実在するケース名：`拒否中の再確認は短い説明で、表示されたリビジョンを記録する`／`「今は決めない」は同意を変更せず、再案内条件を満たした起動で再表示する`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない

<a id="case-b-letter"></a>

### B-LETTER：お便り画像失敗・入力保持

- ファイル：[developer-conversation.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/developer-conversation.spec.ts#L4)
- 実在するケース名：`画像の準備が失敗しても本文を送信し画像未送信を知らせる`／`本文送信の結果が不明なときは再送せず入力を保持する`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認。サービス応答も検証用

<a id="case-c-card"></a>

### C-CARD：お便り返信操作

- ファイル：[AnnouncementCard.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/AnnouncementCard.test.tsx#L6)
- 実在するケース名：`本文を読める配色で表示し、危険なHTMLやリンクを実行せず返信できる`／`お便りカードの直下で返信を入力して送れる`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。通信先はモック

<a id="case-b-reply"></a>

### B-REPLY：会話順序・新着表示

- ファイル：[developer-conversation.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/developer-conversation.spec.ts#L75)
- 実在するケース名：`お便りと返信を古い順に表示し、開いたときは最新が見える`／`会話を開いている間の新着返信を入力欄の上で知らせる`
- 形式：ブラウザーE2E
- 環境：[PC画面（Tauriモック）](#env-e-pc)
- 範囲：ブラウザー上の実画面。Tauri/PC操作はモック。実OS/実ファイルの成立は別確認。サービス応答も検証用

<a id="case-c-support"></a>

### C-SUPPORT：支援者の表示

- ファイル：[EndrollMatsuri.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/EndrollMatsuri.test.tsx#L23)
- 実在するケース名：`shows the supporter count from props`／`shows supporter amount and comment`
- 形式：部品結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。表示部品のみ。支援手続きは対象外

<a id="case-c-update"></a>

### C-UPDATE：配布方式別の更新確認

- ファイル：[useUpdateCheck.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useUpdateCheck.test.tsx#L29)
- 実在するケース名：`Store版はStore更新だけを確認し通知を閉じられる`／`desktop版は更新を検出し本人の確認操作でインストールする`
- 形式：フック結合
- 環境：[部品・フック（jsdom）](#env-e-ui)
- 範囲：部品を描画・操作。呼出先やOS/通信をモック化している範囲は実動作を保証しない。Store/更新APIと導入はモック

<a id="case-b-video-db"></a>

### B-VIDEO-DB：実DBの動画保持・削除競合

- ファイル：[video-storage.browser.test.mjs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/scripts/video-storage.browser.test.mjs#L9)
- 実在するケース名：`動画実体の保持と別画面削除の永続保護`
- 形式：隔離ブラウザー実DB
- 環境：[隔離ブラウザー実DB](#env-e-db)
- 範囲：実IndexedDBと動画実体を隔離ブラウザーで確認。別画面削除の競合を含む。アプリ画面/実PC配送/実iOSとは別

<a id="case-b-delete-pwa"></a>

### B-DELETE-PWA：PWA削除後の復活防止

- ファイル：[pwa-delete-persistence.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-delete-persistence.spec.ts#L3)
- 実在するケース名：`[DATA-05] PC受信メモを削除後、Driveキューが残っても再表示されない`
- 形式：ブラウザーE2E
- 環境：[PWAブラウザー（通信モック）](#env-e-pwa)
- 範囲：ブラウザー上のPWA画面と端末保存。受信データ/Google/Pushは検証用。実iOS・実通信は別確認



<a id="test-environments"></a>

# 第6部　テスト環境と最後の実機確認

要求/機能/ソースは確認する目的。環境は本物の範囲。両者を別に記録する。同じ自動ケースを要求と機能で共用し、実機も変更した経路の未確認部分だけ補う。既存の実機合格が同じ入力/環境で有効なら引き継ぎ、再依頼しない。

表6-1：自動ケースの環境

|環境ID|本物とモックの境界|
|---|---|
|<span id="env-e-pc">E-PC</span>|PC画面のブラウザーE2E。Tauri/OSはモック|
|<span id="env-e-pwa">E-PWA</span>|PC上ブラウザーのPWA。実IDBを使うケースあり。Drive/Push/PCは検証用|
|<span id="env-e-web">E-WEB</span>|Webブラウザー＋検証Drive応答。実PC/実Driveではない|
|<span id="env-e-ui">E-UI</span>|jsdomの部品/フック。OS/保存/通信はケースごとの依存モック|
|<span id="env-e-rust">E-RUST</span>|Rust単体。純粋処理または一時ファイル。実アプリのOS操作とは別|
|<span id="env-e-node">E-NODE</span>|Nodeの処理試験。模擬サービス/隔離データ|
|<span id="env-e-db">E-DB</span>|隔離ブラウザーの実IndexedDB/動画実体。アプリUIと実PC配送は対象外|

表6-2：必要なときだけ選ぶ最終実機確認（未実行の確認項目であり合格記録ではない）

|実機ID|環境|確認する結果|選ぶ条件・省略条件|
|---|---|---|---|
|<span id="manual-m01">M01</span>|Windows・既存のPC起動方法|起動/新規/キー/フォーカス/再起動復元|OS入口・窓生成・復元の接続を変更した場合。表示文言だけなら不要|
|<span id="manual-m02">M02</span>|Windows・実クリップボード/Explorer/Snipping Tool|撮影/貼付/ドロップ→画像表示、取消・失敗時の保持|OS画像取込経路を変更した場合。矩形計算だけなら単体で可|
|<span id="manual-m03">M03</span>|Windows・隔離した実ファイル＋PCアプリ|保存/改名/Vault切替/保管/復旧後に正しい内容が使える|実ファイルと画面の接続・OS権限を変更した場合。関数内の実ファイル単体で足りる変更はその結果を使う|
|<span id="manual-m04">M04</span>|対象PCのTauri WebView|本文/図/画像を編集・保存して再表示。対象の見た目と入力|WebView固有差・画像プロトコルなどを変更した場合、または受入の未確認部分を埋めるとき。CSS/文言だけは対象表示だけ|
|<span id="manual-m05">M05</span>|Windows・必要なモニター構成|位置/サイズ/最前面/透明度/折りたたみが実窓へ反映|実窓制御を変更した場合。値の定義や計算だけなら対応単体を使う|
|<span id="manual-m06">M06</span>|Windows・実時計/通知/音|指定した付箋が予定時刻に知らせ、重複せず開ける|アラーム発火・OS通知・音の接続を変更した場合。日時計算/言語だけでは不要|
|<span id="manual-m07">M07</span>|PC＋実iPhone・対象PWA版・実Drive/Push|変更した向きの受信/返送、添付再生、再起動/削除/通知を確認|iOS/SW/実配送/添付形式など変更した部分だけ。ブラウザー単体で足りる変更や同じ候補の既存実機合格は引継ぐ|
|<span id="manual-m08">M08</span>|PC＋Webブラウザー・実Google接続|共有を読み編集してPCへ反映し、原本と順序を守る|認証/共有契約/実Drive接続/競合経路を変更した場合。文章の表示だけでは不要|
|<span id="manual-m09">M09</span>|確認用MSIX/配布方式に合うWindows端末|同じ合格exeの署名/導入/版/更新/起動を確認|梱包・導入・更新経路の変更、またはリリース候補で必要な1回。通常修正で毎回作らない|
|<span id="manual-m10">M10</span>|対象サービスの検証環境＋接続元の実端末|実認証/送信先/到着/拒否が想定どおり|実サービスとの接続や設定差を変更した場合だけ。別サービスまで一巡しない|

実機IDは確認環境/チェック群の入口であり、1つのケースではない。対象機能の合格条件・操作・結果を記録し、同じMを参照する全機能を自動で合格にしない。同じ操作と結果が複数ノードを満たす場合だけ共用する。

表6-3：毎回一式にしない選択ルール

|変更|行う確認|
|---|---|
|文書/図/文言だけ|表示・リンクのみ。上記M01〜M10は実行しない|
|単体で完結する処理|該当単体。画面/OS/実通信まで変えなければ実機を足さない|
|接続・環境差に影響する変更|対応する機能ケース＋該当Mの未確認部分|
|同じ候補で既存の実機合格あり|記録のソース/環境/結果を照合して引継ぐ|
|要求/機能に対応ケースがない|不足として残す。別テストや模擬結果を実機合格にしない|



## 付録A：要確認一覧

根拠がコマンド名・部品名の存在までしか追えず、利用者向けの現れ方を確定できなかったもの。断定してツリーの正文には入れていない（基盤の「ログと診断」のみ、存在自体が確かなため注記付きで記載）。

1. **PC のデスクトップへファイルをドラッグ＆ドロップして新規付箋を作る機能** — `file_drop.rs` は iPhone PWA の FileDrop（汎用ファイル添付）受信処理であり、PC 側のドロップ作成を示す明確な根拠は確認できなかった。エディタへの「画像」ドロップ貼り付けは確認済み（要求1-2）。
2. **`fusen_check_storage_health` の画面上の現れ方** — コマンドは存在する。設定画面のどこ（診断・管理者ツール相当）に現れるかは未確認。
3. **`fusen_set_as_alt_tab_window`／`fusen_make_tool_window`** — ウィンドウ管理系コマンド。利用者向け機能なのか内部機構なのか未確認のため、ツリーには入れていない。
4. **「お気に入り」という名称の利用者向け機能** — コード上の `favorite_storage.json` はクイックランチャーから画面を隠した状態の保存先。UIでは「画面から隠す」「画面に表示」を使い、一覧名は「ランチャーで隠した付箋」とする。星マーク式のお気に入り機能とは区別する。

## 付録B：実在しないもの（誤記録の訂正）

- **URLカード表示（link-preview）**：過去の会話で「強調できる」の候補として挙げたが、リポジトリ内に該当する実装・仕様は存在しないことを再確認した（ファイル名・参照ともになし）。このツリーには含めない。

## 付録C：今回の確認範囲（根拠索引）

- 仕様書：docs-v2 の 000_REQUIREMENTS／000_INTENTION_LAYER／001_OVERVIEW／002_PC／003_IPHONE／004_TEST／005_GLOSSARY／006_ARCHITECTURE／007_COMMUNICATION／008_DISTRIBUTION／009_MEMBERSHIP／013_WEB_SHARE／100_PRIVACY／101_TERMS／200_SIRI_SETUP／index
- ユーザーガイド：docs-v2/user-guide の basic／advanced／iphone／install／index／troubleshooting／comic
- Rust：src-tauri/src の全モジュール（lib.rs の `generate_handler!` に登録された Tauri コマンド全件を含む）
- フロントエンド：app/ の画面構成（page／launcher／shared／viewer ほか）と app/components の主要コンポーネント、app/utils/noteAppearance.ts・soundPreferences.ts

---

## 改版履歴

| 日付 | 内容 |
|---|---|
| 2026-11-08 | 初版作成（全量確認に基づく機能ツリー、対象 v6.1.0） |
| 2026-11-09 | テスト充足度監査を第2部として統合。正本として docs-v2 に収録し、位置づけと更新ルールを明記 |
| 2026-11-15 | 3方針→要求→テストを対象選択の起点とし、通常対象試験・候補全体1回の手順へ接続。自動化未移行と監査未完了を区別 |
| 2026-11-17 | 要求16・機能71・ソースの確認を分け、共有ケース参照とテスト環境/条件付き実機確認を追加。試験の新規実行なし。 |

<style>
.feature-traceability-page .vp-doc table { display: table; table-layout: fixed; width: 100%; }
.feature-traceability-page .vp-doc table th:first-child, .feature-traceability-page .vp-doc table td:first-child { width: 26% !important; min-width: 0 !important; max-width: none !important; white-space: normal !important; padding: 8px !important; text-align: left !important; }
.feature-traceability-page .vp-doc th, .feature-traceability-page .vp-doc td { overflow-wrap: anywhere; white-space: normal; }
</style>
