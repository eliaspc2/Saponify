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
