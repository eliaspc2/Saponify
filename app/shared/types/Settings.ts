export interface AppSettings {
    defaultSuperfat: number;
    defaultWaterConcentration: number;
    defaultAlkali: 'NaOH' | 'KOH';
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
}

export const DEFAULT_SETTINGS: AppSettings = {
    defaultSuperfat: 7,
    defaultWaterConcentration: 29,
    defaultAlkali: 'NaOH',
    language: 'pt',
    measurementSystem: 'metric',
    recipePrefix: 'RE',
    autoSave: true,
    theme: 'system',
    autoBackupEnabled: false,
    autoBackupPath: '',
    autoBackupEncrypted: true,
    autoBackupPassword: '',
    lastAutoBackup: null
};
