/**
 * ロック画面通知 E2Eテストスタブ
 *
 * LOCK-03: ロック中メモの視覚的識別（🔔ボタンの text-blue-500 クラス）
 * LOCK-04: 複数メモの独立した通知タグ（fusen-lock-<noteId> 形式）
 * LOCK-05: DB locked フラグの永続化（DraftRecord.locked フィールド）
 *
 * 状態: RED（実装前スタブ）
 * Wave 2〜3 の実装完了後にスタブを実装に差し替える。
 *
 * Note: test.skip() で skip 状態にしてある。
 * 実装完了後は skip を外して実際の検証コードに置き換えること。
 */

import { test, expect } from '@playwright/test';

// ============================================================
// LOCK-03: ロック中メモの視覚的識別
// ============================================================
test('[LOCK-03] ロック中のメモは🔔ボタンに text-blue-500 クラスが付く', async ({ page }) => {
    // スタブ: 実装前のためスキップ（Wave 2 完了後に実装する）
    test.skip(true, 'LOCK-03 未実装 — Wave 2 完了後に実装');
    // 実装予定:
    // 1. viewer/page.tsx を開き一覧ステップに遷移
    // 2. あるメモの🔔ボタンをタップしてロック状態にする
    // 3. 🔔ボタンに text-blue-500 クラスがあることを検証
    const lockButton = page.locator('[data-testid="lock-button-note-abc"]');
    await expect(lockButton).toHaveClass(/text-blue-500/);
});

// ============================================================
// LOCK-04: 複数メモの独立した通知タグ
// ============================================================
test('[LOCK-04] 通知タグは fusen-lock-<noteId> 形式で複数メモが衝突しない', async ({ page }) => {
    // スタブ: 実装前のためスキップ（Wave 2 完了後に実装する）
    test.skip(true, 'LOCK-04 未実装 — Wave 2 完了後に実装');
    // 実装予定:
    // 1. 2件のメモをそれぞれロック状態にする
    // 2. 各通知タグが fusen-lock-<noteId> 形式であることを検証
    // 3. 2件のタグが異なることを検証
    const noteId1 = 'note-abc-123';
    const noteId2 = 'note-xyz-456';
    const tag1 = `fusen-lock-${noteId1}`;
    const tag2 = `fusen-lock-${noteId2}`;
    expect(tag1).not.toBe(tag2);
});

// ============================================================
// LOCK-05: DB locked フラグの永続化
// ============================================================
test('[LOCK-05] DraftRecord の locked フィールドが saveDraft/loadDraft で保持される', async ({ page }) => {
    // スタブ: 実装前のためスキップ（Wave 3 完了後に実装する）
    test.skip(true, 'LOCK-05 未実装 — Wave 3 完了後に実装');
    // 実装予定:
    // 1. メモをロック状態にしてページをリロード
    // 2. リロード後もロック状態（text-blue-500）が維持されることを検証
    // 3. IndexedDB に locked: true が保存されていることを検証
    const lockButton = page.locator('[data-testid="lock-button-note-abc"]');
    await expect(lockButton).toHaveClass(/text-blue-500/);
});
