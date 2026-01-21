import { BaseListPage, BaseListPageState } from '../../../core/BaseListPage';
import { StatCard } from '../../../templates/StatsHeader';
import { Recipe } from '../../../../shared/types/Recipe';
import { RecipeService } from '../../../../orchestrator/services/RecipeService';
import { ClientService } from '../../../../orchestrator/services/ClientService';
import { Client } from '../../../../shared/types/Client';
import { Trash2, Calculator, Edit2, ExternalLink, Save, Plus } from 'lucide-react';
import { Modal } from '../../../components/Modal';

export interface SavedRecipesProps {
    onNavigate: (page: string, params?: any) => void;
}

interface SavedRecipesState extends BaseListPageState<Recipe> {
    isModalOpen: boolean;
    editingRecipe: Recipe | null;
    clients: Client[];
}

export class SavedRecipesPage extends BaseListPage<Recipe, SavedRecipesState, SavedRecipesProps> {
    constructor(props: SavedRecipesProps) {
        super(props);
        this.state = {
            ...this.getInitialState(),
            isModalOpen: false,
            editingRecipe: null,
            clients: []
        } as SavedRecipesState;
    }

    componentDidMount() {
        this.loadRecipes();
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

    private openEditModal(recipe: Recipe) {
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
            RecipeService.getInstance().save(editingRecipe);
            this.closeEditModal();
            this.loadRecipes();
        }
    }

    renderStats() {
        const total = this.state.data.length;
        const withEssentialOils = this.state.data.filter(r => (r.essentialOils || []).length > 0).length;
        const withNotes = this.state.data.filter(r => (r.notes || '').trim().length > 0).length;
        const avgSuperfat = total > 0
            ? this.state.data.reduce((sum, recipe) => sum + (recipe.superfat || 0), 0) / total
            : 0;

        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                <StatCard label="Receitas Guardadas" value={total} color="var(--color-primary)" />
                <StatCard label="Superfat medio" value={`${avgSuperfat.toFixed(1)}%`} color="var(--color-accent)" />
                <StatCard label="Com OEs" value={withEssentialOils} color="#3B82F6" />
                <StatCard label="Com notas" value={withNotes} color="#F59E0B" />
            </div>
        );
    }

    renderFilters() {
        return (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                <div style={{ flex: 1 }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
        const filteredData = this.state.data.filter(r =>
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
                                <td style={{ padding: '1rem 1.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)' }}>RE{recipe.code.padStart(4, '0')}</td>
                                <td style={{ padding: '1rem 1.5rem', fontSize: '0.9rem', fontWeight: 500 }}>{recipe.name || 'Sem nome'}</td>
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

        const updateField = (field: keyof Recipe, value: any) => {
            this.setState({ editingRecipe: { ...editingRecipe, [field]: value } });
        };

        return (
            <Modal
                isOpen={this.state.isModalOpen}
                onClose={() => this.closeEditModal()}
                title={`Receita: RE${editingRecipe.code}`}
                footer={
                    <>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => this.closeEditModal()}>Cancelar</button>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', background: '#F9FAFB', padding: '1rem', borderRadius: '0.5rem' }}>
                        <div className="form-group">
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Álcali</label>
                            <span style={{ fontWeight: 700 }}>{editingRecipe.alkali}</span>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div>
                            {this.renderIngredientList("Fase 1: Gorduras", editingRecipe.fats, 'fats')}
                            {this.renderIngredientList("Fase 2: Líquidos", editingRecipe.liquids, 'liquids')}
                            {this.renderIngredientList("Fase 2: Aditivos Lixívia", editingRecipe.lyeAdditives, 'lyeAdditives')}
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
