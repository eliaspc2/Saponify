import type { CalculatorInput, CalculatorResult } from './CalculatorModels';

export interface CalculatorUseCase {
    calculate(input: CalculatorInput): CalculatorResult;
}
