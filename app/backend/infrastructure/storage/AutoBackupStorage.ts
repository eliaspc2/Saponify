import { StorageKeys } from '../../../shared/constants/StorageKeys';
import { AppConstants } from '../../../shared/constants/AppConstants';
import { IdService } from '../../shared/ids/IdService';

type AutoBackupEntry = {
    id?: string;
    timestamp: string;
    data: string;
    snapshotDataVersion?: string;
};

export class AutoBackupStorage {
    private static AUTO_BACKUP_KEY = StorageKeys.AUTO_BACKUP;
    private static AUTO_BACKUP_TS_KEY = StorageKeys.AUTO_BACKUP_TIMESTAMP;
    private static AUTO_BACKUP_HISTORY_KEY = StorageKeys.AUTO_BACKUP_HISTORY;
    private static AUTO_BACKUP_DATA_VERSION_KEY = `${StorageKeys.AUTO_BACKUP}:data-version`;
    private static AUTO_BACKUP_SAFETY_KEY = `${StorageKeys.AUTO_BACKUP}:safety`;

    public getData(): string | null {
        return this.getCurrentData();
    }

    public getTimestamp(): string | null {
        return this.getCurrentTimestamp();
    }

    /**
     * Legacy primary keys take precedence until the next successful write.
     * History keeps the current snapshot first, regardless of remote clocks.
     */
    public getCurrentData(): string | null {
        return localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_KEY)
            || this.readHistory()[0]?.data
            || null;
    }

    public getCurrentTimestamp(): string | null {
        return localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_TS_KEY)
            || this.readHistory()[0]?.timestamp
            || null;
    }

    /**
     * Version of the app data captured in the current primary backup.
     * A missing value means the entry predates version-aware backups or came
     * from a remote source that does not provide a local data version.
     */
    public getSnapshotDataVersion(): string | null {
        const currentData = localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_KEY);
        if (currentData !== null) {
            return localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_DATA_VERSION_KEY);
        }
        return this.readHistory()[0]?.snapshotDataVersion ?? null;
    }

    /** @deprecated Use getSnapshotDataVersion for the currently staged backup. */
    public getLatestSnapshotDataVersion(): string | null {
        return this.getSnapshotDataVersion();
    }

    public getAllBackups(): AutoBackupEntry[] {
        // Both stores can coexist during migration. Reading only history could
        // hide a newer remote backup that was written through the legacy keys.
        return this.sortAndDeduplicate([
            ...this.readLegacyBackup(),
            ...this.readHistory()
        ]);
    }

    public setData(data: string, timestamp: string, snapshotDataVersion?: string | null): void {
        const history = this.getAllBackups().map(item => ({ ...item, id: item.id || IdService.create() }));
        const next = [{
            id: history.find(item => item.timestamp === timestamp && item.data === data)?.id || IdService.create(),
            data,
            timestamp,
            ...(snapshotDataVersion !== undefined && snapshotDataVersion !== null ? { snapshotDataVersion } : {})
        }, ...history.filter(item => item.timestamp !== timestamp || item.data !== data)]
            .slice(0, AppConstants.MAX_AUTO_BACKUPS);

        // Commit the new snapshot atomically before removing legacy mirrors.
        // The first history entry is current even if a remote clock is older.
        this.writeHistory(next);
        localStorage.removeItem(AutoBackupStorage.AUTO_BACKUP_KEY);
        localStorage.removeItem(AutoBackupStorage.AUTO_BACKUP_TS_KEY);
        localStorage.removeItem(AutoBackupStorage.AUTO_BACKUP_DATA_VERSION_KEY);
    }

    /**
     * Stores a local recovery copy without replacing a remote payload staged
     * for import. Safety snapshots are intentionally kept out of normal history.
     */
    public setSafetyData(data: string, timestamp: string, snapshotDataVersion?: string | null): void {
        const entry: AutoBackupEntry = {
            data,
            timestamp,
            ...(snapshotDataVersion !== undefined && snapshotDataVersion !== null ? { snapshotDataVersion } : {})
        };
        try {
            localStorage.setItem(AutoBackupStorage.AUTO_BACKUP_SAFETY_KEY, JSON.stringify(entry));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Não foi possível guardar o snapshot de segurança: ${message}`);
        }
    }

    public getSafetyData(): string | null {
        try {
            const raw = localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_SAFETY_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as unknown;
            return this.isBackupEntry(parsed) ? parsed.data : null;
        } catch {
            return null;
        }
    }

    private readLegacyBackup(): AutoBackupEntry[] {
        const data = localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_KEY);
        const timestamp = localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_TS_KEY);
        if (!data || !timestamp) return [];
        return [{ data, timestamp }];
    }

    private readHistory(): AutoBackupEntry[] {
        let raw: string | null;
        try {
            raw = localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_HISTORY_KEY);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Não foi possível ler o histórico de backups: ${message}`);
        }
        if (!raw) return [];

        try {
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((item): item is AutoBackupEntry => this.isBackupEntry(item))
                .map(item => ({ ...item }));
        } catch {
            return [];
        }
    }

    private sortAndDeduplicate(entries: AutoBackupEntry[]): AutoBackupEntry[] {
        const unique: AutoBackupEntry[] = [];
        entries.forEach(entry => {
            const existing = unique.find(item => item.timestamp === entry.timestamp && item.data === entry.data);
            if (!existing) {
                unique.push({ ...entry });
                return;
            }
            existing.id ??= entry.id;
            existing.snapshotDataVersion ??= entry.snapshotDataVersion;
        });

        return unique
            .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
            .slice(0, AppConstants.MAX_AUTO_BACKUPS);
    }

    private writeHistory(history: AutoBackupEntry[]): void {
        const retained = history.slice(0, AppConstants.MAX_AUTO_BACKUPS);
        while (retained.length > 0) {
            try {
                localStorage.setItem(AutoBackupStorage.AUTO_BACKUP_HISTORY_KEY, JSON.stringify(retained));
                return;
            } catch (error) {
                const name = error instanceof Error ? error.name : '';
                const isQuotaError = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
                if (isQuotaError && retained.length > 1) {
                    retained.pop();
                    continue;
                }
                const message = isQuotaError
                    ? 'Espaço insuficiente no navegador para uma nova cópia. Os backups anteriores foram preservados.'
                    : error instanceof Error ? error.message : String(error);
                throw new Error(`Não foi possível guardar o histórico de backups: ${message}`);
            }
        }
    }

    private isBackupEntry(value: unknown): value is AutoBackupEntry {
        return !!value
            && typeof value === 'object'
            && typeof (value as { data?: unknown }).data === 'string'
            && typeof (value as { timestamp?: unknown }).timestamp === 'string'
            && ((value as { snapshotDataVersion?: unknown }).snapshotDataVersion === undefined
                || typeof (value as { snapshotDataVersion?: unknown }).snapshotDataVersion === 'string');
    }
}
