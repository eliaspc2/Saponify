export interface AppSettings {
    defaultSuperfat: number;
    defaultWaterConcentration: number;
    defaultAlkali: 'NaOH' | 'KOH';
    defaultAlkaliPurity: number;
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

    // Integrações externas (IA)
    openaiApiKey: string;
    openaiBaseUrl: string;
    openaiModel: string;
    openaiModels: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
    defaultSuperfat: 7,
    defaultWaterConcentration: 29,
    defaultAlkali: 'NaOH',
    defaultAlkaliPurity: 100,
    language: 'pt',
    measurementSystem: 'metric',
    recipePrefix: 'RE',
    autoSave: true,
    theme: 'system',
    autoBackupEnabled: false,
    autoBackupPath: '',
    autoBackupEncrypted: true,
    autoBackupPassword: '',
    lastAutoBackup: null,
    openaiApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-4o-mini',
    openaiModels: []
};
