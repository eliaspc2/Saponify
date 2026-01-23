import { BaseService } from '../core/BaseService';
import { ClientActivity } from '../../shared/types/ClientActivity';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import { IdService } from './IdService';

export class ClientActivityService extends BaseService {
    private static instance: ClientActivityService;
    private repository: LocalStorageRepository<ClientActivity>;

    private constructor() {
        super('ClientActivityService');
        this.repository = new LocalStorageRepository<ClientActivity>('saponify_activities', {
            deserialize: (raw) => Array.isArray(raw) ? raw : [],
            serialize: (items) => items
        });
    }

    public static getInstance(): ClientActivityService {
        if (!ClientActivityService.instance) {
            ClientActivityService.instance = new ClientActivityService();
        }
        return ClientActivityService.instance;
    }

    public getAllActivities(): ClientActivity[] {
        return this.repository.getAll();
    }

    public getActivities(clientId: string): ClientActivity[] {
        return this.repository.getAll()
            .filter(activity => activity.clientId === clientId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    public addActivity(activity: ClientActivity): void {
        this.repository.add({
            ...activity,
            id: activity.id || IdService.create(),
            timestamp: activity.timestamp || new Date().toISOString()
        });
    }

    public deleteActivity(activityId: string): void {
        this.repository.delete(activityId);
    }

    public deleteByClient(clientId: string): void {
        const remaining = this.repository.getAll().filter(activity => activity.clientId !== clientId);
        this.repository.replaceAll(remaining);
    }

    public replaceAll(activities: ClientActivity[]): void {
        this.repository.replaceAll(activities || []);
    }
}
