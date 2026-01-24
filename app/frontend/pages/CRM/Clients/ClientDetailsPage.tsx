import React from 'react';
import { BasePage, BasePageState } from '../../../core/BasePage';
import { Client } from '../../../../shared/types/Client';
import { ClientActivity, ProductionDetails } from '../../../../shared/types/ClientActivity';
import { ClientService } from '../../../../backend/services/ClientService';
import { ClientActivityService } from '../../../../backend/services/ClientActivityService';
import { RecipeService } from '../../../../backend/services/RecipeService';
import { RecipeDomainService } from '../../../../backend/services/RecipeDomainService';
import { Recipe, RecipeIngredient } from '../../../../shared/types/Recipe';
import { IngredientService } from '../../../../backend/services/IngredientService';
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
import { QuestionnaireService } from '../../../../backend/services/QuestionnaireService';
import { formatRecipeReferenceOrFallback } from '../../../../shared/utils/recipeFormat';
import type { Questionnaire } from '../../../../shared/types/Questionnaire';
import type { AppController } from '../../../../orchestrator/services/AppController';

interface ClientDetailsProps {
    clientId: string;
    isOpen: boolean;
    onClose: () => void;
    appController: AppController;
}

interface ClientDetailsState extends BasePageState {
    client: Client | null;
    activities: ClientActivity[];
    associatedRecipes: Recipe[];
    questionnaires: Questionnaire[];
    isProductionModalOpen: boolean;
    isRecipeModalOpen: boolean;
    isQuestionnaireModalOpen: boolean;
    viewingRecipe: Recipe | null;
    viewingQuestionnaire: Questionnaire | null;
    noteContent: string;
    isGeneratingAIRecipe: boolean;
    aiError: string | null;
    aiDebugPrompt: string;
    aiDebugResponse: string;
    aiDebugResponseLabel: string;
    showAiPrompt: boolean;
    showAiResponse: boolean;
    aiFeedbackDraft: string;

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
            questionnaires: [],
            isProductionModalOpen: false,
            isRecipeModalOpen: false,
            isQuestionnaireModalOpen: false,
            viewingRecipe: null,
            viewingQuestionnaire: null,
            noteContent: '',
            selectedRecipeId: '',
            productionWeight: 0,
            productionDate: new Date().toISOString().split('T')[0],
            isGeneratingAIRecipe: false,
            aiError: null,
            aiDebugPrompt: '',
            aiDebugResponse: '',
            aiDebugResponseLabel: '',
            showAiPrompt: false,
            showAiResponse: false,
            aiFeedbackDraft: '',
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

    private async loadData() {
        const client = ClientService.getInstance().getById(this.props.clientId);
        if (client) {
            const ingredientService = IngredientService.getInstance();
            if (ingredientService.getAll().length === 0) {
                await ingredientService.loadInitialData();
            }
            const activities = ClientActivityService.getInstance().getActivities(client.id);
            const recipes = RecipeService.getInstance().getAll().filter(r => r.clientId === client.id);
            const questionnaires = await QuestionnaireService.getQuestionnaires();
            const clientQuestionnaires = questionnaires.filter(q => q.clientId === client.id);
            this.setState({ client, activities, associatedRecipes: recipes, questionnaires: clientQuestionnaires });
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
        return recipe.fats.reduce((sum, f) => sum + (f.amount || 0), 0);
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

    private renderRecipeGroup(title: string, items: RecipeIngredient[]) {
        const hasItems = !!items && items.length > 0;
        return (
            <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-dark)', marginBottom: '0.5rem' }}>{title}</h4>
                {hasItems ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {items.map((item, idx) => (
                            <div key={`${title}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                <span>{item.name}</span>
                                <span style={{ fontWeight: 700 }}>{item.amount}g</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                        Sem ingredientes.
                    </div>
                )}
            </div>
        );
    }

    private async handleExportMarkdown(recipe: Recipe) {
        const ingredientService = IngredientService.getInstance();
        if (ingredientService.getAll().length === 0) {
            await ingredientService.loadInitialData();
        }
        const ingredients = ingredientService.getAll();
        const results = this.props.appController.calculateRecipe({ recipe, ingredients }).results;

        let md = `# Receita: ${recipe.name || 'Sem Nome'}\n`;
        const recipeRef = formatRecipeReferenceOrFallback(recipe.code, '');
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
        const codePrefix = recipe.code || 'sem_referencia';
        a.download = `${codePrefix}_${recipe.name.replace(/\s+/g, '_')}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private getLatestQuestionnaire(): Questionnaire | null {
        const { questionnaires } = this.state;
        if (!questionnaires.length) return null;
        const sorted = [...questionnaires].sort((a, b) => {
            const aTime = new Date(a.updatedAt || a.createdAt || a.date || '').getTime();
            const bTime = new Date(b.updatedAt || b.createdAt || b.date || '').getTime();
            return bTime - aTime;
        });
        return sorted[0] || null;
    }

    private isQuestionnaireComplete(questionnaire: Questionnaire | null): boolean {
        if (!questionnaire) return false;
        const hasText = (value: string) => typeof value === 'string' && value.trim().length > 0;
        const hasList = (value: string[]) => Array.isArray(value) && value.length > 0;

        return [
            questionnaire.ageGroup,
            questionnaire.usageFrequency,
            questionnaire.previousReaction,
            questionnaire.oiliness,
            questionnaire.drynessAfterWash,
            questionnaire.irritationFrequency,
            questionnaire.medications,
            questionnaire.sleepQuality,
            questionnaire.waterIntake,
            questionnaire.sweatIntensity,
            questionnaire.sunReaction,
            questionnaire.allergies,
            questionnaire.animalProductRestrictions,
            questionnaire.extraSoapInfo,
            questionnaire.skinCuriosity,
            questionnaire.extraSkinDetails,
            questionnaire.extraEnvironmentInfo,
            questionnaire.specialCareHabits,
            questionnaire.personalConvictions,
            questionnaire.dailyProductsOther,
            questionnaire.allergiesOther,
            questionnaire.animalProductRestrictionsOther
        ].some((value) => hasText(value || ''))
        || hasList(questionnaire.usageZones)
        || hasList(questionnaire.skinProblems)
        || hasList(questionnaire.dietType)
        || hasList(questionnaire.environmentType)
        || hasList(questionnaire.dailyProducts);
    }

    private async handleGenerateRecipeAI(feedback?: string, replaceRecipeId?: string) {
        const { client } = this.state;
        if (!client) return;

        const questionnaire = this.getLatestQuestionnaire();
        if (!this.isQuestionnaireComplete(questionnaire)) {
            this.setState({
                aiError: 'Formulário incompleto.',
                aiDebugPrompt: '',
                aiDebugResponse: '',
                aiDebugResponseLabel: '',
                showAiPrompt: false,
                showAiResponse: false
            });
            return;
        }

        this.setState({
            isGeneratingAIRecipe: true,
            aiError: null,
            aiDebugPrompt: '',
            aiDebugResponse: '',
            aiDebugResponseLabel: '',
            showAiPrompt: false,
            showAiResponse: false
        });
        try {
            const recipe = await this.props.appController.generateRecipeFromAI({
                clientId: client.id,
                questionnaire: questionnaire as object,
                feedback: feedback?.trim(),
                replaceRecipeId
            });
            this.setState({
                isGeneratingAIRecipe: false,
                viewingRecipe: recipe,
                isRecipeModalOpen: true,
                aiFeedbackDraft: ''
            });
            this.loadData();
        } catch (error) {
            const err = error as any;
            const message = err?.message || '';
            const safeMessage = message.toLowerCase().includes('configurada')
                ? 'A IA não está configurada.'
                : 'Erro ao gerar a receita. Tenta novamente.';
            const debugPrompt = err?.debug?.prompt ? JSON.stringify(err.debug.prompt, null, 2) : '';
            const debugResponse = err?.debug?.responseText
                ? String(err.debug.responseText)
                : (err?.debug?.response ? JSON.stringify(err.debug.response, null, 2) : '');
            const debugResponseLabel = err?.debug?.responseLabel || (debugResponse ? 'Resposta da IA' : 'Detalhes');
            this.setState({
                isGeneratingAIRecipe: false,
                aiError: safeMessage,
                aiDebugPrompt: debugPrompt,
                aiDebugResponse: debugResponse,
                aiDebugResponseLabel: debugResponseLabel,
                showAiPrompt: false,
                showAiResponse: false
            });
        }
    }

    renderContent() {
        const { client, activities, associatedRecipes, isGeneratingAIRecipe, aiError } = this.state;
        if (!client) return null as any;
        const questionnaire = this.getLatestQuestionnaire();
        const isFormComplete = this.isQuestionnaireComplete(questionnaire);
        const isAIConfigured = this.props.appController.hasAIConfigured();
        const canGenerate = isFormComplete && isAIConfigured && !isGeneratingAIRecipe;
        const showQuestionnaireHint = !isFormComplete;

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
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" style={{ borderRadius: '50px', fontWeight: 700 }} onClick={() => this.handleExportClientAllData()}>
                            <Download size={16} /> Exportar Dados (JSON)
                        </button>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <button
                                className="btn btn-secondary"
                                style={{ borderRadius: '50px', fontWeight: 700 }}
                                disabled={!canGenerate}
                                onClick={() => this.handleGenerateRecipeAI()}
                            >
                                {isGeneratingAIRecipe ? 'A gerar receita...' : 'Gerar receita (IA)'}
                            </button>
                            {!isAIConfigured && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginTop: '0.35rem' }}>
                                    Configura a IA nas definições.
                                </span>
                            )}
                        </div>
                        <button className="btn btn-secondary" style={{ borderRadius: '50px', fontWeight: 700, color: '#EF4444' }} onClick={() => this.handleDeleteClientData()}>
                            <Trash2 size={16} /> Eliminar Dados
                        </button>
                        <button className="btn btn-primary" style={{ borderRadius: '50px', fontWeight: 700 }} onClick={() => this.setState({ isProductionModalOpen: true, productionDate: new Date().toISOString().split('T')[0] })}>
                            <Beaker size={16} /> Marcar Produção
                        </button>
                    </div>
                    {aiError && (
                        <div style={{ fontSize: '0.85rem', color: '#B91C1C', marginBottom: '0.75rem' }}>
                            {aiError}
                            {(this.state.aiDebugPrompt || this.state.aiDebugResponse) && (
                                <span style={{ marginLeft: '0.75rem', display: 'inline-flex', gap: '0.5rem' }}>
                                    {this.state.aiDebugPrompt && (
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ padding: '0.3rem 0.75rem' }}
                                            onClick={() => this.setState({ showAiPrompt: !this.state.showAiPrompt })}
                                        >
                                            {this.state.showAiPrompt ? 'Ocultar prompt' : 'Ver prompt'}
                                        </button>
                                    )}
                                    {this.state.aiDebugResponse && (
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ padding: '0.3rem 0.75rem' }}
                                            onClick={() => this.setState({ showAiResponse: !this.state.showAiResponse })}
                                        >
                                            {this.state.showAiResponse ? 'Ocultar resposta' : 'Ver resposta'}
                                        </button>
                                    )}
                                </span>
                            )}
                        </div>
                    )}
                    {(this.state.showAiPrompt || this.state.showAiResponse) && (this.state.aiDebugPrompt || this.state.aiDebugResponse) && (
                        <div style={{ marginBottom: '1rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
                            {this.state.showAiPrompt && this.state.aiDebugPrompt && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Prompt enviado</div>
                                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem', lineHeight: 1.4, color: '#111827' }}>{this.state.aiDebugPrompt}</pre>
                                </div>
                            )}
                            {this.state.showAiResponse && this.state.aiDebugResponse && (
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>{this.state.aiDebugResponseLabel || 'Resposta da IA'}</div>
                                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem', lineHeight: 1.4, color: '#111827' }}>{this.state.aiDebugResponse}</pre>
                                </div>
                            )}
                        </div>
                    )}
                    {showQuestionnaireHint && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginBottom: '0.75rem' }}>
                            Preenche pelo menos um questionário para ativar a geração por IA.
                        </div>
                    )}

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
                                    Questionários ({this.state.questionnaires.length})
                                </h3>
                                {this.state.questionnaires.length === 0 ? (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Nenhum questionário associado.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {this.state.questionnaires.map((q) => {
                                            const when = q.date || q.createdAt || q.updatedAt;
                                            return (
                                                <div
                                                    key={q.id}
                                                    onClick={() => this.setState({ viewingQuestionnaire: q, isQuestionnaireModalOpen: true })}
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        padding: '0.75rem',
                                                        background: '#F9FAFB',
                                                        borderRadius: 'var(--radius-sm)',
                                                        border: '1px solid #E5E7EB',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Questionário</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>
                                                            {when ? new Date(when).toLocaleDateString() : 'Sem data'}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                                                        ID: {q.id}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
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
                                            <div
                                                key={r.id}
                                                onClick={() => this.setState({ viewingRecipe: r, isRecipeModalOpen: true })}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '0.75rem',
                                                    background: '#F9FAFB',
                                                    borderRadius: 'var(--radius-sm)',
                                                    border: '1px solid #E5E7EB',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{r.name}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>RE{r.code}</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        title="Ver/Editar Receita"
                                                        className="btn btn-secondary"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            this.setState({ viewingRecipe: r, isRecipeModalOpen: true });
                                                        }}
                                                        style={{ padding: '0.4rem', minWidth: 'auto', color: 'var(--color-primary)' }}
                                                    >
                                                        <FileText size={16} />
                                                    </button>
                                                    <button
                                                        title="Produzir esta Receita"
                                                        className="btn btn-secondary"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            this.setState({
                                                                selectedRecipeId: r.id,
                                                                productionWeight: this.getTotalFats(r),
                                                                productionDate: new Date().toISOString().split('T')[0],
                                                                isProductionModalOpen: true
                                                            });
                                                        }}
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
                    {this.renderQuestionnaireModal()}
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

        const ingredientService = IngredientService.getInstance();
        const ingredients = ingredientService.getAll();
        let calculatedWater = 0;
        let calculatedAlkali = 0;
        let liquidsDisplay = viewingRecipe.liquids;
        let lyeAdditivesDisplay = viewingRecipe.lyeAdditives;

        if (ingredients.length > 0) {
            try {
                const calc = this.props.appController.calculateRecipe({ recipe: viewingRecipe, ingredients });
                calculatedWater = calc.results.waterAmount;
                calculatedAlkali = calc.results.alkaliAmount;

                const ingredientById = new Map(ingredients.map(item => [item.id, item]));
                const waterIngredient = ingredients.find(ing => ing.kind === 'water');
                const hasWater = viewingRecipe.liquids.some(item => {
                    const ing = ingredientById.get(item.ingredientId);
                    return ing?.kind === 'water';
                });

                liquidsDisplay = viewingRecipe.liquids.map(item => {
                    const ing = ingredientById.get(item.ingredientId);
                    if (ing?.kind === 'water') {
                        return { ...item, amount: parseFloat(calculatedWater.toFixed(2)) };
                    }
                    return item;
                });

                if (!hasWater && waterIngredient) {
                    liquidsDisplay = [
                        {
                            id: 'calc-water',
                            ingredientId: waterIngredient.id,
                            name: waterIngredient.name,
                            amount: parseFloat(calculatedWater.toFixed(2)),
                            percentage: 0,
                            role: 'water'
                        },
                        ...liquidsDisplay
                    ];
                }

                const alkaliLabel = viewingRecipe.alkali === 'KOH' ? 'Potassa (KOH)' : 'Soda Cáustica (NaOH)';
                const alkaliItem: RecipeIngredient = {
                    id: 'calc-alkali',
                    ingredientId: 'calc-alkali',
                    name: alkaliLabel,
                    amount: parseFloat(calculatedAlkali.toFixed(2)),
                    percentage: 0,
                    role: 'other'
                };
                lyeAdditivesDisplay = [alkaliItem, ...viewingRecipe.lyeAdditives];
            } catch {
                liquidsDisplay = viewingRecipe.liquids;
                lyeAdditivesDisplay = viewingRecipe.lyeAdditives;
            }
        }

        const handleSave = () => {
            RecipeDomainService.getInstance().save(viewingRecipe);
            this.setState({ isRecipeModalOpen: false, viewingRecipe: null });
            this.loadData();
        };

        const handleDelete = () => {
            if (!confirm('Deseja eliminar esta receita? Esta ação é irreversível.')) return;
            RecipeService.getInstance().delete(viewingRecipe.id);
            this.setState({ isRecipeModalOpen: false, viewingRecipe: null });
            this.loadData();
        };

        const applyScale = (targetFats: number) => {
            const currentFats = this.getTotalFats(viewingRecipe);
            if (!currentFats || currentFats <= 0) return;
            const factor = targetFats / currentFats;
            const scaleItems = (items: RecipeIngredient[]) =>
                items.map(item => ({
                    ...item,
                    amount: parseFloat(((item.amount || 0) * factor).toFixed(2))
                }));

            const scaledFats = scaleItems(viewingRecipe.fats);
            const fatsTotal = scaledFats.reduce((sum, f) => sum + (f.amount || 0), 0);
            const normalizedFats = scaledFats.map(f => ({
                ...f,
                percentage: fatsTotal > 0 ? parseFloat(((f.amount / fatsTotal) * 100).toFixed(2)) : f.percentage
            }));

            this.setState({
                viewingRecipe: {
                    ...viewingRecipe,
                    fats: normalizedFats,
                    liquids: scaleItems(viewingRecipe.liquids),
                    functionalAdditives: scaleItems(viewingRecipe.functionalAdditives),
                    lyeAdditives: scaleItems(viewingRecipe.lyeAdditives),
                    traceAdditives: scaleItems(viewingRecipe.traceAdditives),
                    superfatOils: scaleItems(viewingRecipe.superfatOils),
                    essentialOils: scaleItems(viewingRecipe.essentialOils)
                }
            });
        };

        const handleConvertToProduction = () => {
            this.setState({
                selectedRecipeId: viewingRecipe.id,
                productionWeight: this.getTotalFats(viewingRecipe),
                productionDate: new Date().toISOString().split('T')[0],
                isProductionModalOpen: true
            });
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
                        <button className="btn btn-secondary" onClick={() => this.handleExportMarkdown(viewingRecipe)}>
                            <Download size={16} /> Exportar MD
                        </button>
                        <button className="btn btn-secondary" onClick={handleConvertToProduction}>
                            <Beaker size={16} /> Converter Produção
                        </button>
                        <button className="btn btn-secondary" style={{ color: '#EF4444' }} onClick={handleDelete}>
                            <Trash2 size={16} /> Eliminar
                        </button>
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

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <button className="btn btn-secondary" onClick={() => applyScale(1000)}>
                            Escalar 1000g
                        </button>
                        <button className="btn btn-secondary" onClick={() => applyScale(500)}>
                            Escalar 500g
                        </button>
                        <button className="btn btn-secondary" onClick={() => applyScale(250)}>
                            Escalar 250g
                        </button>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {this.renderRecipeGroup('Fase 1: Gorduras', viewingRecipe.fats)}
                            {this.renderRecipeGroup('Fase 2: Líquidos', liquidsDisplay)}
                            {this.renderRecipeGroup('Fase 2: Aditivos Funcionais', viewingRecipe.functionalAdditives)}
                            {this.renderRecipeGroup('Fase 2: Aditivos da Lixívia', lyeAdditivesDisplay)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {this.renderRecipeGroup('Fase 3: Aditivos Traço', viewingRecipe.traceAdditives)}
                            {this.renderRecipeGroup('Fase 3: Superfat Oils', viewingRecipe.superfatOils)}
                            {this.renderRecipeGroup('Fase 3: Óleos Essenciais', viewingRecipe.essentialOils)}
                        </div>
                    </div>

                    {viewingRecipe.aiRationale && viewingRecipe.aiRationale.length > 0 && (
                        <div>
                            <label className="form-label" style={{ fontWeight: 700 }}>Justificação da IA</label>
                            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                {viewingRecipe.aiRationale.map((item, idx) => (
                                    <li key={`ai-rationale-${idx}`}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label" style={{ fontWeight: 700 }}>Conversa com a IA</label>
                        <div style={{ border: '1px solid #E5E7EB', borderRadius: 'var(--radius-sm)', padding: '0.75rem', maxHeight: '220px', overflowY: 'auto', background: '#F9FAFB' }}>
                            {viewingRecipe.aiConversation && viewingRecipe.aiConversation.length > 0 ? (
                                viewingRecipe.aiConversation.map((msg, idx) => (
                                    <div key={`ai-msg-${idx}`} style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '0.25rem' }}>
                                            {msg.role === 'user' ? 'Tu' : 'IA'} · {new Date(msg.timestamp).toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: msg.role === 'assistant' ? 600 : 500 }}>
                                            {msg.message}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                                    Sem mensagens ainda.
                                </div>
                            )}
                        </div>
                        <textarea
                            className="form-control"
                            rows={3}
                            placeholder="Escreve aqui para a IA e recalcular a receita..."
                            value={this.state.aiFeedbackDraft}
                            onChange={(e) => this.setState({ aiFeedbackDraft: e.target.value })}
                            style={{ marginTop: '0.75rem' }}
                        />
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem' }}>
                            <button
                                className="btn btn-secondary"
                                disabled={!this.state.aiFeedbackDraft.trim() || this.state.isGeneratingAIRecipe}
                                onClick={() => this.handleGenerateRecipeAI(this.state.aiFeedbackDraft, viewingRecipe.id)}
                            >
                                {this.state.isGeneratingAIRecipe ? 'A gerar...' : 'Enviar e recalcular'}
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => this.downloadJsonFile(
                                    `${viewingRecipe.code || 'receita'}_ia_debug.json`,
                                    (() => {
                                        const response = viewingRecipe.aiLastResponse || null;
                                        const responseText = this.state.aiDebugResponse
                                            || (response ? JSON.stringify(response, null, 2) : null);
                                        return {
                                            prompt: viewingRecipe.aiLastPrompt || null,
                                            response,
                                            responseAt: viewingRecipe.aiLastResponseAt || null,
                                            responseText,
                                            responseLabel: this.state.aiDebugResponseLabel || null,
                                            conversation: viewingRecipe.aiConversation || [],
                                            recipeSnapshot: viewingRecipe
                                        };
                                    })()
                                )}
                            >
                                Exportar IA (JSON)
                            </button>
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

    private renderQuestionnaireModal() {
        const { viewingQuestionnaire } = this.state;
        if (!viewingQuestionnaire) return null;

        const renderField = (label: string, value: string | string[] | undefined) => {
            const text = Array.isArray(value) ? value.join(', ') : (value || '—');
            return (
                <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '0.25rem' }}>{label}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{text}</div>
                </div>
            );
        };

        return (
            <Modal
                isOpen={this.state.isQuestionnaireModalOpen}
                onClose={() => this.setState({ isQuestionnaireModalOpen: false, viewingQuestionnaire: null })}
                title={`Questionário: ${viewingQuestionnaire.clientName || 'Cliente'}`}
                maxWidth="900px"
                footer={
                    <button className="btn btn-secondary" onClick={() => this.setState({ isQuestionnaireModalOpen: false, viewingQuestionnaire: null })}>Fechar</button>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="modal-grid-2">
                        {renderField('Data', viewingQuestionnaire.date)}
                        {renderField('Faixa Etária', viewingQuestionnaire.ageGroup)}
                        {renderField('Frequência de Uso', viewingQuestionnaire.usageFrequency)}
                        {renderField('Zonas de Uso', viewingQuestionnaire.usageZones)}
                        {renderField('Reação Anterior', viewingQuestionnaire.previousReaction)}
                        {renderField('Info extra (sabão)', viewingQuestionnaire.extraSoapInfo)}
                        {renderField('Oleosidade', viewingQuestionnaire.oiliness)}
                        {renderField('Repuxamento', viewingQuestionnaire.drynessAfterWash)}
                        {renderField('Comichão', viewingQuestionnaire.irritationFrequency)}
                        {renderField('Curiosidade da pele', viewingQuestionnaire.skinCuriosity)}
                        {renderField('Problemas de pele', viewingQuestionnaire.skinProblems)}
                        {renderField('Problemas outros', viewingQuestionnaire.skinProblemsOther)}
                        {renderField('Medicações', viewingQuestionnaire.medications)}
                        {renderField('Medicações outras', viewingQuestionnaire.medicationsOther)}
                        {renderField('Detalhes pele', viewingQuestionnaire.extraSkinDetails)}
                        {renderField('Qualidade do sono', viewingQuestionnaire.sleepQuality)}
                        {renderField('Tipo de dieta', viewingQuestionnaire.dietType)}
                        {renderField('Ingestão de água', viewingQuestionnaire.waterIntake)}
                        {renderField('Transpiração', viewingQuestionnaire.sweatIntensity)}
                        {renderField('Ambiente', viewingQuestionnaire.environmentType)}
                        {renderField('Reação ao sol', viewingQuestionnaire.sunReaction)}
                        {renderField('Info ambiente', viewingQuestionnaire.extraEnvironmentInfo)}
                        {renderField('Produtos diários', viewingQuestionnaire.dailyProducts)}
                        {renderField('Produtos diários (outros)', viewingQuestionnaire.dailyProductsOther)}
                        {renderField('Cuidados especiais', viewingQuestionnaire.specialCareHabits)}
                        {renderField('Alergias', viewingQuestionnaire.allergies)}
                        {renderField('Alergias outras', viewingQuestionnaire.allergiesOther)}
                        {renderField('Restrições animais', viewingQuestionnaire.animalProductRestrictions)}
                        {renderField('Restrições outras', viewingQuestionnaire.animalProductRestrictionsOther)}
                        {renderField('Convicções pessoais', viewingQuestionnaire.personalConvictions)}
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
