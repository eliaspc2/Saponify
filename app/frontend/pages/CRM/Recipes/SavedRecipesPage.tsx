import type { ChangeEvent } from 'react';
import { BaseListPage, BaseListPageState } from '../../../core/BaseListPage';
import type { BasePageProps } from '../../../core/BasePage';
import { StatCard } from '../../../templates/StatsHeader';
import { Recipe } from '../../../../shared/types/Recipe';
import { RecipeService } from '../../../../orchestrator/services/RecipeService';
import { RecipeDomainService } from '../../../../orchestrator/services/RecipeDomainService';
import { ClientService } from '../../../../orchestrator/services/ClientService';
import { Client } from '../../../../shared/types/Client';
import { Trash2, Calculator, Edit2, ExternalLink, Save, Plus, FileText, Upload } from 'lucide-react';
import { Modal } from '../../../components/Modal';
import { CalculatorService } from '../../../../orchestrator/services/CalculatorService';
import { IngredientService } from '../../../../orchestrator/services/IngredientService';
import { formatRecipeCodeForFile, formatRecipeReference, formatRecipeReferenceOrFallback } from '../../../../shared/utils/recipeFormat';

export interface SavedRecipesProps extends BasePageProps {
    onNavigate: (page: string, params?: any) => void;
}

interface SavedRecipesState extends BaseListPageState<Recipe> {
    isModalOpen: boolean;
    editingRecipe: Recipe | null;
    clients: Client[];
    statsFilter: 'all' | 'withOes' | 'withNotes';
}

export class SavedRecipesPage extends BaseListPage<Recipe, SavedRecipesState, SavedRecipesProps> {
    private importInputRef: HTMLInputElement | null = null;
    constructor(props: SavedRecipesProps) {
        super(props);
        this.state = {
            ...this.getInitialState(),
            isModalOpen: false,
            editingRecipe: null,
            clients: [],
            statsFilter: 'all'
        } as SavedRecipesState;
    }

    componentDidMount() {
        this.loadRecipes();
        IngredientService.getInstance().loadInitialData();
    }

    private loadRecipes() {
        const clients = ClientService.getInstance().getAll();
        this.setState({
            data: RecipeService.getInstance().getAll(),
            filteredData: RecipeService.getInstance().getAll(),
            clients: clients
        } as any);
    }

    handleDelete(id: string) {
        if (confirm('Tem a certeza que deseja eliminar esta receita?')) {
            RecipeService.getInstance().delete(id);
            this.loadRecipes();
        }
    }

    private async openEditModal(recipe: Recipe) {
        const ingredientService = IngredientService.getInstance();
        if (ingredientService.getAll().length === 0) {
            await ingredientService.loadInitialData();
        }
        this.setState({
            isModalOpen: true,
            editingRecipe: { ...recipe }
        });
    }

    private closeEditModal() {
        this.setState({
            isModalOpen: false,
            editingRecipe: null
        });
    }

    private async handleSaveStatic() {
        const { editingRecipe } = this.state;
        if (editingRecipe) {
            RecipeDomainService.getInstance().save(editingRecipe);
            this.closeEditModal();
            this.loadRecipes();
        }
    }

    private async handleExportMarkdown(recipe: Recipe) {
        const ingredientService = IngredientService.getInstance();
        if (ingredientService.getAll().length === 0) {
            await ingredientService.loadInitialData();
        }
        const ingredients = ingredientService.getAll();
        const results = CalculatorService.calculate(recipe, ingredients);

        let md = `# Receita: ${recipe.name || 'Sem Nome'}\n`;
        const recipeRef = formatRecipeReference(recipe.code);
        if (recipeRef) {
            md += `Codigo: ${recipeRef} | Data: ${recipe.date}\n\n`;
        } else {
            md += `Data: ${recipe.date}\n\n`;
        }
        md += `## Configurações\n`;
        md += `- Álcali: ${recipe.alkali}\n`;
        md += `- Superfat: ${recipe.superfat}%\n`;
        md += `- Concentração de Água: ${recipe.waterConcentration}%\n`;
        md += `- Pureza do Álcali: ${recipe.alkaliPurity ?? 100}%\n\n`;

        md += `## Composição\n`;
        md += `### Fase 1: Gorduras\n`;
        recipe.fats.forEach(f => {
            const pct = results.totalFats > 0 ? ((f.amount / results.totalFats) * 100).toFixed(1) : '0.0';
            md += `- ${f.name}: ${f.amount} g (${pct}%)\n`;
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
        md += `- Lixívia (${recipe.alkali}): ${results.alkaliAmount.toFixed(2)} g\n`;
        md += `- Água: ${results.waterAmount.toFixed(1)} g\n`;
        md += `- Peso Total Final: ${results.totalWeight.toFixed(1)} g\n\n`;

        md += `## Qualidade (valores crus)\n`;
        md += `- Condicionamento: ${results.properties.conditioning.toFixed(0)}\n`;
        md += `- Limpeza: ${results.properties.cleansing.toFixed(0)}\n`;
        md += `- Bolhas: ${results.properties.bubbles.toFixed(0)}\n`;
        md += `- Persistência: ${results.properties.persistence.toFixed(0)}\n`;
        md += `- Dureza: ${results.properties.hardness.toFixed(0)}\n\n`;

        md += `## INCI\n`;
        md += `${results.inciList.join(', ')}\n`;

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

    private normalizeImportedRecipe(recipe: Recipe): Recipe {
        const id = recipe.id || `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const code = recipe.code ?? '';
        const date = recipe.date || new Date().toISOString().split('T')[0];
        return { ...recipe, id, code, date };
    }

    private async handleImportRecipeChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const recipes = Array.isArray(parsed)
                ? parsed
                : (parsed?.recipes || parsed?.recipe ? (parsed.recipes || [parsed.recipe]) : [parsed]);
            const validRecipes = recipes.filter((recipe: Recipe) => recipe && typeof recipe === 'object');
            if (validRecipes.length === 0) {
                alert('Ficheiro invalido para receita.');
                return;
            }
            validRecipes.forEach((recipe: Recipe) => {
                const normalized = this.normalizeImportedRecipe(recipe);
                RecipeDomainService.getInstance().save(normalized);
            });
            this.loadRecipes();
        } catch (error) {
            alert('Erro ao importar receita.');
        } finally {
            event.target.value = '';
        }
    }

    private handleImportRecipeClick() {
        this.importInputRef?.click();
    }

    renderStats() {
        const total = this.state.data.length;
        const withEssentialOils = this.state.data.filter(r => (r.essentialOils || []).length > 0).length;
        const withNotes = this.state.data.filter(r => (r.notes || '').trim().length > 0).length;
        const avgSuperfat = total > 0
            ? this.state.data.reduce((sum, recipe) => sum + (recipe.superfat || 0), 0) / total
            : 0;
        const filterLabel = this.state.statsFilter === 'withOes'
            ? 'Com Óleos Essenciais'
            : this.state.statsFilter === 'withNotes'
                ? 'Com notas'
                : null;

        return (
            <>
                <div className="stats-grid">
                    <StatCard
                        label="Receitas Guardadas"
                        value={total}
                        color="var(--color-primary)"
                        onClick={() => this.setState({ statsFilter: 'all' })}
                    />
                    <StatCard label="Superfat medio" value={`${avgSuperfat.toFixed(1)}%`} color="var(--color-accent)" />
                    <StatCard
                        label="Com OEs"
                        value={withEssentialOils}
                        color="#3B82F6"
                        onClick={() => this.setState({ statsFilter: this.state.statsFilter === 'withOes' ? 'all' : 'withOes' })}
                    />
                    <StatCard
                        label="Com notas"
                        value={withNotes}
                        color="#F59E0B"
                        onClick={() => this.setState({ statsFilter: this.state.statsFilter === 'withNotes' ? 'all' : 'withNotes' })}
                    />
                </div>
                {filterLabel && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', padding: '0.25rem 0.6rem', borderRadius: '999px', background: '#F3F4F6' }}>
                            Filtro ativo: {filterLabel}
                        </span>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => this.setState({ statsFilter: 'all' })}
                            style={{ padding: '0.3rem 0.7rem' }}
                        >
                            Limpar filtro
                        </button>
                    </div>
                )}
            </>
        );
    }

    renderFilters() {
        return (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                <div style={{ flex: 1 }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }}
                        onClick={() => this.handleImportRecipeClick()}
                    >
                        <Upload size={14} /> Importar
                    </button>
                    <input
                        ref={(el) => { this.importInputRef = el; }}
                        type="file"
                        accept=".json,application/json"
                        style={{ display: 'none' }}
                        onChange={(event) => this.handleImportRecipeChange(event)}
                    />
                    <button
                        className="btn btn-primary"
                        style={{ borderRadius: '50px', padding: '0.5rem 1.5rem', fontWeight: 700 }}
                        onClick={() => this.props.onNavigate('calculator')}
                    >
                        <Plus size={16} /> Adicionar Receita
                    </button>
                </div>
            </div>
        );
    }

    renderTable() {
        const term = this.state.searchQuery.toLowerCase();
        let filteredData = this.state.data;
        const { statsFilter } = this.state;

        if (statsFilter === 'withOes') {
            filteredData = filteredData.filter(r => (r.essentialOils || []).length > 0);
        } else if (statsFilter === 'withNotes') {
            filteredData = filteredData.filter(r => (r.notes || '').trim().length > 0);
        }

        filteredData = filteredData.filter(r =>
            r.name.toLowerCase().includes(term) || r.code.includes(term)
        );

        if (filteredData.length === 0) {
            return (
                <div className="card" style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    <div style={{ marginBottom: '1rem', color: 'var(--color-text-light)' }}>
                        <Calculator size={48} strokeWidth={1.5} />
                    </div>
                    <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>Nenhuma receita encontrada.</p>
                </div>
            );
        }

        return (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Código</th>
                            <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Nome da Receita</th>
                            <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Data</th>
                            <th style={{ textAlign: 'right', padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.map(recipe => (
                            <tr key={recipe.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td
                                    style={{ padding: '1rem 1.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)', cursor: 'pointer' }}
                                    onClick={() => this.openEditModal(recipe)}
                                >
                                    {formatRecipeReferenceOrFallback(recipe.code, '-')}
                                </td>
                                <td
                                    style={{ padding: '1rem 1.5rem', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer' }}
                                    onClick={() => this.openEditModal(recipe)}
                                >
                                    {recipe.name || 'Sem nome'}
                                </td>
                                <td style={{ padding: '1rem 1.5rem', fontSize: '0.9rem', color: '#6B7280' }}>{new Date(recipe.date).toLocaleDateString()}</td>
                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button
                                            title="Editar Dados"
                                            className="btn btn-secondary"
                                            onClick={() => this.openEditModal(recipe)}
                                            style={{ padding: '0.4rem', minWidth: 'auto' }}
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            title="Abrir na Calculadora"
                                            className="btn btn-secondary"
                                            onClick={() => this.props.onNavigate('calculator', { recipeId: recipe.id })}
                                            style={{ padding: '0.4rem', minWidth: 'auto', color: 'var(--color-primary)' }}
                                        >
                                            <ExternalLink size={16} />
                                        </button>
                                        <button
                                            title="Remover"
                                            className="btn btn-secondary"
                                            onClick={() => this.handleDelete(recipe.id)}
                                            style={{ padding: '0.4rem', minWidth: 'auto', color: '#EF4444' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            </div>
        );
    }

    private renderIngredientList(title: string, items: any[], type: keyof Recipe) {
        if (!items || items.length === 0) return null;
        return (
            <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.75rem', borderBottom: '1px solid #eee', paddingBottom: '0.25rem' }}>{title}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', gap: '1rem' }}>
                            <span style={{ flex: 1 }}>{item.name}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <input
                                    type="number"
                                    className="form-control"
                                    style={{ width: '80px', textAlign: 'right', padding: '0.2rem 0.4rem' }}
                                    value={item.amount}
                                    onChange={(e) => {
                                        const newItems = [...items];
                                        newItems[idx] = { ...item, amount: parseFloat(e.target.value) || 0 };
                                        this.setState({ editingRecipe: { ...this.state.editingRecipe!, [type]: newItems } });
                                    }}
                                />
                                <span style={{ color: '#9CA3AF' }}>g</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    private renderEditModal() {
        const { editingRecipe } = this.state;
        if (!editingRecipe) return null;
        const ingredients = IngredientService.getInstance().getAll();
        const results = CalculatorService.calculate(editingRecipe, ingredients);
        const alkaliLabel = editingRecipe.alkali === 'NaOH' ? 'Soda Cáustica (NaOH)' : 'Potassa (KOH)';

        const updateField = (field: keyof Recipe, value: any) => {
            this.setState({ editingRecipe: { ...editingRecipe, [field]: value } });
        };

        return (
            <Modal
                isOpen={this.state.isModalOpen}
                onClose={() => this.closeEditModal()}
                title={`Receita: ${formatRecipeReferenceOrFallback(editingRecipe.code, 'Sem referencia')}`}
                footer={
                    <>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => this.closeEditModal()}>Cancelar</button>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => this.handleExportMarkdown(editingRecipe)}>
                            <FileText size={16} /> Exportar Markdown
                        </button>
                        <button className="btn btn-accent" style={{ flex: 1 }} onClick={() => this.props.onNavigate('calculator', { recipeId: editingRecipe.id })}>
                            <ExternalLink size={16} /> Abrir na Calculadora
                        </button>
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => this.handleSaveStatic()}>
                            <Save size={16} /> Guardar Alterações
                        </button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="modal-grid-3" style={{ gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label" style={{ fontWeight: 700 }}>Nome da Receita</label>
                            <input
                                type="text"
                                className="form-control"
                                value={editingRecipe.name}
                                onChange={(e) => updateField('name', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" style={{ fontWeight: 700 }}>Cliente</label>
                            <select
                                className="form-control"
                                value={editingRecipe.clientId || ''}
                                onChange={(e) => updateField('clientId', e.target.value)}
                            >
                                <option value="">Sem cliente associado</option>
                                {this.state.clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label" style={{ fontWeight: 700 }}>Data</label>
                            <input
                                type="date"
                                className="form-control"
                                value={editingRecipe.date}
                                onChange={(e) => updateField('date', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="modal-grid-3" style={{ gap: '1rem', background: '#F9FAFB', padding: '1rem', borderRadius: '0.5rem' }}>
                        <div className="form-group">
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Álcali</label>
                            <select
                                className="form-control"
                                value={editingRecipe.alkali}
                                onChange={(e) => updateField('alkali', e.target.value)}
                                style={{ fontWeight: 700 }}
                            >
                                <option value="NaOH">NaOH</option>
                                <option value="KOH">KOH</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Superfat</label>
                            <span style={{ fontWeight: 700 }}>{editingRecipe.superfat}%</span>
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Conc. Água</label>
                            <span style={{ fontWeight: 700 }}>{editingRecipe.waterConcentration}%</span>
                        </div>
                    </div>

                    <div className="modal-grid-2" style={{ gap: '2rem' }}>
                        <div>
                            {this.renderIngredientList("Fase 1: Gorduras", editingRecipe.fats, 'fats')}
                            {this.renderIngredientList("Fase 2: Líquidos", editingRecipe.liquids, 'liquids')}
                            {this.renderIngredientList("Fase 2: Aditivos Funcionais", editingRecipe.functionalAdditives, 'functionalAdditives')}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.75rem', borderBottom: '1px solid #eee', paddingBottom: '0.25rem' }}>
                                    Fase 2: Aditivos Lixívia
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', gap: '1rem' }}>
                                        <span style={{ flex: 1 }}>{alkaliLabel}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <input
                                                type="number"
                                                className="form-control"
                                                style={{ width: '80px', textAlign: 'right', padding: '0.2rem 0.4rem' }}
                                                value={results.alkaliAmount.toFixed(2)}
                                                readOnly
                                            />
                                            <span style={{ color: '#9CA3AF' }}>g</span>
                                        </div>
                                    </div>
                                    {editingRecipe.lyeAdditives.map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', gap: '1rem' }}>
                                            <span style={{ flex: 1 }}>{item.name}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    style={{ width: '80px', textAlign: 'right', padding: '0.2rem 0.4rem' }}
                                                    value={item.amount}
                                                    onChange={(e) => {
                                                        const newItems = [...editingRecipe.lyeAdditives];
                                                        newItems[idx] = { ...item, amount: parseFloat(e.target.value) || 0 };
                                                        this.setState({ editingRecipe: { ...editingRecipe, lyeAdditives: newItems } });
                                                    }}
                                                />
                                                <span style={{ color: '#9CA3AF' }}>g</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div>
                            {this.renderIngredientList("Fase 3: Aditivos Traço", editingRecipe.traceAdditives, 'traceAdditives')}
                            {this.renderIngredientList("Fase 3: Superfat Oils", editingRecipe.superfatOils, 'superfatOils')}
                            {this.renderIngredientList("Fase 3: Óleos Essenciais", editingRecipe.essentialOils, 'essentialOils')}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 700 }}>Notas & Observações</label>
                        <textarea
                            className="form-control"
                            rows={4}
                            value={editingRecipe.notes || ''}
                            onChange={(e) => updateField('notes', e.target.value)}
                        />
                    </div>
                </div>
            </Modal>
        );
    }

    render() {
        return (
            <>
                {super.render()}
                {this.state.isModalOpen && this.renderEditModal()}
            </>
        );
    }
}
