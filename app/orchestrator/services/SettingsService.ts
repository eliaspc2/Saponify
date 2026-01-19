import { BaseService } from '../core/BaseService';
import { AppSettings, DEFAULT_SETTINGS } from '../../shared/types/Settings';

export class SettingsService extends BaseService {
    private settings: AppSettings = DEFAULT_SETTINGS;
    private static instance: SettingsService;

    private constructor() {
        super('SettingsService');
        this.loadFromStorage();
    }

    static getInstance(): SettingsService {
        if (!SettingsService.instance) {
            SettingsService.instance = new SettingsService();
        }
        return SettingsService.instance;
    }

    private loadFromStorage() {
        const stored = localStorage.getItem('saponify_settings');
        if (stored) {
            try {
                this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
            } catch (e) {
                this.handleError(new Error('Failed to parse settings from storage'));
            }
        }
    }

    private saveToStorage() {
        localStorage.setItem('saponify_settings', JSON.stringify(this.settings));
    }

    getSettings(): AppSettings {
        return this.settings;
    }

    updateSettings(updates: Partial<AppSettings>) {
        this.settings = { ...this.settings, ...updates };
        this.saveToStorage();
    }
}
