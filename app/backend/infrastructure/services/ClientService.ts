import { BaseService } from '../../shared/core/BaseService';
import { Client } from '../../../shared/types/Client';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import { prepareClientForSave } from '../../domain/clients/ClientNormalizer';
import { StorageKeys } from '../../../shared/constants/StorageKeys';

export class ClientService extends BaseService<Client> {
    private static instance: ClientService;
    private storageRepository: LocalStorageRepository<Client>;

    private constructor() {
        super('ClientService');
        this.storageRepository = new LocalStorageRepository<Client>(StorageKeys.CLIENTS, {
            deserialize: (raw) => Array.isArray(raw) ? raw : [],
            serialize: (items) => items
        });
        this.setRepository(this.storageRepository);
    }

    public static getInstance(): ClientService {
        if (!ClientService.instance) {
            ClientService.instance = new ClientService();
        }
        return ClientService.instance;
    }

    public getAll(): Client[] {
        return this.getAllItems();
    }

    public getById(id: string): Client | undefined {
        return this.getByIdItem(id);
    }

    public save(client: Client): void {
        const exists = this.storageRepository.getAll().some(c => c.id === client.id);
        const normalized = prepareClientForSave(client, exists);
        if (exists) {
            this.storageRepository.update(normalized);
        } else {
            this.storageRepository.add(normalized);
        }
    }

    public delete(id: string): void {
        this.deleteItem(id);
    }

    public replaceAll(clients: Client[]): void {
        this.replaceAllItems(clients || []);
    }
}




