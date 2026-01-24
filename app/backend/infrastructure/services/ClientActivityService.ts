import { BaseService } from '../../shared/core/BaseService';
import { ClientActivity } from '../../../shared/types/ClientActivity';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import { normalizeEntity } from '../../shared/normalizers/EntityNormalizer';
import { StorageKeys } from '../../../shared/constants/StorageKeys';

export class ClientActivityService extends BaseService {
    private static instance: ClientActivityService;
    private repository: LocalStorageRepository<ClientActivity>;

    private constructor() {
        super('ClientActivityService');
        this.repository = new LocalStorageRepository<ClientActivity>(StorageKeys.ACTIVITIES, {
            deserialize: (raw) => Array.isArray(raw) ? raw : [],
            serialize: (items) => items
        });
        this.setRepository(this.repository);
    }

    public static getInstance(): ClientActivityService {
        if (!ClientActivityService.instance) {
            ClientActivityService.instance = new ClientActivityService();
        }
        return ClientActivityService.instance;
    }

    public getAllActivities(): ClientActivity[] {
        return this.getAllItems();
    }

    public getActivities(clientId: string): ClientActivity[] {
        return this.getAllItems()
            .filter(activity => activity.clientId === clientId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    public addActivity(activity: ClientActivity): void {
        const normalized = normalizeEntity(activity, {
            ensureId: true,
            idKey: 'id',
            timestampKey: 'timestamp'
        });
        this.addItem(normalized);
    }

    public deleteActivity(activityId: string): void {
        this.deleteItem(activityId);
    }

    public deleteByClient(clientId: string): void {
        const remaining = this.getAllItems().filter(activity => activity.clientId !== clientId);
        this.replaceAllItems(remaining);
    }

    public replaceAll(activities: ClientActivity[]): void {
        this.replaceAllItems(activities || []);
    }
}




