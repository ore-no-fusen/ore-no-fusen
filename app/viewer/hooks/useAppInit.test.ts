import { describe, expect, it } from 'vitest';
import { resolveImmediateStartupStep } from './useAppInit';

describe('resolveImmediateStartupStep', () => {
  it('通知設定済みの通常起動は書ける画面を即時に選ぶ', () => {
    expect(resolveImmediateStartupStep('token', true)).toBe('write');
  });

  it('通知設定前と未ログインの導線を維持する', () => {
    expect(resolveImmediateStartupStep('token', false)).toBe('push');
    expect(resolveImmediateStartupStep(null, false)).toBe('login');
  });
});
