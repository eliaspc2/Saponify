import { BackupService } from '../../backend/services/BackupService';
import type { ISyncProvider } from '../../backend/services/ISyncProvider';
import { SettingsService } from '../../backend/services/SettingsService';
import { AutoBackupStorage } from '../../backend/services/AutoBackupStorage';
import { getDataVersion } from '../../backend/utils/dataVersion';
import type { CalculatorUseCase } from '../../backend/calculator/CalculatorUseCase';
import type { CalculatorInput, CalculatorResult } from '../../backend/calculator/CalculatorModels';
import { StorageKeys } from '../../shared/constants/StorageKeys';
import { AppConstants } from '../../shared/constants/AppConstants';

type AppControllerDeps = {
    backupService: BackupService;
    syncProvider?: ISyncProvider | null;
    settingsService: SettingsService;
    calculatorUseCase: CalculatorUseCase;
};

const SYNC_PENDING_IMPORT_KEY = StorageKeys.SYNC_PENDING_IMPORT;

export class AppController {
    private backupService: BackupService;
    private syncProvider: ISyncProvider | null;
    private settingsService: SettingsService;
    private storage: AutoBackupStorage;
    private lastDataVersion: string;
    private dataVersionTimer: number | null = null;
    private pendingBackupTimer: number | null = null;
    private calculatorUseCase: CalculatorUseCase;

    constructor({ backupService, syncProvider, settingsService, calculatorUseCase }: AppControllerDeps) {
        this.backupService = backupService;
        this.syncProvider = syncProvider ?? null;
        this.settingsService = settingsService;
        this.storage = new AutoBackupStorage();
        this.lastDataVersion = getDataVersion();
        this.calculatorUseCase = calculatorUseCase;
    }

    // Contract: initialize orchestration (sync bootstrap + pending import handling).
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

    // Contract: calculate recipe using backend use-case (no UI logic).
    public calculateRecipe(input: CalculatorInput): CalculatorResult {
        return this.calculatorUseCase.calculate(input);
    }

    private onStateChanged(): void {
        if (!this.shouldSyncOnChange()) return;
        if (this.pendingBackupTimer) {
            window.clearTimeout(this.pendingBackupTimer);
        }
        this.pendingBackupTimer = window.setTimeout(async () => {
            await this.backupService.performAutoBackupNow();
            this.onBackupCompleted();
        }, AppConstants.APP_STATE_BACKUP_DEBOUNCE_MS);
    }

    private onBackupCompleted(): void {
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
        }, AppConstants.APP_STATE_POLL_INTERVAL_MS);
    }

    private async handlePendingImport(): Promise<boolean> {
        const pending = localStorage.getItem(SYNC_PENDING_IMPORT_KEY);
        if (pending !== 'true') return false;

        const data = this.storage.getData();
        let ok = false;
        if (data && data.startsWith(AppConstants.ENCRYPTED_PREFIX)) {
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
