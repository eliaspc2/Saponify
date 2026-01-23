import type { ExternalProvider } from './ExternalProvider';
import { SettingsService } from '../services/SettingsService';

export class OpenAIProvider implements ExternalProvider {
    private settingsService: SettingsService;

    constructor(settingsService?: SettingsService) {
        this.settingsService = settingsService || SettingsService.getInstance();
    }

    isConfigured(): boolean {
        const settings = this.settingsService.getSettings();
        return !!settings.openaiApiKey?.trim();
    }

    getModel(): string {
        const settings = this.settingsService.getSettings();
        return settings.openaiModel;
    }
}
