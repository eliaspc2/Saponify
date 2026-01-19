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

const SectionHeader = ({ title, color }: { title: string, color: string }) => (
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
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-dark)', letterSpacing: '0.025em' }}>{title}</h3>
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


export class CalculatorPage extends BasePage<{ recipeId?: string }, CalculatorState> {
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
        if (service.getAll().length === 0) {
            await service.loadInitialData();
        }
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

    componentDidUpdate(prevProps: { recipeId?: string }) {
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
    }

    private handleRecipeChange(field: keyof Recipe, value: any) {
        this.setState(prev => {
            let updatedRecipe = { ...prev.recipe, [field]: value };

            // Recalculate water if concentration or superfat changes
            if (field === 'waterConcentration' || field === 'superfat') {
                updatedRecipe = this.recalculateWater(updatedRecipe);
            }

            return { recipe: updatedRecipe };
        });
    }

    private recalculateWater(recipe: Recipe): Recipe {
        const fats = recipe.fats || [];
        const totalFats = fats.reduce((acc, f) => acc + (f.amount || 0), 0);
        const newWaterAmount = parseFloat((totalFats * (recipe.waterConcentration / 100)).toFixed(1));

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
            return { recipe: type === 'fats' ? this.recalculateWater(updatedRecipe) : updatedRecipe };
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
            if (type === 'fats' && updates.amount !== undefined) {
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

        let md = `# Receita: ${recipe.name || 'Sem Nome'} \n`;
        md += `Código: ${recipe.code} | Data: ${recipe.date} \n\n`;

        md += `## Configurações\n`;
        md += `- Álcali: ${recipe.alkali} \n`;
        md += `- Superfat: ${recipe.superfat}%\n`;
        md += `- Concentração de Água: ${recipe.waterConcentration}%\n\n`;

        md += `## Composição\n`;
        md += `### Fase 1: Gorduras\n`;
        recipe.fats.forEach(f => {
            md += `- ${f.name}: ${f.amount} g(${((f.amount / results.totalFats) * 100).toFixed(1)}%) \n`;
        });

        md += `\n### Fase 2: Lixívia & Aditivos\n`;
        recipe.liquids.forEach(l => md += `- ${l.name}: ${l.amount} g\n`);
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
        a.download = `${recipe.code}_${recipe.name.replace(/\s+/g, '_')}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private handleDownloadJSON() {
        const { recipe } = this.state;
        const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${recipe.code}_${recipe.name.replace(/\s+/g, '_')}.json`;
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
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 40px', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
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

    private renderProgressBar(label: string, value: number, optimal: number = 50) {
        const diff = Math.abs(value - optimal);
        let colorClass = '';

        if (diff <= 5) colorClass = '';
        else if (diff <= 12) colorClass = 'warning';
        else colorClass = 'danger';

        return (
            <div className="progress-group" key={label}>
                <div className="progress-label">
                    <span>{label}</span>
                    <span style={{ fontWeight: 700 }}>{value.toFixed(0)}</span>
                </div>
                <div className="progress-bar-bg">
                    <div
                        className={`progress - bar - fill ${colorClass} `}
                        style={{ width: `${Math.min(100, (value / 80) * 100)}% ` }}
                    />
                </div>
            </div>
        );
    }

    renderContent() {
        if (this.state.loading) return <div>Carregando calculadora...</div>;

        const { recipe, availableIngredients } = this.state;
        const results = CalculatorService.calculate(recipe, availableIngredients);

        const phase1Color = '#F0F9FF';
        const phase2Color = '#F0FDF4';
        const phase3Color = '#FFF7ED';

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
                        <div className="card">
                            <h3 style={{ marginBottom: '1.5rem', fontSize: '1rem', fontWeight: 700 }}>Informações da Receita</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '150px 200px 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
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

                        <div className="card">
                            <h3 style={{ marginBottom: '1.5rem', fontSize: '1rem', fontWeight: 700 }}>Configurações Base</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
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

                            {/* Calculated Alkali & Water Display */}
                            <div style={{
                                marginTop: '1.5rem',
                                padding: '1.25rem',
                                background: 'var(--color-primary-light)',
                                borderRadius: 'var(--radius-md)',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '1.5rem',
                                border: '1px solid rgba(90, 125, 76, 0.1)'
                            }}>
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

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <SectionHeader title="FASE 1: Gorduras & Óleos" color={phase1Color} />
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Óleos Base</h4>
                                    <AddButton label="Adicionar" small onClick={() => this.addItem('fats')} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 40px', gap: '0.75rem', marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: 700, color: '#9CA3AF' }}>
                                    <span>INGREDIENTE</span>
                                    <span style={{ textAlign: 'right' }}>PESO (g)</span>
                                    <span style={{ textAlign: 'right' }}>SAP</span>
                                    <span style={{ textAlign: 'right' }}>%</span>
                                    <span></span>
                                </div>
                                {(recipe.fats || []).map(f => this.renderIngredientRow(f, 'fats', ['Óleos Base'], results.totalFats))}
                                {(!recipe.fats || recipe.fats.length === 0) && (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-light)', border: '1px dashed #E5E7EB', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                                        Nenhum óleo na fase 1. Clique em "+ Adicionar" acima.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <SectionHeader title="FASE 2: Lixívia & Aditivos" color={phase2Color} />
                            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Líquidos</h4>
                                        <AddButton label="Adicionar" small onClick={() => this.addItem('liquids')} />
                                    </div>
                                    {(recipe.liquids || []).map(l => this.renderIngredientRow(l, 'liquids', ['Líquidos Lixívia']))}
                                </div>
                                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aditivos</h4>
                                        <AddButton label="Adicionar" small onClick={() => this.addItem('lyeAdditives')} />
                                    </div>
                                    {(recipe.lyeAdditives || []).map(a => this.renderIngredientRow(a, 'lyeAdditives', ['Aditivos Lixívia']))}
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <SectionHeader title="FASE 3: No Traço (Trace)" color={phase3Color} />
                            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aditivos & Botânicos</h4>
                                        <AddButton label="Adicionar" small onClick={() => this.addItem('traceAdditives')} />
                                    </div>
                                    {(recipe.traceAdditives || []).map(a => this.renderIngredientRow(a, 'traceAdditives', ['Aditivos Traço']))}
                                </div>

                                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Óleos de Superfat</h4>
                                        <AddButton label="Adicionar" small onClick={() => this.addItem('superfatOils')} />
                                    </div>
                                    {(recipe.superfatOils || []).map(o => this.renderIngredientRow(o, 'superfatOils', ['Superfat']))}
                                </div>

                                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aromas & O.E.</h4>
                                        <AddButton label="Adicionar" small onClick={() => this.addItem('essentialOils')} />
                                    </div>
                                    {(recipe.essentialOils || []).map(o => this.renderIngredientRow(o, 'essentialOils', ['Óleos Essenciais']))}
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
                            <div className="result-row"><span>Gorduras</span><span className="result-value">{results.totalFats.toFixed(1)}g</span></div>
                            <div className="result-row"><span>Lixívia</span><span className="result-value" style={{ color: 'var(--color-accent)' }}>{results.alkaliAmount.toFixed(1)}g</span></div>
                            <div className="result-row"><span>Água</span><span className="result-value">{results.waterAmount.toFixed(1)}g</span></div>
                            <div className="result-row"><span>Glicerina ≈</span><span className="result-value">{results.glycerin.toFixed(1)}g</span></div>
                            <div className="result-row" style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed #eee' }}>
                                <span style={{ fontWeight: 700 }}>Peso Final</span>
                                <span className="result-value" style={{ fontSize: '1.1rem', color: 'var(--color-primary-dark)' }}>{results.totalWeight.toFixed(1)}g</span>
                            </div>
                        </div>
                        <div className="result-section">
                            <h4>Qualidade</h4>
                            {this.renderProgressBar('Condicionamento', results.properties.conditioning)}
                            {this.renderProgressBar('Limpeza', results.properties.cleansing)}
                            {this.renderProgressBar('Bolhas', results.properties.bubbles)}
                            {this.renderProgressBar('Persistência', results.properties.persistence)}
                            {this.renderProgressBar('Dureza', results.properties.hardness)}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                                <div style={{ textAlign: 'center', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#6B7280' }}>IODO</div>
                                    <div style={{ fontWeight: 700 }}>{results.iodine.toFixed(0)}</div>
                                </div>
                                <div style={{ textAlign: 'center', padding: '0.5rem', background: '#f9fafb', borderRadius: '4px' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#6B7280' }}>INS</div>
                                    <div style={{ fontWeight: 700 }}>{results.ins.toFixed(0)}</div>
                                </div>
                            </div>
                        </div>
                        <div className="result-section">
                            <h4>Ácidos Graxos</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                {results.fattyAcids.lauric > 0 && <span className="fatty-acid-tag">Láurico: {results.fattyAcids.lauric.toFixed(1)}%</span>}
                                {results.fattyAcids.palmitic > 0 && <span className="fatty-acid-tag">Palmítico: {results.fattyAcids.palmitic.toFixed(1)}%</span>}
                                {results.fattyAcids.oleic > 0 && <span className="fatty-acid-tag">Oleico: {results.fattyAcids.oleic.toFixed(1)}%</span>}
                            </div>
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
