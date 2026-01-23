import { BaseService } from '../core/BaseService';
import { Recipe } from '../../shared/types/Recipe';
import { SettingsService } from './SettingsService';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import { normalizeEntity } from '../utils/EntityNormalizer';
import { StorageKeys } from '../../shared/constants/StorageKeys';
import { AppConstants } from '../../shared/constants/AppConstants';

export class RecipeService extends BaseService {
    private static instance: RecipeService;
    private repository: LocalStorageRepository<Recipe>;

    private constructor() {
        super('RecipeService');
        this.repository = new LocalStorageRepository<Recipe>(StorageKeys.RECIPES, {
            deserialize: (raw) => {
                const items = Array.isArray(raw) ? raw : [];
                return items.map((recipe) => this.normalizeRecipe(recipe));
            },
            serialize: (items) => items,
            onLoadError: () => {
                this.handleError(new Error('Failed to parse recipes from storage'));
            }
        });
    }

    static getInstance(): RecipeService {
        if (!RecipeService.instance) {
            RecipeService.instance = new RecipeService();
        }
        return RecipeService.instance;
    }

    getAll(): Recipe[] {
        return this.repository.getAll();
    }

    getById(id: string): Recipe | undefined {
        return this.repository.getById(id);
    }

    save(recipe: Recipe) {
        const normalized = this.normalizeRecipe(recipe);
        this.repository.upsert(normalized);
    }

    delete(id: string) {
        this.repository.delete(id);
    }

    getNextCode(): string {
        const recipes = this.repository.getAll();
        if (recipes.length === 0) return AppConstants.DEFAULT_RECIPE_CODE;

        const codes = recipes.map(r => parseInt(r.code)).filter(c => !isNaN(c));
        if (codes.length === 0) return AppConstants.DEFAULT_RECIPE_CODE;

        const maxCode = Math.max(...codes);
        return (maxCode + 1).toString().padStart(4, '0');
    }

    replaceAll(recipes: Recipe[]): void {
        const normalized = (recipes || []).map((recipe) => this.normalizeRecipe(recipe));
        this.repository.replaceAll(normalized);
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

}
