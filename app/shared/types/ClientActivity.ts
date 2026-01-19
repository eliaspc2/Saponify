export type ActivityType = 'note' | 'production' | 'questionnaire' | 'system';

export interface ProductionDetails {
    recipeId: string;
    recipeName: string;
    recipeCode: string;
    originalWeight: number;
    plannedWeight: number;
    stableWeight: number;
    productionDate: string;
    chemicalReadyDate: string; // Chemical stabilization
    physicalReadyDate: string;  // Physical drying
}

export interface ClientActivity {
    id: string;
    clientId: string;
    timestamp: string;
    type: ActivityType;
    title: string;
    content: string;
    details?: ProductionDetails;
}
