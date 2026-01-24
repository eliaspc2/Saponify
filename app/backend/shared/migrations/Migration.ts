export type Migration<T = unknown> = {
    fromVersion: number;
    toVersion: number;
    description: string;
    migrate: (data: T) => T;
};
