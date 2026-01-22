import React from 'react';
import { BaseListPage, BaseListPageState } from '../../../core/BaseListPage';
import { StatCard } from '../../../templates/StatsHeader';
import { Questionnaire } from '../../../../shared/types/Questionnaire';
import { QuestionnaireService } from '../../../../orchestrator/services/QuestionnaireService';
import { ClientService } from '../../../../orchestrator/services/ClientService';
import { Client } from '../../../../shared/types/Client';
import { Modal } from '../../../components/Modal';
import { Plus, Trash2, Edit2, FileText, Upload, Download } from 'lucide-react';

interface QuestionnairesPageState extends BaseListPageState<Questionnaire> {
    isModalOpen: boolean;
    editingQuestionnaire: Partial<Questionnaire> | null;
    clients: Client[];
    activeSection: number;
}

export class QuestionnairesPage extends BaseListPage<Questionnaire, QuestionnairesPageState> {
    private importInputRef: HTMLInputElement | null = null;
    constructor(props: any) {
        super(props);
        this.state = {
            ...this.getInitialState(),
            isModalOpen: false,
            editingQuestionnaire: null,
            clients: [],
            activeSection: 0
        } as QuestionnairesPageState;
    }

    async componentDidMount() {
        await this.loadData();
    }

    async loadData() {
        const data = await QuestionnaireService.getQuestionnaires();
        const clients = ClientService.getInstance().getAll();
        this.setState({ data, clients });
    }

    private openModal(questionnaire?: Questionnaire) {
        if (questionnaire) {
            this.setState({ isModalOpen: true, editingQuestionnaire: { ...questionnaire }, activeSection: 0 });
        } else {
            this.setState({
                isModalOpen: true,
                editingQuestionnaire: {
                    id: Math.random().toString(36).substr(2, 9),
                    date: new Date().toISOString().split('T')[0],
                    usageZones: [],
                    skinProblems: [],
                    dietType: [],
                    environmentType: [],
                    dailyProducts: []
                },
                activeSection: 0
            });
        }
    }

    private closeModal() {
        this.setState({ isModalOpen: false, editingQuestionnaire: null });
    }

    private async handleSave() {
        const { editingQuestionnaire } = this.state;
        if (!editingQuestionnaire || !editingQuestionnaire.clientId) {
            alert('Por favor, selecione um cliente.');
            return;
        }

        // Auto-fill client name
        const client = this.state.clients.find(c => c.id === editingQuestionnaire.clientId);
        if (client) {
            editingQuestionnaire.clientName = client.name;
        }

        await QuestionnaireService.saveQuestionnaire(editingQuestionnaire as Questionnaire);
        this.closeModal();
        await this.loadData();
    }

    private async handleDelete(id: string) {
        if (confirm('Tem a certeza que deseja eliminar este questionário?')) {
            await QuestionnaireService.deleteQuestionnaire(id);
            await this.loadData();
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

    private handleExportQuestionnaire(questionnaire: Questionnaire) {
        const payload = {
            version: '1.0.0',
            type: 'questionnaire',
            exportedAt: new Date().toISOString(),
            questionnaire
        };
        const safeName = (questionnaire.clientName || 'questionario').replace(/\s+/g, '_');
        this.downloadJsonFile(`questionario_${safeName}.json`, payload);
    }

    private async handleImportQuestionnaireChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const items = Array.isArray(parsed)
                ? parsed
                : (parsed?.questionnaires || parsed?.questionnaire ? (parsed.questionnaires || [parsed.questionnaire]) : [parsed]);
            for (const item of items) {
                if (!item || typeof item !== 'object') continue;
                if (!item.id) {
                    item.id = Math.random().toString(36).substr(2, 9);
                }
                await QuestionnaireService.saveQuestionnaire(item as Questionnaire);
            }
            await this.loadData();
        } catch (error) {
            alert('Erro ao importar questionario.');
        } finally {
            event.target.value = '';
        }
    }

    private handleImportQuestionnaireClick() {
        this.importInputRef?.click();
    }

    renderStats() {
        const total = this.state.data.length;
        const drynessCount = this.state.data.filter(q => q.drynessAfterWash && q.drynessAfterWash !== 'Nunca').length;
        const oilinessCount = this.state.data.filter(q => q.oiliness === 'Quase sempre').length;
        const irritationCount = this.state.data.filter(q => (q.irritationFrequency || '').toLowerCase().startsWith('com')).length;

        return (
            <div className="stats-grid">
                <StatCard label="Total Questionarios" value={total} color="var(--color-primary)" />
                <StatCard label="Pele seca" value={drynessCount} color="#F59E0B" />
                <StatCard label="Pele oleosa" value={oilinessCount} color="#3B82F6" />
                <StatCard label="Irritacao freq." value={irritationCount} color="#EF4444" />
            </div>
        );
    }

    renderFilters() {
        return (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                <div style={{ flex: 1 }}></div>
                <button className="btn btn-secondary" style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }} onClick={() => this.handleImportQuestionnaireClick()}>
                    <Upload size={14} /> Importar
                </button>
                <input
                    ref={(el) => { this.importInputRef = el; }}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={(event) => this.handleImportQuestionnaireChange(event)}
                />
                <button className="btn btn-primary" style={{ borderRadius: '50px', padding: '0.5rem 1.5rem', fontWeight: 700 }} onClick={() => this.openModal()}>
                    <Plus size={18} /> Novo Questionário
                </button>
            </div>
        );
    }

    renderTable() {
        const term = this.state.searchQuery.toLowerCase();
        const filteredData = this.state.data.filter(q =>
            q.clientName.toLowerCase().includes(term)
        );

        if (filteredData.length === 0) {
            return (
                <div className="card" style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    <FileText size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                    <p>Nenhum questionário encontrado.</p>
                </div>
            );
        }

        return (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #eee', background: '#F9FAFB' }}>
                            <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.85rem' }}>Cliente</th>
                            <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.85rem' }}>Data</th>
                            <th style={{ textAlign: 'left', padding: '1rem 1.5rem', fontSize: '0.85rem' }}>Faixa Etária</th>
                            <th style={{ textAlign: 'right', padding: '1rem 1.5rem', fontSize: '0.85rem' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.map((q: Questionnaire) => (
                            <tr key={q.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>
                                    <span
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => this.openModal(q)}
                                    >
                                        {q.clientName}
                                    </span>
                                </td>
                                <td style={{ padding: '1rem 1.5rem', color: 'var(--color-text-secondary)' }}>{q.date}</td>
                                <td style={{ padding: '1rem 1.5rem' }}>{q.ageGroup}</td>
                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ padding: '0.4rem', minWidth: 'auto', marginRight: '0.5rem' }}
                                        onClick={() => this.handleExportQuestionnaire(q)}
                                        title="Exportar"
                                    >
                                        <Download size={16} />
                                    </button>
                                    <button className="btn btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto', marginRight: '0.5rem' }} onClick={() => this.openModal(q)}>
                                        <Edit2 size={16} />
                                    </button>
                                    <button className="btn btn-secondary" style={{ padding: '0.4rem', minWidth: 'auto', color: '#DC2626' }} onClick={() => this.handleDelete(q.id)}>
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            </div>
        );
    }

    private renderSectionTab(index: number, label: string) {
        const active = this.state.activeSection === index;
        return (
            <button
                key={index}
                onClick={() => this.setState({ activeSection: index })}
                style={{
                    padding: '0.75rem 1rem',
                    border: 'none',
                    background: active ? 'var(--color-primary-light)' : 'transparent',
                    color: active ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)',
                    fontWeight: active ? 700 : 500,
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                }}
            >
                {label}
            </button>
        );
    }

    private renderQuestionGroup(label: string, children: React.ReactNode) {
        return (
            <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-main)' }}>{label}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {children}
                </div>
            </div>
        );
    }

    private renderRadio(name: string, value: string, current: string, onChange: (val: string) => void) {
        return (
            <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} />
                <span>{value}</span>
            </label>
        );
    }

    private renderCheckbox(value: string, currentList: string[], onChange: (newList: string[]) => void) {
        const checked = currentList.includes(value);
        return (
            <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                        if (e.target.checked) {
                            onChange([...currentList, value]);
                        } else {
                            onChange(currentList.filter(v => v !== value));
                        }
                    }}
                />
                <span>{value}</span>
            </label>
        );
    }

    private renderModal() {
        const { editingQuestionnaire, activeSection, clients } = this.state;
        if (!editingQuestionnaire) return null;

        const updateField = (field: keyof Questionnaire, value: any) => {
            this.setState({ editingQuestionnaire: { ...editingQuestionnaire, [field]: value } });
        };

        const sections = [
            "Geral & Idade",
            "Uso & Frequência",
            "Estado da Pele",
            "Problemas & Saúde",
            "Estilo de Vida",
            "Cuidados & Alergias"
        ];

        return (
            <Modal
                isOpen={this.state.isModalOpen}
                onClose={() => this.closeModal()}
                title="Questionário de Pele"
                footer={
                    <>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => this.closeModal()}>Cancelar</button>
                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => this.handleSave()}>Guardar Questionário</button>
                    </>
                }
            >
                <div style={{ display: 'flex', gap: '2rem', minHeight: '500px' }}>
                    <div style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderRight: '1px solid #eee', paddingRight: '1rem' }}>
                        {sections.map((label, i) => this.renderSectionTab(i, label))}
                    </div>

                    <div style={{ flex: 1 }}>
                        {activeSection === 0 && (
                            <>
                                <div className="modal-grid-2" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Selecionar Cliente *</label>
                                        <select
                                            className="form-control"
                                            value={editingQuestionnaire.clientId || ''}
                                            onChange={(e) => updateField('clientId', e.target.value)}
                                        >
                                            <option value="">-- Escolha um cliente --</option>
                                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Data do Questionário</label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={editingQuestionnaire.date}
                                            onChange={(e) => updateField('date', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {this.renderQuestionGroup("Faixa etária", [
                                    "0–6 meses", "6–12 meses", "1–2 anos", "2–3 anos", "3–5 anos", "5–12 anos", "12–18 anos", "18–40 anos", "40+ anos"
                                ].map(val => this.renderRadio('ageGroup', val, editingQuestionnaire.ageGroup || '', (v) => updateField('ageGroup', v))))}
                            </>
                        )}

                        {activeSection === 1 && (
                            <>
                                {this.renderQuestionGroup("Com que frequência costumas usar sabonete?", [
                                    "Uma vez por dia ou menos", "Duas vezes por dia", "Mais de duas vezes por dia"
                                ].map(val => this.renderRadio('usageFrequency', val, editingQuestionnaire.usageFrequency || '', (v) => updateField('usageFrequency', v))))}

                                {this.renderQuestionGroup("Em que zonas do corpo pretendes usar o sabonete? (Escolha múltipla)", [
                                    "Corpo", "Rosto", "Zonas íntimas", "Mãos", "Pés"
                                ].map(val => this.renderCheckbox(val, editingQuestionnaire.usageZones || [], (v) => updateField('usageZones', v))))}

                                {this.renderQuestionGroup("Alguma vez tiveste uma reação (vermelhidão, ardor, borbulhas, etc.)?", [
                                    "Sim", "Não"
                                ].map(val => this.renderRadio('previousReaction', val, editingQuestionnaire.previousReaction || '', (v) => updateField('previousReaction', v))))}

                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Queres contar-nos algo mais sobre o uso?</label>
                                    <textarea
                                        className="form-control"
                                        value={editingQuestionnaire.extraSoapInfo || ''}
                                        onChange={(e) => updateField('extraSoapInfo', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </>
                        )}

                        {activeSection === 2 && (
                            <>
                                {this.renderQuestionGroup("Costumas notar a pele com brilho oleoso ao longo do dia?", [
                                    "Nunca", "Às vezes", "Quase sempre"
                                ].map(val => this.renderRadio('oiliness', val, editingQuestionnaire.oiliness || '', (v) => updateField('oiliness', v))))}

                                {this.renderQuestionGroup("Sentes que a pele repuxa ou fica seca depois de lavar?", [
                                    "Nunca", "Às vezes", "Frequentemente"
                                ].map(val => this.renderRadio('drynessAfterWash', val, editingQuestionnaire.drynessAfterWash || '', (v) => updateField('drynessAfterWash', v))))}

                                {this.renderQuestionGroup("Costumas ter comichão, vermelhidão ou descamação?", [
                                    "Não", "Às vezes", "Com frequência"
                                ].map(val => this.renderRadio('irritationFrequency', val, editingQuestionnaire.irritationFrequency || '', (v) => updateField('irritationFrequency', v))))}

                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Mudança repentina ou comportamento curioso?</label>
                                    <textarea
                                        className="form-control"
                                        value={editingQuestionnaire.skinCuriosity || ''}
                                        onChange={(e) => updateField('skinCuriosity', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </>
                        )}

                        {activeSection === 3 && (
                            <>
                                {this.renderQuestionGroup("Alguma vez tiveste algum destes problemas de pele?", [
                                    "Acne", "Eczema", "Psoríase", "Rosácea", "Urticária ou alergias", "Não"
                                ].map(val => this.renderCheckbox(val, editingQuestionnaire.skinProblems || [], (v) => updateField('skinProblems', v))))}

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Outro problema:</label>
                                    <input type="text" className="form-control" value={editingQuestionnaire.skinProblemsOther || ''} onChange={(e) => updateField('skinProblemsOther', e.target.value)} />
                                </div>

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Estás a tomar antidepressivos ou outros medicamentos que afetem a pele?</label>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                                        {this.renderRadio('med', 'Não', editingQuestionnaire.medications || '', (v) => updateField('medications', v))}
                                        {this.renderRadio('med', 'Outra', editingQuestionnaire.medications || '', (v) => updateField('medications', v))}
                                    </div>
                                    {editingQuestionnaire.medications === 'Outra' && (
                                        <input type="text" className="form-control" placeholder="Especifique o medicamento" value={editingQuestionnaire.medicationsOther || ''} onChange={(e) => updateField('medicationsOther', e.target.value)} />
                                    )}
                                </div>

                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Mais algum detalhe ou tratamento?</label>
                                    <textarea
                                        className="form-control"
                                        value={editingQuestionnaire.extraSkinDetails || ''}
                                        onChange={(e) => updateField('extraSkinDetails', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </>
                        )}

                        {activeSection === 4 && (
                            <>
                                <div className="modal-grid-2" style={{ gap: '1.5rem' }}>
                                    {this.renderQuestionGroup("Dorme bem e com regularidade?", [
                                        "Sim", "Mais ou menos", "Mal"
                                    ].map(val => this.renderRadio('sleep', val, editingQuestionnaire.sleepQuality || '', (v) => updateField('sleepQuality', v))))}

                                    {this.renderQuestionGroup("Bebe quanta água por dia?", [
                                        "Menos de 3", "3 a 6", "Mais de 6"
                                    ].map(val => this.renderRadio('water', val, editingQuestionnaire.waterIntake || '', (v) => updateField('waterIntake', v))))}
                                </div>

                                {this.renderQuestionGroup("Tipo de alimentos mais frequentes?", [
                                    "Frutas e legumes", "Açúcares e doces", "Alimentos fritos ou processados", "Lacticínios", "Nenhum destes em excesso"
                                ].map(val => this.renderCheckbox(val, editingQuestionnaire.dietType || [], (v) => updateField('dietType', v))))}

                                <div className="modal-grid-2" style={{ gap: '1.5rem' }}>
                                    {this.renderQuestionGroup("Ambiente onde vives? (Escolha múltipla)", [
                                        "Húmido", "Seco", "Muito frio", "Muito quente"
                                    ].map(val => this.renderCheckbox(val, editingQuestionnaire.environmentType || [], (v) => updateField('environmentType', v))))}

                                    {this.renderQuestionGroup("Ao sol, a tua pele...", [
                                        "Bronzeia com facilidade", "Queima com facilidade"
                                    ].map(val => this.renderRadio('sun', val, editingQuestionnaire.sunReaction || '', (v) => updateField('sunReaction', v))))}
                                </div>

                                {this.renderQuestionGroup("Transpiras com facilidade ou odor acentuado?", [
                                    "Sim", "Não"
                                ].map(val => this.renderRadio('sweat', val, editingQuestionnaire.sweatIntensity || '', (v) => updateField('sweatIntensity', v))))}

                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Queres contar-nos algo sobre o ambiente onde vives ou trabalhas?</label>
                                    <textarea
                                        className="form-control"
                                        value={editingQuestionnaire.extraEnvironmentInfo || ''}
                                        onChange={(e) => updateField('extraEnvironmentInfo', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </>
                        )}

                        {activeSection === 5 && (
                            <>
                                {this.renderQuestionGroup("Usas produtos no dia a dia?", [
                                    "Não", "Sim: Hidratante", "Sim: Protetor solar"
                                ].map(val => this.renderCheckbox(val, editingQuestionnaire.dailyProducts || [], (v) => updateField('dailyProducts', v))))}
                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <input type="text" className="form-control" placeholder="Outro produto" value={editingQuestionnaire.dailyProductsOther || ''} onChange={(e) => updateField('dailyProductsOther', e.target.value)} />
                                </div>

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Cuidado especial que resulta bem contigo?</label>
                                    <textarea
                                        className="form-control"
                                        value={editingQuestionnaire.specialCareHabits || ''}
                                        onChange={(e) => updateField('specialCareHabits', e.target.value)}
                                        rows={2}
                                    />
                                </div>

                                {this.renderQuestionGroup("Alergias conhecidas (meds, comida, pó)?", [
                                    "Não", "Outra"
                                ].map(val => this.renderRadio('allergies', val, editingQuestionnaire.allergies || '', (v) => updateField('allergies', v))))}
                                {editingQuestionnaire.allergies === 'Outra' && (
                                    <input type="text" className="form-control" style={{ marginBottom: '1.5rem' }} value={editingQuestionnaire.allergiesOther || ''} onChange={(e) => updateField('allergiesOther', e.target.value)} />
                                )}

                                {this.renderQuestionGroup("Restrição quanto a origem animal?", [
                                    "Nenhuma", "Vegano", "Vegetariano (mel/leite ok)", "Religiosa: sem vaca", "Religiosa: sem porco", "Outra"
                                ].map(val => this.renderRadio('restrictions', val, editingQuestionnaire.animalProductRestrictions || '', (v) => updateField('animalProductRestrictions', v))))}
                                {editingQuestionnaire.animalProductRestrictions === 'Outra' && (
                                    <input type="text" className="form-control" style={{ marginBottom: '1.5rem' }} value={editingQuestionnaire.animalProductRestrictionsOther || ''} onChange={(e) => updateField('animalProductRestrictionsOther', e.target.value)} />
                                )}

                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Algum cuidado ou convicção pessoal?</label>
                                    <textarea
                                        className="form-control"
                                        value={editingQuestionnaire.personalConvictions || ''}
                                        onChange={(e) => updateField('personalConvictions', e.target.value)}
                                        rows={3}
                                    />
                                </div>
                            </>
                        )}
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
            </>
        );
    }
}
