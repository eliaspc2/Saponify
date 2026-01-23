import { BackupService } from './BackupService';
import type { ISyncProvider } from './ISyncProvider';
import { SettingsService } from './SettingsService';
import { AutoBackupStorage } from './AutoBackupStorage';
import { getDataVersion } from '../utils/dataVersion';

type AppControllerDeps = {
    backupService: BackupService;
    syncProvider?: ISyncProvider | null;
    settingsService: SettingsService;
};

const SYNC_PENDING_IMPORT_KEY = 'saponify_sync_pending_import';

export class AppController {
    private backupService: BackupService;
    private syncProvider: ISyncProvider | null;
    private settingsService: SettingsService;
    private storage: AutoBackupStorage;
    private lastDataVersion: string;
    private dataVersionTimer: number | null = null;
    private pendingBackupTimer: number | null = null;

    constructor({ backupService, syncProvider, settingsService }: AppControllerDeps) {
        this.backupService = backupService;
        this.syncProvider = syncProvider ?? null;
        this.settingsService = settingsService;
        this.storage = new AutoBackupStorage();
        this.lastDataVersion = getDataVersion();
    }

    public async init(): Promise<boolean> {
        this.backupService.setSyncProvider(this.syncProvider);
        if (this.syncProvider) {
            await this.syncProvider.start();
        }

        const shouldReload = await this.handlePendingImport();
        if (!shouldReload) {
            this.startWatchingState();
        }
        return shouldReload;
    }

    public onStateChanged(): void {
        if (!this.shouldSyncOnChange()) return;
        if (this.pendingBackupTimer) {
            window.clearTimeout(this.pendingBackupTimer);
        }
        this.pendingBackupTimer = window.setTimeout(async () => {
            await this.backupService.performAutoBackupNow();
            this.onBackupCompleted();
        }, 800);
    }

    public onBackupCompleted(): void {
        // Hook for future orchestration steps
    }

    private startWatchingState(): void {
        if (this.dataVersionTimer) return;
        this.dataVersionTimer = window.setInterval(() => {
            const currentVersion = getDataVersion();
            if (currentVersion && currentVersion !== this.lastDataVersion) {
                this.lastDataVersion = currentVersion;
                this.onStateChanged();
            }
        }, 2000);
    }

    private async handlePendingImport(): Promise<boolean> {
        const pending = localStorage.getItem(SYNC_PENDING_IMPORT_KEY);
        if (pending !== 'true') return false;

        const data = this.storage.getData();
        let ok = false;
        if (data && data.startsWith('ENCRYPTED:')) {
            const settings = this.settingsService.getSettings();
            ok = await this.backupService.restoreAutoBackup(settings.autoBackupPassword);
        } else if (data) {
            ok = await this.backupService.importAllData(data);
        }

        if (ok) {
            localStorage.removeItem(SYNC_PENDING_IMPORT_KEY);
            return true;
        }

        return false;
    }

    private shouldSyncOnChange(): boolean {
        if (!this.syncProvider) return false;
        const provider = this.syncProvider as { isReady?: () => boolean };
        if (typeof provider.isReady === 'function') {
            return provider.isReady();
        }
        return true;
    }
}
