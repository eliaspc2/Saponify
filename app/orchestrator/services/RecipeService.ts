import { BaseService } from '../core/BaseService';
import { Recipe } from '../../shared/types/Recipe';
import { ClientService } from './ClientService';
import { SettingsService } from './SettingsService';
import { formatRecipeReferenceOrFallback } from '../../shared/utils/recipeFormat';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';

export class RecipeService extends BaseService {
    private static instance: RecipeService;
    private repository: LocalStorageRepository<Recipe>;

    private constructor() {
        super('RecipeService');
        this.repository = new LocalStorageRepository<Recipe>('saponify_recipes', {
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
        const isNew = !this.repository.getById(recipe.id);

        if (!isNew) {
            this.repository.update(normalized);
        } else {
            this.repository.add(normalized);

            // Log in client history if associated
            if (normalized.clientId) {
                ClientService.getInstance().addActivity({
                    id: '',
                    clientId: normalized.clientId,
                    timestamp: new Date().toISOString(),
                    type: 'system',
                    title: 'Formula Criada',
                    content: `Uma nova receita (${normalized.name || 'Sem Nome'}) foi associada a este cliente. Codigo: ${formatRecipeReferenceOrFallback(normalized.code, 'Sem referencia')}.`
                });
            }
        }
    }

    delete(id: string) {
        this.repository.delete(id);
    }

    getNextCode(): string {
        const recipes = this.repository.getAll();
        if (recipes.length === 0) return '0001';

        const codes = recipes.map(r => parseInt(r.code)).filter(c => !isNaN(c));
        if (codes.length === 0) return '0001';

        const maxCode = Math.max(...codes);
        return (maxCode + 1).toString().padStart(4, '0');
    }

    replaceAll(recipes: Recipe[]): void {
        const normalized = (recipes || []).map((recipe) => this.normalizeRecipe(recipe));
        this.repository.replaceAll(normalized);
    }

    private normalizeRecipe(recipe: Recipe): Recipe {
        const settings = SettingsService.getInstance().getSettings();
        return {
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
    }

}
