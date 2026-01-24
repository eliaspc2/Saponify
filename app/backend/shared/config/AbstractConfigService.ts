import { BaseService } from '../core/BaseService';
import { touchDataVersion } from '../versioning/dataVersion';

type MergeFn<T> = (defaults: T, stored: unknown) => T;

export class AbstractConfigService<T> extends BaseService<T> {
    protected storageKey: string;
    protected defaults: T;
    protected data: T;
    protected version?: number;
    protected versionKey: string;
    protected mergeWithDefaults: MergeFn<T>;
    protected silentParseErrors: boolean;

    constructor(
        serviceName: string,
        storageKey: string,
        defaults: T,
        options?: {
            version?: number;
            mergeWithDefaults?: MergeFn<T>;
            versionKeySuffix?: string;
            silentParseErrors?: boolean;
        }
    ) {
        super(serviceName);
        this.storageKey = storageKey;
        this.defaults = defaults;
        this.version = options?.version;
        this.versionKey = `${storageKey}${options?.versionKeySuffix ?? ':version'}`;
        this.mergeWithDefaults = options?.mergeWithDefaults ?? this.defaultMerge;
        this.silentParseErrors = options?.silentParseErrors ?? false;
        this.data = this.loadFromStorage();
    }

    protected getData(): T {
        return this.data;
    }

    protected setData(next: T, persist = true): void {
        this.data = next;
        if (persist) {
            this.saveToStorage();
        }
    }

    protected loadFromStorage(): T {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored) {
            return this.cloneDefaults();
        }
        try {
            const parsed = JSON.parse(stored);
            return this.mergeWithDefaults(this.defaults, parsed);
        } catch (e) {
            if (this.silentParseErrors) {
                return this.cloneDefaults();
            }
            this.handleError(new Error('Failed to parse config from storage'));
            return this.cloneDefaults();
        }
    }

    protected saveToStorage(): void {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        if (typeof this.version === 'number') {
            localStorage.setItem(this.versionKey, JSON.stringify(this.version));
        }
        touchDataVersion();
    }

    private cloneDefaults(): T {
        return this.defaultMerge(this.defaults, undefined);
    }

    private defaultMerge(defaults: T, stored: unknown): T {
        if (Array.isArray(defaults)) {
            return (Array.isArray(stored) ? stored : defaults) as T;
        }
        if (defaults && typeof defaults === 'object') {
            if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
                return { ...(defaults as Record<string, unknown>), ...(stored as Record<string, unknown>) } as T;
            }
            return { ...(defaults as Record<string, unknown>) } as T;
        }
        return ((stored ?? defaults) as T);
    }
}
