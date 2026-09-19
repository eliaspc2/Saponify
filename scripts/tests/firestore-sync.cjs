const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const { build } = require('esbuild');

class MemoryStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

class FirestoreMock {
    constructor(remote = null) {
        this.remote = remote;
        this.auth = { currentUser: { uid: 'user-a' } };
        this.authListeners = new Set();
        this.getDocCalls = 0;
        this.getDocFromServerCalls = 0;
        this.transactionCalls = 0;
        this.settings = null;
        this.transactionError = null;
        this.beforeTransactionRead = null;
    }

    snapshot() {
        const remote = this.remote;
        return { exists: () => remote !== null, data: () => remote };
    }

    async runTransaction(update) {
        this.transactionCalls += 1;
        if (this.transactionError) {
            const error = this.transactionError;
            this.transactionError = null;
            throw error;
        }
        let nextRemote;
        const result = await update({
            get: async () => {
                if (this.beforeTransactionRead) await this.beforeTransactionRead();
                return this.snapshot();
            },
            set: (_ref, payload) => { nextRemote = payload; }
        });
        if (nextRemote !== undefined) this.remote = nextRemote;
        return result;
    }

    setUser(uid) {
        this.auth.currentUser = uid ? { uid } : null;
        for (const listener of this.authListeners) listener(this.auth.currentUser);
    }
}

const firebaseMockPlugin = {
    name: 'firebase-sync-test-mocks',
    setup(buildContext) {
        buildContext.onResolve({ filter: /^firebase\/app$/ }, () => ({ path: 'firebase-app', namespace: 'sync-mock' }));
        buildContext.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'firebase-auth', namespace: 'sync-mock' }));
        buildContext.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: 'firebase-firestore', namespace: 'sync-mock' }));
        buildContext.onResolve({ filter: /backend\/application\/backup\/BackupService$/ }, () => ({ path: 'backup-service', namespace: 'sync-mock' }));
        buildContext.onLoad({ filter: /.*/, namespace: 'sync-mock' }, (args) => {
            const modules = {
                'firebase-app': `
                    export const initializeApp = () => ({});
                    export const getApps = () => [];
                `,
                'firebase-auth': `
                    const mock = () => globalThis.__firestoreSyncMock;
                    export const getAuth = () => mock().auth;
                    export const browserLocalPersistence = {};
                    export const setPersistence = async () => {};
                    export const onAuthStateChanged = (auth, listener) => {
                        mock().authListeners.add(listener);
                        listener(auth.currentUser);
                        return () => mock().authListeners.delete(listener);
                    };
                    export const getRedirectResult = async () => null;
                    export const signInWithPopup = async () => ({ user: mock().auth.currentUser });
                    export const signInWithRedirect = async () => {};
                    export const signOut = async (auth) => { mock().setUser(null); };
                    export class GoogleAuthProvider {}
                `,
                'firebase-firestore': `
                    const mock = () => globalThis.__firestoreSyncMock;
                    export const initializeFirestore = (_app, settings) => { mock().settings = settings; return {}; };
                    export const doc = (_db, ...path) => ({ path });
                    export const getDoc = async () => { mock().getDocCalls += 1; return mock().snapshot(); };
                    export const getDocFromServer = async () => { mock().getDocFromServerCalls += 1; return mock().snapshot(); };
                    export const runTransaction = async (_db, update) => mock().runTransaction(update);
                `,
                'backup-service': `
                    export class BackupService {
                        static getInstance() { return globalThis.__firestoreSyncBackupService; }
                    }
                `
            };
            return { contents: modules[args.path], loader: 'js' };
        });
    }
};

async function loadService() {
    const bundle = await build({
        entryPoints: [path.resolve(__dirname, '../../app/orchestrator/services/FirestoreSyncService.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
        define: { 'import.meta.env.BASE_URL': '"/"' },
        plugins: [firebaseMockPlugin]
    });
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(loaded, loaded.exports, require);
    return loaded.exports.FirestoreSyncService;
}

function createEnvironment(remote = null) {
    const timers = new Map();
    const intervals = new Map();
    let timerId = 0;
    const firestore = new FirestoreMock(remote);
    globalThis.localStorage = new MemoryStorage();
    globalThis.crypto = webcrypto;
    globalThis.window = {
        crypto: webcrypto,
        setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
        clearTimeout: id => timers.delete(id),
        setInterval: (callback) => { const id = ++timerId; intervals.set(id, callback); return id; },
        clearInterval: id => intervals.delete(id)
    };
    globalThis.__firestoreSyncMock = firestore;
    globalThis.__firestoreSyncBackupService = {
        exportAllData: async () => '{"fresh":"export"}'
    };
    localStorage.setItem('saponify_sync_password', 'sync-password');
    localStorage.setItem('saponify_data_version', '100');
    return {
        firestore,
        timers,
        async runTimers() {
            while (timers.size) {
                const [id, callback] = timers.entries().next().value;
                timers.delete(id);
                callback();
                for (let turn = 0; turn < 4; turn += 1) {
                    await new Promise(resolve => setImmediate(resolve));
                }
            }
        }
    };
}

async function serviceFor(env, FirestoreSyncService) {
    const service = new FirestoreSyncService();
    await service.init();
    assert.equal(env.firestore.getDocCalls, 0, 'Firestore cache reads must not be used by sync');
    assert.deepEqual(env.firestore.settings, {
        experimentalForceLongPolling: true,
        experimentalLongPollingOptions: { timeoutSeconds: 25 }
    }, 'Firestore must use long polling when WebChannel streaming is blocked');
    return service;
}

function writeFor(service, data, updatedAt = '2026-09-12T10:00:00.000Z') {
    return {
        data,
        updatedAt,
        dataVersion: localStorage.getItem('saponify_data_version'),
        uid: 'user-a',
        session: service.session,
        writeGeneration: service.writeGeneration
    };
}

async function testStaleSignatureConflict(FirestoreSyncService) {
    const remote = { data: '{"remote":"new"}', updatedAt: '2026-09-12T09:00:00.000Z', deviceId: 'other-device', revision: 7 };
    const env = createEnvironment(remote);
    const service = await serviceFor(env, FirestoreSyncService);
    localStorage.setItem('saponify_sync_remote_revision_user-a', '7');
    localStorage.setItem('saponify_sync_remote_signature_user-a', JSON.stringify({ revision: 7, updatedAt: '2026-09-12T08:00:00.000Z', deviceId: 'old-device' }));

    assert.equal(await service.commitWrite(writeFor(service, '{"local":"must-not-overwrite"}'), false), 'conflict');
    assert.deepEqual(env.firestore.remote, remote);
    assert.equal(localStorage.getItem('saponify_sync_conflict_user-a'), 'true');
}

async function testTransientRetryUsesLatestWrite(FirestoreSyncService) {
    const env = createEnvironment();
    const service = await serviceFor(env, FirestoreSyncService);
    localStorage.setItem('saponify_sync_remote_revision_user-a', '0');
    env.firestore.transactionError = Object.assign(new Error('network unavailable'), { code: 'unavailable' });
    service.pendingWrite = writeFor(service, '{"revision":"old"}', '2026-09-12T10:00:00.000Z');
    assert.equal(await service.flushQueuedWrite(), false);
    service.enqueueWrite(writeFor(service, '{"revision":"latest"}', '2026-09-12T10:01:00.000Z'));
    await env.runTimers();
    while (service.writeWorker) await service.writeWorker;

    assert.equal(env.firestore.transactionCalls, 2);
    assert.equal(await service.decryptFromSync(env.firestore.remote.data), '{"revision":"latest"}');
}

async function testSessionCancellation(FirestoreSyncService) {
    const env = createEnvironment();
    const service = await serviceFor(env, FirestoreSyncService);
    localStorage.setItem('saponify_sync_remote_revision_user-a', '0');
    let releaseRead;
    const readStarted = new Promise(resolve => { env.firestore.beforeTransactionRead = () => { resolve(); return new Promise(next => { releaseRead = next; }); }; });
    const pending = service.commitWrite(writeFor(service, '{"session":"cancelled"}'), false);
    await readStarted;
    env.firestore.setUser(null);
    releaseRead();

    assert.equal(await pending, 'cancelled');
    assert.equal(env.firestore.remote, null);
}

async function testManualPullReplacesPendingStage(FirestoreSyncService) {
    const env = createEnvironment({ data: '{"remote":"fresh"}', updatedAt: '2026-09-12T12:00:00.000Z', deviceId: 'other-device', revision: 9 });
    const service = await serviceFor(env, FirestoreSyncService);
    localStorage.setItem('saponify_sync_last_error', 'Failed to get document because the client is offline.');
    localStorage.setItem('saponify_sync_pending_import', 'true');
    localStorage.setItem('saponify_sync_pending_payload', JSON.stringify({ uid: 'user-a', data: '{"remote":"stale"}', updatedAt: '2026-09-12T08:00:00.000Z', deviceId: 'other-device', revision: 8 }));

    assert.equal(await service.pullRemoteNow(), true);
    assert.equal(JSON.parse(localStorage.getItem('saponify_sync_pending_payload')).data, '{"remote":"fresh"}');
    assert.equal(env.firestore.getDocFromServerCalls, 1, 'manual pull must force a current server read');
    assert.equal(localStorage.getItem('saponify_sync_last_error'), '', 'a successful remote read must clear a transient offline warning');
}

async function testIncomingPreservesBackupUntilConfirmAndCapturesVersion(FirestoreSyncService) {
    const env = createEnvironment({ data: '{"remote":"incoming"}', updatedAt: '2026-09-12T12:00:00.000Z', deviceId: 'other-device', revision: 4 });
    const service = await serviceFor(env, FirestoreSyncService);
    localStorage.setItem('saponify_auto_backup', '{"local":"recovery"}');
    localStorage.setItem('saponify_auto_backup_timestamp', '2026-09-12T11:00:00.000Z');
    localStorage.setItem('saponify_data_version', '100');

    assert.equal(await service.pullRemoteNow(), true);
    assert.equal(localStorage.getItem('saponify_auto_backup'), '{"local":"recovery"}', 'incoming data must stay staged until confirmation');
    localStorage.setItem('saponify_data_version', '101');
    assert.equal(service.confirmRemoteImport(), false, 'local edits after staging must block confirmation');
    assert.equal(localStorage.getItem('saponify_auto_backup'), '{"local":"recovery"}');
    localStorage.setItem('saponify_data_version', '100');
    assert.equal(service.confirmRemoteImport(), true);
    assert.equal(service.storage.getCurrentData(), '{"remote":"incoming"}');
    assert.equal(localStorage.getItem('saponify_auto_backup'), null, 'confirmation must not duplicate the payload');
    assert.equal(localStorage.getItem('saponify_sync_local_data_version_user-a'), '100', 'confirmation must acknowledge the data version captured while staging');
}

async function testClockSkewDoesNotRejectRemote(FirestoreSyncService) {
    const env = createEnvironment({ data: '{"remote":"older-clock"}', updatedAt: '2020-01-01T00:00:00.000Z', deviceId: 'other-device', revision: 2 });
    const service = await serviceFor(env, FirestoreSyncService);
    localStorage.setItem('saponify_auto_backup', '{"local":"future-clock"}');
    localStorage.setItem('saponify_auto_backup_timestamp', '2099-01-01T00:00:00.000Z');
    localStorage.setItem('saponify_sync_local_data_version_user-a', '100');

    await service.start();
    assert.equal(JSON.parse(localStorage.getItem('saponify_sync_pending_payload')).data, '{"remote":"older-clock"}');
}

async function testEmptyRemoteExportsFreshDataNotEncryptedBackup(FirestoreSyncService) {
    const env = createEnvironment();
    const service = await serviceFor(env, FirestoreSyncService);
    localStorage.setItem('saponify_auto_backup', 'ENCRYPTED:local-backup-ciphertext');
    localStorage.setItem('saponify_auto_backup_timestamp', '2026-09-12T09:00:00.000Z');

    await service.start();
    await env.runTimers();
    while (service.writeWorker) await service.writeWorker;
    assert.equal(await service.decryptFromSync(env.firestore.remote.data), '{"fresh":"export"}');
    assert.notEqual(await service.decryptFromSync(env.firestore.remote.data), 'ENCRYPTED:local-backup-ciphertext');
}

async function testOwnerBlocksAnotherAccountAutomaticUpload(FirestoreSyncService) {
    const env = createEnvironment();
    const service = await serviceFor(env, FirestoreSyncService);
    localStorage.setItem('saponify_auto_backup', '{"local":"user-a"}');
    localStorage.setItem('saponify_auto_backup_timestamp', '2026-09-12T09:00:00.000Z');
    localStorage.setItem('saponify_sync_local_owner', 'user-a');
    env.firestore.setUser('user-b');

    await service.start();
    await env.runTimers();
    assert.equal(env.firestore.remote, null, 'another account must not automatically upload the prior owner data');
    assert.equal(localStorage.getItem('saponify_sync_conflict_user-b'), 'true');
}

async function testCompressedLargeBackup(FirestoreSyncService) {
    const env = createEnvironment();
    const service = await serviceFor(env, FirestoreSyncService);
    const data = JSON.stringify({ recipes: Array.from({ length: 12000 }, (_, id) => ({
        id, name: 'Receita de sabão', notes: 'Óleo de oliva, água, ingredientes e observações. '.repeat(5)
    })) });
    assert.ok(Buffer.byteLength(data) > 1000000);
    localStorage.setItem('saponify_sync_remote_revision_user-a', '0');
    assert.equal(await service.commitWrite(writeFor(service, data), false), 'success');
    assert.ok(Buffer.byteLength(env.firestore.remote.data) < 950000);
    assert.equal(await service.decryptFromSync(env.firestore.remote.data), data);
    assert.equal(await service.pullRemoteNow(), true);
    assert.equal(JSON.parse(localStorage.getItem('saponify_sync_pending_payload')).data, data);
    const small = '{"legacy":"sem compressão"}';
    assert.equal(await service.decryptFromSync(await service.encryptForSync(small)), small);
    localStorage.setItem('saponify_sync_password', 'wrong-password');
    await assert.rejects(service.decryptFromSync(env.firestore.remote.data));
}

async function testIncompressibleBackupStillProtected(FirestoreSyncService) {
    const env = createEnvironment();
    const service = await serviceFor(env, FirestoreSyncService);
    const data = JSON.stringify({ blob: require('node:crypto').randomBytes(1100000).toString('base64') });
    assert.equal(await service.commitWrite(writeFor(service, data), false), 'conflict');
    assert.equal(env.firestore.remote, null, 'oversized data must never replace a remote backup');
}

async function run() {
    const FirestoreSyncService = await loadService();
    const tests = [
        testCompressedLargeBackup,
        testIncompressibleBackupStillProtected,
        testStaleSignatureConflict,
        testTransientRetryUsesLatestWrite,
        testSessionCancellation,
        testManualPullReplacesPendingStage,
        testIncomingPreservesBackupUntilConfirmAndCapturesVersion,
        testClockSkewDoesNotRejectRemote,
        testEmptyRemoteExportsFreshDataNotEncryptedBackup,
        testOwnerBlocksAnotherAccountAutomaticUpload
    ];
    const failures = [];
    for (const test of tests) {
        try {
            await test(FirestoreSyncService);
            console.log(`${test.name}: ok`);
        } catch (error) {
            failures.push(`${test.name}: ${error.message}`);
            console.error(`${test.name}: ${error.stack || error.message}`);
        }
    }
    if (failures.length) throw new Error(`Firestore sync regressions failed:\n${failures.join('\n')}`);
    console.log('firestore-sync: ok');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
