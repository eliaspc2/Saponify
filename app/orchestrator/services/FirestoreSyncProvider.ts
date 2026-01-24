import type { ISyncProvider } from '../../backend/infrastructure/sync/ISyncProvider';
import { FirestoreSyncService } from './FirestoreSyncService';
import { AutoBackupStorage } from '../../backend/infrastructure/storage/AutoBackupStorage';

export class FirestoreSyncProvider implements ISyncProvider {
    private storage: AutoBackupStorage;

    constructor(storage?: AutoBackupStorage) {
        this.storage = storage || new AutoBackupStorage();
    }

    async start(): Promise<void> {
        await FirestoreSyncService.getInstance().start();
    }

    async push(payload: string): Promise<void> {
        const timestamp = this.storage.getTimestamp() || new Date().toISOString();
        await FirestoreSyncService.getInstance().pushAutoBackup(payload, timestamp);
    }

    async pull(): Promise<string | null> {
        const applied = await FirestoreSyncService.getInstance().pullRemoteNow();
        if (!applied) return null;
        return this.storage.getData();
    }

    public isReady(): boolean {
        const service = FirestoreSyncService.getInstance();
        return service.isSyncActive()
            && !!service.getCurrentUser()
            && service.hasCompletedInitialSync();
    }
}

