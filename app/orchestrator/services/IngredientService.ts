import { BaseService } from '../core/BaseService';
import { Ingredient } from '../../shared/types/Ingredient';

export class IngredientService extends BaseService {
    private ingredients: Ingredient[] = [];
    private static instance: IngredientService;
    private static readonly STORAGE_KEY = 'saponify_ingredients';
    private static readonly STORAGE_VERSION = 2;
    private initialized = false;

    private constructor() {
        super('IngredientService');
        this.loadFromStorage();
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
            const storedIngredients = [...this.ingredients];
            this.log('Fetching ingredients csv...');
            const response = await fetch('/data/ingredients.csv');
            const csvText = await response.text();
            const csvIngredients = this.parseCSV(csvText).map(ingredient => this.normalizeIngredient(ingredient));
            if (storedIngredients.length > 0) {
                const csvIds = new Set(csvIngredients.map(ingredient => ingredient.id));
                const customIngredients = storedIngredients
                    .filter(ingredient => !csvIds.has(ingredient.id))
                    .map(ingredient => this.normalizeIngredient(ingredient));
                this.ingredients = [...csvIngredients, ...customIngredients];
            } else {
                this.ingredients = csvIngredients;
            }
            this.log(`Loaded ${this.ingredients.length} ingredients.`);
            this.saveToStorage();
        } catch (error) {
            this.handleError(error as Error);
        }
    }

    getAll(): Ingredient[] {
        return this.ingredients;
    }

    addIngredient(ingredient: Ingredient): void {
        // Ensure ID is unique if not present
        if (!ingredient.id) {
            ingredient.id = `user_${Date.now()}`;
        }
        this.ingredients.push(ingredient);
        this.saveToStorage();
    }

    deleteIngredient(id: string): void {
        this.ingredients = this.ingredients.filter(i => i.id !== id);
        this.saveToStorage();
    }

    updateIngredient(updated: Ingredient): void {
        const index = this.ingredients.findIndex(i => i.id === updated.id);
        if (index !== -1) {
            this.ingredients[index] = updated;
            this.saveToStorage();
        }
    }

    upsertIngredient(ingredient: Ingredient): void {
        const normalized = this.normalizeIngredient(ingredient);
        if (!normalized.id) {
            normalized.id = `user_${Date.now()}`;
        }
        const index = this.ingredients.findIndex(i => i.id === normalized.id);
        if (index !== -1) {
            this.ingredients[index] = normalized;
        } else {
            this.ingredients.push(normalized);
        }
        this.saveToStorage();
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
        const rows = this.ingredients.map((ingredient, index) => {
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
        this.ingredients.forEach(ingredient => {
            if (ingredient.id) {
                merged.set(ingredient.id, ingredient);
            }
        });
        newIngredients.forEach((ingredient, index) => {
            const id = ingredient.id || `import_${Date.now()}_${index}`;
            merged.set(id, { ...ingredient, id });
        });
        this.ingredients = Array.from(merged.values());
        this.saveToStorage();
    }

    private loadFromStorage(): boolean {
        const stored = localStorage.getItem(IngredientService.STORAGE_KEY);
        if (stored === null) return false;
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                this.ingredients = parsed.map((ingredient) => this.normalizeIngredient(ingredient));
                return true;
            }
            if (parsed && Array.isArray(parsed.items)) {
                this.ingredients = parsed.items.map((ingredient: Ingredient) => this.normalizeIngredient(ingredient));
                return true;
            }
        } catch (e) {
            this.ingredients = [];
        }
        return false;
    }

    private saveToStorage(): void {
        const payload = {
            version: IngredientService.STORAGE_VERSION,
            items: this.ingredients
        };
        localStorage.setItem(IngredientService.STORAGE_KEY, JSON.stringify(payload));
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
        return {
            ...ingredient,
            properties: { ...defaultProperties, ...ingredient.properties },
            fattyAcids: { ...defaultFattyAcids, ...ingredient.fattyAcids }
        };
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
