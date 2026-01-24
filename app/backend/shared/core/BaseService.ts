import type { BaseRepository } from './BaseRepository';

export abstract class BaseService<T = unknown> {
    protected serviceName: string;
    protected repository?: BaseRepository<any>;

    constructor(name: string, repository?: BaseRepository<any>) {
        this.serviceName = name;
        this.repository = repository;
    }

    protected setRepository(repository: BaseRepository<any>) {
        this.repository = repository;
    }

    protected getAllItems(): T[] {
        return this.repository ? (this.repository.getAll() as T[]) : [];
    }

    protected getByIdItem(id: string): T | undefined {
        return this.repository ? (this.repository.getById(id) as T | undefined) : undefined;
    }

    protected addItem(item: T): void {
        if (this.repository) {
            this.repository.add(item as any);
        }
    }

    protected updateItem(item: T): void {
        if (this.repository) {
            this.repository.update(item as any);
        }
    }

    protected upsertItem(item: T): void {
        if (this.repository) {
            this.repository.upsert(item as any);
        }
    }

    protected deleteItem(id: string): void {
        if (this.repository) {
            this.repository.delete(id);
        }
    }

    protected replaceAllItems(items: T[]): void {
        if (this.repository) {
            this.repository.replaceAll(items as any);
        }
    }

    protected log(message: string, data?: any) {
        console.log(`[${this.serviceName}] ${message}`, data || '');
    }

    protected handleError(error: Error) {
        console.error(`[${this.serviceName}] Error:`, error);
        throw error;
    }
}
