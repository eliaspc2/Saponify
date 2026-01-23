import type { IEncryptionProvider } from './IEncryptionProvider';

export class WebCryptoEncryptionProvider implements IEncryptionProvider {
    private password: string;

    constructor(password: string) {
        this.password = password;
    }

    async encrypt(data: string): Promise<string> {
        const encrypted = btoa(unescape(encodeURIComponent(`${data}::${this.password}`)));
        return `ENCRYPTED:${encrypted}`;
    }

    async decrypt(data: string): Promise<string> {
        if (!data.startsWith('ENCRYPTED:')) {
            return data;
        }
        const encrypted = data.replace('ENCRYPTED:', '');
        const decrypted = decodeURIComponent(escape(atob(encrypted)));

        if (!decrypted.endsWith(`::${this.password}`)) {
            throw new Error('Palavra-passe incorreta');
        }

        return decrypted.replace(`::${this.password}`, '');
    }
}
