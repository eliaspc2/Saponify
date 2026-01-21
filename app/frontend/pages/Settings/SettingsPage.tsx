import { BasePage, BasePageState } from '../../core/BasePage';
import { SettingsService } from '../../../orchestrator/services/SettingsService';
import { AppSettings } from '../../../shared/types/Settings';
import { Save, RefreshCw, Upload, Download, Database, Lock } from 'lucide-react';
import { BackupService } from '../../../orchestrator/services/BackupService';

interface SettingsState extends BasePageState {
    settings: AppSettings;
}

export class SettingsPage extends BasePage<{}, SettingsState> {

    protected getInitialState(): Partial<SettingsState> {
        return {
            settings: SettingsService.getInstance().getSettings()
        };
    }

    private handleUpdate(field: keyof AppSettings, value: any) {
        this.setState(prev => ({
            settings: { ...prev.settings, [field]: value }
        }));
    }

    private async handleSave() {
        SettingsService.getInstance().updateSettings(this.state.settings);

        // Realizar backup automático se ativo
        if (this.state.settings.autoBackupEnabled) {
            await BackupService.getInstance().performAutoBackup();
        }

        alert('Configurações guardadas com sucesso!');
        this.setState({ settings: SettingsService.getInstance().getSettings() });
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
                alert('Dados importados com sucesso! A página será recarregada.');
                location.reload();
            } else {
                alert('Erro ao importar backup. Verifique o ficheiro.');
            }
        };
        input.click();
    }

    private handleReset() {
        if (confirm('Tem a certeza que deseja repor as configurações de fábrica?')) {
            location.reload();
        }
    }

    private async handleTestAutoBackup() {
        await BackupService.getInstance().performAutoBackup();
        this.setState({ settings: SettingsService.getInstance().getSettings() });
        alert('Backup automático realizado com sucesso! Verifique a data/hora abaixo.');
    }

    private async handleDownloadAutoBackup() {
        BackupService.getInstance().downloadAutoBackup();
    }

    protected renderActions() {
        return null;
    }

    renderContent() {
        const { settings } = this.state;

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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
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
                    <div className="card">
                        <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.5rem' }}>Preferências da Aplicação</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
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
                                    <input
                                        type="password"
                                        value={settings.autoBackupPassword}
                                        onChange={(e) => this.handleUpdate('autoBackupPassword', e.target.value)}
                                        placeholder="Defina uma palavra-passe segura"
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #d1d5db' }}
                                    />
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
            </div>
        );
    }
}
