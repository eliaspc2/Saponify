const assert = require('node:assert/strict');
const { build } = require('esbuild');
const path = require('node:path');

async function loadBundle(entryPoint) {
    const bundle = await build({
        entryPoints: [path.resolve(__dirname, entryPoint)],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false
    });
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(loaded, loaded.exports, require);
    return loaded.exports;
}

async function run() {
    const {
        DEFAULT_SETTINGS,
        isLocalLLMBaseUrl,
        mergeAppSettingsWithDefaults,
        resolveLLMConfiguration
    } = await loadBundle('../../app/shared/types/Settings.ts');
    const { LLMClient } = await loadBundle('../../app/backend/ai/LLMClient.ts');
    const { LLMProvider } = await loadBundle('../../app/backend/ai/LLMProvider.ts');

    const legacy = mergeAppSettingsWithDefaults(DEFAULT_SETTINGS, {
        openaiApiKey: 'legacy-token',
        openaiBaseUrl: 'http://127.0.0.1:1234/v1',
        openaiModel: 'legacy-model',
        openaiModels: ['legacy-model']
    });
    assert.equal(legacy.llmProvider, 'openai-compatible');
    assert.equal(legacy.llmApiKey, 'legacy-token');
    assert.equal(legacy.llmBaseUrl, 'http://127.0.0.1:1234/v1');
    assert.equal(legacy.llmModel, 'legacy-model');

    const modern = mergeAppSettingsWithDefaults(DEFAULT_SETTINGS, {
        llmProvider: 'anthropic',
        llmApiKey: 'anthropic-token',
        llmBaseUrl: 'https://api.anthropic.com/v1',
        llmModel: 'claude-test',
        openaiApiKey: 'stale-token'
    });
    assert.equal(resolveLLMConfiguration(modern).apiKey, 'anthropic-token');
    assert.equal(isLocalLLMBaseUrl('http://localhost:1234/v1'), true);
    assert.equal(isLocalLLMBaseUrl('https://api.openai.com/v1'), false);

    const requests = [];
    global.fetch = async (url, init) => {
        requests.push({ url, init });
        return { ok: true, json: async () => ({ data: [{ id: 'local-model' }] }) };
    };

    const localClient = new LLMClient({
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:1234/v1',
        model: 'local-model'
    });
    assert.deepEqual(await localClient.listModels(), ['local-model']);
    assert.equal(requests[0].url, 'http://127.0.0.1:1234/v1/models');
    assert.equal('Authorization' in requests[0].init.headers, false);

    const storedSettings = {
        ...DEFAULT_SETTINGS,
        llmProvider: 'anthropic',
        llmApiKey: '',
        llmBaseUrl: 'https://api.anthropic.com/v1',
        llmModel: 'claude-test',
        openaiApiKey: 'stale-token'
    };
    const provider = new LLMProvider({ getSettings: () => storedSettings });
    assert.equal(provider.isConfigured(), false, 'stale legacy tokens must not configure a modern provider');

    requests.length = 0;
    global.fetch = async (url, init) => {
        requests.push({ url, init });
        return { ok: true, json: async () => ({ models: [{ name: 'draft-model' }] }) };
    };
    assert.deepEqual(await provider.listModels({
        ...DEFAULT_SETTINGS,
        llmProvider: 'ollama',
        llmApiKey: '',
        llmBaseUrl: 'http://127.0.0.1:11434',
        llmModel: 'draft-model',
        openaiApiKey: 'stale-token'
    }), ['draft-model']);
    assert.equal(requests[0].url, 'http://127.0.0.1:11434/api/tags');
    assert.equal('Authorization' in requests[0].init.headers, false);

    global.fetch = async () => ({
        ok: true,
        json: async () => { throw new Error('invalid json'); }
    });
    await assert.rejects(
        () => localClient.generateJson({ request: 'test' }),
        /JSON de resposta malformado/
    );

    console.log('llm-client: ok');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
