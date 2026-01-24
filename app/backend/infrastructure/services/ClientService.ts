import { BaseService } from '../../shared/core/BaseService';
import { Client } from '../../../shared/types/Client';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import { prepareClientForSave } from '../../domain/clients/ClientNormalizer';
import { StorageKeys } from '../../../shared/constants/StorageKeys';

export class ClientService extends BaseService {
    private static instance: ClientService;
    private repository: LocalStorageRepository<Client>;

    private constructor() {
        super('ClientService');
        this.repository = new LocalStorageRepository<Client>(StorageKeys.CLIENTS, {
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
        const exists = this.repository.getAll().some(c => c.id === client.id);
        const normalized = prepareClientForSave(client, exists);
        if (exists) {
            this.repository.update(normalized);
        } else {
            this.repository.add(normalized);
        }
    }

    public delete(id: string): void {
        this.repository.delete(id);
    }

    public replaceAll(clients: Client[]): void {
        this.repository.replaceAll(clients || []);
    }
}




