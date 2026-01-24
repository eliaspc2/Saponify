import type { ClientActivity, ProductionDetails } from '../../../shared/types/ClientActivity';
import type { Recipe } from '../../../shared/types/Recipe';

export type ProductionMonthStat = {
    month: string; // YYYY-MM
    productions: number;
    oilsWeight: number;
    soaps: number;
};

export type ProductionTrend = {
    currentMonth: string;
    previousMonth: string;
    change: number;
    direction: 'up' | 'down' | 'same';
};

export type ProductionStats = {
    months: ProductionMonthStat[];
    totalAnnualSoaps: number;
    trend: ProductionTrend;
};

const SOAP_PER_OIL_RATIO = 3 / 250;

const toMonthKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
};

const getActivityDate = (activity: ClientActivity): Date | null => {
    const dateValue = activity.details?.productionDate || activity.timestamp;
    if (!dateValue) return null;
    const parsed = new Date(dateValue);
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

const buildMonthBuckets = (now: Date, lastMonths: number): ProductionMonthStat[] => {
    const months: ProductionMonthStat[] = [];
    for (let i = lastMonths - 1; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            month: toMonthKey(d),
            productions: 0,
            oilsWeight: 0,
            soaps: 0
        });
    }
    return months;
};

export const getProductionStats = (
    activities: ClientActivity[],
    recipes: Recipe[],
    lastMonths: number,
    now: Date = new Date()
): ProductionStats => {
    const monthBuckets = buildMonthBuckets(now, Math.max(1, lastMonths));
    const bucketMap = new Map(monthBuckets.map(bucket => [bucket.month, bucket]));
    const recipeById = new Map(recipes.map(recipe => [recipe.id, recipe]));

    activities
        .filter(activity => activity.type === 'production')
        .forEach((activity) => {
            const date = getActivityDate(activity);
            if (!date) return;
            const key = toMonthKey(date);
            const bucket = bucketMap.get(key);
            if (!bucket) return;

            const recipe = activity.details?.recipeId ? recipeById.get(activity.details.recipeId) : undefined;
            const oilsWeight = computeOilsWeight(activity.details, recipe);
            const soaps = oilsWeight * SOAP_PER_OIL_RATIO;

            bucket.productions += 1;
            bucket.oilsWeight += oilsWeight;
            bucket.soaps += soaps;
        });

    const annualSlice = monthBuckets.slice(Math.max(0, monthBuckets.length - 12));
    const totalAnnualSoaps = annualSlice.reduce((sum, bucket) => sum + bucket.soaps, 0);

    const current = monthBuckets[monthBuckets.length - 1];
    const previous = monthBuckets.length > 1 ? monthBuckets[monthBuckets.length - 2] : undefined;
    const change = previous ? current.soaps - previous.soaps : current.soaps;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'same';

    return {
        months: monthBuckets,
        totalAnnualSoaps,
        trend: {
            currentMonth: current?.month || '',
            previousMonth: previous?.month || '',
            change,
            direction
        }
    };
};
