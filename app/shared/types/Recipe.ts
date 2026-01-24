export type RecipeIngredientRole = 'water' | 'other';

export interface RecipeIngredient {
    id: string;
    ingredientId: string;
    name: string;
    amount: number; // in grams
    percentage: number; // relative to total oils
    role?: RecipeIngredientRole;
    autoAmount?: boolean;
}

export interface Recipe {
    id: string;
    code: string; // e.g., "RE0008"
    date: string;
    clientId: string | null;
    name: string;
    notes: string;

    // Settings
    alkali: 'NaOH' | 'KOH';
    superfat: number; // percentage (0-100)
    waterConcentration: number; // percentage (0-100)
    alkaliPurity?: number; // percentage (0-100)

    // Phase 1: Fats
    fats: RecipeIngredient[];

    // Phase 2: Lye Composition
    liquids: RecipeIngredient[];
    functionalAdditives: RecipeIngredient[]; // e.g. Salt, Sugar
    lyeAdditives: RecipeIngredient[];       // e.g. Silk

    // Phase 3: Trace
    traceAdditives: RecipeIngredient[];     // e.g. Botanicals, Clays
    superfatOils: RecipeIngredient[];       // Oils added at trace
    essentialOils: RecipeIngredient[];

    // AI metadata (optional)
    aiRationale?: string[];
    aiFeedback?: string;
}
