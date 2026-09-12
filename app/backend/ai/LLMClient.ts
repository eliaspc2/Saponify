import type { LLMProviderType } from '../../shared/types/Settings';

export type { LLMProviderType } from '../../shared/types/Settings';

export type LLMClientOptions = {
    provider: LLMProviderType;
    apiKey?: string;
    model: string;
    baseUrl?: string;
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const REQUEST_TIMEOUT_MS = 30_000;

const BASE_URL_DEFAULTS: Record<LLMProviderType, string> = {
    'openai-compatible': DEFAULT_OPENAI_BASE_URL,
    anthropic: DEFAULT_ANTHROPIC_BASE_URL,
    ollama: DEFAULT_OLLAMA_BASE_URL
};

const providerLabel = (provider: LLMProviderType): string => {
    if (provider === 'anthropic') return 'Anthropic';
    if (provider === 'ollama') return 'Ollama';
    return 'OpenAI compatível';
};

const normalizeProvider = (value?: string): LLMProviderType => {
    if (value === 'anthropic' || value === 'ollama' || value === 'openai-compatible') {
        return value;
    }
    return 'openai-compatible';
};

const normalizeBaseUrl = (provider: LLMProviderType, value?: string): string => {
    const fallback = BASE_URL_DEFAULTS[provider];
    let trimmed = (value || fallback).trim().replace(/\/+$/, '');
    const suffixes = [
        '/chat/completions',
        '/models',
        '/messages',
        '/api/chat',
        '/api/tags'
    ];

    for (const suffix of suffixes) {
        if (trimmed.endsWith(suffix)) {
            trimmed = trimmed.slice(0, -suffix.length);
        }
    }

    const normalized = trimmed || fallback;
    try {
        const url = new URL(normalized);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error();
        }
        return normalized;
    } catch {
        throw new Error(`URL base inválido para ${providerLabel(provider)}.`);
    }
};

const parseJsonObject = (content: string, source: string): object => {
    const trimmed = content.trim();
    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`Resposta inválida de ${source}: JSON não é object.`);
        }
        return parsed;
    } catch {
        throw new Error(`Resposta inválida de ${source}: JSON inválido.`);
    }
};

const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
    try {
        const errorBody = await response.json();
        const message = errorBody?.error?.message
            || errorBody?.error
            || errorBody?.message;
        return typeof message === 'string' && message.trim() ? message : fallback;
    } catch {
        return fallback;
    }
};

const readJsonResponse = async (response: Response, source: string): Promise<any> => {
    try {
        return await response.json();
    } catch {
        throw new Error(`Resposta inválida de ${source}: JSON de resposta malformado.`);
    }
};

const isDirectAnthropicApi = (baseUrl: string): boolean => {
    try {
        return new URL(baseUrl).hostname === 'api.anthropic.com';
    } catch {
        return false;
    }
};

const fetchWithTimeout = async (url: string, init: RequestInit, source: string): Promise<Response> => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`Pedido a ${source} excedeu o limite de ${REQUEST_TIMEOUT_MS / 1000} segundos.`);
        }
        throw error;
    } finally {
        globalThis.clearTimeout(timer);
    }
};

export class LLMClient {
    private provider: LLMProviderType;
    private apiKey: string;
    private model: string;
    private baseUrl: string;

    constructor(options: LLMClientOptions) {
        this.provider = normalizeProvider(options.provider);
        this.apiKey = (options.apiKey || '').trim();
        this.model = (options.model || '').trim();
        this.baseUrl = normalizeBaseUrl(this.provider, options.baseUrl);
    }

    async generateJson(prompt: object): Promise<object> {
        if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) {
            throw new Error('Prompt inválido: esperado object.');
        }
        if (!this.model) {
            throw new Error('Modelo LLM não configurado.');
        }

        if (this.provider === 'anthropic') {
            return this.generateJsonAnthropic(prompt);
        }
        if (this.provider === 'ollama') {
            return this.generateJsonOllama(prompt);
        }
        return this.generateJsonOpenAICompatible(prompt);
    }

    async listModels(): Promise<string[]> {
        if (this.provider === 'anthropic') {
            return this.listAnthropicModels();
        }
        if (this.provider === 'ollama') {
            return this.listOllamaModels();
        }
        return this.listOpenAICompatibleModels();
    }

    private async generateJsonOpenAICompatible(prompt: object): Promise<object> {
        const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
            },
            body: JSON.stringify({
                model: this.model,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'Responde apenas com um objeto JSON válido, sem Markdown.' },
                    { role: 'user', content: JSON.stringify(prompt) }
                ]
            })
        }, 'LLM OpenAI compatível');

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Erro ao comunicar com LLM OpenAI compatível.'));
        }

        const data = await readJsonResponse(response, 'LLM OpenAI compatível');
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
            throw new Error('Resposta inválida de LLM OpenAI compatível: conteúdo ausente.');
        }
        return parseJsonObject(content, 'LLM OpenAI compatível');
    }

    private async generateJsonAnthropic(prompt: object): Promise<object> {
        if (!this.apiKey) {
            throw new Error('API key Anthropic não configurada.');
        }

        const response = await fetchWithTimeout(`${this.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                ...(isDirectAnthropicApi(this.baseUrl)
                    ? { 'anthropic-dangerous-direct-browser-access': 'true' }
                    : {})
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 6000,
                messages: [{
                    role: 'user',
                    content: `Responde apenas com JSON válido, sem Markdown.\n\n${JSON.stringify(prompt)}`
                }]
            })
        }, 'Anthropic');

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Erro ao comunicar com Anthropic.'));
        }

        const data = await readJsonResponse(response, 'Anthropic');
        const content = Array.isArray(data?.content)
            ? data.content
                .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
                .map((part: any) => part.text)
                .join('')
            : '';
        if (!content) {
            throw new Error('Resposta inválida de Anthropic: conteúdo ausente.');
        }
        return parseJsonObject(content, 'Anthropic');
    }

    private async generateJsonOllama(prompt: object): Promise<object> {
        const response = await fetchWithTimeout(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
            },
            body: JSON.stringify({
                model: this.model,
                stream: false,
                format: 'json',
                messages: [{ role: 'user', content: JSON.stringify(prompt) }]
            })
        }, 'Ollama');

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Erro ao comunicar com Ollama.'));
        }

        const data = await readJsonResponse(response, 'Ollama');
        const content = data?.message?.content;
        if (typeof content !== 'string') {
            throw new Error('Resposta inválida de Ollama: conteúdo ausente.');
        }
        return parseJsonObject(content, 'Ollama');
    }

    private async listOpenAICompatibleModels(): Promise<string[]> {
        const response = await fetchWithTimeout(`${this.baseUrl}/models`, {
            method: 'GET',
            headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
        }, 'LLM OpenAI compatível');

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Erro ao obter modelos do LLM OpenAI compatível.'));
        }

        const data = await readJsonResponse(response, 'LLM OpenAI compatível');
        const models = Array.isArray(data?.data) ? data.data : [];
        return this.requireModelIds(models.map((item: any) => item?.id));
    }

    private async listAnthropicModels(): Promise<string[]> {
        if (!this.apiKey) {
            throw new Error('API key Anthropic não configurada.');
        }

        const response = await fetchWithTimeout(`${this.baseUrl}/models`, {
            method: 'GET',
            headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                ...(isDirectAnthropicApi(this.baseUrl)
                    ? { 'anthropic-dangerous-direct-browser-access': 'true' }
                    : {})
            }
        }, 'Anthropic');

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Erro ao obter modelos da Anthropic.'));
        }

        const data = await readJsonResponse(response, 'Anthropic');
        const models = Array.isArray(data?.data) ? data.data : [];
        return this.requireModelIds(models.map((item: any) => item?.id));
    }

    private async listOllamaModels(): Promise<string[]> {
        const response = await fetchWithTimeout(`${this.baseUrl}/api/tags`, {
            method: 'GET',
            headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
        }, 'Ollama');

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Erro ao obter modelos do Ollama.'));
        }

        const data = await readJsonResponse(response, 'Ollama');
        const models = Array.isArray(data?.models) ? data.models : [];
        return this.requireModelIds(models.map((item: any) => item?.name));
    }

    private requireModelIds(values: unknown[]): string[] {
        const ids = values
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .map((id) => id.trim());

        if (!ids.length) {
            throw new Error(`Nenhum modelo disponível em ${providerLabel(this.provider)}.`);
        }

        return ids;
    }
}

export const getDefaultLLMBaseUrl = (provider: LLMProviderType): string => BASE_URL_DEFAULTS[provider];
export const normalizeLLMProvider = normalizeProvider;
