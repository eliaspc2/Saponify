import type { ClientActivity } from '../../../shared/types/ClientActivity';
import type { Recipe } from '../../../shared/types/Recipe';
import { getClientConsumptionStats } from './clientConsumptionAnalytics';

export type ConsumptionAlertStatus = 'ok' | 'warning' | 'overdue' | 'insufficient_data';

export type ClientConsumptionAlertResult = {
    clientId: string;
    status: ConsumptionAlertStatus;
    totalSoaps: number;
    averageIntervalDays: number | null;
    averageDaysPerSoap: number | null;
    lastProductionDate: string | null;
    estimatedDepletionDate: string | null;
    ratioElapsed: number | null;
};

const parseDate = (value: string | null): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
};

const daysBetween = (from: Date, to: Date): number => {
    const diff = to.getTime() - from.getTime();
    return diff / (1000 * 60 * 60 * 24);
};

export const getClientConsumptionAlert = (
    clientId: string,
    activities: ClientActivity[],
    recipes: Recipe[],
    now: Date = new Date()
): ClientConsumptionAlertResult => {
    const stats = getClientConsumptionStats(clientId, activities, recipes);
    const productions = stats.productions;

    if (!productions.length || stats.averageIntervalDays === null || stats.averageDaysPerSoap === null) {
        return {
            clientId,
            status: 'insufficient_data',
            totalSoaps: stats.totalSoaps,
            averageIntervalDays: stats.averageIntervalDays,
            averageDaysPerSoap: stats.averageDaysPerSoap,
            lastProductionDate: productions.length > 0 ? productions[productions.length - 1].productionDate : null,
            estimatedDepletionDate: null,
            ratioElapsed: null
        };
    }

    const lastProduction = productions[productions.length - 1];
    const lastDate = parseDate(lastProduction.productionDate);
    if (!lastDate) {
        return {
            clientId,
            status: 'insufficient_data',
            totalSoaps: stats.totalSoaps,
            averageIntervalDays: stats.averageIntervalDays,
            averageDaysPerSoap: stats.averageDaysPerSoap,
            lastProductionDate: null,
            estimatedDepletionDate: null,
            ratioElapsed: null
        };
    }

    const expectedDays = stats.averageDaysPerSoap * lastProduction.soaps;
    if (!Number.isFinite(expectedDays) || expectedDays <= 0) {
        return {
            clientId,
            status: 'insufficient_data',
            totalSoaps: stats.totalSoaps,
            averageIntervalDays: stats.averageIntervalDays,
            averageDaysPerSoap: stats.averageDaysPerSoap,
            lastProductionDate: lastProduction.productionDate,
            estimatedDepletionDate: null,
            ratioElapsed: null
        };
    }

    const depletion = new Date(lastDate.getTime());
    depletion.setDate(depletion.getDate() + Math.round(expectedDays));
    const elapsedDays = Math.max(0, daysBetween(lastDate, now));
    const ratioElapsed = expectedDays > 0 ? elapsedDays / expectedDays : null;

    let status: ConsumptionAlertStatus = 'ok';
    if (ratioElapsed !== null) {
        if (ratioElapsed > 1.2) status = 'overdue';
        else if (ratioElapsed >= 0.8) status = 'warning';
    }

    return {
        clientId,
        status,
        totalSoaps: stats.totalSoaps,
        averageIntervalDays: stats.averageIntervalDays,
        averageDaysPerSoap: stats.averageDaysPerSoap,
        lastProductionDate: lastProduction.productionDate,
        estimatedDepletionDate: depletion.toISOString().split('T')[0],
        ratioElapsed
    };
};
