import { SettingsService } from './SettingsService';
import { FirestoreSyncService } from './FirestoreSyncService';
import { BackupComposer } from './BackupComposer';
import { AutoBackupStorage } from './AutoBackupStorage';
import { BackupFileTransfer } from './BackupFileTransfer';

export class BackupService {
    private static instance: BackupService;
    private composer: BackupComposer | null = null;
    private storage: AutoBackupStorage | null = null;
    private fileTransfer: BackupFileTransfer | null = null;

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

    public async importAllData(jsonString: string): Promise<boolean> {
        return this.getComposer().importAllData(jsonString);
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
                ? this.simpleEncrypt(jsonData, settings.autoBackupPassword)
                : jsonData;

            const timestamp = new Date().toISOString();

            // Guardar em LocalStorage
            this.getStorage().setData(finalData, timestamp);

            // Atualizar timestamp nas configurações
            settings.lastAutoBackup = timestamp;
            SettingsService.getInstance().updateSettings(settings);

            let syncPayload = finalData;
            if (finalData.startsWith('ENCRYPTED:') && settings.autoBackupPassword) {
                try {
                    syncPayload = this.simpleDecrypt(finalData, settings.autoBackupPassword);
                } catch (decryptError) {
                    console.error('Erro ao desencriptar backup local para sync:', decryptError);
                    return;
                }
            }

            await FirestoreSyncService.getInstance().pushAutoBackup(syncPayload, timestamp);

            console.log('Backup automático realizado com sucesso');
        } catch (error) {
            console.error('Erro ao realizar backup automático:', error);
        }
    }

    /**
     * Restaura backup automático do LocalStorage
     */
    public async restoreAutoBackup(password?: string): Promise<boolean> {
        try {
            const data = this.getStorage().getData();
            if (!data) {
                console.warn('Nenhum backup automático encontrado');
                return false;
            }

            const settings = SettingsService.getInstance().getSettings();

            // Desencriptar se necessário
            const jsonData = settings.autoBackupEncrypted && password
                ? this.simpleDecrypt(data, password)
                : data;

            return await this.importAllData(jsonData);
        } catch (error) {
            console.error('Erro ao restaurar backup automático:', error);
            return false;
        }
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

    // ============ ENCRIPTAÇÃO SIMPLES ============
    // Nota: Isto é encriptação básica. Para produção, usar crypto-js ou similar

    private simpleEncrypt(text: string, password: string): string {
        const encrypted = btoa(unescape(encodeURIComponent(text + '::' + password)));
        return `ENCRYPTED:${encrypted}`;
    }

    private simpleDecrypt(encryptedText: string, password: string): string {
        if (!encryptedText.startsWith('ENCRYPTED:')) {
            return encryptedText; // Não encriptado
        }

        const encrypted = encryptedText.replace('ENCRYPTED:', '');
        const decrypted = decodeURIComponent(escape(atob(encrypted)));

        if (!decrypted.endsWith('::' + password)) {
            throw new Error('Palavra-passe incorreta');
        }

        return decrypted.replace('::' + password, '');
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
}
