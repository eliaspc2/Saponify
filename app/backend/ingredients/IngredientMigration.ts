import { Ingredient } from '../../shared/types/Ingredient';
import { normalizeIngredient } from './IngredientNormalizer';

export const migrateMissingKind = (ingredients: Ingredient[]) => {
    let changed = false;
    const migrated = ingredients.map((ingredient) => {
        if (ingredient.kind) return ingredient;
        changed = true;
        return normalizeIngredient(ingredient);
    });
    return { items: migrated, changed };
};
