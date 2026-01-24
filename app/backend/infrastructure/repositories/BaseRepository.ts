import type { IRepository } from './IRepository';

export abstract class BaseRepository<T extends { id: string }> implements IRepository<T> {
    protected items: T[] = [];

    load(): void {
        this.items = this.loadItems();
    }

    save(): void {
        this.saveItems(this.items);
    }

    getAll(): T[] {
        return this.items;
    }

    getById(id: string): T | undefined {
        return this.items.find(item => item.id === id);
    }

    add(item: T): void {
        this.items.push(item);
        this.save();
    }

    update(item: T): void {
        const index = this.items.findIndex(existing => existing.id === item.id);
        if (index >= 0) {
            this.items[index] = item;
            this.save();
        }
    }

    upsert(item: T): void {
        const index = this.items.findIndex(existing => existing.id === item.id);
        if (index >= 0) {
            this.items[index] = item;
        } else {
            this.items.push(item);
        }
        this.save();
    }

    delete(id: string): void {
        this.items = this.items.filter(item => item.id !== id);
        this.save();
    }

    replaceAll(items: T[]): void {
        this.items = items || [];
        this.save();
    }

    protected abstract loadItems(): T[];
    protected abstract saveItems(items: T[]): void;
}
