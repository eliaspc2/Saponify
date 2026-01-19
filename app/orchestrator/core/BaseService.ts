export abstract class BaseService {
    protected serviceName: string;

    constructor(name: string) {
        this.serviceName = name;
    }

    protected log(message: string, data?: any) {
        console.log(`[${this.serviceName}] ${message}`, data || '');
    }

    protected handleError(error: Error) {
        console.error(`[${this.serviceName}] Error:`, error);
        throw error;
    }
}
