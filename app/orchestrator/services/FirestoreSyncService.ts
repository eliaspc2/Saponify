import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import {
    getAuth,
    GoogleAuthProvider,
    getRedirectResult,
    signInWithPopup,
    signInWithRedirect,
    onAuthStateChanged,
    signOut,
    setPersistence,
    browserLocalPersistence,
    type Auth,
    type User
} from 'firebase/auth';
import { StorageKeys } from '../../shared/constants/StorageKeys';
import { AppConstants } from '../../shared/constants/AppConstants';

type RemoteBackupPayload = {
    data: string;
    updatedAt: string;
    deviceId: string;
};

const FIREBASE_CONFIG = AppConstants.FIREBASE_CONFIG;
const AUTO_BACKUP_KEY = StorageKeys.AUTO_BACKUP;
const AUTO_BACKUP_TS_KEY = StorageKeys.AUTO_BACKUP_TIMESTAMP;
const DATA_VERSION_KEY = StorageKeys.DATA_VERSION;
const DEVICE_ID_KEY = StorageKeys.DEVICE_ID;
const SYNC_ENABLED_KEY = StorageKeys.SYNC_ENABLED;
const SYNC_LAST_SUCCESS_KEY = StorageKeys.SYNC_LAST_SUCCESS;
const SYNC_LAST_ERROR_KEY = StorageKeys.SYNC_LAST_ERROR;
const SYNC_PASSWORD_KEY = StorageKeys.SYNC_PASSWORD;
const SYNC_ENC_PREFIX = AppConstants.SYNC_ENCRYPTION_PREFIX;
const SYNC_PENDING_IMPORT_KEY = StorageKeys.SYNC_PENDING_IMPORT;
const AUTH_REDIRECT_FLAG = StorageKeys.AUTH_REDIRECT_FLAG;
const AUTH_LAST_ATTEMPT_KEY = StorageKeys.AUTH_LAST_ATTEMPT;
const REMOTE_POLL_INTERVAL_MS = AppConstants.SYNC_REMOTE_POLL_INTERVAL_MS;

export class FirestoreSyncService {
    private static instance: FirestoreSyncService;
    private app: FirebaseApp | null = null;
    private db: Firestore | null = null;
    private auth: Auth | null = null;
    private deviceId: string;
    private initPromise: Promise<void> | null = null;
    private pendingTimer: number | null = null;
    private pendingPayload: RemoteBackupPayload | null = null;
    private remotePollTimer: number | null = null;
    private initialSyncDone = false;

    private constructor() {
        this.deviceId = this.getOrCreateId(DEVICE_ID_KEY);
    }

    public static getInstance(): FirestoreSyncService {
        if (!FirestoreSyncService.instance) {
            FirestoreSyncService.instance = new FirestoreSyncService();
        }
        return FirestoreSyncService.instance;
    }

    public async start(): Promise<void> {
        if (!this.isSyncEnabled()) return;
        await this.init();
        const user = await this.ensureAuth();
        if (!user) return;
        await this.syncFromRemoteIfNewer();
        this.initialSyncDone = true;
        this.startRemotePolling();
    }

    public async pushAutoBackup(data: string, updatedAt: string): Promise<void> {
        if (!this.isSyncEnabled()) return;
        await this.init();
        const user = await this.ensureAuth();
        if (!user) return;
        let encryptedData: string;
        try {
            encryptedData = await this.encryptForSync(data);
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Password de sincronização inválida.');
            return;
        }
        const payload: RemoteBackupPayload = {
            data: encryptedData,
            updatedAt,
            deviceId: this.deviceId
        };

        this.pendingPayload = payload;
        if (this.pendingTimer) {
            window.clearTimeout(this.pendingTimer);
        }
        this.pendingTimer = window.setTimeout(async () => {
            const ref = this.getDocRef();
            if (!ref || !this.pendingPayload) return;
            const toSend = this.pendingPayload;
            this.pendingPayload = null;
            try {
                await setDoc(ref, toSend, { merge: false });
                this.setLastSyncSuccess(new Date().toISOString());
                this.setLastSyncError('');
            } catch (error: any) {
                this.setLastSyncError(error?.message || 'Erro ao sincronizar com o Firestore.');
            }
        }, AppConstants.SYNC_WRITE_DEBOUNCE_MS);
    }

    public async signIn(): Promise<void> {
        if (!this.isSyncEnabled()) return;
        await this.init();
        await this.signInWithGoogle();
        const user = await this.ensureAuth();
        if (user) {
            await this.syncFromRemoteIfNewer();
            this.initialSyncDone = true;
            this.startRemotePolling();
        }
    }

    public async signOut(): Promise<void> {
        await this.init();
        if (!this.auth) return;
        await signOut(this.auth);
    }

    public async forceSyncNow(): Promise<boolean> {
        if (!this.isSyncEnabled()) return false;
        await this.init();
        const user = await this.ensureAuth();
        if (!user) return false;
        const data = this.safeGetItem(AUTO_BACKUP_KEY);
        if (!data) return false;
        const updatedAt = this.safeGetItem(AUTO_BACKUP_TS_KEY) || new Date().toISOString();
        let encryptedData: string;
        try {
            encryptedData = await this.encryptForSync(data);
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Password de sincronização inválida.');
            return false;
        }
        const ref = this.getDocRef();
        if (!ref) return false;
        try {
            await setDoc(ref, { data: encryptedData, updatedAt, deviceId: this.deviceId }, { merge: false });
            this.setLastSyncSuccess(new Date().toISOString());
            this.setLastSyncError('');
            return true;
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Erro ao sincronizar com o Firestore.');
            return false;
        }
    }

    public getCurrentUser(): User | null {
        return this.auth?.currentUser || null;
    }

    public isSyncActive(): boolean {
        return this.isSyncEnabled();
    }

    public hasCompletedInitialSync(): boolean {
        return this.initialSyncDone;
    }

    public async getCurrentUserAsync(): Promise<User | null> {
        await this.init();
        return this.auth?.currentUser || null;
    }

    public async getRemoteStatus(): Promise<{ updatedAt: string | null; deviceId: string | null } | null> {
        await this.init();
        const user = await this.ensureAuth();
        if (!user) return null;
        try {
            const ref = this.getDocRef();
            if (!ref) return null;
            const snap = await getDoc(ref);
            if (!snap.exists()) return { updatedAt: null, deviceId: null };
            const data = snap.data() as RemoteBackupPayload;
            return {
                updatedAt: data?.updatedAt || null,
                deviceId: data?.deviceId || null
            };
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Erro ao obter estado remoto.');
            return null;
        }
    }

    public async pullRemoteNow(): Promise<boolean> {
        if (!this.isSyncEnabled()) return false;
        await this.init();
        const user = await this.ensureAuth();
        if (!user) return false;
        const ref = this.getDocRef();
        if (!ref) return false;
        let snap;
        try {
            snap = await getDoc(ref);
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Erro ao ler do Firestore.');
            return false;
        }
        if (!snap.exists()) return false;
        const remote = snap.data() as RemoteBackupPayload;
        if (!remote?.data || !remote?.updatedAt) return false;
        try {
            const decrypted = await this.decryptFromSync(remote.data);
            this.safeSetItem(AUTO_BACKUP_KEY, decrypted);
            this.safeSetItem(AUTO_BACKUP_TS_KEY, remote.updatedAt);
            this.safeSetItem(SYNC_PENDING_IMPORT_KEY, 'true');
            this.setLastSyncSuccess(new Date().toISOString());
            this.setLastSyncError('');
            return true;
        } catch (error: any) {
            if (error?.message === 'REMOTE_NOT_ENCRYPTED') {
                const password = this.getSyncPassword();
                if (!password) {
                    this.setLastSyncError('Defina a password de sincronização para importar dados remotos.');
                    return false;
                }
                this.safeSetItem(AUTO_BACKUP_KEY, remote.data);
                this.safeSetItem(AUTO_BACKUP_TS_KEY, remote.updatedAt);
                this.safeSetItem(SYNC_PENDING_IMPORT_KEY, 'true');
                this.setLastSyncSuccess(new Date().toISOString());
                return true;
            }
            this.setLastSyncError(error?.message || 'Erro ao desencriptar dados remotos.');
            return false;
        }
    }

    private async init(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            this.app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);
            await setPersistence(this.auth, browserLocalPersistence);
            await this.consumeRedirectResult();
        })();
        return this.initPromise;
    }

    private async syncFromRemoteIfNewer(): Promise<void> {
        const ref = this.getDocRef();
        if (!ref) return;

        const localData = this.safeGetItem(AUTO_BACKUP_KEY);
        const localUpdatedAt = this.safeGetItem(AUTO_BACKUP_TS_KEY);
        const localTime = localUpdatedAt ? Date.parse(localUpdatedAt) || 0 : 0;
        const dataVersionRaw = this.safeGetItem(DATA_VERSION_KEY);
        const dataVersionMs = dataVersionRaw ? Number(dataVersionRaw) : 0;
        const localDirtySinceBackup = Number.isFinite(dataVersionMs) && dataVersionMs > localTime;

        let snap;
        try {
            snap = await getDoc(ref);
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Erro ao ler do Firestore.');
            return;
        }
        if (!snap.exists()) {
            if (localData && localUpdatedAt) {
                await this.pushAutoBackup(localData, localUpdatedAt);
            }
            return;
        }

        const remote = snap.data() as RemoteBackupPayload;
        if (!remote?.data || !remote?.updatedAt) return;

        const remoteTime = Date.parse(remote.updatedAt) || 0;
        if (remote.deviceId === this.deviceId && localTime >= remoteTime) {
            return;
        }

        if (remoteTime > localTime) {
            if (localDirtySinceBackup) {
                return;
            }
            try {
                const decrypted = await this.decryptFromSync(remote.data);
                this.safeSetItem(AUTO_BACKUP_KEY, decrypted);
                this.safeSetItem(AUTO_BACKUP_TS_KEY, remote.updatedAt);
                this.safeSetItem(SYNC_PENDING_IMPORT_KEY, 'true');
                this.setLastSyncSuccess(new Date().toISOString());
                this.setLastSyncError('');
                return;
            } catch (error: any) {
                if (error?.message === 'REMOTE_NOT_ENCRYPTED') {
                    const password = this.getSyncPassword();
                    if (!password) {
                        this.setLastSyncError('Defina a password de sincronização para importar dados remotos.');
                        return;
                    }
                    const migratedAt = new Date().toISOString();
                    this.safeSetItem(AUTO_BACKUP_KEY, remote.data);
                    this.safeSetItem(AUTO_BACKUP_TS_KEY, migratedAt);
                    this.safeSetItem(SYNC_PENDING_IMPORT_KEY, 'true');
                    await this.pushAutoBackup(remote.data, migratedAt);
                    this.setLastSyncSuccess(new Date().toISOString());
                    return;
                }
                this.setLastSyncError(error?.message || 'Erro ao desencriptar dados remotos.');
                return;
            }
        }

        if (localData && localUpdatedAt && localTime > remoteTime) {
            await this.pushAutoBackup(localData, localUpdatedAt);
        }
    }

    private startRemotePolling(): void {
        if (this.remotePollTimer) return;
        this.remotePollTimer = window.setInterval(async () => {
            if (!this.isSyncEnabled()) return;
            await this.init();
            const user = await this.ensureAuth();
            if (!user) return;
            await this.syncFromRemoteIfNewer();
        }, REMOTE_POLL_INTERVAL_MS);
    }

    private getDocRef() {
        const uid = this.auth?.currentUser?.uid;
        if (!this.db || !uid) return null;
        return doc(
            this.db,
            AppConstants.FIRESTORE_USERS_COLLECTION,
            uid,
            AppConstants.FIRESTORE_APP_STATE_DOC,
            AppConstants.FIRESTORE_MAIN_DOC
        );
    }

    private getOrCreateId(key: string): string {
        const existing = this.safeGetItem(key);
        if (existing) return existing;
        const generated = this.generateId();
        this.safeSetItem(key, generated);
        return generated;
    }

    private generateId(): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }

    private safeGetItem(key: string): string | null {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    private safeSetItem(key: string, value: string) {
        try {
            localStorage.setItem(key, value);
        } catch {
            // Ignore storage errors to avoid breaking the app.
        }
    }

    private setLastSyncSuccess(timestamp: string) {
        this.safeSetItem(SYNC_LAST_SUCCESS_KEY, timestamp);
    }

    private setLastSyncError(message: string) {
        this.safeSetItem(SYNC_LAST_ERROR_KEY, message);
    }

    private getSyncPassword(): string | null {
        const globalOverride = typeof window !== 'undefined'
            ? (window as any)[AppConstants.GLOBAL_SYNC_PASSWORD_OVERRIDE]
            : null;
        if (typeof globalOverride === 'string' && globalOverride.trim()) {
            return globalOverride.trim();
        }
        const stored = this.safeGetItem(SYNC_PASSWORD_KEY);
        if (!stored || !stored.trim()) return null;
        return stored.trim();
    }

    private async encryptForSync(data: string): Promise<string> {
        const password = this.getSyncPassword();
        if (!password) {
            throw new Error('Defina a password de sincronização.');
        }
        const salt = window.crypto.getRandomValues(new Uint8Array(AppConstants.SYNC_SALT_LENGTH));
        const iv = window.crypto.getRandomValues(new Uint8Array(AppConstants.SYNC_IV_LENGTH));
        const key = await this.deriveKeyFromPassword(password, salt);
        const encoded = new TextEncoder().encode(data);
        const cipher = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded
        );
        const combined = new Uint8Array(salt.length + iv.length + cipher.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(cipher), salt.length + iv.length);
        return `${SYNC_ENC_PREFIX}${this.bytesToBase64(combined)}`;
    }

    private async decryptFromSync(payload: string): Promise<string> {
        if (!payload.startsWith(SYNC_ENC_PREFIX)) {
            throw new Error('REMOTE_NOT_ENCRYPTED');
        }
        const password = this.getSyncPassword();
        if (!password) {
            throw new Error('Defina a password de sincronização.');
        }
        const raw = this.base64ToBytes(payload.slice(SYNC_ENC_PREFIX.length));
        const salt = raw.slice(0, AppConstants.SYNC_SALT_LENGTH);
        const iv = raw.slice(AppConstants.SYNC_SALT_LENGTH, AppConstants.SYNC_SALT_LENGTH + AppConstants.SYNC_IV_LENGTH);
        const cipher = raw.slice(AppConstants.SYNC_SALT_LENGTH + AppConstants.SYNC_IV_LENGTH);
        const key = await this.deriveKeyFromPassword(password, salt);
        const plain = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            cipher
        );
        return new TextDecoder().decode(plain);
    }

    private async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
        const baseKey = await window.crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBuffer,
                iterations: AppConstants.PBKDF2_ITERATIONS,
                hash: AppConstants.PBKDF2_HASH
            },
            baseKey,
            { name: 'AES-GCM', length: AppConstants.AES_GCM_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );
    }

    private bytesToBase64(bytes: Uint8Array): string {
        let binary = '';
        bytes.forEach((b) => {
            binary += String.fromCharCode(b);
        });
        return btoa(binary);
    }

    private base64ToBytes(value: string): Uint8Array {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    private isSyncEnabled(): boolean {
        if (typeof window !== 'undefined') {
            const override = (window as any)[AppConstants.GLOBAL_SYNC_ENABLED_OVERRIDE];
            if (override === false) return false;
        }
        const stored = this.safeGetItem(SYNC_ENABLED_KEY);
        if (stored === null) return true;
        return stored === 'true';
    }

    private async ensureAuth(): Promise<User | null> {
        if (!this.auth) return null;
        if (this.auth.currentUser) return this.auth.currentUser;

        const user = await new Promise<User | null>((resolve, reject) => {
            const unsubscribe = onAuthStateChanged(
                this.auth!,
                (user) => {
                    unsubscribe();
                    resolve(user);
                },
                (error) => {
                    unsubscribe();
                    reject(error);
                }
            );
        });
        return user;
    }

    private async signInWithGoogle(): Promise<void> {
        if (!this.auth) return;
        const provider = new GoogleAuthProvider();
        try {
            this.markLoginAttempt();
            await signInWithPopup(this.auth, provider);
            this.clearRedirectFlag();
        } catch (error) {
            if (this.isRedirectInProgress()) return;
            this.setRedirectFlag();
            this.markLoginAttempt();
            await signInWithRedirect(this.auth, provider);
        }
    }

    private async consumeRedirectResult(): Promise<void> {
        if (!this.auth) return;
        if (!this.isRedirectInProgress()) return;
        try {
            await getRedirectResult(this.auth);
        } finally {
            this.clearRedirectFlag();
        }
    }

    private isRedirectInProgress(): boolean {
        try {
            return sessionStorage.getItem(AUTH_REDIRECT_FLAG) === 'true';
        } catch {
            return false;
        }
    }

    private setRedirectFlag() {
        try {
            sessionStorage.setItem(AUTH_REDIRECT_FLAG, 'true');
        } catch {
            // ignore
        }
    }

    private clearRedirectFlag() {
        try {
            sessionStorage.removeItem(AUTH_REDIRECT_FLAG);
        } catch {
            // ignore
        }
    }

    private markLoginAttempt() {
        try {
            sessionStorage.setItem(AUTH_LAST_ATTEMPT_KEY, String(Date.now()));
        } catch {
            // ignore
        }
    }
}
