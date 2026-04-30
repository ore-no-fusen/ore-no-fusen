---
phase: 19-300ms-pool-ctrl-n
plan: 05
type: execute
wave: 5
depends_on: ["19-04"]
files_modified:
  - .planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/perf-evidence.jsonl
  - .planning/REQUIREMENTS.md
autonomous: false
requirements: [PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-07]
must_haves:
  truths:
    - "5 サンプル中央値で T2_READY ≤ 300ms が達成されている（perf-evidence.jsonl で証明）"
    - "1.5 秒 3 回連打で 3 付箋全部 300ms 以内、4 回目はトースト + 通常生成"
    - "17 付箋仕込み済み環境でも 300ms 達成"
    - "1 文字も入れずに付箋 close → .md ファイルがフォルダに残らない"
    - "Spy++ で pool-window-* に WS_EX_LAYERED フラグ確認"
    - "メモ帳 focus 中に Ctrl+N で付箋手前表示（5/5 成功）"
  artifacts:
    - path: ".planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/perf-evidence.jsonl"
      provides: "5 サンプル分の T0/T1/T2_READY 計測結果（証拠）"
    - path: ".planning/REQUIREMENTS.md"
      provides: "PERF-01〜PERF-08 を v5.0 (or v6.0) Requirements に追記"
  key_links:
    - from: "perf-evidence.jsonl"
      to: "scripts/perf-check.mjs"
      via: "PERF_LOG 環境変数で読み込み"
      pattern: "PERF_LOG=.*perf-evidence"
---

<objective>
Phase 19 の成功基準を実機で測定・確認するチェックポイント Plan。Wave 1〜4 の実装が揃った後、5 サンプル中央値 300ms 達成と手動検証 4 項目（Spy++ / グローバル Ctrl+N / 連打耐性 / lazy ファイル無し）を行う。最後に REQUIREMENTS.md に PERF-XX を正式追記する。

Purpose: Phase Success Criteria 6 項目の証跡を残す。perf-evidence.jsonl をリポジトリにコミットして再現可能にする。300ms 未達なら 3 回まで自動修正ループ、3 回失敗したらユーザにエスカレート（CONTEXT.md「実装プロセス」）。

Output: perf-evidence.jsonl + REQUIREMENTS.md 更新 + checkpoint で人間検証完了。
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-CONTEXT.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-VALIDATION.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-01-SUMMARY.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-02-SUMMARY.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-03-SUMMARY.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-04-SUMMARY.md
@docs/manual-verify-phase19.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: REQUIREMENTS.md に PERF-01〜PERF-08 を追記</name>
  <files>.planning/REQUIREMENTS.md</files>
  <action>
    1. `.planning/REQUIREMENTS.md` を読み、新セクション「### 起動性能 (PERF)」を v5.0 Requirements 内（または v6.0 セクション新設）に追加。マイルストーン整合性は STATE.md Blockers で「v5.0 を品質安定化全般に再定義 or v6.0 切り出し」として保留中だが、追記はこの Plan の責務。整合性は別途 STATE.md で扱う。
    2. 追記内容:
       ```markdown
       ### 起動性能 (PERF) — Phase 19

       - [ ] **PERF-01**: Ctrl+N 押下から 1 文字目入力可能（T2_READY）まで 5 回中央値で 300ms 以内
       - [ ] **PERF-02**: 1.5 秒間に 3 回 Ctrl+N で 3 付箋全部 300ms 以内、4 回目はフォールバック + トースト
       - [ ] **PERF-03**: 既存 17 付箋同時起動下でも PERF-01 達成
       - [ ] **PERF-04**: 1 文字も入力されないまま閉じた場合、.md ファイルがフォルダに残らない
       - [ ] **PERF-05**: Pool 窓は WS_EX_LAYERED + α=0 状態で事前完全準備（描画完了・CodeMirror マウント済）
       - [ ] **PERF-06**: Ctrl+N 時は Win32 レベルで α=0→255 と SetWindowPos 位置移動のみ（webview 新規作成しない）
       - [ ] **PERF-07**: グローバル Ctrl+N で他アプリ focus 時も付箋作成可能
       - [ ] **PERF-08**: settings.json でショートカットをカスタマイズ可能
       ```
    3. Traceability テーブルにも 8 行追加 (Phase 19 列で全部 Pending → 後で完了マーク)
    4. Coverage 行を更新（v5.0 requirements: 12 → 20、Mapped: 12 → 20）
    5. **避けるべきこと**: 既存要件（CLEAN/FIX/ARCH/LOCK）の変更や削除
  </action>
  <verify>
    <automated>grep -c "PERF-0" .planning/REQUIREMENTS.md | awk '{ if ($1 >= 8) print "OK"; else { print "FAIL: only " $1 " PERF entries"; exit 1 } }'</automated>
  </verify>
  <done>
    REQUIREMENTS.md に PERF-01〜PERF-08 が正式記載され、Traceability テーブルに反映されている。
  </done>
</task>

<task type="auto">
  <name>Task 2: 5 サンプル計測 + perf-evidence.jsonl 生成 + perf:check で 300ms 判定</name>
  <files>.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/perf-evidence.jsonl</files>
  <action>
    1. `npm run tauri build` で実機ビルドを生成（または `npm run tauri dev` の release-like モード）
    2. アプリ起動 → 17 付箋を仕込む（手動 or e2e/fixtures/seed-17-notes.ts を参考）
    3. Pool が 3 個揃うのを 10 秒待つ（タスクマネージャで `pool-window-*` 3 プロセス確認）
    4. **5 サンプル取得**:
       - Ctrl+N → 1 文字打つ → 閉じる、を 5 回繰り返す（毎回 5 秒以上空ける、補充させる）
       - `%LOCALAPPDATA%\ore-no-fusen\perf.jsonl` に T0 / T1_RUST_ENTER / T2_READY が 5 セット書かれる
    5. perf.jsonl を以下の完全パスにコピー:
       ```
       cp "%LOCALAPPDATA%\ore-no-fusen\perf.jsonl" ".planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/perf-evidence.jsonl"
       ```
    6. `set PERF_LOG=.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/perf-evidence.jsonl && npm run perf:check`（Windows）または対応する bash 形式 → exit 0 + median ≤ 300ms 確認
    7. **300ms 未達の場合**:
       - 1 回目: perf-evidence.jsonl の T0→T1_RUST_ENTER と T1→T2_READY を分析。どちら側がボトルネックか確認
       - JS 側遅延なら StickyNote.tsx の rAF / 余分な setState / 重い import を検査
       - Rust 側遅延なら fusen_show_at_position の中身を再確認（log_event 自体が μs 単位なので原因は他）
       - 修正してもう 1 回計測（最大 3 回ループ）
       - 3 回失敗したらユーザにエスカレート（CONTEXT「実装プロセス」明記）
    8. **避けるべきこと**:
       - 1 サンプルだけで合格判断（中央値の意味が無い）
       - Pool 補充前の最初の Ctrl+N で計測（CONTEXT「起動直後の単発 Ctrl+N は 300ms 超過許容」）
       - 開発ビルド（`tauri dev`）の値だけで合格判断（リリースビルドが本来の性能）
  </action>
  <verify>
    <automated>test -f ".planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/perf-evidence.jsonl" && PERF_LOG=".planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/perf-evidence.jsonl" node scripts/perf-check.mjs</automated>
  </verify>
  <done>
    perf-evidence.jsonl がリポジトリに添付され、`npm run perf:check` で exit 0（中央値 ≤ 300ms）。
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: 手動検証チェックポイント（PERF-05/PERF-07/連打耐性/lazy ファイル）</name>
  <what-built>
    Wave 1〜4 で Pool 透明→不透明アーキテクチャが完成。Win32 LAYERED window + tauri-plugin-global-shortcut + JSON Lines 計測ログ + PoolWaitToast まで全部入った状態。
  </what-built>
  <how-to-verify>
    `docs/manual-verify-phase19.md` の手順に従って以下 4 項目を実機確認してください:

    **1. PERF-05: Pool 窓 WS_EX_LAYERED 確認（Spy++ 必須）**
       - アプリ起動後 10 秒待機（pool=3 揃う）
       - Spy++ 起動 → Find Window で `Quick Memo` タイトル or `pool-window-*` クラスを探す
       - 選択 → Properties → Styles タブ → Extended Styles に `WS_EX_LAYERED (0x80000)` が立っていること
       - 同じく座標が画面外（X/Y が大きな負値、例: -10000 周辺）

    **2. PERF-07: グローバル Ctrl+N（メモ帳テスト）**
       - メモ帳起動 → メモ帳をクリックでフォーカス
       - Ctrl+N → 付箋が手前に表示される
       - 5 回連続テスト → **5/5 成功** 必要
       - 失敗が 1 回でもあれば NG（Foreground Lock 抜けロジック要見直し）

    **3. 連打耐性（PERF-02 体感確認）**
       - アプリ起動完了後、適当な付箋に focus
       - 1.5 秒以内に Ctrl+N を 3 回連打 → 3 付箋全部 **即座に**（300ms 以内体感で）出ること
       - 4 回目を即連打 → 「少々お待ちください…」トーストが Ctrl+N を押した付箋の近くに表示、1〜2 秒で消える、4 個目の付箋は通常パスで生成（300ms 超過 OK）

    **4. PERF-04: lazy ファイル作成（ゴミ防止）**
       - Ctrl+N で付箋を出す（pool 由来）
       - **1 文字も打たずに**閉じる（X ボタン or Esc）
       - フォルダに新規 .md ファイルが **作られていない**こと（File Explorer で確認）
       - 別パターン: Ctrl+N → 1 文字打って閉じる → .md ファイルが作られている（連番）こと

    **5. 「すぐ書ける」体感品質（PERF-01 補完）**
       - 17 付箋表示中、Ctrl+N を 10 回ランダム間隔で押す
       - 毎回「即座に書ける」感覚があるか（中央値だけでなく外れ値も体感に影響）

    **6. PERF-08: ショートカットカスタマイズ**
       - アプリ終了 → settings.json に `"shortcut_new_note": "ctrl+shift+m"` を追記 → アプリ起動
       - Ctrl+Shift+M で付箋出ること
       - settings.json から削除 → 再起動 → デフォルト Ctrl+N に戻ること
  </how-to-verify>
  <resume-signal>
    すべて GREEN なら「approved」。
    1 つでも失敗があれば、失敗項目と現象を具体的に書いて報告してください。executor が原因切り分け→修正のループに入ります（最大 3 回、3 回失敗で再エスカレート）。
  </resume-signal>
  <files>(human verification only — no files modified)</files>
  <action>Wave 1〜4 完了後の人間による実機検証チェックポイント。how-to-verify セクションの 6 項目を実機で確認し、すべて GREEN なら「approved」と返す。1 つでも失敗があれば失敗項目と現象を具体的に報告し、executor の自動修正ループ（最大 3 回）に入る。</action>
  <verify><automated>echo "manual checkpoint — gate=blocking, see how-to-verify"</automated></verify>
  <done>6 項目すべて approved、または失敗項目が修正されて再検証 OK。</done>
</task>

</tasks>

<verification>
- `cat ".planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/perf-evidence.jsonl" | wc -l` で 15 行以上（5 サンプル × 3 イベント以上）
- `node scripts/perf-check.mjs` で exit 0
- REQUIREMENTS.md に PERF-01〜PERF-08 全て記載
- 人間検証: 6 項目すべて approved
</verification>

<success_criteria>
- 5 サンプル中央値 T2_READY ≤ 300ms（実測ログで証明）
- Spy++ で WS_EX_LAYERED 確認済み
- メモ帳テスト 5/5 成功
- 連打 1.5s/3 回で 3 付箋即表示、4 回目トースト + フォールバック
- 1 文字無しで閉じて .md 残らず、1 文字以上で .md 作成
- settings.json でショートカットカスタマイズ動作
- perf-evidence.jsonl がリポジトリにコミット済み
</success_criteria>

<output>
After completion, create `.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-05-SUMMARY.md`
</output>
