const assert = require('node:assert/strict');
const { build } = require('esbuild');
const path = require('node:path');

async function run() {
    const bundle = await build({
        entryPoints: [path.resolve(__dirname, '../../app/orchestrator/services/AppController.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
        define: { 'import.meta.env.BASE_URL': '"/"' }
    });
    const values = new Map();
    global.localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    const intervals = new Map();
    const timeouts = new Map();
    let timerId = 0;
    global.window = {
        setInterval: fn => { intervals.set(++timerId, fn); return timerId; },
        clearInterval: id => intervals.delete(id),
        setTimeout: fn => { timeouts.set(++timerId, fn); return timerId; },
        clearTimeout: id => timeouts.delete(id)
    };
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(loaded, loaded.exports, require);
    const { AppController } = loaded.exports;
    const calls = [];
    let editing = false;
    let applied = 0;
    let importOk = true;
    const backupService = {
        setSyncProvider() {},
        async performAutoBackupNow(options) { calls.push(['backup', options]); },
        async performAutoBackup() { calls.push(['backup']); },
        async importAllData(data) {
            calls.push(['import', data]);
            if (importOk) localStorage.setItem('saponify_data_version', '999');
            return importOk;
        }
    };
    const syncProvider = {
        async start() { calls.push(['start']); },
        isSyncActive: () => true,
        confirmRemoteImport() { calls.push(['confirm']); return true; }
    };
    const controller = new AppController({
        backupService, syncProvider,
        settingsService: { getSettings: () => ({}) },
        calculatorUseCase: {},
        canApplyRemote: () => !editing,
        onRemoteDataApplied: () => { applied++; }
    });
    localStorage.setItem('saponify_data_version', '100');
    await controller.init();
    assert.deepEqual(calls.slice(0, 2), [['backup', { sync: false }], ['start']]);
    assert.equal(intervals.size, 1);
    await controller.init();
    assert.equal(intervals.size, 1, 'initialization must not duplicate watchers');
    const tick = async () => {
        for (const fn of intervals.values()) fn();
        await new Promise(resolve => setImmediate(resolve));
    };
    const stage = (version = '100') => {
        localStorage.setItem('saponify_sync_pending_import', 'true');
        localStorage.setItem('saponify_sync_pending_data_version', version);
        localStorage.setItem('saponify_sync_pending_payload', '{"source":"remote"}');
    };
    stage();
    editing = true;
    await tick();
    assert.equal(applied, 0, 'editing must defer automatic import');
    editing = false;
    await tick();
    assert.equal(applied, 1, 'remote data must be applied during this session');
    assert.equal(localStorage.getItem('saponify_data_version'), '100');
    assert.equal(localStorage.getItem('saponify_sync_pending_import'), null);
    await tick();
    assert.equal(timeouts.size, 0, 'import must not trigger a new backup');
    stage();
    localStorage.setItem('saponify_data_version', '101');
    await tick();
    assert.equal(applied, 1, 'local edits after reception must survive');
    assert.match(localStorage.getItem('saponify_sync_last_error'), /alterações locais/);
    localStorage.setItem('saponify_data_version', '100');
    importOk = false;
    await tick();
    assert.equal(localStorage.getItem('saponify_sync_pending_import'), 'true');
    assert.equal(applied, 1, 'failed import must remain pending');
    controller.dispose();
    assert.equal(intervals.size, 0);
    assert.equal(timeouts.size, 0);
    console.log('Controller sync regressions passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
