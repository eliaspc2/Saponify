const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');

class MemoryStorage {
    constructor() {
        this.values = new Map();
        this.failHistoryWrites = false;
        this.failHistoryReads = false;
        this.maxBytes = Infinity;
    }

    getItem(key) {
        if (this.failHistoryReads && key === 'saponify_auto_backup_history') {
            throw new Error('storage unavailable');
        }
        return this.values.get(key) ?? null;
    }

    setItem(key, value) {
        if (this.failHistoryWrites && key === 'saponify_auto_backup_history') {
            throw new Error('quota exceeded');
        }
        const candidate = new Map(this.values);
        candidate.set(key, String(value));
        const bytes = [...candidate].reduce((sum, [key, value]) => sum + 2 * (key.length + value.length), 0);
        if (bytes > this.maxBytes) throw new DOMException('quota exceeded', 'QuotaExceededError');
        this.values = candidate;
    }

    removeItem(key) {
        this.values.delete(key);
    }

    clear() {
        this.values.clear();
    }
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function waitForQueue() {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
}

async function run() {
    globalThis.localStorage = new MemoryStorage();

    const bundle = await build({
        stdin: {
            contents: [
                "export { AutoBackupStorage } from './app/backend/infrastructure/storage/AutoBackupStorage';",
                "export { SettingsService } from './app/backend/infrastructure/services/SettingsService';",
                "export { BackupService } from './app/backend/application/backup/BackupService';",
                "export { touchDataVersion } from './app/backend/shared/versioning/dataVersion';"
            ].join('\n'),
            resolveDir: path.resolve(__dirname, '../..'),
            sourcefile: 'backup-storage-entry.ts'
        },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
        define: { 'import.meta.env.BASE_URL': '"/"' }
    });
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(loaded, loaded.exports, require);
    const { AutoBackupStorage, SettingsService, BackupService, touchDataVersion } = loaded.exports;

    const storage = new AutoBackupStorage();
    const historyKey = 'saponify_auto_backup_history';
    const legacyHistory = Array.from({ length: 5 }, (_, i) => ({
        timestamp: `2026-01-0${i + 1}T00:00:00.000Z`, data: `old-${i}`
    }));
    localStorage.setItem(historyKey, JSON.stringify(legacyHistory));
    localStorage.setItem('saponify_auto_backup', 'old-4');
    localStorage.setItem('saponify_auto_backup_timestamp', legacyHistory[4].timestamp);
    storage.setSafetyData('recovery', '2026-01-01T00:00:00.000Z');
    storage.setData('latest', '2026-01-06T00:00:00.000Z', '10');
    assert.equal(JSON.parse(localStorage.getItem(historyKey)).length, 2);
    assert.equal(localStorage.getItem('saponify_auto_backup'), null, 'do not duplicate the current payload');
    assert.equal(storage.getSafetyData(), 'recovery', 'retention must preserve the separate import safety copy');

    storage.setData('older-clock', '2020-01-01T00:00:00.000Z', '11');
    assert.equal(storage.getCurrentData(), 'older-clock');
    assert.equal(storage.getCurrentTimestamp(), '2020-01-01T00:00:00.000Z');
    assert.equal(storage.getSnapshotDataVersion(), '11');

    localStorage.clear();
    localStorage.setItem('recipes', 'user-data');
    storage.setData('a'.repeat(100), '2026-01-01T00:00:00.000Z', '1');
    localStorage.maxBytes = [...localStorage.values].reduce((sum, [key, value]) => sum + 2 * (key.length + value.length), 0) + 10;
    storage.setData('b'.repeat(100), '2026-01-02T00:00:00.000Z', '2');
    assert.equal(storage.getAllBackups().length, 1, 'quota must prune the oldest candidate');
    assert.equal(storage.getCurrentData(), 'b'.repeat(100));
    const beforeFailure = new Map(localStorage.values);
    assert.throws(() => storage.setData('c'.repeat(1000), '2026-01-03T00:00:00.000Z'), /backups anteriores foram preservados/);
    assert.deepEqual(localStorage.values, beforeFailure, 'an oversized single backup must leave stored data untouched');
    localStorage.maxBytes = Infinity;
    localStorage.clear();

    localStorage.setItem('saponify_auto_backup_history', JSON.stringify([
        { timestamp: '2026-01-01T00:00:00.000Z', data: 'old-history' }
    ]));
    localStorage.setItem('saponify_auto_backup', 'new-legacy');
    localStorage.setItem('saponify_auto_backup_timestamp', '2026-01-02T00:00:00.000Z');
    assert.equal(storage.getData(), 'new-legacy');

    storage.setData('versioned', '2026-01-03T00:00:00.000Z', '123');
    assert.equal(storage.getSnapshotDataVersion(), '123');
    assert.equal(storage.getLatestSnapshotDataVersion(), '123');
    storage.setData('without-version', '2026-01-03T00:00:01.000Z', '');
    assert.equal(storage.getSnapshotDataVersion(), '');

    localStorage.setItem('saponify_auto_backup_history', JSON.stringify([
        { timestamp: '2026-01-03T00:00:01.000Z', data: 'without-version', snapshotDataVersion: '' }
    ]));
    assert.equal(storage.getAllBackups()[0].snapshotDataVersion, '');

    localStorage.setItem('saponify_auto_backup', 'remote-without-local-version');
    localStorage.setItem('saponify_auto_backup_timestamp', '2025-01-01T00:00:00.000Z');
    localStorage.removeItem('saponify_auto_backup:data-version');
    assert.equal(storage.getCurrentData(), 'remote-without-local-version');
    assert.equal(storage.getSnapshotDataVersion(), null);

    localStorage.failHistoryWrites = true;
    assert.throws(
        () => storage.setData('will-fail', '2026-01-04T00:00:00.000Z', '124'),
        /Não foi possível guardar o histórico de backups/
    );
    localStorage.failHistoryWrites = false;

    localStorage.failHistoryReads = true;
    assert.throws(
        () => storage.getAllBackups(),
        /Não foi possível ler o histórico de backups/
    );
    localStorage.failHistoryReads = false;

    localStorage.setItem('saponify_data_version', '100');
    SettingsService.getInstance().updateLastAutoBackup('2026-01-05T00:00:00.000Z');
    assert.equal(localStorage.getItem('saponify_data_version'), '100');

    const originalNow = Date.now;
    Date.now = () => 500;
    localStorage.removeItem('saponify_data_version');
    touchDataVersion();
    touchDataVersion();
    Date.now = originalNow;
    assert.equal(localStorage.getItem('saponify_data_version'), '501');

    localStorage.setItem('saponify_data_version', '100');

    const backupService = BackupService.getInstance();
    backupService.setSyncProvider(null);
    let exports = 0;
    backupService.exportAllData = async () => {
        exports += 1;
        return '{"recipes":[],"clients":[],"settings":{}}';
    };

    const first = backupService.performAutoBackupNow({ sync: false });
    const second = backupService.performAutoBackupNow({ sync: false });
    assert.strictEqual(first, second);
    const result = await first;
    assert.equal(exports, 1);
    assert.equal(result.created, true);
    assert.equal(result.snapshotDataVersion, '100');
    assert.equal(result.isCurrent, true);

    const primaryData = storage.getCurrentData();
    localStorage.setItem('saponify_sync_pending_import', 'true');
    const pendingResult = await backupService.performAutoBackupNow();
    assert.equal(pendingResult.skippedReason, 'pending-sync-import');
    assert.equal(exports, 1);

    const safetyResult = await backupService.performAutoBackupNow({ sync: false });
    assert.equal(safetyResult.storage, 'safety');
    assert.equal(storage.getCurrentData(), primaryData);
    assert.equal(storage.getSafetyData(), '{"recipes":[],"clients":[],"settings":{}}');

    localStorage.removeItem('saponify_sync_pending_import');
    backupService.exportAllData = async () => {
        exports += 1;
        localStorage.setItem('saponify_sync_pending_import', 'true');
        return '{"late":"pending"}';
    };
    const latePendingResult = await backupService.performAutoBackupNow();
    assert.equal(latePendingResult.skippedReason, 'pending-sync-import');
    assert.equal(storage.getCurrentData(), primaryData);

    localStorage.removeItem('saponify_sync_pending_import');
    backupService.exportAllData = async () => {
        exports += 1;
        return '{"queued":true}';
    };
    const localOnly = backupService.performAutoBackupNow({ sync: false });
    const withSync = backupService.performAutoBackupNow({ sync: true });
    assert.notStrictEqual(localOnly, withSync);
    await Promise.all([localOnly, withSync]);

    let staleAttempts = 0;
    localStorage.setItem('saponify_data_version', '200');
    backupService.exportAllData = async () => {
        staleAttempts += 1;
        if (staleAttempts === 1) localStorage.setItem('saponify_data_version', '201');
        return '{"stale":true}';
    };
    const staleResult = await backupService.performAutoBackupNow({ sync: false });
    assert.equal(staleResult.created, false);
    assert.equal(staleResult.isCurrent, false);
    assert.equal(staleResult.retryScheduled, true);
    await waitForQueue();
    assert.equal(staleAttempts, 2, 'a stale snapshot must be retried once');

    const importGate = deferred();
    let importCalls = 0;
    backupService.composer = {
        exportAllData: async () => '{"from":"composer"}',
        importAllData: async () => {
            importCalls += 1;
            await importGate.promise;
            return true;
        }
    };
    const firstImport = backupService.importAllData('{"first":true}');
    assert.equal(backupService.isImporting(), true);
    assert.equal(await backupService.importAllData('{"second":true}'), false);
    assert.equal(importCalls, 1, 'overlapping imports must not reach the composer');

    let importBlockedBackupExports = 0;
    backupService.exportAllData = async () => {
        importBlockedBackupExports += 1;
        return '{"after":"import"}';
    };
    localStorage.setItem('saponify_data_version', '300');
    const importBlockedBackup = await backupService.performAutoBackupNow({ sync: false });
    assert.equal(importBlockedBackup.created, false);
    assert.equal(importBlockedBackup.skippedReason, 'import-in-progress');
    assert.equal(importBlockedBackup.retryScheduled, true);
    assert.equal(importBlockedBackupExports, 0, 'a backup must not export while import is active');
    importGate.resolve();
    assert.equal(await firstImport, true);
    await waitForQueue();
    assert.equal(importBlockedBackupExports, 1, 'the backup must retry after the import completes');
    assert.equal(backupService.isImporting(), false);

    const pushedPayloads = [];
    let syncAttempts = 0;
    backupService.setSyncProvider({
        start: async () => undefined,
        pull: async () => null,
        push: async payload => { pushedPayloads.push(payload); }
    });
    localStorage.setItem('saponify_data_version', '400');
    backupService.exportAllData = async () => {
        syncAttempts += 1;
        if (syncAttempts === 1) {
            localStorage.setItem('saponify_data_version', '401');
            return '{"payload":"stale"}';
        }
        return '{"payload":"current"}';
    };
    const staleSyncResult = await backupService.performAutoBackupNow();
    assert.equal(staleSyncResult.created, false);
    assert.equal(staleSyncResult.skippedReason, 'data-changed');
    await waitForQueue();
    assert.deepEqual(pushedPayloads, ['{"payload":"current"}'], 'a stale export must never be uploaded');

    const decryptGate = deferred();
    let decryptedImportCalls = 0;
    backupService.composer = {
        exportAllData: async () => '{"unused":true}',
        importAllData: async () => {
            decryptedImportCalls += 1;
            return true;
        }
    };
    backupService.getEncryptionProvider = () => ({
        encrypt: async value => value,
        decrypt: async () => decryptGate.promise
    });
    const encryptedTimestamp = '2099-01-01T00:00:00.000Z';
    storage.setData('ENCRYPTED:payload', encryptedTimestamp, '500');
    localStorage.setItem('saponify_data_version', '500');
    const restore = backupService.restoreAutoBackupAt(encryptedTimestamp, 'password', { expectedDataVersion: '500' });
    localStorage.setItem('saponify_data_version', '501');
    decryptGate.resolve('{"decrypted":true}');
    assert.equal(await restore, false);
    assert.equal(decryptedImportCalls, 0, 'a decrypting restore must recheck its expected data version');

    const collisionTime = '2099-02-01T00:00:00.000Z';
    storage.setData('{"copy":"local"}', collisionTime, '501');
    storage.setData('{"copy":"remote"}', collisionTime, '501');
    const collisionCopies = storage.getAllBackups().filter(item => item.timestamp === collisionTime);
    assert.equal(collisionCopies.length, 2, 'equal timestamps must not discard a distinct recovery copy');
    assert.notEqual(collisionCopies[0].id, collisionCopies[1].id);
    let restoredCopy;
    backupService.composer.importAllData = async data => { restoredCopy = data; return true; };
    const localCopy = collisionCopies.find(item => item.data.includes('local'));
    assert.equal(await backupService.restoreAutoBackupAt(localCopy.id), true);
    assert.equal(restoredCopy, '{"copy":"local"}', 'restore must select by identity, not ambiguous timestamp');
    console.log('backup-storage: ok');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
