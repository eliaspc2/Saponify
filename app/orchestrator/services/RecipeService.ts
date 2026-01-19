import { BaseService } from '../core/BaseService';
import { Recipe } from '../../shared/types/Recipe';
import { ClientService } from './ClientService';

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
                this.recipes = JSON.parse(stored);
            } catch (e) {
                this.handleError(new Error('Failed to parse recipes from storage'));
            }
        }
    }

    private saveToStorage() {
        localStorage.setItem('saponify_recipes', JSON.stringify(this.recipes));
    }

    getAll(): Recipe[] {
        return this.recipes;
    }

    getById(id: string): Recipe | undefined {
        return this.recipes.find(r => r.id === id);
    }

    save(recipe: Recipe) {
        const index = this.recipes.findIndex(r => r.id === recipe.id);
        const isNew = index < 0;

        if (!isNew) {
            this.recipes[index] = recipe;
        } else {
            this.recipes.push(recipe);

            // Log in client history if associated
            if (recipe.clientId) {
                ClientService.getInstance().addActivity({
                    id: '',
                    clientId: recipe.clientId,
                    timestamp: new Date().toISOString(),
                    type: 'system',
                    title: 'Fórmula Criada',
                    content: `Uma nova receita (${recipe.name || 'Sem Nome'}) foi associada a este cliente. Código: RE${recipe.code}.`
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
}
