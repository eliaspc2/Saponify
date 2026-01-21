export const normalizeRecipeCode = (code?: string): string => (code || '').trim();

export const formatRecipeReference = (code?: string): string => {
    const trimmed = normalizeRecipeCode(code);
    if (!trimmed) return '';
    const padded = /^\d+$/.test(trimmed) ? trimmed.padStart(4, '0') : trimmed;
    return `RE${padded}`;
};

export const formatRecipeReferenceOrFallback = (code?: string, fallback = 'Sem referencia'): string => {
    const reference = formatRecipeReference(code);
    return reference || fallback;
};

export const formatRecipeCodeForFile = (code?: string): string => {
    const trimmed = normalizeRecipeCode(code);
    return trimmed || 'sem_referencia';
};
