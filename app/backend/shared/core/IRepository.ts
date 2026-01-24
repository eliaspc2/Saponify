export interface IRepository<T extends { id: string }> {
    load(): void;
    save(): void;
    getAll(): T[];
    getById(id: string): T | undefined;
    add(item: T): void;
    update(item: T): void;
    upsert(item: T): void;
    delete(id: string): void;
    replaceAll(items: T[]): void;
}
