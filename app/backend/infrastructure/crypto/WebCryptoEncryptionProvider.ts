import type { IEncryptionProvider } from './IEncryptionProvider';
import { AppConstants } from '../../../shared/constants/AppConstants';

export class WebCryptoEncryptionProvider implements IEncryptionProvider {
    private password: string;

    constructor(password: string) {
        this.password = password;
    }

    async encrypt(data: string): Promise<string> {
        const encrypted = btoa(unescape(encodeURIComponent(`${data}::${this.password}`)));
        return `${AppConstants.ENCRYPTED_PREFIX}${encrypted}`;
    }

    async decrypt(data: string): Promise<string> {
        if (!data.startsWith(AppConstants.ENCRYPTED_PREFIX)) {
            return data;
        }
        const encrypted = data.replace(AppConstants.ENCRYPTED_PREFIX, '');
        const decrypted = decodeURIComponent(escape(atob(encrypted)));

        if (!decrypted.endsWith(`::${this.password}`)) {
            throw new Error('Palavra-passe incorreta');
        }

        return decrypted.replace(`::${this.password}`, '');
    }
}



