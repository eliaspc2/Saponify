import { AbstractConfigService } from '../../shared/config/AbstractConfigService';
import type { AppSettings } from '../../../shared/settings/AppSettings';
import { DEFAULT_SETTINGS } from '../../../shared/settings/AppSettingsDefaults';
import { StorageKeys } from '../../../shared/constants/StorageKeys';

export class SettingsService extends AbstractConfigService<AppSettings> {
    private static instance: SettingsService;

    private constructor() {
        super('SettingsService', StorageKeys.SETTINGS, DEFAULT_SETTINGS);
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



