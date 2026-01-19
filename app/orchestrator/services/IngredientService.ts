import { BaseService } from '../core/BaseService';
import { Ingredient } from '../../shared/types/Ingredient';

export class IngredientService extends BaseService {
    private ingredients: Ingredient[] = [];
    private static instance: IngredientService;

    private constructor() {
        super('IngredientService');
    }

    static getInstance(): IngredientService {
        if (!IngredientService.instance) {
            IngredientService.instance = new IngredientService();
        }
        return IngredientService.instance;
    }

    async loadInitialData(): Promise<void> {
        try {
            this.log('Fetching ingredients csv...');
            const response = await fetch('/data/ingredients.csv');
            const csvText = await response.text();
            this.ingredients = this.parseCSV(csvText);
            this.log(`Loaded ${this.ingredients.length} ingredients.`);

            // TODO: Save to Browser Cache / IDB
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
        // TODO: Persistence
    }

    deleteIngredient(id: string): void {
        this.ingredients = this.ingredients.filter(i => i.id !== id);
        // TODO: Persistence
    }

    updateIngredient(updated: Ingredient): void {
        const index = this.ingredients.findIndex(i => i.id === updated.id);
        if (index !== -1) {
            this.ingredients[index] = updated;
            // TODO: Persist changes (write back to file or DB)
        }
    }

    exportToCSV(): string {
        // TODO: Implement export logic
        return '';
    }

    importFromCSV(csvContent: string): void {
        const newIngredients = this.parseCSV(csvContent);
        this.ingredients = [...this.ingredients, ...newIngredients];
        // TODO: Deduplicate logic
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

            // Use the exact category string from the CSV
            const categoryStr = getString(8);

            return {
                id: getString(0), // Use 'ref' as ID
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
                    ricinoleic: getNum(34)
                }
            };
        });
    }
}
