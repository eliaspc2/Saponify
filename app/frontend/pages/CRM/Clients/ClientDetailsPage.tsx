import React from 'react';
import { BasePage, BasePageState } from '../../../core/BasePage';
import { Client } from '../../../../shared/types/Client';
import { ClientActivity, ProductionDetails } from '../../../../shared/types/ClientActivity';
import { ClientService } from '../../../../orchestrator/services/ClientService';
import { ClientActivityService } from '../../../../orchestrator/services/ClientActivityService';
import { RecipeService } from '../../../../orchestrator/services/RecipeService';
import { RecipeDomainService } from '../../../../orchestrator/services/RecipeDomainService';
import { Recipe } from '../../../../shared/types/Recipe';
import {
    User,
    Phone,
    Mail,
    MapPin,
    Clock,
    History,
    MessageSquare,
    Beaker,
    Calendar,
    CheckCircle,
    FileText,
    Download,
    Trash2
} from 'lucide-react';
import { Modal } from '../../../components/Modal';
import { QuestionnaireService } from '../../../../orchestrator/services/QuestionnaireService';
import { formatRecipeReferenceOrFallback } from '../../../../shared/utils/recipeFormat';

interface ClientDetailsProps {
    clientId: string;
    isOpen: boolean;
    onClose: () => void;
}

interface ClientDetailsState extends BasePageState {
    client: Client | null;
    activities: ClientActivity[];
    associatedRecipes: Recipe[];
    isProductionModalOpen: boolean;
    isRecipeModalOpen: boolean;
    viewingRecipe: Recipe | null;
    noteContent: string;

    // Production Form
    selectedRecipeId: string;
    productionWeight: number; // Factor to scale recipe
    productionDate: string;
}

export class ClientDetailsPage extends BasePage<ClientDetailsProps, ClientDetailsState> {
    constructor(props: ClientDetailsProps) {
        super(props);
        this.state = this.getInitialState();
    }

    protected getInitialState(): ClientDetailsState {
        return {
            client: null,
            activities: [],
            associatedRecipes: [],
            isProductionModalOpen: false,
            isRecipeModalOpen: false,
            viewingRecipe: null,
            noteContent: '',
            selectedRecipeId: '',
            productionWeight: 0,
            productionDate: new Date().toISOString().split('T')[0],
            isLoading: false,
            error: null
        };
    }

    componentDidUpdate(prevProps: ClientDetailsProps) {
        if (this.props.clientId !== prevProps.clientId || (this.props.isOpen && !prevProps.isOpen)) {
            this.loadData();
        }
    }

    componentDidMount() {
        if (this.props.isOpen) {
            this.loadData();
        }
    }

    private loadData() {
        const client = ClientService.getInstance().getById(this.props.clientId);
        if (client) {
            const activities = ClientActivityService.getInstance().getActivities(client.id);
            const recipes = RecipeService.getInstance().getAll().filter(r => r.clientId === client.id);
            this.setState({ client, activities, associatedRecipes: recipes });
        }
    }

    private handleAddNote() {
        if (!this.state.noteContent || !this.state.client) return;

        ClientActivityService.getInstance().addActivity({
            id: '',
            clientId: this.state.client.id,
            timestamp: new Date().toISOString(),
            type: 'note',
            title: 'Nota Manual',
            content: this.state.noteContent
        });

        this.setState({ noteContent: '' });
        this.loadData();
    }

    private handleDeleteActivity(id: string) {
        if (confirm('Deseja eliminar este registo permanentemente?')) {
            ClientActivityService.getInstance().deleteActivity(id);
            this.loadData();
        }
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

    private async handleExportClientAllData() {
        const { client, activities, associatedRecipes } = this.state;
        if (!client) return;
        const questionnaires = await QuestionnaireService.getQuestionnaires();
        const clientQuestionnaires = questionnaires.filter(q => q.clientId === client.id);
        const payload = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            client,
            activities,
            recipes: associatedRecipes,
            questionnaires: clientQuestionnaires
        };
        this.downloadJsonFile(`cliente_${client.id}_dados_completos.json`, payload);
    }

    private async handleDeleteClientData() {
        const { client } = this.state;
        if (!client) return;
        const confirmed = confirm('Eliminar esta ficha e todos os dados associados (atividades, receitas e questionários)? Esta ação é irreversível.');
        if (!confirmed) return;
        const confirmedAgain = confirm('Tem a certeza absoluta? Esta ação não pode ser anulada.');
        if (!confirmedAgain) return;

        const recipeService = RecipeService.getInstance();
        recipeService.getAll()
            .filter(r => r.clientId === client.id)
            .forEach(r => recipeService.delete(r.id));

        const questionnaires = await QuestionnaireService.getQuestionnaires();
        for (const q of questionnaires.filter(q => q.clientId === client.id)) {
            await QuestionnaireService.deleteQuestionnaire(q.id);
        }

        ClientService.getInstance().delete(client.id);
        ClientActivityService.getInstance().deleteByClient(client.id);
        this.setState({ client: null, activities: [], associatedRecipes: [] });
        this.props.onClose();
    }

    private handleScheduleProduction() {
        const { client, selectedRecipeId, productionWeight } = this.state;
        if (!client || !selectedRecipeId) return;

        const recipe = RecipeService.getInstance().getById(selectedRecipeId);
        if (!recipe) return;

        const productionDate = this.getProductionDate();
        const totalFatsOriginal = this.getTotalFats(recipe);
        const finalProductionWeight = productionWeight || totalFatsOriginal;
        const {
            plannedWeight,
            stableWeight,
            chemicalReadyDate,
            physicalReadyDate
        } = this.getProductionEstimates(recipe, finalProductionWeight, productionDate);

        const totalWeightOriginal = this.calculateRecipeTotalWeight(recipe);

        const details: ProductionDetails = {
            recipeId: recipe.id,
            recipeName: recipe.name,
            recipeCode: recipe.code,
            originalWeight: totalWeightOriginal,
            plannedWeight: plannedWeight,
            stableWeight: stableWeight,
            productionDate: productionDate.toISOString(),
            chemicalReadyDate: chemicalReadyDate.toISOString(),
            physicalReadyDate: physicalReadyDate.toISOString()
        };

        ClientActivityService.getInstance().addActivity({
            id: '',
            clientId: client.id,
            timestamp: new Date().toISOString(),
            type: 'production',
            title: `Lote de Sabão: ${recipe.name}`,
            content: `Produção agendada para ${plannedWeight.toFixed(0)}g totais.`,
            details
        });

        this.setState({ isProductionModalOpen: false });
        this.loadData();
    }

    private getTotalFats(recipe: Recipe): number {
        const baseFats = recipe.fats.reduce((sum, f) => sum + (f.amount || 0), 0);
        const superfatFats = recipe.superfatOils?.reduce((sum, o) => sum + (o.amount || 0), 0) || 0;
        return baseFats + superfatFats;
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

    private getProductionDate(): Date {
        const { productionDate } = this.state;
        if (!productionDate) return new Date();
        return new Date(`${productionDate}T00:00:00`);
    }

    private getProductionEstimates(recipe: Recipe, productionWeight: number, productionDate: Date) {
        const totalFatsOriginal = this.getTotalFats(recipe);
        const scaleFactor = totalFatsOriginal > 0 ? productionWeight / totalFatsOriginal : 0;
        const totalWeightOriginal = this.calculateRecipeTotalWeight(recipe);
        const plannedWeight = totalWeightOriginal * scaleFactor;

        const waterAmountOriginal = recipe.liquids.reduce((sum, l) => sum + (l.amount || 0), 0);
        const plannedWater = waterAmountOriginal * scaleFactor;
        const stableWeight = plannedWeight - (plannedWater * 0.85);

        const chemicalDays = 2;
        const chemicalReadyDate = new Date(productionDate.getTime());
        chemicalReadyDate.setDate(chemicalReadyDate.getDate() + chemicalDays);

        const physicalDays = this.getPhysicalCureDays(productionDate);
        const physicalReadyDate = new Date(productionDate.getTime());
        physicalReadyDate.setDate(physicalReadyDate.getDate() + physicalDays);

        return {
            plannedWeight,
            stableWeight,
            chemicalReadyDate,
            physicalReadyDate,
            physicalDays
        };
    }

    private calculateRecipeTotalWeight(recipe: Recipe): number {
        let total = 0;
        total += recipe.fats.reduce((s, i) => s + i.amount, 0);
        total += recipe.liquids.reduce((s, i) => s + i.amount, 0);
        total += (recipe.superfatOils?.reduce((s, i) => s + i.amount, 0) || 0);
        total += (recipe.essentialOils?.reduce((s, i) => s + i.amount, 0) || 0);
        total += (recipe.lyeAdditives?.reduce((s, i) => s + i.amount, 0) || 0);
        total += (recipe.traceAdditives?.reduce((s, i) => s + i.amount, 0) || 0);
        return total;
    }

    renderContent() {
        const { client, activities, associatedRecipes } = this.state;
        if (!client) return null as any;

        return (
            <Modal
                isOpen={this.props.isOpen}
                onClose={this.props.onClose}
                title={`Ficha de Cliente: ${client.name}`}
                maxWidth="1150px"
                minHeight="85vh"
                maxHeight="95vh"
            >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', height: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <button className="btn btn-secondary" style={{ borderRadius: '50px', fontWeight: 700 }} onClick={() => this.handleExportClientAllData()}>
                            <Download size={16} /> Exportar Dados (JSON)
                        </button>
                        <button className="btn btn-secondary" style={{ borderRadius: '50px', fontWeight: 700, color: '#EF4444' }} onClick={() => this.handleDeleteClientData()}>
                            <Trash2 size={16} /> Eliminar Dados
                        </button>
                        <button className="btn btn-primary" style={{ borderRadius: '50px', fontWeight: 700 }} onClick={() => this.setState({ isProductionModalOpen: true, productionDate: new Date().toISOString().split('T')[0] })}>
                            <Beaker size={16} /> Marcar Produção
                        </button>
                    </div>

                    <div className="client-details-grid" style={{ flex: 1 }}>
                        {/* Left: Client Info */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="card" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <User size={16} /> Informações de Contacto
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                                            <Mail size={16} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Email</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{client.email}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                                            <Phone size={16} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Telemóvel</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{client.phone}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', marginTop: '0.2rem' }}>
                                            <MapPin size={16} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>Morada</div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 500, lineHeight: 1.4 }}>{client.address}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="card" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
                                    Receitas do Cliente ({associatedRecipes.length})
                                </h3>
                                {associatedRecipes.length === 0 ? (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Nenhuma receita associada.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {associatedRecipes.map(r => (
                                            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#F9FAFB', borderRadius: 'var(--radius-sm)', border: '1px solid #E5E7EB' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{r.name}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>RE{r.code}</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        title="Ver/Editar Receita"
                                                        className="btn btn-secondary"
                                                        onClick={() => this.setState({ viewingRecipe: r, isRecipeModalOpen: true })}
                                                        style={{ padding: '0.4rem', minWidth: 'auto', color: 'var(--color-primary)' }}
                                                    >
                                                        <FileText size={16} />
                                                    </button>
                                                    <button
                                                        title="Produzir esta Receita"
                                                        className="btn btn-secondary"
                                                        onClick={() => this.setState({
                                                            selectedRecipeId: r.id,
                                                            productionWeight: this.getTotalFats(r),
                                                            productionDate: new Date().toISOString().split('T')[0],
                                                            isProductionModalOpen: true
                                                        })}
                                                        style={{ padding: '0.4rem', minWidth: 'auto', color: 'var(--color-accent)' }}
                                                    >
                                                        <Beaker size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Timeline */}
                        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
                            <div style={{ padding: '2rem 2rem 1rem 2rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <History size={20} /> Histórico de Atividade
                                </h3>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '0 2rem' }}>
                                {activities.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                                        Nenhuma atividade registada.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                        {activities.map((a, i) => (
                                            <div key={a.id} style={{ display: 'flex', gap: '1.5rem', position: 'relative', paddingBottom: '2.5rem' }}>
                                                {/* Timeline Line */}
                                                {i < activities.length - 1 && (
                                                    <div style={{ position: 'absolute', left: '15px', top: '30px', bottom: 0, width: '2px', background: '#E5E7EB' }}></div>
                                                )}

                                                {/* Icon */}
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '50%',
                                                    background: a.type === 'production' ? 'var(--color-accent)' :
                                                        a.type === 'note' ? '#3B82F6' :
                                                            a.type === 'questionnaire' ? 'var(--color-primary)' : '#9CA3AF',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'white',
                                                    zIndex: 1,
                                                    flexShrink: 0
                                                }}>
                                                    {a.type === 'production' && <Beaker size={14} />}
                                                    {a.type === 'note' && <MessageSquare size={14} />}
                                                    {a.type === 'questionnaire' && <FileText size={14} />}
                                                    {a.type === 'system' && <Clock size={14} />}
                                                </div>

                                                {/* Content */}
                                                <div style={{ flex: 1, marginTop: '2px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{a.title}</div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', background: '#F3F4F6', padding: '0.2rem 0.6rem', borderRadius: '1rem' }}>
                                                                {new Date(a.timestamp).toLocaleString()}
                                                            </div>
                                                            <button
                                                                className="btn btn-secondary"
                                                                style={{ padding: '0.2rem', minWidth: 'auto', color: '#EF4444', opacity: 0.6 }}
                                                                onClick={() => this.handleDeleteActivity(a.id)}
                                                                title="Eliminar este registo"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                                        {a.content}
                                                    </div>

                                                    {a.details && (
                                                        <div
                                                            className="modal-grid-2"
                                                            style={{
                                                                marginTop: '1rem',
                                                                padding: '1rem',
                                                                background: '#F9FAFB',
                                                                borderRadius: 'var(--radius-md)',
                                                                border: '1px solid #E5E7EB',
                                                                gap: '1rem'
                                                            }}
                                                        >
                                                            <div>
                                                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>Pesos Calculados</div>
                                                                <div style={{ fontSize: '0.85rem' }}>Total: <strong>{a.details.plannedWeight.toFixed(0)}g</strong></div>
                                                                <div style={{ fontSize: '0.85rem' }}>Estável: <strong>{a.details.stableWeight.toFixed(0)}g</strong> <span style={{ fontSize: '0.7rem', color: '#10B981' }}>(-15% água)</span></div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-light)', marginBottom: '0.25rem' }}>Prazos de Prontidão</div>
                                                                <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                    <CheckCircle size={12} color="#3B82F6" /> Química: <strong>{new Date(a.details.chemicalReadyDate).toLocaleDateString()}</strong>
                                                                </div>
                                                                <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                    <Calendar size={12} color="var(--color-accent)" /> Física: <strong>{new Date(a.details.physicalReadyDate).toLocaleDateString()}</strong>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Quick Note Input - Now at bottom and resizable */}
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', padding: '1.25rem', borderTop: '1px solid #f3f4f6', backgroundColor: '#fafafa' }}>
                                <textarea
                                    className="form-control"
                                    style={{ flex: 1, minHeight: '38px', height: '38px', fontSize: '0.9rem', resize: 'vertical', padding: '0.5rem 0.75rem' }}
                                    placeholder="Escreva uma nota rápida sobre este cliente aqui..."
                                    value={this.state.noteContent}
                                    onChange={(e) => this.setState({ noteContent: e.target.value })}
                                />
                                <button
                                    className="btn btn-primary btn-sm"
                                    style={{ padding: '0.6rem 1.5rem', borderRadius: '50px', height: '38px', flexShrink: 0 }}
                                    onClick={() => this.handleAddNote()}
                                    disabled={!this.state.noteContent.trim()}
                                >
                                    <MessageSquare size={14} /> Adicionar
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Modals inner */}
                    {this.renderProductionModal()}
                    {this.renderRecipeModal()}
                </div>
            </Modal>
        );
    }

    private renderProductionModal() {
        const { associatedRecipes, selectedRecipeId, productionWeight, productionDate } = this.state;
        const selectedRecipe = associatedRecipes.find(r => r.id === selectedRecipeId);
        const productionDateObj = this.getProductionDate();
        const totalFats = selectedRecipe ? this.getTotalFats(selectedRecipe) : 0;
        const estimatedWeight = selectedRecipe ? (productionWeight || totalFats) : 0;
        const estimates = selectedRecipe
            ? this.getProductionEstimates(selectedRecipe, estimatedWeight, productionDateObj)
            : null;

        return (
            <Modal
                isOpen={this.state.isProductionModalOpen}
                onClose={() => this.setState({ isProductionModalOpen: false })}
                title="Agendar Produção de Lote"
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => this.setState({ isProductionModalOpen: false })}>Cancelar</button>
                        <button className="btn btn-primary" onClick={() => this.handleScheduleProduction()} disabled={!selectedRecipeId}>
                            <Beaker size={16} /> Confirmar Produção
                        </button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 700 }}>Escolher Fórmula Associada *</label>
                        <select
                            className="form-control"
                            value={selectedRecipeId}
                            onChange={(e) => {
                                const recipeId = e.target.value;
                                const recipe = associatedRecipes.find(r => r.id === recipeId);
                                this.setState({
                                    selectedRecipeId: recipeId,
                                    productionWeight: recipe ? this.getTotalFats(recipe) : 0
                                });
                            }}
                        >
                            <option value="">-- Selecione uma receita --</option>
                            {associatedRecipes.map(r => <option key={r.id} value={r.id}>{r.name} (RE{r.code})</option>)}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 700 }}>Data de Produção</label>
                        <input
                            type="date"
                            className="form-control"
                            value={productionDate}
                            onChange={(e) => this.setState({ productionDate: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 700 }}>Peso das Gorduras (g)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input
                                type="number"
                                className="form-control"
                                value={selectedRecipe ? estimatedWeight : ''}
                                readOnly
                            />
                            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-light)' }}>gramas</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                            A receita será escalada proporcionalmente com base neste peso de óleos/gorduras.
                        </p>
                    </div>

                    {selectedRecipe && (
                        <div style={{ padding: '1rem', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-primary)' }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-primary-dark)' }}>Impacto Estimado</h4>
                            <div className="modal-grid-2" style={{ gap: '1rem', fontSize: '0.85rem' }}>
                                <div>
                                    <div style={{ color: 'var(--color-text-secondary)' }}>Pronto a usar (Químico):</div>
                                    <div style={{ fontWeight: 700 }}>{estimates?.chemicalReadyDate.toLocaleDateString()}</div>
                                    <div style={{ color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>Cura Física estimada:</div>
                                    <div style={{ fontWeight: 700 }}>
                                        {estimates?.physicalReadyDate.toLocaleDateString()} ({estimates?.physicalDays} dias)
                                    </div>
                                </div>
                                <div>
                                    <div style={{ color: 'var(--color-text-secondary)' }}>Peso Final Estável:</div>
                                    <div style={{ fontWeight: 700 }}>~ {Math.round(estimates?.stableWeight || 0)}g</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        );
    }

    private renderRecipeModal() {
        const { viewingRecipe } = this.state;
        if (!viewingRecipe) return null;

        const handleSave = () => {
            RecipeDomainService.getInstance().save(viewingRecipe);
            this.setState({ isRecipeModalOpen: false, viewingRecipe: null });
            this.loadData();
        };

        const updateField = (field: keyof Recipe, value: any) => {
            this.setState({ viewingRecipe: { ...viewingRecipe, [field]: value } });
        };

        return (
            <Modal
                isOpen={this.state.isRecipeModalOpen}
                onClose={() => this.setState({ isRecipeModalOpen: false, viewingRecipe: null })}
                title={`Detalhes da Formula: ${formatRecipeReferenceOrFallback(viewingRecipe.code, 'Sem referencia')}`}
                maxWidth="1000px"
                footer={
                    <>
                        <button className="btn btn-secondary" onClick={() => this.setState({ isRecipeModalOpen: false, viewingRecipe: null })}>Fechar</button>
                        <button className="btn btn-primary" onClick={handleSave}>Guardar Alterações</button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 700 }}>Nome da Receita</label>
                        <input
                            type="text"
                            className="form-control"
                            value={viewingRecipe.name}
                            onChange={(e) => updateField('name', e.target.value)}
                        />
                    </div>

                    <div className="modal-grid-3" style={{ background: '#F9FAFB', padding: '1rem', borderRadius: '0.5rem' }}>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Álcali</label>
                            <span style={{ fontWeight: 700 }}>{viewingRecipe.alkali}</span>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Superfat</label>
                            <span style={{ fontWeight: 700 }}>{viewingRecipe.superfat}%</span>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Concentração</label>
                            <span style={{ fontWeight: 700 }}>{viewingRecipe.waterConcentration}%</span>
                        </div>
                    </div>

                    <div className="modal-grid-2" style={{ gap: '2rem' }}>
                        <div>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.75rem', borderBottom: '1px solid #eee', paddingBottom: '0.25rem' }}>Gorduras</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {viewingRecipe.fats.map((f, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                        <span>{f.name}</span>
                                        <strong>{f.amount}g</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.75rem', borderBottom: '1px solid #eee', paddingBottom: '0.25rem' }}>Líquidos & Aditivos</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {viewingRecipe.liquids.map((l, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                        <span>{l.name}</span>
                                        <strong>{l.amount}g</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 700 }}>Notas</label>
                        <textarea
                            className="form-control"
                            rows={3}
                            value={viewingRecipe.notes || ''}
                            onChange={(e) => updateField('notes', e.target.value)}
                        />
                    </div>
                </div>
            </Modal>
        );
    }

    render(): React.ReactElement<any, any> {
        if (!this.props.isOpen) return null as any;
        return super.render();
    }
}
