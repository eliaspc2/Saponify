import { BackupService } from '../../backend/services/BackupService';
import type { ISyncProvider } from '../../backend/services/ISyncProvider';
import { SettingsService } from '../../backend/services/SettingsService';
import { AutoBackupStorage } from '../../backend/services/AutoBackupStorage';
import { getDataVersion } from '../../backend/utils/dataVersion';
import type { CalculatorUseCase } from '../../backend/calculator/CalculatorUseCase';
import type { CalculatorInput, CalculatorResult } from '../../backend/calculator/CalculatorModels';
import { StorageKeys } from '../../shared/constants/StorageKeys';
import { AppConstants } from '../../shared/constants/AppConstants';
import { OpenAIProvider } from '../../backend/ai/OpenAIProvider';
import { RecipePromptBuilder } from '../../backend/ai/RecipePromptBuilder';
import type { ValidatedRecipe, GeneratedRecipeIngredient } from '../../backend/ai/schemas/GeneratedRecipeSchema';
import { IngredientService } from '../../backend/services/IngredientService';
import { RecipeService } from '../../backend/services/RecipeService';
import { ClientService } from '../../backend/services/ClientService';
import { IdService } from '../../backend/services/IdService';
import type { Ingredient } from '../../shared/types/Ingredient';
import type { Recipe, RecipeIngredient, RecipeIngredientRole } from '../../shared/types/Recipe';

type AppControllerDeps = {
    backupService: BackupService;
    syncProvider?: ISyncProvider | null;
    settingsService: SettingsService;
    calculatorUseCase: CalculatorUseCase;
};

const SYNC_PENDING_IMPORT_KEY = StorageKeys.SYNC_PENDING_IMPORT;

export class AppController {
    private backupService: BackupService;
    private syncProvider: ISyncProvider | null;
    private settingsService: SettingsService;
    private storage: AutoBackupStorage;
    private lastDataVersion: string;
    private dataVersionTimer: number | null = null;
    private pendingBackupTimer: number | null = null;
    private calculatorUseCase: CalculatorUseCase;
    private openAIProvider: OpenAIProvider;

    constructor({ backupService, syncProvider, settingsService, calculatorUseCase }: AppControllerDeps) {
        this.backupService = backupService;
        this.syncProvider = syncProvider ?? null;
        this.settingsService = settingsService;
        this.storage = new AutoBackupStorage();
        this.lastDataVersion = getDataVersion();
        this.calculatorUseCase = calculatorUseCase;
        this.openAIProvider = new OpenAIProvider(this.settingsService);
    }

    // Contract: initialize orchestration (sync bootstrap + pending import handling).
    public async init(): Promise<boolean> {
        this.backupService.setSyncProvider(this.syncProvider);
        if (this.syncProvider) {
            await this.syncProvider.start();
        }

        const shouldReload = await this.handlePendingImport();
        if (!shouldReload) {
            this.startWatchingState();
        }
        return shouldReload;
    }

    // Contract: calculate recipe using backend use-case (no UI logic).
    public calculateRecipe(input: CalculatorInput): CalculatorResult {
        return this.calculatorUseCase.calculate(input);
    }

    // Contract: high-level status for external integrations (no IO, no side-effects).
    public hasAIConfigured(): boolean {
        return this.openAIProvider.isConfigured();
    }

    // Contract: generate a recipe via AI and persist it, without exposing IA to UI.
    public async generateRecipeFromAI(params: { clientId: string; questionnaire: object; }): Promise<Recipe> {
        const { clientId, questionnaire } = params;
        if (!clientId || typeof clientId !== 'string') {
            throw new Error('Cliente inválido.');
        }
        if (!this.openAIProvider.isConfigured()) {
            throw new Error('IA não configurada.');
        }

        const client = ClientService.getInstance().getById(clientId);
        if (!client) {
            throw new Error('Cliente não encontrado.');
        }

        const ingredients = IngredientService.getInstance().getAll();
        if (!ingredients.length) {
            throw new Error('Ingredientes indisponíveis.');
        }

        const prompt = new RecipePromptBuilder().buildRecipePrompt({
            clientForm: questionnaire,
            availableIngredients: ingredients
        });

        const validated = await this.openAIProvider.generateAndValidateRecipe(prompt);
        const recipe = this.mapValidatedRecipeToRecipe(validated, clientId, ingredients);
        RecipeService.getInstance().save(recipe);
        return recipe;
    }

    private onStateChanged(): void {
        if (!this.shouldSyncOnChange()) return;
        if (this.pendingBackupTimer) {
            window.clearTimeout(this.pendingBackupTimer);
        }
        this.pendingBackupTimer = window.setTimeout(async () => {
            await this.backupService.performAutoBackupNow();
            this.onBackupCompleted();
        }, AppConstants.APP_STATE_BACKUP_DEBOUNCE_MS);
    }

    private onBackupCompleted(): void {
        // Hook for future orchestration steps
    }

    private startWatchingState(): void {
        if (this.dataVersionTimer) return;
        this.dataVersionTimer = window.setInterval(() => {
            const currentVersion = getDataVersion();
            if (currentVersion && currentVersion !== this.lastDataVersion) {
                this.lastDataVersion = currentVersion;
                this.onStateChanged();
            }
        }, AppConstants.APP_STATE_POLL_INTERVAL_MS);
    }

    private async handlePendingImport(): Promise<boolean> {
        const pending = localStorage.getItem(SYNC_PENDING_IMPORT_KEY);
        if (pending !== 'true') return false;

        const data = this.storage.getData();
        let ok = false;
        if (data && data.startsWith(AppConstants.ENCRYPTED_PREFIX)) {
            const settings = this.settingsService.getSettings();
            ok = await this.backupService.restoreAutoBackup(settings.autoBackupPassword);
        } else if (data) {
            ok = await this.backupService.importAllData(data);
        }

        if (ok) {
            localStorage.removeItem(SYNC_PENDING_IMPORT_KEY);
            return true;
        }

        return false;
    }

    private shouldSyncOnChange(): boolean {
        if (!this.syncProvider) return false;
        const provider = this.syncProvider as { isReady?: () => boolean };
        if (typeof provider.isReady === 'function') {
            return provider.isReady();
        }
        return true;
    }

    private mapValidatedRecipeToRecipe(validated: ValidatedRecipe, clientId: string, ingredients: Ingredient[]): Recipe {
        const ingredientById = new Map(ingredients.map(item => [item.id, item]));
        const now = new Date().toISOString();

        const mapIngredient = (item: GeneratedRecipeIngredient, role?: RecipeIngredientRole): RecipeIngredient => {
            const ingredient = ingredientById.get(item.ingredientId);
            const resolvedRole = role ?? (ingredient?.kind === 'water' ? 'water' : 'other');
            return {
                id: IdService.create(),
                ingredientId: item.ingredientId,
                name: item.name,
                amount: item.weight,
                percentage: item.percentage,
                role: resolvedRole
            };
        };

        const fats = (validated.phases.phase1_base_fatty || []).map((item) => mapIngredient(item));
        const liquid = validated.phases.phase2_lye?.liquid;
        const liquids = liquid ? [mapIngredient(liquid)] : [];

        const functionalAdditives: RecipeIngredient[] = [];
        const lyeAdditives: RecipeIngredient[] = [];
        const traceAdditives: RecipeIngredient[] = [];
        const superfatOils: RecipeIngredient[] = [];
        const essentialOils: RecipeIngredient[] = [];

        const pushByMenuKey = (item: GeneratedRecipeIngredient) => {
            const ingredient = ingredientById.get(item.ingredientId);
            const menuKey = ingredient?.menuKey || '';
            const mapped = mapIngredient(item);

            switch (menuKey) {
                case 'essentialOils':
                    essentialOils.push(mapped);
                    return;
                case 'superfatOils':
                    superfatOils.push(mapped);
                    return;
                case 'traceAdditives':
                    traceAdditives.push(mapped);
                    return;
                case 'functionalAdditives':
                    functionalAdditives.push(mapped);
                    return;
                case 'lyeAdditives':
                    lyeAdditives.push(mapped);
                    return;
                case 'liquids':
                    liquids.push(mapped);
                    return;
                default:
                    break;
            }

            if (ingredient?.kind === 'oil') {
                superfatOils.push(mapped);
            } else {
                traceAdditives.push(mapped);
            }
        };

        (validated.phases.phase3_trace || []).forEach(pushByMenuKey);

        if (validated.technical?.citric_acid?.used && validated.technical.citric_acid.weight > 0) {
            const citric = ingredients.find(item => item.flags?.citricAcid);
            if (citric) {
                lyeAdditives.push({
                    id: IdService.create(),
                    ingredientId: citric.id,
                    name: citric.name,
                    amount: validated.technical.citric_acid.weight,
                    percentage: 0,
                    role: 'other'
                });
            }
        }

        const createdAt = validated.metadata?.createdAt || now;
        const parsedDate = new Date(createdAt);
        const date = Number.isNaN(parsedDate.getTime())
            ? createdAt
            : parsedDate.toISOString().split('T')[0];

        const recipe: Recipe = {
            id: IdService.create(),
            code: RecipeService.getInstance().getNextCode(),
            date,
            clientId,
            name: validated.metadata?.recipeName || 'Receita IA',
            notes: '',
            alkali: validated.phases.phase2_lye.lye_type === 'KOH' ? 'KOH' : 'NaOH',
            superfat: validated.technical?.superfat_initial ?? 0,
            waterConcentration: validated.technical?.lye_concentration ?? 0,
            fats,
            liquids,
            functionalAdditives,
            lyeAdditives,
            traceAdditives,
            superfatOils,
            essentialOils
        };

        const extended = recipe as Recipe & { source?: 'ai'; createdAt?: string; updatedAt?: string };
        extended.source = 'ai';
        extended.createdAt = createdAt;
        extended.updatedAt = now;
        return recipe;
    }
}
