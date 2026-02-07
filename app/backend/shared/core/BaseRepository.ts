import type { IRepository } from './IRepository';

export abstract class BaseRepository<T extends { id: string }> implements IRepository<T> {
    protected items: T[] = [];
    protected storageKey?: string;

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
        this.onBeforeDelete(id);
        this.items = this.items.filter(item => item.id !== id);
        this.save();
    }

    replaceAll(items: T[]): void {
        this.items = items || [];
        this.save();
    }

    protected safeParseJson<TValue>(raw: string | null, fallback: TValue): TValue {
        if (!raw) return fallback;
        try {
            return JSON.parse(raw) as TValue;
        } catch {
            return fallback;
        }
    }

    protected mergeWithDefaults<TValue>(defaults: TValue, stored: unknown): TValue {
        if (Array.isArray(defaults)) {
            return (Array.isArray(stored) ? stored : defaults) as TValue;
        }
        if (defaults && typeof defaults === 'object') {
            if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
                return { ...(defaults as Record<string, unknown>), ...(stored as Record<string, unknown>) } as TValue;
            }
            return { ...(defaults as Record<string, unknown>) } as TValue;
        }
        return ((stored ?? defaults) as TValue);
    }

    protected onBeforeDelete(_id: string): void {
        // Hook for repositories that need to persist metadata before deletion.
    }

    protected abstract loadItems(): T[];
    protected abstract saveItems(items: T[]): void;
}
