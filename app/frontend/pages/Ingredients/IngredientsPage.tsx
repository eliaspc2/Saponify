
import type { ChangeEvent } from 'react';
import { BaseListPage, BaseListPageState } from '../../core/BaseListPage';
import { StatCard } from '../../templates/StatsHeader';
import { Ingredient } from '../../../shared/types/Ingredient';
import { IngredientService } from '../../../orchestrator/services/IngredientService';
import { Upload, Download, Plus, Trash2, Edit } from 'lucide-react';
import { IngredientFormModal } from '../../components/IngredientFormModal';
import { INGREDIENT_CATEGORIES, formatCategoryLabel } from '../../../shared/constants/Categories';

interface IngredientsPageState extends BaseListPageState<Ingredient> {
    editingItem: Ingredient | null;
    isModalOpen: boolean;
}

export class IngredientsPage extends BaseListPage<Ingredient, IngredientsPageState> {
    private importCsvInputRef: HTMLInputElement | null = null;
    private importJsonInputRef: HTMLInputElement | null = null;

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

    handleExportCSV() {
        const csv = IngredientService.getInstance().exportToCSV();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ingredientes.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async handleImportCsvChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        const csvText = await file.text();
        IngredientService.getInstance().importFromCSV(csvText);
        this.setState({
            data: IngredientService.getInstance().getAll()
        });
        event.target.value = '';
    }

    handleImportCsvClick() {
        this.importCsvInputRef?.click();
    }

    private downloadJsonFile(filename: string, data: any) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    handleExportIngredient(ingredient: Ingredient) {
        const payload = {
            version: '1.0.0',
            type: 'ingredient',
            exportedAt: new Date().toISOString(),
            ingredient
        };
        const safeName = (ingredient.name || 'ingrediente').replace(/\s+/g, '_');
        this.downloadJsonFile(`ingrediente_${safeName}.json`, payload);
    }

    async handleImportJsonChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const ingredient = parsed?.ingredient ?? parsed;
            if (!ingredient || !ingredient.name) {
                alert('Ficheiro invalido para ingrediente.');
                return;
            }
            IngredientService.getInstance().upsertIngredient(ingredient);
            this.setState({
                data: IngredientService.getInstance().getAll()
            });
        } catch (error) {
            alert('Erro ao importar ingrediente.');
        } finally {
            event.target.value = '';
        }
    }

    handleImportJsonClick() {
        this.importJsonInputRef?.click();
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
                        <option key={cat} value={cat}>{formatCategoryLabel(cat)}</option>
                    ))}
                </select>

                <div style={{ flex: 1 }}></div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => this.handleExportCSV()}>
                        <Download size={14} /> Exportar CSV
                    </button>
                    <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => this.handleImportCsvClick()}>
                        <Upload size={14} /> Importar CSV
                    </button>
                    <input
                        ref={(el) => { this.importCsvInputRef = el; }}
                        type="file"
                        accept=".csv,text/csv"
                        style={{ display: 'none' }}
                        onChange={(event) => this.handleImportCsvChange(event)}
                    />
                    <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => this.handleImportJsonClick()}>
                        <Upload size={14} /> Importar Item
                    </button>
                    <input
                        ref={(el) => { this.importJsonInputRef = el; }}
                        type="file"
                        accept=".json,application/json"
                        style={{ display: 'none' }}
                        onChange={(event) => this.handleImportJsonChange(event)}
                    />
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
                <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>#</th>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Nome</th>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>INCI</th>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Categoria</th>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>SAP NaOH</th>
                                <th style={{ textAlign: 'left', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>SAP KOH</th>
                                <th style={{ textAlign: 'right', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Ações</th>
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
                                    <tr key={ing.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '1rem 1.5rem', color: '#9CA3AF', fontSize: '0.8rem' }}>{index + 1}</td>
                                        <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>{ing.name}</td>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>{ing.inci}</td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '1rem',
                                                backgroundColor: '#F3F4F6',
                                                fontSize: '0.75rem',
                                                color: '#4B5563'
                                            }}>
                                            {formatCategoryLabel(ing.category)}
                                        </span>
                                    </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>{ing.sapNaOH}</td>
                                        <td style={{ padding: '1rem 1.5rem' }}>{ing.sapKOH}</td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                            <button
                                                className="btn btn-sm"
                                                style={{ color: 'var(--color-primary)', padding: '0.5rem' }}
                                                title="Exportar"
                                                onClick={() => this.handleExportIngredient(ing)}
                                            >
                                                <Download size={16} />
                                            </button>
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
                </div>
            </>
        );
    }
}
