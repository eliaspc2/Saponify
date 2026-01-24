import type { Migration } from './Migration';

const migrations: Migration[] = [];

export const registerMigration = (migration: Migration): void => {
    if (migration.toVersion < migration.fromVersion) {
        throw new Error('Invalid migration: toVersion must be greater than or equal to fromVersion.');
    }
    if (migrations.some(m => m.fromVersion === migration.fromVersion && m.toVersion === migration.toVersion)) {
        throw new Error(`Duplicate migration range: ${migration.fromVersion} -> ${migration.toVersion}`);
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

    const identityAtTarget = ordered.filter(m => m.fromVersion === m.toVersion && m.toVersion === toVersion);
    const nonIdentity = ordered.filter(m => m.fromVersion !== m.toVersion);

    if (!nonIdentity.length) {
        return identityAtTarget;
    }

    let expectedFrom = fromVersion;
    for (const migration of nonIdentity) {
        if (migration.fromVersion !== expectedFrom) {
            throw new Error('Migration chain is not contiguous.');
        }
        expectedFrom = migration.toVersion;
    }

    if (expectedFrom !== toVersion) {
        throw new Error('Migration chain does not reach target version.');
    }

    return nonIdentity;
};
