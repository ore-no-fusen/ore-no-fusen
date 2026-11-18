import { beforeEach, describe, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { renameUserTag } from './tags';

beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue({ changed: 1, failed: [] }); });
describe('タグ統合の承認をPC側に伝える', () => {
    it('通常の名前変更では統合を許可しない', async () => {
        await renameUserTag('仕事', '業務');
        expect(invoke).toHaveBeenCalledWith('fusen_rename_user_tag', { tag: '仕事', name: '業務', mergeExisting: false });
    });
    it('利用者が統合を確定した場合だけ承認を伝える', async () => {
        await renameUserTag('仕事', '業務', true);
        expect(invoke).toHaveBeenCalledWith('fusen_rename_user_tag', { tag: '仕事', name: '業務', mergeExisting: true });
    });
});
