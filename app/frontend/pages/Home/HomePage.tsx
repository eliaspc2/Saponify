import { BasePage, BasePageState } from '../../core/BasePage';
import { StatCard } from '../../templates/StatsHeader';
import { ClientService } from '../../../orchestrator/services/ClientService';
import { RecipeService } from '../../../orchestrator/services/RecipeService';
import { IngredientService } from '../../../orchestrator/services/IngredientService';
import { ClientActivity } from '../../../shared/types/ClientActivity';
import { Recipe, RecipeIngredient } from '../../../shared/types/Recipe';
import { Modal } from '../../components/Modal';
import { ClientDetailsPage } from '../CRM/Clients/ClientDetailsPage';
import { formatRecipeReferenceOrFallback } from '../../../shared/utils/recipeFormat';
import {
    Users,
    Beaker,
    Package,
    TrendingUp,
    History,
    MessageSquare,
    FileText,
    Clock,
    ArrowRight
} from 'lucide-react';

interface HomePageProps {
    onNavigate: (page: string, params?: any) => void;
}

interface HomePageState extends BasePageState {
    stats: {
        totalClients: number;
        totalRecipes: number;
        totalIngredients: number;
        activeBatches: number;
    };
    recentActivities: ClientActivity[];
    productionActivities: ClientActivity[];
    selectedClientId: string | null;
    isClientDetailsOpen: boolean;
    recipePreview: Recipe | null;
    isRecipePreviewOpen: boolean;
}

export class HomePage extends BasePage<HomePageProps, HomePageState> {
    constructor(props: HomePageProps) {
        super(props);
        this.state = this.getInitialState();
    }

    protected getInitialState(): HomePageState {
        return {
            stats: {
                totalClients: 0,
                totalRecipes: 0,
                totalIngredients: 0,
                activeBatches: 0
            },
            recentActivities: [],
            productionActivities: [],
            selectedClientId: null,
            isClientDetailsOpen: false,
            recipePreview: null,
            isRecipePreviewOpen: false,
            isLoading: true,
            error: null
        };
    }

    componentDidMount() {
        this.loadData();
    }

    private loadData() {
        const clients = ClientService.getInstance().getAll();
        const recipes = RecipeService.getInstance().getAll();
        const ingredients = IngredientService.getInstance().getAll();
        const allActivities = ClientService.getInstance().getAllActivities();

        // Sort activities by timestamp descending
        const sortedActivities = [...allActivities].sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ).slice(0, 5); // Last 5 events

        const now = new Date();
        const productionActivities = allActivities.filter(a =>
            a.type === 'production' &&
            a.details?.physicalReadyDate &&
            new Date(a.details.physicalReadyDate) > now
        ).sort((a, b) =>
            new Date(a.details?.physicalReadyDate || 0).getTime() - new Date(b.details?.physicalReadyDate || 0).getTime()
        );

        this.setState({
            stats: {
                totalClients: clients.length,
                totalRecipes: recipes.length,
                totalIngredients: ingredients.length,
                activeBatches: productionActivities.length
            },
            recentActivities: sortedActivities,
            productionActivities,
            isLoading: false
        });
    }

    private openClientDetails(clientId: string) {
        this.setState({ selectedClientId: clientId, isClientDetailsOpen: true });
    }

    private closeClientDetails() {
        this.setState({ selectedClientId: null, isClientDetailsOpen: false });
    }

    private closeRecipePreview() {
        this.setState({ recipePreview: null, isRecipePreviewOpen: false });
    }

    private handleRecentActivityClick(activity: ClientActivity) {
        const recipeId = activity.details?.recipeId;
        if (recipeId) {
            const recipe = RecipeService.getInstance().getById(recipeId);
            if (recipe) {
                this.setState({ recipePreview: recipe, isRecipePreviewOpen: true });
                return;
            }
        }
        if (activity.clientId) {
            this.openClientDetails(activity.clientId);
        }
    }

    private renderRecipeGroup(title: string, items: RecipeIngredient[]) {
        if (!items || items.length === 0) return null;
        return (
            <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.5rem' }}>{title}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span>{item.name}</span>
                            <span style={{ fontWeight: 700 }}>{item.amount}g</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    private renderRecipePreviewModal() {
        const { recipePreview, isRecipePreviewOpen } = this.state;
        if (!recipePreview) return null;

        return (
            <Modal
                isOpen={isRecipePreviewOpen}
                onClose={() => this.closeRecipePreview()}
                title={`Receita: ${formatRecipeReferenceOrFallback(recipePreview.code, 'Sem referencia')}`}
                maxWidth="850px"
                footer={
                    <button className="btn btn-secondary" onClick={() => this.closeRecipePreview()}>Fechar</button>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '0.25rem' }}>Nome</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700 }}>{recipePreview.name || 'Sem nome'}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', background: '#F9FAFB', padding: '1rem', borderRadius: '0.5rem' }}>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Alcali</label>
                            <span style={{ fontWeight: 700 }}>{recipePreview.alkali}</span>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Superfat</label>
                            <span style={{ fontWeight: 700 }}>{recipePreview.superfat}%</span>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', color: '#6B7280', display: 'block' }}>Concentracao</label>
                            <span style={{ fontWeight: 700 }}>{recipePreview.waterConcentration}%</span>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {this.renderRecipeGroup('Fase 1: Gorduras', recipePreview.fats)}
                            {this.renderRecipeGroup('Fase 2: Liquidos', recipePreview.liquids)}
                            {this.renderRecipeGroup('Fase 2: Aditivos Funcionais', recipePreview.functionalAdditives)}
                            {this.renderRecipeGroup('Fase 2: Aditivos da Lixivia', recipePreview.lyeAdditives)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {this.renderRecipeGroup('Fase 3: Aditivos Traco', recipePreview.traceAdditives)}
                            {this.renderRecipeGroup('Fase 3: Superfat Oils', recipePreview.superfatOils)}
                            {this.renderRecipeGroup('Fase 3: Oleos Essenciais', recipePreview.essentialOils)}
                        </div>
                    </div>
                    {recipePreview.notes ? (
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '0.25rem' }}>Notas</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{recipePreview.notes}</div>
                        </div>
                    ) : null}
                </div>
            </Modal>
        );
    }

    renderContent() {
        const { stats, recentActivities, productionActivities } = this.state;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {/* Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem' }}>
                    <StatCard
                        label="Clientes"
                        value={stats.totalClients}
                        icon={<Users size={20} />}
                        color="var(--color-primary)"
                    />
                    <StatCard
                        label="Fórmulas"
                        value={stats.totalRecipes}
                        icon={<Beaker size={20} />}
                        color="#8B5CF6"
                    />
                    <StatCard
                        label="Ingredientes"
                        value={stats.totalIngredients}
                        icon={<Package size={20} />}
                        color="#F59E0B"
                    />
                    <StatCard
                        label="Lotes em Cura"
                        value={stats.activeBatches}
                        icon={<TrendingUp size={20} />}
                        color="var(--color-accent)"
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem', alignItems: 'start' }}>
                    {/* Recent Events */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <History size={20} color="var(--color-primary)" /> Acontecimentos Recentes
                            </h3>
                        </div>

                        {recentActivities.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
                                Sem atividades registadas recentemente.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {recentActivities.map((activity, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => this.handleRecentActivityClick(activity)}
                                        style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        padding: '1rem',
                                        background: '#F9FAFB',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid #F3F4F6',
                                        cursor: activity.clientId || activity.details?.recipeId ? 'pointer' : 'default'
                                    }}>
                                        <div style={{
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '50%',
                                            background: activity.type === 'production' ? 'var(--color-accent)' :
                                                activity.type === 'note' ? '#3B82F6' :
                                                    activity.type === 'questionnaire' ? 'var(--color-primary)' : '#9CA3AF',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'white',
                                            flexShrink: 0
                                        }}>
                                            {activity.type === 'production' && <Beaker size={16} />}
                                            {activity.type === 'note' && <MessageSquare size={16} />}
                                            {activity.type === 'questionnaire' && <FileText size={16} />}
                                            {activity.type === 'system' && <Clock size={16} />}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>{activity.title}</h4>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                                                    {new Date(activity.timestamp).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                                                {activity.content}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Quick Access or Secondary Stats */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="card" style={{ padding: '1.5rem', background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid rgba(90, 125, 76, 0.15)' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Produções em Curso</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {productionActivities.map((a, i) => (
                                    <div
                                        key={i}
                                        onClick={() => {
                                            if (a.clientId) {
                                                this.openClientDetails(a.clientId);
                                            }
                                        }}
                                        style={{
                                            padding: '0.75rem',
                                            background: 'rgba(90, 125, 76, 0.08)',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ fontWeight: 700 }}>{a.details?.recipeName}</div>
                                        <div style={{ opacity: 0.85, fontSize: '0.75rem' }}>
                                            Pronto em: {new Date(a.details?.physicalReadyDate || '').toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                                {productionActivities.length === 0 && (
                                    <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Sem produções agendadas.</p>
                                )}
                            </div>
                        </div>

                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Ações Rápidas</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <button
                                    onClick={() => this.props.onNavigate('calculator')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem' }}
                                >
                                    Nova Receita <ArrowRight size={14} />
                                </button>
                                <button
                                    onClick={() => this.props.onNavigate('clients')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem' }}
                                >
                                    Ficha de Cliente <ArrowRight size={14} />
                                </button>
                                <button
                                    onClick={() => this.props.onNavigate('questionnaires')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem' }}
                                >
                                    Questionários <ArrowRight size={14} />
                                </button>
                                <button
                                    onClick={() => this.props.onNavigate('recipes')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem' }}
                                >
                                    Receitas Guardadas <ArrowRight size={14} />
                                </button>
                                <button
                                    onClick={() => this.props.onNavigate('ingredients')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem' }}
                                >
                                    Ingredientes <ArrowRight size={14} />
                                </button>
                                <button
                                    onClick={() => this.props.onNavigate('settings')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem' }}
                                >
                                    Configurações <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                {this.state.selectedClientId && (
                    <ClientDetailsPage
                        clientId={this.state.selectedClientId}
                        isOpen={this.state.isClientDetailsOpen}
                        onClose={() => this.closeClientDetails()}
                    />
                )}
                {this.renderRecipePreviewModal()}
            </div>
        );
    }
}
