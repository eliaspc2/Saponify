import { AppSettings, DEFAULT_SETTINGS } from '../../shared/types/Settings';
import { AbstractConfigService } from './AbstractConfigService';

export class SettingsService extends AbstractConfigService<AppSettings> {
    private static instance: SettingsService;

    private constructor() {
        super('SettingsService', 'saponify_settings', DEFAULT_SETTINGS);
    }

    static getInstance(): SettingsService {
        if (!SettingsService.instance) {
            SettingsService.instance = new SettingsService();
        }
        return SettingsService.instance;
    }

    getSettings(): AppSettings {
        return this.getData();
    }

    updateSettings(updates: Partial<AppSettings>) {
        const current = this.getData();
        this.setData({ ...current, ...updates });
    }

    replaceSettings(settings: AppSettings) {
        this.setData({ ...DEFAULT_SETTINGS, ...settings });
    }
}
