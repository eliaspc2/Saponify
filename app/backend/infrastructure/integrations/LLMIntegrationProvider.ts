import type { ExternalProvider } from './ExternalProvider';
import { SettingsService } from '../services/SettingsService';
import { isLocalLLMBaseUrl, resolveLLMConfiguration } from '../../../shared/types/Settings';

export class LLMIntegrationProvider implements ExternalProvider {
    private settingsService: SettingsService;

    constructor(settingsService?: SettingsService) {
        this.settingsService = settingsService || SettingsService.getInstance();
    }

    isConfigured(): boolean {
        const settings = resolveLLMConfiguration(this.settingsService.getSettings());
        if (!settings.model) {
            return false;
        }
        if (settings.provider === 'ollama') {
            return !!settings.baseUrl;
        }
        return !!settings.apiKey || (settings.provider === 'openai-compatible' && isLocalLLMBaseUrl(settings.baseUrl));
    }

    getModel(): string {
        return resolveLLMConfiguration(this.settingsService.getSettings()).model;
    }
}
