import { RecipeService } from '../../infrastructure/services/RecipeService';
import { ClientService } from '../../infrastructure/services/ClientService';
import { IngredientService } from '../../infrastructure/services/IngredientService';
import { SettingsService } from '../../infrastructure/services/SettingsService';
import { QuestionnaireService } from '../../infrastructure/services/QuestionnaireService';
import { CalculatorEngine } from '../../domain/calculator/CalculatorEngine';
import { ClientActivityService } from '../../infrastructure/services/ClientActivityService';
import { AppConstants } from '../../../shared/constants/AppConstants';
import { getVersionInfo } from '../../shared/versioning/VersionService';
import { getDataSchemaVersion } from '../../shared/versioning/DataSchemaVersion';
import { runMigrations } from '../../shared/migrations';
import type { AppSettings } from '../../../shared/settings/AppSettings';
import { DEFAULT_SETTINGS } from '../../../shared/settings/AppSettingsDefaults';

export type ImportAllDataOptions = {
    preserveCurrentSettings?: boolean;
};

export class BackupComposer {
    public async exportAllData(): Promise<string> {
        const ingredients = IngredientService.getInstance().getAll();
        const recipes = RecipeService.getInstance().getAll();
        const recipeCalculations = recipes.map(recipe => {
            const results = CalculatorEngine.calculate({ recipe, ingredients }).results;
            return {
                recipeId: recipe.id,
                code: recipe.code,
                name: recipe.name,
                alkaliAmount: results.alkaliAmount,
                alkaliPure: results.alkaliPure,
                alkaliPurity: results.alkaliPurity,
                waterAmount: results.waterAmount
            };
        });

        const data = {
            version: AppConstants.BACKUP_VERSION,
            timestamp: new Date().toISOString(),
            meta: {
                versionInfo: getVersionInfo()
            },
            recipes,
            recipeCalculations,
            clients: ClientService.getInstance().getAll(),
            activities: ClientActivityService.getInstance().getAllActivities(),
            ingredients,
            settings: SettingsService.getInstance().getSettings(),
            questionnaires: await QuestionnaireService.getQuestionnaires()
        };

        return JSON.stringify(data, null, 2);
    }

    public async importAllData(jsonString: string, options?: ImportAllDataOptions): Promise<boolean> {
        try {
            let data = JSON.parse(jsonString);

            if (!data.recipes || !data.clients || !data.settings) {
                throw new Error('Formato de backup inválido');
            }

            const storedVersion = typeof data?.meta?.versionInfo?.dataSchemaVersion === 'number'
                ? data.meta.versionInfo.dataSchemaVersion
                : 0;
            const currentVersion = getDataSchemaVersion();
            if (storedVersion < currentVersion) {
                const result = runMigrations(data, storedVersion, currentVersion);
                data = result.data;
            }

            // 1. Settings
            const importedSettings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) } as AppSettings;
            const resolvedSettings = this.resolveImportedSettings(importedSettings, options);
            SettingsService.getInstance().replaceSettings(resolvedSettings);

            // 2. Ingredients (replace all)
            IngredientService.getInstance().replaceAll(Array.isArray(data.ingredients) ? data.ingredients : [], true);

            // 3. Clients + Activities (replace all)
            ClientService.getInstance().replaceAll(Array.isArray(data.clients) ? data.clients : []);
            ClientActivityService.getInstance().replaceAll(Array.isArray(data.activities) ? data.activities : []);

            // 4. Recipes (replace all)
            RecipeService.getInstance().replaceAll(Array.isArray(data.recipes) ? data.recipes : []);

            // 5. Questionnaires (replace all)
            QuestionnaireService.replaceAll(Array.isArray(data.questionnaires) ? data.questionnaires : []);

            return true;
        } catch (e) {
            console.error('Falha ao importar backup:', e);
            return false;
        }
    }

    private resolveImportedSettings(imported: AppSettings, options?: ImportAllDataOptions): AppSettings {
        if (!options?.preserveCurrentSettings) {
            return imported;
        }

        const current = SettingsService.getInstance().getSettings();
        const currentBackupTs = Date.parse(current.lastAutoBackup || '') || 0;
        const importedBackupTs = Date.parse(imported.lastAutoBackup || '') || 0;
        const currentHasCustomizations = !this.matchesDefaults(current);
        const importedLooksLikeDefaults = this.matchesDefaults(imported);

        const protectLocal = (currentBackupTs > 0 && importedBackupTs > 0 && currentBackupTs > importedBackupTs)
            || (currentHasCustomizations && importedLooksLikeDefaults);

        if (protectLocal) {
            return {
                ...imported,
                ...current,
                lastAutoBackup: current.lastAutoBackup || imported.lastAutoBackup
            };
        }

        return {
            ...imported,
            openaiApiKey: imported.openaiApiKey?.trim() ? imported.openaiApiKey : current.openaiApiKey,
            openaiModel: imported.openaiModel || current.openaiModel,
            openaiModels: Array.isArray(imported.openaiModels) && imported.openaiModels.length > 0
                ? imported.openaiModels
                : current.openaiModels
        };
    }

    private matchesDefaults(settings: AppSettings): boolean {
        const keys: Array<keyof AppSettings> = [
            'defaultSuperfat',
            'defaultWaterConcentration',
            'defaultAlkali',
            'defaultAlkaliPurity',
            'language',
            'measurementSystem',
            'recipePrefix',
            'autoSave',
            'theme',
            'autoBackupEnabled',
            'autoBackupEncrypted',
            'autoBackupPassword',
            'openaiApiKey',
            'openaiModel'
        ];

        return keys.every((key) => settings[key] === DEFAULT_SETTINGS[key])
            && JSON.stringify(settings.openaiModels || []) === JSON.stringify(DEFAULT_SETTINGS.openaiModels || []);
    }
}
