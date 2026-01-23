import { SettingsService } from '../services/SettingsService';
import { OpenAIClient } from './OpenAIClient';

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
}
