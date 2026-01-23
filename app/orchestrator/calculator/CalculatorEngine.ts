import { CalculatorService } from '../services/CalculatorService';
import { Ingredient } from '../../shared/types/Ingredient';
import { Recipe, RecipeIngredient } from '../../shared/types/Recipe';
import { TEASPOON_WEIGHTS, DEFAULT_HERB_WEIGHT, INFUSION_RATIO_FATS_PER_TS } from '../../shared/constants/RecipeConstants';
import { formatRecipeCodeForFile, formatRecipeReference } from '../../shared/utils/recipeFormat';
import { FATTY_ACID_LABELS, QUALITY_RANGES, QualityRange } from './CalculatorRules';
import type { CalculatorInput, CalculatorResult, IngredientRowMeta, JsonExport, MarkdownExport, QualityProgress } from './CalculatorModels';

export class CalculatorEngine {
    static calculate(input: CalculatorInput): CalculatorResult {
        const { recipe, ingredients } = input;
        const results = CalculatorService.calculate(recipe, ingredients);
        const today = input.now ? new Date(input.now) : new Date();
        const physicalDays = this.getPhysicalCureDays(today);
        const sumAmounts = (items?: RecipeIngredient[]) => (items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
        const nonWaterLiquids = (recipe.liquids || []).filter(item => !this.isWaterItem(item));
        const phase1Total = sumAmounts(recipe.fats);
        const phase2Total = sumAmounts(nonWaterLiquids)
            + results.waterAmount
            + sumAmounts(recipe.functionalAdditives)
            + sumAmounts(recipe.lyeAdditives)
            + results.alkaliAmount;
        const phase3Total = sumAmounts(recipe.traceAdditives) + sumAmounts(recipe.superfatOils) + sumAmounts(recipe.essentialOils);
        const physicalReadyDate = new Date(today.getTime());
        physicalReadyDate.setDate(physicalReadyDate.getDate() + physicalDays);
        const batchWeightWithLye = phase1Total + phase2Total + phase3Total;
        const estimatedDryWeight = Math.max(0, batchWeightWithLye - (results.waterAmount * 0.85));

        return {
            results,
            phaseTotals: {
                phase1Total,
                phase2Total,
                phase3Total,
                batchWeightWithLye,
                estimatedDryWeight,
                physicalDays,
                physicalReadyDate,
                nonWaterLiquids
            },
            fattyAcidLabels: FATTY_ACID_LABELS,
            qualityRanges: QUALITY_RANGES
        };
    }

    static applyRecipeChange(recipe: Recipe, field: keyof Recipe, value: any, ingredients: Ingredient[]): Recipe {
        let updatedRecipe = { ...recipe, [field]: value };
        if (field === 'waterConcentration' || field === 'superfat' || field === 'alkali' || field === 'alkaliPurity') {
            updatedRecipe = this.recalculateWater(updatedRecipe, ingredients);
        }
        return updatedRecipe;
    }

    static recalculateWater(recipe: Recipe, ingredients: Ingredient[]): Recipe {
        const fats = recipe.fats || [];
        const totalFats = fats.reduce((acc, f) => acc + (f.amount || 0), 0);
        const normalizeCategory = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const isBaseOil = (ing?: Ingredient) => {
            if (!ing) return false;
            if (ing.menuKey && ing.menuKey.toLowerCase() === 'baseoils') return true;
            if (!ing.category) return false;
            const category = normalizeCategory(ing.category);
            return category.includes('oleos base') || category.includes('oleo base') || category.includes('leos base');
        };
        const isCitricAcid = (ing?: Ingredient) => {
            if (!ing) return false;
            if (ing.flags?.citricAcid) return true;
            const text = `${ing.name} ${ing.inci}`.toLowerCase();
            return text.includes('citric acid') || text.includes('acido citrico') || text.includes('ácido citrico');
        };
        const getSapKOH = (ing?: Ingredient) => {
            if (!ing) return 0;
            if (ing.sapKOH) return ing.sapKOH;
            return ing.sapNaOH ? ing.sapNaOH * 1.403 : 0;
        };
        const naohConversion = 0.713;
        let totalSapKOH = 0;

        const normalizeLabel = (value?: string) =>
            (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        fats.forEach((fat) => {
            if ((fat.amount || 0) <= 0) return;
            const ing = ingredients.find(i => i.id === fat.ingredientId)
                || ingredients.find(i => normalizeLabel(i.name) === normalizeLabel(fat.name));
            if (!ing || !isBaseOil(ing)) return;
            totalSapKOH += (fat.amount || 0) * getSapKOH(ing);
        });

        const superfatRatio = 1 - (recipe.superfat / 100);
        const lyeBase = totalSapKOH * (recipe.alkali === 'NaOH' ? naohConversion : 1);
        const citricAcidAmount = (recipe.lyeAdditives || []).reduce((sum, item) => {
            const ing = ingredients.find(i => i.id === item.id || i.id === item.ingredientId);
            return isCitricAcid(ing) ? sum + (item.amount || 0) : sum;
        }, 0);
        const citricLyeFactor = recipe.alkali === 'NaOH' ? 0.624 : 0.876;
        const citricLye = citricAcidAmount * citricLyeFactor;
        const alkaliPurity = recipe.alkaliPurity ?? 100;
        const purityRatio = alkaliPurity > 0 ? (alkaliPurity / 100) : 1;
        const lyeAmount = purityRatio > 0
            ? ((lyeBase * superfatRatio) + citricLye) / purityRatio
            : (lyeBase * superfatRatio) + citricLye;
        const lyeRatio = recipe.waterConcentration / 100;
        const fallbackWaterAmount = parseFloat((totalFats * (recipe.waterConcentration / 100)).toFixed(1));
        const newWaterAmount = lyeAmount > 0 && lyeRatio > 0
            ? parseFloat((lyeAmount * (1 / lyeRatio - 1)).toFixed(1))
            : fallbackWaterAmount;

        const liquids = recipe.liquids || [];
        const updatedLiquids = liquids.length > 0
            ? liquids.map(l => l.name.toLowerCase().includes('água') ? { ...l, amount: newWaterAmount } : l)
            : [{ id: this.generateId(), ingredientId: '12', name: 'Água', amount: newWaterAmount, percentage: 0 }];

        return { ...recipe, fats, liquids: updatedLiquids };
    }

    static getSuggestedAmount(ingredientName: string, totalFats: number): number | null {
        const name = ingredientName.toLowerCase();
        for (const key in TEASPOON_WEIGHTS) {
            if (name.includes(key)) {
                const tsWeight = TEASPOON_WEIGHTS[key];
                const ratio = totalFats > 0 ? totalFats / INFUSION_RATIO_FATS_PER_TS : 1;
                return parseFloat((tsWeight * ratio).toFixed(2));
            }
        }
        if (name.includes('infusão') || name.includes('infusao') || name.includes('seco') || name.includes('seca')) {
            const ratio = totalFats > 0 ? totalFats / INFUSION_RATIO_FATS_PER_TS : 1;
            return parseFloat((DEFAULT_HERB_WEIGHT * ratio).toFixed(2));
        }
        return null;
    }

    static getIngredientRowMeta(item: RecipeIngredient, recipe: Recipe, ingredients: Ingredient[], totalFats?: number): IngredientRowMeta {
        const selectedIng = ingredients.find(i => i.id === item.ingredientId);
        const sapValue = selectedIng ? (recipe.alkali === 'NaOH' ? selectedIng.sapNaOH : selectedIng.sapKOH) : 0;
        const percentage = totalFats && totalFats > 0 ? ((item.amount || 0) / totalFats * 100).toFixed(1) : '0.0';
        return { sapValue, percentage };
    }

    static isWaterItem(item: RecipeIngredient): boolean {
        const label = (item.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        return label.includes('agua') || label.includes('water');
    }

    static getQualityProgress(value: number, range: QualityRange): QualityProgress {
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

        return { score, tone };
    }

    static buildMarkdown(recipe: Recipe, ingredients: Ingredient[]): MarkdownExport {
        const calc = this.calculate({ recipe, ingredients });
        const results = calc.results;
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
        md += `- Peso Total Final: ${results.totalWeight.toFixed(1)} g\n\n`;

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

    static buildJson(recipe: Recipe, ingredients: Ingredient[]): JsonExport {
        const results = CalculatorService.calculate(recipe, ingredients);
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
                glycerin: results.glycerin
            }
        };
        const codePrefix = formatRecipeCodeForFile(recipe.code);
        const filename = `${codePrefix}_${recipe.name.replace(/\s+/g, '_')}.json`;
        return { content: JSON.stringify(payload, null, 2), filename };
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
