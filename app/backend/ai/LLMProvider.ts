import { SettingsService } from '../infrastructure/services/SettingsService';
import { LLMClient, type LLMProviderType } from './LLMClient';
import { GeneratedRecipeValidator } from './validators/GeneratedRecipeValidator';
import type { ValidatedRecipe } from './schemas/GeneratedRecipeSchema';
import {
    isLocalLLMBaseUrl,
    resolveLLMConfiguration,
    type AppSettings
} from '../../shared/types/Settings';

type ResolvedLLMSettings = {
    provider: LLMProviderType;
    apiKey: string;
    baseUrl: string;
    model: string;
};

export class LLMProvider {
    private settingsService: SettingsService;

    constructor(settingsService?: SettingsService) {
        this.settingsService = settingsService || SettingsService.getInstance();
    }

    isConfigured(): boolean {
        const settings = this.resolveSettings();
        if (!settings.model) return false;
        if (settings.provider === 'ollama') return !!settings.baseUrl;
        return !!settings.apiKey || (settings.provider === 'openai-compatible' && isLocalLLMBaseUrl(settings.baseUrl));
    }

    async generateJson(prompt: object): Promise<object> {
        const settings = this.resolveSettings();
        if (!settings.model) {
            throw new Error('Modelo LLM não configurado.');
        }
        if (settings.provider !== 'ollama'
            && !(settings.provider === 'openai-compatible' && isLocalLLMBaseUrl(settings.baseUrl))
            && !settings.apiKey) {
            throw new Error('API key do LLM não configurada.');
        }

        const client = new LLMClient(settings);
        return client.generateJson(prompt);
    }

    async generateAndValidateRecipe(prompt: object): Promise<{ validated: ValidatedRecipe; response: object }> {
        const availableIngredients = (prompt as any)?.available_ingredients;
        const rules = (prompt as any)?.rules;
        if (!Array.isArray(availableIngredients)) {
            throw new Error('Prompt inválido: available_ingredients ausente.');
        }
        try {
            const response = await this.generateJson(prompt);
            try {
                const validated = GeneratedRecipeValidator.validate(response, {
                    availableIngredients,
                    rules
                });
                return { validated, response };
            } catch (error) {
                const err = new Error((error as Error)?.message || 'Resposta inválida da IA.');
                (err as any).debug = {
                    prompt,
                    response,
                    responseText: JSON.stringify(response, null, 2),
                    responseLabel: 'Resposta da IA (inválida)'
                };
                throw err;
            }
        } catch (error) {
            const err = new Error((error as Error)?.message || 'Erro ao gerar receita com IA.');
            (err as any).debug = {
                prompt,
                responseText: (error as Error)?.message || '',
                responseLabel: 'Erro da IA'
            };
            throw err;
        }
    }

    async listModels(overrides?: AppSettings): Promise<string[]> {
        const settings = this.resolveSettings(overrides);
        if (settings.provider !== 'ollama'
            && !(settings.provider === 'openai-compatible' && isLocalLLMBaseUrl(settings.baseUrl))
            && !settings.apiKey) {
            throw new Error('API key do LLM não configurada.');
        }
        const client = new LLMClient(settings);
        return client.listModels();
    }

    private resolveSettings(overrides?: AppSettings): ResolvedLLMSettings {
        const settings = overrides || this.settingsService.getSettings() as AppSettings;
        return resolveLLMConfiguration(settings);
    }
}
