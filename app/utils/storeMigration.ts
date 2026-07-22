export const STORE_MIGRATION_BRIDGE_VERSION = '5.0.0';

export function isStoreMigrationBridgeVersion(version: unknown): boolean {
    return typeof version === 'string'
        && version.trim().replace(/^v/i, '') === STORE_MIGRATION_BRIDGE_VERSION;
}
