import type { Migration } from './Migration';
import { getMigrations } from './MigrationRegistry';
import { registerDefaultMigrations } from './registerMigrations';

export const runMigrations = <T>(
    data: T,
    storedVersion: number,
    currentVersion: number
): { data: T; applied: number[] } => {
    registerDefaultMigrations();
    if (storedVersion === currentVersion) {
        return { data, applied: [] };
    }
    if (storedVersion > currentVersion) {
        throw new Error('Stored data version is newer than current schema version.');
    }

    const chain: Migration<T>[] = getMigrations(storedVersion, currentVersion) as Migration<T>[];
    if (!chain.length) {
        return { data, applied: [] };
    }

    let next = data;
    const applied: number[] = [];
    for (const migration of chain) {
        next = migration.migrate(next);
        applied.push(migration.toVersion);
        console.info(`[Migration] Applied migration ${migration.toVersion} (${migration.fromVersion} \u2192 ${migration.toVersion})`);
    }

    return { data: next, applied };
};
