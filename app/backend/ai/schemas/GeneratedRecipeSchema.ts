export type GeneratedRecipeIngredient = {
    ingredientId: string;
    name: string;
    percentage: number;
    weight: number;
    function: string;
};

export type GeneratedRecipeLyePhase = {
    liquid: GeneratedRecipeIngredient;
    lye_type: string;
    naoh_calculated: number;
    compensations_applied: string[];
};

export type GeneratedRecipePhases = {
    phase1_base_fatty: GeneratedRecipeIngredient[];
    phase2_lye: GeneratedRecipeLyePhase;
    phase2_functional_additives: GeneratedRecipeIngredient[];
    phase2_lye_additives: GeneratedRecipeIngredient[];
    phase3_trace: GeneratedRecipeIngredient[];
};

export type GeneratedRecipeMetadata = {
    recipeName: string;
    clientId: string;
    createdAt: string;
    source: 'ai';
};

export type GeneratedRecipeTechnical = {
    superfat_initial: number;
    superfat_final: number;
    lye_concentration: number;
    citric_acid: {
        used: boolean;
        weight: number;
        naoh_adjustment: number;
    };
    essential_oils_total_percentage: number;
};

export type GeneratedRecipeCuring = {
    days: number;
    calculation_basis: string;
    estimated_ready_date: string;
};

export type GeneratedRecipe = {
    metadata: GeneratedRecipeMetadata;
    phases: GeneratedRecipePhases;
    technical: GeneratedRecipeTechnical;
    curing: GeneratedRecipeCuring;
    technical_notes: string[];
    rationale: string[];
    assistant_message: string;
};

export type ValidatedRecipe = GeneratedRecipe;

export const GeneratedRecipeSchema = {
    topLevel: ['metadata', 'phases', 'technical', 'curing', 'technical_notes', 'rationale', 'assistant_message'],
    metadata: ['recipeName', 'clientId', 'createdAt', 'source'],
    phases: ['phase1_base_fatty', 'phase2_lye', 'phase2_functional_additives', 'phase2_lye_additives', 'phase3_trace'],
    ingredient: ['ingredientId', 'name', 'percentage', 'weight', 'function'],
    lyePhase: ['liquid', 'lye_type', 'naoh_calculated', 'compensations_applied'],
    technical: ['superfat_initial', 'superfat_final', 'lye_concentration', 'citric_acid', 'essential_oils_total_percentage'],
    citricAcid: ['used', 'weight', 'naoh_adjustment'],
    curing: ['days', 'calculation_basis', 'estimated_ready_date']
} as const;
