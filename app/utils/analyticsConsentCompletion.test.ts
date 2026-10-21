import { describe, expect, it, vi } from 'vitest';
import { completeAnalyticsConsentChoice } from './analyticsConsentCompletion';

describe('協力案内の選択完了', () => {
  it.each(['granted', 'denied', 'postponed'])('%s: 保存成功後に案内用の窓を隠す', async () => {
    const order: string[] = [];
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { finish = () => { order.push('saved'); resolve(); }; }));
    const hide = vi.fn(async () => { order.push('hidden'); });
    const pending = completeAnalyticsConsentChoice(save, hide);
    expect(hide).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(order).toEqual(['saved', 'hidden']);
    expect(hide).toHaveBeenCalledOnce();
  });

  it('保存失敗なら窓を残してエラーを呼出元へ返す', async () => {
    const hide = vi.fn();
    await expect(completeAnalyticsConsentChoice(async () => { throw new Error('save failed'); }, hide)).rejects.toThrow('save failed');
    expect(hide).not.toHaveBeenCalled();
  });

  it('窓を閉じる失敗も成功扱いにしない', async () => {
    await expect(completeAnalyticsConsentChoice(async () => {}, async () => { throw new Error('hide failed'); })).rejects.toThrow('hide failed');
  });
});
