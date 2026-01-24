import { registerMigration } from './MigrationRegistry';
import { MIGRATION_1_1 } from './Migration_1_1';

let registered = false;

export const registerDefaultMigrations = (): void => {
    if (registered) return;
    registerMigration(MIGRATION_1_1);
    registered = true;
};
