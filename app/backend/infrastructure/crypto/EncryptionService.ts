import { BaseService } from '../../shared/core/BaseService';

export class EncryptionService extends BaseService {
    private key: CryptoKey | null = null;

    constructor() {
        super('EncryptionService');
    }

    async generateKey(): Promise<CryptoKey> {
        this.key = await window.crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt']
        );
        return this.key;
    }

    async encrypt(data: string): Promise<ArrayBuffer> {
        if (!this.key) throw new Error('Key not initialized');
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(data);

        const encrypted = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            this.key,
            encoded
        );

        // Combine IV and encrypted data
        const buffer = new Uint8Array(iv.length + encrypted.byteLength);
        buffer.set(iv);
        buffer.set(new Uint8Array(encrypted), iv.length);

        return buffer.buffer;
    }

    async decrypt(data: ArrayBuffer): Promise<string> {
        if (!this.key) throw new Error('Key not initialized');

        const iv = data.slice(0, 12);
        const ciphertext = data.slice(12);

        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            this.key,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    }
}


