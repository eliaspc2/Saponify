import { BasePage, BasePageState } from '../../core/BasePage';
import { Recipe, RecipeIngredient } from '../../../shared/types/Recipe';
import { IngredientService } from '../../../orchestrator/services/IngredientService';
import { RecipeService } from '../../../orchestrator/services/RecipeService';
import { SettingsService } from '../../../orchestrator/services/SettingsService';
import { CalculatorService } from '../../../orchestrator/services/CalculatorService';
import { Ingredient } from '../../../shared/types/Ingredient';
import { TEASPOON_WEIGHTS, DEFAULT_HERB_WEIGHT, INFUSION_RATIO_FATS_PER_TS } from '../../../shared/constants/RecipeConstants';
import { Beaker, ShieldCheck, Plus, Trash2, Save, FileText } from 'lucide-react';
import { Client } from '../../../shared/types/Client';
import { ClientService } from '../../../orchestrator/services/ClientService';
import { formatRecipeCodeForFile, formatRecipeReference } from '../../../shared/utils/recipeFormat';

interface CalculatorState extends BasePageState {
    recipe: Recipe;
    availableIngredients: Ingredient[];
    clients: Client[];
    loading: boolean;
}

const generateId = () => {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { }
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4);
};

const SectionHeader = ({
    title,
    color,
    titleColor,
    actions
}: {
    title: string;
    color: string;
    titleColor?: string;
    actions?: React.ReactNode;
}) => (
    <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.25rem 1.5rem',
        backgroundColor: color,
        borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        marginBottom: '1rem',
        borderBottom: '1px solid rgba(0,0,0,0.05)'
    }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: titleColor || 'var(--color-primary-dark)', letterSpacing: '0.025em' }}>{title}</h3>
        {actions && <div style={{ display: 'flex', alignItems: 'center' }}>{actions}</div>}
    </div>
);

const AddButton = ({ label, onClick, small }: { label: string, onClick: () => void, small?: boolean }) => (
    <button
        className="btn btn-primary"
        onClick={onClick}
        style={small ? { padding: '0.4rem 0.8rem', fontSize: '0.8rem' } : {}}
    >
        <Plus size={small ? 14 : 18} />
        {label}
    </button>
);

const PhaseAddMenu = ({
    options,
    onSelect
}: {
    options: { label: string; type: keyof Recipe }[];
    onSelect: (type: keyof Recipe) => void;
}) => (
    <details className="phase-add-menu">
        <summary className="btn btn-primary">
            <Plus size={18} />
            Adicionar
        </summary>
        <div className="phase-add-menu-list">
            {options.map(option => (
                <button
                    key={option.type}
                    type="button"
                    className="phase-add-menu-item"
                    onClick={(event) => {
                        const details = (event.currentTarget.closest('details') as HTMLDetailsElement | null);
                        if (details) details.open = false;
                        onSelect(option.type);
                    }}
                >
                    {option.label}
                </button>
            ))}
        </div>
    </details>
);

const QUALITY_RANGES = {
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
} as const;


export class CalculatorPage extends BasePage<{ recipeId?: string }, CalculatorState> {
    private autoSaveTimer: number | null = null;

    constructor(props: { recipeId?: string }) {
        super(props);
        this.state = {
            ...this.getInitialState() as CalculatorState,
            availableIngredients: [],
            clients: [],
            loading: true
        };
    }

    protected getInitialState(): Partial<CalculatorState> {
        const settings = SettingsService.getInstance().getSettings();
        const nextCode = RecipeService.getInstance().getNextCode();
        return {
            recipe: {
                id: crypto.randomUUID(),
                code: nextCode,
                name: '',
                date: new Date().toISOString().split('T')[0],
                clientId: null,
                alkali: settings.defaultAlkali as 'NaOH' | 'KOH',
                superfat: settings.defaultSuperfat,
                waterConcentration: settings.defaultWaterConcentration,
                alkaliPurity: settings.defaultAlkaliPurity ?? 100,
                fats: [],
                liquids: [
                    { id: crypto.randomUUID(), ingredientId: '12', name: 'Água', amount: 0, percentage: 0 }
                ],
                functionalAdditives: [],
                lyeAdditives: [],
                traceAdditives: [],
                superfatOils: [],
                essentialOils: [],
                notes: ''
            }
        };
    }

    async componentDidMount() {
        const service = IngredientService.getInstance();
        await service.loadInitialData();
        const ingredients = service.getAll();
        const clients = ClientService.getInstance().getAll();

        let recipe = this.state.recipe;
        if (this.props.recipeId) {
            const saved = RecipeService.getInstance().getById(this.props.recipeId);
            if (saved) {
                recipe = { ...this.getInitialState().recipe!, ...saved };
            }
        }

        this.setState({ availableIngredients: ingredients, clients, recipe, loading: false });
    }

    componentWillUnmount() {
        if (this.autoSaveTimer) {
            window.clearTimeout(this.autoSaveTimer);
        }
    }

    componentDidUpdate(prevProps: { recipeId?: string }, prevState: CalculatorState) {
        if (this.props.recipeId !== prevProps.recipeId) {
            if (this.props.recipeId) {
                const saved = RecipeService.getInstance().getById(this.props.recipeId);
                if (saved) {
                    this.setState({ recipe: { ...this.getInitialState().recipe!, ...saved } });
                }
            } else {
                // Reset to new recipe
                this.setState({ recipe: this.getInitialState().recipe! });
            }
        }

        if (!this.state.loading && prevState.recipe !== this.state.recipe) {
            const persisted = !!RecipeService.getInstance().getById(this.state.recipe.id);
            if (persisted) {
                if (this.autoSaveTimer) {
                    window.clearTimeout(this.autoSaveTimer);
                }
                this.autoSaveTimer = window.setTimeout(() => {
                    RecipeService.getInstance().save(this.state.recipe);
                }, 600);
            }
        }
    }

    private handleRecipeChange(field: keyof Recipe, value: any) {
        this.setState(prev => {
            let updatedRecipe = { ...prev.recipe, [field]: value };

            // Recalculate water if concentration or superfat changes
            if (field === 'waterConcentration' || field === 'superfat' || field === 'alkali' || field === 'alkaliPurity') {
                updatedRecipe = this.recalculateWater(updatedRecipe);
            }

            return { recipe: updatedRecipe };
        });
    }

    private recalculateWater(recipe: Recipe): Recipe {
        const fats = recipe.fats || [];
        const totalFats = fats.reduce((acc, f) => acc + (f.amount || 0), 0);
        const { availableIngredients } = this.state;
        const normalizeCategory = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const isBaseOil = (ing?: Ingredient) => {
            if (!ing) return false;
            if (ing.menuKey && ing.menuKey.toLowerCase() === 'baseoils') return true;
            if (!ing.category) return false;
            const category = normalizeCategory(ing.category);
            return category.includes('oleos base') || category.includes('oleo base') || category.includes('leos base');
        };
        const isCitricAcid = (ing?: Ingredient) => {
            if (!ing) return false;
            if (ing.flags?.citricAcid) return true;
            const text = `${ing.name} ${ing.inci}`.toLowerCase();
            return text.includes('citric acid') || text.includes('acido citrico') || text.includes('ácido citrico');
        };
        const getSapKOH = (ing?: Ingredient) => {
            if (!ing) return 0;
            if (ing.sapKOH) return ing.sapKOH;
            return ing.sapNaOH ? ing.sapNaOH * 1.403 : 0;
        };
        const naohConversion = 0.713;
        let totalSapKOH = 0;

        const normalizeLabel = (value?: string) =>
            (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        fats.forEach((fat) => {
            if ((fat.amount || 0) <= 0) return;
            const ing = availableIngredients.find(i => i.id === fat.ingredientId)
                || availableIngredients.find(i => normalizeLabel(i.name) === normalizeLabel(fat.name));
            if (!ing || !isBaseOil(ing)) return;
            totalSapKOH += (fat.amount || 0) * getSapKOH(ing);
        });

        const superfatRatio = 1 - (recipe.superfat / 100);
        const lyeBase = totalSapKOH * (recipe.alkali === 'NaOH' ? naohConversion : 1);
        const citricAcidAmount = (recipe.lyeAdditives || []).reduce((sum, item) => {
            const ing = availableIngredients.find(i => i.id === item.id || i.id === item.ingredientId);
            return isCitricAcid(ing) ? sum + (item.amount || 0) : sum;
        }, 0);
        const citricLyeFactor = recipe.alkali === 'NaOH' ? 0.624 : 0.876;
        const citricLye = citricAcidAmount * citricLyeFactor;
        const alkaliPurity = recipe.alkaliPurity ?? 100;
        const purityRatio = alkaliPurity > 0 ? (alkaliPurity / 100) : 1;
        const lyeAmount = purityRatio > 0
            ? ((lyeBase * superfatRatio) + citricLye) / purityRatio
            : (lyeBase * superfatRatio) + citricLye;
        const lyeRatio = recipe.waterConcentration / 100;
        const fallbackWaterAmount = parseFloat((totalFats * (recipe.waterConcentration / 100)).toFixed(1));
        const newWaterAmount = lyeAmount > 0 && lyeRatio > 0
            ? parseFloat((lyeAmount * (1 / lyeRatio - 1)).toFixed(1))
            : fallbackWaterAmount;

        const liquids = recipe.liquids || [];
        const updatedLiquids = liquids.length > 0
            ? liquids.map(l => l.name.toLowerCase().includes('água') ? { ...l, amount: newWaterAmount } : l)
            : [{ id: generateId(), ingredientId: '12', name: 'Água', amount: newWaterAmount, percentage: 0 }];

        return { ...recipe, fats, liquids: updatedLiquids };
    }

    private addItem(type: keyof Recipe) {
        const newItem: RecipeIngredient = {
            id: generateId(),
            ingredientId: '',
            name: '',
            amount: 0,
            percentage: 0
        };

        this.setState(prev => {
            const currentArray = (prev.recipe[type] as any[]) || [];
            const updatedRecipe = {
                ...prev.recipe,
                [type]: [...currentArray, newItem]
            };
            return { recipe: type === 'fats' ? this.recalculateWater(updatedRecipe) : updatedRecipe };
        });
    }

    private removeItem(type: keyof Recipe, id: string) {
        this.setState(prev => {
            const updatedRecipe = {
                ...prev.recipe,
                [type]: (prev.recipe[type] as any[]).filter(item => item.id !== id)
            };
            if (type === 'fats' || type === 'lyeAdditives') {
                return { recipe: this.recalculateWater(updatedRecipe) };
            }
            return { recipe: updatedRecipe };
        });
    }

    private updateItem(type: keyof Recipe, id: string, updates: Partial<RecipeIngredient>) {
        const { availableIngredients } = this.state;

        if (updates.ingredientId) {
            const ing = availableIngredients.find(i => i.id === updates.ingredientId);
            if (ing) {
                updates.name = ing.name;
                const tsWeight = this.getTeaspoonWeight(ing.name);
                if (tsWeight !== null && (!updates.amount || updates.amount === 0)) {
                    const totalFats = this.state.recipe.fats.reduce((acc, f) => acc + (f.amount || 0), 0);
                    const ratio = totalFats > 0 ? totalFats / INFUSION_RATIO_FATS_PER_TS : 1;
                    updates.amount = parseFloat((tsWeight * ratio).toFixed(2));
                }
            }
        }

        this.setState(prev => {
            const updatedItems = (prev.recipe[type] as any[]).map(item =>
                item.id === id ? { ...item, ...updates } : item
            );
            let updatedRecipe = { ...prev.recipe, [type]: updatedItems };
            if ((type === 'fats' && updates.amount !== undefined) || type === 'lyeAdditives') {
                updatedRecipe = this.recalculateWater(updatedRecipe);
            }
            return { recipe: updatedRecipe };
        });
    }

    private getTeaspoonWeight(name: string): number | null {
        const lowerName = name.toLowerCase();
        for (const key in TEASPOON_WEIGHTS) {
            if (lowerName.includes(key)) return TEASPOON_WEIGHTS[key];
        }
        if (lowerName.includes('infusão') || lowerName.includes('seco') || lowerName.includes('seca')) {
            return DEFAULT_HERB_WEIGHT;
        }
        return null;
    }

    private async handleSaveRecipe() {
        const { recipe } = this.state;
        if (!recipe.name) {
            alert('Por favor, dê um nome à receita antes de salvar.');
            return;
        }

        try {
            RecipeService.getInstance().save(recipe);
            alert('Receita salva com sucesso!');
        } catch (e) {
            alert('Erro ao salvar receita.');
        }
    }

    private handleDownloadMarkdown() {
        const { recipe, availableIngredients } = this.state;
        const results = CalculatorService.calculate(recipe, availableIngredients);
        const recipeRef = formatRecipeReference(recipe.code);

        let md = `# Receita: ${recipe.name || 'Sem Nome'} \n`;
        if (recipeRef) {
            md += `Codigo: ${recipeRef} | Data: ${recipe.date} \n\n`;
        } else {
            md += `Data: ${recipe.date} \n\n`;
        }

        md += `## Configurações\n`;
        md += `- Álcali: ${recipe.alkali} \n`;
        md += `- Superfat: ${recipe.superfat}%\n`;
        md += `- Concentração de Água: ${recipe.waterConcentration}%\n`;
        md += `- Pureza do Álcali: ${recipe.alkaliPurity ?? 100}%\n\n`;

        md += `## Composição\n`;
        md += `### Fase 1: Gorduras\n`;
        recipe.fats.forEach(f => {
            md += `- ${f.name}: ${f.amount} g(${((f.amount / results.totalFats) * 100).toFixed(1)}%) \n`;
        });

        md += `\n### Fase 2: Lixívia & Aditivos\n`;
        recipe.liquids.forEach(l => md += `- ${l.name}: ${l.amount} g\n`);
        recipe.functionalAdditives.forEach(a => md += `- ${a.name}: ${a.amount} g\n`);
        md += `- ${recipe.alkali === 'NaOH' ? 'Soda Cáustica (NaOH)' : 'Potassa (KOH)'}: ${results.alkaliAmount.toFixed(2)} g\n`;
        recipe.lyeAdditives.forEach(a => md += `- ${a.name}: ${a.amount} g\n`);

        md += `\n### Fase 3: No Traço\n`;
        recipe.traceAdditives.forEach(a => md += `- ${a.name}: ${a.amount} g\n`);
        recipe.superfatOils.forEach(o => md += `- ${o.name}: ${o.amount} g\n`);
        recipe.essentialOils.forEach(o => md += `- ${o.name}: ${o.amount} g\n`);

        md += `\n## Resultados Técnicos\n`;
        md += `- Total de Gorduras: ${results.totalFats.toFixed(1)} g\n`;
        md += `- Lixívia(${recipe.alkali}): ${results.alkaliAmount.toFixed(2)} g\n`;
        md += `- Água: ${results.waterAmount.toFixed(1)} g\n`;
        md += `- Peso Total Final: ${results.totalWeight.toFixed(1)} g\n\n`;

        md += `## Qualidade Prevista\n`;
        md += `- Condicionamento: ${results.properties.conditioning.toFixed(0)} \n`;
        md += `- Limpeza: ${results.properties.cleansing.toFixed(0)} \n`;
        md += `- Bolhas: ${results.properties.bubbles.toFixed(0)} \n`;
        md += `- Persistência: ${results.properties.persistence.toFixed(0)} \n`;
        md += `- Dureza: ${results.properties.hardness.toFixed(0)} \n\n`;

        md += `## INCI\n`;
        md += `${results.inciList.join(', ')} \n`;

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const codePrefix = formatRecipeCodeForFile(recipe.code);
        a.download = `${codePrefix}_${recipe.name.replace(/\s+/g, '_')}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private handleDownloadJSON() {
        const { recipe, availableIngredients } = this.state;
        const results = CalculatorService.calculate(recipe, availableIngredients);
        const payload = {
            ...recipe,
            calculations: {
                alkaliAmount: results.alkaliAmount,
                alkaliPure: results.alkaliPure,
                alkaliPurity: results.alkaliPurity,
                sapAverage: results.sapAverage,
                waterAmount: results.waterAmount,
                iodine: results.iodine,
                ins: results.ins,
                glycerin: results.glycerin
            }
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const codePrefix = formatRecipeCodeForFile(recipe.code);
        a.download = `${codePrefix}_${recipe.name.replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private renderIngredientRow(item: RecipeIngredient, type: keyof Recipe, categories?: string[], totalFats?: number) {
        const { availableIngredients, recipe } = this.state;
        const choices = categories
            ? availableIngredients.filter(i => categories.includes(i.category))
            : availableIngredients;

        const selectedIng = availableIngredients.find(i => i.id === item.ingredientId);
        const sapValue = selectedIng ? (recipe.alkali === 'NaOH' ? selectedIng.sapNaOH : selectedIng.sapKOH) : 0;
        const percentage = totalFats && totalFats > 0 ? ((item.amount || 0) / totalFats * 100).toFixed(1) : '0.0';

        return (
            <div key={item.id} className="ingredient-grid ingredient-grid-row">
                <select
                    style={{ width: '100%', padding: '0.6rem 0.75rem', fontSize: '0.85rem' }}
                    value={item.ingredientId}
                    onChange={(e) => this.updateItem(type, item.id, { ingredientId: e.target.value })}
                >
                    <option value="">Selecionar...</option>
                    {choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <div style={{ position: 'relative' }}>
                    <input
                        type="number"
                        value={item.amount || ''}
                        onChange={(e) => this.updateItem(type, item.id, { amount: parseFloat(e.target.value) })}
                        style={{ width: '100%', textAlign: 'right', paddingRight: '1.75rem' }}
                    />
                    <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9CA3AF' }}>g</span>
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#6B7280', padding: '0 0.5rem' }}>
                    {sapValue ? sapValue.toFixed(3) : '-'}
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)', padding: '0 0.5rem' }}>
                    {totalFats ? `${percentage}% ` : '-'}
                </div>

                <button
                    onClick={() => this.removeItem(type, item.id)}
                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <Trash2 size={16} />
                </button>
            </div>
        );
    }

    private renderProgressBar(
        label: string,
        value: number,
        range: {
            min: number;
            max: number;
            thresholds: ReadonlyArray<{ max: number; tone: 'danger' | 'warning' | 'good'; inclusive: boolean }>;
        }
    ) {
        const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
        const denom = range.max - range.min;
        const score = denom > 0 ? clamp(((value - range.min) / denom) * 100, 0, 100) : 0;
        let tone: 'danger' | 'warning' | 'good' = 'good';

        for (const threshold of range.thresholds) {
            if (threshold.inclusive ? value <= threshold.max : value < threshold.max) {
                tone = threshold.tone;
                break;
            }
        }

        const colorClass = tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : '';

        return (
            <div className="progress-group" key={label}>
                <div className="progress-label">
                    <span>{label}</span>
                    <span style={{ fontWeight: 700 }}>{value.toFixed(0)}</span>
                </div>
                <div className="progress-bar-bg">
                    <div
                        className={`progress-bar-fill ${colorClass}`}
                        style={{ width: `${score}%` }}
                    />
                </div>
            </div>
        );
    }

    private renderTableHeader() {
        return (
            <div className="ingredient-grid ingredient-grid-header">
                <div>Ingrediente</div>
                <div style={{ textAlign: 'right' }}>Peso (g)</div>
                <div style={{ textAlign: 'right' }}>SAP</div>
                <div style={{ textAlign: 'right' }}>%</div>
                <div></div>
            </div>
        );
    }

    private renderReadOnlyRow(label: string, amount: number) {
        return (
            <div className="ingredient-grid ingredient-grid-row">
                <select
                    style={{ width: '100%', padding: '0.6rem 0.75rem', fontSize: '0.85rem' }}
                    value={label}
                    disabled
                >
                    <option value={label}>{label}</option>
                </select>
                <div style={{ position: 'relative' }}>
                    <input
                        type="number"
                        value={amount ? amount.toFixed(2) : ''}
                        disabled
                        style={{ width: '100%', textAlign: 'right', paddingRight: '1.75rem', opacity: 0.9 }}
                    />
                    <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9CA3AF' }}>g</span>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#6B7280', padding: '0 0.5rem' }}>-</div>
                <div style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)', padding: '0 0.5rem' }}>-</div>
                <div></div>
            </div>
        );
    }

    private getDayOfYear(date: Date): number {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date.getTime() - start.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    private getPhysicalCureDays(date: Date): number {
        const minDays = 30;
        const maxDays = 45;
        const dayOfYear = this.getDayOfYear(date);
        const radians = (2 * Math.PI * (dayOfYear - 172)) / 365;
        const seasonalFactor = (1 - Math.cos(radians)) / 2;
        return Math.round(minDays + (maxDays - minDays) * seasonalFactor);
    }

    renderContent() {
        if (this.state.loading) return <div>Carregando calculadora...</div>;

        const { recipe, availableIngredients } = this.state;
        const results = CalculatorService.calculate(recipe, availableIngredients);
        const today = new Date();
        const physicalDays = this.getPhysicalCureDays(today);
        const phaseHeaderColor = 'var(--color-primary-light)';
        const phaseHeaderText = 'var(--color-primary-dark)';
        const sumAmounts = (items?: RecipeIngredient[]) => (items || []).reduce((sum, item) => sum + (item.amount || 0), 0);
        const normalizeLabel = (value?: string) =>
            (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        const isWaterItem = (item: RecipeIngredient) => {
            const label = normalizeLabel(item.name);
            return label.includes('agua') || label.includes('water');
        };
        const phase1Total = sumAmounts(recipe.fats);
        const nonWaterLiquids = (recipe.liquids || []).filter(item => !isWaterItem(item));
        const phase2Total = sumAmounts(nonWaterLiquids)
            + results.waterAmount
            + sumAmounts(recipe.functionalAdditives)
            + sumAmounts(recipe.lyeAdditives)
            + results.alkaliAmount;
        const phase3Total = sumAmounts(recipe.traceAdditives) + sumAmounts(recipe.superfatOils) + sumAmounts(recipe.essentialOils);
        const physicalReadyDate = new Date(today.getTime());
        physicalReadyDate.setDate(physicalReadyDate.getDate() + physicalDays);
        const batchWeightWithLye = phase1Total + phase2Total + phase3Total;
        const estimatedDryWeight = Math.max(0, batchWeightWithLye - (results.waterAmount * 0.85));
        const fattyAcidLabels = [
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
        ] as const;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* 1. Control Pill (Sticky) */}
                <div className="list-controls card" style={{ paddingLeft: '2rem', paddingRight: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginRight: '1rem', color: 'var(--color-primary-dark)' }}>Editor de Receita</h2>
                    </div>

                    <div style={{ flex: 1 }}></div>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => this.handleDownloadMarkdown()}>
                            <FileText size={16} /> Markdown
                        </button>
                        <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => this.handleDownloadJSON()}>
                            <Save size={16} /> JSON Backup
                        </button>
                        <button className="btn btn-primary" style={{ borderRadius: '50px', padding: '0.5rem 1.5rem', fontWeight: 700 }} onClick={() => this.handleSaveRecipe()}>
                            <Save size={18} /> Salvar Receita
                        </button>
                    </div>
                </div>

                {/* 2. Main Layout */}
                <div className="calculator-layout">
                    <div className="calculator-form">
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <SectionHeader
                                title="Informações da Receita"
                                color={phaseHeaderColor}
                                titleColor={phaseHeaderText}
                            />
                            <div style={{ padding: '1.5rem' }}>
                                <div className="recipe-meta-grid">
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}># Número</label>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        background: 'white',
                                        border: '1px solid #D1D5DB',
                                        borderRadius: 'var(--radius-sm)',
                                        overflow: 'hidden'
                                    }}>
                                        <span style={{
                                            padding: '0 0.75rem',
                                            color: '#6B7280',
                                            fontWeight: 700,
                                            fontSize: '0.9rem',
                                            borderRight: '1px solid #E5E7EB',
                                            background: '#F9FAFB',
                                            height: '100%',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}>RE</span>
                                        <input
                                            type="text"
                                            value={recipe.code}
                                            onChange={(e) => this.handleRecipeChange('code', e.target.value)}
                                            style={{
                                                flex: 1,
                                                border: 'none',
                                                padding: '0.6rem 0.75rem',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>Data</label>
                                    <input
                                        type="date"
                                        value={recipe.date}
                                        onChange={(e) => this.handleRecipeChange('date', e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>Cliente</label>
                                    <select
                                        style={{ width: '100%' }}
                                        value={recipe.clientId || ''}
                                        onChange={(e) => this.handleRecipeChange('clientId', e.target.value)}
                                    >
                                        <option value="">Selecionar Cliente...</option>
                                        {this.state.clients.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>Nome da Receita *</label>
                                <input
                                    type="text"
                                    placeholder="P. ex: Sabonete de Lavanda Premium"
                                    value={recipe.name}
                                    onChange={(e) => this.handleRecipeChange('name', e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>Notas & Observações</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Detalhes sobre o processo..."
                                        value={recipe.notes}
                                        onChange={(e) => this.handleRecipeChange('notes', e.target.value)}
                                        style={{ width: '100%', fontFamily: 'inherit' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <SectionHeader
                                title="Configurações Base"
                                color={phaseHeaderColor}
                                titleColor={phaseHeaderText}
                            />
                            <div style={{ padding: '1.5rem' }}>
                                <div className="modal-grid-2" style={{ gap: '2rem' }}>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '0.8rem', fontSize: '0.85rem', fontWeight: 600 }}>Tipo de Álcali</label>
                                    <select
                                        value={recipe.alkali}
                                        onChange={(e) => this.handleRecipeChange('alkali', e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="NaOH">Soda Cáustica (NaOH)</option>
                                        <option value="KOH">Potassa (KOH)</option>
                                    </select>
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Sobreengorduramento (Superfat)</label>
                                        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{recipe.superfat}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="-10" max="25"
                                        value={recipe.superfat}
                                        onChange={(e) => this.handleRecipeChange('superfat', parseInt(e.target.value))}
                                        style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                                    />
                                </div>
                            </div>
                                <div style={{ marginTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Concentração da Lixívia (% lixívia/água)</label>
                                        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{recipe.waterConcentration}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="10" max="50"
                                        value={recipe.waterConcentration}
                                        onChange={(e) => this.handleRecipeChange('waterConcentration', parseInt(e.target.value))}
                                        style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                                    />
                                </div>
                                <div style={{ marginTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Pureza do Álcali (%)</label>
                                        <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{recipe.alkaliPurity ?? 100}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="80" max="100"
                                        value={recipe.alkaliPurity ?? 100}
                                        onChange={(e) => this.handleRecipeChange('alkaliPurity', parseInt(e.target.value))}
                                        style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                                    />
                                </div>

                                {/* Calculated Alkali & Water Display */}
                                <div style={{
                                    marginTop: '1.5rem',
                                    padding: '1.25rem',
                                    background: 'var(--color-primary-light)',
                                    borderRadius: 'var(--radius-md)',
                                    gap: '1.5rem',
                                    border: '1px solid rgba(90, 125, 76, 0.1)'
                                }} className="modal-grid-2">
                                    <div>
                                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.25rem', opacity: 0.8 }}>
                                            {recipe.alkali === 'NaOH' ? 'SODA CÁUSTICA (NaOH)' : 'POTASSA (KOH)'}
                                        </div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--color-primary-dark)' }}>
                                            {results.alkaliAmount.toFixed(2)}g
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.25rem', opacity: 0.8 }}>
                                            ÁGUA TOTAL
                                        </div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--color-primary-dark)' }}>
                                            {results.waterAmount.toFixed(1)}g
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <SectionHeader
                                title="FASE 1: Gorduras & Óleos"
                                color={phaseHeaderColor}
                                titleColor={phaseHeaderText}
                                actions={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                                            Total: {phase1Total.toFixed(1)}g
                                        </span>
                                        <AddButton label="Adicionar" onClick={() => this.addItem('fats')} />
                                    </div>
                                }
                            />
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Óleos Base</h4>
                                </div>
                                <div className="table-wrap">
                                    {this.renderTableHeader()}
                                    {(recipe.fats || []).map(f => this.renderIngredientRow(f, 'fats', ['Óleos Base'], results.totalFats))}
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <SectionHeader
                                title="FASE 2: Lixívia & Aditivos"
                                color={phaseHeaderColor}
                                titleColor={phaseHeaderText}
                                actions={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                                            Total: {phase2Total.toFixed(1)}g
                                        </span>
                                        <PhaseAddMenu
                                            options={[
                                                { label: 'Líquidos', type: 'liquids' },
                                                { label: 'Aditivos Funcionais', type: 'functionalAdditives' },
                                                { label: 'Aditivos da Lixívia', type: 'lyeAdditives' }
                                            ]}
                                            onSelect={(type) => this.addItem(type)}
                                        />
                                    </div>
                                }
                            />
                            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Líquidos</h4>
                                </div>
                                <div className="table-wrap">
                                    {this.renderTableHeader()}
                                    {(recipe.liquids || []).map((l) => (
                                        isWaterItem(l)
                                            ? this.renderReadOnlyRow(l.name || 'Água', results.waterAmount)
                                            : this.renderIngredientRow(l, 'liquids', ['Líquidos Lixívia'])
                                    ))}
                                </div>
                            </div>
                            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aditivos Funcionais</h4>
                                </div>
                                <div className="table-wrap">
                                    {this.renderTableHeader()}
                                    {(recipe.functionalAdditives || []).map(a => this.renderIngredientRow(a, 'functionalAdditives', ['Aditivos Funcionais']))}
                                </div>
                            </div>
                            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aditivos da Lixívia</h4>
                                </div>
                                <div className="table-wrap">
                                    {this.renderTableHeader()}
                                    {this.renderReadOnlyRow(
                                        recipe.alkali === 'NaOH' ? 'Soda Cáustica (NaOH)' : 'Potassa (KOH)',
                                        results.alkaliAmount
                                    )}
                                    {(recipe.lyeAdditives || []).map(a => this.renderIngredientRow(a, 'lyeAdditives', ['Aditivos Lixívia']))}
                                </div>
                            </div>
                        </div>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <SectionHeader
                                title="FASE 3: No Traço (Trace)"
                                color={phaseHeaderColor}
                                titleColor={phaseHeaderText}
                                actions={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                                            Total: {phase3Total.toFixed(1)}g
                                        </span>
                                        <PhaseAddMenu
                                            options={[
                                                { label: 'Aditivos & Botânicos', type: 'traceAdditives' },
                                                { label: 'Óleos de Superfat', type: 'superfatOils' },
                                                { label: 'Aromas & O.E.', type: 'essentialOils' }
                                            ]}
                                            onSelect={(type) => this.addItem(type)}
                                        />
                                    </div>
                                }
                            />
                            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aditivos & Botânicos</h4>
                                </div>
                                <div className="table-wrap">
                                    {this.renderTableHeader()}
                                    {(recipe.traceAdditives || []).map(a => this.renderIngredientRow(a, 'traceAdditives', ['Aditivos Traço']))}
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Óleos de Superfat</h4>
                                </div>
                                <div className="table-wrap">
                                    {this.renderTableHeader()}
                                    {(recipe.superfatOils || []).map(o => this.renderIngredientRow(o, 'superfatOils', ['Superfat']))}
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aromas & O.E.</h4>
                                </div>
                                <div className="table-wrap">
                                    {this.renderTableHeader()}
                                    {(recipe.essentialOils || []).map(o => this.renderIngredientRow(o, 'essentialOils', ['Óleos Essenciais']))}
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>

                    <aside className="results-panel">
                        <header>
                            <span>Resumo da Fórmula</span>
                            <Beaker size={18} />
                        </header>
                        <div className="result-section">
                            <h4>Dados Técnicos</h4>
                            <div className="result-row"><span>FASE 1: Gorduras & Óleos</span><span className="result-value">Total: {phase1Total.toFixed(1)}g</span></div>
                            <div className="result-row"><span>FASE 2: Lixívia & Aditivos</span><span className="result-value">Total: {phase2Total.toFixed(1)}g</span></div>
                            <div className="result-row"><span>FASE 3: No Traço (Trace)</span><span className="result-value">Total: {phase3Total.toFixed(1)}g</span></div>
                            <div className="result-row" style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed #eee' }}>
                                <span style={{ fontWeight: 700 }}>Peso Final</span>
                                <span className="result-value" style={{ fontSize: '1.1rem', color: 'var(--color-primary-dark)' }}>{results.totalWeight.toFixed(1)}g</span>
                            </div>
                            <div className="result-row" style={{ marginTop: '0.75rem' }}>
                                <span>Peso Estável (seco)</span>
                                <span className="result-value">{estimatedDryWeight.toFixed(1)}g</span>
                            </div>
                            <div className="result-row">
                                <span>Secagem Física</span>
                                <span className="result-value">~ {physicalDays} dias ({physicalReadyDate.toLocaleDateString()})</span>
                            </div>
                            <div className="result-row">
                                <span>Superfat final</span>
                                <span className="result-value">{results.superfatFinal.toFixed(1)}%</span>
                            </div>
                        </div>
                        <div className="result-section">
                            <h4>Qualidade</h4>
                            {!results.fattyAcidProfileValid ? (
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    Perfil de ácidos graxos inválido. Verifique óleos base e tabelas.
                                </div>
                            ) : (
                                <>
                                    {this.renderProgressBar('Condicionamento', results.properties.conditioning, QUALITY_RANGES.conditioning)}
                                    {this.renderProgressBar('Limpeza', results.properties.cleansing, QUALITY_RANGES.cleansing)}
                                    {this.renderProgressBar('Bolhas', results.properties.bubbles, QUALITY_RANGES.bubbles)}
                                    {this.renderProgressBar('Persistência', results.properties.persistence, QUALITY_RANGES.persistence)}
                                    {this.renderProgressBar('Dureza', results.properties.hardness, QUALITY_RANGES.hardness)}
                                    <div className="modal-grid-3" style={{ marginTop: '1.5rem' }}>
                                        <div style={{ textAlign: 'center', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#6B7280' }}>IODO</div>
                                            <div style={{ fontWeight: 700 }}>{results.iodine.toFixed(0)}</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#6B7280' }}>INS</div>
                                            <div style={{ fontWeight: 700 }}>{results.ins.toFixed(0)}</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px' }}>
                                            <div style={{ fontSize: '0.65rem', color: '#6B7280' }}>GLICERINA ≈</div>
                                            <div style={{ fontWeight: 700 }}>{results.glycerin.toFixed(1)}g</div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="result-section">
                            <h4>Ácidos Graxos</h4>
                            {!results.fattyAcidProfileValid ? (
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    Perfil indisponível para este conjunto de óleos.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                    {fattyAcidLabels.map(({ key, label }) => {
                                        const value = results.fattyAcids[key];
                                        if (value <= 0) return null;
                                        return (
                                            <span key={key} className="fatty-acid-tag">
                                                {label}: {value.toFixed(1)}%
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="result-section">
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldCheck size={14} /> INCI</h4>
                            <div className="inci-list">{results.inciList.join(', ')}</div>
                        </div>
                    </aside>
                </div>
            </div>
        );
    }
}
