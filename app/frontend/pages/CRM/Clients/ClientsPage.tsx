import { BaseListPage, BaseListPageState } from '../../../core/BaseListPage';
import { StatCard } from '../../../templates/StatsHeader';
import { Client } from '../../../../shared/types/Client';
import { ClientService } from '../../../../orchestrator/services/ClientService';
import { ClientActivityService } from '../../../../orchestrator/services/ClientActivityService';
import { Plus, Trash2, Edit2, Check, User, AlertTriangle, Beaker, Clock, FileText, Upload } from 'lucide-react';
import { Modal } from '../../../components/Modal';
import { RecipeService } from '../../../../orchestrator/services/RecipeService';
import { RecipeDomainService } from '../../../../orchestrator/services/RecipeDomainService';
import { QuestionnaireService } from '../../../../orchestrator/services/QuestionnaireService';
import { Recipe } from '../../../../shared/types/Recipe';
import { Questionnaire } from '../../../../shared/types/Questionnaire';
import { ClientDetailsPage } from './ClientDetailsPage';
import { formatRecipeReferenceOrFallback } from '../../../../shared/utils/recipeFormat';

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
    statsFilter: 'all' | 'active' | 'ready' | 'pending';
    activeClientIds: string[];
    readyClientIds: string[];
}

export class ClientsPage extends BaseListPage<Client, ClientsPageState, { onNavigate: (page: string, params?: any) => void }> {
    private importInputRef: HTMLInputElement | null = null;
    private importJsonInputRef: HTMLInputElement | null = null;
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
            isDetailsOpen: false,
            statsFilter: 'all',
            activeClientIds: [],
            readyClientIds: []
        } as ClientsPageState;
    }

    async componentDidMount() {
        this.loadClients();
    }

    private async loadClients() {
        const clients = ClientService.getInstance().getAll();
        const activities = ClientActivityService.getInstance().getAllActivities();
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

        const readyRecipeCodes = readyThisWeek.map(a => formatRecipeReferenceOrFallback(a.details?.recipeCode, 'Sem referencia'));
        const activeClientIds = Array.from(new Set(activeBatches.map(a => a.clientId).filter(Boolean))) as string[];
        const readyClientIds = Array.from(new Set(readyThisWeek.map(a => a.clientId).filter(Boolean))) as string[];

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
            },
            activeClientIds,
            readyClientIds
        } as any);
    }

    private async readCsvFile(file: File): Promise<string> {
        const buffer = await file.arrayBuffer();
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch {
            return new TextDecoder('windows-1252').decode(buffer);
        }
    }

    private normalizeHeader(value: string): string {
        return (value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    private parseCsv(content: string): string[][] {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < content.length; i += 1) {
            const char = content[i];
            const nextChar = content[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    currentField += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (char === ',' && !inQuotes) {
                currentRow.push(currentField);
                currentField = '';
                continue;
            }

            if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    i += 1;
                }
                currentRow.push(currentField);
                if (currentRow.some(value => value.trim() !== '')) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                continue;
            }

            currentField += char;
        }

        if (currentField.length > 0 || currentRow.length > 0) {
            currentRow.push(currentField);
            if (currentRow.some(value => value.trim() !== '')) {
                rows.push(currentRow);
            }
        }

        return rows;
    }

    private splitMulti(value: string): string[] {
        if (!value) return [];
        return value
            .split(',')
            .map(entry => entry.trim())
            .filter(entry => entry.length > 0);
    }

    private parseDateOnly(value: string): string {
        if (!value) return '';
        const datePart = value.trim().split(' ')[0];
        if (!datePart) return '';
        return datePart.replace(/\//g, '-');
    }

    private parseTimestampIso(value: string): string {
        if (!value) return '';
        const trimmed = value.trim();
        if (!trimmed) return '';
        const [datePart, timePart] = trimmed.split(' ');
        const isoDate = datePart.replace(/\//g, '-');
        const iso = timePart ? `${isoDate}T${timePart}` : isoDate;
        const parsed = new Date(iso);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toISOString();
    }

    private hashString(value: string): string {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    private async handleImportCsvChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await this.readCsvFile(file);
            const rows = this.parseCsv(text);
            if (rows.length < 2) {
                alert('CSV vazio ou invalido.');
                return;
            }

            const header = rows[0];
            const headerMap = new Map<string, number>();
            header.forEach((name, index) => {
                headerMap.set(this.normalizeHeader(name), index);
            });

            const findColumn = (needle: string) => {
                const normalizedNeedle = this.normalizeHeader(needle);
                for (const [key, index] of headerMap.entries()) {
                    if (key.includes(normalizedNeedle)) {
                        return index;
                    }
                }
                return -1;
            };

            const cols = {
                timestamp: findColumn('carimbo de data'),
                email: findColumn('endereco de email'),
                name: findColumn('nome completo'),
                phone: findColumn('numero de telemovel'),
                address: findColumn('morada completa'),
                usageFrequency: findColumn('frequencia costumas usar sabonete'),
                usageZones: findColumn('zonas do corpo pretendes usar o sabonete'),
                previousReaction: findColumn('reacao'),
                oiliness: findColumn('brilho oleoso'),
                drynessAfterWash: findColumn('repuxa'),
                irritationFrequency: findColumn('comichao'),
                skinProblems: findColumn('problemas de pele'),
                medications: findColumn('medicamentos'),
                sleepQuality: findColumn('dormir bem'),
                dietType: findColumn('tipo de alimentos'),
                waterIntake: findColumn('copos de agua'),
                sweatIntensity: findColumn('transpiras'),
                environmentType: findColumn('tipo de ambiente'),
                sunReaction: findColumn('ao sol'),
                dailyProducts: findColumn('produto na pele'),
                allergies: findColumn('alergia conhecida'),
                animalRestrictions: findColumn('restricao quanto ao uso de ingredientes'),
                consentsRequired: findColumn('informacoes importantes'),
                extraSoapInfo: findColumn('a pele fala em silencio'),
                skinCuriosity: findColumn('comportamento curioso'),
                extraSkinDetails: findColumn('mais algum detalhe sobre a tua pele'),
                extraEnvironmentInfo: findColumn('a pele tambem reage'),
                specialCareHabits: findColumn('cuidado especial que resulta bem contigo'),
                personalConvictions: findColumn('mais algum cuidado conviccao ou limite pessoal'),
                consentsOptional: findColumn('consentimentos opcionais'),
                ageGroup: findColumn('faixa etaria')
            };

            const getValue = (row: string[], index: number) => {
                if (index < 0 || index >= row.length) return '';
                return row[index]?.trim() || '';
            };

            const normalizeEmail = (value: string) => value.trim().toLowerCase();
            const normalizePhone = (value: string) => value.replace(/\D+/g, '');

            const existingClients = ClientService.getInstance().getAll();
            const clientsByEmail = new Map(existingClients.filter(c => c.email).map(c => [normalizeEmail(c.email), c]));
            const clientsByPhone = new Map(existingClients.filter(c => c.phone).map(c => [normalizePhone(c.phone), c]));

            const existingQuestionnaires = await QuestionnaireService.getQuestionnaires();
            const questionnaireIds = new Set(existingQuestionnaires.map(q => q.id));

            let createdClients = 0;
            let updatedClients = 0;
            let createdQuestionnaires = 0;
            let skippedRows = 0;

            for (const row of rows.slice(1)) {
                if (!row || row.length === 0) continue;

                const name = getValue(row, cols.name);
                const email = getValue(row, cols.email);
                const phone = getValue(row, cols.phone);
                const address = getValue(row, cols.address);

                if (!name && !email && !phone) {
                    skippedRows += 1;
                    continue;
                }

                const emailKey = email ? normalizeEmail(email) : '';
                const phoneKey = phone ? normalizePhone(phone) : '';
                let existing: Client | undefined;
                if (emailKey) {
                    existing = clientsByEmail.get(emailKey);
                }
                if (!existing && phoneKey) {
                    existing = clientsByPhone.get(phoneKey);
                }

                const requiredConsentText = getValue(row, cols.consentsRequired);
                const hasRequiredConsent = requiredConsentText.length > 0;
                const optionalConsentText = getValue(row, cols.consentsOptional);
                const consentFutureContact = /contactad|contacto|contacte/i.test(optionalConsentText);
                const consentAdvertising = /publicit|autorizo/i.test(optionalConsentText);

                const baseClient = {
                    id: existing?.id || Math.random().toString(36).substr(2, 9),
                    name: name || existing?.name || '',
                    email: email || existing?.email || '',
                    phone: phone || existing?.phone || '',
                    address: address || existing?.address || '',
                    consentCureProcess: existing?.consentCureProcess || hasRequiredConsent,
                    consentDataTruth: existing?.consentDataTruth || hasRequiredConsent,
                    consentRGPD: existing?.consentRGPD || hasRequiredConsent,
                    consentFutureContact: existing?.consentFutureContact || consentFutureContact,
                    consentAdvertising: existing?.consentAdvertising || consentAdvertising,
                    createdAt: existing?.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                ClientService.getInstance().save(baseClient);
                if (!existing) {
                    ClientActivityService.getInstance().addActivity({
                        id: '',
                        clientId: baseClient.id,
                        timestamp: new Date().toISOString(),
                        type: 'system',
                        title: 'Cliente Criado',
                        content: 'A ficha de cliente foi aberta no sistema.'
                    });
                }

                if (existing) {
                    updatedClients += 1;
                } else {
                    createdClients += 1;
                    if (emailKey) clientsByEmail.set(emailKey, baseClient);
                    if (phoneKey) clientsByPhone.set(phoneKey, baseClient);
                }

                const timestampRaw = getValue(row, cols.timestamp);
                const questionnaireIdBase = `${emailKey || phoneKey || name}-${timestampRaw}`;
                const questionnaireId = `q_${this.hashString(questionnaireIdBase)}`;
                if (questionnaireIds.has(questionnaireId)) {
                    continue;
                }

                const rawProducts = getValue(row, cols.dailyProducts);
                const productsList = this.splitMulti(rawProducts);
                const dailyProductsOther = rawProducts.includes(':') ? rawProducts.split(':').slice(1).join(':').trim() : '';
                const dailyProducts = rawProducts.toLowerCase().startsWith('nao') ? [] : productsList;

                const timestampIso = this.parseTimestampIso(timestampRaw) || new Date().toISOString();
                const questionnaire: Questionnaire = {
                    id: questionnaireId,
                    clientId: baseClient.id,
                    clientName: baseClient.name,
                    date: this.parseDateOnly(timestampRaw) || new Date().toISOString().split('T')[0],
                    ageGroup: getValue(row, cols.ageGroup),
                    usageFrequency: getValue(row, cols.usageFrequency),
                    usageZones: this.splitMulti(getValue(row, cols.usageZones)),
                    previousReaction: getValue(row, cols.previousReaction),
                    extraSoapInfo: getValue(row, cols.extraSoapInfo) || undefined,
                    oiliness: getValue(row, cols.oiliness),
                    drynessAfterWash: getValue(row, cols.drynessAfterWash),
                    irritationFrequency: getValue(row, cols.irritationFrequency),
                    skinCuriosity: getValue(row, cols.skinCuriosity) || undefined,
                    skinProblems: this.splitMulti(getValue(row, cols.skinProblems)),
                    skinProblemsOther: undefined,
                    medications: getValue(row, cols.medications),
                    medicationsOther: undefined,
                    extraSkinDetails: getValue(row, cols.extraSkinDetails) || undefined,
                    sleepQuality: getValue(row, cols.sleepQuality),
                    dietType: this.splitMulti(getValue(row, cols.dietType)),
                    waterIntake: getValue(row, cols.waterIntake),
                    sweatIntensity: getValue(row, cols.sweatIntensity),
                    environmentType: this.splitMulti(getValue(row, cols.environmentType)),
                    sunReaction: getValue(row, cols.sunReaction),
                    extraEnvironmentInfo: getValue(row, cols.extraEnvironmentInfo) || undefined,
                    dailyProducts,
                    dailyProductsOther: dailyProductsOther || undefined,
                    specialCareHabits: getValue(row, cols.specialCareHabits) || undefined,
                    allergies: getValue(row, cols.allergies),
                    allergiesOther: undefined,
                    animalProductRestrictions: getValue(row, cols.animalRestrictions),
                    animalProductRestrictionsOther: undefined,
                    personalConvictions: getValue(row, cols.personalConvictions) || undefined,
                    createdAt: timestampIso,
                    updatedAt: timestampIso
                };

                await QuestionnaireService.saveQuestionnaire(questionnaire);
                questionnaireIds.add(questionnaireId);
                createdQuestionnaires += 1;
            }

            await this.loadClients();
            alert(`Importacao concluida. Clientes novos: ${createdClients}, clientes atualizados: ${updatedClients}, questionarios novos: ${createdQuestionnaires}, linhas ignoradas: ${skippedRows}.`);
        } catch (error) {
            alert('Erro ao importar CSV.');
        } finally {
            event.target.value = '';
        }
    }

    private normalizeImportedClient(client: Partial<Client>): Client {
        const nowIso = new Date().toISOString();
        return {
            id: client.id || Math.random().toString(36).substr(2, 9),
            name: client.name || '',
            email: client.email || '',
            phone: client.phone || '',
            address: client.address || '',
            consentCureProcess: client.consentCureProcess ?? false,
            consentDataTruth: client.consentDataTruth ?? false,
            consentRGPD: client.consentRGPD ?? false,
            consentFutureContact: client.consentFutureContact ?? false,
            consentAdvertising: client.consentAdvertising ?? false,
            createdAt: client.createdAt || nowIso,
            updatedAt: nowIso
        };
    }

    private async handleImportClientJsonChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const payloadClient = parsed?.client || parsed;
            const payloadClients = parsed?.clients;
            const clients = Array.isArray(payloadClients)
                ? payloadClients
                : (payloadClient && payloadClient.name ? [payloadClient] : []);

            if (clients.length === 0) {
                alert('Ficheiro invalido para cliente.');
                return;
            }

            const existingActivities = ClientActivityService.getInstance().getAllActivities();
            const activityIds = new Set(existingActivities.map(a => a.id));
            const existingRecipes = RecipeService.getInstance().getAll();
            const recipeIds = new Set(existingRecipes.map(r => r.id));
            const existingQuestionnaires = await QuestionnaireService.getQuestionnaires();
            const questionnaireIds = new Set(existingQuestionnaires.map(q => q.id));

            for (const client of clients) {
                const normalized = this.normalizeImportedClient(client);
                const oldId = client.id || normalized.id;
                const existingClient = ClientService.getInstance().getById(normalized.id);
                ClientService.getInstance().save(normalized);
                if (!existingClient) {
                    ClientActivityService.getInstance().addActivity({
                        id: '',
                        clientId: normalized.id,
                        timestamp: new Date().toISOString(),
                        type: 'system',
                        title: 'Cliente Criado',
                        content: 'A ficha de cliente foi aberta no sistema.'
                    });
                }

                const activities = parsed?.activities || [];
                if (Array.isArray(activities)) {
                    activities
                        .filter((activity: any) => !activity.clientId || activity.clientId === oldId)
                        .forEach((activity: any) => {
                            const id = activity.id || Math.random().toString(36).substr(2, 9);
                            if (activityIds.has(id)) return;
                            activityIds.add(id);
                            ClientActivityService.getInstance().addActivity({ ...activity, id, clientId: normalized.id });
                        });
                }

                const recipes = parsed?.recipes || [];
                if (Array.isArray(recipes)) {
                    recipes
                        .filter((recipe: any) => !recipe.clientId || recipe.clientId === oldId)
                        .forEach((recipe: any) => {
                            const id = recipe.id || Math.random().toString(36).substr(2, 9);
                            if (recipeIds.has(id)) return;
                            recipeIds.add(id);
                            RecipeDomainService.getInstance().save({ ...recipe, id, clientId: normalized.id });
                        });
                }

                const questionnaires = parsed?.questionnaires || [];
                if (Array.isArray(questionnaires)) {
                    for (const questionnaire of questionnaires.filter((q: any) => !q.clientId || q.clientId === oldId)) {
                        const id = questionnaire.id || Math.random().toString(36).substr(2, 9);
                        if (questionnaireIds.has(id)) continue;
                        questionnaireIds.add(id);
                        await QuestionnaireService.saveQuestionnaire({ ...questionnaire, id, clientId: normalized.id, clientName: normalized.name });
                    }
                }
            }

            await this.loadClients();
            alert('Importacao de cliente concluida.');
        } catch (error) {
            alert('Erro ao importar cliente.');
        } finally {
            event.target.value = '';
        }
    }

    private handleImportCsvClick() {
        this.importInputRef?.click();
    }

    private handleImportJsonClick() {
        this.importJsonInputRef?.click();
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

        const existing = ClientService.getInstance().getById(editingClient.id);
        ClientService.getInstance().save(editingClient);
        if (!existing) {
            ClientActivityService.getInstance().addActivity({
                id: '',
                clientId: editingClient.id,
                timestamp: new Date().toISOString(),
                type: 'system',
                title: 'Cliente Criado',
                content: 'A ficha de cliente foi aberta no sistema.'
            });
        }
        this.loadClients();
        this.closeModal();
    }

    private handleDelete(id: string) {
        if (confirm('Tem a certeza que deseja eliminar este cliente?')) {
            ClientService.getInstance().delete(id);
            ClientActivityService.getInstance().deleteByClient(id);
            this.loadClients();
        }
    }

    renderStats() {
        const { stats } = this.state;
        const filterLabel = this.state.statsFilter === 'active'
            ? 'Receitas em Curso'
            : this.state.statsFilter === 'ready'
                ? 'Prontos esta Semana'
                : this.state.statsFilter === 'pending'
                    ? 'Avisos Pendentes'
                    : null;
        return (
            <>
                <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                    <StatCard
                        label="Total Clientes"
                        value={this.state.data.length}
                        color="var(--color-primary)"
                        icon={<User size={20} />}
                        onClick={() => this.setState({ statsFilter: 'all' })}
                    />
                    <StatCard
                        label="Receitas em Curso"
                        value={stats.activeBatches}
                        color="var(--color-accent)"
                        icon={<Beaker size={20} />}
                        onClick={() => this.setState({ statsFilter: this.state.statsFilter === 'active' ? 'all' : 'active' })}
                    />
                    <StatCard
                        label="Prontos esta Semana"
                        value={stats.readyThisWeek}
                        color="#3B82F6"
                        icon={<Clock size={20} />}
                        subtext={stats.readyRecipeCodes.length > 0 ? stats.readyRecipeCodes.join(', ') : 'Nenhum previsto'}
                        onClick={() => this.setState({ statsFilter: this.state.statsFilter === 'ready' ? 'all' : 'ready' })}
                    />
                    <div
                        className="card"
                        onClick={() => this.setState({ statsFilter: this.state.statsFilter === 'pending' ? 'all' : 'pending' })}
                        style={{
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            borderLeft: (stats.withoutRecipe > 0 || stats.withoutQuestionnaire > 0) ? '4px solid #F59E0B' : '1px solid #E5E7EB',
                            cursor: 'pointer'
                        }}
                    >
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
                {filterLabel && (
                    <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
                <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => this.handleImportCsvClick()}>
                    <Upload size={14} /> Importar CSV
                </button>
                <input
                    ref={(el) => { this.importInputRef = el; }}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: 'none' }}
                    onChange={(event) => this.handleImportCsvChange(event)}
                />
                <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => this.handleImportJsonClick()}>
                    <Upload size={14} /> Importar Cliente
                </button>
                <input
                    ref={(el) => { this.importJsonInputRef = el; }}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={(event) => this.handleImportClientJsonChange(event)}
                />
                <button className="btn btn-primary" style={{ borderRadius: '50px', padding: '0.5rem 1.5rem', fontWeight: 700 }} onClick={() => this.openModal()}>
                    <Plus size={18} /> Novo Cliente
                </button>
            </div>
        );
    }

    renderTable() {
        const term = this.state.searchQuery.toLowerCase();
        let filteredData = this.state.data;
        const { allRecipes, allQuestionnaires, activeClientIds, readyClientIds, statsFilter } = this.state;

        if (statsFilter === 'active') {
            filteredData = filteredData.filter(c => activeClientIds.includes(c.id));
        } else if (statsFilter === 'ready') {
            filteredData = filteredData.filter(c => readyClientIds.includes(c.id));
        } else if (statsFilter === 'pending') {
            filteredData = filteredData.filter(c => {
                const hasRecipe = allRecipes.some(r => r.clientId === c.id);
                const hasQuestionnaire = allQuestionnaires.some(q => q.clientId === c.id);
                return !hasRecipe || !hasQuestionnaire;
            });
        }

        filteredData = filteredData.filter(c =>
            c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term)
        );

        return (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap">
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
                                        <div
                                            style={{ fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => this.setState({ selectedClientId: client.id, isDetailsOpen: true })}
                                        >
                                            {client.name}
                                        </div>
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

                    <div className="modal-grid-2" style={{ gap: '1rem' }}>
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
