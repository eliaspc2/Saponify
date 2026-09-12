const assert = require('node:assert/strict');
const { build } = require('esbuild');
const path = require('node:path');

class MemoryStorage {
    constructor() {
        this.values = new Map();
        this.failures = new Map();
    }

    getItem(key) {
        return this.values.get(key) ?? null;
    }

    setItem(key, value) {
        const remaining = this.failures.get(key) || 0;
        if (remaining > 0) {
            this.failures.set(key, remaining - 1);
            throw new Error(`Simulated storage failure for ${key}`);
        }
        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }

    failNextWrite(key) {
        this.failures.set(key, 1);
    }

    snapshot() {
        return new Map(this.values);
    }
}

async function loadBackupComposer() {
    const bundle = await build({
        entryPoints: [path.resolve(__dirname, '../../app/backend/application/backup/BackupComposer.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
        define: { 'import.meta.env.BASE_URL': '"/"' }
    });
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(loaded, loaded.exports, require);
    return loaded.exports.BackupComposer;
}

const createPayload = (overrides = {}) => ({
    version: 'test',
    timestamp: '2026-01-01T00:00:00.000Z',
    meta: { versionInfo: { dataSchemaVersion: 1 } },
    recipes: [],
    recipeCalculations: [],
    clients: [],
    activities: [],
    ingredients: [],
    settings: {
        openaiApiKey: 'legacy-token',
        openaiBaseUrl: 'http://127.0.0.1:1234/v1',
        openaiModel: 'legacy-model'
    },
    questionnaires: [],
    ...overrides
});

async function importExpectingFailure(composer, payload, options) {
    const originalError = console.error;
    console.error = () => {};
    try {
        return await composer.importAllData(JSON.stringify(payload), options);
    } finally {
        console.error = originalError;
    }
}

async function run() {
    const storage = new MemoryStorage();
    global.localStorage = storage;
    const BackupComposer = await loadBackupComposer();
    const composer = new BackupComposer();

    const baseline = createPayload({
        clients: [{ id: 'client-baseline', name: 'Baseline' }]
    });
    assert.equal(await composer.importAllData(JSON.stringify(baseline)), true);

    const migratedSettings = JSON.parse(storage.getItem('saponify_settings'));
    assert.equal(migratedSettings.llmApiKey, 'legacy-token');
    assert.equal(migratedSettings.llmBaseUrl, 'http://127.0.0.1:1234/v1');
    assert.equal(migratedSettings.llmModel, 'legacy-model');

    const beforeMalformedImport = storage.snapshot();
    const malformed = createPayload({ clients: { id: 'not-an-array' } });
    assert.equal(await importExpectingFailure(composer, malformed), false);
    assert.deepEqual(storage.snapshot(), beforeMalformedImport, 'malformed input must not write any data');

    const malformedEntity = createPayload({ clients: [{}] });
    assert.equal(await importExpectingFailure(composer, malformedEntity), false);
    assert.deepEqual(storage.snapshot(), beforeMalformedImport, 'entities without IDs must not write any data');

    const duplicateIds = createPayload({
        clients: [{ id: 'duplicate' }, { id: 'duplicate' }]
    });
    assert.equal(await importExpectingFailure(composer, duplicateIds), false);
    assert.deepEqual(storage.snapshot(), beforeMalformedImport, 'duplicate IDs must not write any data');

    const versionBeforeGuard = storage.snapshot();
    storage.setItem('saponify_data_version', 'newer-local-edit');
    assert.equal(await importExpectingFailure(composer, baseline, { expectedDataVersion: 'older-snapshot' }), false);
    assert.equal(storage.getItem('saponify_settings'), versionBeforeGuard.get('saponify_settings'));

    const changed = createPayload({
        clients: [{ id: 'client-changed', name: 'Changed' }],
        recipes: [{ id: 'recipe-changed', code: 'RE0001', name: 'Changed', date: '2026-01-02', clientId: null }],
        settings: {
            llmProvider: 'ollama',
            llmApiKey: '',
            llmBaseUrl: 'http://127.0.0.1:11434',
            llmModel: 'draft-model',
            openaiApiKey: 'legacy-token'
        }
    });
    const beforeFailedWrite = JSON.parse(await composer.exportAllData());
    storage.failNextWrite('saponify_recipes');
    assert.equal(await importExpectingFailure(composer, changed), false);

    const afterRollback = JSON.parse(await composer.exportAllData());
    assert.deepEqual(afterRollback.clients, beforeFailedWrite.clients);
    assert.deepEqual(afterRollback.recipes, beforeFailedWrite.recipes);
    assert.deepEqual(afterRollback.ingredients, beforeFailedWrite.ingredients);
    assert.deepEqual(afterRollback.activities, beforeFailedWrite.activities);
    assert.deepEqual(afterRollback.questionnaires, beforeFailedWrite.questionnaires);
    assert.deepEqual(afterRollback.settings, beforeFailedWrite.settings);

    console.log('backup-import: ok');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
