import { Client } from '../../../shared/types/Client';

const generateClientId = () => Math.random().toString(36).substr(2, 9);

export const prepareClientForSave = (client: Client, exists: boolean): Client => {
    const now = new Date().toISOString();
    if (exists) {
        return { ...client, updatedAt: now };
    }
    return {
        ...client,
        id: client.id || generateClientId(),
        createdAt: now,
        updatedAt: now
    };
};

