import type { CalculatorInput, CalculatorResult } from '../../domain/calculator/CalculatorModels';

export interface CalculatorUseCase {
    calculate(input: CalculatorInput): CalculatorResult;
}
