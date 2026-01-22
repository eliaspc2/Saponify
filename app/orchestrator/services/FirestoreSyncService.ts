import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
    type Auth
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
        await this.ensureAuth();
        await this.syncFromRemoteIfNewer();
    }

    public async pushAutoBackup(data: string, updatedAt: string): Promise<void> {
        if (!this.isSyncEnabled()) return;
        await this.init();
        await this.ensureAuth();
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

    private async init(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            this.app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);
            await setPersistence(this.auth, browserLocalPersistence);
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

    private async ensureAuth(): Promise<void> {
        if (!this.auth) return;
        if (this.auth.currentUser) return;

        void this.signInWithGoogle();

        await new Promise<void>((resolve, reject) => {
            const unsubscribe = onAuthStateChanged(
                this.auth!,
                (user) => {
                    if (user) {
                        unsubscribe();
                        resolve();
                    }
                },
                (error) => {
                    unsubscribe();
                    reject(error);
                }
            );
        });
    }

    private async signInWithGoogle(): Promise<void> {
        if (!this.auth) return;
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(this.auth, provider);
        } catch (error) {
            await signInWithRedirect(this.auth, provider);
        }
    }
}
