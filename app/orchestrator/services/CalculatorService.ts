import { Recipe, RecipeIngredient } from '../../shared/types/Recipe';
import { Ingredient } from '../../shared/types/Ingredient';

export interface CalculationResults {
    totalWeight: number;
    totalFats: number;
    alkaliAmount: number;
    waterAmount: number;
    glycerin: number;
    superfatFinal: number;
    fattyAcidProfileValid: boolean;
    fattyAcidDiagnostics: string[];
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
        const getIngredient = (item: RecipeIngredient) =>
            ingredients.find(i => i.id === item.id || i.id === item.ingredientId);
        const sumAmounts = (items?: RecipeIngredient[]) => (items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
        const warn = (message: string) => {
            if (typeof console !== 'undefined') {
                console.warn(`[CalculatorService] ${message}`);
            }
        };
        const isBaseOil = (ing?: Ingredient) => {
            if (!ing?.category) return false;
            const category = normalizeCategory(ing.category);
            return category.includes('oleos base') || category.includes('oleo base');
        };
        const isTraceOil = (ing?: Ingredient) => {
            if (!ing?.category) return false;
            const category = normalizeCategory(ing.category);
            return category.includes('superfat');
        };
        const getBaseOils = () => {
            const diagnostics: string[] = [];
            const oils = (recipe.fats || []).flatMap((item) => {
                const ing = getIngredient(item);
                if (!ing) {
                    diagnostics.push(`Ingrediente não encontrado para "${item.name || item.id}".`);
                    return [];
                }
                if (!isBaseOil(ing)) {
                    diagnostics.push(`Ingrediente "${ing.name}" não é óleo base; ignorado.`);
                    return [];
                }
                if ((item.amount || 0) <= 0) return [];
                return [{ ingredient: ing, amount: item.amount || 0 }];
            });
            return { oils, diagnostics };
        };
        const getTraceOils = () => {
            const diagnostics: string[] = [];
            const oils = (recipe.superfatOils || []).flatMap((item) => {
                const ing = getIngredient(item);
                if (!ing) {
                    diagnostics.push(`Ingrediente não encontrado para "${item.name || item.id}".`);
                    return [];
                }
                if (!isTraceOil(ing)) {
                    diagnostics.push(`Ingrediente "${ing.name}" não é óleo de superfat; ignorado.`);
                    return [];
                }
                if ((item.amount || 0) <= 0) return [];
                return [{ ingredient: ing, amount: item.amount || 0 }];
            });
            return { oils, diagnostics };
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
            if (total <= 0) return { values, total };
            return { values, total };
        };
        const computeFattyAcidProfile = (oils: { ingredient: Ingredient; amount: number }[]) => {
            const diagnostics: string[] = [];
            const profile = {
                lauric: 0,
                myristic: 0,
                palmitic: 0,
                stearic: 0,
                ricinoleic: 0,
                oleic: 0,
                linoleic: 0,
                linolenic: 0
            };

            const weightTotal = oils.reduce((sum, oil) => sum + oil.amount, 0);
            if (weightTotal <= 0) {
                diagnostics.push('Sem óleos base para calcular o perfil.');
                return { profile, sum: 0, isValid: false, diagnostics };
            }

            oils.forEach(({ ingredient, amount }) => {
                const { values, total } = normalizeFattyAcids(ingredient.fattyAcids, ingredient.name);
                if (total <= 0) {
                    diagnostics.push(`Sem perfil de ácidos graxos para "${ingredient.name}".`);
                    return;
                }
                if (total < 98 || total > 102) {
                    diagnostics.push(`Perfil inválido para "${ingredient.name}": soma ${total.toFixed(1)}%.`);
                }
                const factor = (total >= 98 && total <= 102) ? (100 / total) : 1;
                const weightRatio = amount / weightTotal;
                profile.lauric += values.lauric * factor * weightRatio;
                profile.myristic += values.myristic * factor * weightRatio;
                profile.palmitic += values.palmitic * factor * weightRatio;
                profile.stearic += values.stearic * factor * weightRatio;
                profile.ricinoleic += values.ricinoleic * factor * weightRatio;
                profile.oleic += values.oleic * factor * weightRatio;
                profile.linoleic += values.linoleic * factor * weightRatio;
                profile.linolenic += values.linolenic * factor * weightRatio;
            });

            const sum = profile.lauric + profile.myristic + profile.palmitic + profile.stearic
                + profile.ricinoleic + profile.oleic + profile.linoleic + profile.linolenic;

            if (sum < 98 || sum > 102) {
                diagnostics.push(`Soma do perfil da mistura ${sum.toFixed(1)}% (esperado ~100%).`);
            }
            Object.entries(profile).forEach(([key, value]) => {
                if (value < 0 || value > 100) {
                    diagnostics.push(`Valor de ácido graxo fora do intervalo (${key}=${value.toFixed(1)}%).`);
                }
            });

            const oliveWeight = oils.filter(o => /azeite|oliva/i.test(o.ingredient.name)).reduce((sum, o) => sum + o.amount, 0);
            if (oliveWeight / weightTotal >= 0.2 && profile.oleic < 10) {
                diagnostics.push('Oleico demasiado baixo para uma mistura com muito azeite.');
            }
            const castorWeight = oils.filter(o => /r[ií]cino|castor/i.test(o.ingredient.name)).reduce((sum, o) => sum + o.amount, 0);
            if (castorWeight / weightTotal < 0.05 && profile.ricinoleic > 10) {
                diagnostics.push('Ricinoleico alto sem presença relevante de rícino.');
            }

            const isValid = diagnostics.length === 0;
            return { profile, sum, isValid, diagnostics };
        };
        const computeQualityMetrics = (profile: CalculationResults['fattyAcids']) => ({
            hardness: profile.lauric + profile.myristic + profile.palmitic + profile.stearic,
            cleansing: profile.lauric + profile.myristic,
            bubbles: profile.lauric + profile.myristic + profile.ricinoleic,
            persistence: profile.palmitic + profile.stearic + profile.ricinoleic,
            conditioning: profile.oleic + profile.linoleic + profile.linolenic + profile.ricinoleic
        });

        const results: CalculationResults = {
            totalWeight: 0,
            totalFats: 0,
            alkaliAmount: 0,
            waterAmount: 0,
            glycerin: 0,
            superfatFinal: 0,
            fattyAcidProfileValid: false,
            fattyAcidDiagnostics: [],
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

        // 1. Select canonical ingredient sets
        const baseOilData = getBaseOils();
        const traceOilData = getTraceOils();
        const baseOils = baseOilData.oils;
        const traceOils = traceOilData.oils;
        const baseOilsWeight = baseOils.reduce((sum, oil) => sum + oil.amount, 0);
        const traceOilsWeight = traceOils.reduce((sum, oil) => sum + oil.amount, 0);

        results.totalFats = baseOilsWeight;
        results.fattyAcidDiagnostics = [...baseOilData.diagnostics, ...traceOilData.diagnostics];

        const unsaponifiedFromBase = baseOilsWeight * (recipe.superfat / 100);
        const totalOilPhase = baseOilsWeight + traceOilsWeight;
        results.superfatFinal = totalOilPhase > 0
            ? ((unsaponifiedFromBase + traceOilsWeight) / totalOilPhase) * 100
            : 0;

        baseOils.forEach(({ ingredient }) => {
            if (ingredient.inci && !results.inciList.includes(ingredient.inci)) {
                results.inciList.push(ingredient.inci);
            }
        });

        // 2. Calculate Alkali (NaOH/KOH)
        let totalSap = 0;
        baseOils.forEach(({ ingredient, amount }) => {
            const sapValue = recipe.alkali === 'NaOH'
                ? (ingredient.sapNaOH || 0)
                : (ingredient.sapKOH || 0);
            if (!sapValue) {
                results.fattyAcidDiagnostics.push(`SAP em falta para "${ingredient.name}".`);
            }
            totalSap += amount * sapValue;
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
        results.waterAmount = waterItem?.amount || (baseOilsWeight * (recipe.waterConcentration / 100));

        // 4. Iodine, INS, Fatty Acids, and Quality Metrics (base oils only)
        if (baseOilsWeight > 0) {
            let weightedIodine = 0;
            let weightedSapKOH = 0;
            let solubility = 0;
            let drying = 0;

            baseOils.forEach(({ ingredient, amount }) => {
                const weightRatio = amount / baseOilsWeight;
                weightedIodine += (ingredient.iodine || 0) * weightRatio;
                const sapKOH = ingredient.sapKOH || (ingredient.sapNaOH ? ingredient.sapNaOH * 1.403 : 0);
                weightedSapKOH += sapKOH * weightRatio;
                solubility += (ingredient.properties?.solubility || 0) * weightRatio;
                drying += (ingredient.properties?.drying || 0) * weightRatio;
            });

            results.iodine = weightedIodine;
            results.ins = weightedSapKOH - results.iodine;
            results.properties.solubility = solubility;
            results.properties.drying = drying;

            const profileResult = computeFattyAcidProfile(baseOils);
            results.fattyAcidProfileValid = profileResult.isValid && baseOilData.diagnostics.length === 0;
            results.fattyAcidDiagnostics.push(...profileResult.diagnostics);
            results.fattyAcids = { ...profileResult.profile };

            if (results.fattyAcidProfileValid) {
                const metrics = computeQualityMetrics(profileResult.profile);
                results.properties.hardness = metrics.hardness;
                results.properties.cleansing = metrics.cleansing;
                results.properties.bubbles = metrics.bubbles;
                results.properties.persistence = metrics.persistence;
                results.properties.conditioning = metrics.conditioning;
            } else {
                results.properties.hardness = 0;
                results.properties.cleansing = 0;
                results.properties.bubbles = 0;
                results.properties.persistence = 0;
                results.properties.conditioning = 0;
            }
        } else {
            results.fattyAcidProfileValid = false;
            results.fattyAcidDiagnostics.push('Sem óleos base para cálculo das métricas.');
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
