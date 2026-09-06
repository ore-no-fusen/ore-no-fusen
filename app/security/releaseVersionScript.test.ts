import { describe, expect, it } from 'vitest';
import { updateReleaseVersionTexts } from '../../scripts/set-release-version.mjs';

const files = {
  packageJson: '{\n  "version": "5.2.1"\n}\n',
  packageLock: '{\n  "version": "5.2.1",\n  "packages": {\n    "": {\n      "name": "ore-no-fusen",\n      "version": "5.2.1"\n    }\n  }\n}\n',
  cargoToml: '[package]\nversion = "5.2.1"\n',
  cargoLock: '[[package]]\nname = "ore-no-fusen"\nversion = "5.2.1"\ndependencies = []\n',
  manifest: '<Identity Version="5.2.1.0" />\n',
};

describe('set-release-version', () => {
  it('updates only the five declared version locations', () => {
    const updated = updateReleaseVersionTexts(files, '5.2.1', '5.2.2');
    expect(Object.values(updated).every(content => content.includes('5.2.2'))).toBe(true);
    expect(Object.values(updated).every(content => !content.includes('5.2.1'))).toBe(true);
  });

  it('rejects an equal, lower, or malformed version', () => {
    expect(() => updateReleaseVersionTexts(files, '5.2.1', '5.2.1')).toThrow(/greater/);
    expect(() => updateReleaseVersionTexts(files, '5.2.1', '5.2.0')).toThrow(/greater/);
    expect(() => updateReleaseVersionTexts(files, '5.2.1', '5.2')).toThrow(/X.Y.Z/);
  });
});
