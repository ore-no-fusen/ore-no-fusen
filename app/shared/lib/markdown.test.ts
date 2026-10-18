import { describe, expect, it } from 'vitest';
import { replaceTaskText } from './markdown';

describe('replaceTaskText', () => {
  it.each(['$100', '$&', '$1'])('preserves literal replacement text %s', (text) => {
    expect(replaceTaskText('- [ ] original\n- [x] other', 0, text)).toBe(`- [ ] ${text}\n- [x] other`);
  });
});
