# 引き継ぎ（HANDOFF）— 新チャットはまずこれを読む

更新日: 2026-06-24（部品2-B完了・未コミット。test 129 pass / build OK）

チャットが長くなったら、このファイルを最新化 → 新チャットで「ore-no-fusen-arrange/.planning/HANDOFF.md を読んで続けて」で再開。

## ★切替運用（確定）
- コンテキスト使用量(%)＝Claude Code 入力欄右下の円。**Claude は数値を取得できない**（Codex 調査済み: `/context` 相当の機械取得手段なし・`.claude` 配下は権限で読めず）。
- よって **ユーザーが円を見て「切替」と言う or 区切りで Claude が HANDOFF 更新→ユーザーが新チャットを開く**運用。チャット切替操作は人間（Claude は不可）。
- 残量ウィジェット＝`C:\Users\uck\usage-widget\usage-widget.ps1`（token_status.json を生成。context_percent は取得不可で未対応）。

---

## 0. まず読むもの（順番）
1. このファイル（今の状態・次の一手）
2. `MEMORY.md` と `memory/`（恒久ルール。特に下記）
3. `.planning/arrange-by-tag-plan.md`（整列の確定仕様・進捗 §5.5）

## 1. 最重要の運用ルール（メモリ参照）
- **Claude=指示・設計判断・レビューのみ。実装/調査/テスト/Git は Codex に任せる**。重いログ・全文・diff を Claude 文脈に入れない。Codex からは要約だけ受け取る → `memory/feedback_claude_judge_codex_executes.md`
- **Codex 依頼前に必ず残量確認**: `C:\Users\uck\AppData\Local\ore-no-fusen\token_status.json` を読み、codex 5時間枠が低い(<20%)なら依頼しない → `memory/feedback_codex_token_safety.md`
- 1依頼=1部品・緑なら即コミット・大ファイル全面書き換え禁止・cargo fmt 全体禁止（rustfmt 単体のみ）
- 失敗1回で終了（N=1）/ コミットは「コミットして」指示時のみ / わからなければ聞く

## 2. worktree 構成（並行開発）
- `ore-no-fusen/` = develop（基本・固定）
- `ore-no-fusen-arrange/` = **feature/arrange-clean（整列・Claude担当・ここで作業）**
- `ore-no-fusen-endroll/` = feature/endroll（ユーザー担当）
- worktree 初回は `.env.local` コピー＋`npm install`＋dev一度起動(.next温め)が必要 → `memory/project_worktree_layout.md`

## 3. 今やっていること = 整列機能（★新ルール3.0に全面作り直し中）
仕様・進捗の正は `.planning/arrange-by-tag-plan.md` の **3.0**（旧 3.1〜は参考）。視覚仕様の正は `.planning/arrange-mock.html`（ブラウザで開く。基本/上げ目多発/その他大量の3パターン）。

**★本質**: 本番にレーンの線も見出しも無い。**タグの違いは付箋の「高さ(Y)」だけ**で表す＝別タグを同じ高さに置くと混ざって見える。タグごとに必ず高さを変えるのが最優先、次が文字切れ対策の上げ目（トレードオフ）。

要点（3.0）:
- カンバン本体=**タグありの黄赤青のみ**。行=タグ。**レーン順=黄枚数→赤枚数→青枚数の辞書順で多い方が上**（処理フロー: 黄=思いつき→赤=TODO→青=済み→保管庫。黄を処理するゲーム）。
- 列=黄→赤→青の固定3列（全行で揃える・列幅は詰める）。同色=右下階段（左上=タイトルが見える・stepY≥50）。
- **白黒5色外＋タグなし** は色問わず「タグなし置き場(バケツ)」→ 1行目の右端の右に右下階段。
- **上げ目**: 2行目以降で直前レーンと色が1つも被らない行だけ、上に詰める。到達上限=一つ上レーンの黄色最下付箋 y+h/2。色が被る行は LANE_GAP のまま（上げない）。
- 確定値: STEP_X=18 / STEP_Y_MIN=50 / COL_GAP=16 / **LANE_GAP=48** / BUCKET_GAP=40。
- 行の単調性必須（各レーン最上端topが直前より必ず下）。全付箋を主ディスプレイ集約・サイズ不変。

### 実装済み
- （旧コミット済み）arrange.rs 計算 / 2-a コマンド本体 / トレイ「タグで整列」/ 仮ショートカット Ctrl+Shift+L 等。※旧カンバン配置ロジックは 3.0 で作り直し対象。
- （コミット済み）部品1 classify（振り分け）＋ 部品2-A レーン分類・レーン順ソート・バケツ振り分け＋テスト。cargo test 123 pass。**まだ既存 calculate_arrange_by_tag_positions には未接続**（純粋ロジック追加のみ）。
- （★未コミット）部品2-B 配置計算3.0をモックJSから Rust 移植。arrange.rs に新関数群を追加（既存本体 calculate_arrange_by_tag_positions は未接続のまま）。cargo test 129 pass / cargo build OK。**コミット待ち**。
  - 新関数: `calculate_arrange_rule3_positions`(入口) / `layout_rule3`(全体) / `stair_rule3_metrics` / `compute_rule3_column_widths` / `compute_rule3_column_x` / `build_rule3_lane_layout` / 上げ目3関数(`lowest_non_colliding_rule3_y`,`previous_rule3_lane_lift_floor`,`constrained_rule3_lift_y`) / 不変条件チェック3関数(`check_rule3_no_cross_tag_collision`,`check_rule3_lane_top_monotonic`,`check_rule3_lane_y_bounds`)。
  - 新関数はモック確定値(COL_GAP=16/LANE_GAP=48 等)を新 const で使用。既存 const(COLUMN_GAP=20/LANE_GAP=80=旧本体用)は残置。
  - 既存 classify / group_notes_by_kanban_lane / lane_color_counts を再利用（一致確認済み）。
  - ★2-Cで効くズレ(Codex報告・未修正): モックJSはバケツを「タグなし先・タグあり余り後」にソートするが、既存 group_notes_by_kanban_lane は入力順 push。**2-C接続時にバケツ順を揃えるか判断要**。

### 残り
- **部品2-C**: 新 `calculate_arrange_rule3_positions` を `calculate_arrange_by_tag_positions` に接続（旧配置ロジック置換）＋既存テストを 3.0 仕様に更新/削除。**上記バケツ順ズレをここで対応判断**（タグなし先頭にするか）。新関数の基準は `work_area.x/y + START_X/Y`。
- **2-c undo**（整列前に戻す）← 最後の機能。未着手。
- レーンの題（◆タグ名）= 将来課題（出さない）。

## 4. 次の一手
1. **部品2-B のコミット**（ユーザーが「コミットして」と言ったら）。緑確認済み(test 129/build OK)。
2. Codex 残量確認（`token_status.json`・<20%なら依頼しない）
3. 部品2-C を Codex に依頼: 新 `calculate_arrange_rule3_positions` を `calculate_arrange_by_tag_positions` に接続。既存テストを 3.0 仕様に更新/削除。バケツ順ズレ(タグなし先頭)をここで対応判断 → 実機確認（Ctrl+Shift+L）
4. 2-c undo（整列前に戻す）
5. 整列が完成したら feature/arrange-clean を develop にマージ（ユーザー判断）

## 5. 検証の出し方（新ルール）
Claude は自分で cargo/git/grep しない。Codex に「ビルド・テストして結果を要約で」と依頼し、結論・変更ファイル・テスト結果・未解決リスクだけ受け取る。
