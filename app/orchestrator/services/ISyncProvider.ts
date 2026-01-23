export interface ISyncProvider {
    start(): Promise<void>;
    push(payload: string): Promise<void>;
    pull(): Promise<string | null>;
}
