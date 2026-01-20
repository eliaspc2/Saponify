import { Recipe, RecipeIngredient } from '../../shared/types/Recipe';
import { Ingredient } from '../../shared/types/Ingredient';

export interface CalculationResults {
    totalWeight: number;
    totalFats: number;
    alkaliAmount: number;
    waterAmount: number;
    glycerin: number;
    lyeConcentration: number;
    iodine: number;
    ins: number;
    properties: {
        conditioning: number;
        cleansing: number;
        bubbles: number;
        persistence: number;
        hardness: number;
        solubility: number;
        drying: number;
    };
    fattyAcids: {
        lauric: number;
        myristic: number;
        palmitic: number;
        stearic: number;
        oleic: number;
        linoleic: number;
        linolenic: number;
        ricinoleic: number;
    };
    inciList: string[];
}

export class CalculatorService {
    static calculate(recipe: Recipe, ingredients: Ingredient[]): CalculationResults {
        const isCitricAcid = (ing?: Ingredient) => {
            if (!ing) return false;
            if (ing.flags?.citricAcid) return true;
            const text = `${ing.name} ${ing.inci}`.toLowerCase();
            return text.includes('citric acid') || text.includes('acido citrico') || text.includes('ácido cítrico');
        };

        const results: CalculationResults = {
            totalWeight: 0,
            totalFats: 0,
            alkaliAmount: 0,
            waterAmount: 0,
            glycerin: 0,
            lyeConcentration: recipe.waterConcentration,
            iodine: 0,
            ins: 0,
            properties: {
                conditioning: 0,
                cleansing: 0,
                bubbles: 0,
                persistence: 0,
                hardness: 0,
                solubility: 0,
                drying: 0
            },
            fattyAcids: {
                lauric: 0,
                myristic: 0,
                palmitic: 0,
                stearic: 0,
                oleic: 0,
                linoleic: 0,
                linolenic: 0,
                ricinoleic: 0
            },
            inciList: []
        };

        // 1. Calculate Total Fats and initial properties
        let totalFatsAmount = 0;
        const fats = recipe.fats || [];
        fats.forEach((item: RecipeIngredient) => {
            const amount = item.amount || 0;
            totalFatsAmount += amount;

            const ing = ingredients.find(i => i.id === item.id || i.id === item.ingredientId);
            if (ing) {
                // Add to INCI list if not already there
                if (ing.inci && !results.inciList.includes(ing.inci)) {
                    results.inciList.push(ing.inci);
                }
            }
        });

        results.totalFats = totalFatsAmount;

        // 2. Calculate Alkali (NaOH/KOH)
        let totalSap = 0;
        fats.forEach((item: RecipeIngredient) => {
            const amount = item.amount || 0;
            const ing = ingredients.find(i => i.id === item.id || i.id === item.ingredientId);
            if (ing) {
                const sapValue = recipe.alkali === 'NaOH' ? (ing.sapNaOH || 0) : (ing.sapKOH || 0);
                totalSap += amount * sapValue;
            }
        });

        // Apply Superfat discount to lye
        const superfatRatio = 1 - (recipe.superfat / 100);
        const baseLye = totalSap * superfatRatio;

        // Extra lye required to neutralize citric acid additives (sodium/potassium citrate)
        const citricAcidAmount = (recipe.lyeAdditives || []).reduce((sum, item) => {
            const ing = ingredients.find(i => i.id === item.id || i.id === item.ingredientId);
            return isCitricAcid(ing) ? sum + (item.amount || 0) : sum;
        }, 0);
        const citricLyeFactor = recipe.alkali === 'NaOH' ? 0.624 : 0.876;
        const citricLye = citricAcidAmount * citricLyeFactor;

        results.alkaliAmount = baseLye + citricLye;

        // 3. Calculate Water
        const waterItem = recipe.liquids.find((l: RecipeIngredient) => l.name.toLowerCase().includes('água'));
        results.waterAmount = waterItem?.amount || (totalFatsAmount * (recipe.waterConcentration / 100));

        // 4. Calculate Properties (Weighted Average based on Fat amounts)
        if (totalFatsAmount > 0) {
            let weightedIodine = 0;
            let weightedIns = 0;

            recipe.fats.forEach((item: RecipeIngredient) => {
                const amount = item.amount || 0;
                const weightRatio = amount / totalFatsAmount;
                const ing = ingredients.find(i => i.id === item.id || i.id === item.ingredientId);

                if (ing) {
                    weightedIodine += (ing.iodine || 0) * weightRatio;
                    weightedIns += (ing.ins || 0) * weightRatio;

                    results.properties.conditioning += (ing.properties?.conditioning || 0) * weightRatio;
                    results.properties.cleansing += (ing.properties?.cleansing || 0) * weightRatio;
                    results.properties.bubbles += (ing.properties?.bubbly || 0) * weightRatio;
                    results.properties.persistence += (ing.properties?.stable || 0) * weightRatio;
                    results.properties.hardness += (ing.properties?.hardness || 0) * weightRatio;
                    results.properties.solubility += (ing.properties?.solubility || 0) * weightRatio;
                    results.properties.drying += (ing.properties?.drying || 0) * weightRatio;

                    results.fattyAcids.lauric += (ing.fattyAcids?.lauric || 0) * weightRatio;
                    results.fattyAcids.myristic += (ing.fattyAcids?.myristic || 0) * weightRatio;
                    results.fattyAcids.palmitic += (ing.fattyAcids?.palmitic || 0) * weightRatio;
                    results.fattyAcids.stearic += (ing.fattyAcids?.stearic || 0) * weightRatio;
                    results.fattyAcids.oleic += (ing.fattyAcids?.oleic || 0) * weightRatio;
                    results.fattyAcids.linoleic += (ing.fattyAcids?.linoleic || 0) * weightRatio;
                    results.fattyAcids.linolenic += (ing.fattyAcids?.linolenic || 0) * weightRatio;
                    results.fattyAcids.ricinoleic += (ing.fattyAcids?.ricinoleic || 0) * weightRatio;
                }
            });

            results.iodine = weightedIodine;
            results.ins = weightedIns;
        }

        // 5. Total weight
        let additiveWeight = 0;
        const allAdditives = [
            ...(recipe.functionalAdditives || []),
            ...(recipe.lyeAdditives || []),
            ...(recipe.traceAdditives || []),
            ...(recipe.superfatOils || []),
            ...(recipe.essentialOils || [])
        ];

        allAdditives.forEach((item: RecipeIngredient) => {
            additiveWeight += (item.amount || 0);

            const ing = ingredients.find(i => i.id === item.id || i.id === item.ingredientId);
            if (ing && ing.inci && !results.inciList.includes(ing.inci)) {
                results.inciList.push(ing.inci);
            }
        });

        results.totalWeight = totalFatsAmount + results.alkaliAmount + results.waterAmount + additiveWeight;

        // 6. Glycerin estimation (3 moles NaOH = 1 mole Glycerin)
        // Ratio Glycerin/NaOH mass: 92.09 / (3 * 39.99) = 0.767
        // Ratio Glycerin/KOH mass: 92.09 / (3 * 56.1) = 0.547
        if (recipe.alkali === 'NaOH') {
            results.glycerin = results.alkaliAmount * 0.767;
        } else {
            results.glycerin = results.alkaliAmount * 0.547;
        }

        return results;
    }
}
