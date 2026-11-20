import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { getLevelForXp, isAdminEmail, RECHARGE_METHODS } from './shared/gameCatalog';
import type {
  AvatarId,
  CoinPackage,
  DirectChatThread,
  DirectMessage,
  FriendRequest,
  FriendRequestStatus,
  GameType,
  PaymentMethod,
  PlayerProfile,
  RechargeRequest,
  ReportRecord,
  SupportCategory,
  SupportMessage,
  SupportTicket,
} from './shared/types';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  { experimentalForceLongPolling: true },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnectionWhenAuthed() {
  if (!auth.currentUser) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export type AuthTransitionPhase = 'signout' | 'switch' | 'restore';

const activeSnapshotUnsubs = new Set<() => void>();
const authTransitionListeners = new Set<(phase: AuthTransitionPhase) => void>();

export function onAuthTransition(
  listener: (phase: AuthTransitionPhase) => void
): () => void {
  authTransitionListeners.add(listener);
  return () => {
    authTransitionListeners.delete(listener);
  };
}

function notifyAuthTransition(phase: AuthTransitionPhase) {
  for (const listener of Array.from(authTransitionListeners)) {
    try {
      listener(phase);
    } catch {
      // Ignore listener notification errors
    }
  }
}

function trackSnapshot(rawUnsub: () => void): () => void {
  let cleaned = false;
  const wrapped = () => {
    if (cleaned) return;
    cleaned = true;
    activeSnapshotUnsubs.delete(wrapped);
    try {
      rawUnsub();
    } catch {
      // Ignore unsubscribe errors
    }
  };
  activeSnapshotUnsubs.add(wrapped);
  return wrapped;
}

export function teardownAllFirestoreListeners(): void {
  const list = Array.from(activeSnapshotUnsubs);
  activeSnapshotUnsubs.clear();
  for (const unsub of list) {
    try {
      unsub();
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function signInWithGoogle(): Promise<User | null> {
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    return cred.user;
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
      return null;
    }
    throw error;
  }
}

export async function signInWithGoogleRedirect(): Promise<void> {
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
}

export async function switchGoogleAccount(): Promise<User | null> {
  const prevUid = auth.currentUser?.uid || null;
  teardownAllFirestoreListeners();
  notifyAuthTransition('switch');
  await setPersistence(auth, browserLocalPersistence).catch(() => {});
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    return cred.user;
  } catch (error) {
    if (auth.currentUser && auth.currentUser.uid === prevUid) {
      notifyAuthTransition('restore');
    }
    throw error;
  }
}

export async function checkGoogleRedirectResult(): Promise<User | null> {
  try {
    const res = await getRedirectResult(auth, browserPopupRedirectResolver);
    return res?.user ?? null;
  } catch {
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  teardownAllFirestoreListeners();
  notifyAuthTransition('signout');
  await signOut(auth);
}

export interface PersistedVoiceRoom {
  roomId: string;
  ownerId: string;
  ownerName: string;
  title: string;
  tier: 'free' | 'basic';
  xp: number;
  level: number;
  backgroundIndex: number;
  activeGame: GameType;
  expiresAtMs: number;
  isLocked?: boolean;
}

export interface CoinTxRecord {
  id: string;
  kind: 'store_purchase' | 'room_upgrade' | 'gift_sent';
  label: string;
  coinsDelta: number;
  priceEgp: number;
  createdAtMs: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(fallbackMsg)), ms)),
  ]);
}

function mapUserProfile(user: User, d: DocumentData): PlayerProfile {
  const displayName = (user.displayName || 'لاعب يلا بلاي').trim().slice(0, 32);
  return {
    id: user.uid,
    name: String(d.name || displayName),
    username: d.username ? String(d.username) : undefined,
    email: user.email || undefined,
    photoURL: user.photoURL || undefined,
    avatar: (d.avatar as AvatarId) || 'falcon',
    bio: String(d.bio || ''),
    coins: Number(d.coins ?? 0),
    wins: Number(d.wins ?? 0),
    gamesPlayed: Number(d.gamesPlayed ?? 0),
    basicRoomId: String(d.basicRoomId || ''),
    bannedUntilMs: typeof d.bannedUntilMs === 'number' ? d.bannedUntilMs : undefined,
    privacyHideOnline: Boolean(d.privacyHideOnline),
    privacyHideRoom: Boolean(d.privacyHideRoom),
    privacyBlockFriendRequests: Boolean(d.privacyBlockFriendRequests),
  };
}

export async function ensureUserProfile(user: User): Promise<PlayerProfile> {
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/account`;

  try {
    await user.getIdToken().catch(() => {});
    void testConnectionWhenAuthed();

    let snap;
    try {
      snap = await withTimeout(
        getDoc(doc(db, 'users', user.uid)),
        12000,
        'انتهت مهلة الاتصال بقاعدة البيانات، يرجى المحاولة مرة أخرى'
      );
    } catch {
      snap = await withTimeout(
        getDoc(doc(db, 'users', user.uid)),
        12000,
        'تعذر الوصول إلى قاعدة البيانات، تحقق من اتصالك وأعد المحاولة'
      );
    }

    const displayName = (user.displayName || 'لاعب يلا بلاي').trim().slice(0, 32);

    const privPayload = {
      uid: user.uid,
      email: (user.email || 'user@yallaplay.app').slice(0, 180),
      photoURL: (user.photoURL || '').slice(0, 500),
      updatedAt: serverTimestamp(),
    };

    const syncPrivateBackground = async () => {
      try {
        const privSnap = await getDoc(doc(db, 'users', user.uid, 'private', 'account'));
        if (!privSnap.exists()) {
          await setDoc(doc(db, 'users', user.uid, 'private', 'account'), privPayload);
        } else {
          await updateDoc(doc(db, 'users', user.uid, 'private', 'account'), {
            email: privPayload.email,
            photoURL: privPayload.photoURL,
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        // Non-blocking metadata sync
      }
    };

    if (snap.exists()) {
      void syncPrivateBackground();
      return mapUserProfile(user, snap.data());
    }

    const initialProfile = {
      uid: user.uid,
      name: displayName,
      avatar: 'falcon' as AvatarId,
      bio: 'جاهز للعب والدردشة في يلا بلاي',
      coins: 300,
      wins: 0,
      gamesPlayed: 0,
      basicRoomId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await withTimeout(
      setDoc(doc(db, 'users', user.uid), initialProfile),
      12000,
      'تعذر إنشاء ملف الحساب في قاعدة البيانات، حاول مرة أخرى'
    );
    void syncPrivateBackground();

    return {
      id: user.uid,
      name: initialProfile.name,
      email: user.email || undefined,
      photoURL: user.photoURL || undefined,
      avatar: initialProfile.avatar,
      bio: initialProfile.bio,
      coins: initialProfile.coins,
      wins: 0,
      gamesPlayed: 0,
      basicRoomId: '',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${userPath} / ${privatePath}`);
  }
}

export function subscribeUserProfile(
  uid: string,
  onUpdate: (patch: Partial<PlayerProfile>) => void
): () => void {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    return () => {};
  }
  const path = `users/${uid}`;
  const rawUnsub = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onUpdate({
        name: String(d.name || ''),
        username: d.username ? String(d.username) : undefined,
        avatar: (d.avatar as AvatarId) || 'falcon',
        bio: String(d.bio || ''),
        coins: Number(d.coins ?? 0),
        wins: Number(d.wins ?? 0),
        gamesPlayed: Number(d.gamesPlayed ?? 0),
        basicRoomId: String(d.basicRoomId || ''),
        bannedUntilMs: typeof d.bannedUntilMs === 'number' ? d.bannedUntilMs : undefined,
        privacyHideOnline: Boolean(d.privacyHideOnline),
        privacyHideRoom: Boolean(d.privacyHideRoom),
        privacyBlockFriendRequests: Boolean(d.privacyBlockFriendRequests),
      });
    },
    (error) => {
      if (!auth.currentUser || auth.currentUser.uid !== uid) return;
      console.error('Profile listener error:', path, error);
    }
  );
  return trackSnapshot(rawUnsub);
}

export async function updateUserProfileFields(
  uid: string,
  patch: Partial<
    Pick<
      PlayerProfile,
      | 'name'
      | 'username'
      | 'avatar'
      | 'bio'
      | 'coins'
      | 'wins'
      | 'gamesPlayed'
      | 'basicRoomId'
      | 'privacyHideOnline'
      | 'privacyHideRoom'
      | 'privacyBlockFriendRequests'
    >
  >
) {
  const path = `users/${uid}`;
  try {
    const sanitized: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.name !== undefined) sanitized.name = patch.name.trim().slice(0, 32) || 'لاعب';
    if (patch.username !== undefined) {
      sanitized.username = patch.username.trim().replace(/^@+/, '').toLowerCase().slice(0, 30);
    }
    if (patch.avatar !== undefined) sanitized.avatar = patch.avatar;
    if (patch.bio !== undefined) sanitized.bio = patch.bio.trim().slice(0, 100);
    if (patch.coins !== undefined) sanitized.coins = Math.max(0, Math.floor(patch.coins));
    if (patch.wins !== undefined) sanitized.wins = Math.max(0, Math.floor(patch.wins));
    if (patch.gamesPlayed !== undefined) {
      sanitized.gamesPlayed = Math.max(0, Math.floor(patch.gamesPlayed));
    }
    if (patch.basicRoomId !== undefined) sanitized.basicRoomId = patch.basicRoomId.slice(0, 32);
    if (patch.privacyHideOnline !== undefined) {
      sanitized.privacyHideOnline = Boolean(patch.privacyHideOnline);
    }
    if (patch.privacyHideRoom !== undefined) {
      sanitized.privacyHideRoom = Boolean(patch.privacyHideRoom);
    }
    if (patch.privacyBlockFriendRequests !== undefined) {
      sanitized.privacyBlockFriendRequests = Boolean(patch.privacyBlockFriendRequests);
    }

    await updateDoc(doc(db, 'users', uid), sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function claimDailyTaskReward(uid: string, rewardCoins: number): Promise<number> {
  const path = `users/${uid}`;
  const safeReward = Math.max(0, Math.floor(rewardCoins));
  try {
    return await runTransaction(db, async (tx) => {
      const userRef = doc(db, 'users', uid);
      const snap = await tx.get(userRef);
      if (!snap.exists()) {
        throw new Error('ملف المستخدم غير موجود');
      }
      const currentCoins = Number(snap.data().coins ?? 0);
      const nextCoins = Math.min(10000000, currentCoins + safeReward);
      tx.update(userRef, {
        coins: nextCoins,
        updatedAt: serverTimestamp(),
      });
      return nextCoins;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordGiftTransaction(uid: string, giftLabel: string, cost: number) {
  const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await setDoc(doc(db, 'users', uid, 'transactions', txId), {
      uid,
      kind: 'gift_sent',
      label: giftLabel.slice(0, 80),
      coinsDelta: -Math.abs(cost),
      priceEgp: 0,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/transactions/${txId}`);
  }
}

export async function fetchUserTransactions(uid: string): Promise<CoinTxRecord[]> {
  const path = `users/${uid}/transactions`;
  try {
    const q = query(
      collection(db, 'users', uid, 'transactions'),
      where('uid', '==', uid),
      limit(100)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => {
      const data = d.data();
      const ts = data.createdAt as Timestamp | undefined;
      return {
        id: d.id,
        kind: data.kind,
        label: String(data.label || ''),
        coinsDelta: Number(data.coinsDelta || 0),
        priceEgp: Number(data.priceEgp || 0),
        createdAtMs: ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now(),
      };
    });
    list.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

function mapRechargeDoc(id: string, data: DocumentData): RechargeRequest {
  const createdTs = data.createdAt as Timestamp | undefined;
  const updatedTs = data.updatedAt as Timestamp | undefined;
  return {
    id,
    requestId: String(data.requestId || id),
    userId: String(data.userId || ''),
    userName: String(data.userName || 'مستخدم'),
    userEmail: String(data.userEmail || ''),
    packageId: String(data.packageId || ''),
    coins: Number(data.coins || 0),
    priceEgp: Number(data.priceEgp || 0),
    paymentMethod: data.paymentMethod === 'instapay' ? 'instapay' : 'vodafone_cash',
    targetNumber: String(data.targetNumber || ''),
    senderInfo: String(data.senderInfo || ''),
    receiptImage: String(data.receiptImage || ''),
    status:
      data.status === 'approved'
        ? 'approved'
        : data.status === 'rejected'
          ? 'rejected'
          : 'pending',
    adminNote: String(data.adminNote || ''),
    reviewedBy: String(data.reviewedBy || ''),
    createdAtMs:
      createdTs && typeof createdTs.toMillis === 'function' ? createdTs.toMillis() : Date.now(),
    updatedAtMs:
      updatedTs && typeof updatedTs.toMillis === 'function' ? updatedTs.toMillis() : Date.now(),
  };
}

export async function submitRechargeRequest(params: {
  profile: PlayerProfile;
  pkg: CoinPackage;
  paymentMethod: PaymentMethod;
  senderInfo: string;
  receiptImage: string;
}): Promise<string> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `rechargeRequests/${requestId}`;
  const methodMeta = RECHARGE_METHODS[params.paymentMethod];
  const safeReceipt = params.receiptImage.length <= 245000 ? params.receiptImage : '';
  if (params.receiptImage.length > 245000) {
    throw new Error('حجم صورة التحويل كبير جداً، يرجى اختيار صورة أصغر');
  }

  try {
    await setDoc(doc(db, 'rechargeRequests', requestId), {
      requestId,
      userId: params.profile.id,
      userName: (params.profile.name || 'مستخدم').trim().slice(0, 40) || 'مستخدم',
      userEmail: (params.profile.email || 'user@yallaplay.app').trim().slice(0, 180),
      packageId: params.pkg.id.slice(0, 32),
      coins: params.pkg.coins,
      priceEgp: params.pkg.priceEgp,
      paymentMethod: params.paymentMethod,
      targetNumber: methodMeta.accountNumber,
      senderInfo: params.senderInfo.trim().slice(0, 80),
      receiptImage: safeReceipt,
      status: 'pending',
      adminNote: '',
      reviewedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return requestId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserRechargeRequests(
  uid: string,
  onData: (items: RechargeRequest[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    return () => {};
  }
  const path = 'rechargeRequests';
  const q = query(
    collection(db, 'rechargeRequests'),
    where('userId', '==', uid),
    limit(50)
  );
  const rawUnsub = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapRechargeDoc(d.id, d.data()));
      list.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (err) => {
      if (!auth.currentUser || auth.currentUser.uid !== uid) return;
      if (onError) onError(err);
      else console.error('User recharge listener error:', path, err);
    }
  );
  return trackSnapshot(rawUnsub);
}

export function subscribeAdminRechargeRequests(
  onData: (items: RechargeRequest[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    return () => {};
  }
  const path = 'rechargeRequests';
  const q = query(
    collection(db, 'rechargeRequests'),
    orderBy('createdAt', 'desc'),
    limit(120)
  );
  const rawUnsub = onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => mapRechargeDoc(d.id, d.data())));
    },
    (err) => {
      if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) return;
      if (onError) onError(err);
      else console.error('Admin recharge listener error:', path, err);
    }
  );
  return trackSnapshot(rawUnsub);
}

export async function approveRechargeRequest(
  req: RechargeRequest,
  adminEmail: string,
  adminNote = ''
): Promise<void> {
  const path = `rechargeRequests/${req.requestId}`;
  const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await runTransaction(db, async (tx) => {
      const reqRef = doc(db, 'rechargeRequests', req.requestId);
      const userRef = doc(db, 'users', req.userId);
      const txRef = doc(db, 'users', req.userId, 'transactions', txId);

      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) {
        throw new Error('طلب الشحن غير موجود');
      }
      const reqData = reqSnap.data();
      if (reqData.status !== 'pending') {
        throw new Error('تمت معالجة هذا الطلب مسبقاً');
      }

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('حساب المستخدم المطلوب شحنه غير موجود');
      }
      const currentCoins = Number(userSnap.data().coins ?? 0);
      const creditedCoins = Number(reqData.coins || req.coins);
      const paidEgp = Number(reqData.priceEgp || req.priceEgp);
      const methodLabel =
        reqData.paymentMethod === 'instapay' ? 'إنستا باي' : 'فودافون كاش';

      tx.update(reqRef, {
        status: 'approved',
        adminNote: adminNote.trim().slice(0, 160),
        reviewedBy: adminEmail.trim().slice(0, 180),
        updatedAt: serverTimestamp(),
      });

      tx.update(userRef, {
        coins: currentCoins + creditedCoins,
        updatedAt: serverTimestamp(),
      });

      tx.set(txRef, {
        uid: req.userId,
        kind: 'store_purchase',
        label: `شحن ${creditedCoins.toLocaleString('en-US')} عملة (${methodLabel})`.slice(0, 80),
        coinsDelta: creditedCoins,
        priceEgp: paidEgp,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function rejectRechargeRequest(
  req: RechargeRequest,
  adminEmail: string,
  adminNote = ''
): Promise<void> {
  const path = `rechargeRequests/${req.requestId}`;
  try {
    await runTransaction(db, async (tx) => {
      const reqRef = doc(db, 'rechargeRequests', req.requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) {
        throw new Error('طلب الشحن غير موجود');
      }
      if (reqSnap.data().status !== 'pending') {
        throw new Error('تمت معالجة هذا الطلب مسبقاً');
      }
      tx.update(reqRef, {
        status: 'rejected',
        adminNote: (adminNote.trim() || 'لم يتم تأكيد التحويل').slice(0, 160),
        reviewedBy: adminEmail.trim().slice(0, 180),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function purchaseBasicVoiceRoom(
  profile: PlayerProfile,
  title: string
): Promise<{ newCoins: number; room: PersistedVoiceRoom }> {
  const cost = 2000;
  if (profile.coins < cost) {
    throw new Error('رصيد العملات غير كافٍ لشراء الغرفة الأساسية (2000 عملة)');
  }
  const fixedCode = profile.basicRoomId || `ID${Math.floor(100000 + Math.random() * 899999)}`;
  const newCoins = profile.coins - cost;
  const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const userSnap = await getDoc(doc(db, 'users', profile.id));
    const serverCoins = userSnap.exists() ? Number(userSnap.data().coins ?? profile.coins) : profile.coins;
    if (serverCoins < cost) {
      throw new Error('رصيد العملات غير كافٍ لشراء الغرفة الأساسية (2000 عملة)');
    }
    const authoritativeNewCoins = serverCoins - cost;

    const batch = writeBatch(db);
    batch.set(doc(db, 'voiceRooms', fixedCode), {
      roomId: fixedCode,
      ownerId: profile.id,
      ownerName: profile.name.slice(0, 32),
      title: (title.trim() || `غرفة ${profile.name}`).slice(0, 48),
      tier: 'basic',
      xp: 0,
      level: 1,
      backgroundIndex: 0,
      activeGame: 'ludo',
      expiresAtMs: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'users', profile.id), {
      coins: authoritativeNewCoins,
      basicRoomId: fixedCode,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'users', profile.id, 'transactions', txId), {
      uid: profile.id,
      kind: 'room_upgrade',
      label: `تفعيل الغرفة الأساسية الدائمة (${fixedCode})`,
      coinsDelta: -cost,
      priceEgp: 0,
      createdAt: serverTimestamp(),
    });

    await batch.commit();

    return {
      newCoins: authoritativeNewCoins,
      room: {
        roomId: fixedCode,
        ownerId: profile.id,
        ownerName: profile.name,
        title: title.trim() || `غرفة ${profile.name}`,
        tier: 'basic',
        xp: 0,
        level: 1,
        backgroundIndex: 0,
        activeGame: 'ludo',
        expiresAtMs: 0,
      },
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `voiceRooms/${fixedCode}`);
  }
}

export async function loadPersistedBasicRoom(roomId: string): Promise<PersistedVoiceRoom | null> {
  if (!roomId) return null;
  const path = `voiceRooms/${roomId}`;
  try {
    const snap = await getDoc(doc(db, 'voiceRooms', roomId));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      roomId: String(d.roomId),
      ownerId: String(d.ownerId),
      ownerName: String(d.ownerName),
      title: String(d.title),
      tier: d.tier === 'basic' ? 'basic' : 'free',
      xp: Number(d.xp || 0),
      level: Number(d.level || 1),
      backgroundIndex: Number(d.backgroundIndex || 0),
      activeGame: (d.activeGame as GameType) || 'ludo',
      expiresAtMs: Number(d.expiresAtMs || 0),
      isLocked: Boolean(d.isLocked),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function persistBasicRoomGiftXp(roomId: string, newXp: number) {
  const path = `voiceRooms/${roomId}`;
  try {
    const snap = await getDoc(doc(db, 'voiceRooms', roomId));
    if (!snap.exists()) return;
    const levelSpec = getLevelForXp(newXp);
    await updateDoc(doc(db, 'voiceRooms', roomId), {
      xp: newXp,
      level: levelSpec.level,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function persistBasicRoomAppearance(
  roomId: string,
  patch: Partial<Pick<PersistedVoiceRoom, 'backgroundIndex' | 'activeGame' | 'title' | 'isLocked'>>
) {
  const path = `voiceRooms/${roomId}`;
  try {
    const snap = await getDoc(doc(db, 'voiceRooms', roomId));
    if (!snap.exists()) return;
    await updateDoc(doc(db, 'voiceRooms', roomId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function persistRoomStaffRole(
  roomId: string,
  staffUid: string,
  name: string,
  role: 'moderator' | 'cohost' | null,
  ownerUid: string
) {
  const path = `voiceRooms/${roomId}/staff/${staffUid}`;
  try {
    const parentSnap = await getDoc(doc(db, 'voiceRooms', roomId));
    if (!parentSnap.exists()) return;
    if (role === null) {
      await deleteDoc(doc(db, 'voiceRooms', roomId, 'staff', staffUid));
    } else {
      await setDoc(doc(db, 'voiceRooms', roomId, 'staff', staffUid), {
        uid: staffUid,
        name: name.slice(0, 32),
        role,
        assignedBy: ownerUid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function isUsernameAvailable(username: string, excludeUid: string): Promise<boolean> {
  const clean = username.trim().replace(/^@+/, '').toLowerCase();
  if (clean.length < 3) return false;
  try {
    const q = query(collection(db, 'users'), where('username', '==', clean), limit(2));
    const snap = await getDocs(q);
    if (snap.empty) return true;
    for (const d of snap.docs) {
      if (d.id !== excludeUid) return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function searchUserByUsername(username: string): Promise<PlayerProfile | null> {
  const clean = username.trim().replace(/^@+/, '').toLowerCase();
  if (!clean) return null;
  try {
    const q = query(collection(db, 'users'), where('username', '==', clean), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data();
    return {
      id: d.id,
      name: String(data.name || 'لاعب'),
      username: String(data.username || ''),
      avatar: (data.avatar as AvatarId) || 'falcon',
      bio: String(data.bio || ''),
      coins: Number(data.coins || 0),
      wins: Number(data.wins || 0),
      gamesPlayed: Number(data.gamesPlayed || 0),
      basicRoomId: String(data.basicRoomId || ''),
      privacyBlockFriendRequests: Boolean(data.privacyBlockFriendRequests),
    };
  } catch {
    return null;
  }
}

export async function addFriend(myUid: string, friendUid: string): Promise<void> {
  const path = `users/${myUid}/friends/${friendUid}`;
  try {
    await setDoc(doc(db, 'users', myUid, 'friends', friendUid), {
      friendUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeFriend(myUid: string, friendUid: string): Promise<void> {
  const path = `users/${myUid}/friends/${friendUid}`;
  try {
    await deleteDoc(doc(db, 'users', myUid, 'friends', friendUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchFriends(myUid: string): Promise<PlayerProfile[]> {
  const path = `users/${myUid}/friends`;
  try {
    const snap = await getDocs(collection(db, 'users', myUid, 'friends'));
    const profiles: PlayerProfile[] = [];
    for (const d of snap.docs) {
      const fUid = d.data().friendUid || d.id;
      const userSnap = await getDoc(doc(db, 'users', fUid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        profiles.push({
          id: userSnap.id,
          name: String(data.name || 'لاعب'),
          username: String(data.username || ''),
          avatar: (data.avatar as AvatarId) || 'falcon',
          bio: String(data.bio || ''),
          coins: Number(data.coins || 0),
          wins: Number(data.wins || 0),
          gamesPlayed: Number(data.gamesPlayed || 0),
          basicRoomId: String(data.basicRoomId || ''),
        });
      }
    }
    return profiles;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function submitReport(
  reporterId: string,
  reporterName: string,
  reportedId: string,
  reportedName: string,
  reason: string,
  description: string,
  reportedMessageText?: string
): Promise<string> {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `reports/${reportId}`;
  const cleanMsg = (reportedMessageText || '').trim().slice(0, 240);
  try {
    await setDoc(doc(db, 'reports', reportId), {
      id: reportId,
      reporterId,
      reporterName: reporterName.trim().slice(0, 64) || 'مستخدم',
      reportedId,
      reportedName: reportedName.trim().slice(0, 64) || 'مستخدم',
      reason: reason.trim().slice(0, 80),
      description: description.trim().slice(0, 300),
      ...(cleanMsg ? { reportedMessageText: cleanMsg } : {}),
      status: 'pending',
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
    return reportId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeReports(
  onData: (items: ReportRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    return () => {};
  }
  const path = 'reports';
  const q = query(collection(db, 'reports'), orderBy('createdAtMs', 'desc'), limit(80));
  const rawUnsub = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          reporterId: String(data.reporterId || ''),
          reporterName: String(data.reporterName || ''),
          reportedId: String(data.reportedId || ''),
          reportedName: String(data.reportedName || ''),
          reason: String(data.reason || ''),
          description: String(data.description || ''),
          reportedMessageText: data.reportedMessageText ? String(data.reportedMessageText) : undefined,
          status: (data.status as 'pending' | 'resolved' | 'dismissed') || 'pending',
          createdAtMs: Number(data.createdAtMs || Date.now()),
        };
      });
      onData(list);
    },
    (err) => {
      if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) return;
      if (onError) onError(err);
      else console.error('Reports listener error:', path, err);
    }
  );
  return trackSnapshot(rawUnsub);
}

export async function fetchReports(): Promise<ReportRecord[]> {
  const path = 'reports';
  try {
    const q = query(collection(db, 'reports'), orderBy('createdAtMs', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        reporterId: String(data.reporterId || ''),
        reporterName: String(data.reporterName || ''),
        reportedId: String(data.reportedId || ''),
        reportedName: String(data.reportedName || ''),
        reason: String(data.reason || ''),
        description: String(data.description || ''),
        reportedMessageText: data.reportedMessageText ? String(data.reportedMessageText) : undefined,
        status: (data.status as 'pending' | 'resolved' | 'dismissed') || 'pending',
        createdAtMs: Number(data.createdAtMs || Date.now()),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function adminUpdateReportStatus(
  reportId: string,
  status: 'resolved' | 'dismissed'
): Promise<void> {
  const path = `reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminBanUser(targetUid: string, banDurationMs: number): Promise<void> {
  const path = `users/${targetUid}`;
  const bannedUntilMs = banDurationMs > 0 ? Date.now() + banDurationMs : 0;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      bannedUntilMs,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function generateRandomTicketNumber(): string {
  const lengths = [6, 7, 8, 9, 10];
  const len = lengths[Math.floor(Math.random() * lengths.length)];
  const firstDigit = String(1 + Math.floor(Math.random() * 9));
  let rest = '';
  for (let i = 1; i < len; i += 1) {
    rest += String(Math.floor(Math.random() * 10));
  }
  return `${firstDigit}${rest}`;
}

function mapSupportTicket(id: string, d: DocumentData): SupportTicket {
  const status =
    d.status === 'replied' ? 'replied' : d.status === 'closed' ? 'closed' : 'open';
  const category: SupportCategory =
    d.category === 'complaint'
      ? 'complaint'
      : d.category === 'suggestion'
        ? 'suggestion'
        : 'support';
  return {
    id,
    ticketNumber: String(d.ticketNumber || id),
    userId: String(d.userId || ''),
    userName: String(d.userName || 'مستخدم'),
    username: String(d.username || ''),
    category,
    subject: String(d.subject || ''),
    status,
    lastMessageText: String(d.lastMessageText || ''),
    lastSenderRole: d.lastSenderRole === 'admin' ? 'admin' : 'user',
    createdAtMs: Number(d.createdAtMs || Date.now()),
    updatedAtMs: Number(d.updatedAtMs || Date.now()),
    closedAtMs: Number(d.closedAtMs || 0),
  };
}

function mapSupportMessage(id: string, d: DocumentData): SupportMessage {
  return {
    id,
    ticketNumber: String(d.ticketNumber || ''),
    ticketUserId: String(d.ticketUserId || ''),
    senderId: String(d.senderId || ''),
    senderRole: d.senderRole === 'admin' ? 'admin' : 'user',
    senderName: String(d.senderName || 'مستخدم'),
    senderUsername: String(d.senderUsername || ''),
    text: String(d.text || ''),
    createdAtMs: Number(d.createdAtMs || Date.now()),
  };
}

export async function createSupportTicket(params: {
  profile: PlayerProfile;
  usernameInput?: string;
  category: SupportCategory;
  subject: string;
  initialMessage: string;
}): Promise<string> {
  const cleanUsername = (params.usernameInput ?? params.profile.username ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .slice(0, 30);
  const cleanSubject = params.subject.trim().slice(0, 100);
  const cleanMsg = params.initialMessage.trim().slice(0, 1000);
  const cleanUserName = (params.profile.name || 'مستخدم').trim().slice(0, 40) || 'مستخدم';

  if (!cleanSubject || !cleanMsg) {
    throw new Error('يرجى كتابة عنوان الطلب ونص الرسالة');
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const ticketNumber = generateRandomTicketNumber();
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const batch = writeBatch(db);

    batch.set(doc(db, 'supportTickets', ticketNumber), {
      ticketNumber,
      userId: params.profile.id,
      userName: cleanUserName,
      username: cleanUsername,
      category: params.category,
      subject: cleanSubject,
      status: 'open',
      lastMessageText: cleanMsg.slice(0, 500),
      lastSenderRole: 'user',
      createdAtMs: now,
      updatedAtMs: now,
      closedAtMs: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'supportTickets', ticketNumber, 'messages', msgId), {
      id: msgId,
      ticketNumber,
      ticketUserId: params.profile.id,
      senderId: params.profile.id,
      senderRole: 'user',
      senderName: cleanUserName,
      senderUsername: cleanUsername,
      text: cleanMsg,
      createdAtMs: now,
      createdAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      return ticketNumber;
    } catch (err) {
      lastError = err;
    }
  }

  handleFirestoreError(lastError, OperationType.CREATE, 'supportTickets');
}

export async function sendUserSupportReply(params: {
  ticket: SupportTicket;
  profile: PlayerProfile;
  text: string;
}): Promise<void> {
  if (params.ticket.status === 'closed') {
    throw new Error('تم إنهاء هذا الطلب ولا يمكنك إرسال رسائل جديدة فيه');
  }
  const cleanMsg = params.text.trim().slice(0, 1000);
  if (!cleanMsg) return;

  const path = `supportTickets/${params.ticket.ticketNumber}/messages`;
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const cleanUsername = (params.profile.username || params.ticket.username || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .slice(0, 30);
  const cleanName = (params.profile.name || params.ticket.userName || 'مستخدم').trim().slice(0, 40) || 'مستخدم';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'supportTickets', params.ticket.ticketNumber), {
      status: 'open',
      lastMessageText: cleanMsg.slice(0, 500),
      lastSenderRole: 'user',
      updatedAtMs: now,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'supportTickets', params.ticket.ticketNumber, 'messages', msgId), {
      id: msgId,
      ticketNumber: params.ticket.ticketNumber,
      ticketUserId: params.ticket.userId,
      senderId: params.profile.id,
      senderRole: 'user',
      senderName: cleanName,
      senderUsername: cleanUsername,
      text: cleanMsg,
      createdAtMs: now,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminReplySupportTicket(params: {
  ticket: SupportTicket;
  adminProfile: PlayerProfile;
  text: string;
}): Promise<void> {
  const cleanMsg = params.text.trim().slice(0, 1000);
  if (!cleanMsg) return;

  const path = `supportTickets/${params.ticket.ticketNumber}/messages`;
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const adminUsername = (params.adminProfile.username || 'admin')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .slice(0, 30);
  const adminName = (params.adminProfile.name || 'الإدارة').trim().slice(0, 40) || 'الإدارة';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'supportTickets', params.ticket.ticketNumber), {
      status: 'replied',
      lastMessageText: cleanMsg.slice(0, 500),
      lastSenderRole: 'admin',
      updatedAtMs: now,
      closedAtMs: 0,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'supportTickets', params.ticket.ticketNumber, 'messages', msgId), {
      id: msgId,
      ticketNumber: params.ticket.ticketNumber,
      ticketUserId: params.ticket.userId,
      senderId: params.adminProfile.id,
      senderRole: 'admin',
      senderName: adminName,
      senderUsername: adminUsername,
      text: cleanMsg,
      createdAtMs: now,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function adminCloseSupportTicket(params: {
  ticket: SupportTicket;
  adminProfile: PlayerProfile;
  closingNote?: string;
}): Promise<void> {
  const path = `supportTickets/${params.ticket.ticketNumber}`;
  const now = Date.now();
  const closingText = (
    params.closingNote ||
    'تم إنهاء وإغلاق رقم الطلب من قِبل الإدارة. يمكنك فتح طلب جديد في أي وقت عند الحاجة.'
  )
    .trim()
    .slice(0, 1000);
  const msgId = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const adminUsername = (params.adminProfile.username || 'admin')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .slice(0, 30);
  const adminName = (params.adminProfile.name || 'الإدارة').trim().slice(0, 40) || 'الإدارة';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'supportTickets', params.ticket.ticketNumber), {
      status: 'closed',
      lastMessageText: closingText.slice(0, 500),
      lastSenderRole: 'admin',
      updatedAtMs: now,
      closedAtMs: now,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'supportTickets', params.ticket.ticketNumber, 'messages', msgId), {
      id: msgId,
      ticketNumber: params.ticket.ticketNumber,
      ticketUserId: params.ticket.userId,
      senderId: params.adminProfile.id,
      senderRole: 'admin',
      senderName: adminName,
      senderUsername: adminUsername,
      text: closingText,
      createdAtMs: now,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeUserSupportTickets(
  uid: string,
  onData: (items: SupportTicket[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    return () => {};
  }
  const path = 'supportTickets';
  const q = query(collection(db, 'supportTickets'), where('userId', '==', uid), limit(60));
  const rawUnsub = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapSupportTicket(d.id, d.data()));
      list.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(list);
    },
    (err) => {
      if (!auth.currentUser || auth.currentUser.uid !== uid) return;
      if (onError) onError(err);
      else console.error('User support listener error:', path, err);
    }
  );
  return trackSnapshot(rawUnsub);
}

export function subscribeAdminSupportTickets(
  onData: (items: SupportTicket[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    return () => {};
  }
  const path = 'supportTickets';
  const q = query(collection(db, 'supportTickets'), orderBy('updatedAtMs', 'desc'), limit(120));
  const rawUnsub = onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => mapSupportTicket(d.id, d.data())));
    },
    (err) => {
      if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) return;
      if (onError) onError(err);
      else console.error('Admin support listener error:', path, err);
    }
  );
  return trackSnapshot(rawUnsub);
}

export function subscribeSupportMessages(
  ticketNumber: string,
  viewerUid: string,
  isAdminViewer: boolean,
  onData: (items: SupportMessage[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!auth.currentUser || auth.currentUser.uid !== viewerUid) {
    return () => {};
  }
  if (isAdminViewer && !isAdminEmail(auth.currentUser.email)) {
    return () => {};
  }
  const path = `supportTickets/${ticketNumber}/messages`;
  const q = isAdminViewer
    ? query(
        collection(db, 'supportTickets', ticketNumber, 'messages'),
        orderBy('createdAtMs', 'asc'),
        limit(200)
      )
    : query(
        collection(db, 'supportTickets', ticketNumber, 'messages'),
        where('ticketUserId', '==', viewerUid),
        limit(200)
      );

  const rawUnsub = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapSupportMessage(d.id, d.data()));
      list.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onData(list);
    },
    (err) => {
      if (!auth.currentUser || auth.currentUser.uid !== viewerUid) return;
      if (onError) onError(err);
      else console.error('Support messages listener error:', path, err);
    }
  );
  return trackSnapshot(rawUnsub);
}

export function getDirectChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('__');
}

export async function sendDirectMessage(params: {
  sender: PlayerProfile;
  receiver: PlayerProfile;
  text: string;
}): Promise<void> {
  const cleanText = params.text.trim().slice(0, 800);
  if (!cleanText || params.sender.id === params.receiver.id) return;

  const [participantA, participantB] = [params.sender.id, params.receiver.id].sort();
  const chatId = `${participantA}__${participantB}`;
  const participantAName = (
    participantA === params.sender.id ? params.sender.name : params.receiver.name
  )
    .trim()
    .slice(0, 40) || 'لاعب';
  const participantBName = (
    participantB === params.sender.id ? params.sender.name : params.receiver.name
  )
    .trim()
    .slice(0, 40) || 'لاعب';
  const senderName = (params.sender.name || 'لاعب').trim().slice(0, 40) || 'لاعب';

  const chatRef = doc(db, 'directChats', chatId);
  const msgId = `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const msgRef = doc(db, 'directChats', chatId, 'messages', msgId);
  const now = Date.now();
  const path = `directChats/${chatId}/messages/${msgId}`;

  try {
    const existingChat = await getDoc(chatRef);
    const batch = writeBatch(db);
    if (!existingChat.exists()) {
      batch.set(chatRef, {
        chatId,
        participantA,
        participantB,
        participantAName,
        participantBName,
        lastMessageText: cleanText.slice(0, 500),
        lastSenderId: params.sender.id,
        updatedAtMs: now,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(chatRef, {
        participantAName,
        participantBName,
        lastMessageText: cleanText.slice(0, 500),
        lastSenderId: params.sender.id,
        updatedAtMs: now,
        updatedAt: serverTimestamp(),
      });
    }
    batch.set(msgRef, {
      id: msgId,
      chatId,
      senderId: params.sender.id,
      receiverId: params.receiver.id,
      senderName,
      text: cleanText,
      createdAtMs: now,
      readAtMs: 0,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function markDirectMessagesRead(
  myUid: string,
  friendUid: string,
  messages: DirectMessage[]
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== myUid || !friendUid || myUid === friendUid) {
    return;
  }
  const unread = messages.filter(
    (m) => m.receiverId === myUid && m.senderId === friendUid && !(m.readAtMs && m.readAtMs > 0)
  );
  if (unread.length === 0) return;

  const chatId = getDirectChatId(myUid, friendUid);
  const readTs = Date.now();
  try {
    const batch = writeBatch(db);
    for (const msg of unread.slice(0, 100)) {
      batch.update(doc(db, 'directChats', chatId, 'messages', msg.id), {
        readAtMs: readTs,
      });
    }
    await batch.commit();
  } catch {
    // Ignore transient read receipt update errors cleanly
  }
}

export function subscribeDirectMessages(
  myUid: string,
  friendUid: string,
  onData: (messages: DirectMessage[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!auth.currentUser || auth.currentUser.uid !== myUid || !friendUid || myUid === friendUid) {
    onData([]);
    return () => {};
  }

  const chatId = getDirectChatId(myUid, friendUid);
  const path = `directChats/${chatId}/messages`;
  const sentMap = new Map<string, DirectMessage>();
  const recvMap = new Map<string, DirectMessage>();

  const emitMerged = () => {
    const merged = new Map<string, DirectMessage>([...sentMap, ...recvMap]);
    const list = Array.from(merged.values()).sort((a, b) => a.createdAtMs - b.createdAtMs);
    onData(list);
  };

  const mapMsg = (id: string, d: DocumentData, pending: boolean): DirectMessage => ({
    id,
    chatId: String(d.chatId || chatId),
    senderId: String(d.senderId || ''),
    receiverId: String(d.receiverId || ''),
    senderName: String(d.senderName || 'لاعب'),
    text: String(d.text || ''),
    createdAtMs: Number(d.createdAtMs || Date.now()),
    readAtMs: Number(d.readAtMs || 0),
    pending,
  });

  const qSent = query(
    collection(db, 'directChats', chatId, 'messages'),
    where('senderId', '==', myUid),
    limit(150)
  );
  const qRecv = query(
    collection(db, 'directChats', chatId, 'messages'),
    where('receiverId', '==', myUid),
    limit(150)
  );

  const rawUnsub1 = onSnapshot(
    qSent,
    { includeMetadataChanges: true },
    (snap) => {
      sentMap.clear();
      for (const d of snap.docs) sentMap.set(d.id, mapMsg(d.id, d.data(), d.metadata.hasPendingWrites));
      emitMerged();
    },
    (err) => {
      if (!auth.currentUser || auth.currentUser.uid !== myUid) return;
      if (onError) onError(err);
      else console.error('Direct messages listener error:', path, err);
    }
  );

  const rawUnsub2 = onSnapshot(
    qRecv,
    { includeMetadataChanges: true },
    (snap) => {
      recvMap.clear();
      for (const d of snap.docs) recvMap.set(d.id, mapMsg(d.id, d.data(), d.metadata.hasPendingWrites));
      emitMerged();
    },
    (err) => {
      if (!auth.currentUser || auth.currentUser.uid !== myUid) return;
      if (onError) onError(err);
      else console.error('Direct messages listener error:', path, err);
    }
  );

  const unsub1 = trackSnapshot(rawUnsub1);
  const unsub2 = trackSnapshot(rawUnsub2);
  return () => {
    unsub1();
    unsub2();
  };
}

export function subscribeUserDirectChats(
  myUid: string,
  onData: (threads: DirectChatThread[]) => void
): () => void {
  if (!auth.currentUser || auth.currentUser.uid !== myUid) {
    onData([]);
    return () => {};
  }

  const mapA = new Map<string, DirectChatThread>();
  const mapB = new Map<string, DirectChatThread>();

  const emitMerged = () => {
    const merged = new Map<string, DirectChatThread>([...mapA, ...mapB]);
    onData(Array.from(merged.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs));
  };

  const mapThread = (id: string, d: DocumentData): DirectChatThread => ({
    chatId: String(d.chatId || id),
    participantA: String(d.participantA || ''),
    participantB: String(d.participantB || ''),
    participantAName: String(d.participantAName || 'لاعب'),
    participantBName: String(d.participantBName || 'لاعب'),
    lastMessageText: String(d.lastMessageText || ''),
    lastSenderId: String(d.lastSenderId || ''),
    updatedAtMs: Number(d.updatedAtMs || 0),
  });

  const qA = query(collection(db, 'directChats'), where('participantA', '==', myUid), limit(40));
  const qB = query(collection(db, 'directChats'), where('participantB', '==', myUid), limit(40));

  const unsub1 = trackSnapshot(
    onSnapshot(
      qA,
      (snap) => {
        mapA.clear();
        for (const d of snap.docs) mapA.set(d.id, mapThread(d.id, d.data()));
        emitMerged();
      },
      () => {}
    )
  );
  const unsub2 = trackSnapshot(
    onSnapshot(
      qB,
      (snap) => {
        mapB.clear();
        for (const d of snap.docs) mapB.set(d.id, mapThread(d.id, d.data()));
        emitMerged();
      },
      () => {}
    )
  );

  return () => {
    unsub1();
    unsub2();
  };
}

const VALID_FRIEND_AVATARS: readonly AvatarId[] = [
  'falcon',
  'panda',
  'fox',
  'cat',
  'astronaut',
  'knight',
  'chef',
  'wizard',
];

function safeAvatar(val: unknown): AvatarId {
  return VALID_FRIEND_AVATARS.includes(val as AvatarId) ? (val as AvatarId) : 'falcon';
}

export function getFriendPairId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('__');
}

export async function sendFriendRequest(
  fromProfile: PlayerProfile,
  toProfile: PlayerProfile
): Promise<'sent' | 'already_sent' | 'already_friends' | 'accepted'> {
  if (!fromProfile.id || !toProfile.id || fromProfile.id === toProfile.id) {
    throw new Error('بيانات المستخدم غير صالحة');
  }
  if (!auth.currentUser || auth.currentUser.uid !== fromProfile.id) {
    throw new Error('انتهت جلسة الدخول، يرجى إعادة تسجيل الدخول بحساب Google');
  }
  const requestId = getFriendPairId(fromProfile.id, toProfile.id);
  const path = `friendRequests/${requestId}`;
  const reqRef = doc(db, 'friendRequests', requestId);

  try {
    const existingSnap = await getDoc(reqRef);
    if (existingSnap.exists()) {
      const data = existingSnap.data();
      if (data.status === 'accepted') return 'already_friends';
      if (data.status === 'pending') {
        if (data.toUid === fromProfile.id) {
          await acceptFriendRequest(
            {
              requestId,
              fromUid: String(data.fromUid),
              toUid: String(data.toUid),
              fromName: String(data.fromName || toProfile.name || 'لاعب'),
              fromUsername: String(data.fromUsername || ''),
              fromAvatar: safeAvatar(data.fromAvatar),
              toName: String(data.toName || fromProfile.name || 'لاعب'),
              toUsername: String(data.toUsername || ''),
              toAvatar: safeAvatar(data.toAvatar),
              status: 'pending',
              createdAtMs: Number(data.createdAtMs || Date.now()),
              updatedAtMs: Number(data.updatedAtMs || Date.now()),
            },
            fromProfile
          );
          return 'accepted';
        }
        return 'already_sent';
      }
      await deleteDoc(reqRef);
    }

    const targetUserSnap = await getDoc(doc(db, 'users', toProfile.id));
    if (targetUserSnap.exists() && targetUserSnap.data()?.privacyBlockFriendRequests === true) {
      throw new Error('هذا المستخدم أوقف استقبال طلبات الصداقة ضمن إعدادات الخصوصية');
    }

    const now = Date.now();
    await setDoc(reqRef, {
      requestId,
      fromUid: fromProfile.id,
      toUid: toProfile.id,
      fromName: (fromProfile.name || 'لاعب').trim().slice(0, 40) || 'لاعب',
      fromUsername: (fromProfile.username || '').trim().replace(/^@+/, '').toLowerCase().slice(0, 30),
      fromAvatar: safeAvatar(fromProfile.avatar),
      toName: (toProfile.name || 'لاعب').trim().slice(0, 40) || 'لاعب',
      toUsername: (toProfile.username || '').trim().replace(/^@+/, '').toLowerCase().slice(0, 30),
      toAvatar: safeAvatar(toProfile.avatar),
      status: 'pending',
      createdAtMs: now,
      updatedAtMs: now,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return 'sent';
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function acceptFriendRequest(
  req: FriendRequest,
  myProfile: PlayerProfile
): Promise<void> {
  const path = `friendRequests/${req.requestId}`;
  const now = Date.now();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'friendRequests', req.requestId), {
      status: 'accepted',
      toName: (myProfile.name || req.toName || 'لاعب').trim().slice(0, 40) || 'لاعب',
      toUsername: (myProfile.username || req.toUsername || '').trim().replace(/^@+/, '').toLowerCase().slice(0, 30),
      toAvatar: safeAvatar(myProfile.avatar),
      updatedAtMs: now,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', myProfile.id, 'friends', req.fromUid), {
      friendUid: req.fromUid,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function declineOrCancelFriendRequest(requestId: string): Promise<void> {
  const path = `friendRequests/${requestId}`;
  try {
    await deleteDoc(doc(db, 'friendRequests', requestId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function removeMutualFriend(myUid: string, friendUid: string): Promise<void> {
  const pairId = getFriendPairId(myUid, friendUid);
  try {
    await Promise.allSettled([
      deleteDoc(doc(db, 'users', myUid, 'friends', friendUid)),
      deleteDoc(doc(db, 'friendRequests', pairId)),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friendRequests/${pairId}`);
  }
}

export function subscribeFriendRequests(
  myUid: string,
  onData: (items: FriendRequest[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!auth.currentUser || auth.currentUser.uid !== myUid) {
    onData([]);
    return () => {};
  }

  const fromMap = new Map<string, FriendRequest>();
  const toMap = new Map<string, FriendRequest>();

  const emitMerged = () => {
    const merged = new Map<string, FriendRequest>([...fromMap, ...toMap]);
    onData(Array.from(merged.values()).sort((a, b) => b.updatedAtMs - a.updatedAtMs));
  };

  const mapReq = (id: string, d: DocumentData): FriendRequest => ({
    requestId: String(d.requestId || id),
    fromUid: String(d.fromUid || ''),
    toUid: String(d.toUid || ''),
    fromName: String(d.fromName || 'لاعب'),
    fromUsername: String(d.fromUsername || ''),
    fromAvatar: safeAvatar(d.fromAvatar),
    toName: String(d.toName || 'لاعب'),
    toUsername: String(d.toUsername || ''),
    toAvatar: safeAvatar(d.toAvatar),
    status: (d.status as FriendRequestStatus) || 'pending',
    createdAtMs: Number(d.createdAtMs || 0),
    updatedAtMs: Number(d.updatedAtMs || 0),
  });

  const qFrom = query(collection(db, 'friendRequests'), where('fromUid', '==', myUid), limit(80));
  const qTo = query(collection(db, 'friendRequests'), where('toUid', '==', myUid), limit(80));

  const unsubFrom = trackSnapshot(
    onSnapshot(
      qFrom,
      (snap) => {
        fromMap.clear();
        for (const d of snap.docs) fromMap.set(d.id, mapReq(d.id, d.data()));
        emitMerged();
      },
      (err) => {
        if (!auth.currentUser || auth.currentUser.uid !== myUid) return;
        if (onError) onError(err);
      }
    )
  );

  const unsubTo = trackSnapshot(
    onSnapshot(
      qTo,
      (snap) => {
        toMap.clear();
        for (const d of snap.docs) toMap.set(d.id, mapReq(d.id, d.data()));
        emitMerged();
      },
      (err) => {
        if (!auth.currentUser || auth.currentUser.uid !== myUid) return;
        if (onError) onError(err);
      }
    )
  );

  return () => {
    unsubFrom();
    unsubTo();
  };
}

export async function fetchSuggestedPlayers(myUid: string): Promise<PlayerProfile[]> {
  try {
    const q = query(collection(db, 'users'), limit(10));
    const snap = await getDocs(q);
    const list: PlayerProfile[] = [];
    for (const d of snap.docs) {
      if (d.id === myUid) continue;
      const data = d.data();
      list.push({
        id: d.id,
        name: String(data.name || 'لاعب'),
        username: String(data.username || ''),
        avatar: safeAvatar(data.avatar),
        bio: String(data.bio || ''),
        coins: Number(data.coins || 0),
        wins: Number(data.wins || 0),
        gamesPlayed: Number(data.gamesPlayed || 0),
        basicRoomId: String(data.basicRoomId || ''),
        privacyBlockFriendRequests: Boolean(data.privacyBlockFriendRequests),
      });
    }
    return list;
  } catch {
    return [];
  }
}

export async function fetchProfilesByIds(uids: string[]): Promise<PlayerProfile[]> {
  const unique = Array.from(new Set(uids.filter(Boolean))).slice(0, 40);
  if (unique.length === 0) return [];
  const results = await Promise.allSettled(unique.map((uid) => getDoc(doc(db, 'users', uid))));
  const list: PlayerProfile[] = [];
  for (const res of results) {
    if (res.status === 'fulfilled' && res.value.exists()) {
      const d = res.value;
      const data = d.data();
      list.push({
        id: d.id,
        name: String(data.name || 'لاعب'),
        username: String(data.username || ''),
        avatar: safeAvatar(data.avatar),
        bio: String(data.bio || ''),
        coins: Number(data.coins || 0),
        wins: Number(data.wins || 0),
        gamesPlayed: Number(data.gamesPlayed || 0),
        basicRoomId: String(data.basicRoomId || ''),
        privacyBlockFriendRequests: Boolean(data.privacyBlockFriendRequests),
      });
    }
  }
  return list;
}


