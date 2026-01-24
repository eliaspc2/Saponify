import { Ingredient } from '../../../shared/types/Ingredient';
import { TEASPOON_WEIGHTS } from '../../../shared/constants/RecipeConstants';

const defaultProperties = {
    hardness: 0,
    cleansing: 0,
    bubbly: 0,
    stable: 0,
    conditioning: 0,
    solubility: 0,
    drying: 0
};

const defaultFattyAcids = {
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

const normalizeText = (value?: string) =>
    (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const inferKind = (ingredient: Ingredient): Ingredient['kind'] => {
    const name = normalizeText(ingredient.name);
    const inci = normalizeText(ingredient.inci);
    const category = normalizeText(ingredient.category);
    const menuKey = normalizeText(ingredient.menuKey);

    if (name.includes('agua') || inci === 'aqua') return 'water';
    if (menuKey.includes('baseoils') || menuKey.includes('superfatoils')) return 'oil';
    if (category.includes('oleos base') || category.includes('oleo base') || category.includes('leos base')) return 'oil';
    if (category.includes('superfat')) return 'oil';
    if (category.includes('aditivos') || category.includes('botanicos') || category.includes('aromas') || category.includes('essenciais')) return 'additive';
    if (category.includes('lixivia') || category.includes('lye')) return 'additive';

    return 'other';
};

const inferTags = (ingredient: Ingredient): string[] => {
    const name = normalizeText(ingredient.name);
    const tags: string[] = [];
    if (name.includes('azeite') || name.includes('oliva')) tags.push('olive');
    if (name.includes('ricino') || name.includes('castor')) tags.push('castor');
    return tags;
};

const inferMeasurement = (ingredient: Ingredient): { teaspoonWeight?: number; isHerb?: boolean } => {
    const name = normalizeText(ingredient.name);
    let teaspoonWeight: number | undefined;
    for (const key in TEASPOON_WEIGHTS) {
        if (name.includes(key)) {
            teaspoonWeight = TEASPOON_WEIGHTS[key];
            break;
        }
    }
    const isHerb = name.includes('infusao') || name.includes('infusão') || name.includes('seco') || name.includes('seca');
    return { teaspoonWeight, isHerb };
};

export const normalizeIngredient = (ingredient: Ingredient): Ingredient => {
    const kind = ingredient.kind ?? inferKind(ingredient);
    const tags = ingredient.tags ?? inferTags(ingredient);
    const measurement = inferMeasurement(ingredient);
    return {
        ...ingredient,
        kind,
        tags: tags.length > 0 ? tags : ingredient.tags,
        teaspoonWeight: ingredient.teaspoonWeight ?? measurement.teaspoonWeight,
        isHerb: ingredient.isHerb ?? measurement.isHerb,
        properties: { ...defaultProperties, ...ingredient.properties },
        fattyAcids: { ...defaultFattyAcids, ...ingredient.fattyAcids }
    };
};

