---
phase: 19-300ms-pool-ctrl-n
plan: 03
type: execute
wave: 3
depends_on: ["19-02"]
files_modified:
  - app/components/RichTextEditor.tsx
  - app/components/StickyNote.tsx
  - app/components/PoolWaitToast.tsx
  - app/page.tsx
autonomous: true
requirements: [PERF-01, PERF-02, PERF-04]
must_haves:
  truths:
    - "Pool 窓は CodeMirror EditorView マウント完了 + rAF 1 回経過後に fusen:pool_window_ready を emit する（setTimeout 禁止）"
    - "RichTextEditor の updateListener が 0→1 文字遷移を検出し、onFirstChar を 1 回だけ呼ぶ（firstCharFiredRef で再入防止）"
    - "page.tsx createNewNote は pool 選択時 fusen_create_note_lazy を呼ばずに promote → 1 文字目で fusen_create_note_lazy 呼び出し"
    - "JS 側 1.2s スロットルが撤去されている（クラッシュ原因が構造的に消えたため）"
    - "Pool 枯渇時に PoolWaitToast が Ctrl+N を押した付箋の近くに 1〜2 秒表示される"
    - "JS から複数 invoke を await して promote する書き方が一切無い（Atomic Coordination Constraint 厳守）"
    - "1 文字も入力せずに pool 窓を閉じた場合、usedPoolWindowsRef からそのラベルが削除され pool 補充がトリガされる（スロットルリークなし）"
  artifacts:
    - path: "app/components/RichTextEditor.tsx"
      provides: "onFirstChar prop 追加、0→1 文字 docChanged 検出"
      contains: "onFirstChar"
    - path: "app/components/StickyNote.tsx"
      provides: "fusen:pool_window_ready 厳格化（rAF 待機）、firstCharFiredRef、pool→fusen_create_note_lazy 結線、close-without-input クリーンアップ"
      contains: "firstCharFiredRef"
    - path: "app/components/PoolWaitToast.tsx"
      provides: "「少々お待ちください」トースト（NEW）"
    - path: "app/page.tsx"
      provides: "createNewNote の lazy 対応・JS 1.2s スロットル撤去・pool 枯渇時 PoolWaitToast 表示"
  key_links:
    - from: "RichTextEditor.tsx updateListener"
      to: "onFirstChar 親コールバック"
      via: "update.startState.doc.length === 0 && update.state.doc.length > 0"
      pattern: "startState\\.doc\\.length === 0"
    - from: "StickyNote.tsx onFirstChar handler"
      to: "invoke('fusen_create_note_lazy')"
      via: "firstCharFiredRef ガード後に Tauri invoke"
      pattern: "firstCharFiredRef\\.current"
    - from: "StickyNote.tsx pool ready effect"
      to: "emit('fusen:pool_window_ready')"
      via: "rAF 1回経過後"
      pattern: "requestAnimationFrame.*pool_window_ready"
    - from: "StickyNote.tsx tauri://close-requested handler"
      to: "invoke('fusen_replenish_pool') + usedPoolWindowsRef cleanup"
      via: "firstCharFiredRef.current === false かつ isPool のとき"
      pattern: "close-requested.*firstCharFiredRef"
---

<objective>
JS 側の Pool ライフサイクル制御を Wave 3 で完成させる。Pool 窓の ready 判定を厳格化（rAF 待機）し、CodeMirror の 0→1 文字遷移を捕まえて Rust の fusen_create_note_lazy を 1 回だけ呼ぶ。Pool 枯渇時の PoolWaitToast を実装、JS 1.2s スロットルを撤去。1 文字も入力せずに pool 窓を閉じたときの usedPoolWindowsRef クリーンアップも実装する。

Purpose: 「Pool 窓は描画完了している」「1 文字目でファイル作成」「pool 枯渇でユーザに気づかせる」「ゴミスロットルリーク防止」の 4 点を JS で実現。Rust 側 Wave 2 の基盤を活かす結線層。CONTEXT.md「Atomic Coordination Constraint」を厳守し、JS から `invoke('a'); await; invoke('b')` のような書き方を一切しない。

Output: 4 ファイル更新（うち PoolWaitToast.tsx は新規）。Vitest StickyNote.pool.test.tsx の 5 ケースが GREEN。
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-CONTEXT.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-RESEARCH.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-01-SUMMARY.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-02-SUMMARY.md
@app/components/RichTextEditor.tsx
@app/components/StickyNote.tsx
@app/page.tsx

<interfaces>
<!-- 既存の主要 props/refs/events -->

From app/components/RichTextEditor.tsx:495 (viewRef 管理):
- `editorRef.current: EditorView | null`
- `EditorView.updateListener.of((update: ViewUpdate) => { ... })` パターン (line 1111)

From app/components/StickyNote.tsx:583-700:
- `useEffect`内で `fusen:promote_from_pool` listen
- `fusen:pool_window_ready` を pool 専用 effect で emit (line 692)
- `isPool` prop で pool 窓専用パスを分岐

From app/page.tsx:485-641:
- `createNewNote` 関数: pool 選択ロジック含む
- `usedPoolWindowsRef`: 使用中 pool ラベル管理 (line 520)
- `monitorFromPoint`: マルチモニタ位置決定 (line 563)

Tauri events:
- `fusen:pool_window_ready` (Pool→main): pool 窓が編集可能になった
- `fusen:promote_from_pool` (main→Pool): pool に「これ使うよ」を通知
- `fusen:request_create_global` (グローバル shortcut→main): Wave 4 で導入予定
- `tauri://close-requested` (Tauri built-in): 窓が閉じようとしている
- `tauri://destroyed` (Tauri built-in): 窓が破棄された（close-requested の後）
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RichTextEditor に onFirstChar prop 追加（0→1 文字検出）</name>
  <files>app/components/RichTextEditor.tsx</files>
  <behavior>
    - props に `onFirstChar?: () => void` を追加
    - 既存の `EditorView.updateListener.of` 内で `if (update.docChanged && update.startState.doc.length === 0 && update.state.doc.length > 0) onFirstChar?.()` を発火
    - IME プレエディット中の docChanged も発火対象（仕様、CONTEXT.md「IME 未確定中含む」）
    - onFirstChar が undefined の場合は何もしない（既存呼び出し側を壊さない）
    - Test: 既存 RichTextEditor のテストパターンを参考に、updateListener が doc を 0 文字 → 1 文字に変えた時 onFirstChar が **1 回だけ** 呼ばれることを検証。2 文字目では呼ばれないことも検証
  </behavior>
  <action>
    1. `app/components/RichTextEditor.tsx` の props 型定義に `onFirstChar?: () => void` を追加
    2. line 1111 付近の `EditorView.updateListener.of((update: ViewUpdate) => { ... })` 内、`if (update.docChanged) {` ブロックに以下を追加:
       ```typescript
       if (update.startState.doc.length === 0 && update.state.doc.length > 0) {
         onFirstChar?.();
       }
       ```
       既存の `onContentChange(update.state.doc.toString())` の **前後どちらでも可**だが、副作用順序として onFirstChar は **後** に置く（onContentChange が同期的に setState する場合の order を保つ）
    3. Vitest テストを `app/components/StickyNote.pool.test.tsx` に追加（Wave 0 で skip 宣言した 2 つを実装）:
       - "1 文字目が入った時に onFirstChar コールバックが 1 回だけ呼ばれる"
       - "2 文字目以降は onFirstChar を再発火しない"
       Testing Library + EditorView.dispatch でドキュメント変更を再現。`vi.fn()` モックで呼び出し回数を検証
    4. **避けるべきこと**:
       - `compositionstart`/`input` イベントの直接 listen（pitfall: CodeMirror の transaction が真の正典、native event は補助）
       - `view.composing` で判定（pitfall: false 状態を経由するタイミングがある）
  </action>
  <verify>
    <automated>npx vitest run app/components/StickyNote.pool.test.tsx -t "onFirstChar"</automated>
  </verify>
  <done>
    RichTextEditor に onFirstChar prop が追加され、既存使用箇所は壊れていない（lint 通過）。Vitest 2 ケースが GREEN。
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: StickyNote.tsx の pool ready 厳格化 + firstCharFiredRef + lazy 結線 + close-without-input クリーンアップ</name>
  <files>app/components/StickyNote.tsx</files>
  <behavior>
    - line 692 付近の `fusen:pool_window_ready` emit を、`editorRef.current !== null` 確認後に `requestAnimationFrame` 1 回経過してから emit する形に変更（setTimeout 禁止、pitfall 6 / RESEARCH Pattern 3）
    - `firstCharFiredRef = useRef<boolean>(false)` を pool 関連 state 群に追加
    - `<RichTextEditor onFirstChar={handleFirstChar} ... />` の handler を実装:
      ```typescript
      const handleFirstChar = useCallback(async () => {
        if (firstCharFiredRef.current) return;  // 再入防止 (pitfall 5)
        firstCharFiredRef.current = true;
        if (!isPool && !poolPromoted) return;   // pool 由来の窓のみ
        const note = await invoke('fusen_create_note_lazy', { folderPath, context: '' });
        // selectedFile 等を更新（既存 fusen_create_note 結果ハンドリングと同じパス）
      }, [folderPath, isPool, poolPromoted]);
      ```
    - promote 完了時（`fusen:promote_from_pool` 受信側）に `firstCharFiredRef.current = false` にリセット（pitfall 5: promote 後の最初の docChanged で発火させるため）
    - **Atomic Coordination 厳守**: handleFirstChar は invoke を 1 回だけ呼ぶ。複数 await を直列に並べない。
    - Pool 専用 effect は **必ず先頭で `if (!isPool) return;`**（pitfall 7、空 path での loadNote 暴発防止）
    - **close-without-input クリーンアップ（PERF-04 スロットルリーク防止）**:
      - `tauri://close-requested` または `tauri://destroyed` イベントを listen する useEffect を pool 専用で追加
      - `isPool && !firstCharFiredRef.current`（1 文字も入力していない）のとき:
        - page.tsx 側の `usedPoolWindowsRef` からこの窓のラベルを削除するため `emit('fusen:pool_slot_released', { label: currentLabel })` を emit する
        - `invoke('fusen_replenish_pool').catch(...)` で pool 補充をトリガする
      - `firstCharFiredRef.current === true` のとき（1 文字以上入力済み）: 何もしない（通常の付箋として確定済み）
    - Test: StickyNote.pool.test.tsx の残り 2 ケースを実装
      - "Pool 窓は isPool=true で初期マウント時に loadNote を呼ばない"（既存 effect の skip 確認）
      - "promote 完了後に setEditBody('') を経由しても firstCharFiredRef がリセットされ、最初の docChanged で 1 回発火する"
  </behavior>
  <action>
    1. `app/components/StickyNote.tsx:692` の pool ready emit ロジックを以下に置換（既存の setTimeout や即時 emit があれば削除）:
       ```typescript
       useEffect(() => {
         if (!isPool) return;
         let cancelled = false;
         const waitReady = async () => {
           // (1) RichTextEditor が view を構築するまで rAF で待つ
           while (!editorRef.current && !cancelled) {
             await new Promise(r => requestAnimationFrame(r));
           }
           if (cancelled) return;
           // (2) layout/paint 完了を保証する rAF 1 回
           await new Promise(r => requestAnimationFrame(r));
           // (3) emit ready
           const { emit } = await import('@tauri-apps/api/event');
           const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
           emit('fusen:pool_window_ready', { label: getCurrentWebviewWindow().label });
         };
         waitReady();
         return () => { cancelled = true; };
       }, [isPool]);
       ```
    2. `firstCharFiredRef = useRef<boolean>(false)` を state 群に追加（既存 useRef 群の近く）
    3. `handleFirstChar` を上記 behavior の通り実装。`useCallback` で memoize。Tauri invoke は 1 回のみ。
    4. `<RichTextEditor onFirstChar={handleFirstChar} ... />` を JSX に追加（既存 props を保ったまま）
    5. `fusen:promote_from_pool` ハンドラ（line 596 付近）の中で `firstCharFiredRef.current = false` をリセット（promote 完了確認後）
    6. **close-without-input クリーンアップ** を useEffect で追加:
       ```typescript
       useEffect(() => {
         if (!isPool) return;
         let unlisten: (() => void) | undefined;
         (async () => {
           const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
           const win = getCurrentWebviewWindow();
           unlisten = await win.listen('tauri://close-requested', async () => {
             if (!firstCharFiredRef.current) {
               // 1 文字も入力されていない → スロットルを解放して補充トリガ
               const { emit } = await import('@tauri-apps/api/event');
               await emit('fusen:pool_slot_released', { label: win.label });
               invoke('fusen_replenish_pool').catch(e => console.warn('replenish on close:', e));
             }
             // window close は Tauri のデフォルト動作に任せる（preventDefault しない）
           });
         })();
         return () => { unlisten?.(); };
       }, [isPool]);
       ```
       page.tsx 側は `fusen:pool_slot_released` を listen して `usedPoolWindowsRef` からラベルを削除する（Task 3 / page.tsx 側で実装）。
    7. Vitest テスト 2 ケース実装。modal で invoke をモック、editorRef を fake EditorView で replace してロジックを検証
    8. **避けるべきこと**:
       - JS から `invoke('fusen_show_at_position'); await; invoke('fusen_set_alpha')` のような 2 段呼び出し（Atomic Coordination Constraint 違反、Wave 2 で 1 関数化済みなので不要）
       - useEffect の skip 漏れ（pitfall 7、空 path で loadNote が走る）
       - close-requested ハンドラで `window.close()` を明示的に呼ぶ（Tauri デフォルト動作が走るので不要、二重 close になる）
  </action>
  <verify>
    <automated>npx vitest run app/components/StickyNote.pool.test.tsx</automated>
  </verify>
  <done>
    StickyNote.pool.test.tsx の 4 ケース全て GREEN（Wave 0 で skip 宣言した分が全部実装済み）。pool ready は rAF 待機後に emit、firstCharFiredRef で再入防止、promote 後リセットが確認できる。pool 窓の close-without-input 時に fusen:pool_slot_released が emit され、fusen_replenish_pool が invoke される実装が存在する。
  </done>
</task>

<task type="auto">
  <name>Task 3: PoolWaitToast.tsx 新規 + page.tsx createNewNote 改修（lazy 対応・スロットル撤去・スロット解放受信）</name>
  <files>app/components/PoolWaitToast.tsx, app/page.tsx</files>
  <action>
    1. `app/components/PoolWaitToast.tsx` を新規作成:
       - props: `{ x: number; y: number; visible: boolean; onClose: () => void }`
       - 「少々お待ちください…」テキスト + 1〜2 秒で `setTimeout(onClose, 1500)`
       - 位置は `position: fixed; left: x; top: y;` で Ctrl+N を押した付箋の近くに表示（page.tsx 側で座標を渡す）
       - スタイル: 既存の SaveErrorToast.tsx を参考に（背景半透明・小さめ・shadow）。デザインは Claude's Discretion
       - 既存の sonner や他のトーストライブラリは使わない（依存追加しない、シンプル CSS）
    2. `app/page.tsx:485-641` の `createNewNote` を改修:
       - **JS 1.2s スロットル撤去**: 既存の `Date.now() - lastCreateMs < 1200` のような分岐があれば削除（CONTEXT「JS 1.2s スロットルを撤去」）
       - Pool 選択時のフロー:
         - usedPoolWindowsRef で未使用 pool を選ぶ → `invoke('fusen_show_at_position', { label, phys_x, phys_y, phys_width: 400, phys_height: 300, run_id })` を **1 回呼び出し**で完結（Wave 2 で α=255 + focus も内包済み）
         - **fusen_create_note_lazy はここで呼ばない**（1 文字目時に StickyNote.tsx 側で呼ぶ）
         - emit('fusen:promote_from_pool', { label, ... }) で StickyNote に promote を通知
       - Pool 枯渇時（usedPoolWindowsRef が pool 全部を消費している、4 個目以降）:
         - 既存の `openNoteWindow` フォールバックを呼ぶ（webview 新規作成、CONTEXT「4 個目以降は通常生成」）
         - **同時に PoolWaitToast を表示**（state でトースト visible/座標を管理）
         - **フォールバック側に 1.2s スロットルは残す**（RESEARCH Open Question 6: クラッシュ再発リスク防護）
       - perflog: T0 (Ctrl+N keydown) / T_PROMOTE_START (invoke 直前) を JS から console.log で記録（フォーマット: 既存 `[PERF|...]` を流用）
    3. **fusen:pool_slot_released リスナーを page.tsx に追加**（Task 2 / StickyNote.tsx 側の close-without-input クリーンアップと対になる）:
       - `useEffect` 内で `listen('fusen:pool_slot_released', (event) => { ... })` を登録
       - `usedPoolWindowsRef.current` から `event.payload.label` を削除（Set から delete or 配列から filter）
       - これにより close-without-input された pool スロットが再利用可能になる
    4. **Vitest テストを `app/components/StickyNote.pool.test.tsx` に追加**（Blocker 1 対応）:
       - テストケース: "pool が枯渇しているとき createNewNote は openNoteWindow フォールバックを呼び PoolWaitToast を表示する"
         - `usedPoolWindowsRef` に POOL_SIZE 分のラベルを詰め込んだ状態で createNewNote を呼ぶ
         - `vi.mock` で `openNoteWindow` をモック → 1 回呼ばれることを assert
         - PoolWaitToast の visible state が true になることを assert（state setter をモックまたは React Testing Library で確認）
       - テストケース: "pool_slot_released イベントを受信すると usedPoolWindowsRef からラベルが削除される"
         - listen モックで 'fusen:pool_slot_released' を発火させ、usedPoolWindowsRef が更新されることを assert
    5. **避けるべきこと**:
       - JS から 2 段階の invoke await（Wave 2 で 1 関数化したので不要）
       - PoolWaitToast を sonner/react-hot-toast 等で実装（依存追加禁止）
       - スロットル全廃（フォールバック側は残す、Open Question 6）
       - Pool 内で fusen_create_note を呼ぶ（lazy 化の意味が消える、CONTEXT「ファイル無いのでゴミも無い」設計違反）
  </action>
  <verify>
    <automated>npm run lint && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "node_modules" | grep -E "error|Error" || echo "OK" && npx vitest run app/components/StickyNote.pool.test.tsx -t "pool.*枯渇|pool_slot_released|fallback|PoolWaitToast"</automated>
  </verify>
  <done>
    page.tsx の createNewNote が JS 1.2s スロットル無し・pool 選択時は 1 invoke 完結・枯渇時 openNoteWindow + PoolWaitToast 表示。PoolWaitToast.tsx 新規作成済み。fusen:pool_slot_released リスナーが page.tsx に存在し usedPoolWindowsRef を更新する。lint と tsc がエラー無し。Vitest の fallback + pool_slot_released テスト 2 ケースが GREEN。
  </done>
</task>

</tasks>

<verification>
- `npx vitest run app/components/StickyNote.pool.test.tsx` 全ケース（最低 6 ケース）GREEN
- `npm run lint` エラー無し
- `npm test` 全件パス（既存テスト regression 無し）
- 手動 (`npm run tauri dev`): Ctrl+N で pool 窓があれば即表示、無ければ通常生成 + トースト
- grep `setTimeout.*pool_window_ready` で残存無し（rAF に置き換わっている）
- grep `await invoke.*fusen_show.*await invoke` で複数 await 直列パターン無し（Atomic Coordination 厳守）
- grep `fusen:pool_slot_released` で StickyNote.tsx に emit、page.tsx に listen が存在する
</verification>

<success_criteria>
- RichTextEditor に onFirstChar prop が追加され、CodeMirror 0→1 文字遷移で 1 回だけ発火
- StickyNote.tsx pool ready が rAF 待機後 emit、firstCharFiredRef で再入防止、promote 後リセット
- StickyNote.tsx が 1 文字入力なしで閉じられたとき fusen:pool_slot_released を emit し fusen_replenish_pool を invoke する
- PoolWaitToast.tsx が新規実装され、pool 枯渇時に表示される
- page.tsx createNewNote が lazy 対応・JS 1.2s スロットル撤去・1 invoke 完結
- page.tsx が fusen:pool_slot_released を受信して usedPoolWindowsRef からラベルを削除する
- StickyNote.pool.test.tsx の全ケース GREEN（onFirstChar×2 + pool init skip + firstCharFiredRef reset + 枯渇フォールバック + pool_slot_released）
</success_criteria>

<output>
After completion, create `.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-03-SUMMARY.md`
</output>
