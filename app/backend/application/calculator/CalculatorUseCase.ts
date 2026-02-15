import type { CalculatorInput, CalculatorResult, ScaleRecipeByPhase1TotalInput } from '../../domain/calculator/CalculatorModels';
import type { Recipe } from '../../../shared/types/Recipe';

export interface CalculatorUseCase {
    calculate(input: CalculatorInput): CalculatorResult;
    scaleRecipeByPhase1Total(input: ScaleRecipeByPhase1TotalInput): Recipe;
}
