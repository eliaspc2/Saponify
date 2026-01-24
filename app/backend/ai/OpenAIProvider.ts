import { SettingsService } from '../services/SettingsService';
import { OpenAIClient } from './OpenAIClient';
import { GeneratedRecipeValidator } from './validators/GeneratedRecipeValidator';
import type { ValidatedRecipe } from './schemas/GeneratedRecipeSchema';

export class OpenAIProvider {
    private settingsService: SettingsService;

    constructor(settingsService?: SettingsService) {
        this.settingsService = settingsService || SettingsService.getInstance();
    }

    isConfigured(): boolean {
        const settings = this.settingsService.getSettings();
        return !!settings.openaiApiKey?.trim();
    }

    async generateJson(prompt: object): Promise<object> {
        const settings = this.settingsService.getSettings();
        const apiKey = settings.openaiApiKey?.trim();
        if (!apiKey) {
            throw new Error('OpenAI API key não configurada.');
        }
        const model = settings.openaiModel?.trim();
        if (!model) {
            throw new Error('OpenAI model não configurado.');
        }

        const client = new OpenAIClient({ apiKey, model });
        return client.generateJson(prompt);
    }

    async generateAndValidateRecipe(prompt: object): Promise<ValidatedRecipe> {
        const availableIngredients = (prompt as any)?.available_ingredients;
        const rules = (prompt as any)?.rules;
        if (!Array.isArray(availableIngredients)) {
            throw new Error('Prompt inválido: available_ingredients ausente.');
        }
        try {
            const response = await this.generateJson(prompt);
            try {
                return GeneratedRecipeValidator.validate(response, {
                    availableIngredients,
                    rules
                });
            } catch (error) {
                const err = new Error((error as Error)?.message || 'Resposta inválida da IA.');
                (err as any).debug = { prompt, response };
                throw err;
            }
        } catch (error) {
            const err = new Error((error as Error)?.message || 'Erro ao gerar receita com IA.');
            (err as any).debug = { prompt };
            throw err;
        }
    }

}
