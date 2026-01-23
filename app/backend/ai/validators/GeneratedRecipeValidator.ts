import {
    GeneratedRecipeSchema,
    type GeneratedRecipe,
    type GeneratedRecipeIngredient,
    type ValidatedRecipe
} from '../schemas/GeneratedRecipeSchema';

type ValidationContext = {
    availableIngredients: object[];
    rules?: {
        core?: any;
        extended?: any;
    };
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const assertExactKeys = (obj: Record<string, any>, allowed: readonly string[], path: string, errors: string[]) => {
    const keys = Object.keys(obj);
    for (const key of allowed) {
        if (!(key in obj)) {
            errors.push(`${path}: campo obrigatório em falta (${key}).`);
        }
    }
    for (const key of keys) {
        if (!allowed.includes(key)) {
            errors.push(`${path}: campo extra não permitido (${key}).`);
        }
    }
};

const assertNumber = (value: unknown, path: string, errors: string[]) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(`${path}: deve ser número.`);
    }
};

const assertString = (value: unknown, path: string, errors: string[]) => {
    if (typeof value !== 'string' || !value.trim()) {
        errors.push(`${path}: deve ser string não vazia.`);
    }
};

const extractIngredientIds = (availableIngredients: object[]): Set<string> => {
    const ids = new Set<string>();
    for (const item of availableIngredients) {
        if (!isPlainObject(item)) continue;
        const id = (item as any).id || (item as any).ingredientId || (item as any).ref;
        if (typeof id === 'string' && id.trim()) {
            ids.add(id);
        }
    }
    return ids;
};

const extractCitricFactor = (rules?: any): number => {
    const formula = rules?.citric_acid_rules?.naoh_adjustment?.formula;
    if (typeof formula === 'string') {
        const match = formula.match(/\*\s*([0-9.]+)/);
        if (match && match[1]) {
            const value = parseFloat(match[1]);
            if (!Number.isNaN(value)) return value;
        }
    }
    return 0.625;
};

export class GeneratedRecipeValidator {
    static validate(payload: object, context: ValidationContext): ValidatedRecipe {
        const errors: string[] = [];

        if (!isPlainObject(payload)) {
            throw new Error('Resposta inválida: esperado object.');
        }

        assertExactKeys(payload, GeneratedRecipeSchema.topLevel, 'root', errors);

        const metadata = (payload as any).metadata;
        if (!isPlainObject(metadata)) {
            errors.push('metadata: deve ser object.');
        } else {
            assertExactKeys(metadata, GeneratedRecipeSchema.metadata, 'metadata', errors);
            assertString(metadata.recipeName, 'metadata.recipeName', errors);
            assertString(metadata.clientId, 'metadata.clientId', errors);
            assertString(metadata.createdAt, 'metadata.createdAt', errors);
            if (metadata.source !== 'ai') {
                errors.push('metadata.source: deve ser "ai".');
            }
        }

        const phases = (payload as any).phases;
        if (!isPlainObject(phases)) {
            errors.push('phases: deve ser object.');
        } else {
            assertExactKeys(phases, GeneratedRecipeSchema.phases, 'phases', errors);
        }

        const phase1 = phases?.phase1_base_fatty;
        if (!Array.isArray(phase1)) {
            errors.push('phases.phase1_base_fatty: deve ser array.');
        }
        const phase3 = phases?.phase3_trace;
        if (!Array.isArray(phase3)) {
            errors.push('phases.phase3_trace: deve ser array.');
        }

        const phase2 = phases?.phase2_lye;
        if (!isPlainObject(phase2)) {
            errors.push('phases.phase2_lye: deve ser object.');
        } else {
            assertExactKeys(phase2, GeneratedRecipeSchema.lyePhase, 'phases.phase2_lye', errors);
        }

        const validateIngredient = (item: any, path: string) => {
            if (!isPlainObject(item)) {
                errors.push(`${path}: deve ser object.`);
                return;
            }
            assertExactKeys(item, GeneratedRecipeSchema.ingredient, path, errors);
            assertString(item.ingredientId, `${path}.ingredientId`, errors);
            assertString(item.name, `${path}.name`, errors);
            assertNumber(item.percentage, `${path}.percentage`, errors);
            assertNumber(item.weight, `${path}.weight`, errors);
            assertString(item.function, `${path}.function`, errors);
        };

        if (Array.isArray(phase1)) {
            phase1.forEach((item, idx) => validateIngredient(item, `phases.phase1_base_fatty[${idx}]`));
        }
        if (Array.isArray(phase3)) {
            phase3.forEach((item, idx) => validateIngredient(item, `phases.phase3_trace[${idx}]`));
        }

        if (isPlainObject(phase2)) {
            validateIngredient(phase2.liquid, 'phases.phase2_lye.liquid');
            assertString(phase2.lye_type, 'phases.phase2_lye.lye_type', errors);
            assertNumber(phase2.naoh_calculated, 'phases.phase2_lye.naoh_calculated', errors);
            if (!Array.isArray(phase2.compensations_applied) || phase2.compensations_applied.some((v: any) => typeof v !== 'string')) {
                errors.push('phases.phase2_lye.compensations_applied: deve ser array de strings.');
            }
        }

        const technical = (payload as any).technical;
        if (!isPlainObject(technical)) {
            errors.push('technical: deve ser object.');
        } else {
            assertExactKeys(technical, GeneratedRecipeSchema.technical, 'technical', errors);
            assertNumber(technical.superfat_initial, 'technical.superfat_initial', errors);
            assertNumber(technical.superfat_final, 'technical.superfat_final', errors);
            assertNumber(technical.lye_concentration, 'technical.lye_concentration', errors);
            assertNumber(technical.essential_oils_total_percentage, 'technical.essential_oils_total_percentage', errors);

            const citric = technical.citric_acid;
            if (!isPlainObject(citric)) {
                errors.push('technical.citric_acid: deve ser object.');
            } else {
                assertExactKeys(citric, GeneratedRecipeSchema.citricAcid, 'technical.citric_acid', errors);
                if (typeof citric.used !== 'boolean') {
                    errors.push('technical.citric_acid.used: deve ser boolean.');
                }
                assertNumber(citric.weight, 'technical.citric_acid.weight', errors);
                assertNumber(citric.naoh_adjustment, 'technical.citric_acid.naoh_adjustment', errors);
            }
        }

        const curing = (payload as any).curing;
        if (!isPlainObject(curing)) {
            errors.push('curing: deve ser object.');
        } else {
            assertExactKeys(curing, GeneratedRecipeSchema.curing, 'curing', errors);
            assertNumber(curing.days, 'curing.days', errors);
            assertString(curing.calculation_basis, 'curing.calculation_basis', errors);
            assertString(curing.estimated_ready_date, 'curing.estimated_ready_date', errors);
        }

        const notes = (payload as any).technical_notes;
        if (!Array.isArray(notes) || notes.some((n: any) => typeof n !== 'string')) {
            errors.push('technical_notes: deve ser array de strings.');
        }

        const ingredientIds = extractIngredientIds(context.availableIngredients || []);
        if (ingredientIds.size === 0) {
            errors.push('availableIngredients: lista inválida ou vazia.');
        }

        const allIngredients: GeneratedRecipeIngredient[] = [];
        if (Array.isArray(phase1)) allIngredients.push(...phase1);
        if (Array.isArray(phase3)) allIngredients.push(...phase3);
        if (isPlainObject(phase2) && isPlainObject(phase2.liquid)) allIngredients.push(phase2.liquid as GeneratedRecipeIngredient);

        for (const item of allIngredients) {
            if (item && typeof item.ingredientId === 'string' && !ingredientIds.has(item.ingredientId)) {
                errors.push(`Ingrediente não permitido: ${item.ingredientId}.`);
            }
        }

        if (Array.isArray(phase1)) {
            const sum = phase1.reduce((acc, item) => acc + (typeof item.percentage === 'number' ? item.percentage : 0), 0);
            if (Math.abs(sum - 100) > 0.01) {
                errors.push(`phase1_base_fatty: percentagens devem totalizar 100 (atual ${sum.toFixed(2)}).`);
            }
        }

        const rules = context.rules || {};
        const core = rules.core;
        const extended = rules.extended;

        const minOils = extended?.formulation_norms?.base_oils_guidelines?.minimum_oils;
        const maxOils = extended?.formulation_norms?.base_oils_guidelines?.maximum_oils;
        if (Array.isArray(phase1)) {
            if (typeof minOils === 'number' && phase1.length < minOils) {
                errors.push('phase1_base_fatty: número de óleos abaixo do mínimo permitido.');
            }
            if (typeof maxOils === 'number' && phase1.length > maxOils) {
                errors.push('phase1_base_fatty: número de óleos acima do máximo permitido.');
            }
        }

        const allowedCore = core?.general_formulation_principles?.alkali?.allowed_types;
        const allowedExtended = extended?.formulation_norms?.general_constraints?.lye_type_allowed;
        if (isPlainObject(phase2) && typeof phase2.lye_type === 'string') {
            if (Array.isArray(allowedCore) && !allowedCore.includes(phase2.lye_type)) {
                errors.push('phase2_lye.lye_type: não permitido pelas normas core.');
            }
            if (Array.isArray(allowedExtended) && !allowedExtended.includes(phase2.lye_type)) {
                errors.push('phase2_lye.lye_type: não permitido pelas normas extended.');
            }
        }

        const essentialMax = extended?.formulation_norms?.essential_oils?.general_rules?.max_total_percentage;
        if (technical && typeof essentialMax === 'number' && typeof technical.essential_oils_total_percentage === 'number') {
            if (technical.essential_oils_total_percentage > essentialMax) {
                errors.push('technical.essential_oils_total_percentage: excede o máximo permitido.');
            }
        }

        const superfatRules = extended?.formulation_norms?.superfat_rules?.ranges;
        if (technical && superfatRules && typeof technical.superfat_initial === 'number') {
            const mins = Object.values(superfatRules).map((range: any) => range?.min).filter((v) => typeof v === 'number') as number[];
            const maxs = Object.values(superfatRules).map((range: any) => range?.max).filter((v) => typeof v === 'number') as number[];
            if (mins.length && maxs.length) {
                const min = Math.min(...mins);
                const max = Math.max(...maxs);
                if (technical.superfat_initial < min || technical.superfat_initial > max) {
                    errors.push('technical.superfat_initial: fora dos limites globais permitidos.');
                }
            }
        }

        if (technical?.citric_acid && typeof technical.citric_acid.used === 'boolean') {
            const factor = extractCitricFactor(core);
            const weight = technical.citric_acid.weight;
            const adjustment = technical.citric_acid.naoh_adjustment;
            if (technical.citric_acid.used) {
                const expected = weight * factor;
                if (Math.abs(adjustment - expected) > 0.1) {
                    errors.push('technical.citric_acid.naoh_adjustment: cálculo inválido.');
                }
            } else if (weight > 0 || adjustment > 0) {
                errors.push('technical.citric_acid: usado=false mas contém valores.');
            }
        }

        if (errors.length) {
            throw new Error(`Resposta inválida: ${errors.join(' | ')}`);
        }

        return payload as GeneratedRecipe;
    }
}
