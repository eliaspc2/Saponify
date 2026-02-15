import { Ingredient } from '../../../shared/types/Ingredient';
import { normalizeIngredient } from './IngredientNormalizer';

const normalizeText = (value: string) =>
    (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

const buildDuplicateKey = (ingredient: Ingredient): string => {
    const inci = normalizeText(ingredient.inci || '');
    if (inci) return `inci:${inci}`;

    const name = normalizeText(ingredient.name || '');
    if (name) return `name:${name}`;

    return '';
};

const scoreIngredientCompleteness = (ingredient: Ingredient): number => {
    let score = 0;
    if (normalizeText(ingredient.inci || '').length > 0) score += 3;
    if (normalizeText(ingredient.menuKey || '').length > 0) score += 1;
    if (normalizeText(ingredient.category || '').length > 0) score += 1;
    if ((ingredient.sapNaOH || 0) > 0 || (ingredient.sapKOH || 0) > 0) score += 2;
    if ((ingredient.notes || '').trim().length > 0) score += 1;
    return score;
};

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
    const deduped: Ingredient[] = [];
    const keyToIndex = new Map<string, number>();
    let changed = false;

    ingredients.forEach((ingredient) => {
        const key = buildDuplicateKey(ingredient);
        if (!key) {
            deduped.push(ingredient);
            return;
        }

        const existingIndex = keyToIndex.get(key);
        if (existingIndex === undefined) {
            keyToIndex.set(key, deduped.length);
            deduped.push(ingredient);
            return;
        }

        changed = true;
        const current = deduped[existingIndex];
        if (scoreIngredientCompleteness(ingredient) > scoreIngredientCompleteness(current)) {
            deduped[existingIndex] = ingredient;
        }
    });

    return { items: deduped, changed };
};

export const ensureUniqueIngredientIds = (ingredients: Ingredient[]) => {
    const seen = new Map<string, number>();
    let changed = false;

    const withUniqueIds = ingredients.map((ingredient, index) => {
        const originalId = (ingredient.id || '').trim();
        const baseId = originalId || `ingredient_${index + 1}`;
        const seenCount = seen.get(baseId) || 0;

        if (seenCount === 0) {
            seen.set(baseId, 1);
            if (baseId !== originalId) {
                changed = true;
                return { ...ingredient, id: baseId };
            }
            return ingredient;
        }

        seen.set(baseId, seenCount + 1);
        changed = true;
        const nextId = `${baseId}__dup${seenCount + 1}`;
        return { ...ingredient, id: nextId };
    });

    return { items: withUniqueIds, changed };
};
