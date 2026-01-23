import type { Ingredient } from '../../shared/types/Ingredient';
import type { Recipe, RecipeIngredient } from '../../shared/types/Recipe';
import type { OilPortion } from './fattyAcidProfile';

type GetIngredientFn = (item: RecipeIngredient) => Ingredient | undefined;
type GetSapKOHFn = (ingredient?: Ingredient) => number;
type IsCitricAcidFn = (ingredient?: Ingredient) => boolean;

export type AlkaliAndWaterResult = {
    sapAverage: number;
    alkaliPurity: number;
    alkaliPure: number;
    alkaliReal: number;
    alkaliAmount: number;
    waterAmount: number;
    diagnostics: string[];
};

export const computeAlkaliAndWater = ({
    recipe,
    baseOils,
    lyeAdditives,
    getIngredient,
    getSapKOH,
    isCitricAcid
}: {
    recipe: Recipe;
    baseOils: OilPortion[];
    lyeAdditives: RecipeIngredient[];
    getIngredient: GetIngredientFn;
    getSapKOH: GetSapKOHFn;
    isCitricAcid: IsCitricAcidFn;
}): AlkaliAndWaterResult => {
    const diagnostics: string[] = [];
    const baseOilsWeight = baseOils.reduce((sum, oil) => sum + oil.amount, 0);

    const naohConversion = 0.713;
    const alkaliPurity = recipe.alkaliPurity ?? 100;
    let totalSapKOH = 0;

    baseOils.forEach(({ ingredient, amount }) => {
        const sapKOH = getSapKOH(ingredient);
        if (!sapKOH) {
            diagnostics.push(`SAP em falta para "${ingredient.name}".`);
        }
        totalSapKOH += amount * sapKOH;
    });

    const superfatRatio = 1 - (recipe.superfat / 100);
    const sapAverage = baseOilsWeight > 0
        ? (totalSapKOH / baseOilsWeight) * (recipe.alkali === 'NaOH' ? naohConversion : 1)
        : 0;
    const lyeBase = baseOilsWeight * sapAverage;
    const baseLye = lyeBase * superfatRatio;

    const citricAcidAmount = (lyeAdditives || []).reduce((sum, item) => {
        const ing = getIngredient(item);
        return isCitricAcid(ing) ? sum + (item.amount || 0) : sum;
    }, 0);
    const citricLyeFactor = recipe.alkali === 'NaOH' ? 0.624 : 0.876;
    const citricLye = citricAcidAmount * citricLyeFactor;

    const alkaliPure = baseLye + citricLye;
    const purityRatio = alkaliPurity > 0 ? (alkaliPurity / 100) : 1;
    const alkaliReal = purityRatio > 0 ? alkaliPure / purityRatio : alkaliPure;
    const alkaliAmount = alkaliReal;

    const lyeRatio = recipe.waterConcentration / 100;
    const waterAmount = lyeRatio > 0 ? alkaliReal * (1 - lyeRatio) / lyeRatio : 0;

    return {
        sapAverage,
        alkaliPurity,
        alkaliPure,
        alkaliReal,
        alkaliAmount,
        waterAmount,
        diagnostics
    };
};
