export interface IBaseModel {
    id: string;
    createdAt: number;
    updatedAt: number;
    version: number;
    checksum: string;
}

export abstract class BaseModel implements IBaseModel {
    id: string;
    createdAt: number;
    updatedAt: number;
    version: number;
    checksum: string;

    constructor(data?: Partial<IBaseModel>) {
        this.id = data?.id || crypto.randomUUID();
        const now = Date.now();
        this.createdAt = data?.createdAt || now;
        this.updatedAt = data?.updatedAt || now;
        this.version = data?.version || 1;
        this.checksum = data?.checksum || '';
    }

    abstract validate(): boolean;
}
