import { Ingredient } from '../../../shared/types/Ingredient';
import { Recipe, RecipeIngredient, RecipeIngredientRole } from '../../../shared/types/Recipe';
import { DEFAULT_HERB_WEIGHT, INFUSION_RATIO_FATS_PER_TS } from '../../../shared/constants/RecipeConstants';
import { formatRecipeCodeForFile, formatRecipeReference } from '../../../shared/utils/recipeFormat';
import { FATTY_ACID_LABELS, QUALITY_RANGES } from './CalculatorRules';
import type { CalculatorInput, CalculatorResult, IngredientRowMeta, CalculatorExports, CalculationResults } from './CalculatorModels';
import { computeFattyAcidProfile, type OilPortion } from './fattyAcidProfile';
import { computeQualityMetrics, computeIodine, computeINS } from './qualityMetrics';
import { computeAlkaliAndWater } from './alkaliAndWater';
import { computePhaseWeights, computeGlycerin } from './phaseWeights';
export class CalculatorEngine {
    public calculate(input: CalculatorInput): CalculatorResult {
        return CalculatorEngine.calculate(input);
    }

    static calculate(input: CalculatorInput): CalculatorResult {
        const normalization = this.normalizeRecipe(input.recipe, input.ingredients);
        const results = this.computeResults(normalization.recipe, input.ingredients);
        const normalizedRecipe = this.applyWaterAmount(normalization.recipe, results.waterAmount, input.ingredients);
        const phaseTotals = this.computePhaseTotals(normalizedRecipe, results, input.ingredients, input.now);
        const ingredientMetaById = this.buildIngredientMeta(normalizedRecipe, input.ingredients);
        const qualityProgress = this.buildQualityProgress(results);
        const exports = this.buildExports(normalizedRecipe, results);
        const issues = [...normalization.issues, ...results.fattyAcidDiagnostics];

        return {
            results,
            phaseTotals,
            fattyAcidLabels: FATTY_ACID_LABELS,
            normalizedRecipe,
            ingredientMetaById,
            qualityProgress,
            exports,
            issues
        };
    }

    private static normalizeRecipe(recipe: Recipe, ingredients: Ingredient[]): { recipe: Recipe; issues: string[] } {
        const issues: string[] = [];
        if (!ingredients || ingredients.length === 0) {
            issues.push('Lista de ingredientes vazia.');
        }
        const cloneItems = (items?: RecipeIngredient[]) => (items || []).map(item => ({ ...item }));
        const normalized: Recipe = {
            ...recipe,
            fats: cloneItems(recipe.fats),
            liquids: cloneItems(recipe.liquids),
            functionalAdditives: cloneItems(recipe.functionalAdditives),
            lyeAdditives: cloneItems(recipe.lyeAdditives),
            traceAdditives: cloneItems(recipe.traceAdditives),
            superfatOils: cloneItems(recipe.superfatOils),
            essentialOils: cloneItems(recipe.essentialOils)
        };

        const totalFats = normalized.fats.reduce((sum, item) => sum + (item.amount || 0), 0);

        const applyRoleAndAutoAmount = (item: RecipeIngredient) => {
            const ingredient = this.findIngredient(item, ingredients);
            if (ingredient?.kind === 'water') {
                item.role = 'water';
            } else if (!item.role) {
                item.role = 'other';
            }

            if (item.autoAmount && (!item.amount || item.amount === 0) && ingredient) {
                const suggested = this.getSuggestedAmount(ingredient, totalFats);
                if (suggested !== null) {
                    item.amount = suggested;
                }
            }
            if (item.autoAmount) {
                item.autoAmount = false;
            }
        };

        [
            ...normalized.fats,
            ...normalized.liquids,
            ...normalized.functionalAdditives,
            ...normalized.lyeAdditives,
            ...normalized.traceAdditives,
            ...normalized.superfatOils,
            ...normalized.essentialOils
        ].forEach(applyRoleAndAutoAmount);

        const waterIngredient = ingredients.find(ing => ing.kind === 'water');
        if (!waterIngredient) {
            issues.push('Ingrediente de água não encontrado.');
        } else {
            const waterItems = normalized.liquids.filter(item => this.resolveItemRole(item, ingredients) === 'water');
            if (waterItems.length === 0) {
                normalized.liquids.push({
                    id: this.generateId(),
                    ingredientId: waterIngredient.id,
                    name: waterIngredient.name,
                    amount: 0,
                    percentage: 0,
                    role: 'water'
                });
            } else if (waterItems.length > 1) {
                issues.push('Existem múltiplos itens marcados como água.');
            }
        }

        const missingIngredientIds = [
            ...normalized.fats,
            ...normalized.liquids,
            ...normalized.functionalAdditives,
            ...normalized.lyeAdditives,
            ...normalized.traceAdditives,
            ...normalized.superfatOils,
            ...normalized.essentialOils
        ].filter(item => !item.ingredientId);
        if (missingIngredientIds.length > 0) {
            issues.push('Existem itens sem ingredientId. Verifique as seleções.');
        }

        return { recipe: normalized, issues };
    }

    private static applyWaterAmount(recipe: Recipe, waterAmount: number, ingredients: Ingredient[]): Recipe {
        const updatedLiquids: RecipeIngredient[] = (recipe.liquids || []).map(item => {
            if (this.resolveItemRole(item, ingredients) === 'water') {
                return { ...item, amount: waterAmount, role: 'water' as RecipeIngredientRole };
            }
            return item;
        });
        return { ...recipe, liquids: updatedLiquids };
    }

    private static computeResults(recipe: Recipe, ingredients: Ingredient[]): CalculationResults {
        const isCitricAcid = (ing?: Ingredient) => {
            if (!ing) return false;
            return !!ing.flags?.citricAcid;
        };
        const getIngredient = (item: RecipeIngredient) => this.findIngredient(item, ingredients);
        const isWaterItem = (item: RecipeIngredient) => this.resolveItemRole(item, ingredients) === 'water';
        const warn = (message: string) => {
            if (typeof console !== 'undefined') {
                console.warn(`[CalculatorEngine] ${message}`);
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
            const oils: OilPortion[] = (recipe.fats || []).flatMap((item) => {
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
            const oils: OilPortion[] = (recipe.superfatOils || []).flatMap((item) => {
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
            inciList: [],
            goodConditionDays: 365
        };
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
        const alkaliResult = computeAlkaliAndWater({
            recipe,
            baseOils,
            lyeAdditives: recipe.lyeAdditives || [],
            getIngredient,
            getSapKOH,
            isCitricAcid
        });
        results.sapAverage = alkaliResult.sapAverage;
        results.alkaliPurity = alkaliResult.alkaliPurity;
        results.alkaliPure = alkaliResult.alkaliPure;
        results.alkaliReal = alkaliResult.alkaliReal;
        results.alkaliAmount = alkaliResult.alkaliAmount;
        results.waterAmount = alkaliResult.waterAmount;
        results.fattyAcidDiagnostics.push(...alkaliResult.diagnostics);
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
            const profileResult = computeFattyAcidProfile(baseOils, warn);
            results.fattyAcidProfileValid = profileResult.isValid && baseOilData.diagnostics.length === 0;
            results.fattyAcidDiagnostics.push(...profileResult.diagnostics);
            results.fattyAcids = { ...profileResult.profile };
            if (results.fattyAcidProfileValid) {
                const iodine = computeIodine(profileResult.profile);
                results.iodine = iodine;
                results.ins = computeINS(weightedSapKOH, iodine);
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
        const weights = computePhaseWeights({
            recipe,
            waterAmount: results.waterAmount,
            alkaliAmount: results.alkaliAmount,
            isWaterItem
        });
        results.totalWeight = weights.totalWeight;
        results.glycerin = computeGlycerin({ baseOilsWeight, superfat: recipe.superfat });
        results.goodConditionDays = this.estimateGoodConditionDays(recipe, results, ingredients);
        return results;
    }

    private static computePhaseTotals(recipe: Recipe, results: CalculatorResult['results'], ingredients: Ingredient[], now?: Date) {
        const sumAmounts = (items?: RecipeIngredient[]) => (items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
        const nonWaterLiquids = (recipe.liquids || []).filter(item => this.resolveItemRole(item, ingredients) !== 'water');
        const phase1Total = sumAmounts(recipe.fats);
        const phase2Total = sumAmounts(nonWaterLiquids)
            + results.waterAmount
            + sumAmounts(recipe.functionalAdditives)
            + sumAmounts(recipe.lyeAdditives)
            + results.alkaliAmount;
        const phase3Total = sumAmounts(recipe.traceAdditives) + sumAmounts(recipe.superfatOils) + sumAmounts(recipe.essentialOils);
        const today = now ? new Date(now) : new Date();
        const physicalDays = this.getPhysicalCureDays(today);
        const physicalReadyDate = new Date(today.getTime());
        physicalReadyDate.setDate(physicalReadyDate.getDate() + physicalDays);
        const batchWeightWithLye = phase1Total + phase2Total + phase3Total;
        const estimatedDryWeight = Math.max(0, batchWeightWithLye - (results.waterAmount * 0.85));
        const goodConditionDays = Math.max(180, Math.round(results.goodConditionDays || 365));
        const goodConditionEndDate = new Date(today.getTime());
        goodConditionEndDate.setDate(goodConditionEndDate.getDate() + goodConditionDays);
        return {
            phase1Total,
            phase2Total,
            phase3Total,
            batchWeightWithLye,
            estimatedDryWeight,
            physicalDays,
            physicalReadyDate,
            goodConditionDays,
            goodConditionEndDate,
            nonWaterLiquids
        };
    }


    private static estimateGoodConditionDays(recipe: Recipe, results: CalculationResults, ingredients: Ingredient[]): number {
        const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

        let days = 365;

        const unstableFattyAcids = (results.fattyAcids.linoleic || 0) + (results.fattyAcids.linolenic || 0);
        days -= clamp((unstableFattyAcids - 12) * 6, 0, 180);

        days -= clamp((results.superfatFinal - 8) * 18, 0, 140);
        days -= clamp((results.iodine - 70) * 1.8, 0, 110);
        days -= clamp((35 - results.properties.hardness) * 3, 0, 120);

        days += clamp((results.lyeConcentration - 28) * 8, 0, 45);
        days += clamp((results.properties.hardness - 45) * 2, 0, 30);

        days += this.estimateProtectionBonus(recipe, ingredients);

        return Math.round(clamp(days, 180, 720));
    }

    private static estimateProtectionBonus(recipe: Recipe, ingredients: Ingredient[]): number {
        let bonus = 0;
        let hasCitric = false;
        let hasVitE = false;
        let hasVitD = false;
        let hasRosemary = false;
        let hasBeeswax = false;
        let hasKaolin = false;

        const items = [
            ...(recipe.fats || []),
            ...(recipe.lyeAdditives || []),
            ...(recipe.traceAdditives || []),
            ...(recipe.superfatOils || []),
            ...(recipe.essentialOils || [])
        ];

        items.forEach((item) => {
            const ingredient = this.findIngredient(item, ingredients);
            const name = (ingredient?.name || item.name || '').toLowerCase();

            if (!hasCitric && (ingredient?.flags?.citricAcid || name.includes('ácido cítrico') || name.includes('acido citrico'))) {
                hasCitric = true;
                bonus += 20;
            }
            if (!hasVitE && (name.includes('vitamina e') || name.includes('tocopherol'))) {
                hasVitE = true;
                bonus += 30;
            }
            if (!hasVitD && name.includes('vitamina d')) {
                hasVitD = true;
                bonus += 10;
            }
            if (!hasRosemary && name.includes('alecrim')) {
                hasRosemary = true;
                bonus += 12;
            }
            if (!hasBeeswax && name.includes('cera de abelha')) {
                hasBeeswax = true;
                bonus += 15;
            }
            if (!hasKaolin && name.includes('argila branca')) {
                hasKaolin = true;
                bonus += 6;
            }
        });

        return Math.min(bonus, 80);
    }

    private static buildIngredientMeta(recipe: Recipe, ingredients: Ingredient[]): Record<string, IngredientRowMeta> {
        const meta: Record<string, IngredientRowMeta> = {};
        const totalFats = recipe.fats.reduce((sum, item) => sum + (item.amount || 0), 0);
        const addMeta = (item: RecipeIngredient, includePercentage: boolean) => {
            const ingredient = this.findIngredient(item, ingredients);
            const sapValue = ingredient ? (recipe.alkali === 'NaOH' ? ingredient.sapNaOH : ingredient.sapKOH) : 0;
            const percentage = includePercentage && totalFats > 0
                ? ((item.amount || 0) / totalFats * 100).toFixed(1)
                : undefined;
            meta[item.id] = { sapValue, percentage, role: item.role };
        };
        (recipe.fats || []).forEach(item => addMeta(item, true));
        (recipe.liquids || []).forEach(item => addMeta(item, false));
        (recipe.functionalAdditives || []).forEach(item => addMeta(item, false));
        (recipe.lyeAdditives || []).forEach(item => addMeta(item, false));
        (recipe.traceAdditives || []).forEach(item => addMeta(item, false));
        (recipe.superfatOils || []).forEach(item => addMeta(item, false));
        (recipe.essentialOils || []).forEach(item => addMeta(item, false));
        return meta;
    }

    private static buildQualityProgress(results: CalculatorResult['results']): CalculatorResult['qualityProgress'] {
        const makeProgress = (value: number, rangeKey: keyof typeof QUALITY_RANGES) => {
            const range = QUALITY_RANGES[rangeKey];
            const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
            const denom = range.max - range.min;
            const score = denom > 0 ? clamp(((value - range.min) / denom) * 100, 0, 100) : 0;
            let tone: 'danger' | 'warning' | 'good' = 'good';
            for (const threshold of range.thresholds) {
                if (threshold.inclusive ? value <= threshold.max : value < threshold.max) {
                    tone = threshold.tone;
                    break;
                }
            }
            return { value, score, tone };
        };
        return {
            conditioning: makeProgress(results.properties.conditioning, 'conditioning'),
            cleansing: makeProgress(results.properties.cleansing, 'cleansing'),
            bubbles: makeProgress(results.properties.bubbles, 'bubbles'),
            persistence: makeProgress(results.properties.persistence, 'persistence'),
            hardness: makeProgress(results.properties.hardness, 'hardness')
        };
    }

    private static buildExports(recipe: Recipe, results: CalculatorResult['results']): CalculatorExports {
        return {
            markdown: this.buildMarkdown(recipe, results),
            json: this.buildJson(recipe, results)
        };
    }

    private static buildMarkdown(recipe: Recipe, results: CalculatorResult['results']) {
        const recipeRef = formatRecipeReference(recipe.code);
        let md = `# Receita: ${recipe.name || 'Sem Nome'} \n`;
        if (recipeRef) {
            md += `Codigo: ${recipeRef} | Data: ${recipe.date} \n\n`;
        } else {
            md += `Data: ${recipe.date} \n\n`;
        }

        md += `## Configurações\n`;
        md += `- Álcali: ${recipe.alkali} \n`;
        md += `- Superfat: ${recipe.superfat}%\n`;
        md += `- Concentração de Água: ${recipe.waterConcentration}%\n`;
        md += `- Pureza do Álcali: ${recipe.alkaliPurity ?? 100}%\n\n`;

        md += `## Composição\n`;
        md += `### Fase 1: Gorduras\n`;
        recipe.fats.forEach(f => {
            const pct = results.totalFats > 0 ? ((f.amount / results.totalFats) * 100).toFixed(1) : '0.0';
            md += `- ${f.name}: ${f.amount} g(${pct}%) \n`;
        });

        md += `\n### Fase 2: Lixívia & Aditivos\n`;
        recipe.liquids.forEach(l => md += `- ${l.name}: ${l.amount} g\n`);
        recipe.functionalAdditives.forEach(a => md += `- ${a.name}: ${a.amount} g\n`);
        md += `- ${recipe.alkali === 'NaOH' ? 'Soda Cáustica (NaOH)' : 'Potassa (KOH)'}: ${results.alkaliAmount.toFixed(2)} g\n`;
        recipe.lyeAdditives.forEach(a => md += `- ${a.name}: ${a.amount} g\n`);

        md += `\n### Fase 3: No Traço\n`;
        recipe.traceAdditives.forEach(a => md += `- ${a.name}: ${a.amount} g\n`);
        recipe.superfatOils.forEach(o => md += `- ${o.name}: ${o.amount} g\n`);
        recipe.essentialOils.forEach(o => md += `- ${o.name}: ${o.amount} g\n`);

        md += `\n## Resultados Técnicos\n`;
        md += `- Total de Gorduras: ${results.totalFats.toFixed(1)} g\n`;
        md += `- Lixívia(${recipe.alkali}): ${results.alkaliAmount.toFixed(2)} g\n`;
        md += `- Água: ${results.waterAmount.toFixed(1)} g\n`;
        md += `- Peso Total Final: ${results.totalWeight.toFixed(1)} g\n`;
        md += `- Durabilidade em boas condições: ~${results.goodConditionDays} dias (~${(results.goodConditionDays / 30).toFixed(1)} meses)\n\n`;

        md += `## Qualidade Prevista\n`;
        md += `- Condicionamento: ${results.properties.conditioning.toFixed(0)} \n`;
        md += `- Limpeza: ${results.properties.cleansing.toFixed(0)} \n`;
        md += `- Bolhas: ${results.properties.bubbles.toFixed(0)} \n`;
        md += `- Persistência: ${results.properties.persistence.toFixed(0)} \n`;
        md += `- Dureza: ${results.properties.hardness.toFixed(0)} \n\n`;

        md += `## INCI\n`;
        md += `${results.inciList.join(', ')} \n`;

        const codePrefix = formatRecipeCodeForFile(recipe.code);
        const filename = `${codePrefix}_${recipe.name.replace(/\s+/g, '_')}.md`;
        return { content: md, filename };
    }

    private static buildJson(recipe: Recipe, results: CalculatorResult['results']) {
        const payload = {
            ...recipe,
            calculations: {
                alkaliAmount: results.alkaliAmount,
                alkaliPure: results.alkaliPure,
                alkaliPurity: results.alkaliPurity,
                sapAverage: results.sapAverage,
                waterAmount: results.waterAmount,
                iodine: results.iodine,
                ins: results.ins,
                glycerin: results.glycerin,
                goodConditionDays: results.goodConditionDays
            }
        };
        const codePrefix = formatRecipeCodeForFile(recipe.code);
        const filename = `${codePrefix}_${recipe.name.replace(/\s+/g, '_')}.json`;
        return { content: JSON.stringify(payload, null, 2), filename };
    }

    private static getSuggestedAmount(ingredient: Ingredient, totalFats: number): number | null {
        const ratio = totalFats > 0 ? totalFats / INFUSION_RATIO_FATS_PER_TS : 1;
        if (ingredient.teaspoonWeight) {
            return parseFloat((ingredient.teaspoonWeight * ratio).toFixed(2));
        }
        if (ingredient.isHerb) {
            return parseFloat((DEFAULT_HERB_WEIGHT * ratio).toFixed(2));
        }
        return null;
    }

    private static resolveItemRole(item: RecipeIngredient, ingredients: Ingredient[]): RecipeIngredientRole {
        if (item.role) return item.role;
        const ingredient = this.findIngredient(item, ingredients);
        if (ingredient?.kind === 'water') return 'water';
        return 'other';
    }

    private static findIngredient(item: RecipeIngredient, ingredients: Ingredient[]): Ingredient | undefined {
        const ref = item.ingredientId || item.id;
        if (!ref) return undefined;
        return ingredients.find(i => i.id === ref);
    }

    private static generateId(): string {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        } catch (e) { }
        return Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4);
    }

    private static getDayOfYear(date: Date): number {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date.getTime() - start.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    private static getPhysicalCureDays(date: Date): number {
        const minDays = 30;
        const maxDays = 45;
        const dayOfYear = this.getDayOfYear(date);
        const radians = (2 * Math.PI * (dayOfYear - 172)) / 365;
        const seasonalFactor = (1 - Math.cos(radians)) / 2;
        return Math.round(minDays + (maxDays - minDays) * seasonalFactor);
    }
}

