import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer as getDoc, runTransaction, type Firestore } from 'firebase/firestore';
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
import { BackupService } from '../../backend/application/backup/BackupService';
import { AutoBackupStorage } from '../../backend/infrastructure/storage/AutoBackupStorage';
import { encodeSyncData, decodeSyncData } from '../../backend/infrastructure/storage/SyncCompression';
import { getDataVersion } from '../../backend/shared/versioning/dataVersion';
import { StorageKeys } from '../../shared/constants/StorageKeys';
import { AppConstants } from '../../shared/constants/AppConstants';

type RemoteBackupPayload = {
    data: string;
    updatedAt: string;
    deviceId: string;
    revision?: number;
};

type PendingWrite = {
    data: string;
    updatedAt: string;
    dataVersion: string;
    uid: string;
    session: number;
    writeGeneration: number;
};

type StagedRemotePayload = RemoteBackupPayload & {
    uid: string;
    revision: number;
};

type ForceSyncOptions = {
    overwriteRemote?: boolean;
};

type RemoteSignature = {
    revision: number;
    updatedAt: string;
    deviceId: string;
};

type WriteResult = 'success' | 'retry' | 'conflict' | 'cancelled';

class SyncConflictError extends Error {
    constructor(message = 'Conflito de sincronização: existem alterações remotas que ainda não foram aplicadas. Escolha manter os dados locais ou importar os remotos.') {
        super(message);
        this.name = 'SyncConflictError';
    }
}

class SyncCancelledError extends Error {
    constructor() {
        super('A sincronização foi cancelada porque a conta ou as definições mudaram.');
        this.name = 'SyncCancelledError';
    }
}

const SYNC_ENABLED_KEY = StorageKeys.SYNC_ENABLED;
const SYNC_LAST_SUCCESS_KEY = StorageKeys.SYNC_LAST_SUCCESS;
const SYNC_LAST_ERROR_KEY = StorageKeys.SYNC_LAST_ERROR;
const SYNC_PASSWORD_KEY = StorageKeys.SYNC_PASSWORD;
const SYNC_PENDING_IMPORT_KEY = StorageKeys.SYNC_PENDING_IMPORT;
const AUTH_REDIRECT_FLAG = StorageKeys.AUTH_REDIRECT_FLAG;
const AUTH_LAST_ATTEMPT_KEY = StorageKeys.AUTH_LAST_ATTEMPT;
const DEVICE_ID_KEY = StorageKeys.DEVICE_ID;
const SYNC_ENC_PREFIX = AppConstants.SYNC_ENCRYPTION_PREFIX;
const SYNC_PENDING_DATA_VERSION_KEY = 'saponify_sync_pending_data_version';
const SYNC_PENDING_PAYLOAD_KEY = 'saponify_sync_pending_payload';
const SYNC_REMOTE_REVISION_PREFIX = 'saponify_sync_remote_revision_';
const SYNC_REMOTE_SIGNATURE_PREFIX = 'saponify_sync_remote_signature_';
const SYNC_LOCAL_DATA_VERSION_PREFIX = 'saponify_sync_local_data_version_';
const SYNC_PENDING_REMOTE_REVISION_PREFIX = 'saponify_sync_pending_remote_revision_';
const SYNC_CONFLICT_PREFIX = 'saponify_sync_conflict_';
const SYNC_CONFLICT_REMOTE_PREFIX = 'saponify_sync_conflict_remote_';
const SYNC_LOCAL_OWNER_KEY = 'saponify_sync_local_owner';
const SYNC_RETRY_INITIAL_MS = 2_000;
const SYNC_RETRY_MAX_MS = 60_000;
// Leave room for document fields and Firestore's 1 MiB document envelope.
const SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES = 950_000;

export class FirestoreSyncService {
    private static instance: FirestoreSyncService;
    private app: FirebaseApp | null = null;
    private db: Firestore | null = null;
    private auth: Auth | null = null;
    private readonly storage = new AutoBackupStorage();
    private readonly deviceId: string;
    private initPromise: Promise<void> | null = null;
    private startPromise: Promise<void> | null = null;
    private bootstrapPromise: Promise<boolean> | null = null;
    private remoteSyncPromise: Promise<boolean> | null = null;
    private remoteSyncUid: string | null = null;
    private writeWorker: Promise<boolean> | null = null;
    private bootstrappedUid: string | null = null;
    private sessionUid: string | null = null;
    private session = 0;
    private writeGeneration = 0;
    private pendingWrite: PendingWrite | null = null;
    private pendingTimer: number | null = null;
    private remotePollTimer: number | null = null;
    private terminalBlockedWrite: Pick<PendingWrite, 'uid' | 'dataVersion' | 'data'> | null = null;
    private retryDelayMs = SYNC_RETRY_INITIAL_MS;
    private initialSyncDone = false;

    private constructor() {
        this.deviceId = this.getOrCreateId(DEVICE_ID_KEY);
    }

    public static getInstance(): FirestoreSyncService {
        if (!FirestoreSyncService.instance) FirestoreSyncService.instance = new FirestoreSyncService();
        return FirestoreSyncService.instance;
    }

    public async start(): Promise<void> {
        if (!this.isSyncEnabled()) {
            this.cancelQueuedWork();
            return;
        }
        if (this.startPromise) return this.startPromise;
        this.startPromise = this.startInternal().finally(() => { this.startPromise = null; });
        return this.startPromise;
    }

    public async pushAutoBackup(data: string, updatedAt: string): Promise<void> {
        const dataVersion = this.storage.getSnapshotDataVersion() ?? getDataVersion();
        if (!this.isSyncEnabled()) {
            this.cancelQueuedWork();
            return;
        }
        await this.init();
        const user = await this.ensureAuth();
        if (!user || !await this.ensureRemoteBootstrap(user)) return;
        if (!this.isCurrentSession(user.uid) || this.hasConflict(user.uid) || this.hasPendingIncoming(user.uid)) return;
        if (getDataVersion() !== dataVersion) return;
        this.enqueueWrite({ data, updatedAt, dataVersion, uid: user.uid, session: this.session, writeGeneration: this.writeGeneration });
    }

    public async signIn(): Promise<void> {
        if (!this.isSyncEnabled()) return;
        await this.init();
        await this.signInWithGoogle();
        await this.start();
    }

    public async signOut(): Promise<void> {
        this.invalidateSession();
        this.cancelQueuedWork();
        await this.init();
        if (this.auth) await signOut(this.auth);
    }

    /** Creates a fresh JSON export. A confirmed overwrite is the only path that replaces a conflict. */
    public async forceSyncNow(options: ForceSyncOptions = {}): Promise<boolean> {
        if (!this.isSyncEnabled()) return false;
        this.terminalBlockedWrite = null;
        await this.init();
        const user = await this.ensureAuth();
        if (!user || !await this.ensureRemoteBootstrap(user, !!options.overwriteRemote)) return false;
        const hasPendingIncoming = this.hasPendingIncoming(user.uid);
        if ((this.hasConflict(user.uid) || hasPendingIncoming) && !options.overwriteRemote) {
            this.setLastSyncError(new SyncConflictError().message);
            return false;
        }

        try {
            const dataVersion = getDataVersion();
            const data = await BackupService.getInstance().exportAllData();
            if (getDataVersion() !== dataVersion) {
                this.setLastSyncError('Os dados mudaram durante a preparação. Tente sincronizar novamente.');
                return false;
            }
            const write = {
                data,
                updatedAt: new Date().toISOString(),
                dataVersion,
                uid: user.uid,
                session: this.session,
                writeGeneration: this.writeGeneration
            };
            if (!options.overwriteRemote) return this.writeImmediately(write);

            this.cancelPendingWrites();
            write.writeGeneration = this.writeGeneration;
            await this.waitForWriteWorker();
            const expectedRemote = await this.preserveRemoteConflictCopy(user.uid);
            this.clearPendingRemoteStage(user.uid);
            this.clearConflict(user.uid);
            return await this.commitWrite(write, true, expectedRemote) === 'success';
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Erro ao preparar os dados para sincronização.');
            return false;
        }
    }

    /** Called by AppController only after the staged backup has been imported successfully. */
    public confirmRemoteImport(): boolean {
        const uid = this.auth?.currentUser?.uid;
        const staged = uid ? this.readStagedPayload() : null;
        if (!uid || !staged || staged.uid !== uid) return false;
        const stagedVersion = this.safeGetItem(SYNC_PENDING_DATA_VERSION_KEY);
        if (stagedVersion !== null && stagedVersion !== getDataVersion()) {
            this.setConflict(uid);
            return false;
        }
        try {
            this.storage.setData(staged.data, staged.updatedAt, getDataVersion());
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Não foi possível guardar o backup remoto aplicado no histórico local.');
            return false;
        }
        this.writeAcknowledgedRemote(uid, this.toRemoteSignature(staged));
        this.writeAcknowledgedLocalDataVersion(uid, getDataVersion());
        this.clearPendingRemoteStage(uid);
        this.clearConflict(uid);
        this.setLastSyncSuccess(new Date().toISOString());
        this.setLastSyncError('');
        return true;
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
            const ref = this.getDocRefForUid(user.uid);
            if (!ref) return null;
            const snap = await getDoc(ref);
            if (!snap.exists()) return { updatedAt: null, deviceId: null };
            const remote = snap.data() as RemoteBackupPayload;
            return { updatedAt: remote.updatedAt || null, deviceId: remote.deviceId || null };
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Erro ao obter estado remoto.');
            return null;
        }
    }

    /** Stages remote data only. AppController decides when to apply it. */
    public async pullRemoteNow(): Promise<boolean> {
        if (!this.isSyncEnabled()) return false;
        await this.init();
        const user = await this.ensureAuth();
        if (!user) return false;
        this.cancelPendingWrites();
        return this.synchronizeRemote(user, true);
    }

    private async startInternal(): Promise<void> {
        await this.init();
        const user = await this.ensureAuth();
        if (!user) return;
        await this.ensureRemoteBootstrap(user);
        if (!this.isCurrentSession(user.uid)) return;
        this.initialSyncDone = true;
        this.startRemotePolling();
    }

    private async init(): Promise<void> {
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            this.app = getApps().length ? getApps()[0] : initializeApp(AppConstants.FIREBASE_CONFIG);
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);
            await setPersistence(this.auth, browserLocalPersistence);
            onAuthStateChanged(this.auth, (user) => this.handleAuthStateChange(user));
            await this.consumeRedirectResult();
        })().catch(error => {
            this.initPromise = null;
            this.db = null;
            throw error;
        });
        return this.initPromise;
    }

    private handleAuthStateChange(user: User | null): void {
        const nextUid = user?.uid || null;
        if (nextUid === this.sessionUid) return;
        this.invalidateSession();
        this.sessionUid = nextUid;
        this.cancelQueuedWork();
        if (nextUid && this.hasPendingIncomingForAnotherAccount(nextUid)) {
            this.setLastSyncError('Existe uma importação pendente de outra conta. Termine-a ou descarte-a antes de sincronizar esta conta.');
        }
    }

    private async ensureRemoteBootstrap(user: User, allowConflict = false): Promise<boolean> {
        if (this.bootstrappedUid === user.uid) return true;
        if (this.hasPendingIncomingForAnotherAccount(user.uid)) return false;
        if (this.bootstrapPromise) return this.bootstrapPromise;
        const session = this.session;
        this.bootstrapPromise = this.synchronizeRemote(user).then((ok) => {
            if (ok && this.isCurrentSession(user.uid, session)) this.bootstrappedUid = user.uid;
            return ok || (allowConflict && this.hasConflict(user.uid));
        }).finally(() => { this.bootstrapPromise = null; });
        return this.bootstrapPromise;
    }

    private async synchronizeRemote(user: User, manual = false): Promise<boolean> {
        if (this.remoteSyncPromise) {
            if (this.remoteSyncUid === user.uid && !manual) return this.remoteSyncPromise;
            await this.remoteSyncPromise;
            return this.synchronizeRemote(user, manual);
        }
        const session = this.session;
        this.remoteSyncUid = user.uid;
        this.remoteSyncPromise = this.synchronizeRemoteInternal(user.uid, session, manual).finally(() => {
            this.remoteSyncPromise = null;
            this.remoteSyncUid = null;
        });
        return this.remoteSyncPromise;
    }

    private async synchronizeRemoteInternal(uid: string, session: number, manual: boolean): Promise<boolean> {
        if (!this.isCurrentSession(uid, session) || !this.isSyncEnabled() || this.hasPendingIncomingForAnotherAccount(uid)) return false;
        if (this.hasPendingIncoming(uid) && !manual) return true;

        const versionBeforeRead = getDataVersion();
        const localData = this.storage.getData();
        const localUpdatedAt = this.storage.getTimestamp();
        const ref = this.getDocRefForUid(uid);
        if (!ref) return false;

        let snap;
        try {
            snap = await getDoc(ref);
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Erro ao ler do Firestore.');
            return false;
        }
        if (!this.isCurrentSession(uid, session) || !this.isSyncEnabled()) return false;
        const localOwner = this.safeGetItem(SYNC_LOCAL_OWNER_KEY);
        if (!manual && localOwner && localOwner !== uid) {
            this.setConflict(uid);
            this.setLastSyncError('Conflito de conta: os dados locais pertencem a outra conta. Importe os dados remotos ou confirme o envio da versão local.');
            return false;
        }

        if (!snap.exists()) {
            if (manual) return false;
            this.writeRevision(this.ackRevisionKey(uid), 0);
            if (localData && localUpdatedAt) await this.enqueueFreshSnapshot(uid, session);
            return true;
        }

        const remote = snap.data() as RemoteBackupPayload;
        if (!remote?.data || !remote?.updatedAt) {
            this.setLastSyncError('O backup remoto está incompleto e não pode ser aplicado.');
            return false;
        }
        const remoteRevision = this.normaliseRevision(remote.revision);

        if (!manual && this.sameRemoteSignature(this.readAcknowledgedRemote(uid), this.toRemoteSignature(remote))) {
            if (localData && localUpdatedAt && this.hasUnpushedLocalChanges(uid, versionBeforeRead)) {
                await this.enqueueFreshSnapshot(uid, session);
            }
            return true;
        }
        if (!manual && localData && this.hasUnpushedLocalChanges(uid, versionBeforeRead)) {
            this.setConflict(uid);
            return false;
        }
        return this.stageRemotePayload(uid, session, remote, remoteRevision, versionBeforeRead);
    }

    private async stageRemotePayload(uid: string, session: number, remote: RemoteBackupPayload, revision: number, versionBeforeRead: string): Promise<boolean> {
        let data: string;
        try {
            data = remote.data.startsWith(SYNC_ENC_PREFIX) ? await this.decryptFromSync(remote.data) : remote.data;
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Erro ao desencriptar dados remotos.');
            return false;
        }
        if (!this.isCurrentSession(uid, session) || !this.isSyncEnabled() || getDataVersion() !== versionBeforeRead) {
            this.setConflict(uid);
            return false;
        }

        const staged: StagedRemotePayload = { uid, data, updatedAt: remote.updatedAt, deviceId: remote.deviceId, revision };
        if (!this.safeSetItem(SYNC_PENDING_PAYLOAD_KEY, JSON.stringify(staged))
            || !this.safeSetItem(SYNC_PENDING_DATA_VERSION_KEY, versionBeforeRead)
            || !this.writeRevision(this.pendingRevisionKey(uid), revision)
            || !this.safeSetItem(SYNC_PENDING_IMPORT_KEY, 'true')) {
            this.setLastSyncError('Não foi possível preparar a importação remota no armazenamento local.');
            return false;
        }
        return true;
    }

    private enqueueWrite(write: PendingWrite): void {
        if (!this.isCurrentWrite(write) || !this.isSyncEnabled()) return;
        if (this.isSameTerminalBlockedWrite(write)) return;
        this.terminalBlockedWrite = null;
        if (!this.pendingWrite || this.toTime(write.updatedAt) >= this.toTime(this.pendingWrite.updatedAt)) this.pendingWrite = write;
        if (this.hasConflict(write.uid) || this.hasPendingIncoming(write.uid)) return;
        this.scheduleQueuedWrite(AppConstants.SYNC_WRITE_DEBOUNCE_MS);
    }

    private async enqueueFreshSnapshot(uid: string, session: number): Promise<void> {
        const dataVersion = getDataVersion();
        const data = await BackupService.getInstance().exportAllData();
        if (getDataVersion() !== dataVersion || !this.isCurrentSession(uid, session)) return;
        this.enqueueWrite({ data, dataVersion, updatedAt: new Date().toISOString(), uid, session, writeGeneration: this.writeGeneration });
    }

    private async writeImmediately(write: PendingWrite): Promise<boolean> {
        if (this.isSameTerminalBlockedWrite(write)) return false;
        this.terminalBlockedWrite = null;
        await this.waitForWriteWorker();
        this.pendingWrite = write;
        this.clearPendingTimer();
        return this.flushQueuedWrite();
    }

    private async flushQueuedWrite(): Promise<boolean> {
        if (this.writeWorker) return this.writeWorker;
        this.writeWorker = this.drainQueuedWrites().finally(() => { this.writeWorker = null; });
        return this.writeWorker;
    }

    private async drainQueuedWrites(): Promise<boolean> {
        while (this.pendingWrite) {
            const write = this.pendingWrite;
            if (!this.isCurrentWrite(write) || !this.isSyncEnabled()) {
                if (this.pendingWrite === write) this.pendingWrite = null;
                return false;
            }
            if (this.hasConflict(write.uid) || this.hasPendingIncoming(write.uid)) return false;
            const result = await this.commitWrite(write, false);
            if (result === 'success') {
                if (this.pendingWrite === write) this.pendingWrite = null;
                this.retryDelayMs = SYNC_RETRY_INITIAL_MS;
                continue;
            }
            if (result === 'retry') this.scheduleQueuedWrite(this.retryDelayMs);
            return false;
        }
        return true;
    }

    private async commitWrite(write: PendingWrite, allowRemoteOverwrite: boolean, expectedRemote?: RemoteSignature | null): Promise<WriteResult> {
        if (!this.isCurrentWrite(write) || !this.isSyncEnabled()) return 'cancelled';
        let encryptedData: string;
        try {
            encryptedData = await this.encryptForSync(write.data);
        } catch (error: any) {
            this.setLastSyncError(error?.message || 'Password de sincronização inválida.');
            return 'conflict';
        }
        if (new TextEncoder().encode(encryptedData).byteLength > SYNC_MAX_ENCRYPTED_PAYLOAD_BYTES) {
            this.setLastSyncError('O backup é demasiado grande para a sincronização Firestore. Exporte-o como ficheiro ou reduza os dados antes de voltar a tentar.');
            this.terminalBlockedWrite = { uid: write.uid, dataVersion: write.dataVersion, data: write.data };
            return 'conflict';
        }
        if (!this.isCurrentWrite(write) || !this.isSyncEnabled()) return 'cancelled';
        const ref = this.getDocRefForUid(write.uid);
        if (!ref || !this.db) return 'cancelled';
        const acknowledgedRevision = this.readRevision(this.ackRevisionKey(write.uid));
        const acknowledgedRemote = this.readAcknowledgedRemote(write.uid);

        try {
            const nextRevision = await runTransaction(this.db, async (transaction) => {
                const current = await transaction.get(ref);
                if (!this.isCurrentWrite(write) || !this.isSyncEnabled()) {
                    throw new SyncCancelledError();
                }
                const currentRevision = current.exists() ? this.normaliseRevision((current.data() as RemoteBackupPayload).revision) : 0;
                const currentSignature = current.exists()
                    ? this.toRemoteSignature(current.data() as RemoteBackupPayload)
                    : null;
                const matchesAcknowledged = acknowledgedRevision !== null
                    && currentRevision === acknowledgedRevision
                    && this.sameRemoteSignature(currentSignature, acknowledgedRemote);
                const knownEmptyRemote = !current.exists() && acknowledgedRevision === 0;
                if (allowRemoteOverwrite && !this.sameRemoteSignature(currentSignature, expectedRemote || null)) {
                    throw new SyncConflictError('O backup remoto mudou enquanto a confirmação estava aberta. Reveja o conflito e tente novamente.');
                }
                if (!allowRemoteOverwrite && !matchesAcknowledged && !knownEmptyRemote) throw new SyncConflictError();
                const revision = currentRevision + 1;
                transaction.set(ref, { data: encryptedData, updatedAt: write.updatedAt, deviceId: this.deviceId, revision });
                return revision;
            });
            this.writeAcknowledgedRemote(write.uid, { revision: nextRevision, updatedAt: write.updatedAt, deviceId: this.deviceId });
            this.writeAcknowledgedLocalDataVersion(write.uid, write.dataVersion);
            this.clearConflict(write.uid);
            this.setLastSyncSuccess(new Date().toISOString());
            this.setLastSyncError('');
            return 'success';
        } catch (error: any) {
            if (error instanceof SyncCancelledError || error?.name === 'SyncCancelledError') return 'cancelled';
            if (error instanceof SyncConflictError || error?.name === 'SyncConflictError') {
                this.setConflict(write.uid);
                return 'conflict';
            }
            if (this.isTerminalFirestoreError(error)) {
                this.setLastSyncError(error?.message || 'O Firestore recusou a sincronização. Verifique as permissões e a configuração da conta.');
                this.terminalBlockedWrite = { uid: write.uid, dataVersion: write.dataVersion, data: write.data };
                return 'conflict';
            }
            this.setLastSyncError(error?.message || 'Erro ao sincronizar com o Firestore. A alteração será tentada novamente.');
            this.retryDelayMs = Math.min(this.retryDelayMs * 2, SYNC_RETRY_MAX_MS);
            return 'retry';
        }
    }

    private async preserveRemoteConflictCopy(uid: string): Promise<RemoteSignature | null> {
        const ref = this.getDocRefForUid(uid);
        if (!ref) return null;
        try {
            const snap = await getDoc(ref);
            if (!snap.exists()) return null;
            const remote = snap.data() as RemoteBackupPayload;
            this.safeSetItem(`${SYNC_CONFLICT_REMOTE_PREFIX}${uid}`, JSON.stringify(remote));
            return this.toRemoteSignature(remote);
        } catch {
            // The transaction below still protects the remote revision; this copy is best effort.
            return null;
        }
    }

    private scheduleQueuedWrite(delay: number): void {
        this.clearPendingTimer();
        this.pendingTimer = window.setTimeout(() => {
            this.pendingTimer = null;
            void this.flushQueuedWrite();
        }, delay);
    }

    private startRemotePolling(): void {
        if (this.remotePollTimer) return;
        this.remotePollTimer = window.setInterval(() => {
            if (!this.isSyncEnabled()) {
                this.cancelQueuedWork();
                return;
            }
            const user = this.auth?.currentUser;
            if (user) void this.synchronizeRemote(user).catch(error => {
                this.setLastSyncError(error instanceof Error ? error.message : 'Erro ao sincronizar.');
            });
        }, AppConstants.SYNC_REMOTE_POLL_INTERVAL_MS);
    }

    private cancelQueuedWork(): void {
        this.cancelPendingWrites();
        if (this.remotePollTimer) {
            window.clearInterval(this.remotePollTimer);
            this.remotePollTimer = null;
        }
    }

    private cancelPendingWrites(): void {
        this.writeGeneration += 1;
        this.clearPendingTimer();
        this.pendingWrite = null;
    }

    private clearPendingTimer(): void {
        if (!this.pendingTimer) return;
        window.clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
    }

    private async waitForWriteWorker(): Promise<void> {
        while (this.writeWorker) await this.writeWorker;
    }

    private invalidateSession(): void {
        this.session += 1;
        this.sessionUid = null;
        this.bootstrappedUid = null;
        this.bootstrapPromise = null;
        this.initialSyncDone = false;
    }

    private isTerminalFirestoreError(error: any): boolean {
        const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
        return code.includes('invalid-argument')
            || code.includes('permission-denied')
            || code.includes('unauthenticated')
            || code.includes('resource-exhausted');
    }

    private getDocRefForUid(uid: string) {
        if (!this.db) return null;
        return doc(this.db, AppConstants.FIRESTORE_USERS_COLLECTION, uid, AppConstants.FIRESTORE_APP_STATE_DOC, AppConstants.FIRESTORE_MAIN_DOC);
    }

    private isCurrentSession(uid: string, session = this.session): boolean {
        return this.session === session && this.sessionUid === uid && this.auth?.currentUser?.uid === uid;
    }

    private isCurrentWrite(write: PendingWrite): boolean {
        return this.isCurrentSession(write.uid, write.session) && this.writeGeneration === write.writeGeneration;
    }

    private ackRevisionKey(uid: string): string {
        return `${SYNC_REMOTE_REVISION_PREFIX}${uid}`;
    }

    private ackRemoteSignatureKey(uid: string): string {
        return `${SYNC_REMOTE_SIGNATURE_PREFIX}${uid}`;
    }

    private ackLocalDataVersionKey(uid: string): string {
        return `${SYNC_LOCAL_DATA_VERSION_PREFIX}${uid}`;
    }

    private pendingRevisionKey(uid: string): string {
        return `${SYNC_PENDING_REMOTE_REVISION_PREFIX}${uid}`;
    }

    private conflictKey(uid: string): string {
        return `${SYNC_CONFLICT_PREFIX}${uid}`;
    }

    private readStagedPayload(): StagedRemotePayload | null {
        try {
            const parsed = JSON.parse(this.safeGetItem(SYNC_PENDING_PAYLOAD_KEY) || '') as Partial<StagedRemotePayload>;
            if (!parsed || typeof parsed.uid !== 'string' || typeof parsed.data !== 'string' || typeof parsed.updatedAt !== 'string') return null;
            return { uid: parsed.uid, data: parsed.data, updatedAt: parsed.updatedAt, deviceId: typeof parsed.deviceId === 'string' ? parsed.deviceId : '', revision: this.normaliseRevision(parsed.revision) };
        } catch {
            return null;
        }
    }

    private hasPendingIncoming(uid: string): boolean {
        const staged = this.readStagedPayload();
        return this.safeGetItem(SYNC_PENDING_IMPORT_KEY) === 'true' && staged?.uid === uid;
    }

    private hasPendingIncomingForAnotherAccount(uid: string): boolean {
        const staged = this.readStagedPayload();
        return this.safeGetItem(SYNC_PENDING_IMPORT_KEY) === 'true' && !!staged && staged.uid !== uid;
    }

    private clearPendingRemoteStage(uid: string): void {
        const staged = this.readStagedPayload();
        if (staged && staged.uid !== uid) return;
        this.removeItem(SYNC_PENDING_PAYLOAD_KEY);
        this.removeItem(SYNC_PENDING_DATA_VERSION_KEY);
        this.removeItem(SYNC_PENDING_IMPORT_KEY);
        this.removeItem(this.pendingRevisionKey(uid));
    }

    private hasConflict(uid: string): boolean {
        return this.safeGetItem(this.conflictKey(uid)) === 'true';
    }

    private setConflict(uid: string): void {
        this.safeSetItem(this.conflictKey(uid), 'true');
        this.setLastSyncError(new SyncConflictError().message);
    }

    private clearConflict(uid: string): void {
        this.removeItem(this.conflictKey(uid));
    }

    private toRemoteSignature(remote: RemoteBackupPayload): RemoteSignature {
        return {
            revision: this.normaliseRevision(remote.revision),
            updatedAt: remote.updatedAt,
            deviceId: remote.deviceId
        };
    }

    private sameRemoteSignature(left: RemoteSignature | null, right: RemoteSignature | null): boolean {
        if (!left && !right) return true;
        return !!left && !!right
            && left.revision === right.revision
            && left.updatedAt === right.updatedAt
            && left.deviceId === right.deviceId;
    }

    private readAcknowledgedRemote(uid: string): RemoteSignature | null {
        try {
            const parsed = JSON.parse(this.safeGetItem(this.ackRemoteSignatureKey(uid)) || '') as Partial<RemoteSignature>;
            if (!parsed || typeof parsed.updatedAt !== 'string' || typeof parsed.deviceId !== 'string') return null;
            return { revision: this.normaliseRevision(parsed.revision), updatedAt: parsed.updatedAt, deviceId: parsed.deviceId };
        } catch {
            return null;
        }
    }

    private writeAcknowledgedRemote(uid: string, remote: RemoteSignature): void {
        if (!this.writeRevision(this.ackRevisionKey(uid), remote.revision)
            || !this.safeSetItem(this.ackRemoteSignatureKey(uid), JSON.stringify(remote))
            || !this.safeSetItem(SYNC_LOCAL_OWNER_KEY, uid)) {
            throw new Error('Não foi possível guardar a confirmação da sincronização no navegador.');
        }
    }

    private writeAcknowledgedLocalDataVersion(uid: string, version: string): void {
        if (!this.safeSetItem(this.ackLocalDataVersionKey(uid), version)) {
            throw new Error('Não foi possível guardar a versão local sincronizada.');
        }
    }

    private hasUnpushedLocalChanges(uid: string, currentVersion: string): boolean {
        return currentVersion !== this.safeGetItem(this.ackLocalDataVersionKey(uid));
    }

    private isSameTerminalBlockedWrite(write: PendingWrite): boolean {
        return this.terminalBlockedWrite?.uid === write.uid
            && this.terminalBlockedWrite.dataVersion === write.dataVersion
            && this.terminalBlockedWrite.data === write.data;
    }

    private normaliseRevision(value: unknown): number {
        const revision = typeof value === 'number' ? value : Number(value);
        return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
    }

    private readRevision(key: string): number | null {
        const raw = this.safeGetItem(key);
        return raw === null ? null : this.normaliseRevision(raw);
    }

    private writeRevision(key: string, revision: number): boolean {
        return this.safeSetItem(key, String(revision));
    }

    private toTime(value: string | null | undefined): number {
        return value ? Date.parse(value) || 0 : 0;
    }

    private getOrCreateId(key: string): string {
        const existing = this.safeGetItem(key);
        if (existing) return existing;
        const generated = this.generateId();
        this.safeSetItem(key, generated);
        return generated;
    }

    private generateId(): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }

    private safeGetItem(key: string): string | null {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    private safeSetItem(key: string, value: string): boolean {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch {
            return false;
        }
    }

    private removeItem(key: string): void {
        try {
            localStorage.removeItem(key);
        } catch {
            // Ignore storage cleanup errors.
        }
    }

    private setLastSyncSuccess(timestamp: string): void {
        this.safeSetItem(SYNC_LAST_SUCCESS_KEY, timestamp);
    }

    private setLastSyncError(message: string): void {
        this.safeSetItem(SYNC_LAST_ERROR_KEY, message);
    }

    private getSyncPassword(): string | null {
        const override = typeof window !== 'undefined' ? (window as any)[AppConstants.GLOBAL_SYNC_PASSWORD_OVERRIDE] : null;
        if (typeof override === 'string' && override.trim()) return override.trim();
        return this.safeGetItem(SYNC_PASSWORD_KEY)?.trim() || null;
    }

    private async encryptForSync(data: string): Promise<string> {
        const password = this.getSyncPassword();
        if (!password) throw new Error('Defina a password de sincronização.');
        const salt = window.crypto.getRandomValues(new Uint8Array(AppConstants.SYNC_SALT_LENGTH));
        const iv = window.crypto.getRandomValues(new Uint8Array(AppConstants.SYNC_IV_LENGTH));
        const key = await this.deriveKeyFromPassword(password, salt);
        const cipher = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await encodeSyncData(data));
        const combined = new Uint8Array(salt.length + iv.length + cipher.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(cipher), salt.length + iv.length);
        return `${SYNC_ENC_PREFIX}${this.bytesToBase64(combined)}`;
    }

    private async decryptFromSync(payload: string): Promise<string> {
        const password = this.getSyncPassword();
        if (!password) throw new Error('Defina a password de sincronização.');
        const raw = this.base64ToBytes(payload.slice(SYNC_ENC_PREFIX.length));
        const salt = raw.slice(0, AppConstants.SYNC_SALT_LENGTH);
        const iv = raw.slice(AppConstants.SYNC_SALT_LENGTH, AppConstants.SYNC_SALT_LENGTH + AppConstants.SYNC_IV_LENGTH);
        const cipher = raw.slice(AppConstants.SYNC_SALT_LENGTH + AppConstants.SYNC_IV_LENGTH);
        const key = await this.deriveKeyFromPassword(password, salt);
        const plain = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
        return decodeSyncData(new Uint8Array(plain));
    }

    private async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
        const baseKey = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
        return window.crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBuffer, iterations: AppConstants.PBKDF2_ITERATIONS, hash: AppConstants.PBKDF2_HASH },
            baseKey,
            { name: 'AES-GCM', length: AppConstants.AES_GCM_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );
    }

    private bytesToBase64(bytes: Uint8Array): string {
        let binary = '';
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return btoa(binary);
    }

    private base64ToBytes(value: string): Uint8Array {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    }

    private isSyncEnabled(): boolean {
        if (typeof window !== 'undefined' && (window as any)[AppConstants.GLOBAL_SYNC_ENABLED_OVERRIDE] === false) return false;
        const stored = this.safeGetItem(SYNC_ENABLED_KEY);
        return stored === null || stored === 'true';
    }

    private async ensureAuth(): Promise<User | null> {
        if (!this.auth) return null;
        if (this.auth.currentUser) {
            this.handleAuthStateChange(this.auth.currentUser);
            return this.auth.currentUser;
        }
        return new Promise<User | null>((resolve, reject) => {
            const unsubscribe = onAuthStateChanged(this.auth!, (user) => {
                unsubscribe();
                resolve(user);
            }, (error) => {
                unsubscribe();
                reject(error);
            });
        });
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
        if (!this.auth || !this.isRedirectInProgress()) return;
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

    private setRedirectFlag(): void {
        try {
            sessionStorage.setItem(AUTH_REDIRECT_FLAG, 'true');
        } catch {
            // Ignore session storage errors.
        }
    }

    private clearRedirectFlag(): void {
        try {
            sessionStorage.removeItem(AUTH_REDIRECT_FLAG);
        } catch {
            // Ignore session storage errors.
        }
    }

    private markLoginAttempt(): void {
        try {
            sessionStorage.setItem(AUTH_LAST_ATTEMPT_KEY, String(Date.now()));
        } catch {
            // Ignore session storage errors.
        }
    }
}
