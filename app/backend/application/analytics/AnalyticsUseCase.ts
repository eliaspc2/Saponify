import { ClientActivityService } from '../../infrastructure/services/ClientActivityService';
import { RecipeService } from '../../infrastructure/services/RecipeService';
import { getProductionStats, type ProductionStats } from '../../domain/analytics/productionAnalytics';
import { getClientConsumptionStats, type ClientConsumptionStats } from '../../domain/analytics/clientConsumptionAnalytics';
import { getClientConsumptionAlert, type ClientConsumptionAlertResult } from '../../domain/analytics/clientConsumptionAlert';

export class AnalyticsUseCase {
    private static instance: AnalyticsUseCase;

    private constructor() { }

    static getInstance(): AnalyticsUseCase {
        if (!AnalyticsUseCase.instance) {
            AnalyticsUseCase.instance = new AnalyticsUseCase();
        }
        return AnalyticsUseCase.instance;
    }

    getProductionStats(lastMonths: number): ProductionStats {
        const activities = ClientActivityService.getInstance().getAllActivities();
        const recipes = RecipeService.getInstance().getAll();
        return getProductionStats(activities, recipes, lastMonths);
    }

    getClientConsumptionStats(clientId: string): ClientConsumptionStats {
        const activities = ClientActivityService.getInstance().getAllActivities();
        const recipes = RecipeService.getInstance().getAll();
        return getClientConsumptionStats(clientId, activities, recipes);
    }

    getClientConsumptionAlert(clientId: string): ClientConsumptionAlertResult {
        const activities = ClientActivityService.getInstance().getAllActivities();
        const recipes = RecipeService.getInstance().getAll();
        return getClientConsumptionAlert(clientId, activities, recipes);
    }
}
