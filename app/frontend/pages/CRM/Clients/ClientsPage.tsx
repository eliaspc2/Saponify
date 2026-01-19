import { BaseListPage, BaseListPageState } from '../../../core/BaseListPage';
import { StatCard } from '../../../templates/StatsHeader';
import { Client } from '../../../../shared/types/Client';
import { ClientService } from '../../../../orchestrator/services/ClientService';
import { Plus, Trash2, Edit2, Check, User, AlertTriangle, Beaker, Clock, FileText } from 'lucide-react';
import { Modal } from '../../../components/Modal';
import { RecipeService } from '../../../../orchestrator/services/RecipeService';
import { QuestionnaireService } from '../../../../orchestrator/services/QuestionnaireService';
import { Recipe } from '../../../../shared/types/Recipe';
import { Questionnaire } from '../../../../shared/types/Questionnaire';
import { ClientDetailsPage } from './ClientDetailsPage';

interface ClientsPageState extends BaseListPageState<Client> {
    isModalOpen: boolean;
    editingClient: Client | null;
    stats: {
        activeBatches: number;
        readyThisWeek: number;
        readyRecipeCodes: string[];
        withoutRecipe: number;
        withoutQuestionnaire: number;
    };
    allRecipes: Recipe[];
    allQuestionnaires: Questionnaire[];
    selectedClientId: string | null;
    isDetailsOpen: boolean;
}

export class ClientsPage extends BaseListPage<Client, ClientsPageState, { onNavigate: (page: string, params?: any) => void }> {
    constructor(props: any) {
        super(props);
        this.state = {
            ...this.getInitialState(),
            data: [],
            isModalOpen: false,
            editingClient: null,
            stats: {
                activeBatches: 0,
                readyThisWeek: 0,
                readyRecipeCodes: [],
                withoutRecipe: 0,
                withoutQuestionnaire: 0
            },
            allRecipes: [],
            allQuestionnaires: [],
            selectedClientId: null,
            isDetailsOpen: false
        } as ClientsPageState;
    }

    async componentDidMount() {
        this.loadClients();
    }

    private async loadClients() {
        const clients = ClientService.getInstance().getAll();
        const activities = ClientService.getInstance().getAllActivities();
        const recipes = RecipeService.getInstance().getAll();
        const questionnaires = await QuestionnaireService.getQuestionnaires();

        const now = new Date();
        const endOfWeek = new Date();
        endOfWeek.setDate(now.getDate() + (7 - now.getDay()));

        const activeBatches = activities.filter(a =>
            a.type === 'production' &&
            a.details &&
            new Date(a.details.physicalReadyDate) > now
        );

        const readyThisWeek = activeBatches.filter(a =>
            new Date(a.details!.physicalReadyDate) <= endOfWeek
        );

        const readyRecipeCodes = readyThisWeek.map(a => `RE${a.details!.recipeCode.padStart(4, '0')}`);

        const withoutRecipe = clients.filter(c => !recipes.some(r => r.clientId === c.id)).length;
        const withoutQuestionnaire = clients.filter(c => !questionnaires.some(q => q.clientId === c.id)).length;

        this.setState({
            data: clients,
            allRecipes: recipes,
            allQuestionnaires: questionnaires,
            stats: {
                activeBatches: activeBatches.length,
                readyThisWeek: readyThisWeek.length,
                readyRecipeCodes,
                withoutRecipe,
                withoutQuestionnaire
            }
        } as any);
    }

    private openModal(client: Client | null = null) {
        if (client) {
            this.setState({ isModalOpen: true, editingClient: { ...client } });
        } else {
            this.setState({
                isModalOpen: true,
                editingClient: {
                    id: Math.random().toString(36).substr(2, 9),
                    name: '',
                    email: '',
                    phone: '',
                    address: '',
                    consentCureProcess: false,
                    consentDataTruth: false,
                    consentRGPD: false,
                    consentFutureContact: false,
                    consentAdvertising: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            });
        }
    }

    private closeModal() {
        this.setState({ isModalOpen: false, editingClient: null });
    }

    private handleSave() {
        const { editingClient } = this.state;
        if (!editingClient) return;

        if (!editingClient.name || !editingClient.email || !editingClient.phone || !editingClient.address) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        if (!editingClient.consentCureProcess || !editingClient.consentDataTruth || !editingClient.consentRGPD) {
            alert('É necessário aceitar todas as confirmações obrigatórias.');
            return;
        }

        ClientService.getInstance().save(editingClient);
        this.loadClients();
        this.closeModal();
    }

    private handleDelete(id: string) {
        if (confirm('Tem a certeza que deseja eliminar este cliente?')) {
            ClientService.getInstance().delete(id);
            this.loadClients();
        }
    }

    renderStats() {
        const { stats } = this.state;
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <StatCard label="Total Clientes" value={this.state.data.length} color="var(--color-primary)" icon={<User size={20} />} />
                <StatCard label="Receitas em Curso" value={stats.activeBatches} color="var(--color-accent)" icon={<Beaker size={20} />} />
                <StatCard
                    label="Prontos esta Semana"
                    value={stats.readyThisWeek}
                    color="#3B82F6"
                    icon={<Clock size={20} />}
                    subtext={stats.readyRecipeCodes.length > 0 ? stats.readyRecipeCodes.join(', ') : 'Nenhum previsto'}
                />
                <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: (stats.withoutRecipe > 0 || stats.withoutQuestionnaire > 0) ? '4px solid #F59E0B' : '1px solid #E5E7EB' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={14} color="#F59E0B" /> Avisos Pendentes
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div title="Clientes sem receita">
                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: stats.withoutRecipe > 0 ? '#F59E0B' : 'var(--color-text-light)' }}>{stats.withoutRecipe}</span>
                            <span style={{ fontSize: '0.7rem', marginLeft: '0.25rem' }}>s/ receita</span>
                        </div>
                        <div title="Clientes sem formulário">
                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: stats.withoutQuestionnaire > 0 ? '#F59E0B' : 'var(--color-text-light)' }}>{stats.withoutQuestionnaire}</span>
                            <span style={{ fontSize: '0.7rem', marginLeft: '0.25rem' }}>s/ formulário</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    renderFilters() {
        return (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                <div style={{ flex: 1 }}></div>
                <button className="btn btn-primary" style={{ borderRadius: '50px', padding: '0.5rem 1.5rem', fontWeight: 700 }} onClick={() => this.openModal()}>
                    <Plus size={18} /> Novo Cliente
                </button>
            </div>
        );
    }

    renderTable() {
        const term = this.state.searchQuery.toLowerCase();
        const filteredData = this.state.data.filter(c =>
            c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term)
        );

        const { allRecipes, allQuestionnaires } = this.state;

        return (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Nome</th>
                            <th style={{ textAlign: 'left', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Contacto</th>
                            <th style={{ textAlign: 'left', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Estado</th>
                            <th style={{ textAlign: 'right', padding: '1rem 1.5rem', background: '#f9fafb', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.map(client => {
                            const hasRecipe = allRecipes.some(r => r.clientId === client.id);
                            const hasQuestionnaire = allQuestionnaires.some(q => q.clientId === client.id);

                            return (
                                <tr key={client.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <div style={{ fontWeight: 600 }}>{client.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>{client.email}</div>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <div style={{ fontSize: '0.9rem' }}>{client.phone}</div>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            <div title={hasQuestionnaire ? "Questionário preenchido" : "Falta questionário"} style={{ opacity: hasQuestionnaire ? 1 : 0.3 }}>
                                                <FileText size={18} color={hasQuestionnaire ? 'var(--color-primary)' : '#EF4444'} />
                                            </div>
                                            <div title={hasRecipe ? "Receita associada" : "Falta receita"} style={{ opacity: hasRecipe ? 1 : 0.3 }}>
                                                <Beaker size={18} color={hasRecipe ? 'var(--color-accent)' : '#EF4444'} />
                                            </div>
                                            <div title={client.consentRGPD ? "RGPD Aceite" : "Falta RGPD"} style={{ opacity: client.consentRGPD ? 1 : 0.3 }}>
                                                <Check size={18} color={client.consentRGPD ? '#3B82F6' : '#EF4444'} />
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button className="btn btn-secondary" title="Ficha de Cliente" style={{ padding: '0.4rem', minWidth: 'auto', color: 'var(--color-primary)' }} onClick={() => this.setState({ selectedClientId: client.id, isDetailsOpen: true })}>
                                                <User size={16} />
                                            </button>
                                            <button className="btn btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto' }} onClick={() => this.openModal(client)}>
                                                <Edit2 size={16} />
                                            </button>
                                            <button className="btn btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto', color: '#EF4444' }} onClick={() => this.handleDelete(client.id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }

    private renderModal() {
        const { editingClient } = this.state;
        if (!editingClient) return null;

        return (
            <Modal
                isOpen={this.state.isModalOpen}
                onClose={() => this.closeModal()}
                title="Ficha de Cliente"
                footer={
                    <>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => this.closeModal()}>Cancelar</button>
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => this.handleSave()}>Guardar Cliente</button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Nome Completo *</label>
                        <input
                            type="text"
                            className="form-control"
                            value={editingClient.name}
                            onChange={(e) => this.setState({ editingClient: { ...editingClient, name: e.target.value } })}
                            placeholder="Ex: Maria Silva"
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Email *</label>
                            <input
                                type="email"
                                className="form-control"
                                value={editingClient.email}
                                onChange={(e) => this.setState({ editingClient: { ...editingClient, email: e.target.value } })}
                                placeholder="maria@exemplo.com"
                            />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Telemóvel *</label>
                            <input
                                type="tel"
                                className="form-control"
                                value={editingClient.phone}
                                onChange={(e) => this.setState({ editingClient: { ...editingClient, phone: e.target.value } })}
                                placeholder="912 345 678"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Morada Completa (e CP) *</label>
                        <textarea
                            className="form-control"
                            rows={3}
                            value={editingClient.address}
                            onChange={(e) => this.setState({ editingClient: { ...editingClient, address: e.target.value } })}
                            placeholder="Rua, Número, Andar, CP e Localidade"
                            style={{ fontFamily: 'inherit' }}
                        />
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>Confirmações Obrigatórias</h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <label style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', cursor: 'pointer', alignItems: 'flex-start' }}>
                                <input
                                    type="checkbox"
                                    checked={editingClient.consentCureProcess}
                                    onChange={(e) => this.setState({ editingClient: { ...editingClient, consentCureProcess: e.target.checked } })}
                                    style={{ marginTop: '0.2rem' }}
                                />
                                <span>Ciente da produção artesanal e que o envio ocorre após a cura (até 6 semanas).</span>
                            </label>

                            <label style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', cursor: 'pointer', alignItems: 'flex-start' }}>
                                <input
                                    type="checkbox"
                                    checked={editingClient.consentDataTruth}
                                    onChange={(e) => this.setState({ editingClient: { ...editingClient, consentDataTruth: e.target.checked } })}
                                    style={{ marginTop: '0.2rem' }}
                                />
                                <span>Declaro que os dados são verdadeiros e fornecidos com o meu consentimento.</span>
                            </label>

                            <label style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', cursor: 'pointer', alignItems: 'flex-start' }}>
                                <input
                                    type="checkbox"
                                    checked={editingClient.consentRGPD}
                                    onChange={(e) => this.setState({ editingClient: { ...editingClient, consentRGPD: e.target.checked } })}
                                    style={{ marginTop: '0.2rem' }}
                                />
                                <span>Aceito o uso exclusivo dos dados para contacto, personalização e envio (RGPD).</span>
                            </label>
                        </div>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>Consentimentos Opcionais</h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <label style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', cursor: 'pointer', alignItems: 'flex-start' }}>
                                <input
                                    type="checkbox"
                                    checked={editingClient.consentFutureContact}
                                    onChange={(e) => this.setState({ editingClient: { ...editingClient, consentFutureContact: e.target.checked } })}
                                    style={{ marginTop: '0.2rem' }}
                                />
                                <span>Aceito ser contactado/a com novidades ou sugestões da Noviessence.</span>
                            </label>

                            <label style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', cursor: 'pointer', alignItems: 'flex-start' }}>
                                <input
                                    type="checkbox"
                                    checked={editingClient.consentAdvertising}
                                    onChange={(e) => this.setState({ editingClient: { ...editingClient, consentAdvertising: e.target.checked } })}
                                    style={{ marginTop: '0.2rem' }}
                                />
                                <span>Autorizo o uso anónimo de elogios ou histórias para fins publicitários.</span>
                            </label>
                        </div>
                    </div>
                </div>
            </Modal>
        );
    }

    render() {
        return (
            <>
                {super.render()}
                {this.state.isModalOpen && this.renderModal()}
                {this.state.selectedClientId && (
                    <ClientDetailsPage
                        clientId={this.state.selectedClientId}
                        isOpen={this.state.isDetailsOpen}
                        onClose={() => this.setState({ isDetailsOpen: false, selectedClientId: null })}
                    />
                )}
            </>
        );
    }
}
