export const INGREDIENT_CATEGORIES = [
    'Óleos Base',
    'Superfat',
    'Líquidos Lixívia',
    'Aditivos Funcionais',
    'Aditivos Lixívia',
    'Aditivos Traço',
    'Óleos Essenciais'
] as const;

export type IngredientCategory = typeof INGREDIENT_CATEGORIES[number];

export const CATEGORY_PHASE_MAP: Record<string, string> = {
    'Óleos Base': '1',
    'Superfat': '3',
    'Líquidos Lixívia': '2',
    'Aditivos Funcionais': '2',
    'Aditivos Lixívia': '2',
    'Aditivos Traço': '3',
    'Óleos Essenciais': '3'
};

export const formatCategoryLabel = (category: string): string => {
    if (!category) return '';
    if (/\(\d+\)\s*$/.test(category)) return category;
    const phase = CATEGORY_PHASE_MAP[category];
    return phase ? `${category} (${phase})` : category;
};
