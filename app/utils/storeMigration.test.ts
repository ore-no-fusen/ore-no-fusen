import { describe, expect, it } from 'vitest';
import { isStoreMigrationBridgeVersion } from './storeMigration';

describe('Store migration bridge version', () => {
    it.each(['5.0.0', 'v5.0.0', ' V5.0.0 '])('recognizes %s as the migration bridge', (version) => {
        expect(isStoreMigrationBridgeVersion(version)).toBe(true);
    });

    it.each(['4.4.2', '5.0.1', '5.1.0', '', null, undefined])('does not classify %s as the migration bridge', (version) => {
        expect(isStoreMigrationBridgeVersion(version)).toBe(false);
    });
});
