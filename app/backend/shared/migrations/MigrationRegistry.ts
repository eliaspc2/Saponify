import type { Migration } from './Migration';

const migrations: Migration[] = [];

export const registerMigration = (migration: Migration): void => {
    if (migration.toVersion <= migration.fromVersion) {
        throw new Error('Invalid migration: toVersion must be greater than fromVersion.');
    }
    if (migrations.some(m => m.fromVersion === migration.fromVersion)) {
        throw new Error(`Duplicate migration fromVersion: ${migration.fromVersion}`);
    }
    if (migrations.some(m => m.toVersion === migration.toVersion)) {
        throw new Error(`Duplicate migration toVersion: ${migration.toVersion}`);
    }
    migrations.push(migration);
};

export const getMigrations = (fromVersion: number, toVersion: number): Migration[] => {
    if (fromVersion === toVersion) return [];
    if (fromVersion > toVersion) {
        throw new Error('Invalid migration range: fromVersion is greater than toVersion.');
    }

    const ordered = migrations
        .filter(m => m.fromVersion >= fromVersion && m.toVersion <= toVersion)
        .sort((a, b) => a.fromVersion - b.fromVersion);

    if (!ordered.length) {
        return [];
    }

    let expectedFrom = fromVersion;
    for (const migration of ordered) {
        if (migration.fromVersion !== expectedFrom) {
            throw new Error('Migration chain is not contiguous.');
        }
        expectedFrom = migration.toVersion;
    }

    if (expectedFrom !== toVersion) {
        throw new Error('Migration chain does not reach target version.');
    }

    return ordered;
};
