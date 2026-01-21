import { Recipe, RecipeIngredient } from '../../shared/types/Recipe';
import { Ingredient } from '../../shared/types/Ingredient';

export interface CalculationResults {
    totalWeight: number;
    totalFats: number;
    alkaliAmount: number;
    waterAmount: number;
    glycerin: number;
    superfatFinal: number;
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
        const normalizeCategory = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const isBaseOil = (ing?: Ingredient) => {
            if (!ing?.category) return true;
            const category = normalizeCategory(ing.category);
            if (category.includes('oleos base') || category.includes('oleo base')) return true;
            if (category.includes('superfat')) return false;
            if (category.includes('aditivos')) return false;
            if (category.includes('lixivia') || category.includes('liquidos')) return false;
            if (category.includes('traco') || category.includes('essenciais')) return false;
            return true;
        };
        const getIngredient = (item: RecipeIngredient) =>
            ingredients.find(i => i.id === item.id || i.id === item.ingredientId);
        const sumAmounts = (items?: RecipeIngredient[]) => (items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
        const warn = (message: string) => {
            if (typeof console !== 'undefined') {
                console.warn(`[CalculatorService] ${message}`);
            }
        };
        const normalizeFattyAcids = (fatty?: Ingredient['fattyAcids'], name?: string) => {
            const values = {
                lauric: fatty?.lauric || 0,
                myristic: fatty?.myristic || 0,
                palmitic: fatty?.palmitic || 0,
                stearic: fatty?.stearic || 0,
                ricinoleic: fatty?.ricinoleic || 0,
                oleic: fatty?.oleic || 0,
                linoleic: fatty?.linoleic || 0,
                linolenic: fatty?.linolenic || 0
            };
            const entries = Object.entries(values);
            for (const [key, value] of entries) {
                if (value < 0 || value > 100) {
                    warn(`Valor de ácido graxo fora do intervalo (${key}=${value}) em ${name || 'ingrediente'}.`);
                }
            }
            const total = values.lauric + values.myristic + values.palmitic + values.stearic
                + values.ricinoleic + values.oleic + values.linoleic + values.linolenic;
            if (total <= 0) return values;
            if (Math.abs(total - 100) > 5) {
                warn(`Soma de ácidos graxos ${total.toFixed(1)}% em ${name || 'ingrediente'} (normalizando para 100%).`);
            }
            const factor = 100 / total;
            return {
                lauric: values.lauric * factor,
                myristic: values.myristic * factor,
                palmitic: values.palmitic * factor,
                stearic: values.stearic * factor,
                ricinoleic: values.ricinoleic * factor,
                oleic: values.oleic * factor,
                linoleic: values.linoleic * factor,
                linolenic: values.linolenic * factor
            };
        };

        const results: CalculationResults = {
            totalWeight: 0,
            totalFats: 0,
            alkaliAmount: 0,
            waterAmount: 0,
            glycerin: 0,
            superfatFinal: 0,
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
        const baseFats = fats.filter((item: RecipeIngredient) => {
            const ing = getIngredient(item);
            return !ing || isBaseOil(ing);
        });

        baseFats.forEach((item: RecipeIngredient) => {
            const amount = item.amount || 0;
            totalFatsAmount += amount;

            const ing = getIngredient(item);
            if (ing) {
                // Add to INCI list if not already there
                if (ing.inci && !results.inciList.includes(ing.inci)) {
                    results.inciList.push(ing.inci);
                }
            }
        });

        results.totalFats = totalFatsAmount;
        const superfatOilsAmount = sumAmounts(recipe.superfatOils);
        const unsaponifiedFromBase = totalFatsAmount * (recipe.superfat / 100);
        const totalOilPhase = totalFatsAmount + superfatOilsAmount;
        results.superfatFinal = totalOilPhase > 0
            ? ((unsaponifiedFromBase + superfatOilsAmount) / totalOilPhase) * 100
            : 0;

        // 2. Calculate Alkali (NaOH/KOH)
        let totalSap = 0;
        baseFats.forEach((item: RecipeIngredient) => {
            const amount = item.amount || 0;
            const ing = getIngredient(item);
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
            let weightedSapKOH = 0;
            const fattyMix = {
                lauric: 0,
                myristic: 0,
                palmitic: 0,
                stearic: 0,
                ricinoleic: 0,
                oleic: 0,
                linoleic: 0,
                linolenic: 0
            };

            baseFats.forEach((item: RecipeIngredient) => {
                const amount = item.amount || 0;
                const weightRatio = amount / totalFatsAmount;
                const ing = getIngredient(item);

                if (ing) {
                    const iodine = ing.iodine || 0;
                    weightedIodine += iodine * weightRatio;
                    const sapKOH = ing.sapKOH || (ing.sapNaOH ? ing.sapNaOH * 1.403 : 0);
                    weightedSapKOH += sapKOH * weightRatio;

                    results.properties.solubility += (ing.properties?.solubility || 0) * weightRatio;
                    results.properties.drying += (ing.properties?.drying || 0) * weightRatio;

                    const normalized = normalizeFattyAcids(ing.fattyAcids, ing.name);
                    fattyMix.lauric += normalized.lauric * weightRatio;
                    fattyMix.myristic += normalized.myristic * weightRatio;
                    fattyMix.palmitic += normalized.palmitic * weightRatio;
                    fattyMix.stearic += normalized.stearic * weightRatio;
                    fattyMix.oleic += normalized.oleic * weightRatio;
                    fattyMix.linoleic += normalized.linoleic * weightRatio;
                    fattyMix.linolenic += normalized.linolenic * weightRatio;
                    fattyMix.ricinoleic += normalized.ricinoleic * weightRatio;
                }
            });

            results.iodine = weightedIodine;
            results.ins = weightedSapKOH - results.iodine;

            const mixSum = fattyMix.lauric + fattyMix.myristic + fattyMix.palmitic + fattyMix.stearic
                + fattyMix.ricinoleic + fattyMix.oleic + fattyMix.linoleic + fattyMix.linolenic;
            if (mixSum > 0 && Math.abs(mixSum - 100) > 2) {
                warn(`Soma dos ácidos graxos da mistura ${mixSum.toFixed(1)}% (normalizando para 100%).`);
                const factor = 100 / mixSum;
                fattyMix.lauric *= factor;
                fattyMix.myristic *= factor;
                fattyMix.palmitic *= factor;
                fattyMix.stearic *= factor;
                fattyMix.ricinoleic *= factor;
                fattyMix.oleic *= factor;
                fattyMix.linoleic *= factor;
                fattyMix.linolenic *= factor;
            } else if (mixSum <= 0) {
                warn('Sem dados suficientes de ácidos graxos para calcular o perfil da mistura.');
            }

            results.fattyAcids = { ...fattyMix };
            results.properties.hardness = fattyMix.lauric + fattyMix.myristic + fattyMix.palmitic + fattyMix.stearic;
            results.properties.cleansing = fattyMix.lauric + fattyMix.myristic;
            results.properties.bubbles = fattyMix.lauric + fattyMix.myristic + fattyMix.ricinoleic;
            results.properties.persistence = fattyMix.palmitic + fattyMix.stearic + fattyMix.ricinoleic;
            results.properties.conditioning = fattyMix.oleic + fattyMix.linoleic + fattyMix.linolenic + fattyMix.ricinoleic;
        }

        // 5. Total weight
        const allAdditives = [
            ...(recipe.functionalAdditives || []),
            ...(recipe.lyeAdditives || []),
            ...(recipe.traceAdditives || []),
            ...(recipe.superfatOils || []),
            ...(recipe.essentialOils || [])
        ];

        allAdditives.forEach((item: RecipeIngredient) => {
            const ing = ingredients.find(i => i.id === item.id || i.id === item.ingredientId);
            if (ing && ing.inci && !results.inciList.includes(ing.inci)) {
                results.inciList.push(ing.inci);
            }
        });

        const phase1Weight = sumAmounts(recipe.fats);
        const phase2Weight = sumAmounts(recipe.liquids)
            + sumAmounts(recipe.functionalAdditives)
            + sumAmounts(recipe.lyeAdditives);
        const phase3Weight = sumAmounts(recipe.traceAdditives)
            + sumAmounts(recipe.superfatOils)
            + sumAmounts(recipe.essentialOils);
        results.totalWeight = phase1Weight + phase2Weight + phase3Weight;

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
