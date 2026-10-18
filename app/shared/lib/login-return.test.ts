import { afterEach, describe, expect, it } from 'vitest';
import { consumeSharedLoginReturn, isSharedLoginAttempt, markSharedLoginReturn } from './login-return';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('shared OAuth return hint', () => {
  it('keeps a shared login return in the initiating tab and consumes it once after callback', () => {
    markSharedLoginReturn();
    expect(isSharedLoginAttempt('?code=oauth-code')).toBe(true);
    expect(consumeSharedLoginReturn('?code=oauth-code')).toBe(true);
    expect(consumeSharedLoginReturn('?code=oauth-code')).toBe(false);
  });

  it('does not inherit a stale persistent hint into an ordinary iPhone viewer login', () => {
    localStorage.setItem('viewer_return_to', '/shared');
    sessionStorage.setItem('viewer_return_to', '/shared');
    expect(isSharedLoginAttempt('')).toBe(false);
    expect(sessionStorage.getItem('viewer_return_to')).toBeNull();
    expect(consumeSharedLoginReturn('?code=ordinary-oauth')).toBe(false);
  });

  it('preserves explicit shared entry without consuming the hint before OAuth completes', () => {
    markSharedLoginReturn();
    expect(isSharedLoginAttempt('?shared=1')).toBe(true);
    expect(consumeSharedLoginReturn('?shared=1')).toBe(false);
    expect(sessionStorage.getItem('viewer_return_to')).toBe('/shared');
  });

  it('keeps shared mode after consent is cancelled so the user can retry', () => {
    markSharedLoginReturn();
    expect(isSharedLoginAttempt('?error=access_denied')).toBe(true);
    markSharedLoginReturn();
    expect(isSharedLoginAttempt('?code=retry-callback')).toBe(true);
    expect(consumeSharedLoginReturn('?code=retry-callback')).toBe(true);
  });
});
