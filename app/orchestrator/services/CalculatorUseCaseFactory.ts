import type { CalculatorUseCase } from '../calculator/CalculatorUseCase';
import { CalculatorEngine } from '../calculator/CalculatorEngine';

export const createCalculatorUseCase = (): CalculatorUseCase => new CalculatorEngine();
