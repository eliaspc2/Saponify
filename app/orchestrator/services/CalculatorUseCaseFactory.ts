import type { CalculatorUseCase } from '../../backend/application/calculator/CalculatorUseCase';
import { CalculatorEngine } from '../../backend/domain/calculator/CalculatorEngine';

export const createCalculatorUseCase = (): CalculatorUseCase => new CalculatorEngine();

