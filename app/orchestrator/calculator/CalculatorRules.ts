export type QualityRange = {
    min: number;
    max: number;
    thresholds: ReadonlyArray<{ max: number; tone: 'danger' | 'warning' | 'good'; inclusive: boolean }>;
};

export type QualityRanges = {
    cleansing: QualityRange;
    bubbles: QualityRange;
    hardness: QualityRange;
    persistence: QualityRange;
    conditioning: QualityRange;
};

export const QUALITY_RANGES: QualityRanges = {
    cleansing: {
        min: 0,
        max: 26,
        thresholds: [
            { max: 12, tone: 'danger', inclusive: false },
            { max: 16, tone: 'warning', inclusive: false },
            { max: 22, tone: 'good', inclusive: false },
            { max: 26, tone: 'warning', inclusive: true },
            { max: Number.POSITIVE_INFINITY, tone: 'danger', inclusive: true }
        ]
    },
    bubbles: {
        min: 0,
        max: 55,
        thresholds: [
            { max: 14, tone: 'danger', inclusive: false },
            { max: 20, tone: 'warning', inclusive: false },
            { max: 46, tone: 'good', inclusive: false },
            { max: 55, tone: 'warning', inclusive: true },
            { max: Number.POSITIVE_INFINITY, tone: 'danger', inclusive: true }
        ]
    },
    hardness: {
        min: 0,
        max: 60,
        thresholds: [
            { max: 29, tone: 'danger', inclusive: false },
            { max: 35, tone: 'warning', inclusive: false },
            { max: 54, tone: 'good', inclusive: false },
            { max: 60, tone: 'warning', inclusive: true },
            { max: Number.POSITIVE_INFINITY, tone: 'danger', inclusive: true }
        ]
    },
    persistence: {
        min: 0,
        max: 55,
        thresholds: [
            { max: 25, tone: 'danger', inclusive: false },
            { max: 30, tone: 'warning', inclusive: false },
            { max: 50, tone: 'good', inclusive: false },
            { max: 55, tone: 'warning', inclusive: true },
            { max: Number.POSITIVE_INFINITY, tone: 'danger', inclusive: true }
        ]
    },
    conditioning: {
        min: 0,
        max: 75,
        thresholds: [
            { max: 44, tone: 'danger', inclusive: false },
            { max: 50, tone: 'warning', inclusive: false },
            { max: 69, tone: 'good', inclusive: false },
            { max: 75, tone: 'warning', inclusive: true },
            { max: Number.POSITIVE_INFINITY, tone: 'danger', inclusive: true }
        ]
    }
};

export type FattyAcidLabel = { key: string; label: string };

export const FATTY_ACID_LABELS: FattyAcidLabel[] = [
    { key: 'lauric', label: 'Láurico' },
    { key: 'myristic', label: 'Mirístico' },
    { key: 'palmitic', label: 'Palmítico' },
    { key: 'stearic', label: 'Esteárico' },
    { key: 'oleic', label: 'Oleico' },
    { key: 'linoleic', label: 'Linoleico' },
    { key: 'linolenic', label: 'Linolênico' },
    { key: 'ricinoleic', label: 'Ricinoleico' },
    { key: 'gadoleic', label: 'Gadoleico' },
    { key: 'other', label: 'Outros' }
];
