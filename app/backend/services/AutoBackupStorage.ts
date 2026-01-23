import { StorageKeys } from '../../shared/constants/StorageKeys';

export class AutoBackupStorage {
    private static AUTO_BACKUP_KEY = StorageKeys.AUTO_BACKUP;
    private static AUTO_BACKUP_TS_KEY = StorageKeys.AUTO_BACKUP_TIMESTAMP;

    public getData(): string | null {
        return localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_KEY);
    }

    public getTimestamp(): string | null {
        return localStorage.getItem(AutoBackupStorage.AUTO_BACKUP_TS_KEY);
    }

    public setData(data: string, timestamp: string) {
        localStorage.setItem(AutoBackupStorage.AUTO_BACKUP_KEY, data);
        localStorage.setItem(AutoBackupStorage.AUTO_BACKUP_TS_KEY, timestamp);
    }
}
