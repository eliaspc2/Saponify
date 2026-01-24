import { Ingredient } from '../../shared/types/Ingredient';
import { normalizeIngredient } from './IngredientNormalizer';

const normalizeText = (value: string) =>
    (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

export const migrateMissingKind = (ingredients: Ingredient[]) => {
    let changed = false;
    const migrated = ingredients.map((ingredient) => {
        if (ingredient.kind) return ingredient;
        changed = true;
        return normalizeIngredient(ingredient);
    });
    return { items: migrated, changed };
};

export const removeDeprecatedIngredients = (ingredients: Ingredient[]) => {
    const deprecatedIds = new Set(['18']);
    const deprecatedNames = new Set(['infusao de aveia', 'oat infusion']);
    let changed = false;
    const filtered = ingredients.filter((ingredient) => {
        const id = ingredient.id || '';
        const name = normalizeText(ingredient.name || '');
        const inci = normalizeText(ingredient.inci || '');
        const shouldRemove = deprecatedIds.has(id) || deprecatedNames.has(name) || deprecatedNames.has(inci);
        if (shouldRemove) {
            changed = true;
            return false;
        }
        return true;
    });
    return { items: filtered, changed };
};

export const removeDuplicateIngredients = (ingredients: Ingredient[]) => {
    const seen = new Set<string>();
    let changed = false;
    const filtered = ingredients.filter((ingredient) => {
        const key = [
            normalizeText(ingredient.name || ''),
            normalizeText(ingredient.inci || ''),
            normalizeText(ingredient.menuKey || '')
        ].join('|');
        if (seen.has(key)) {
            changed = true;
            return false;
        }
        seen.add(key);
        return true;
    });
    return { items: filtered, changed };
};
