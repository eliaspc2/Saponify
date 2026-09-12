export type LLMProviderType = 'openai-compatible' | 'anthropic' | 'ollama';

export type LLMConfiguration = {
    provider: LLMProviderType;
    apiKey: string;
    baseUrl: string;
    model: string;
};

export interface AppSettings {
    defaultSuperfat: number;
    defaultWaterConcentration: number;
    defaultAlkali: 'NaOH' | 'KOH';
    defaultAlkaliPurity: number;
    language: 'pt' | 'en';
    measurementSystem: 'metric' | 'imperial';
    recipePrefix: string;
    autoSave: boolean;
    theme: 'light' | 'dark' | 'system';

    // Backup automático
    autoBackupEnabled: boolean;
    autoBackupPath: string;
    autoBackupEncrypted: boolean;
    autoBackupPassword: string;
    lastAutoBackup: string | null;

    // Integrações externas (IA/LLM)
    llmProvider: LLMProviderType;
    llmApiKey: string;
    llmBaseUrl: string;
    llmModel: string;
    llmModels: string[];

    // Campos legados, mantidos para migrar configuracoes existentes.
    openaiApiKey: string;
    openaiBaseUrl: string;
    openaiModel: string;
    openaiModels: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
    defaultSuperfat: 7,
    defaultWaterConcentration: 29,
    defaultAlkali: 'NaOH',
    defaultAlkaliPurity: 100,
    language: 'pt',
    measurementSystem: 'metric',
    recipePrefix: 'RE',
    autoSave: true,
    theme: 'system',
    autoBackupEnabled: false,
    autoBackupPath: '',
    autoBackupEncrypted: true,
    autoBackupPassword: '',
    lastAutoBackup: null,
    llmProvider: 'openai-compatible',
    llmApiKey: '',
    llmBaseUrl: 'https://api.openai.com/v1',
    llmModel: 'gpt-4o-mini',
    llmModels: [],
    openaiApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-4o-mini',
    openaiModels: []
};

const LLM_SETTING_KEYS = ['llmProvider', 'llmApiKey', 'llmBaseUrl', 'llmModel', 'llmModels'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return !!value && typeof value === 'object' && !Array.isArray(value);
};

const hasOwn = (value: Record<string, unknown>, key: string): boolean => {
    return Object.prototype.hasOwnProperty.call(value, key);
};

const getString = (value: Record<string, unknown>, key: string, fallback: string): string => {
    return typeof value[key] === 'string' ? value[key] : fallback;
};

const getStringList = (value: Record<string, unknown>, key: string, fallback: string[]): string[] => {
    if (!Array.isArray(value[key])) return fallback;
    return value[key].filter((item): item is string => typeof item === 'string');
};

const normalizeProvider = (value: unknown): LLMProviderType => {
    if (value === 'anthropic' || value === 'ollama' || value === 'openai-compatible') {
        return value;
    }
    return 'openai-compatible';
};

/**
 * Merges persisted settings while migrating the former OpenAI-only fields once.
 * Modern LLM fields always remain authoritative so stale legacy credentials cannot
 * be attached to a different provider.
 */
export const mergeAppSettingsWithDefaults = (defaults: AppSettings, stored: unknown): AppSettings => {
    const source = isRecord(stored) ? stored : {};
    const merged = { ...defaults, ...source } as AppSettings;
    const hasModernLlmSettings = LLM_SETTING_KEYS.some((key) => hasOwn(source, key));

    if (!hasModernLlmSettings) {
        return {
            ...merged,
            llmProvider: 'openai-compatible',
            llmApiKey: getString(source, 'openaiApiKey', defaults.openaiApiKey),
            llmBaseUrl: getString(source, 'openaiBaseUrl', defaults.openaiBaseUrl),
            llmModel: getString(source, 'openaiModel', defaults.openaiModel),
            llmModels: getStringList(source, 'openaiModels', defaults.openaiModels)
        };
    }

    return {
        ...merged,
        llmProvider: normalizeProvider(source.llmProvider),
        llmApiKey: getString(source, 'llmApiKey', defaults.llmApiKey),
        llmBaseUrl: getString(source, 'llmBaseUrl', defaults.llmBaseUrl),
        llmModel: getString(source, 'llmModel', defaults.llmModel),
        llmModels: getStringList(source, 'llmModels', defaults.llmModels)
    };
};

export const resolveLLMConfiguration = (settings: AppSettings): LLMConfiguration => ({
    provider: normalizeProvider(settings.llmProvider),
    apiKey: settings.llmApiKey.trim(),
    baseUrl: settings.llmBaseUrl.trim(),
    model: settings.llmModel.trim()
});

export const isLocalLLMBaseUrl = (baseUrl: string): boolean => {
    try {
        const hostname = new URL(baseUrl).hostname.toLowerCase();
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    } catch {
        return false;
    }
};
