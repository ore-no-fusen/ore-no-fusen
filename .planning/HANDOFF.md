# 引き継ぎ（HANDOFF）— 新チャットはまずこれを読む

更新日: 2026-06-24（整列3.0=レーン+重ね方(z-order)完成。**undo 実装完了・build/test緑・コミット前・実機確認待ち**。確認OK後にコミット）

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

### 実装済み（すべてコミット済み）
- （旧コミット済み）arrange.rs 計算 / 2-a コマンド本体 / トレイ「タグで整列」/ 仮ショートカット Ctrl+Shift+L 等。
- 部品1 classify（振り分け）＋ 部品2-A レーン分類・レーン順ソート・バケツ振り分け＋テスト（コミット 40c9d1c）。
- 部品2-B 配置計算3.0をモックJSから Rust 移植（新関数群追加・本体未接続）（コミット 4ee5d68・test 129）。
  - 新関数: `calculate_arrange_rule3_positions`(入口) / `layout_rule3`(全体) / `stair_rule3_metrics` / `compute_rule3_column_widths` / `compute_rule3_column_x` / `build_rule3_lane_layout` / 上げ目3関数 / 不変条件チェック3関数。モック確定値(COL_GAP=16/LANE_GAP=48)使用。
- **部品2-C ＋ 重ね方(z-order) 修正（コミット bce165d・test 120 / build OK・実機確認済み）**:
  - 2-C: 本体 `calculate_arrange_by_tag_positions` を新 rule3 へ接続（thin wrapper・公開名/シグネチャ維持）。旧配置ロジック(圧縮レーン lane_slot 等)＋旧const＋旧ヘルパを削除。lib.rs/tray.rs 無変更。
  - バケツ順: タグなし先・タグあり余り(白黒5色外)後にソート済み（モック準拠）。
  - **z-order(重ね方の核心)**: lib.rs `run_fusen_arrange_by_tag` の配置適用に、整列後 Windows API `SetWindowPos`(HWND_TOP) で付箋を **positions 順に前面化**する処理を追加。`set_position` だけでは重なり順が変わらず、高い付箋が下の付箋のタイトルを覆っていた不具合を修正。実機 Ctrl+Shift+L で「同色階段が奥→手前・左上にタイトルが見える」を確認済み。

### 残り
- **2-c undo（整列前に戻す）← 実装完了・build/test緑・コミット前・実機確認のみ残**。
  - **仕様（確定）**: トレイ項目「整列を元に戻す (Undo Arrange)」のみ（ショートカットなし）／全付箋を戻す（FM含む）／直前1回ぶんのみ（再整列で上書き）。
  - **実装（Codex・コミット前）**: state.rs に `AppState.arrange_undo: Option<Vec<(String,f64,f64)>>` 追加。lib.rs `run_fusen_arrange_by_tag` 内で移動前に全付箋の直前論理座標を snapshot→positions計算前に保存。`run_fusen_arrange_undo`(+command `fusen_arrange_undo`+handler登録) で take()→`set_position`＋`update_note_window_position`(frontmatter) で対称復元。tray.rs にメニュー項目＋"arrange_undo"ハンドラ追加。z-order復元は不要(仕様)。`cargo build`OK / `npm test` 175 passed。rustfmt未実行。
  - **残**: 実機 Ctrl+Shift+L で整列→トレイ「整列を元に戻す」で元位置に戻るか（FM付箋含む）をユーザーが確認。OKならコミット指示待ち。
- レーンの題（◆タグ名）= 将来課題（出さない）。

## 4. 次の一手
1. **undo を実機確認**（ユーザー）: arrange ワークツリーで `npm run tauri dev`→整列→トレイ「整列を元に戻す」で元位置(FM含む)に戻るか。
2. OK なら **コミット**（ユーザー指示後）。変更=state.rs / lib.rs / tray.rs（+HANDOFF.md）。NG なら原因調査→Codex で修正。
3. 整列完成（undo含む）→ feature/arrange-clean を develop にマージ（ユーザー判断）。**次リリース織り込み希望**。

## 5. 検証の出し方（新ルール）
Claude は自分で cargo/git/grep しない。Codex に「ビルド・テストして結果を要約で」と依頼し、結論・変更ファイル・テスト結果・未解決リスクだけ受け取る。
