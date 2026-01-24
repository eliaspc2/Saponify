import type { Migration } from './Migration';

export const MIGRATION_1_1: Migration<unknown> = {
    fromVersion: 1,
    toVersion: 1,
    description: 'Stub migration (no-op) for pipeline validation.',
    migrate: (data) => data
};
