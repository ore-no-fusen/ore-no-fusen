import { describe, expect, it } from 'vitest';
import { getDistributionEdition, isStoreMigrationBridgeVersion } from './storeMigration';

describe('Store migration bridge version', () => {
    it.each(['5.0.0', 'v5.0.0', ' V5.0.0 '])('recognizes %s as the migration bridge', (version) => {
        expect(isStoreMigrationBridgeVersion(version)).toBe(true);
    });

    it.each(['4.4.2', '5.0.1', '5.1.0', '', null, undefined])('does not classify %s as the migration bridge', (version) => {
        expect(isStoreMigrationBridgeVersion(version)).toBe(false);
    });
});

describe('distribution edition', () => {
    it('shows the migration edition only for the 5.0.0 desktop bridge', () => {
        expect(getDistributionEdition('desktop', '5.0.0')).toBe('migration');
    });

    it('shows the development edition for unpackaged 5.1.0 and later builds', () => {
        expect(getDistributionEdition('desktop', '5.1.0')).toBe('development');
        expect(getDistributionEdition('desktop', '6.0.0')).toBe('development');
    });

    it('shows the Store edition for MSIX regardless of the application version', () => {
        expect(getDistributionEdition('msix', '5.1.0')).toBe('store');
    });
});
