export interface Ingredient {
    id: string;
    name: string;
    inci: string;
    category: string;
    sapNaOH: number; // SAP Value for NaOH
    sapKOH: number;  // SAP Value for KOH
    descriptionFragment?: string;
    notes?: string;
    origin?: string;
    iodine?: number;
    ins?: number;
    waterPercent?: number;
    properties: {
        hardness: number;
        cleansing: number;
        bubbly: number;
        stable: number;
        conditioning: number;
        solubility?: number;
        drying?: number;
    };
    fattyAcids: {
        lauric: number;
        myristic: number;
        palmitic: number;
        stearic: number;
        ricinoleic: number;
        oleic: number;
        linoleic: number;
        linolenic: number;
    };
}
