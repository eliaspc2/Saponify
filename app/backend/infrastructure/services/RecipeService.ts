import { BaseService } from '../../shared/core/BaseService';
import { Recipe } from '../../../shared/types/Recipe';
import { SettingsService } from './SettingsService';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import { normalizeEntity } from '../../shared/normalizers/EntityNormalizer';
import { StorageKeys } from '../../../shared/constants/StorageKeys';
import { AppConstants } from '../../../shared/constants/AppConstants';
import { getVersionInfo } from '../../shared/versioning/VersionService';

export class RecipeService extends BaseService<Recipe> {
    private static instance: RecipeService;
    private storageRepository: LocalStorageRepository<Recipe>;

    private constructor() {
        super('RecipeService');
        this.storageRepository = new LocalStorageRepository<Recipe>(StorageKeys.RECIPES, {
            deserialize: (raw) => {
                const items = Array.isArray(raw) ? raw : [];
                return items.map((recipe) => this.normalizeRecipe(recipe));
            },
            serialize: (items) => items,
            onLoadError: () => {
                this.handleError(new Error('Failed to parse recipes from storage'));
            }
        });
        this.setRepository(this.storageRepository);
    }

    static getInstance(): RecipeService {
        if (!RecipeService.instance) {
            RecipeService.instance = new RecipeService();
        }
        return RecipeService.instance;
    }

    getAll(): Recipe[] {
        return this.getAllItems();
    }

    getById(id: string): Recipe | undefined {
        return this.getByIdItem(id);
    }

    save(recipe: Recipe) {
        const normalized = this.normalizeRecipe(this.applyVersionInfoIfAi(recipe));
        this.storageRepository.upsert(normalized);
    }

    delete(id: string) {
        this.deleteItem(id);
    }

    getNextCode(): string {
        const recipes = this.storageRepository.getAll();
        if (recipes.length === 0) return AppConstants.DEFAULT_RECIPE_CODE;

        const codes = recipes.map(r => parseInt(r.code)).filter(c => !isNaN(c));
        if (codes.length === 0) return AppConstants.DEFAULT_RECIPE_CODE;

        const maxCode = Math.max(...codes);
        return (maxCode + 1).toString().padStart(4, '0');
    }

    replaceAll(recipes: Recipe[]): void {
        const normalized = (recipes || []).map((recipe) => this.normalizeRecipe(recipe));
        this.replaceAllItems(normalized);
    }

    private normalizeRecipe(recipe: Recipe): Recipe {
        const settings = SettingsService.getInstance().getSettings();
        const normalized = {
            ...recipe,
            alkali: recipe.alkali || settings.defaultAlkali,
            superfat: recipe.superfat ?? settings.defaultSuperfat,
            waterConcentration: recipe.waterConcentration ?? settings.defaultWaterConcentration,
            alkaliPurity: recipe.alkaliPurity ?? settings.defaultAlkaliPurity ?? 100,
            fats: recipe.fats || [],
            liquids: recipe.liquids || [],
            functionalAdditives: recipe.functionalAdditives || [],
            lyeAdditives: recipe.lyeAdditives || [],
            traceAdditives: recipe.traceAdditives || [],
            superfatOils: recipe.superfatOils || [],
            essentialOils: recipe.essentialOils || [],
            notes: recipe.notes || ''
        };
        return normalizeEntity(normalized, { ensureId: true });
    }

    private applyVersionInfoIfAi(recipe: Recipe): Recipe {
        const source = (recipe as Recipe & { source?: string }).source;
        if (source !== 'ai') {
            return recipe;
        }
        const existingMeta = recipe.meta || {};
        const versionInfo = existingMeta.versionInfo || getVersionInfo();
        return {
            ...recipe,
            meta: {
                ...existingMeta,
                generatedBy: existingMeta.generatedBy || 'ai',
                versionInfo
            }
        };
    }

}




