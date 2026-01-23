export class BackupFileTransfer {
    public downloadBackup(json: string) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `saponify_backup_${timestamp}.json`;
        this.downloadJson(filename, json);
    }

    public downloadAutoBackup(data: string, timestamp: string) {
        const safeTimestamp = timestamp.replace(/[:.]/g, '-').slice(0, 19);
        const filename = `saponify_auto_backup_${safeTimestamp}.json`;
        this.downloadJson(filename, data);
    }

    public async readFile(file: File): Promise<string> {
        return file.text();
    }

    private downloadJson(filename: string, data: string) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
