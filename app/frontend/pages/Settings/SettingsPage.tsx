import { BasePage, BasePageState } from '../../core/BasePage';
import { SettingsService } from '../../../backend/infrastructure/services/SettingsService';
import type { AppSettings } from '../../../shared/settings/AppSettings';
import { StorageKeys } from '../../../shared/constants/StorageKeys';
import { AppConstants } from '../../../shared/constants/AppConstants';
import { Save, RefreshCw, Upload, Download, Database, Lock, Cloud, Eye, EyeOff, Sparkles } from 'lucide-react';
import { BackupService } from '../../../backend/application/backup/BackupService';
import { FirestoreSyncService } from '../../../orchestrator/services/FirestoreSyncService';
import type { AppController } from '../../../orchestrator/services/AppController';
import { showToast } from '../../components/Toast';

type SettingsPageProps = {
    appController: AppController;
};

interface SettingsState extends BasePageState {
    settings: AppSettings;
    syncEnabled: boolean;
    deviceId: string;
    authEmail: string;
    authUid: string;
    syncPassword: string;
    showSyncPassword: boolean;
    showBackupPassword: boolean;
    lastSyncSuccess: string;
    lastSyncError: string;
    remoteUpdatedAt: string;
    remoteDeviceId: string;
    localBackupUpdatedAt: string;
    localBackupSize: string;
    openaiApiKeyDraft: string;
    openaiApiKeyTouched: boolean;
    hasStoredOpenaiKey: boolean;
    showOpenaiApiKey: boolean;
    openaiModels: string[];
    openaiModelsLoading: boolean;
    openaiModelsError: string;
}

const SYNC_ENABLED_KEY = StorageKeys.SYNC_ENABLED;
const DEVICE_ID_KEY = StorageKeys.DEVICE_ID;
const SYNC_LAST_SUCCESS_KEY = StorageKeys.SYNC_LAST_SUCCESS;
const SYNC_LAST_ERROR_KEY = StorageKeys.SYNC_LAST_ERROR;
const AUTO_BACKUP_KEY = StorageKeys.AUTO_BACKUP;
const AUTO_BACKUP_TS_KEY = StorageKeys.AUTO_BACKUP_TIMESTAMP;
const SYNC_PASSWORD_KEY = StorageKeys.SYNC_PASSWORD;

export class SettingsPage extends BasePage<SettingsPageProps, SettingsState> {

    protected getInitialState(): Partial<SettingsState> {
        const storedSettings = SettingsService.getInstance().getSettings();
        const storedEnabled = localStorage.getItem(SYNC_ENABLED_KEY);
        const storedDeviceId = localStorage.getItem(DEVICE_ID_KEY) || '';
        const storedLastSync = localStorage.getItem(SYNC_LAST_SUCCESS_KEY) || '';
        const storedLastError = localStorage.getItem(SYNC_LAST_ERROR_KEY) || '';
        const storedLocalTs = localStorage.getItem(AUTO_BACKUP_TS_KEY) || '';
        const storedLocalData = localStorage.getItem(AUTO_BACKUP_KEY) || '';
        const storedSyncPassword = localStorage.getItem(SYNC_PASSWORD_KEY) || '';
        const hasStoredOpenaiKey = !!storedSettings.openaiApiKey;
        const normalizedOpenaiModel = storedSettings.openaiModel || 'gpt-4.1-mini';
        const storedOpenaiModels = Array.isArray(storedSettings.openaiModels) ? storedSettings.openaiModels : [];
        return {
            settings: { ...storedSettings, openaiModel: normalizedOpenaiModel, openaiModels: storedOpenaiModels },
            syncEnabled: storedEnabled === null ? true : storedEnabled === 'true',
            deviceId: storedDeviceId,
            authEmail: '',
            authUid: '',
            syncPassword: storedSyncPassword,
            showSyncPassword: false,
            showBackupPassword: false,
            lastSyncSuccess: storedLastSync,
            lastSyncError: storedLastError,
            remoteUpdatedAt: '',
            remoteDeviceId: '',
            localBackupUpdatedAt: storedLocalTs,
            localBackupSize: storedLocalData ? `${storedLocalData.length} bytes` : '0 bytes',
            openaiApiKeyDraft: '',
            openaiApiKeyTouched: false,
            hasStoredOpenaiKey,
            showOpenaiApiKey: false,
            openaiModels: storedOpenaiModels,
            openaiModelsLoading: false,
            openaiModelsError: ''
        };
    }

    async componentDidMount() {
        const user = await FirestoreSyncService.getInstance().getCurrentUserAsync();
        if (user) {
            this.setState({
                authEmail: user.email || '',
                authUid: user.uid || ''
            });
        }
        this.refreshLocalBackupStatus();
    }

    private async handleRefreshModels() {
        if (!this.props.appController.hasAIConfigured()) {
            this.setState({ openaiModels: [], openaiModelsError: 'Configura a API key primeiro.' });
            return;
        }
        this.setState({ openaiModelsLoading: true, openaiModelsError: '' });
        try {
            const models = await this.props.appController.getAvailableOpenAIModels();
            const currentModel = this.state.settings.openaiModel || 'gpt-4.1-mini';
            const unique = Array.from(new Set(models));
            if (currentModel && !unique.includes(currentModel)) {
                unique.unshift(currentModel);
            }
            SettingsService.getInstance().updateSettings({ openaiModels: unique });
            this.setState(prev => ({
                openaiModels: unique,
                openaiModelsLoading: false,
                settings: { ...prev.settings, openaiModels: unique }
            }));
        } catch (error) {
            this.setState({
                openaiModels: [],
                openaiModelsLoading: false,
                openaiModelsError: 'Não foi possível obter modelos.'
            });
        }
    }

    private handleUpdate(field: keyof AppSettings, value: any) {
        this.setState(prev => ({
            settings: { ...prev.settings, [field]: value }
        }));
    }

    private async handleSave() {
        const nextSettings = { ...this.state.settings };
        if (this.state.openaiApiKeyTouched) {
            nextSettings.openaiApiKey = this.state.openaiApiKeyDraft.trim();
        }
        if (!nextSettings.openaiModel) {
            nextSettings.openaiModel = 'gpt-4.1-mini';
        }
        SettingsService.getInstance().updateSettings(nextSettings);
        this.persistSyncSettings();

        // Realizar backup automático se ativo
        if (nextSettings.autoBackupEnabled) {
            await BackupService.getInstance().performAutoBackup();
            this.refreshLocalBackupStatus();
        }

        showToast('Configurações guardadas com sucesso!', 'success');
        const refreshedSettings = SettingsService.getInstance().getSettings();
        this.setState({
            settings: refreshedSettings,
            deviceId: localStorage.getItem(DEVICE_ID_KEY) || this.state.deviceId,
            openaiApiKeyDraft: '',
            openaiApiKeyTouched: false,
            hasStoredOpenaiKey: !!refreshedSettings.openaiApiKey
        });
    }

    private async handleExport() {
        const json = await BackupService.getInstance().exportAllData();
        BackupService.getInstance().downloadBackup(json);
    }

    private async handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const text = await file.text();
            const success = await BackupService.getInstance().importAllData(text);
            if (success) {
                showToast('Dados importados com sucesso! A página será recarregada.', 'success');
                window.setTimeout(() => location.reload(), 500);
            } else {
                showToast('Erro ao importar backup. Verifique o ficheiro.', 'error');
            }
        };
        input.click();
    }

    private handleReset() {
        const confirmed = confirm('Tem a certeza que deseja repor as configuracoes e apagar TODOS os dados da app?');
        if (confirmed) {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (key && key.startsWith(StorageKeys.PREFIX)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach((key) => localStorage.removeItem(key));
            location.reload();
        }
    }

    private async handleTestAutoBackup() {
        await BackupService.getInstance().performAutoBackup();
        this.refreshLocalBackupStatus();
        this.setState({ settings: SettingsService.getInstance().getSettings() });
        showToast('Backup automático realizado com sucesso! Verifique a data/hora abaixo.', 'success');
    }

    private async handleDownloadAutoBackup() {
        BackupService.getInstance().downloadAutoBackup();
    }

    private async handleSignIn() {
        await FirestoreSyncService.getInstance().signIn();
        const user = FirestoreSyncService.getInstance().getCurrentUser();
        this.setState({
            authEmail: user?.email || '',
            authUid: user?.uid || ''
        });
        this.refreshLocalBackupStatus();
    }

    private async handleSignOut() {
        await FirestoreSyncService.getInstance().signOut();
        this.setState({
            authEmail: '',
            authUid: ''
        });
    }

    private async handleForceSync() {
        this.persistSyncSettings();
        await BackupService.getInstance().performAutoBackupNow();
        const ok = await FirestoreSyncService.getInstance().forceSyncNow();
        const lastSync = localStorage.getItem(SYNC_LAST_SUCCESS_KEY) || '';
        const lastError = localStorage.getItem(SYNC_LAST_ERROR_KEY) || '';
        this.refreshLocalBackupStatus();
        this.setState({
            lastSyncSuccess: lastSync,
            lastSyncError: lastError,
            settings: SettingsService.getInstance().getSettings()
        });
        if (!ok) {
            showToast('Não foi possível sincronizar agora. Confirme se há backup automático local e se está autenticado.', 'warning');
        }
    }

    private async handleRefreshRemoteStatus() {
        const status = await FirestoreSyncService.getInstance().getRemoteStatus();
        const lastError = localStorage.getItem(SYNC_LAST_ERROR_KEY) || '';
        this.setState({
            remoteUpdatedAt: status?.updatedAt || '',
            remoteDeviceId: status?.deviceId || '',
            lastSyncError: lastError
        });
        this.refreshLocalBackupStatus();
    }

    private async handlePullRemote() {
        const applied = await FirestoreSyncService.getInstance().pullRemoteNow();
        const lastError = localStorage.getItem(SYNC_LAST_ERROR_KEY) || '';
        this.refreshLocalBackupStatus();
        this.setState({ lastSyncError: lastError });
        if (!applied) {
            showToast('Nada para atualizar ou não foi possível puxar o remoto. Verifique autenticação e estado remoto.', 'info');
        } else {
            const data = localStorage.getItem(AUTO_BACKUP_KEY);
            let ok = false;
            if (data && data.startsWith(AppConstants.ENCRYPTED_PREFIX)) {
                const settings = SettingsService.getInstance().getSettings();
                ok = await BackupService.getInstance().restoreAutoBackup(settings.autoBackupPassword);
            } else if (data) {
                ok = await BackupService.getInstance().importAllData(data);
            }
            if (ok) {
            localStorage.removeItem(StorageKeys.SYNC_PENDING_IMPORT);
            location.reload();
            return;
        }
            showToast('Dados remotos aplicados ao backup local, mas não foi possível restaurar. Verifique a password do backup local.', 'warning');
        }
    }

    private refreshLocalBackupStatus() {
        const storedLocalTs = localStorage.getItem(AUTO_BACKUP_TS_KEY) || '';
        const storedLocalData = localStorage.getItem(AUTO_BACKUP_KEY) || '';
        this.setState({
            localBackupUpdatedAt: storedLocalTs,
            localBackupSize: storedLocalData ? `${storedLocalData.length} bytes` : '0 bytes'
        });
    }

    private persistSyncSettings() {
        localStorage.setItem(SYNC_ENABLED_KEY, String(this.state.syncEnabled));
        if (this.state.syncPassword.trim()) {
            localStorage.setItem(SYNC_PASSWORD_KEY, this.state.syncPassword.trim());
        } else {
            localStorage.removeItem(SYNC_PASSWORD_KEY);
        }
    }

    protected renderActions() {
        return null;
    }

    renderContent() {
        const {
            settings,
            syncEnabled,
            deviceId,
            authEmail,
            authUid,
            syncPassword,
            lastSyncSuccess,
            lastSyncError,
            remoteUpdatedAt,
            remoteDeviceId,
            localBackupUpdatedAt,
            localBackupSize
        } = this.state;
        const { openaiModels, openaiModelsLoading, openaiModelsError } = this.state;
        const aiConfigured = this.props.appController.hasAIConfigured();
        const apiKeyPlaceholder = this.state.hasStoredOpenaiKey && !this.state.openaiApiKeyTouched
            ? '********'
            : 'Introduza a API key';
        const fallbackModels = ['gpt-4.1-mini', 'gpt-4.1'];
        const persistedModels = settings.openaiModels && settings.openaiModels.length > 0 ? settings.openaiModels : [];
        const modelsToShow = openaiModels.length > 0 ? openaiModels : (persistedModels.length > 0 ? persistedModels : fallbackModels);

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Control Pill */}
                <div className="list-controls card" style={{ paddingLeft: '2rem', paddingRight: '2rem' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>Definições do Sistema</h2>
                    <div style={{ flex: 1 }}></div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            className="btn btn-secondary"
                            style={{ borderRadius: '50px', padding: '0.5rem 1.25rem' }}
                            onClick={() => this.handleReset()}
                        >
                            <RefreshCw size={16} /> Repor
                        </button>
                        <button
                            className="btn btn-primary"
                            style={{ borderRadius: '50px', padding: '0.5rem 1.5rem', fontWeight: 700 }}
                            onClick={() => this.handleSave()}
                        >
                            <Save size={18} /> Guardar Configurações
                        </button>
                    </div>
                </div>

                {/* Grid de 2 colunas para Calculadora e Preferências */}
                <div className="settings-grid">
                    {/* Calculadora Defaults */}
                    <div className="card">
                        <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.5rem' }}>Calculadora Defaults</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Superfat Padrão (%)</label>
                                <input
                                    type="number"
                                    value={settings.defaultSuperfat}
                                    onChange={(e) => this.handleUpdate('defaultSuperfat', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Concentração de Água Padrão (%)</label>
                                <input
                                    type="number"
                                    value={settings.defaultWaterConcentration}
                                    onChange={(e) => this.handleUpdate('defaultWaterConcentration', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Pureza do Álcali Padrão (%)</label>
                                <input
                                    type="number"
                                    value={settings.defaultAlkaliPurity}
                                    onChange={(e) => this.handleUpdate('defaultAlkaliPurity', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Alcali Padrão</label>
                                <select
                                    value={settings.defaultAlkali}
                                    onChange={(e) => this.handleUpdate('defaultAlkali', e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                >
                                    <option value="NaOH">NaOH (Sais Sólidos)</option>
                                    <option value="KOH">KOH (Líquidos)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Prefixo de Receita</label>
                                <input
                                    type="text"
                                    value={settings.recipePrefix}
                                    onChange={(e) => this.handleUpdate('recipePrefix', e.target.value)}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Preferências da Aplicação */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="card" style={{ padding: '1.25rem' }}>
                            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.5rem' }}>Preferências da Aplicação</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Idioma</label>
                                    <select
                                        value={settings.language}
                                        onChange={(e) => this.handleUpdate('language', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                    >
                                        <option value="pt">Português</option>
                                        <option value="en">English (Coming Soon)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Sistema de Medida</label>
                                    <select
                                        value={settings.measurementSystem}
                                        onChange={(e) => this.handleUpdate('measurementSystem', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                    >
                                        <option value="metric">Métrico (Gramas/Kg)</option>
                                        <option value="imperial">Imperial (Oz/Lb)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Inteligência Artificial */}
                        <div className="card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.8rem' }}>
                                <Sparkles size={20} color="var(--color-primary)" />
                                <h3 style={{ margin: 0 }}>Inteligência Artificial (OpenAI)</h3>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div style={{ fontSize: '0.85rem', color: aiConfigured ? '#15803D' : '#B45309' }}>
                                    {aiConfigured ? '✅ IA configurada' : '⚠️ IA não configurada'}
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>API Key</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={this.state.showOpenaiApiKey ? 'text' : 'password'}
                                            value={this.state.openaiApiKeyTouched ? this.state.openaiApiKeyDraft : ''}
                                            onChange={(e) => {
                                                this.setState({ openaiApiKeyDraft: e.target.value, openaiApiKeyTouched: true });
                                            }}
                                            placeholder={apiKeyPlaceholder}
                                            style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => this.setState(prev => ({ showOpenaiApiKey: !prev.showOpenaiApiKey }))}
                                            className="icon-button"
                                            style={{ position: 'absolute', right: '0.35rem', top: '50%', transform: 'translateY(-50%)' }}
                                            title={this.state.showOpenaiApiKey ? 'Ocultar API key' : 'Mostrar API key'}
                                        >
                                            {this.state.showOpenaiApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '0.4rem' }}>
                                        A API key nunca é mostrada nem validada nesta página.
                                    </p>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Modelo</label>
                                    <select
                                        value={settings.openaiModel || 'gpt-4.1-mini'}
                                        onChange={(e) => this.handleUpdate('openaiModel', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                    >
                                        {modelsToShow.map((model) => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => this.handleRefreshModels()}
                                            disabled={openaiModelsLoading || !aiConfigured}
                                        >
                                            {openaiModelsLoading ? 'A consultar...' : 'Consultar modelos'}
                                        </button>
                                    </div>
                                    {openaiModelsError && (
                                        <p style={{ fontSize: '0.75rem', color: '#B91C1C', marginTop: '0.4rem' }}>{openaiModelsError}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Backup Automático */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.8rem' }}>
                        <Database size={20} color="var(--color-primary)" />
                        <h3 style={{ margin: 0 }}>Backup Automático em Tempo Real</h3>
                    </div>

                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#FFF7ED', borderRadius: 'var(--radius-sm)', border: '1px solid #FED7AA' }}>
                        <p style={{ fontSize: '0.85rem', color: '#9A3412', margin: 0 }}>
                            <strong>⚠️ Importante:</strong> O backup automático guarda os seus dados continuamente numa pasta à sua escolha.
                            Recomendamos ativar a encriptação para proteger informações sensíveis.
                        </p>
                    </div>

                    <div className="settings-grid" style={{ gap: '2rem' }}>
                        {/* Configuração */}
                        <div>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>Configuração</h4>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={settings.autoBackupEnabled}
                                        onChange={(e) => this.handleUpdate('autoBackupEnabled', e.target.checked)}
                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Ativar Backup Automático</span>
                                </label>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
                                    <Database size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
                                    Backup em LocalStorage
                                </label>
                                <p style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '0.75rem' }}>
                                    Os backups são guardados automaticamente no armazenamento do navegador.
                                </p>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => this.handleTestAutoBackup()}
                                    disabled={!settings.autoBackupEnabled}
                                    style={{ width: '100%', marginBottom: '0.5rem' }}
                                >
                                    <Save size={16} /> Realizar Backup Agora
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => this.handleDownloadAutoBackup()}
                                    disabled={!settings.lastAutoBackup}
                                    style={{ width: '100%' }}
                                >
                                    <Download size={16} /> Descarregar Último Backup
                                </button>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={settings.autoBackupEncrypted}
                                        onChange={(e) => this.handleUpdate('autoBackupEncrypted', e.target.checked)}
                                        disabled={!settings.autoBackupEnabled}
                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                                        <Lock size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
                                        Encriptar Backup
                                    </span>
                                </label>
                            </div>

                            {settings.autoBackupEncrypted && settings.autoBackupEnabled && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Palavra-passe de Encriptação</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={this.state.showBackupPassword ? 'text' : 'password'}
                                            value={settings.autoBackupPassword}
                                            onChange={(e) => this.handleUpdate('autoBackupPassword', e.target.value)}
                                            placeholder="Defina uma palavra-passe segura"
                                            style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => this.setState(prev => ({ showBackupPassword: !prev.showBackupPassword }))}
                                            className="icon-button"
                                            style={{ position: 'absolute', right: '0.35rem', top: '50%', transform: 'translateY(-50%)' }}
                                            title={this.state.showBackupPassword ? 'Ocultar password' : 'Mostrar password'}
                                        >
                                            {this.state.showBackupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '0.5rem' }}>
                                        Esta palavra-passe será necessária para restaurar o backup. Guarde-a num local seguro.
                                    </p>
                                </div>
                            )}

                            {settings.autoBackupEnabled && settings.lastAutoBackup && (
                                <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: '#F0FDF4', borderRadius: 'var(--radius-sm)', border: '1px solid #BBF7D0' }}>
                                    <p style={{ fontSize: '0.75rem', color: '#15803D', margin: 0 }}>
                                        <strong>Último backup:</strong> {new Date(settings.lastAutoBackup).toLocaleString('pt-PT', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                            )}

                            {settings.autoBackupEnabled && !settings.lastAutoBackup && (
                                <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: '#FEF3C7', borderRadius: 'var(--radius-sm)', border: '1px solid #FDE68A' }}>
                                    <p style={{ fontSize: '0.75rem', color: '#92400E', margin: 0 }}>
                                        <strong>Nenhum backup realizado ainda.</strong> O primeiro backup será criado automaticamente.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Backup Manual */}
                        <div>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>Backup Manual</h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
                                Descarregue ou importe todos os seus dados manualmente num ficheiro JSON.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ padding: '1.5rem', background: '#F0F9FF', borderRadius: 'var(--radius-md)', border: '1px solid #BAE6FD' }}>
                                    <h5 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', color: '#0369A1' }}>Exportar Tudo</h5>
                                    <p style={{ fontSize: '0.75rem', color: '#0C4A6E', marginBottom: '1rem' }}>Criar um ficheiro de backup completo sem encriptação.</p>
                                    <button className="btn btn-primary" style={{ width: '100%', background: '#0284C7' }} onClick={() => this.handleExport()}>
                                        <Download size={16} /> Descarregar Backup
                                    </button>
                                </div>

                                <div style={{ padding: '1.5rem', background: '#F0FDF4', borderRadius: 'var(--radius-md)', border: '1px solid #BBF7D0' }}>
                                    <h5 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', color: '#15803D' }}>Importar Dados</h5>
                                    <p style={{ fontSize: '0.75rem', color: '#14532D', marginBottom: '1rem' }}>Substituir todos os dados atuais por um ficheiro anterior.</p>
                                    <button className="btn btn-secondary" style={{ width: '100%', borderColor: '#22C55E' }} onClick={() => this.handleImport()}>
                                        <Upload size={16} /> Carregar Backup
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Firebase Sync */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.8rem' }}>
                        <Cloud size={20} color="var(--color-primary)" />
                        <h3 style={{ margin: 0 }}>Sincronização Firebase (Firestore)</h3>
                    </div>

                    <div className="sync-grid">
                        <div className="full" style={{ padding: '1rem', background: '#FEF3C7', borderRadius: 'var(--radius-sm)', border: '1px solid #FDE68A' }}>
                            <p style={{ fontSize: '0.85rem', color: '#92400E', margin: 0 }}>
                                <strong>Nota:</strong> Se surgir “Missing or insufficient permissions”, é necessário configurar regras no Firestore para permitir leitura/escrita no caminho
                                <strong> users/&lt;uid&gt;/appState/main</strong>.
                            </p>
                        </div>

                        <div style={{ padding: '0.75rem', background: '#F3F4F6', borderRadius: 'var(--radius-sm)', border: '1px solid #E5E7EB' }}>
                            <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.25rem' }}>Estado de Autenticação</div>
                            {authUid ? (
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>
                                    {authEmail || 'Utilizador autenticado'} ({authUid})
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#B45309' }}>
                                    Não autenticado
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                                <button className="btn btn-primary" onClick={() => this.handleSignIn()}>
                                    Iniciar Sessão Google
                                </button>
                                <button className="btn btn-secondary" onClick={() => this.handleSignOut()} disabled={!authUid}>
                                    Terminar Sessão
                                </button>
                            </div>
                        </div>

                        <div style={{ padding: '0.75rem', background: '#F9FAFB', borderRadius: 'var(--radius-sm)', border: '1px solid #E5E7EB' }}>
                            <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.25rem' }}>Último sync com sucesso</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>
                                {lastSyncSuccess ? new Date(lastSyncSuccess).toLocaleString('pt-PT') : '—'}
                            </div>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6B7280' }}>
                                Backup local: {localBackupUpdatedAt ? new Date(localBackupUpdatedAt).toLocaleString('pt-PT') : '—'} · {localBackupSize}
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={() => this.handleForceSync()}>
                                    Sincronizar Agora
                                </button>
                                <button className="btn btn-secondary" onClick={() => this.handleRefreshRemoteStatus()}>
                                    Verificar Estado
                                </button>
                                <button className="btn btn-secondary" onClick={() => this.handlePullRemote()}>
                                    Puxar Remoto
                                </button>
                            </div>
                            {lastSyncError && (
                                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#B91C1C' }}>
                                    Último erro: {lastSyncError}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '0.75rem', background: '#F3F4F6', borderRadius: 'var(--radius-sm)', border: '1px solid #E5E7EB' }}>
                            <div style={{ fontSize: '0.8rem', color: '#6B7280', marginBottom: '0.25rem' }}>Estado remoto (Firestore)</div>
                            <div style={{ fontSize: '0.85rem', color: '#111827' }}>
                                <strong>UpdatedAt:</strong> {remoteUpdatedAt ? new Date(remoteUpdatedAt).toLocaleString('pt-PT') : '—'}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#111827' }}>
                                <strong>Device:</strong> {remoteDeviceId || '—'}
                            </div>
                        </div>

                        <div style={{ padding: '0.75rem', background: '#F9FAFB', borderRadius: 'var(--radius-sm)', border: '1px solid #E5E7EB' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
                                <input
                                    type="checkbox"
                                    checked={syncEnabled}
                                    onChange={(e) => this.setState({ syncEnabled: e.target.checked })}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Ativar sincronização Firestore</span>
                            </label>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500 }}>Password de Sincronização (E2E)</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={this.state.showSyncPassword ? 'text' : 'password'}
                                        value={syncPassword}
                                        onChange={(e) => {
                                            this.setState({ syncPassword: e.target.value });
                                            localStorage.setItem(SYNC_PASSWORD_KEY, e.target.value.trim());
                                        }}
                                        placeholder="Defina uma password para encriptação ponta a ponta"
                                        style={{ width: '100%', padding: '0.55rem 2.5rem 0.55rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => this.setState(prev => ({ showSyncPassword: !prev.showSyncPassword }))}
                                        className="icon-button"
                                        style={{ position: 'absolute', right: '0.35rem', top: '50%', transform: 'translateY(-50%)' }}
                                        title={this.state.showSyncPassword ? 'Ocultar password' : 'Mostrar password'}
                                    >
                                        {this.state.showSyncPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '0.4rem' }}>
                                    Esta password é diferente do backup local e nunca é enviada ao servidor.
                                </p>
                            </div>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500 }}>UID Autenticado</label>
                                <input
                                    type="text"
                                    value={authUid || '—'}
                                    readOnly
                                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #e5e7eb', background: '#F9FAFB', color: '#6B7280' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 500 }}>Device ID</label>
                                <input
                                    type="text"
                                    value={deviceId || 'Será gerado quando o sync iniciar'}
                                    readOnly
                                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #e5e7eb', background: '#F9FAFB', color: '#6B7280' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

