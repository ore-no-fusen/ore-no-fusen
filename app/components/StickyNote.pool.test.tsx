/**
 * StickyNote.pool.test.tsx
 *
 * Pool 窓専用挙動の Vitest 単体テストスケルトン（Wave 0）
 *
 * 責務:
 * - Pool 窓（isPool=true）固有の挙動を検証するテストケースを宣言する
 * - Wave 2 で実装が入ったタイミングに skip/todo を外して GREEN にする
 *
 * 実装ポイント（Wave 2 で un-skip する際の参考）:
 *   - pitfall 7: isPool=true の窓は初期マウント時に loadNote を呼ばない
 *   - pitfall 5: firstCharFiredRef で onFirstChar を 1 回だけ発火
 *   - promote_from_pool イベント後の setEditBody('') でも firstCharFiredRef がリセットされない
 */

import React from 'react';
import { describe, it } from 'vitest';

// Mock Tauri APIs（Wave 2 で実装時に必要なものを追加する）
// import { render } from '@testing-library/react';
// import StickyNote from './StickyNote';

describe.skip('Pool 窓挙動', () => {
  it('Pool 窓は isPool=true で初期マウント時に loadNote を呼ばない', () => {
    // Wave 2 で実装
    // 期待: isPool=true の StickyNote がマウントされても invoke('fusen_read_note') が呼ばれない
    // pitfall 7 対策の検証
  });

  it('1 文字目が入った時に onFirstChar コールバックが 1 回だけ呼ばれる', () => {
    // Wave 2 で実装
    // 期待: CodeMirror に最初の文字を入力すると onFirstChar が exactly 1 回 call される
    // firstCharFiredRef による重複発火防止（pitfall 5）の検証
  });

  it('2 文字目以降は onFirstChar を再発火しない', () => {
    // Wave 2 で実装
    // 期待: 2 文字目、3 文字目の入力では onFirstChar が呼ばれない
    // firstCharFiredRef がリセットされないことの検証
  });

  it('promote 完了後に setEditBody("") を経由しても firstCharFiredRef が残る', () => {
    // Wave 2 で実装
    // 期待: promote_from_pool → setEditBody('') が呼ばれても firstCharFiredRef は true のまま
    // プロモート後の Pool 窓再利用時に onFirstChar が二重発火しないことの検証
  });
});
