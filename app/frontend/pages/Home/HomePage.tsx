import { BasePage, BasePageState } from '../../core/BasePage';
import { StatCard } from '../../templates/StatsHeader';
import { ClientService } from '../../../orchestrator/services/ClientService';
import { RecipeService } from '../../../orchestrator/services/RecipeService';
import { IngredientService } from '../../../orchestrator/services/IngredientService';
import { ClientActivity } from '../../../shared/types/ClientActivity';
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
                                    <div key={idx} style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        padding: '1rem',
                                        background: '#F9FAFB',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid #F3F4F6'
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
                                    <div key={i} style={{ padding: '0.75rem', background: 'rgba(90, 125, 76, 0.08)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
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
            </div>
        );
    }
}
