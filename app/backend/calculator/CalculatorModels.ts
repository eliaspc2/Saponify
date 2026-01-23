import type { Recipe, RecipeIngredient, RecipeIngredientRole } from '../../shared/types/Recipe';
import type { Ingredient } from '../../shared/types/Ingredient';
import type { FattyAcidLabel } from './CalculatorRules';

export interface CalculationResults {
    totalWeight: number;
    totalFats: number;
    sapAverage: number;
    alkaliPure: number;
    alkaliReal: number;
    alkaliPurity: number;
    alkaliAmount: number;
    waterAmount: number;
    glycerin: number;
    superfatFinal: number;
    fattyAcidProfileValid: boolean;
    fattyAcidDiagnostics: string[];
    lyeConcentration: number;
    iodine: number;
    ins: number;
    properties: {
        conditioning: number;
        cleansing: number;
        bubbles: number;
        persistence: number;
        hardness: number;
        solubility: number;
        drying: number;
    };
    fattyAcids: {
        lauric: number;
        myristic: number;
        palmitic: number;
        stearic: number;
        oleic: number;
        linoleic: number;
        linolenic: number;
        ricinoleic: number;
        gadoleic: number;
        other: number;
    };
    inciList: string[];
}

export interface CalculatorInput {
    recipe: Recipe;
    ingredients: Ingredient[];
    now?: Date;
}

export interface PhaseTotals {
    phase1Total: number;
    phase2Total: number;
    phase3Total: number;
    batchWeightWithLye: number;
    estimatedDryWeight: number;
    physicalDays: number;
    physicalReadyDate: Date;
    nonWaterLiquids: RecipeIngredient[];
}

export interface IngredientRowMeta {
    sapValue: number;
    percentage?: string;
    role?: RecipeIngredientRole;
}

export interface QualityProgress {
    value: number;
    score: number;
    tone: 'danger' | 'warning' | 'good';
}

export interface MarkdownExport {
    content: string;
    filename: string;
}

export interface JsonExport {
    content: string;
    filename: string;
}

export interface CalculatorExports {
    markdown: MarkdownExport;
    json: JsonExport;
}

export interface CalculatorResult {
    results: CalculationResults;
    phaseTotals: PhaseTotals;
    fattyAcidLabels: FattyAcidLabel[];
    normalizedRecipe: Recipe;
    ingredientMetaById: Record<string, IngredientRowMeta>;
    qualityProgress: {
        conditioning: QualityProgress;
        cleansing: QualityProgress;
        bubbles: QualityProgress;
        persistence: QualityProgress;
        hardness: QualityProgress;
    };
    exports: CalculatorExports;
    issues: string[];
}
