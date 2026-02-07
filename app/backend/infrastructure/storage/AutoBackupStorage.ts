import { StorageKeys } from '../../../shared/constants/StorageKeys';
import { AppConstants } from '../../../shared/constants/AppConstants';

type AutoBackupEntry = {
    timestamp: string;
    data: string;
};

export class AutoBackupStorage {
    private static AUTO_BACKUP_KEY = StorageKeys.AUTO_BACKUP;
    private static AUTO_BACKUP_TS_KEY = StorageKeys.AUTO_BACKUP_TIMESTAMP;
    private static AUTO_BACKUP_HISTORY_KEY = StorageKeys.AUTO_BACKUP_HISTORY;

    public getData(): string | null {
        const latest = this.getLatestBackup();
        if (latest) return latest.data;
        return localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_KEY);
    }

    public getTimestamp(): string | null {
        const latest = this.getLatestBackup();
        if (latest) return latest.timestamp;
        return localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_TS_KEY);
    }

    public getAllBackups(): AutoBackupEntry[] {
        const fromHistory = this.readHistory();
        if (fromHistory.length > 0) {
            return fromHistory;
        }

        const legacyData = localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_KEY);
        const legacyTimestamp = localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_TS_KEY);
        if (!legacyData || !legacyTimestamp) return [];

        const legacyEntry: AutoBackupEntry = {
            timestamp: legacyTimestamp,
            data: legacyData
        };
        this.writeHistory([legacyEntry]);
        return [legacyEntry];
    }

    public setData(data: string, timestamp: string) {
        localStorage.setItem(AutoBackupStorage.AUTO_BACKUP_KEY, data);
        localStorage.setItem(AutoBackupStorage.AUTO_BACKUP_TS_KEY, timestamp);

        const history = this.getAllBackups();
        const next = [{ data, timestamp }, ...history.filter(item => item.timestamp !== timestamp)]
            .slice(0, AppConstants.MAX_AUTO_BACKUPS);
        this.writeHistory(next);
    }

    private getLatestBackup(): AutoBackupEntry | null {
        const history = this.readHistory();
        if (history.length === 0) return null;
        return history[0];
    }

    private readHistory(): AutoBackupEntry[] {
        try {
            const raw = localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_HISTORY_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) return [];

            return parsed
                .filter((item): item is AutoBackupEntry => {
                    return !!item
                        && typeof item === 'object'
                        && typeof (item as { data?: unknown }).data === 'string'
                        && typeof (item as { timestamp?: unknown }).timestamp === 'string';
                })
                .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
        } catch {
            return [];
        }
    }

    private writeHistory(history: AutoBackupEntry[]) {
        try {
            localStorage.setItem(AutoBackupStorage.AUTO_BACKUP_HISTORY_KEY, JSON.stringify(history));
        } catch {
            // Ignore storage errors.
        }
    }
}
