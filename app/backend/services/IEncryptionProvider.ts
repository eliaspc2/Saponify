export interface IEncryptionProvider {
    encrypt(data: string): Promise<string>;
    decrypt(data: string): Promise<string>;
}
