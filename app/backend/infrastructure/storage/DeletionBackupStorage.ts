import { AppConstants } from '../../../shared/constants/AppConstants';
import { StorageKeys } from '../../../shared/constants/StorageKeys';

export type DeletionBackupSnapshot = {
    id: string;
    timestamp: string;
    reason: string;
    data: Record<string, string>;
};

export class DeletionBackupStorage {
    private static BACKUP_KEY = StorageKeys.DELETION_BACKUPS;

    public static captureSnapshot(reason: string): void {
        try {
            const backups = this.readBackups();
            const snapshot: DeletionBackupSnapshot = {
                id: this.createId(),
                timestamp: new Date().toISOString(),
                reason,
                data: this.readCurrentDatabase()
            };

            backups.unshift(snapshot);
            const trimmed = backups.slice(0, AppConstants.MAX_DELETION_BACKUPS);
            localStorage.setItem(this.BACKUP_KEY, JSON.stringify(trimmed));
        } catch (error) {
            console.warn('Falha ao guardar backup de eliminação:', error);
        }
    }

    private static readCurrentDatabase(): Record<string, string> {
        const snapshot: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (!key.startsWith(StorageKeys.PREFIX)) continue;
            if (key === this.BACKUP_KEY) continue;

            const value = localStorage.getItem(key);
            if (value === null) continue;
            snapshot[key] = value;
        }
        return snapshot;
    }

    private static readBackups(): DeletionBackupSnapshot[] {
        try {
            const raw = localStorage.getItem(this.BACKUP_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];

            return parsed.filter(this.isValidSnapshot);
        } catch {
            return [];
        }
    }

    private static isValidSnapshot(value: unknown): value is DeletionBackupSnapshot {
        if (!value || typeof value !== 'object') return false;
        const candidate = value as Partial<DeletionBackupSnapshot>;
        return typeof candidate.id === 'string'
            && typeof candidate.timestamp === 'string'
            && typeof candidate.reason === 'string'
            && !!candidate.data
            && typeof candidate.data === 'object'
            && !Array.isArray(candidate.data);
    }

    private static createId(): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
}
