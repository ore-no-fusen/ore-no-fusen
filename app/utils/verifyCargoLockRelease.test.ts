import { describe, expect, it } from 'vitest';
import { verifyCargoLockRelease } from '../../scripts/verify-cargo-lock-release.mjs';

const before = `version = 4

[[package]]
name = "ore-no-fusen"
version = "5.0.0"
dependencies = [
 "tauri",
]

[[package]]
name = "tauri"
version = "2.9.5"
source = "registry+https://github.com/rust-lang/crates.io-index"
`;

describe('verifyCargoLockRelease', () => {
    it('本体パッケージの版だけが変わるReleaseを許可する', () => {
        const after = before.replace('version = "5.0.0"', 'version = "5.0.1"');

        expect(verifyCargoLockRelease(before, after)).toEqual({
            beforeVersion: '5.0.0',
            afterVersion: '5.0.1',
        });
    });

    it('間接依存の版が変われば拒否する', () => {
        const after = before
            .replace('version = "5.0.0"', 'version = "5.0.1"')
            .replace('version = "2.9.5"', 'version = "2.9.6"');

        expect(() => verifyCargoLockRelease(before, after)).toThrow('unexpected Cargo.lock changes');
    });

    it('間接依存が追加されれば拒否する', () => {
        const after = `${before.replace('version = "5.0.0"', 'version = "5.0.1"')}
[[package]]
name = "new-indirect-dependency"
version = "1.0.0"
`;

        expect(() => verifyCargoLockRelease(before, after)).toThrow('unexpected Cargo.lock changes');
    });

    it('本体パッケージの依存定義が変われば拒否する', () => {
        const after = before
            .replace('version = "5.0.0"', 'version = "5.0.1"')
            .replace(' "tauri",', ' "tauri",\n "reqwest",');

        expect(() => verifyCargoLockRelease(before, after)).toThrow('unexpected Cargo.lock changes');
    });

    it('本体パッケージがないロックファイルを拒否する', () => {
        const withoutRoot = before.replace(/\[\[package\]\][\s\S]*?\n\n(?=\[\[package\]\])/, '');

        expect(() => verifyCargoLockRelease(withoutRoot, withoutRoot)).toThrow('root package not found');
    });
});
