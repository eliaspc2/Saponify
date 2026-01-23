import { BaseService } from '../core/BaseService';
import { Client } from '../../shared/types/Client';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';

export class ClientService extends BaseService {
    private static instance: ClientService;
    private repository: LocalStorageRepository<Client>;

    private constructor() {
        super('ClientService');
        this.repository = new LocalStorageRepository<Client>('saponify_clients', {
            deserialize: (raw) => Array.isArray(raw) ? raw : [],
            serialize: (items) => items
        });
    }

    public static getInstance(): ClientService {
        if (!ClientService.instance) {
            ClientService.instance = new ClientService();
        }
        return ClientService.instance;
    }

    public getAll(): Client[] {
        return this.repository.getAll();
    }

    public getById(id: string): Client | undefined {
        return this.repository.getById(id);
    }

    public save(client: Client): void {
        const index = this.repository.getAll().findIndex(c => c.id === client.id);
        if (index >= 0) {
            this.repository.update({ ...client, updatedAt: new Date().toISOString() });
        } else {
            const newClient = {
                ...client,
                id: client.id || Math.random().toString(36).substr(2, 9),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.repository.add(newClient);
        }
    }

    public delete(id: string): void {
        this.repository.delete(id);
    }

    public replaceAll(clients: Client[]): void {
        this.repository.replaceAll(clients || []);
    }
}
