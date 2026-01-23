import type { CalculatorUseCase } from '../../backend/calculator/CalculatorUseCase';
import { CalculatorEngine } from '../../backend/calculator/CalculatorEngine';

export const createCalculatorUseCase = (): CalculatorUseCase => new CalculatorEngine();
