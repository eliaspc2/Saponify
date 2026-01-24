import type { ClientActivity, ProductionDetails } from '../../../shared/types/ClientActivity';
import type { Recipe } from '../../../shared/types/Recipe';

export type ClientProductionEntry = {
    activityId: string;
    recipeId: string;
    recipeName: string;
    productionDate: string;
    oilsWeight: number;
    soaps: number;
};

export type ClientConsumptionStats = {
    clientId: string;
    productions: ClientProductionEntry[];
    totalSoaps: number;
    averageIntervalDays: number | null;
    averageSoapsPerProduction: number | null;
    averageDaysPerSoap: number | null;
    nextExpectedProductionDate: string | null;
};

const SOAP_PER_OIL_RATIO = 3 / 250;

const parseDate = (value: string | undefined): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
};

const computeOilsWeight = (details: ProductionDetails | undefined, recipe: Recipe | undefined): number => {
    if (!details || !recipe) return 0;
    const totalFats = recipe.fats.reduce((sum, item) => sum + (item.amount || 0), 0);
    if (totalFats <= 0) return 0;
    const plannedWeight = details.plannedWeight || details.originalWeight || 0;
    const originalWeight = details.originalWeight || 0;
    const scaleFactor = plannedWeight > 0 && originalWeight > 0 ? plannedWeight / originalWeight : 1;
    return totalFats * scaleFactor;
};

export const getClientConsumptionStats = (
    clientId: string,
    activities: ClientActivity[],
    recipes: Recipe[]
): ClientConsumptionStats => {
    const recipeById = new Map(recipes.map(recipe => [recipe.id, recipe]));

    const productions = activities
        .filter(activity => activity.type === 'production' && activity.clientId === clientId)
        .map((activity) => {
            const details = activity.details;
            const recipe = details?.recipeId ? recipeById.get(details.recipeId) : undefined;
            const oilsWeight = computeOilsWeight(details, recipe);
            const soaps = oilsWeight * SOAP_PER_OIL_RATIO;
            const productionDate = details?.productionDate || activity.timestamp;
            return {
                activityId: activity.id,
                recipeId: details?.recipeId || '',
                recipeName: details?.recipeName || recipe?.name || '',
                productionDate,
                oilsWeight,
                soaps
            };
        })
        .filter(entry => !!entry.productionDate)
        .sort((a, b) => {
            const aTime = parseDate(a.productionDate)?.getTime() || 0;
            const bTime = parseDate(b.productionDate)?.getTime() || 0;
            return aTime - bTime;
        });

    const totalSoaps = productions.reduce((sum, entry) => sum + entry.soaps, 0);
    const averageSoapsPerProduction = productions.length > 0 ? totalSoaps / productions.length : null;

    let averageIntervalDays: number | null = null;
    if (productions.length > 1) {
        let totalInterval = 0;
        for (let i = 1; i < productions.length; i += 1) {
            const prevDate = parseDate(productions[i - 1].productionDate);
            const nextDate = parseDate(productions[i].productionDate);
            if (prevDate && nextDate) {
                const diff = nextDate.getTime() - prevDate.getTime();
                totalInterval += diff / (1000 * 60 * 60 * 24);
            }
        }
        averageIntervalDays = totalInterval / (productions.length - 1);
    }

    const averageDaysPerSoap = averageIntervalDays && averageSoapsPerProduction && averageSoapsPerProduction > 0
        ? averageIntervalDays / averageSoapsPerProduction
        : null;

    let nextExpectedProductionDate: string | null = null;
    if (averageIntervalDays && productions.length > 0) {
        const lastDate = parseDate(productions[productions.length - 1].productionDate);
        if (lastDate) {
            const next = new Date(lastDate.getTime());
            next.setDate(next.getDate() + Math.round(averageIntervalDays));
            nextExpectedProductionDate = next.toISOString().split('T')[0];
        }
    }

    return {
        clientId,
        productions,
        totalSoaps,
        averageIntervalDays,
        averageSoapsPerProduction,
        averageDaysPerSoap,
        nextExpectedProductionDate
    };
};
