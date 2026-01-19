
import { BaseListPage, BaseListPageState } from '../../core/BaseListPage';
import { StatCard } from '../../templates/StatsHeader';
import { Ingredient } from '../../../shared/types/Ingredient';
import { IngredientService } from '../../../orchestrator/services/IngredientService';
import { Upload, Download, Plus, Trash2, Edit } from 'lucide-react';
import { IngredientFormModal } from '../../components/IngredientFormModal';
import { INGREDIENT_CATEGORIES } from '../../../shared/constants/Categories';

interface IngredientsPageState extends BaseListPageState<Ingredient> {
    editingItem: Ingredient | null;
    isModalOpen: boolean;
}

export class IngredientsPage extends BaseListPage<Ingredient, IngredientsPageState> {

    // @ts-ignore - overriding state type
    state: IngredientsPageState = {
        ...this.getInitialState(),
        editingItem: null,
        isModalOpen: false
    };

    async componentDidMount() {
        await IngredientService.getInstance().loadInitialData();
        this.setState({
            data: IngredientService.getInstance().getAll()
        });
    }

    // Override to handle filtering logic locally
    getFilteredData() {
        const { data, searchQuery, filter } = this.state;
        return data.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.inci.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesCategory = filter === 'all' || item.category === filter;

            return matchesSearch && matchesCategory;
        });
    }

    handleDelete(id: string) {
        if (confirm('Tem a certeza que deseja eliminar este ingrediente?')) {
            IngredientService.getInstance().deleteIngredient(id);
            this.setState({
                data: IngredientService.getInstance().getAll()
            });
        }
    }

    handleEditClick(item: Ingredient) {
        this.setState({ editingItem: item, isModalOpen: true });
    }

    handleAddClick() {
        this.setState({ editingItem: null, isModalOpen: true });
    }

    handleSaveModal(ingredient: Ingredient) {
        if (this.state.editingItem) {
            IngredientService.getInstance().updateIngredient(ingredient);
        } else {
            IngredientService.getInstance().addIngredient(ingredient);
        }

        this.setState({
            data: IngredientService.getInstance().getAll(),
            isModalOpen: false,
            editingItem: null
        });
    }

    renderStats() {
        const total = this.state.data.length;

        // FASE 1: Gorduras para Saponificar
        const countPhase1 = this.state.data.filter(i =>
            ['Óleos Base'].includes(i.category)
        ).length;

        // FASE 2: Composição da Lixívia
        const countPhase2 = this.state.data.filter(i =>
            ['Líquidos Lixívia', 'Aditivos Lixívia', 'Aditivos Funcionais'].includes(i.category)
        ).length;

        // FASE 3: No Traço
        const countPhase3 = this.state.data.filter(i =>
            ['Aditivos Traço', 'Óleos Essenciais', 'Superfat'].includes(i.category)
        ).length;

        return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                <StatCard label="Total Ingredientes" value={total} color="var(--color-primary)" />
                <StatCard label="Fase 1: Saponificação" subtext="Óleos & Gorduras" value={countPhase1} color="var(--color-accent)" />
                <StatCard label="Fase 2: Lixívia" subtext="Líquidos & Funcionais" value={countPhase2} />
                <StatCard label="Fase 3: Traço" subtext="Superfat, Traço & Essenciais" value={countPhase3} />
            </div>
        );
    }

    renderEditModal() {
        return (
            <IngredientFormModal
                isOpen={this.state.isModalOpen}
                onClose={() => this.setState({ isModalOpen: false, editingItem: null })}
                initialData={this.state.editingItem}
                onSave={(data) => this.handleSaveModal(data)}
            />
        );
    }

    renderFilters() {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                <select
                    value={this.state.filter}
                    onChange={(e) => this.setState({ filter: e.target.value })}
                    style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #e5e7eb',
                        fontSize: '0.8rem',
                        minWidth: '180px',
                        height: '38px'
                    }}
                >
                    <option value="all">Todas as Categorias</option>
                    {INGREDIENT_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>

                <div style={{ flex: 1 }}></div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => alert('Exportar CSV: Funcionalidade em breve')}>
                        <Download size={14} /> Exportar
                    </button>
                    <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => alert('Importar: Funcionalidade em breve')}>
                        <Upload size={14} /> Importar
                    </button>
                    <button className="btn btn-primary" style={{ borderRadius: '50px', padding: '0.5rem 1.5rem', fontWeight: 700 }} onClick={() => this.handleAddClick()}>
                        <Plus size={16} /> Adicionar
                    </button>
                </div>
            </div>
        );
    }

    renderTable() {
        const filteredData = this.getFilteredData();

        return (
            <>
                {this.renderEditModal()}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                            <th style={{ padding: '1rem' }}>#</th>
                            <th style={{ padding: '1rem' }}>Nome</th>
                            <th style={{ padding: '1rem' }}>INCI</th>
                            <th style={{ padding: '1rem' }}>Categoria</th>
                            <th style={{ padding: '1rem' }}>SAP NaOH</th>
                            <th style={{ padding: '1rem' }}>SAP KOH</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                        <p>Nenhum ingrediente encontrado com os critérios actuais.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredData.map((ing, index) => (
                                <tr key={ing.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '1rem', color: '#9CA3AF', fontSize: '0.8rem' }}>{index + 1}</td>
                                    <td style={{ padding: '1rem', fontWeight: 500 }}>{ing.name}</td>
                                    <td style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>{ing.inci}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <span style={{
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '1rem',
                                            backgroundColor: '#F3F4F6',
                                            fontSize: '0.75rem',
                                            color: '#4B5563'
                                        }}>
                                            {ing.category}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem' }}>{ing.sapNaOH}</td>
                                    <td style={{ padding: '1rem' }}>{ing.sapKOH}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                            <button
                                                className="btn btn-sm"
                                                style={{ color: 'var(--color-primary)', padding: '0.5rem' }}
                                                title="Editar"
                                                onClick={() => this.handleEditClick(ing)}
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button
                                                className="btn btn-sm"
                                                style={{ color: 'var(--color-error)', padding: '0.5rem' }}
                                                title="Eliminar"
                                                onClick={() => this.handleDelete(ing.id)}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </>
        );
    }
}
