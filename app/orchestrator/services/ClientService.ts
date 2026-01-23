import { BaseService } from '../core/BaseService';
import { Client } from '../../shared/types/Client';
import { ClientActivity } from '../../shared/types/ClientActivity';
import { touchDataVersion } from '../utils/dataVersion';

export class ClientService extends BaseService {
    private static instance: ClientService;
    private clients: Client[] = [];
    private activities: ClientActivity[] = [];

    private constructor() {
        super('ClientService');
        this.loadFromStorage();
    }

    public static getInstance(): ClientService {
        if (!ClientService.instance) {
            ClientService.instance = new ClientService();
        }
        return ClientService.instance;
    }

    private loadFromStorage() {
        const storedClients = localStorage.getItem('saponify_clients');
        if (storedClients) {
            try {
                this.clients = JSON.parse(storedClients);
            } catch (e) {
                this.clients = [];
            }
        }

        const storedActivities = localStorage.getItem('saponify_activities');
        if (storedActivities) {
            try {
                this.activities = JSON.parse(storedActivities);
            } catch (e) {
                this.activities = [];
            }
        }
    }

    private saveToStorage() {
        localStorage.setItem('saponify_clients', JSON.stringify(this.clients));
        localStorage.setItem('saponify_activities', JSON.stringify(this.activities));
        touchDataVersion();
    }

    public getAll(): Client[] {
        return this.clients;
    }

    public getById(id: string): Client | undefined {
        return this.clients.find(c => c.id === id);
    }

    public save(client: Client): void {
        const index = this.clients.findIndex(c => c.id === client.id);
        if (index >= 0) {
            this.clients[index] = { ...client, updatedAt: new Date().toISOString() };
        } else {
            const newClient = {
                ...client,
                id: client.id || Math.random().toString(36).substr(2, 9),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.clients.push(newClient);

            // Add initial system activity
            this.addActivity({
                id: Math.random().toString(36).substr(2, 9),
                clientId: newClient.id,
                timestamp: new Date().toISOString(),
                type: 'system',
                title: 'Cliente Criado',
                content: 'A ficha de cliente foi aberta no sistema.'
            });
        }
        this.saveToStorage();
    }

    public delete(id: string): void {
        this.clients = this.clients.filter(c => c.id !== id);
        this.activities = this.activities.filter(a => a.clientId !== id);
        this.saveToStorage();
    }

    public getActivities(clientId: string): ClientActivity[] {
        return this.activities
            .filter(a => a.clientId === clientId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    public addActivity(activity: ClientActivity): void {
        this.activities.push({
            ...activity,
            id: activity.id || Math.random().toString(36).substr(2, 9),
            timestamp: activity.timestamp || new Date().toISOString()
        });
        this.saveToStorage();
    }

    public deleteActivity(activityId: string): void {
        this.activities = this.activities.filter(a => a.id !== activityId);
        this.saveToStorage();
    }

    public getAllActivities(): ClientActivity[] {
        return this.activities;
    }

    public replaceAll(clients: Client[], activities: ClientActivity[] = []): void {
        this.clients = clients || [];
        this.activities = activities || [];
        this.saveToStorage();
    }
}
