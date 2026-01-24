import { BaseService } from '../core/BaseService';
import { Ingredient } from '../../shared/types/Ingredient';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import { IdService } from './IdService';
import { normalizeIngredient } from '../ingredients/IngredientNormalizer';
import { migrateMissingKind, removeDeprecatedIngredients } from '../ingredients/IngredientMigration';
import { parseIngredientCSV } from '../ingredients/IngredientCsvParser';
import { StorageKeys } from '../../shared/constants/StorageKeys';
import { AppConstants } from '../../shared/constants/AppConstants';

export class IngredientService extends BaseService {
    private static instance: IngredientService;
    private static readonly STORAGE_KEY = StorageKeys.INGREDIENTS;
    private static readonly STORAGE_VERSION = AppConstants.INGREDIENTS_STORAGE_VERSION;
    private initialized = false;
    private repository: LocalStorageRepository<Ingredient>;

    private constructor() {
        super('IngredientService');
        this.repository = new LocalStorageRepository<Ingredient>(IngredientService.STORAGE_KEY, {
            deserialize: (raw) => {
                const items = Array.isArray(raw)
                    ? raw
                    : (raw && Array.isArray(raw.items) ? raw.items : []);
                return items.map((ingredient: Ingredient) => normalizeIngredient(ingredient));
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
            const response = await fetch(`${import.meta.env.BASE_URL}${AppConstants.DEFAULT_INGREDIENTS_CSV_PATH}`);
            const csvText = await response.text();
            const csvIngredients = parseIngredientCSV(csvText).map(ingredient => normalizeIngredient(ingredient));
            if (storedIngredients.length > 0) {
                const csvIds = new Set(csvIngredients.map(ingredient => ingredient.id));
                const customIngredients = storedIngredients
                    .filter(ingredient => !csvIds.has(ingredient.id))
                    .map(ingredient => normalizeIngredient(ingredient));
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
        this.repository.add(normalizeIngredient(ingredient));
    }

    deleteIngredient(id: string): void {
        this.repository.delete(id);
    }

    updateIngredient(updated: Ingredient): void {
        this.repository.update(normalizeIngredient(updated));
    }

    upsertIngredient(ingredient: Ingredient): void {
        const normalized = normalizeIngredient(ingredient);
        if (!normalized.id) {
            normalized.id = `user_${IdService.create()}`;
        }
        this.repository.upsert(normalized);
    }

    replaceAll(ingredients: Ingredient[], markInitialized = true): void {
        const normalized = (ingredients || []).map((ingredient) => normalizeIngredient(ingredient));
        if (markInitialized) {
            this.initialized = true;
        }
        this.repository.replaceAll(normalized);
    }

    private persistKindMigration(): void {
        const items = this.repository.getAll();
        const removal = removeDeprecatedIngredients(items);
        const migration = migrateMissingKind(removal.items);
        if (removal.changed || migration.changed) {
            this.repository.replaceAll(migration.items);
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
        const newIngredients = parseIngredientCSV(csvContent)
            .map(ingredient => normalizeIngredient(ingredient));
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

}
