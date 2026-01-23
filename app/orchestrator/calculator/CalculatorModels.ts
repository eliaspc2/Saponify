import type { Recipe, RecipeIngredient } from '../../shared/types/Recipe';
import type { Ingredient } from '../../shared/types/Ingredient';
import type { CalculationResults } from '../services/CalculatorService';
import type { FattyAcidLabel, QualityRanges, QualityRange } from './CalculatorRules';

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

export interface CalculatorResult {
    results: CalculationResults;
    phaseTotals: PhaseTotals;
    fattyAcidLabels: FattyAcidLabel[];
    qualityRanges: QualityRanges;
}

export interface IngredientRowMeta {
    sapValue: number;
    percentage: string;
}

export interface QualityProgress {
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

export type QualityRangeKey = keyof QualityRanges;
export type QualityRangeMap = Record<QualityRangeKey, QualityRange>;
