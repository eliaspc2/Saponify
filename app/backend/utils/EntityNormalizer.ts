import { IdService } from '../services/IdService';

type KeyOf<T> = Extract<keyof T, string>;

export type EntityNormalizerOptions<T> = {
    ensureId?: boolean;
    idKey?: KeyOf<T>;
    idPrefix?: string;
    idFactory?: () => string;
    createdAtKey?: KeyOf<T>;
    updatedAtKey?: KeyOf<T>;
    touchUpdatedAt?: boolean;
    timestampKey?: KeyOf<T>;
    touchTimestamp?: boolean;
    now?: () => string;
};

export const normalizeEntity = <T extends Record<string, any>>(entity: T, options: EntityNormalizerOptions<T> = {}): T => {
    const result = { ...entity };
    const idKey = (options.idKey ?? 'id') as KeyOf<T>;
    const ensureId = options.ensureId !== false;
    const now = options.now ?? (() => new Date().toISOString());

    if (ensureId) {
        const currentId = result[idKey];
        if (!currentId) {
            const baseId = options.idFactory ? options.idFactory() : IdService.create();
            result[idKey] = `${options.idPrefix ?? ''}${baseId}` as T[KeyOf<T>];
        }
    }

    if (options.createdAtKey) {
        const key = options.createdAtKey;
        if (!result[key]) {
            result[key] = now() as T[KeyOf<T>];
        }
    }

    if (options.updatedAtKey) {
        const key = options.updatedAtKey;
        const shouldTouch = options.touchUpdatedAt !== false;
        if (shouldTouch) {
            result[key] = now() as T[KeyOf<T>];
        } else if (!result[key]) {
            result[key] = now() as T[KeyOf<T>];
        }
    }

    if (options.timestampKey) {
        const key = options.timestampKey;
        const shouldTouch = options.touchTimestamp === true;
        if (shouldTouch) {
            result[key] = now() as T[KeyOf<T>];
        } else if (!result[key]) {
            result[key] = now() as T[KeyOf<T>];
        }
    }

    return result;
};
