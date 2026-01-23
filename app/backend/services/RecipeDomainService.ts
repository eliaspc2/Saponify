import { RecipeService } from './RecipeService';
import { ClientActivityService } from './ClientActivityService';
import { Recipe } from '../../shared/types/Recipe';
import { formatRecipeReferenceOrFallback } from '../../shared/utils/recipeFormat';

export class RecipeDomainService {
    private static instance: RecipeDomainService;

    private constructor() { }

    static getInstance(): RecipeDomainService {
        if (!RecipeDomainService.instance) {
            RecipeDomainService.instance = new RecipeDomainService();
        }
        return RecipeDomainService.instance;
    }

    save(recipe: Recipe): void {
        const recipeService = RecipeService.getInstance();
        const existing = recipeService.getById(recipe.id);
        recipeService.save(recipe);

        if (!existing && recipe.clientId) {
            const saved = recipeService.getById(recipe.id) || recipe;
            ClientActivityService.getInstance().addActivity({
                id: '',
                clientId: saved.clientId || recipe.clientId,
                timestamp: new Date().toISOString(),
                type: 'system',
                title: 'Formula Criada',
                content: `Uma nova receita (${saved.name || 'Sem Nome'}) foi associada a este cliente. Codigo: ${formatRecipeReferenceOrFallback(saved.code, 'Sem referencia')}.`
            });
        }
    }
}
