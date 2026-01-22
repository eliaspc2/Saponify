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

type RemoteBackupPayload = {
    data: string;
    updatedAt: string;
    deviceId: string;
};

const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAF-gunjUtjfz4NouUulE3pfKylDKbrabw',
    authDomain: 'saponify-sync.firebaseapp.com',
    projectId: 'saponify-sync',
    storageBucket: 'saponify-sync.firebasestorage.app',
    messagingSenderId: '14943408423',
    appId: '1:14943408423:web:590ec820e586f522e65902'
};

const AUTO_BACKUP_KEY = 'saponify_auto_backup';
const AUTO_BACKUP_TS_KEY = `${AUTO_BACKUP_KEY}_timestamp`;
const DEVICE_ID_KEY = 'saponify_device_id';
const SYNC_ENABLED_KEY = 'saponify_sync_enabled';
const AUTH_REDIRECT_FLAG = 'saponify_auth_redirect_in_progress';
const AUTH_LAST_ATTEMPT_KEY = 'saponify_auth_last_attempt';

export class FirestoreSyncService {
    private static instance: FirestoreSyncService;
    private app: FirebaseApp | null = null;
    private db: Firestore | null = null;
    private auth: Auth | null = null;
    private deviceId: string;
    private initPromise: Promise<void> | null = null;
    private pendingTimer: number | null = null;
    private pendingPayload: RemoteBackupPayload | null = null;

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
    }

    public async pushAutoBackup(data: string, updatedAt: string): Promise<void> {
        if (!this.isSyncEnabled()) return;
        await this.init();
        const user = await this.ensureAuth();
        if (!user) return;
        const payload: RemoteBackupPayload = {
            data,
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
            await setDoc(ref, toSend, { merge: false });
        }, 500);
    }

    public async signIn(): Promise<void> {
        if (!this.isSyncEnabled()) return;
        await this.init();
        await this.signInWithGoogle();
        const user = await this.ensureAuth();
        if (user) {
            await this.syncFromRemoteIfNewer();
        }
    }

    public async signOut(): Promise<void> {
        await this.init();
        if (!this.auth) return;
        await signOut(this.auth);
    }

    public getCurrentUser(): User | null {
        return this.auth?.currentUser || null;
    }

    public async getCurrentUserAsync(): Promise<User | null> {
        await this.init();
        return this.auth?.currentUser || null;
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

        const snap = await getDoc(ref);
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
            this.safeSetItem(AUTO_BACKUP_KEY, remote.data);
            this.safeSetItem(AUTO_BACKUP_TS_KEY, remote.updatedAt);
            return;
        }

        if (localData && localUpdatedAt && localTime > remoteTime) {
            await this.pushAutoBackup(localData, localUpdatedAt);
        }
    }

    private getDocRef() {
        const uid = this.auth?.currentUser?.uid;
        if (!this.db || !uid) return null;
        return doc(this.db, 'users', uid, 'appState', 'main');
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

    private isSyncEnabled(): boolean {
        if (typeof window !== 'undefined') {
            const override = (window as any).__SAPONIFY_FIRESTORE_SYNC_ENABLED__;
            if (override === false) return false;
        }
        const stored = this.safeGetItem(SYNC_ENABLED_KEY);
        if (stored === null) return true;
        return stored === 'true';
    }

    private async ensureAuth(): Promise<User | null> {
        if (!this.auth) return;
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

    private isLoginCooldownActive(): boolean {
        try {
            const last = parseInt(sessionStorage.getItem(AUTH_LAST_ATTEMPT_KEY) || '0', 10);
            if (!last) return false;
            return Date.now() - last < 5000;
        } catch {
            return false;
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
