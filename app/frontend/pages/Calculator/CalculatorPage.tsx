import { BasePage, BasePageProps, BasePageState } from '../../core/BasePage';
import { Recipe, RecipeIngredient } from '../../../shared/types/Recipe';
import { IngredientService } from '../../../backend/infrastructure/services/IngredientService';
import { RecipeService } from '../../../backend/infrastructure/services/RecipeService';
import { RecipeDomainService } from '../../../backend/application/recipes/RecipeDomainService';
import { SettingsService } from '../../../backend/infrastructure/services/SettingsService';
import { AppController } from '../../../orchestrator/services/AppController';
import { BackupService } from '../../../backend/application/backup/BackupService';
import { Ingredient } from '../../../shared/types/Ingredient';
import { Beaker, ShieldCheck, Plus, Trash2, Save, Download, Bot, Sparkles, ChevronDown } from 'lucide-react';
import { Client } from '../../../shared/types/Client';
import { ClientService } from '../../../backend/infrastructure/services/ClientService';
import { showToast } from '../../components/Toast';
import { StorageKeys } from '../../../shared/constants/StorageKeys';

interface CalculatorPageProps extends BasePageProps {
    recipeId?: string;
    appController: AppController;
}

interface CalculatorState extends BasePageState {
    recipe: Recipe;
    availableIngredients: Ingredient[];
    clients: Client[];
    loading: boolean;
    collapsedSections: Record<CalculatorSectionKey, boolean>;
    aiMessageDraft: string;
    isGeneratingAIRecipe: boolean;
    aiError: string | null;
}

type CalculatorSectionKey = 'aiChat' | 'recipeInfo' | 'formulaSummary' | 'baseConfig' | 'phase1' | 'phase2' | 'phase3';

const generateId = () => {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { }
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4);
};

type CalculatorDraftPayload = {
    recipe: Recipe;
    sourceRecipeId: string | null;
    updatedAt: string;
};

const CALCULATOR_DRAFT_STORAGE_KEY = StorageKeys.CALCULATOR_DRAFT;

const parseAmountInput = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const CollapsibleCard = ({
    title,
    color,
    titleColor,
    actions,
    collapsed,
    onToggle,
    className,
    bodyPadding,
    children
}: {
    title: string;
    color: string;
    titleColor?: string;
    actions?: React.ReactNode;
    collapsed: boolean;
    onToggle: () => void;
    className?: string;
    bodyPadding?: string;
    children: React.ReactNode;
}) => (
    <div
        className={'card collapsible-card' + (collapsed ? ' is-collapsed' : '') + (className ? ' ' + className : '')}
        style={{ padding: 0 }}
    >
        <div
            className="collapsible-card-header"
            style={{ backgroundColor: color, color: titleColor || 'var(--color-primary-dark)' }}
        >
            <button
                type="button"
                className="collapsible-card-title-btn"
                onClick={onToggle}
                aria-expanded={!collapsed}
                aria-label={(collapsed ? 'Expandir: ' : 'Colapsar: ') + title}
            >
                <span>{title}</span>
            </button>
            <div className="collapsible-card-header-actions">
                {!collapsed && actions}
                <button type="button" className="collapsible-card-icon-btn" onClick={onToggle} aria-label={(collapsed ? 'Expandir: ' : 'Colapsar: ') + title}>
                    <ChevronDown size={16} />
                </button>
            </div>
        </div>
        <div className="collapsible-card-content" aria-hidden={collapsed}>
            <div className="collapsible-card-content-inner" style={{ padding: bodyPadding || '1.5rem' }}>
                {children}
            </div>
        </div>
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


export class CalculatorPage extends BasePage<CalculatorPageProps, CalculatorState> {
    private autoSaveTimer: number | null = null;

    constructor(props: CalculatorPageProps) {
        super(props);
        this.state = {
            ...this.getInitialState() as CalculatorState,
            availableIngredients: [],
            clients: [],
            loading: true,
            collapsedSections: {
                aiChat: true,
                recipeInfo: false,
                formulaSummary: false,
                baseConfig: false,
                phase1: false,
                phase2: false,
                phase3: false
            },
            aiMessageDraft: '',
            isGeneratingAIRecipe: false,
            aiError: null
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
                    { id: crypto.randomUUID(), ingredientId: '12', name: 'Água', amount: 0, percentage: 0, role: 'water' }
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

        const recipe = this.buildRecipeForContext(this.props.recipeId);

        const calc = this.props.appController.calculateRecipe({
            recipe,
            ingredients
        });
        this.setState({ availableIngredients: ingredients, clients, recipe: calc.normalizedRecipe, loading: false });
    }

    componentWillUnmount() {
        if (this.autoSaveTimer) {
            window.clearTimeout(this.autoSaveTimer);
        }
        this.persistDraft(this.state.recipe);
        this.savePersistedRecipeImmediately(this.state.recipe);
    }

    componentDidUpdate(prevProps: { recipeId?: string }, prevState: CalculatorState) {
        if (this.props.recipeId !== prevProps.recipeId) {
            const nextRecipe = this.buildRecipeForContext(this.props.recipeId);
            const calc = this.props.appController.calculateRecipe({
                recipe: nextRecipe,
                ingredients: this.state.availableIngredients
            });
            this.setState({ recipe: calc.normalizedRecipe });
            return;
        }

        if (!this.state.loading && prevState.recipe !== this.state.recipe) {
            this.persistDraft(this.state.recipe);
            const persisted = !!RecipeService.getInstance().getById(this.state.recipe.id);
            if (persisted) {
                if (this.autoSaveTimer) {
                    window.clearTimeout(this.autoSaveTimer);
                }
                this.autoSaveTimer = window.setTimeout(() => {
                    RecipeDomainService.getInstance().save(this.state.recipe);
                }, 600);
            }
        }
    }

    private readDraftPayload(): CalculatorDraftPayload | null {
        try {
            const raw = localStorage.getItem(CALCULATOR_DRAFT_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Partial<CalculatorDraftPayload> | null;
            if (!parsed || typeof parsed !== 'object' || !parsed.recipe || typeof parsed.recipe !== 'object') {
                return null;
            }
            return {
                recipe: parsed.recipe as Recipe,
                sourceRecipeId: typeof parsed.sourceRecipeId === 'string' ? parsed.sourceRecipeId : null,
                updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : ''
            };
        } catch {
            return null;
        }
    }

    private buildRecipeForContext(recipeId?: string): Recipe {
        const baseRecipe = this.getInitialState().recipe!;
        const draft = this.readDraftPayload();

        if (recipeId) {
            const saved = RecipeService.getInstance().getById(recipeId);
            if (!saved) {
                return baseRecipe;
            }

            const shouldApplyDraft = !!draft && (draft.sourceRecipeId === recipeId || draft.recipe.id === saved.id);
            if (shouldApplyDraft) {
                return {
                    ...baseRecipe,
                    ...saved,
                    ...draft.recipe,
                    id: saved.id,
                    code: saved.code
                };
            }

            return { ...baseRecipe, ...saved };
        }

        if (draft?.recipe) {
            return { ...baseRecipe, ...draft.recipe };
        }

        return baseRecipe;
    }

    private persistDraft(recipe: Recipe) {
        const payload: CalculatorDraftPayload = {
            recipe,
            sourceRecipeId: this.props.recipeId || null,
            updatedAt: new Date().toISOString()
        };

        try {
            localStorage.setItem(CALCULATOR_DRAFT_STORAGE_KEY, JSON.stringify(payload));
        } catch (error) {
            console.warn('Não foi possível guardar rascunho da calculadora:', error);
        }
    }

    private savePersistedRecipeImmediately(recipe: Recipe) {
        const persisted = !!RecipeService.getInstance().getById(recipe.id);
        if (!persisted) return;

        try {
            RecipeDomainService.getInstance().save(recipe);
        } catch (error) {
            console.warn('Não foi possível guardar receita no unmount:', error);
        }
    }

    private handleRecipeChange(field: keyof Recipe, value: any) {
        this.setState(prev => {
            const updatedRecipe = { ...prev.recipe, [field]: value };
            const calc = this.props.appController.calculateRecipe({
                recipe: updatedRecipe,
                ingredients: prev.availableIngredients
            });
            return { recipe: calc.normalizedRecipe };
        });
    }

    private handlePhase1TotalCommit(input: HTMLInputElement) {
        const currentPhase1Total = this.state.recipe.fats.reduce((sum, item) => sum + (item.amount || 0), 0);
        const resetInputValue = () => {
            input.value = currentPhase1Total.toFixed(1);
        };
        const rawValue = input.value.trim().replace(',', '.');
        const targetPhase1Total = Number(rawValue);
        if (!Number.isFinite(targetPhase1Total) || targetPhase1Total < 0) {
            showToast('Insere um total válido para as gorduras (>= 0).', 'warning');
            resetInputValue();
            return;
        }

        if (currentPhase1Total <= 0) {
            showToast('Adiciona pelo menos um óleo com peso para escalar a receita.', 'warning');
            resetInputValue();
            return;
        }

        if (Math.abs(targetPhase1Total - currentPhase1Total) < 0.01) {
            resetInputValue();
            return;
        }

        this.setState(prev => {
            const scaledRecipe = this.props.appController.scaleRecipeByPhase1Total({
                recipe: prev.recipe,
                targetPhase1Total
            });

            const calc = this.props.appController.calculateRecipe({
                recipe: scaledRecipe,
                ingredients: prev.availableIngredients
            });

            return { recipe: calc.normalizedRecipe };
        });
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
            const calc = this.props.appController.calculateRecipe({
                recipe: updatedRecipe,
                ingredients: prev.availableIngredients
            });
            return { recipe: calc.normalizedRecipe };
        });
    }

    private removeItem(type: keyof Recipe, id: string) {
        this.setState(prev => {
            const updatedRecipe = {
                ...prev.recipe,
                [type]: (prev.recipe[type] as any[]).filter(item => item.id !== id)
            };
            const calc = this.props.appController.calculateRecipe({
                recipe: updatedRecipe,
                ingredients: prev.availableIngredients
            });
            return { recipe: calc.normalizedRecipe };
        });
    }

    private updateItem(type: keyof Recipe, id: string, updates: Partial<RecipeIngredient>) {
        const { availableIngredients } = this.state;

        if (updates.ingredientId) {
            const ing = availableIngredients.find(i => i.id === updates.ingredientId);
            if (ing) {
                updates.name = ing.name;
                updates.autoAmount = true;
            }
        }

        this.setState(prev => {
            const updatedItems = (prev.recipe[type] as any[]).map(item =>
                item.id === id ? { ...item, ...updates } : item
            );
            const updatedRecipe = { ...prev.recipe, [type]: updatedItems };
            const calc = this.props.appController.calculateRecipe({
                recipe: updatedRecipe,
                ingredients: prev.availableIngredients
            });
            return { recipe: calc.normalizedRecipe };
        });
    }

    private async handleSaveRecipe() {
        const { recipe } = this.state;
        if (!recipe.name) {
            showToast('Por favor, dê um nome à receita antes de guardar.', 'warning');
            return;
        }

        try {
            RecipeDomainService.getInstance().save(recipe);
            this.persistDraft(recipe);
            showToast('Receita guardada com sucesso!', 'success');
        } catch (e) {
            showToast('Erro ao guardar receita.', 'error');
        }
    }

    private handleDownloadMarkdown() {
        const { recipe, availableIngredients } = this.state;
        const calc = this.props.appController.calculateRecipe({
            recipe,
            ingredients: availableIngredients
        });
        const exportData = calc.exports.markdown;
        const blob = new Blob([exportData.content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportData.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private handleDownloadJSON() {
        const { recipe, availableIngredients } = this.state;
        const calc = this.props.appController.calculateRecipe({
            recipe,
            ingredients: availableIngredients
        });
        const exportData = calc.exports.json;
        const blob = new Blob([exportData.content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportData.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private async handleDownloadBackup() {
        const json = await BackupService.getInstance().exportAllData();
        BackupService.getInstance().downloadBackup(json);
    }

    private handleCreateNewRecipe() {
        const confirmed = confirm('Criar nova receita e limpar todos os campos atuais?');
        if (!confirmed) return;

        if (this.autoSaveTimer) {
            window.clearTimeout(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }

        const freshRecipe = this.getInitialState().recipe!;
        const calc = this.props.appController.calculateRecipe({
            recipe: freshRecipe,
            ingredients: this.state.availableIngredients
        });

        this.setState({
            recipe: calc.normalizedRecipe,
            aiMessageDraft: '',
            isGeneratingAIRecipe: false,
            aiError: null
        });
    }

    private renderIngredientRow(
        item: RecipeIngredient,
        type: keyof Recipe,
        ingredientMetaById: Record<string, { sapValue: number; percentage?: string; role?: 'water' | 'other' }>,
        categories?: string[]
    ) {
        const { availableIngredients } = this.state;
        const choices = categories
            ? availableIngredients.filter(i => categories.includes(i.category))
            : availableIngredients;
        const meta = ingredientMetaById[item.id] || { sapValue: 0 };
        const sapValue = meta.sapValue;
        const percentage = meta.percentage;
        const hasPercentage = typeof percentage === 'string';

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
                        onChange={(e) => this.updateItem(type, item.id, { amount: parseAmountInput(e.target.value) })}
                        style={{ width: '100%', textAlign: 'right', paddingRight: '1.75rem' }}
                    />
                    <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9CA3AF' }}>g</span>
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#6B7280', padding: '0 0.5rem' }}>
                    {sapValue ? sapValue.toFixed(3) : '-'}
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)', padding: '0 0.5rem' }}>
                    {hasPercentage ? `${percentage}% ` : '-'}
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
        progress: { value: number; score: number; tone: 'danger' | 'warning' | 'good' }
    ) {
        const colorClass = progress.tone === 'warning' ? 'warning' : progress.tone === 'danger' ? 'danger' : '';

        return (
            <div className="progress-group" key={label}>
                <div className="progress-label">
                    <span>{label}</span>
                    <span style={{ fontWeight: 700 }}>{progress.value.toFixed(0)}</span>
                </div>
                <div className="progress-bar-bg">
                    <div
                        className={`progress-bar-fill ${colorClass}`}
                        style={{ width: `${progress.score}%` }}
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

    private renderReadOnlyRow(label: string, amount: number, key?: string) {
        return (
            <div key={key} className="ingredient-grid ingredient-grid-row">
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

    protected renderActions(): React.ReactNode {
        return (
            <div className="calculator-header-actions">
                <button className="btn btn-secondary" onClick={() => this.handleCreateNewRecipe()}>
                    <Plus size={16} /> Nova Receita
                </button>
                <details className="phase-add-menu page-action-menu">
                    <summary className="btn btn-secondary">
                        <Download size={16} />
                        Exportar
                    </summary>
                    <div className="phase-add-menu-list">
                        <button
                            type="button"
                            className="phase-add-menu-item"
                            onClick={(event) => {
                                const details = event.currentTarget.closest('details') as HTMLDetailsElement | null;
                                if (details) details.open = false;
                                this.handleDownloadMarkdown();
                            }}
                        >
                            Markdown
                        </button>
                        <button
                            type="button"
                            className="phase-add-menu-item"
                            onClick={(event) => {
                                const details = event.currentTarget.closest('details') as HTMLDetailsElement | null;
                                if (details) details.open = false;
                                this.handleDownloadJSON();
                            }}
                        >
                            JSON
                        </button>
                        <button
                            type="button"
                            className="phase-add-menu-item"
                            onClick={async (event) => {
                                const details = event.currentTarget.closest('details') as HTMLDetailsElement | null;
                                if (details) details.open = false;
                                await this.handleDownloadBackup();
                            }}
                        >
                            Backup
                        </button>
                    </div>
                </details>
                <button className="btn btn-primary" style={{ fontWeight: 700 }} onClick={() => this.handleSaveRecipe()}>
                    <Save size={18} /> Guardar Receita
                </button>
            </div>
        );
    }

    private toggleSection(section: CalculatorSectionKey) {
        this.setState(prev => ({
            collapsedSections: {
                ...prev.collapsedSections,
                [section]: !prev.collapsedSections[section]
            }
        }));
    }

    private async handleGenerateRecipeAIFromCalculator() {
        const message = this.state.aiMessageDraft.trim();
        if (!message) {
            showToast('Escreve uma instrução para a IA antes de enviar.', 'warning');
            return;
        }

        if (!this.props.appController.hasAIConfigured()) {
            showToast('Configura a IA nas Definições para usar esta funcionalidade.', 'warning');
            return;
        }

        this.setState({ isGeneratingAIRecipe: true, aiError: null });
        try {
            const generated = await this.props.appController.generateCalculatorRecipeFromAI({
                message,
                currentRecipe: this.state.recipe
            });

            const calc = this.props.appController.calculateRecipe({
                recipe: generated,
                ingredients: this.state.availableIngredients
            });

            this.setState({
                recipe: calc.normalizedRecipe,
                aiMessageDraft: '',
                isGeneratingAIRecipe: false,
                aiError: null
            });
            showToast('Fórmula atualizada pela IA.', 'success');
        } catch (error) {
            const err = error as { message?: string };
            const message = err?.message || 'Erro ao gerar receita com IA.';
            this.setState({
                isGeneratingAIRecipe: false,
                aiError: message
            });
            showToast(message, 'error');
        }
    }

    renderContent() {
        if (this.state.loading) return <div>Carregando calculadora...</div>;

        const { availableIngredients, collapsedSections } = this.state;
        const baseRecipe = this.state.recipe;
        const calc = this.props.appController.calculateRecipe({ recipe: baseRecipe, ingredients: availableIngredients });
        const { results, phaseTotals, fattyAcidLabels, ingredientMetaById, qualityProgress } = calc;
        const recipe = calc.normalizedRecipe;
        const { phase1Total, phase2Total, phase3Total, estimatedDryWeight, physicalDays, physicalReadyDate, goodConditionDays, goodConditionEndDate } = phaseTotals;
        const phaseHeaderColor = 'var(--color-primary-light)';
        const phaseHeaderText = 'var(--color-primary-dark)';
        const aiConversation = recipe.aiConversation || [];
        const aiConfigured = this.props.appController.hasAIConfigured();

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="calculator-layout">
                    <div className="calculator-form">
                        <CollapsibleCard
                            title="Informações da Receita"
                            color={phaseHeaderColor}
                            titleColor={phaseHeaderText}
                            collapsed={collapsedSections.recipeInfo}
                            onToggle={() => this.toggleSection('recipeInfo')}
                        >
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
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>Nome da Receita <span className="required-marker">*</span></label>
                                <input
                                    type="text"
                                    placeholder="P. ex: Sabonete de Lavanda Premium"
                                    value={recipe.name}
                                    onChange={(e) => this.handleRecipeChange('name', e.target.value)}
                                    style={{ width: '100%' }}
                                />
                                <p className="required-note">Campo obrigatório para guardar a receita.</p>
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
                        </CollapsibleCard>

                        <CollapsibleCard
                            title="Configurações Base"
                            color={phaseHeaderColor}
                            titleColor={phaseHeaderText}
                            collapsed={collapsedSections.baseConfig}
                            onToggle={() => this.toggleSection('baseConfig')}
                        >
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
                                    <div className="slider-bounds">
                                        <span>Min: -10%</span>
                                        <span>Max: 25%</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.55rem' }}>
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
                                <div className="slider-bounds">
                                    <span>Min: 10%</span>
                                    <span>Max: 50%</span>
                                </div>
                            </div>
                            <div style={{ marginTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.55rem' }}>
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
                                <div className="slider-bounds">
                                    <span>Min: 80%</span>
                                    <span>Max: 100%</span>
                                </div>
                            </div>

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
                        </CollapsibleCard>

                        <CollapsibleCard
                            title="FASE 1: Gorduras & Óleos"
                            color={phaseHeaderColor}
                            titleColor={phaseHeaderText}
                            collapsed={collapsedSections.phase1}
                            onToggle={() => this.toggleSection('phase1')}
                            actions={
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                                            Total:
                                        </span>
                                        <div style={{ position: 'relative', width: '6.5rem' }}>
                                            <input
                                                key={`phase1-total-${recipe.id}-${phase1Total.toFixed(1)}`}
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                defaultValue={phase1Total.toFixed(1)}
                                                onBlur={(event) => this.handlePhase1TotalCommit(event.currentTarget)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        (event.currentTarget as HTMLInputElement).blur();
                                                    }
                                                }}
                                                aria-label="Total da fase 1 em gramas"
                                                style={{
                                                    width: '100%',
                                                    textAlign: 'right',
                                                    paddingRight: '1.45rem',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 700,
                                                    color: 'var(--color-primary-dark)'
                                                }}
                                            />
                                            <span style={{ position: 'absolute', right: '0.55rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#6B7280' }}>g</span>
                                        </div>
                                    </div>
                                    <AddButton label="Adicionar" onClick={() => this.addItem('fats')} />
                                </div>
                            }
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Óleos Base</h4>
                            </div>
                            <div className="table-wrap">
                                {this.renderTableHeader()}
                                {(recipe.fats || []).map(f => this.renderIngredientRow(f, 'fats', ingredientMetaById, ['Óleos Base']))}
                            </div>
                        </CollapsibleCard>

                        <CollapsibleCard
                            title="FASE 2: Lixívia & Aditivos"
                            color={phaseHeaderColor}
                            titleColor={phaseHeaderText}
                            collapsed={collapsedSections.phase2}
                            onToggle={() => this.toggleSection('phase2')}
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
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Líquidos</h4>
                                    </div>
                                    <div className="table-wrap">
                                        {this.renderTableHeader()}
                                        {(recipe.liquids || []).map((l) => (
                                            l.role === 'water'
                                                ? this.renderReadOnlyRow(l.name || 'Água', results.waterAmount, l.id)
                                                : this.renderIngredientRow(l, 'liquids', ingredientMetaById, ['Líquidos Lixívia'])
                                        ))}
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aditivos Funcionais</h4>
                                    </div>
                                    <div className="table-wrap">
                                        {this.renderTableHeader()}
                                        {(recipe.functionalAdditives || []).map(a => this.renderIngredientRow(a, 'functionalAdditives', ingredientMetaById, ['Aditivos Funcionais']))}
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
                                        {(recipe.lyeAdditives || []).map(a => this.renderIngredientRow(a, 'lyeAdditives', ingredientMetaById, ['Aditivos Lixívia']))}
                                    </div>
                                </div>
                            </div>
                        </CollapsibleCard>

                        <CollapsibleCard
                            title="FASE 3: No Traço (Trace)"
                            color={phaseHeaderColor}
                            titleColor={phaseHeaderText}
                            collapsed={collapsedSections.phase3}
                            onToggle={() => this.toggleSection('phase3')}
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
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aditivos & Botânicos</h4>
                                    </div>
                                    <div className="table-wrap">
                                        {this.renderTableHeader()}
                                        {(recipe.traceAdditives || []).map(a => this.renderIngredientRow(a, 'traceAdditives', ingredientMetaById, ['Aditivos Traço']))}
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Óleos de Superfat</h4>
                                    </div>
                                    <div className="table-wrap">
                                        {this.renderTableHeader()}
                                        {(recipe.superfatOils || []).map(o => this.renderIngredientRow(o, 'superfatOils', ingredientMetaById, ['Superfat']))}
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>Aromas & O.E.</h4>
                                    </div>
                                    <div className="table-wrap">
                                        {this.renderTableHeader()}
                                        {(recipe.essentialOils || []).map(o => this.renderIngredientRow(o, 'essentialOils', ingredientMetaById, ['Óleos Essenciais']))}
                                    </div>
                                </div>
                            </div>
                        </CollapsibleCard>
                    </div>

                    <aside className="results-sidebar">
                        <CollapsibleCard
                            title="Assistente IA (sem questionário)"
                            color={phaseHeaderColor}
                            titleColor={phaseHeaderText}
                            collapsed={collapsedSections.aiChat}
                            onToggle={() => this.toggleSection('aiChat')}
                            actions={<Bot size={16} />}
                        >
                            <div className="calculator-ai-chat-box">
                                {aiConversation.length > 0 ? (
                                    aiConversation.map((msg, index) => (
                                        <div key={'ai-msg-' + index} className={'calculator-ai-message ' + (msg.role === 'assistant' ? 'is-assistant' : 'is-user')}>
                                            <div className="calculator-ai-meta">
                                                {msg.role === 'assistant' ? 'IA' : 'Tu'} · {new Date(msg.timestamp).toLocaleString()}
                                            </div>
                                            <div>{msg.message}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="calculator-ai-empty">
                                        Ainda sem conversa. Pede uma fórmula nova ou ajustes na fórmula atual.
                                    </div>
                                )}
                            </div>

                            {this.state.aiError && (
                                <div className="calculator-ai-error">{this.state.aiError}</div>
                            )}

                            <textarea
                                rows={4}
                                placeholder="Ex.: cria um sabonete calmante para pele sensível, mantendo o foco em suavidade e espuma cremosa."
                                value={this.state.aiMessageDraft}
                                onChange={(e) => this.setState({ aiMessageDraft: e.target.value })}
                                style={{ width: '100%', marginTop: '0.75rem', fontFamily: 'inherit' }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                                <button
                                    className="btn btn-secondary"
                                    disabled={!this.state.aiMessageDraft.trim() || this.state.isGeneratingAIRecipe || !aiConfigured}
                                    onClick={() => this.handleGenerateRecipeAIFromCalculator()}
                                >
                                    <Sparkles size={14} /> {this.state.isGeneratingAIRecipe ? 'A gerar...' : 'Enviar para IA'}
                                </button>
                                {!aiConfigured && (
                                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                                        Configura a IA nas Definições para ativar este chat.
                                    </span>
                                )}
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                                    Se já existirem ingredientes na fórmula, eles são enviados como contexto para a IA.
                                </span>
                            </div>
                        </CollapsibleCard>

                        <CollapsibleCard
                            title="Resumo da Fórmula"
                            color={phaseHeaderColor}
                            titleColor={phaseHeaderText}
                            collapsed={collapsedSections.formulaSummary}
                            onToggle={() => this.toggleSection('formulaSummary')}
                            actions={<Beaker size={18} />}
                            className="results-panel"
                            bodyPadding="0"
                        >
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
                                    <span>Durabilidade (boas condições)</span>
                                    <span className="result-value">~ {goodConditionDays} dias ({(goodConditionDays / 30).toFixed(1)} meses, até {goodConditionEndDate.toLocaleDateString()})</span>
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
                                        {this.renderProgressBar('Condicionamento', qualityProgress.conditioning)}
                                        {this.renderProgressBar('Limpeza', qualityProgress.cleansing)}
                                        {this.renderProgressBar('Bolhas', qualityProgress.bubbles)}
                                        {this.renderProgressBar('Persistência', qualityProgress.persistence)}
                                        {this.renderProgressBar('Dureza', qualityProgress.hardness)}
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
                                            const value = results.fattyAcids[key as keyof typeof results.fattyAcids];
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
                        </CollapsibleCard>
                    </aside>
                </div>
            </div>
        );
    }
}
