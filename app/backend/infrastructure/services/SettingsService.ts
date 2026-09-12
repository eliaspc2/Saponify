import { AbstractConfigService } from '../../shared/config/AbstractConfigService';
import type { AppSettings } from '../../../shared/settings/AppSettings';
import { DEFAULT_SETTINGS } from '../../../shared/settings/AppSettingsDefaults';
import { StorageKeys } from '../../../shared/constants/StorageKeys';
import { mergeAppSettingsWithDefaults } from '../../../shared/types/Settings';

export class SettingsService extends AbstractConfigService<AppSettings> {
    private static instance: SettingsService;

    private constructor() {
        super('SettingsService', StorageKeys.SETTINGS, DEFAULT_SETTINGS, {
            mergeWithDefaults: mergeAppSettingsWithDefaults
        });
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

    /**
     * Backup metadata is not user data and must not schedule another backup.
     */
    updateLastAutoBackup(timestamp: string): void {
        const current = this.getData();
        this.setData(
            { ...current, lastAutoBackup: timestamp },
            true,
            { touchDataVersion: false }
        );
    }

    replaceSettings(settings: AppSettings) {
        this.setData(mergeAppSettingsWithDefaults(DEFAULT_SETTINGS, settings));
    }
}

