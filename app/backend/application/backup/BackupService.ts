import { SettingsService } from '../../infrastructure/services/SettingsService';
import { BackupComposer } from './BackupComposer';
import type { ImportAllDataOptions } from './BackupComposer';
import { AutoBackupStorage } from '../../infrastructure/storage/AutoBackupStorage';
import { BackupFileTransfer } from '../../infrastructure/storage/BackupFileTransfer';
import type { ISyncProvider } from '../../infrastructure/sync/ISyncProvider';
import type { IEncryptionProvider } from '../../infrastructure/crypto/IEncryptionProvider';
import { WebCryptoEncryptionProvider } from '../../infrastructure/crypto/WebCryptoEncryptionProvider';
import { AppConstants } from '../../../shared/constants/AppConstants';
import { StorageKeys } from '../../../shared/constants/StorageKeys';
import { getDataVersion } from '../../shared/versioning/dataVersion';

export type AutoBackupInfo = {
    id: string;
    timestamp: string;
    sizeBytes: number;
    encrypted: boolean;
    isLatest: boolean;
    snapshotDataVersion: string | null;
};

export type AutoBackupOptions = {
    /** Set false to create a local recovery snapshot without exporting or pushing it. */
    sync?: boolean;
};

export type AutoBackupResult = {
    created: boolean;
    synced: boolean;
    snapshotDataVersion: string | null;
    isCurrent: boolean;
    retryScheduled: boolean;
    storage: 'primary' | 'safety' | null;
    skippedReason?: 'disabled' | 'pending-sync-import' | 'import-in-progress' | 'data-changed';
};

type PendingAutoBackup = {
    force: boolean;
    sync: boolean;
    retryAttempt: number;
    promise: Promise<AutoBackupResult>;
    resolve: (result: AutoBackupResult) => void;
    reject: (error: unknown) => void;
};

export class BackupService {
    private static instance: BackupService;
    private composer: BackupComposer | null = null;
    private storage: AutoBackupStorage | null = null;
    private fileTransfer: BackupFileTransfer | null = null;
    private syncProvider: ISyncProvider | null = null;
    private syncProviderConfigured = false;
    private autoBackupQueue: Promise<void> = Promise.resolve();
    private pendingAutoBackups: PendingAutoBackup[] = [];
    private importPromise: Promise<boolean> | null = null;

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
        if (this.importPromise) {
            console.warn('Importação de backup ignorada: já existe uma importação em curso.');
            return false;
        }

        const importPromise = Promise.resolve().then(() => this.getComposer().importAllData(jsonString, options));
        this.importPromise = importPromise;
        try {
            return await importPromise;
        } finally {
            if (this.importPromise === importPromise) {
                this.importPromise = null;
            }
        }
    }

    public isImporting(): boolean {
        return this.importPromise !== null;
    }

    public listAutoBackups(): AutoBackupInfo[] {
        const backups = this.getStorage().getAllBackups();
        return backups.map((item, index) => ({
            id: item.id || item.timestamp,
            timestamp: item.timestamp,
            sizeBytes: item.data.length,
            encrypted: item.data.startsWith(AppConstants.ENCRYPTED_PREFIX),
            isLatest: index === 0,
            snapshotDataVersion: item.snapshotDataVersion ?? null
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
    public performAutoBackup(): Promise<AutoBackupResult> {
        return this.enqueueAutoBackup(false, { sync: true });
    }

    /**
     * Força a criação de backup automático local, mesmo se estiver desativado.
     */
    public performAutoBackupNow(options: AutoBackupOptions = {}): Promise<AutoBackupResult> {
        return this.enqueueAutoBackup(true, options);
    }

    private enqueueAutoBackup(force: boolean, options: AutoBackupOptions, retryAttempt = 0): Promise<AutoBackupResult> {
        const sync = options.sync ?? true;
        const matchingRequest = this.pendingAutoBackups.find(request => request.sync === sync);
        if (matchingRequest) {
            matchingRequest.force ||= force;
            return matchingRequest.promise;
        }

        let resolve!: (result: AutoBackupResult) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<AutoBackupResult>((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
        });
        const request: PendingAutoBackup = { force, sync, retryAttempt, promise, resolve, reject };
        this.pendingAutoBackups.push(request);

        const run = this.autoBackupQueue.then(async () => {
            this.pendingAutoBackups = this.pendingAutoBackups.filter(item => item !== request);

            try {
                request.resolve(await this.performAutoBackupInternal(request.force, request.sync, request.retryAttempt));
            } catch (error) {
                request.reject(error);
            }
        });
        this.autoBackupQueue = run.catch(() => undefined);

        return promise;
    }

    private async performAutoBackupInternal(force: boolean, sync: boolean, retryAttempt: number): Promise<AutoBackupResult> {
        const settings = SettingsService.getInstance().getSettings();

        if (!force && !settings.autoBackupEnabled) {
            return {
                created: false,
                synced: false,
                snapshotDataVersion: null,
                isCurrent: true,
                retryScheduled: false,
                storage: null,
                skippedReason: 'disabled'
            };
        }

        if (sync && localStorage.getItem(StorageKeys.SYNC_PENDING_IMPORT) === 'true') {
            return {
                created: false,
                synced: false,
                snapshotDataVersion: null,
                isCurrent: false,
                retryScheduled: false,
                storage: null,
                skippedReason: 'pending-sync-import'
            };
        }

        // This boundary, not completion time, identifies the contents of the snapshot.
        const snapshotDataVersion = getDataVersion();
        const timestamp = new Date().toISOString();
        const initialInvalidation = this.getBackupInvalidationReason(snapshotDataVersion);
        if (initialInvalidation) {
            return this.skipInvalidAutoBackup(snapshotDataVersion, initialInvalidation, force, sync, retryAttempt);
        }

        // Exportar dados
        const jsonData = await this.exportAllData();
        const afterExportInvalidation = this.getBackupInvalidationReason(snapshotDataVersion);
        if (afterExportInvalidation) {
            return this.skipInvalidAutoBackup(snapshotDataVersion, afterExportInvalidation, force, sync, retryAttempt);
        }

        // Encriptar se necessário
        const finalData = settings.autoBackupEncrypted && settings.autoBackupPassword
            ? await this.getEncryptionProvider(settings.autoBackupPassword).encrypt(jsonData)
            : jsonData;
        const afterEncryptionInvalidation = this.getBackupInvalidationReason(snapshotDataVersion);
        if (afterEncryptionInvalidation) {
            return this.skipInvalidAutoBackup(snapshotDataVersion, afterEncryptionInvalidation, force, sync, retryAttempt);
        }

        const pendingImport = localStorage.getItem(StorageKeys.SYNC_PENDING_IMPORT) === 'true';
        if (pendingImport && sync) {
            return {
                created: false,
                synced: false,
                snapshotDataVersion,
                isCurrent: false,
                retryScheduled: false,
                storage: null,
                skippedReason: 'pending-sync-import'
            };
        }

        // A local-only safety snapshot must not replace data staged for import.
        const targetStorage = pendingImport ? 'safety' : 'primary';
        if (targetStorage === 'safety') {
            this.getStorage().setSafetyData(finalData, timestamp, snapshotDataVersion);
        } else {
            this.getStorage().setData(finalData, timestamp, snapshotDataVersion);
        }

        if (targetStorage === 'primary') {
            // Atualizar metadata sem a tratar como alteração de dados do utilizador.
            SettingsService.getInstance().updateLastAutoBackup(timestamp);
        }

        const beforeSyncInvalidation = this.getBackupInvalidationReason(snapshotDataVersion);
        if (beforeSyncInvalidation) {
            return this.skipInvalidAutoBackup(snapshotDataVersion, beforeSyncInvalidation, force, sync, retryAttempt);
        }

        if (!sync) {
            return {
                created: true,
                synced: false,
                snapshotDataVersion,
                isCurrent: true,
                retryScheduled: false,
                storage: targetStorage
            };
        }

        const syncProvider = this.getSyncProvider();
        if (syncProvider) {
            await syncProvider.push(jsonData);
        }

        const afterSyncInvalidation = this.getBackupInvalidationReason(snapshotDataVersion);
        if (afterSyncInvalidation) {
            const retryScheduled = this.scheduleAutoBackupRetry(force, sync, retryAttempt);
            return {
                created: true,
                synced: !!syncProvider,
                snapshotDataVersion,
                isCurrent: false,
                retryScheduled,
                storage: targetStorage
            };
        }

        console.log('Backup automático realizado com sucesso');
        return {
            created: true,
            synced: !!syncProvider,
            snapshotDataVersion,
            isCurrent: true,
            retryScheduled: false,
            storage: targetStorage
        };
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
        const target = backups.find(item => item.id === timestamp)
            || backups.find(item => item.timestamp === timestamp);
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
        if (!this.matchesExpectedDataVersion(options)) {
            return false;
        }

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
                if (!this.matchesExpectedDataVersion(options)) {
                    return false;
                }
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

    private getBackupInvalidationReason(snapshotDataVersion: string): 'import-in-progress' | 'data-changed' | null {
        if (this.isImporting()) return 'import-in-progress';
        return getDataVersion() === snapshotDataVersion ? null : 'data-changed';
    }

    private skipInvalidAutoBackup(
        snapshotDataVersion: string,
        skippedReason: 'import-in-progress' | 'data-changed',
        force: boolean,
        sync: boolean,
        retryAttempt: number
    ): AutoBackupResult {
        return {
            created: false,
            synced: false,
            snapshotDataVersion,
            isCurrent: false,
            retryScheduled: this.scheduleAutoBackupRetry(force, sync, retryAttempt),
            storage: null,
            skippedReason
        };
    }

    private scheduleAutoBackupRetry(force: boolean, sync: boolean, retryAttempt: number): boolean {
        if (retryAttempt > 0) return false;

        const retry = () => {
            void this.enqueueAutoBackup(force, { sync }, retryAttempt + 1).catch(error => {
                console.error('Erro ao repetir backup desatualizado:', error);
            });
        };
        const activeImport = this.importPromise;
        if (activeImport) {
            void activeImport.catch(() => undefined).finally(retry);
        } else {
            retry();
        }
        return true;
    }

    private matchesExpectedDataVersion(options?: ImportAllDataOptions): boolean {
        return typeof options?.expectedDataVersion !== 'string'
            || getDataVersion() === options.expectedDataVersion;
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
