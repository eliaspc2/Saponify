import { BaseService } from '../core/BaseService';
import { Ingredient } from '../../shared/types/Ingredient';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import { IdService } from './IdService';
import { TEASPOON_WEIGHTS } from '../../shared/constants/RecipeConstants';

export class IngredientService extends BaseService {
    private static instance: IngredientService;
    private static readonly STORAGE_KEY = 'saponify_ingredients';
    private static readonly STORAGE_VERSION = 2;
    private initialized = false;
    private repository: LocalStorageRepository<Ingredient>;

    private constructor() {
        super('IngredientService');
        this.repository = new LocalStorageRepository<Ingredient>(IngredientService.STORAGE_KEY, {
            deserialize: (raw) => {
                const items = Array.isArray(raw)
                    ? raw
                    : (raw && Array.isArray(raw.items) ? raw.items : []);
                return items.map((ingredient: Ingredient) => this.normalizeIngredient(ingredient));
            },
            serialize: (items) => ({
                version: IngredientService.STORAGE_VERSION,
                items
            })
        });
    }

    static getInstance(): IngredientService {
        if (!IngredientService.instance) {
            IngredientService.instance = new IngredientService();
        }
        return IngredientService.instance;
    }

    async loadInitialData(): Promise<void> {
        try {
            if (this.initialized) {
                return;
            }
            this.initialized = true;
            const storedIngredients = [...this.repository.getAll()];
            this.log('Fetching ingredients csv...');
            const response = await fetch(`${import.meta.env.BASE_URL}data/ingredients.csv`);
            const csvText = await response.text();
            const csvIngredients = this.parseCSV(csvText).map(ingredient => this.normalizeIngredient(ingredient));
            if (storedIngredients.length > 0) {
                const csvIds = new Set(csvIngredients.map(ingredient => ingredient.id));
                const customIngredients = storedIngredients
                    .filter(ingredient => !csvIds.has(ingredient.id))
                    .map(ingredient => this.normalizeIngredient(ingredient));
                const merged = [...csvIngredients, ...customIngredients];
                this.repository.replaceAll(merged);
            } else {
                this.repository.replaceAll(csvIngredients);
            }
            this.persistKindMigration();
            this.log(`Loaded ${this.repository.getAll().length} ingredients.`);
        } catch (error) {
            this.handleError(error as Error);
        }
    }

    getAll(): Ingredient[] {
        return this.repository.getAll();
    }

    addIngredient(ingredient: Ingredient): void {
        // Ensure ID is unique if not present
        if (!ingredient.id) {
            ingredient.id = `user_${IdService.create()}`;
        }
        this.repository.add(this.normalizeIngredient(ingredient));
    }

    deleteIngredient(id: string): void {
        this.repository.delete(id);
    }

    updateIngredient(updated: Ingredient): void {
        this.repository.update(this.normalizeIngredient(updated));
    }

    upsertIngredient(ingredient: Ingredient): void {
        const normalized = this.normalizeIngredient(ingredient);
        if (!normalized.id) {
            normalized.id = `user_${IdService.create()}`;
        }
        this.repository.upsert(normalized);
    }

    replaceAll(ingredients: Ingredient[], markInitialized = true): void {
        const normalized = (ingredients || []).map((ingredient) => this.normalizeIngredient(ingredient));
        if (markInitialized) {
            this.initialized = true;
        }
        this.repository.replaceAll(normalized);
    }

    private persistKindMigration(): void {
        const items = this.repository.getAll();
        let changed = false;
        const migrated = items.map((ingredient) => {
            if (ingredient.kind) return ingredient;
            changed = true;
            return this.normalizeIngredient(ingredient);
        });
        if (changed) {
            this.repository.replaceAll(migrated);
        }
    }

    exportToCSV(): string {
        const header = 'ref,order,menuKey,name,inci,descriptionFragment,notes,catalogStatus,category,origin,sap,sap_koh,iodine,ins,flags.citricAcid,waterPercent,botanical.botanicalName,botanical.plantPart,botanical.physicalForm,botanical.notes,properties.conditioning,properties.cleansing,properties.bubbles,properties.persistence,properties.hardness,properties.solubility,properties.drying,fattyAcids.lauric,fattyAcids.myristic,fattyAcids.palmitic,fattyAcids.stearic,fattyAcids.oleic,fattyAcids.linoleic,fattyAcids.linolenic,fattyAcids.ricinoleic,fattyAcids.gadoleic,fattyAcids.other';
        const csvEscape = (value: string) => {
            if (value.includes('"')) {
                value = value.replace(/"/g, '""');
            }
            if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                return `"${value}"`;
            }
            return value;
        };
        const formatNumber = (value?: number) => {
            if (value === null || value === undefined) return '';
            if (!Number.isFinite(value)) return '';
            return value.toString();
        };
        const rows = this.repository.getAll().map((ingredient, index) => {
            const values = [
                ingredient.id || `ingredient_${index + 1}`,
                (index + 1).toString(),
                ingredient.menuKey || '',
                ingredient.name || '',
                ingredient.inci || '',
                ingredient.descriptionFragment || '',
                ingredient.notes || '',
                'custom',
                ingredient.category || '',
                ingredient.origin || '',
                formatNumber(ingredient.sapNaOH),
                formatNumber(ingredient.sapKOH),
                formatNumber(ingredient.iodine),
                formatNumber(ingredient.ins),
                ingredient.flags?.citricAcid ? 'true' : '',
                formatNumber(ingredient.waterPercent),
                '',
                '',
                '',
                '',
                formatNumber(ingredient.properties?.conditioning),
                formatNumber(ingredient.properties?.cleansing),
                formatNumber(ingredient.properties?.bubbly),
                formatNumber(ingredient.properties?.stable),
                formatNumber(ingredient.properties?.hardness),
                formatNumber(ingredient.properties?.solubility),
                formatNumber(ingredient.properties?.drying),
                formatNumber(ingredient.fattyAcids?.lauric),
                formatNumber(ingredient.fattyAcids?.myristic),
                formatNumber(ingredient.fattyAcids?.palmitic),
                formatNumber(ingredient.fattyAcids?.stearic),
                formatNumber(ingredient.fattyAcids?.oleic),
                formatNumber(ingredient.fattyAcids?.linoleic),
                formatNumber(ingredient.fattyAcids?.linolenic),
                formatNumber(ingredient.fattyAcids?.ricinoleic),
                formatNumber(ingredient.fattyAcids?.gadoleic),
                formatNumber(ingredient.fattyAcids?.other)
            ];
            return values.map(value => csvEscape(String(value))).join(',');
        });
        return [header, ...rows].join('\n');
    }

    importFromCSV(csvContent: string): void {
        const newIngredients = this.parseCSV(csvContent)
            .map(ingredient => this.normalizeIngredient(ingredient));
        const merged = new Map<string, Ingredient>();
        this.repository.getAll().forEach(ingredient => {
            if (ingredient.id) {
                merged.set(ingredient.id, ingredient);
            }
        });
        newIngredients.forEach((ingredient, index) => {
            const id = ingredient.id || `import_${Date.now()}_${index}`;
            merged.set(id, { ...ingredient, id });
        });
        this.repository.replaceAll(Array.from(merged.values()));
    }

    private normalizeIngredient(ingredient: Ingredient): Ingredient {
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
        const kind = ingredient.kind ?? this.inferKind(ingredient);
        const tags = ingredient.tags ?? this.inferTags(ingredient);
        const measurement = this.inferMeasurement(ingredient);
        return {
            ...ingredient,
            kind,
            tags: tags.length > 0 ? tags : ingredient.tags,
            teaspoonWeight: ingredient.teaspoonWeight ?? measurement.teaspoonWeight,
            isHerb: ingredient.isHerb ?? measurement.isHerb,
            properties: { ...defaultProperties, ...ingredient.properties },
            fattyAcids: { ...defaultFattyAcids, ...ingredient.fattyAcids }
        };
    }

    private inferKind(ingredient: Ingredient): Ingredient['kind'] {
        const normalize = (value?: string) =>
            (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const name = normalize(ingredient.name);
        const inci = normalize(ingredient.inci);
        const category = normalize(ingredient.category);
        const menuKey = normalize(ingredient.menuKey);

        if (name.includes('agua') || inci === 'aqua') return 'water';
        if (menuKey.includes('baseoils') || menuKey.includes('superfatoils')) return 'oil';
        if (category.includes('oleos base') || category.includes('oleo base') || category.includes('leos base')) return 'oil';
        if (category.includes('superfat')) return 'oil';
        if (category.includes('aditivos') || category.includes('botanicos') || category.includes('aromas') || category.includes('essenciais')) return 'additive';
        if (category.includes('lixivia') || category.includes('lye')) return 'additive';

        return 'other';
    }

    private inferTags(ingredient: Ingredient): string[] {
        const normalize = (value?: string) =>
            (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const name = normalize(ingredient.name);
        const tags: string[] = [];
        if (name.includes('azeite') || name.includes('oliva')) tags.push('olive');
        if (name.includes('ricino') || name.includes('castor')) tags.push('castor');
        return tags;
    }

    private inferMeasurement(ingredient: Ingredient): { teaspoonWeight?: number; isHerb?: boolean } {
        const normalize = (value?: string) =>
            (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const name = normalize(ingredient.name);
        let teaspoonWeight: number | undefined;
        for (const key in TEASPOON_WEIGHTS) {
            if (name.includes(key)) {
                teaspoonWeight = TEASPOON_WEIGHTS[key];
                break;
            }
        }
        const isHerb = name.includes('infusao') || name.includes('infusão') || name.includes('seco') || name.includes('seca');
        return { teaspoonWeight, isHerb };
    }

    private parseCSV(csvText: string): Ingredient[] {
        // Split by newline and remove empty lines
        const lines = csvText.split('\n').filter(line => line.trim() !== '');

        // Skip header row
        return lines.slice(1).map((line) => {
            // Robust CSV splitting handling quotes
            const values: string[] = [];
            let currentValue = '';
            let insideQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    insideQuotes = !insideQuotes;
                } else if (char === ',' && !insideQuotes) {
                    values.push(currentValue);
                    currentValue = '';
                } else {
                    currentValue += char;
                }
            }
            values.push(currentValue);

            // Clean up values (remove surrounding quotes if present)
            const cleanValues = values.map(v => v.trim().replace(/^"|"$/g, ''));

            // Helper to get number
            const getNum = (idx: number) => {
                const val = cleanValues[idx];
                return val ? parseFloat(val.replace(',', '.')) : 0;
            };

            const getString = (idx: number) => cleanValues[idx] || '';
            const getBool = (idx: number) => getString(idx).toLowerCase() === 'true';

            // Use the exact category string from the CSV
            const categoryStr = getString(8);

            return {
                id: getString(0), // Use 'ref' as ID
                menuKey: getString(2),
                name: getString(3),
                inci: getString(4),
                category: categoryStr,
                descriptionFragment: getString(5),
                notes: getString(6),
                origin: getString(9),
                sapNaOH: getNum(10),
                sapKOH: getNum(11),
                iodine: getNum(12),
                ins: getNum(13),
                waterPercent: getNum(15),
                flags: {
                    citricAcid: getBool(14)
                },
                properties: {
                    conditioning: getNum(20),
                    cleansing: getNum(21),
                    bubbly: getNum(22),
                    stable: getNum(23),
                    hardness: getNum(24),
                    solubility: getNum(25),
                    drying: getNum(26),
                },
                fattyAcids: {
                    lauric: getNum(27),
                    myristic: getNum(28),
                    palmitic: getNum(29),
                    stearic: getNum(30),
                    oleic: getNum(31),
                    linoleic: getNum(32),
                    linolenic: getNum(33),
                    ricinoleic: getNum(34),
                    gadoleic: getNum(35),
                    other: getNum(36)
                }
            };
        });
    }
}
