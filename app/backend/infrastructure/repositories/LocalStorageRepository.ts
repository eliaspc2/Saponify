import { BaseRepository } from './BaseRepository';
import { touchDataVersion } from '../../shared/versioning/dataVersion';
import { DeletionBackupStorage } from '../storage/DeletionBackupStorage';

type LocalStorageRepositoryOptions<T> = {
    deserialize?: (raw: any) => T[];
    serialize?: (items: T[]) => any;
    onLoadError?: (error: Error) => void;
};

export class LocalStorageRepository<T extends { id: string }> extends BaseRepository<T> {
    private key: string;
    private deserialize: (raw: any) => T[];
    private serialize: (items: T[]) => any;
    private onLoadError?: (error: Error) => void;

    constructor(key: string, options?: LocalStorageRepositoryOptions<T>) {
        super();
        this.key = key;
        this.deserialize = options?.deserialize || ((raw: any) => Array.isArray(raw) ? raw : []);
        this.serialize = options?.serialize || ((items: T[]) => items);
        this.onLoadError = options?.onLoadError;
        this.load();
    }

    protected loadItems(): T[] {
        const stored = localStorage.getItem(this.key);
        if (!stored) return [];
        try {
            const parsed = JSON.parse(stored);
            return this.deserialize(parsed) || [];
        } catch (error: any) {
            if (this.onLoadError) {
                this.onLoadError(error as Error);
            }
            return [];
        }
    }

    protected saveItems(items: T[]): void {
        const payload = this.serialize(items);
        localStorage.setItem(this.key, JSON.stringify(payload));
        touchDataVersion();
    }

    protected onBeforeDelete(id: string): void {
        if (!id) return;
        DeletionBackupStorage.captureSnapshot(`delete:${this.key}:${id}`);
    }
}
