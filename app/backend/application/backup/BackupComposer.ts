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
import { getDataVersion } from '../../shared/versioning/dataVersion';
import { runMigrations } from '../../shared/migrations';
import {
    DEFAULT_SETTINGS,
    mergeAppSettingsWithDefaults,
    type AppSettings
} from '../../../shared/types/Settings';
import type { Recipe } from '../../../shared/types/Recipe';
import type { Client } from '../../../shared/types/Client';
import type { Ingredient } from '../../../shared/types/Ingredient';
import type { ClientActivity } from '../../../shared/types/ClientActivity';
import type { Questionnaire } from '../../../shared/types/Questionnaire';

export type ImportAllDataOptions = {
    preserveCurrentSettings?: boolean;
    expectedDataVersion?: string;
};

type ImportPayload = {
    settings: AppSettings;
    ingredients: Ingredient[];
    clients: Client[];
    activities: ClientActivity[];
    recipes: Recipe[];
    questionnaires: Questionnaire[];
};

type CurrentDataSnapshot = ImportPayload;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return !!value && typeof value === 'object' && !Array.isArray(value);
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
            let data: unknown = JSON.parse(jsonString);
            if (!isRecord(data)) {
                throw new Error('Formato de backup inválido.');
            }

            const meta = isRecord(data.meta) ? data.meta : undefined;
            const versionInfo = meta && isRecord(meta.versionInfo) ? meta.versionInfo : undefined;
            const storedVersion = typeof versionInfo?.dataSchemaVersion === 'number'
                ? versionInfo.dataSchemaVersion
                : 0;
            const currentVersion = getDataSchemaVersion();
            if (storedVersion < currentVersion) {
                const result = runMigrations(data, storedVersion, currentVersion);
                data = result.data;
            }

            const payload = this.validateImportPayload(data);
            const snapshot = await this.captureCurrentData();
            if (typeof options?.expectedDataVersion === 'string'
                && getDataVersion() !== options.expectedDataVersion) {
                throw new Error('A importação foi cancelada porque existem alterações locais mais recentes.');
            }
            try {
                this.applyPayload({
                    ...payload,
                    settings: this.resolveImportedSettings(payload.settings, options)
                });
            } catch (error) {
                try {
                    await this.rollback(snapshot);
                } catch (rollbackError) {
                    console.error('Falha ao repor dados após importação interrompida:', rollbackError);
                }
                throw error;
            }

            return true;
        } catch (e) {
            console.error('Falha ao importar backup:', e);
            return false;
        }
    }

    private validateImportPayload(data: unknown): ImportPayload {
        if (!isRecord(data) || !isRecord(data.settings)) {
            throw new Error('Formato de backup inválido: definições ausentes.');
        }
        if (typeof data.recipeCalculations !== 'undefined'
            && (!Array.isArray(data.recipeCalculations) || !data.recipeCalculations.every(isRecord))) {
            throw new Error('Formato de backup inválido: recipeCalculations deve ser uma lista de registos.');
        }

        return {
            settings: mergeAppSettingsWithDefaults(DEFAULT_SETTINGS, data.settings),
            recipes: this.readEntityArray<Recipe>(data, 'recipes', true),
            clients: this.readEntityArray<Client>(data, 'clients', true),
            ingredients: this.readEntityArray<Ingredient>(data, 'ingredients'),
            activities: this.readEntityArray<ClientActivity>(data, 'activities'),
            questionnaires: this.readEntityArray<Questionnaire>(data, 'questionnaires')
        };
    }

    private readEntityArray<T>(data: Record<string, unknown>, key: string, required = false): T[] {
        const value = data[key];
        if (typeof value === 'undefined' && !required) {
            return [];
        }
        if (!Array.isArray(value) || !value.every(isRecord)) {
            throw new Error(`Formato de backup inválido: ${key} deve ser uma lista de registos.`);
        }
        const ids = new Set<string>();
        for (const entity of value) {
            const id = entity.id;
            if (typeof id !== 'string' || !id.trim()) {
                throw new Error(`Formato de backup inválido: ${key} contém um registo sem ID válido.`);
            }
            if (ids.has(id)) {
                throw new Error(`Formato de backup inválido: ${key} contém IDs duplicados.`);
            }
            ids.add(id);
        }
        return value as T[];
    }

    private async captureCurrentData(): Promise<CurrentDataSnapshot> {
        return {
            settings: this.clone(SettingsService.getInstance().getSettings()),
            ingredients: this.clone(IngredientService.getInstance().getAll()),
            clients: this.clone(ClientService.getInstance().getAll()),
            activities: this.clone(ClientActivityService.getInstance().getAllActivities()),
            recipes: this.clone(RecipeService.getInstance().getAll()),
            questionnaires: this.clone(await QuestionnaireService.getQuestionnaires())
        };
    }

    private applyPayload(payload: ImportPayload): void {
        SettingsService.getInstance().replaceSettings(payload.settings);
        IngredientService.getInstance().replaceAll(payload.ingredients, true);
        ClientService.getInstance().replaceAll(payload.clients);
        ClientActivityService.getInstance().replaceAll(payload.activities);
        RecipeService.getInstance().replaceAll(payload.recipes);
        QuestionnaireService.replaceAll(payload.questionnaires);
    }

    private async rollback(snapshot: CurrentDataSnapshot): Promise<void> {
        QuestionnaireService.replaceAll(snapshot.questionnaires);
        RecipeService.getInstance().replaceAll(snapshot.recipes);
        ClientActivityService.getInstance().replaceAll(snapshot.activities);
        ClientService.getInstance().replaceAll(snapshot.clients);
        IngredientService.getInstance().replaceAll(snapshot.ingredients, true);
        SettingsService.getInstance().replaceSettings(snapshot.settings);
    }

    private clone<T>(value: T): T {
        return JSON.parse(JSON.stringify(value)) as T;
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

        return imported;
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
            'llmProvider',
            'llmApiKey',
            'llmBaseUrl',
            'llmModel',
            'openaiApiKey',
            'openaiBaseUrl',
            'openaiModel'
        ];

        return keys.every((key) => settings[key] === DEFAULT_SETTINGS[key])
            && JSON.stringify(settings.llmModels || []) === JSON.stringify(DEFAULT_SETTINGS.llmModels || [])
            && JSON.stringify(settings.openaiModels || []) === JSON.stringify(DEFAULT_SETTINGS.openaiModels || []);
    }
}
