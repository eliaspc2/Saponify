import type { CalculationResults } from './CalculatorModels';

export const computeQualityMetrics = (profile: CalculationResults['fattyAcids']) => ({
    hardness: profile.lauric + profile.myristic + profile.palmitic + profile.stearic,
    cleansing: profile.lauric + profile.myristic,
    bubbles: profile.lauric + profile.myristic + profile.ricinoleic,
    persistence: profile.palmitic + profile.stearic + profile.ricinoleic,
    conditioning: profile.oleic + profile.linoleic + profile.linolenic + profile.ricinoleic + profile.gadoleic
});

export const computeIodine = (profile: CalculationResults['fattyAcids']) => (
    profile.oleic * 0.86
    + profile.linoleic * 1.732
    + profile.linolenic * 2.616
    + profile.gadoleic * 0.86
);

export const computeINS = (sapKOHAvg: number, iodine: number) => (sapKOHAvg * 1000) - iodine;
