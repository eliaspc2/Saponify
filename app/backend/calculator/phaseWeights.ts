import type { Recipe, RecipeIngredient } from '../../shared/types/Recipe';

export type PhaseWeightsResult = {
    phase1Weight: number;
    phase2Weight: number;
    phase3Weight: number;
    totalWeight: number;
    nonWaterLiquids: RecipeIngredient[];
};

export const computePhaseWeights = ({
    recipe,
    waterAmount,
    alkaliAmount,
    isWaterItem
}: {
    recipe: Recipe;
    waterAmount: number;
    alkaliAmount: number;
    isWaterItem: (item: RecipeIngredient) => boolean;
}): PhaseWeightsResult => {
    const sumAmounts = (items?: RecipeIngredient[]) => (items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
    const phase1Weight = sumAmounts(recipe.fats);
    const nonWaterLiquids = (recipe.liquids || []).filter(item => !isWaterItem(item));
    const phase2Weight = sumAmounts(nonWaterLiquids)
        + waterAmount
        + sumAmounts(recipe.functionalAdditives)
        + sumAmounts(recipe.lyeAdditives)
        + alkaliAmount;
    const phase3Weight = sumAmounts(recipe.traceAdditives)
        + sumAmounts(recipe.superfatOils)
        + sumAmounts(recipe.essentialOils);
    const totalWeight = phase1Weight + phase2Weight + phase3Weight;
    return { phase1Weight, phase2Weight, phase3Weight, totalWeight, nonWaterLiquids };
};

export const computeGlycerin = ({
    baseOilsWeight,
    superfat,
    factor = 0.105
}: {
    baseOilsWeight: number;
    superfat: number;
    factor?: number;
}) => {
    const saponifiedFats = baseOilsWeight * (1 - (superfat / 100));
    return saponifiedFats * factor;
};
