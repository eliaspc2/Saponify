import { SettingsService } from '../../infrastructure/services/SettingsService';
import { BackupComposer } from './BackupComposer';
import type { ImportAllDataOptions } from './BackupComposer';
import { AutoBackupStorage } from '../../infrastructure/storage/AutoBackupStorage';
import { BackupFileTransfer } from '../../infrastructure/storage/BackupFileTransfer';
import type { ISyncProvider } from '../../infrastructure/sync/ISyncProvider';
import type { IEncryptionProvider } from '../../infrastructure/crypto/IEncryptionProvider';
import { WebCryptoEncryptionProvider } from '../../infrastructure/crypto/WebCryptoEncryptionProvider';
import { AppConstants } from '../../../shared/constants/AppConstants';

export type AutoBackupInfo = {
    timestamp: string;
    sizeBytes: number;
    encrypted: boolean;
    isLatest: boolean;
};

export class BackupService {
    private static instance: BackupService;
    private composer: BackupComposer | null = null;
    private storage: AutoBackupStorage | null = null;
    private fileTransfer: BackupFileTransfer | null = null;
    private syncProvider: ISyncProvider | null = null;
    private syncProviderConfigured = false;

    private constructor() { }

    public static getInstance(): BackupService {
        if (!BackupService.instance) {
            BackupService.instance = new BackupService();
        }
        return BackupService.instance;
    }

    public async exportAllData(): Promise<string> {
        return this.getComposer().exportAllData();
    }

    public async importAllData(jsonString: string, options?: ImportAllDataOptions): Promise<boolean> {
        return this.getComposer().importAllData(jsonString, options);
    }

    public listAutoBackups(): AutoBackupInfo[] {
        const backups = this.getStorage().getAllBackups();
        return backups.map((item, index) => ({
            timestamp: item.timestamp,
            sizeBytes: item.data.length,
            encrypted: item.data.startsWith(AppConstants.ENCRYPTED_PREFIX),
            isLatest: index === 0
        }));
    }

    public getAutoBackupCount(): number {
        return this.listAutoBackups().length;
    }

    // Helper to download the file
    public downloadBackup(json: string) {
        this.getFileTransfer().downloadBackup(json);
    }

    // ============ BACKUP AUTOMÁTICO ============

    /**
     * Realiza backup automático se estiver ativado nas configurações
     * Guarda em LocalStorage (navegadores limitam escrita em disco)
     */
    public async performAutoBackup(): Promise<void> {
        await this.performAutoBackupInternal(false);
    }

    /**
     * Força a criação de backup automático local, mesmo se estiver desativado.
     */
    public async performAutoBackupNow(): Promise<void> {
        await this.performAutoBackupInternal(true);
    }

    private async performAutoBackupInternal(force: boolean): Promise<void> {
        const settings = SettingsService.getInstance().getSettings();

        if (!force && !settings.autoBackupEnabled) {
            return;
        }

        try {
            // Exportar dados
            const jsonData = await this.exportAllData();

            // Encriptar se necessário
            const finalData = settings.autoBackupEncrypted && settings.autoBackupPassword
                ? await this.getEncryptionProvider(settings.autoBackupPassword).encrypt(jsonData)
                : jsonData;

            const timestamp = new Date().toISOString();

            // Guardar em LocalStorage (mantém histórico rotativo)
            this.getStorage().setData(finalData, timestamp);

            // Atualizar timestamp nas configurações
            settings.lastAutoBackup = timestamp;
            SettingsService.getInstance().updateSettings(settings);

            let syncPayload = finalData;
            if (finalData.startsWith(AppConstants.ENCRYPTED_PREFIX) && settings.autoBackupPassword) {
                try {
                    syncPayload = await this.getEncryptionProvider(settings.autoBackupPassword).decrypt(finalData);
                } catch (decryptError) {
                    console.error('Erro ao desencriptar backup local para sync:', decryptError);
                    return;
                }
            }

            const syncProvider = this.getSyncProvider();
            if (syncProvider) {
                await syncProvider.push(syncPayload);
            }

            console.log('Backup automático realizado com sucesso');
        } catch (error) {
            console.error('Erro ao realizar backup automático:', error);
        }
    }

    /**
     * Restaura backup automático do LocalStorage.
     * Tenta os backups do mais recente para o mais antigo (até 5) para maior resiliência.
     */
    public async restoreAutoBackup(password?: string, options?: ImportAllDataOptions): Promise<boolean> {
        const backups = this.getStorage().getAllBackups();
        if (!backups.length) {
            console.warn('Nenhum backup automático encontrado');
            return false;
        }

        try {
            for (const backup of backups) {
                const ok = await this.restoreBackupPayload(backup.data, password, options);
                if (ok) return true;
            }
            return false;
        } catch (error) {
            console.error('Erro ao restaurar backup automático:', error);
            return false;
        }
    }

    /**
     * Restaura um backup automático específico por timestamp.
     */
    public async restoreAutoBackupAt(timestamp: string, password?: string, options?: ImportAllDataOptions): Promise<boolean> {
        const backups = this.getStorage().getAllBackups();
        const target = backups.find(item => item.timestamp === timestamp);
        if (!target) {
            return false;
        }

        try {
            return await this.restoreBackupPayload(target.data, password, options);
        } catch (error) {
            console.error('Erro ao restaurar backup automático específico:', error);
            return false;
        }
    }

    private async restoreBackupPayload(payload: string, password?: string, options?: ImportAllDataOptions): Promise<boolean> {
        const isEncryptedPayload = payload.startsWith(AppConstants.ENCRYPTED_PREFIX);
        if (!isEncryptedPayload) {
            return await this.importAllData(payload, options);
        }

        const candidates = this.getPasswordCandidates(password);
        if (!candidates.length) {
            console.error('Backup encriptado, mas sem palavra-passe disponível para restauro.');
            return false;
        }

        let lastError: unknown = null;
        for (const candidate of candidates) {
            try {
                const jsonData = await this.getEncryptionProvider(candidate).decrypt(payload);
                const ok = await this.importAllData(jsonData, options);
                if (ok) {
                    return true;
                }
            } catch (error) {
                lastError = error;
            }
        }

        console.error('Erro ao restaurar payload de backup:', lastError);
        return false;
    }

    private getPasswordCandidates(password?: string): string[] {
        const settings = SettingsService.getInstance().getSettings();
        return Array.from(new Set([
            (password || '').trim(),
            (settings.autoBackupPassword || '').trim()
        ].filter(Boolean)));
    }

    /**
     * Descarrega o backup automático como ficheiro
     */
    public downloadAutoBackup() {
        const data = this.getStorage().getData();
        if (!data) {
            alert('Nenhum backup automático encontrado!');
            return;
        }

        const timestamp = this.getStorage().getTimestamp() || new Date().toISOString();
        this.getFileTransfer().downloadAutoBackup(data, timestamp);
    }

    private getComposer() {
        if (!this.composer) {
            this.composer = new BackupComposer();
        }
        return this.composer;
    }

    private getStorage() {
        if (!this.storage) {
            this.storage = new AutoBackupStorage();
        }
        return this.storage;
    }

    private getFileTransfer() {
        if (!this.fileTransfer) {
            this.fileTransfer = new BackupFileTransfer();
        }
        return this.fileTransfer;
    }

    private getEncryptionProvider(password: string): IEncryptionProvider {
        return new WebCryptoEncryptionProvider(password);
    }

    public setSyncProvider(provider: ISyncProvider | null) {
        this.syncProvider = provider;
        this.syncProviderConfigured = true;
    }

    private getSyncProvider(): ISyncProvider | null {
        if (!this.syncProviderConfigured) {
            return null;
        }
        return this.syncProvider;
    }
}
