import { Recipe, RecipeIngredient } from '../../shared/types/Recipe';
import { Ingredient } from '../../shared/types/Ingredient';
export interface CalculationResults {
    totalWeight: number;
    totalFats: number;
    sapAverage: number;
    alkaliPure: number;
    alkaliReal: number;
    alkaliPurity: number;
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
        gadoleic: number;
        other: number;
    };
    inciList: string[];
}
export class CalculatorService {
    static calculate(recipe: Recipe, ingredients: Ingredient[]): CalculationResults {
        const isCitricAcid = (ing?: Ingredient) => {
            if (!ing) return false;
            return !!ing.flags?.citricAcid;
        };
        const getIngredient = (item: RecipeIngredient) => {
            const ref = item.ingredientId || item.id;
            if (!ref) return undefined;
            return ingredients.find(i => i.id === ref);
        };
        const isWaterItem = (item: RecipeIngredient) => {
            if (item.role === 'water') return true;
            const ing = getIngredient(item);
            return ing?.kind === 'water';
        };
        const sumAmounts = (items?: RecipeIngredient[]) => (items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
        const warn = (message: string) => {
            if (typeof console !== 'undefined') {
                console.warn(`[CalculatorService] ${message}`);
            }
        };
        const getSapKOH = (ing?: Ingredient) => {
            if (!ing) return 0;
            if (ing.sapKOH) return ing.sapKOH;
            return ing.sapNaOH ? ing.sapNaOH * 1.403 : 0;
        };
        const isBaseOil = (ing?: Ingredient) => ing?.kind === 'oil';
        const isTraceOil = (ing?: Ingredient) => ing?.kind === 'oil';
        const getBaseOils = () => {
            const diagnostics: string[] = [];
            const oils = (recipe.fats || []).flatMap((item) => {
                if ((item.amount || 0) <= 0) return [];
                const ing = getIngredient(item);
                if (!ing) {
                    diagnostics.push(`Ingrediente não encontrado para "${item.name || item.id}".`);
                    return [];
                }
                if (!isBaseOil(ing)) {
                    diagnostics.push(`Ingrediente "${ing.name}" não é óleo base; ignorado.`);
                    return [];
                }
                return [{ ingredient: ing, amount: item.amount || 0 }];
            });
            return { oils, diagnostics };
        };
        const getTraceOils = () => {
            const diagnostics: string[] = [];
            const oils = (recipe.superfatOils || []).flatMap((item) => {
                if ((item.amount || 0) <= 0) return [];
                const ing = getIngredient(item);
                if (!ing) {
                    diagnostics.push(`Ingrediente não encontrado para "${item.name || item.id}".`);
                    return [];
                }
                if (!isTraceOil(ing)) {
                    diagnostics.push(`Ingrediente "${ing.name}" não é óleo de superfat; ignorado.`);
                    return [];
                }
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
                linolenic: fatty?.linolenic || 0,
                gadoleic: fatty?.gadoleic || 0,
                other: fatty?.other || 0
            };
            const entries = Object.entries(values);
            for (const [key, value] of entries) {
                if (value < 0 || value > 100) {
                    warn(`Valor de ácido graxo fora do intervalo (${key}=${value}) em ${name || 'ingrediente'}.`);
                }
            }
            const total = values.lauric + values.myristic + values.palmitic + values.stearic
                + values.ricinoleic + values.oleic + values.linoleic + values.linolenic
                + values.gadoleic + values.other;
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
                linolenic: 0,
                gadoleic: 0,
                other: 0
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
                const weightRatio = amount / weightTotal;
                profile.lauric += values.lauric * weightRatio;
                profile.myristic += values.myristic * weightRatio;
                profile.palmitic += values.palmitic * weightRatio;
                profile.stearic += values.stearic * weightRatio;
                profile.ricinoleic += values.ricinoleic * weightRatio;
                profile.oleic += values.oleic * weightRatio;
                profile.linoleic += values.linoleic * weightRatio;
                profile.linolenic += values.linolenic * weightRatio;
                profile.gadoleic += values.gadoleic * weightRatio;
                profile.other += values.other * weightRatio;
            });
            const sum = profile.lauric + profile.myristic + profile.palmitic + profile.stearic
                + profile.ricinoleic + profile.oleic + profile.linoleic + profile.linolenic
                + profile.gadoleic + profile.other;
            if (sum < 98 || sum > 102) {
                diagnostics.push(`Soma do perfil da mistura ${sum.toFixed(1)}% (esperado ~100%).`);
            }
            Object.entries(profile).forEach(([key, value]) => {
                if (value < 0 || value > 100) {
                    diagnostics.push(`Valor de ácido graxo fora do intervalo (${key}=${value.toFixed(1)}%).`);
                }
            });
            const oliveWeight = oils.filter(o => o.ingredient.tags?.includes('olive')).reduce((sum, o) => sum + o.amount, 0);
            if (oliveWeight / weightTotal >= 0.2 && profile.oleic < 10) {
                diagnostics.push('Oleico demasiado baixo para uma mistura com muito azeite.');
            }
            const castorWeight = oils.filter(o => o.ingredient.tags?.includes('castor')).reduce((sum, o) => sum + o.amount, 0);
            if (castorWeight / weightTotal < 0.05 && profile.ricinoleic > 10) {
                diagnostics.push('Ricinoleico alto sem presença relevante de rícino.');
            }
            const isValid = diagnostics.length === 0;
            return { profile, sum, isValid, diagnostics };
        };
        const computeQualityMetrics = (profile: CalculationResults['fattyAcids']) => ({
            hardness: profile.lauric + profile.myristic + profile.palmitic + profile.stearic,
            cleansing: profile.lauric + profile.myristic,
            bubbles: profile.lauric + profile.myristic,
            persistence: profile.palmitic + profile.stearic,
            conditioning: profile.oleic + profile.linoleic + profile.linolenic + profile.ricinoleic + profile.gadoleic
        });
        const results: CalculationResults = {
            totalWeight: 0,
            totalFats: 0,
            sapAverage: 0,
            alkaliPure: 0,
            alkaliReal: 0,
            alkaliPurity: 100,
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
                ricinoleic: 0,
                gadoleic: 0,
                other: 0
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
        const naohConversion = 0.713;
        const alkaliPurity = recipe.alkaliPurity ?? 100;
        let totalSapKOH = 0;
        baseOils.forEach(({ ingredient, amount }) => {
            const sapKOH = getSapKOH(ingredient);
            if (!sapKOH) {
                results.fattyAcidDiagnostics.push(`SAP em falta para "${ingredient.name}".`);
            }
            totalSapKOH += amount * sapKOH;
        });
        // Apply Superfat discount to lye (KOH base, convert for NaOH if needed)
        const superfatRatio = 1 - (recipe.superfat / 100);
        const sapAverage = baseOilsWeight > 0
            ? (totalSapKOH / baseOilsWeight) * (recipe.alkali === 'NaOH' ? naohConversion : 1)
            : 0;
        const lyeBase = baseOilsWeight * sapAverage;
        const baseLye = lyeBase * superfatRatio;
        // Extra lye required to neutralize citric acid additives (sodium/potassium citrate)
        const citricAcidAmount = (recipe.lyeAdditives || []).reduce((sum, item) => {
            const ing = getIngredient(item);
            return isCitricAcid(ing) ? sum + (item.amount || 0) : sum;
        }, 0);
        const citricLyeFactor = recipe.alkali === 'NaOH' ? 0.624 : 0.876;
        const citricLye = citricAcidAmount * citricLyeFactor;
        const alkaliPure = baseLye + citricLye;
        const purityRatio = alkaliPurity > 0 ? (alkaliPurity / 100) : 1;
        const alkaliReal = purityRatio > 0 ? alkaliPure / purityRatio : alkaliPure;
        results.sapAverage = sapAverage;
        results.alkaliPurity = alkaliPurity;
        results.alkaliPure = alkaliPure;
        results.alkaliReal = alkaliReal;
        results.alkaliAmount = alkaliReal;
        // 3. Calculate Water
        const lyeRatio = recipe.waterConcentration / 100;
        const waterFromRatio = lyeRatio > 0 ? alkaliReal * (1 - lyeRatio) / lyeRatio : 0;
        results.waterAmount = waterFromRatio;
        // 4. Iodine, INS, Fatty Acids, and Quality Metrics (base oils only)
        if (baseOilsWeight > 0) {
            let weightedSapKOH = 0;
            let solubility = 0;
            let drying = 0;
            baseOils.forEach(({ ingredient, amount }) => {
                const weightRatio = amount / baseOilsWeight;
                const sapKOH = getSapKOH(ingredient);
                weightedSapKOH += sapKOH * weightRatio;
                solubility += (ingredient.properties?.solubility || 0) * weightRatio;
                drying += (ingredient.properties?.drying || 0) * weightRatio;
            });
            results.properties.solubility = solubility;
            results.properties.drying = drying;
            const profileResult = computeFattyAcidProfile(baseOils);
            results.fattyAcidProfileValid = profileResult.isValid && baseOilData.diagnostics.length === 0;
            results.fattyAcidDiagnostics.push(...profileResult.diagnostics);
            results.fattyAcids = { ...profileResult.profile };
            if (results.fattyAcidProfileValid) {
                const iodine = (profileResult.profile.oleic * 0.86
                    + profileResult.profile.linoleic * 1.732
                    + profileResult.profile.linolenic * 2.616
                    + profileResult.profile.gadoleic * 0.86);
                results.iodine = iodine;
                results.ins = (weightedSapKOH * 1000) - iodine;
                const metrics = computeQualityMetrics(profileResult.profile);
                results.properties.hardness = metrics.hardness;
                results.properties.cleansing = metrics.cleansing;
                results.properties.bubbles = metrics.bubbles;
                results.properties.persistence = metrics.persistence;
                results.properties.conditioning = metrics.conditioning;
            } else {
                results.iodine = 0;
                results.ins = 0;
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
            const ing = getIngredient(item);
            if (ing && ing.inci && !results.inciList.includes(ing.inci)) {
                results.inciList.push(ing.inci);
            }
        });
        const phase1Weight = sumAmounts(recipe.fats);
        const nonWaterLiquids = (recipe.liquids || []).filter(item => !isWaterItem(item));
        const phase2Weight = sumAmounts(nonWaterLiquids)
            + results.waterAmount
            + sumAmounts(recipe.functionalAdditives)
            + sumAmounts(recipe.lyeAdditives)
            + results.alkaliAmount;
        const phase3Weight = sumAmounts(recipe.traceAdditives)
            + sumAmounts(recipe.superfatOils)
            + sumAmounts(recipe.essentialOils);
        results.totalWeight = phase1Weight + phase2Weight + phase3Weight;
        // 6. Glycerin estimation (saponified fats only)
        const glycerinFactor = 0.105;
        const saponifiedFats = baseOilsWeight * (1 - (recipe.superfat / 100));
        results.glycerin = saponifiedFats * glycerinFactor;
        return results;
    }
}
