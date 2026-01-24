import type { Ingredient } from '../../../shared/types/Ingredient';
import type { CalculationResults } from './CalculatorModels';

export type OilPortion = { ingredient: Ingredient; amount: number };
export type FattyAcidProfile = CalculationResults['fattyAcids'];
export type WarnFn = (message: string) => void;

export const normalizeFattyAcids = (
    fatty?: Ingredient['fattyAcids'],
    name?: string,
    warn?: WarnFn
) => {
    const values: FattyAcidProfile = {
        lauric: fatty?.lauric || 0,
        myristic: fatty?.myristic || 0,
        palmitic: fatty?.palmitic || 0,
        stearic: fatty?.stearic || 0,
        ricinoleic: fatty?.ricinoleic || 0,
        oleic: fatty?.oleic || 0,
        linoleic: fatty?.linoleic || 0,
        linolenic: fatty?.linolenic || 0,
        gadoleic: fatty?.gadoleic || 0,
        other: fatty?.other || 0
    };

    const entries = Object.entries(values);
    for (const [key, value] of entries) {
        if (value < 0 || value > 100) {
            warn?.(`Valor de ácido graxo fora do intervalo (${key}=${value}) em ${name || 'ingrediente'}.`);
        }
    }

    const total = values.lauric + values.myristic + values.palmitic + values.stearic
        + values.ricinoleic + values.oleic + values.linoleic + values.linolenic
        + values.gadoleic + values.other;

    return { values, total };
};

export const computeFattyAcidProfile = (oils: OilPortion[], warn?: WarnFn) => {
    const diagnostics: string[] = [];
    const profile: FattyAcidProfile = {
        lauric: 0,
        myristic: 0,
        palmitic: 0,
        stearic: 0,
        ricinoleic: 0,
        oleic: 0,
        linoleic: 0,
        linolenic: 0,
        gadoleic: 0,
        other: 0
    };

    const weightTotal = oils.reduce((sum, oil) => sum + oil.amount, 0);
    if (weightTotal <= 0) {
        diagnostics.push('Sem óleos base para calcular o perfil.');
        return { profile, sum: 0, isValid: false, diagnostics };
    }

    oils.forEach(({ ingredient, amount }) => {
        const { values, total } = normalizeFattyAcids(ingredient.fattyAcids, ingredient.name, warn);
        if (total <= 0) {
            diagnostics.push(`Sem perfil de ácidos graxos para "${ingredient.name}".`);
            return;
        }
        if (total < 98 || total > 102) {
            diagnostics.push(`Perfil inválido para "${ingredient.name}": soma ${total.toFixed(1)}%.`);
        }
        const weightRatio = amount / weightTotal;
        profile.lauric += values.lauric * weightRatio;
        profile.myristic += values.myristic * weightRatio;
        profile.palmitic += values.palmitic * weightRatio;
        profile.stearic += values.stearic * weightRatio;
        profile.ricinoleic += values.ricinoleic * weightRatio;
        profile.oleic += values.oleic * weightRatio;
        profile.linoleic += values.linoleic * weightRatio;
        profile.linolenic += values.linolenic * weightRatio;
        profile.gadoleic += values.gadoleic * weightRatio;
        profile.other += values.other * weightRatio;
    });

    const sum = profile.lauric + profile.myristic + profile.palmitic + profile.stearic
        + profile.ricinoleic + profile.oleic + profile.linoleic + profile.linolenic
        + profile.gadoleic + profile.other;

    if (sum < 98 || sum > 102) {
        diagnostics.push(`Soma do perfil da mistura ${sum.toFixed(1)}% (esperado ~100%).`);
    }
    Object.entries(profile).forEach(([key, value]) => {
        if (value < 0 || value > 100) {
            diagnostics.push(`Valor de ácido graxo fora do intervalo (${key}=${value.toFixed(1)}%).`);
        }
    });

    const oliveWeight = oils.filter(o => o.ingredient.tags?.includes('olive')).reduce((sum, o) => sum + o.amount, 0);
    if (oliveWeight / weightTotal >= 0.2 && profile.oleic < 10) {
        diagnostics.push('Oleico demasiado baixo para uma mistura com muito azeite.');
    }
    const castorWeight = oils.filter(o => o.ingredient.tags?.includes('castor')).reduce((sum, o) => sum + o.amount, 0);
    if (castorWeight / weightTotal < 0.05 && profile.ricinoleic > 10) {
        diagnostics.push('Ricinoleico alto sem presença relevante de rícino.');
    }

    const isValid = diagnostics.length === 0;
    return { profile, sum, isValid, diagnostics };
};

