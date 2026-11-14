# 俺の付箋 機能ツリー（マスターツリー）

## 位置づけと更新ルール

> **この文書はマスター（正本）である。** 「俺の付箋」の全機能を、コンセプト→要求→実現案→実画面→モジュール→テストの1本のツリーに整理したもの。設計書（docs-v2）・テスト・LP・プログラムは、すべてこのツリーを元にする。

### 更新ルール

1. **機能の追加・変更・削除を行う PR では、同じ PR でこのファイルも更新する。** ツリーと実装・仕様・テストが食い違ったままマージしない。レビューでは「ツリーが更新されているか」を確認項目とする。
2. **新しい実現案は、まずツリーに置いてから実装する。** 置く場所は「どのコンセプトの、どの要求を満たすか」で決める。要求の有効順（中核に近い順）に従って並べる。
3. **3コンセプト（すぐ書ける／強調できる／そこにある）に繋がらない機能は追加しない。** これが機能追加の判断基準である。3つのどれにも属さないものは、3つすべてを下から支える「基盤」、または日常利用の一巡先にある「発展」の補助ブランチに置けるかを検討し、どちらにも置けないものは追加しない（無駄な機能を増やさない）。
4. **根拠なき項目を書かない。** 各実現案には仕様書・要求ID・コードの根拠を併記する。実在しない機能、ファイル名からの連想だけの項目は入れない（付録B参照）。確定できないものは「要確認」として付録Aに分離する。
5. テスト対応表（第2部）の評価が変わったら（テスト追加・CI 化など）、同じ PR で評価も更新する。

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

## ツリーの階層

| 階層 | 軸 | 内容 |
|---|---|---|
| 1 | 製品 | 俺の付箋 |
| 2 | コンセプト軸 | すぐ書ける／強調できる／そこにある |
| 3 | 要求軸 | ユーザーがどうありたいか（「〜したい／〜してほしい」） |
| 4 | 実現案軸 | その要求を満たす具体機能・仕組み |
| 5 | 実画面軸 | どの画面・UIで現れるか |
| 6 | 実装・テスト軸 | 実装モジュールとテストの対応・充足度（第2部） |

- 要求は各コンセプトの中で、中核に近いものから順に並べた（有効順の考え方）。
- 3コンセプトに収まらないものは無理に押し込まず、**基盤**（保存・バックアップ・設定などの土台）と **発展**（結晶化・会員・ホットラインなど）の補助ブランチに置いた。各ブランチの冒頭にその旨を注記する。

---

# 第1部　機能ツリー（コンセプト→要求→実現案→実画面）

# 俺の付箋

## コンセプト1：すぐ書ける


### 要求1-1　思いついた瞬間に、書ける状態になっていてほしい

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

- **画面キャプチャ**：ツールバーのカメラボタンで OS の Snipping Tool を起動し、撮った画像を `assets/` に保存して本文へ挿入〔要求：SPEC-ED-02-01／仕様：002_PC §6.2／コード：capture.rs `fusen_capture_screen`〕
  - 実画面：付箋の編集モード（カメラボタン）
- **クリップボード画像の貼り付け**：クリップボード内の画像を `assets/` へ自動保存し、Markdownリンクとして挿入〔要求：SPEC-ED-02-02／コード：clipboard.rs `fusen_get_image_from_clipboard`〕
  - 実画面：付箋エディタ
- **エディタへの画像ドロップ貼り付け**：ドロップした画像データを保存して本文へ取り込む〔コード：clipboard.rs `fusen_save_dropped_image_data`〕
  - 実画面：付箋エディタ
### 要求1-3　書いたら、保存を考えたくない（保存忘れで消えるのが怖い）

- **変更の自動保存**：テキスト変更後に自動でファイルへ書き込み、フォーカスが外れた時点でも即保存する〔要求：§3.4 SPEC-DT-04-01/02〕
  - 実画面：付箋ウィンドウ（保存ボタンなしで残る）
- **明示保存 Ctrl+S**：基本は自動保存のため、安心感のために用意された明示保存〔要求：SPEC-NF-01-03〕
  - 実画面：付箋ウィンドウ
### 要求1-4　手が離せないときは、声で送りたい

- **Siri から PC に付箋を送る**（実験的・先行公開）：iOSショートカットが Vercel API 経由で Drive の中継ファイルを更新し、PC が30秒ポーリングで受け取って付箋として表示する（約30秒以内）〔仕様：200_SIRI_SETUP／コード：app/api/siri-send〕
  - 実画面：PC の付箋ウィンドウ（iPhone 側の PWA 一覧には残らない）
### 要求1-5　ファイル名を考えたくない

- **ファイル名の自動生成**：作成日時から `NNNN_YYYY-MM-DD_Context.md` 形式で自動生成し、入力を求めない〔要求：SPEC-LF-03-03〕
  - 実画面：付箋ファイル（Vault 内）
- **ファイル名の本文連動**：本文1行目をファイル名のコンテキスト部分に使い、1行目が変わると0.8秒のデバウンス後に自動リネーム。使用できない文字は自動置換〔要求：§3.3〕
  - 実画面：付箋ファイル（Vault 内）
### 要求1-6　保存場所は自分で決めたい

- **初回セットアップで保存先（Vault）を選択**：初回起動時にフォルダ選択ダイアログを出し、選んだ場所をベースフォルダとして保存する〔要求：§2.2 REQ_LF_02〕
  - 実画面：初回セットアップ画面

---

## コンセプト2：強調できる


### 要求2-1　大事な一文を、ひと目で目立たせたい

- **太字の朱表示**：`**太字**` は赤色・太字で表示する（重要事項の強調）〔要求：SPEC-ED-01-01〕
  - 実画面：付箋の表示モード
- **フローティングフォーマットバー**：テキスト選択時に選択範囲の真上へ B／H1／箇条書き／チェックボックスの4ボタンが浮き上がる〔仕様：002_PC §6.2〕
  - 実画面：付箋の編集モード（選択時）
- **編集用ホットキー**：太字 Ctrl+B／見出し Ctrl+H／箇条書き Ctrl+L／チェックボックス Ctrl+Shift+C（各キーとも変更・無効化が可能）〔仕様：002_PC §10.1〕
  - 実画面：付箋の編集モード／設定画面「ホットキー」タブ
- **PWAの強調表示**：実際の一覧と編集本文で赤い太字を表示し、保存後も強調記号を保持〔仕様：003_IPHONE §1／コード：NoteListStep.tsx・editor-helpers.ts・inline-bold.ts〕

### 要求2-2　画像に、そのまま書き込みたい

- **画像への描き込み**：ペン・蛍光ペン・矢印・四角・吹き出しの道具、色・太さ・濃さの調整、元に戻す／やり直す（保存までは道具をまたいで履歴保持）〔仕様：002_PC §6.2／ガイド：advanced／コード：ImageAnnotationModal.tsx〕
  - 実画面：画像描き込み画面（表示モードの画像左上「✏️ 描き込む」から開く）
- **トリミング**：画像上で残す矩形範囲をドラッグ選択し、保存時に元画像と描き込みを合成してから切り取る。失敗・キャンセルでは元画像を変更しない〔仕様：002_PC §6.2／コード：clipboard.rs `fusen_save_annotated_image`〕
  - 実画面：画像描き込み画面のトリミング
- **画像の表示サイズ変更**：エディタ上の画像をドラッグで表示倍率変更〔要求：SPEC-ED-02-03／コード：ResizableImage.tsx〕
  - 実画面：付箋エディタ内の画像
### 要求2-3　畳んでも、項目（見出し）は見えていてほしい

- **付箋全体の折りたたみ（△／▽）**：タイトルバーの高さへ縮小し、本文の先頭（画像の場合は `[画像]` と続く文字列）を1行表示する。折りたたみ状態は frontmatter に保存され、再起動後も維持される。編集中でも畳める（6.1.0）〔仕様：002_PC §6.2／ガイド：basic〕
  - 実画面：付箋ウィンドウ右上の △／▽
- **本文の一部分の折りたたみ**：見出し単位、または Tab で字下げした親子行単位で配下を隠す。表示中と編集中で開閉状態を共有する（6.1.0以降）〔ガイド：advanced〕
  - 実画面：付箋本文の見出し・親行の左にある ⌄／›
### 要求2-4　構造を整理して見せたい

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

- **最前面に固定（ピン留め）**：画びょうボタンで他のアプリより手前に表示し、赤い画びょうが固定中の目印になる。固定の ON/OFF でピンの形と効果音が変わる〔ガイド：basic／仕様：002_PC §6.2〕
  - 実画面：付箋ウィンドウ右上の画びょうボタン
- **色分け（背景色5色）**：黄・ピンク・青・白・グレーから選ぶ〔コード：app/utils/noteAppearance.ts `NOTE_COLORS`／仕様：002_PC §6.3〕
  - 実画面：付箋の右クリックメニュー「色変更」
- **透明度3段階**：不透明／うすめ／かなり透ける。値は frontmatter に保存され即座に反映される〔仕様：002_PC §6.3／コード：lib.rs `fusen_set_opacity`〕
  - 実画面：付箋の右クリックメニュー「透明度」
- **文字サイズ**：付箋ごとに 小12／中16／大20／特大28 の4段階＋グローバル設定へ戻す〔仕様：002_PC §6.3／コード：noteAppearance.ts `NOTE_FONT_SIZES`〕
  - 実画面：付箋の右クリックメニュー「文字サイズ」
### 要求2-6　時刻になったら知らせてほしい

- **アラーム**：付箋ごとに日時を設定（「5分後」〜「1週間後」のクイックボタン＋日時直接指定）。時刻になると付箋が点滅し効果音が鳴って一時的に最前面へ表示され〔仕様：002_PC §6.3／コード：AlarmDialog.tsx〕、OS のデスクトップ通知からも該当付箋を前面表示できる〔要求：§2.5 REQ_LF_05〕。発火は1回のみ（繰り返しなし）
  - 実画面：付箋フッターのアラームボタン／アラーム設定ダイアログ

---

## コンセプト3：そこにある


### 要求3-1　PCを開いたら、いつもの場所にいてほしい

- **起動時の状態復元**：起動時に Vault をスキャンし、位置・サイズ・色・タグ・最前面・折りたたみ状態を frontmatter から復元する。復元はキューで順次処理し、二重起動は防止する〔要求：REQ_LF_01・REQ_DT_02／仕様：002_PC §7.1.3〕
  - 実画面：デスクトップ上の付箋ウィンドウ群
- **マルチモニター救済**：環境変化時に全付箋の座標を評価し、すべてのモニターの領域外にある付箋をメインモニターの安全な領域へ自動再配置する〔要求：§8.3 SPEC-NF-02-01/02〕
  - 実画面：デスクトップ上の付箋ウィンドウ
### 要求3-2　家の外でも見たい・続きをしたい

- **iPhone に送る（PC → iPhone）**：付箋の内容を自分の Google Drive 経由で送り、Web Push で iPhone のロック画面へ通知する。受信したメモは端末内に保存され、PWA でオフラインでも読める。登録済みの複数端末へ同報送信する〔要求：§9.1 REQ_IP_01／仕様：003_IPHONE §4.1・§6.1／コード：lib.rs `fusen_send_to_iphone`・webpush.rs・gdrive.rs〕
  - 実画面：付箋の右クリック「iPhoneに送る」／iPhone PWA のメモ一覧画面
- **通知常駐（ロックだぜ）**：重要なメモは 🔔 を ON にすると、タップして確認した後も通知が再表示され、意図的に消すまでロック画面に残り続ける〔要求：§9.3・§9.4／仕様：003_IPHONE §6.2〕
  - 実画面：iPhone のロック画面／PWA メモ一覧の 🔔 ボタン
- **iPhone から PC へ送る**：PWA の書く画面からテキスト・画像・動画（mp4/mov、PC 側では `assets/video/` に保存）・汎用ファイル添付を送れる。PC は30秒ポーリングで受け取り、受信時は確認ダイアログを出して取り込み／取り消しができる。複数の PC を同じ Drive に繋いでいる場合は送信先 PC を選べる〔要求：§9.2 REQ_IP_02／仕様：003_IPHONE §6.3・§6.4・§6.4.1／コード：IphoneReturnDialog.tsx・lib.rs `fusen_apply_iphone_return`〕
  - 実画面：iPhone PWA の write 画面／PC の受信確認ダイアログ
- **Web共有**：クイックランチャー登録付箋を、自分の Google Drive 経由でブラウザから閲覧・本文編集・チェック切替・新規作成できる。同期は Windows 側の「Webと同期」を押したときだけの手動式で、競合・欠落・未確認の変更を自動で上書き・削除しない。共有の停止・再開、QRコードで共有画面を開く操作もある〔仕様：013_WEB_SHARE §2・§4／コード：lib.rs `fusen_sync_quick_launcher_to_web`・web_share_snapshot.rs ほか／app/shared〕
  - PCランチャーの手動順を同期しWebへ適用。複数PCは表示順のPCを選択、順序だけの異常では本文閲覧を維持〔仕様：013_WEB_SHARE §4.0〕
  - 実画面：クイックランチャー「Webと同期」／ブラウザの共有画面 `/shared`
  - ※ 013 §6 の画像予約と自動回収は実装済み。参照中・予約中の画像を除外し、条件付き更新に失敗した場合は削除しない。旧キャッシュ整理・端末メモリの実測は対象外とする

### 要求3-3　増えても、デスクトップが散らからないでほしい

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
  - 実画面：アップデート確認ダイアログ

---

# 第2部　実装・テスト対応表（実現案→モジュール→テスト）

> 第1部の各実現案について、実装モジュールとテストの対応・充足度を示す。第6階層（実装・テスト軸）。
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

### 要求1-4 声で送りたい
- Siri → PC 付箋 — app/api/siri-send/route.test.ts — ◐（API 側のみ。PC のポーリング受信→付箋化の結合は薄い。実験的機能のため優先度低）

### 要求1-5 ファイル名を考えたくない
- ファイル名自動生成・本文連動リネーム — logic.rs（sanitize／parse_filename／select_context_line 群）、storage.rs（rename 系） — ●

### 要求1-6 保存場所は自分で決めたい
- 初回セットアップで Vault 選択 — storage.rs（validate_storage_path／check_storage_health）、lib/settings-store.test.ts — ◐（初回セットアップ画面自体の E2E なし）

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
