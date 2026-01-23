import { BaseService } from '../core/BaseService';
import { Recipe } from '../../shared/types/Recipe';
import { ClientService } from './ClientService';
import { SettingsService } from './SettingsService';
import { formatRecipeReferenceOrFallback } from '../../shared/utils/recipeFormat';
import { touchDataVersion } from '../utils/dataVersion';

export class RecipeService extends BaseService {
    private recipes: Recipe[] = [];
    private static instance: RecipeService;

    private constructor() {
        super('RecipeService');
        this.loadFromStorage();
    }

    static getInstance(): RecipeService {
        if (!RecipeService.instance) {
            RecipeService.instance = new RecipeService();
        }
        return RecipeService.instance;
    }

    private loadFromStorage() {
        const stored = localStorage.getItem('saponify_recipes');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    this.recipes = parsed.map(recipe => this.normalizeRecipe(recipe));
                }
            } catch (e) {
                this.handleError(new Error('Failed to parse recipes from storage'));
            }
        }
    }

    private saveToStorage() {
        localStorage.setItem('saponify_recipes', JSON.stringify(this.recipes));
        touchDataVersion();
    }

    getAll(): Recipe[] {
        return this.recipes;
    }

    getById(id: string): Recipe | undefined {
        return this.recipes.find(r => r.id === id);
    }

    save(recipe: Recipe) {
        const normalized = this.normalizeRecipe(recipe);
        const index = this.recipes.findIndex(r => r.id === recipe.id);
        const isNew = index < 0;

        if (!isNew) {
            this.recipes[index] = normalized;
        } else {
            this.recipes.push(normalized);

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
        this.saveToStorage();
    }

    delete(id: string) {
        this.recipes = this.recipes.filter(r => r.id !== id);
        this.saveToStorage();
    }

    getNextCode(): string {
        if (this.recipes.length === 0) return '0001';

        const codes = this.recipes.map(r => parseInt(r.code)).filter(c => !isNaN(c));
        if (codes.length === 0) return '0001';

        const maxCode = Math.max(...codes);
        return (maxCode + 1).toString().padStart(4, '0');
    }

    replaceAll(recipes: Recipe[]): void {
        this.recipes = (recipes || []).map((recipe) => this.normalizeRecipe(recipe));
        this.saveToStorage();
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
