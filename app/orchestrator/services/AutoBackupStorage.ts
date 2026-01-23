export class AutoBackupStorage {
    private static AUTO_BACKUP_KEY = 'saponify_auto_backup';
    private static AUTO_BACKUP_TS_KEY = `${AutoBackupStorage.AUTO_BACKUP_KEY}_timestamp`;

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
