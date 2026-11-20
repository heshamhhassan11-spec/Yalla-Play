import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Bell,
  CheckCircle2,
  Headphones,
  Lock,
  LogOut,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import type { AdminFilterTab } from './components/AdminRechargePanel';
import { CreateRoomModal } from './components/CreateRoomModal';
import { DailyTasksModal } from './components/DailyTasksModal';
import { DataProtectionModal } from './components/DataProtectionModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FriendsModal } from './components/FriendsModal';
import { FriendsView } from './components/FriendsView';
import { GameStatsModal, incrementPerGameActivity } from './components/GameStatsModal';
import { LobbyView } from './components/LobbyView';
import { LoginScreen } from './components/LoginScreen';
import { ProfileView } from './components/ProfileView';
import { RoomArena } from './components/RoomArena';
import { StoreView } from './components/StoreView';
import { SupportCenterView } from './components/SupportCenterView';
import { TopBar, type AppTab } from './components/TopBar';
import {
  auth,
  checkGoogleRedirectResult,
  claimDailyTaskReward,
  ensureUserProfile,
  getDirectChatId,
  loadPersistedBasicRoom,
  onAuthTransition,
  purchaseBasicVoiceRoom,
  recordGiftTransaction,
  signOutUser,
  subscribeAdminRechargeRequests,
  subscribeAdminSupportTickets,
  subscribeFriendRequests,
  subscribeReports,
  subscribeUserDirectChats,
  subscribeUserProfile,
  subscribeUserRechargeRequests,
  subscribeUserSupportTickets,
  teardownAllFirestoreListeners,
  updateUserProfileFields,
} from './firebase';
import { DAILY_TASK_DEFINITIONS } from './components/DailyTasksSection';
import { useSocket } from './hooks/useSocket';
import { isAdminEmail } from './shared/gameCatalog';
import type {
  AppReleaseInfo,
  DirectChatThread,
  FriendRequest,
  GameType,
  PlayerProfile,
  RechargeRequest,
  ReportRecord,
  SupportTicket,
} from './shared/types';
import { soundFx } from './utils/sound';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'yallaplay_theme';

const GUEST_FALLBACK: PlayerProfile = {
  id: 'guest',
  name: 'جاري التحميل',
  avatar: 'falcon',
  bio: '',
  coins: 0,
  wins: 0,
  gamesPlayed: 0,
  basicRoomId: '',
};

function MainShell({
  profile,
  setProfile,
  theme,
  onToggleTheme,
}: {
  profile: PlayerProfile;
  setProfile: React.Dispatch<React.SetStateAction<PlayerProfile | null>>;
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AppTab>('rooms');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [modalInitialGame, setModalInitialGame] = useState<GameType>('ludo');

  const currentAuthUser = auth.currentUser;
  const isAuthSynced = Boolean(currentAuthUser && currentAuthUser.uid === profile.id);
  const isAdmin =
    isAuthSynced &&
    isAdminEmail(profile.email) &&
    isAdminEmail(currentAuthUser?.email);
  const [userRequests, setUserRequests] = useState<RechargeRequest[]>([]);
  const [adminRequests, setAdminRequests] = useState<RechargeRequest[]>([]);
  const [adminTab, setAdminTab] = useState<AdminFilterTab>('pending');
  const [userAlert, setUserAlert] = useState<string | null>(null);
  const [dismissedPendingToast, setDismissedPendingToast] = useState(false);

  const [releaseInfo, setReleaseInfo] = useState<AppReleaseInfo | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showWhatsNewBanner, setShowWhatsNewBanner] = useState(false);
  const [whatsNewExpanded, setWhatsNewExpanded] = useState(false);
  const initialBuildIdRef = useRef<string | null>(null);

  const prevPendingIdsRef = useRef<Set<string> | null>(null);
  const prevUserReqStatusRef = useRef<Record<string, string> | null>(null);

  const [roomPinInput, setRoomPinInput] = useState('');

  const {
    connected,
    rooms,
    activeRoom,
    presenceMap,
    watchPresence,
    errorMsg,
    lockPrompt,
    clearLockPrompt,
    send,
  } = useSocket(profile);

  const [isRoomMinimized, setIsRoomMinimized] = useState(false);
  const prevRoomCodeRef = useRef<string | null>(null);

  useEffect(() => {
    const code = activeRoom?.code || null;
    if (!code) {
      setIsRoomMinimized(false);
    } else if (prevRoomCodeRef.current !== code) {
      setIsRoomMinimized(false);
    }
    prevRoomCodeRef.current = code;
  }, [activeRoom?.code]);

  const checkForUpdates = useCallback(async (): Promise<'updated' | 'latest' | 'error'> => {
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return 'error';
      const data = (await res.json()) as AppReleaseInfo;
      setReleaseInfo(data);

      if (!initialBuildIdRef.current) {
        initialBuildIdRef.current = data.buildId;
        try {
          const seenVer = localStorage.getItem('yallaplay_seen_version');
          if (seenVer !== data.version) {
            setShowWhatsNewBanner(true);
          }
        } catch {
          setShowWhatsNewBanner(true);
        }
        return 'latest';
      }

      if (data.buildId !== initialBuildIdRef.current) {
        setUpdateAvailable(true);
        setShowWhatsNewBanner(true);
        soundFx.correct();
        return 'updated';
      }
      return 'latest';
    } catch {
      return 'error';
    }
  }, []);

  const dismissWhatsNew = useCallback(() => {
    setShowWhatsNewBanner(false);
    if (releaseInfo) {
      try {
        localStorage.setItem('yallaplay_seen_version', releaseInfo.version);
      } catch {
        // Ignore storage error
      }
    }
  }, [releaseInfo]);

  const handleApplyUpdate = useCallback(() => {
    if (releaseInfo) {
      try {
        localStorage.setItem('yallaplay_seen_version', releaseInfo.version);
      } catch {
        // Ignore storage error
      }
    }
    window.location.reload();
  }, [releaseInfo]);

  useEffect(() => {
    void checkForUpdates();
    const pollId = setInterval(() => {
      void checkForUpdates();
    }, 45000);
    const onFocus = () => {
      void checkForUpdates();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(pollId);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkForUpdates]);

  // Live profile coin & room updates (credits from Admin approvals appear immediately)
  useEffect(() => {
    if (!isAuthSynced) return;
    const unsub = subscribeUserProfile(profile.id, (patch) => {
      setProfile((prev) => (prev && prev.id === profile.id ? { ...prev, ...patch } : prev));
    });
    return unsub;
  }, [profile.id, isAuthSynced, setProfile]);

  // Live user recharge requests listener
  useEffect(() => {
    if (!isAuthSynced) {
      setUserRequests([]);
      prevUserReqStatusRef.current = null;
      return;
    }
    const unsub = subscribeUserRechargeRequests(profile.id, (items) => {
      if (prevUserReqStatusRef.current) {
        for (const req of items) {
          const prevStatus = prevUserReqStatusRef.current[req.requestId];
          if (prevStatus === 'pending' && req.status === 'approved') {
            soundFx.win();
            setUserAlert(
              `تمت الموافقة على طلب الشحن وإضافة ${req.coins.toLocaleString('en-US')} عملة إلى رصيدك!`
            );
          } else if (prevStatus === 'pending' && req.status === 'rejected') {
            setUserAlert(
              `تم رفض طلب الشحن (${req.coins.toLocaleString('en-US')} عملة)${req.adminNote ? `: ${req.adminNote}` : ''}`
            );
          }
        }
      }
      const nextMap: Record<string, string> = {};
      for (const req of items) nextMap[req.requestId] = req.status;
      prevUserReqStatusRef.current = nextMap;
      setUserRequests(items);
    });
    return unsub;
  }, [profile.id, isAuthSynced]);

  // Live Admin recharge requests & real-time pending notifications
  useEffect(() => {
    if (!isAdmin) {
      setAdminRequests([]);
      prevPendingIdsRef.current = null;
      return;
    }
    const unsub = subscribeAdminRechargeRequests((items) => {
      const pendingIds = new Set(
        items.filter((r) => r.status === 'pending').map((r) => r.requestId)
      );
      if (prevPendingIdsRef.current) {
        let hasNew = false;
        for (const id of pendingIds) {
          if (!prevPendingIdsRef.current.has(id)) {
            hasNew = true;
            break;
          }
        }
        if (hasNew) {
          soundFx.gift();
          setDismissedPendingToast(false);
        }
      }
      prevPendingIdsRef.current = pendingIds;
      setAdminRequests(items);
    });
    return unsub;
  }, [isAdmin]);

  const [adminReports, setAdminReports] = useState<ReportRecord[]>([]);
  const [dismissedReportsToast, setDismissedReportsToast] = useState(false);
  const prevPendingReportIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setAdminReports([]);
      prevPendingReportIdsRef.current = null;
      return;
    }
    const unsub = subscribeReports((items) => {
      const pendingIds = new Set(
        items.filter((r) => r.status === 'pending').map((r) => r.id)
      );
      if (prevPendingReportIdsRef.current) {
        let hasNew = false;
        for (const id of pendingIds) {
          if (!prevPendingReportIdsRef.current.has(id)) {
            hasNew = true;
            break;
          }
        }
        if (hasNew) {
          soundFx.correct();
          setDismissedReportsToast(false);
        }
      }
      prevPendingReportIdsRef.current = pendingIds;
      setAdminReports(items);
    });
    return unsub;
  }, [isAdmin]);

  const [userSupportTickets, setUserSupportTickets] = useState<SupportTicket[]>([]);
  const [adminSupportTickets, setAdminSupportTickets] = useState<SupportTicket[]>([]);
  const [dismissedSupportToast, setDismissedSupportToast] = useState(false);
  const [dismissedUserReplyToast, setDismissedUserReplyToast] = useState(false);
  const prevOpenTicketIdsRef = useRef<Set<string> | null>(null);
  const prevUserTicketStatusRef = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    if (!isAuthSynced) {
      setUserSupportTickets([]);
      prevUserTicketStatusRef.current = null;
      return;
    }
    const unsub = subscribeUserSupportTickets(profile.id, (items) => {
      if (prevUserTicketStatusRef.current) {
        for (const t of items) {
          const prevStatus = prevUserTicketStatusRef.current[t.ticketNumber];
          if (prevStatus && prevStatus !== 'replied' && t.status === 'replied') {
            soundFx.correct();
            setDismissedUserReplyToast(false);
          }
        }
      }
      const nextMap: Record<string, string> = {};
      for (const t of items) nextMap[t.ticketNumber] = t.status;
      prevUserTicketStatusRef.current = nextMap;
      setUserSupportTickets(items);
    });
    return unsub;
  }, [profile.id, isAuthSynced]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminSupportTickets([]);
      prevOpenTicketIdsRef.current = null;
      return;
    }
    const unsub = subscribeAdminSupportTickets((items) => {
      const openIds = new Set(
        items.filter((t) => t.status === 'open').map((t) => t.ticketNumber)
      );
      if (prevOpenTicketIdsRef.current) {
        let hasNew = false;
        for (const id of openIds) {
          if (!prevOpenTicketIdsRef.current.has(id)) {
            hasNew = true;
            break;
          }
        }
        if (hasNew) {
          soundFx.gift();
          setDismissedSupportToast(false);
        }
      }
      prevOpenTicketIdsRef.current = openIds;
      setAdminSupportTickets(items);
    });
    return unsub;
  }, [isAdmin]);

  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [dismissedFriendsToast, setDismissedFriendsToast] = useState(false);
  const prevIncomingReqIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!isAuthSynced) {
      setFriendRequests([]);
      prevIncomingReqIdsRef.current = null;
      return;
    }
    const unsub = subscribeFriendRequests(profile.id, (items) => {
      const incomingIds = new Set(
        items.filter((r) => r.status === 'pending' && r.toUid === profile.id).map((r) => r.requestId)
      );
      if (prevIncomingReqIdsRef.current) {
        let hasNew = false;
        for (const id of incomingIds) {
          if (!prevIncomingReqIdsRef.current.has(id)) {
            hasNew = true;
            break;
          }
        }
        if (hasNew) {
          soundFx.gift();
          setDismissedFriendsToast(false);
        }
      }
      prevIncomingReqIdsRef.current = incomingIds;
      setFriendRequests(items);
    });
    return unsub;
  }, [profile.id, isAuthSynced]);

  const [directChats, setDirectChats] = useState<DirectChatThread[]>([]);
  const [seenChatMap, setSeenChatMap] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(`yallaplay_seen_chats_${profile.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, number>;
      }
    } catch {
      // Ignore storage error
    }
    return {};
  });
  const [latestMessageToast, setLatestMessageToast] = useState<{
    chatId: string;
    senderUid: string;
    senderName: string;
    text: string;
    updatedAtMs: number;
  } | null>(null);
  const [targetFriendChatUid, setTargetFriendChatUid] = useState<string | null>(null);
  const activeChatFriendUidRef = useRef<string | null>(null);
  const prevChatUpdatedAtRef = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`yallaplay_seen_chats_${profile.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setSeenChatMap(parsed as Record<string, number>);
          return;
        }
      }
    } catch {
      // Ignore storage error
    }
    setSeenChatMap({});
  }, [profile.id]);

  const handleChatSeen = useCallback(
    (friendUid: string, seenAtMs?: number) => {
      const chatId = getDirectChatId(profile.id, friendUid);
      const ts = seenAtMs && seenAtMs > 0 ? seenAtMs : Date.now();
      setSeenChatMap((prev) => {
        if ((prev[chatId] || 0) >= ts) return prev;
        const next = { ...prev, [chatId]: ts };
        try {
          localStorage.setItem(`yallaplay_seen_chats_${profile.id}`, JSON.stringify(next));
        } catch {
          // Ignore storage error
        }
        return next;
      });
      setLatestMessageToast((prev) =>
        prev && prev.senderUid === friendUid ? null : prev
      );
    },
    [profile.id]
  );

  const handleActiveFriendChange = useCallback((friendUid: string | null) => {
    activeChatFriendUidRef.current = friendUid;
  }, []);

  useEffect(() => {
    if (!isAuthSynced) {
      setDirectChats([]);
      prevChatUpdatedAtRef.current = null;
      return;
    }
    const unsub = subscribeUserDirectChats(profile.id, (threads) => {
      const prevMap = prevChatUpdatedAtRef.current;
      if (prevMap) {
        let newestIncoming: DirectChatThread | null = null;
        for (const t of threads) {
          const prevTs = prevMap.get(t.chatId) ?? 0;
          if (
            t.updatedAtMs > prevTs &&
            t.lastSenderId &&
            t.lastSenderId !== profile.id &&
            (!newestIncoming || t.updatedAtMs > newestIncoming.updatedAtMs)
          ) {
            newestIncoming = t;
          }
        }
        if (newestIncoming) {
          const senderUid =
            newestIncoming.participantA === profile.id
              ? newestIncoming.participantB
              : newestIncoming.participantA;
          const senderName =
            newestIncoming.participantA === profile.id
              ? newestIncoming.participantBName
              : newestIncoming.participantAName;
          if (activeChatFriendUidRef.current === senderUid) {
            handleChatSeen(senderUid, newestIncoming.updatedAtMs);
          } else {
            soundFx.gift();
            setLatestMessageToast({
              chatId: newestIncoming.chatId,
              senderUid,
              senderName: senderName || 'صديق',
              text: newestIncoming.lastMessageText || 'رسالة جديدة',
              updatedAtMs: newestIncoming.updatedAtMs,
            });
          }
        }
      }
      const nextMap = new Map<string, number>();
      for (const t of threads) {
        nextMap.set(t.chatId, t.updatedAtMs);
      }
      prevChatUpdatedAtRef.current = nextMap;
      setDirectChats(threads);
    });
    return unsub;
  }, [profile.id, isAuthSynced, handleChatSeen]);

  const pendingAdminRequests = adminRequests.filter((r) => r.status === 'pending');
  const pendingAdminReports = adminReports.filter((r) => r.status === 'pending');
  const openAdminSupportTickets = adminSupportTickets.filter((t) => t.status === 'open');
  const repliedUserSupportTickets = userSupportTickets.filter((t) => t.status === 'replied');
  const supportBadgeCount = isAdmin
    ? openAdminSupportTickets.length
    : repliedUserSupportTickets.length;
  const incomingFriendRequestsCount = friendRequests.filter(
    (r) => r.status === 'pending' && r.toUid === profile.id
  ).length;
  const unreadFriendUids: Record<string, boolean> = {};
  for (const t of directChats) {
    if (
      t.lastSenderId &&
      t.lastSenderId !== profile.id &&
      t.updatedAtMs > (seenChatMap[t.chatId] || 0)
    ) {
      const otherUid = t.participantA === profile.id ? t.participantB : t.participantA;
      unreadFriendUids[otherUid] = true;
    }
  }
  const unreadMessagesCount = Object.keys(unreadFriendUids).length;
  const friendsTotalBadgeCount = incomingFriendRequestsCount + unreadMessagesCount;

  useEffect(() => {
    if (!connected || activeRoom) return;
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode) {
      send({ type: 'room:join', code: roomCode.trim().toUpperCase() });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [connected, activeRoom, send]);

  const handleUpdateProfile = async (patch: Partial<PlayerProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    await updateUserProfileFields(profile.id, patch);
  };

  const handleSpendCoins = async (amount: number, label: string): Promise<boolean> => {
    if (profile.coins < amount) return false;
    const nextCoins = profile.coins - amount;
    setProfile((prev) => (prev ? { ...prev, coins: nextCoins } : prev));
    await Promise.all([
      updateUserProfileFields(profile.id, { coins: nextCoins }),
      recordGiftTransaction(profile.id, label, amount).catch(() => {}),
    ]);
    return true;
  };

  const openPersistedBasicRoom = async (opts?: {
    title?: string;
    gameType?: GameType;
    isPrivate?: boolean;
  }) => {
    if (!profile.basicRoomId) return;
    const saved = await loadPersistedBasicRoom(profile.basicRoomId);
    send({
      type: 'room:create',
      tier: 'basic',
      fixedCode: profile.basicRoomId,
      title: opts?.title || saved?.title || `غرفة ${profile.name}`,
      xp: saved?.xp || 0,
      backgroundIndex: saved?.backgroundIndex || 0,
      gameType: opts?.gameType || saved?.activeGame || 'ludo',
      isPrivate: Boolean(opts?.isPrivate),
      isLocked: Boolean(saved?.isLocked),
    });
    setCreateModalOpen(false);
  };

  const handlePurchaseBasicRoomAndOpen = async (title: string) => {
    const { newCoins, room } = await purchaseBasicVoiceRoom(profile, title);
    setProfile((prev) =>
      prev ? { ...prev, coins: newCoins, basicRoomId: room.roomId } : prev
    );
    send({
      type: 'room:create',
      tier: 'basic',
      fixedCode: room.roomId,
      title: room.title,
      xp: 0,
      backgroundIndex: 0,
      gameType: 'ludo',
      isPrivate: false,
    });
    setCreateModalOpen(false);
  };

  const openAdminRequestsPanel = () => {
    if (activeRoom) setIsRoomMinimized(true);
    setAdminTab('pending');
    setActiveTab('store');
    setTimeout(() => {
      document.getElementById('admin-recharge-panel')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  };

  const openAdminReportsPanel = () => {
    if (activeRoom) setIsRoomMinimized(true);
    setActiveTab('store');
    setTimeout(() => {
      document.getElementById('admin-reports-panel')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  };

  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [dailyTasksModalOpen, setDailyTasksModalOpen] = useState(false);
  const [gameStatsModalOpen, setGameStatsModalOpen] = useState(false);
  const [dataProtectionModalOpen, setDataProtectionModalOpen] = useState(false);
  const perGameTickRef = useRef<Record<string, number>>({});

  const getDailyKey = (uid: string) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `yallaplay_daily_tasks_${uid}_${y}-${m}-${d}`;
  };

  const [dailyState, setDailyState] = useState<{
    dateKey: string;
    playSeconds: number;
    voiceSeconds: number;
    claimedTasks: Record<string, boolean>;
  }>(() => {
    const key = getDailyKey(profile.id);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          playSeconds?: number;
          voiceSeconds?: number;
          claimedTasks?: Record<string, boolean>;
        };
        return {
          dateKey: key,
          playSeconds: Number(parsed.playSeconds || 0),
          voiceSeconds: Number(parsed.voiceSeconds || 0),
          claimedTasks: parsed.claimedTasks || {},
        };
      }
    } catch {
      // Ignore storage errors
    }
    return { dateKey: key, playSeconds: 0, voiceSeconds: 0, claimedTasks: {} };
  });

  useEffect(() => {
    const key = getDailyKey(profile.id);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          playSeconds?: number;
          voiceSeconds?: number;
          claimedTasks?: Record<string, boolean>;
        };
        setDailyState({
          dateKey: key,
          playSeconds: Number(parsed.playSeconds || 0),
          voiceSeconds: Number(parsed.voiceSeconds || 0),
          claimedTasks: parsed.claimedTasks || {},
        });
      } else {
        setDailyState({ dateKey: key, playSeconds: 0, voiceSeconds: 0, claimedTasks: {} });
      }
    } catch {
      setDailyState({ dateKey: key, playSeconds: 0, voiceSeconds: 0, claimedTasks: {} });
    }
  }, [profile.id]);

  useEffect(() => {
    try {
      localStorage.setItem(
        dailyState.dateKey,
        JSON.stringify({
          playSeconds: dailyState.playSeconds,
          voiceSeconds: dailyState.voiceSeconds,
          claimedTasks: dailyState.claimedTasks,
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, [dailyState]);

  const activeRoomRef = useRef(activeRoom);
  activeRoomRef.current = activeRoom;

  useEffect(() => {
    const timer = setInterval(() => {
      const roomSnapshot = activeRoomRef.current;
      const currentKey = getDailyKey(profile.id);
      if (!roomSnapshot) {
        setDailyState((prev) =>
          prev.dateKey !== currentKey
            ? { dateKey: currentKey, playSeconds: 0, voiceSeconds: 0, claimedTasks: {} }
            : prev
        );
        return;
      }

      const g = roomSnapshot.gameType;
      const isActivelyPlaying =
        (g === 'ludo' && roomSnapshot.ludo?.phase === 'PLAYING') ||
        (g === 'snakes' && roomSnapshot.snakes?.phase === 'PLAYING') ||
        (g === 'bank' && roomSnapshot.bank?.phase === 'PLAYING') ||
        (g === 'jackaroo' && roomSnapshot.jackaroo?.phase === 'PLAYING') ||
        (g === 'draw' &&
          (roomSnapshot.draw?.phase === 'CHOOSING_WORD' ||
            roomSnapshot.draw?.phase === 'DRAWING' ||
            roomSnapshot.draw?.phase === 'ROUND_END' ||
            roomSnapshot.draw?.phase === 'FREE_DRAW')) ||
        (g === 'racing' &&
          (roomSnapshot.racing?.phase === 'COUNTDOWN' || roomSnapshot.racing?.phase === 'RACING')) ||
        (g === 'spy' &&
          (roomSnapshot.spy?.phase === 'ROLE_REVEAL' ||
            roomSnapshot.spy?.phase === 'CLUE_ROUND' ||
            roomSnapshot.spy?.phase === 'VOTING')) ||
        (g === 'trivia' &&
          (roomSnapshot.trivia?.phase === 'QUESTION' || roomSnapshot.trivia?.phase === 'REVEAL'));

      if (isActivelyPlaying) {
        const nextTicks = (perGameTickRef.current[g] || 0) + 1;
        if (nextTicks >= 6) {
          perGameTickRef.current[g] = 0;
          incrementPerGameActivity(profile.id, g, 1);
        } else {
          perGameTickRef.current[g] = nextTicks;
        }
      }

      setDailyState((prev) => {
        if (prev.dateKey !== currentKey) {
          return {
            dateKey: currentKey,
            playSeconds: isActivelyPlaying ? 10 : 0,
            voiceSeconds: 10,
            claimedTasks: {},
          };
        }
        return {
          ...prev,
          voiceSeconds: prev.voiceSeconds + 10,
          playSeconds: prev.playSeconds + (isActivelyPlaying ? 10 : 0),
        };
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [profile.id]);

  const playTimeMin = Math.floor(dailyState.playSeconds / 60);
  const voiceTimeMin = Math.floor(dailyState.voiceSeconds / 60);
  const claimedTasks = dailyState.claimedTasks;

  const handleClaimTask = async (taskId: string, rewardCoins: number) => {
    const taskDef = DAILY_TASK_DEFINITIONS.find((t) => t.id === taskId);
    if (!taskDef || dailyState.claimedTasks[taskId]) return;
    const currentMin = taskDef.category === 'play' ? playTimeMin : voiceTimeMin;
    if (currentMin < taskDef.targetMin) return;

    const newCoins = await claimDailyTaskReward(profile.id, taskDef.reward || rewardCoins);
    setDailyState((prev) => ({
      ...prev,
      claimedTasks: { ...prev.claimedTasks, [taskId]: true },
    }));
    setProfile((prev) => (prev ? { ...prev, coins: newCoins } : prev));
  };

  const isBanned = Boolean(profile.bannedUntilMs && Date.now() < profile.bannedUntilMs);
  if (isBanned && profile.bannedUntilMs) {
    const remainingMins = Math.ceil((profile.bannedUntilMs - Date.now()) / 60000);
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 text-center">
        <div className="max-w-md w-full bg-slate-900 border border-rose-800 rounded-3xl p-8 space-y-5 shadow-2xl text-white">
          <div className="w-16 h-16 rounded-2xl bg-rose-950 text-rose-500 mx-auto flex items-center justify-center font-black text-2xl">
            ⛔
          </div>
          <h2 className="text-2xl font-black text-rose-400">حسابك موقوف مؤقتاً</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            تم حظر حسابك مؤقتاً من قبل الإدارة بسبب مخالفة الشروط أو تقديم بلاغ ضدك.
          </p>
          <p className="text-xs font-mono-num text-amber-400 font-bold bg-amber-950/40 border border-amber-800 p-3 rounded-xl">
            ينتهي الحظر تلقائياً بعد حوالي {remainingMins} دقيقة.
          </p>
          <button
            type="button"
            onClick={() => signOutUser()}
            className="w-full py-3 text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex flex-col bg-[#F6F7FB] dark:bg-[#090D16] text-[#141824] dark:text-slate-100 transition-colors">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCreateRoom={() => {
          setModalInitialGame('ludo');
          setCreateModalOpen(true);
        }}
        inRoom={Boolean(activeRoom)}
        isRoomMinimized={isRoomMinimized}
        onMinimizeRoom={() => setIsRoomMinimized(true)}
        onRestoreRoom={() => setIsRoomMinimized(false)}
        onLeaveRoom={() => {
          send({ type: 'room:leave' });
          setIsRoomMinimized(false);
        }}
        supportBadgeCount={supportBadgeCount}
        friendsBadgeCount={friendsTotalBadgeCount}
      />

      {(!activeRoom || isRoomMinimized) && (
        <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2 py-2 flex items-center justify-around gap-0.5 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('rooms')}
            className={`px-2 py-1.5 rounded-md whitespace-nowrap ${
              activeTab === 'rooms'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            الغرف
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('games')}
            className={`px-2 py-1.5 rounded-md whitespace-nowrap ${
              activeTab === 'games'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            الألعاب
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('friends')}
            className={`px-2 py-1.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'friends'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <span>الأصدقاء</span>
            {friendsTotalBadgeCount > 0 && (
              <span className="px-1 py-0.5 text-[9px] leading-none rounded bg-emerald-600 text-white font-mono-num">
                {friendsTotalBadgeCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('store')}
            className={`px-2 py-1.5 rounded-md whitespace-nowrap ${
              activeTab === 'store'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            المتجر
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('support')}
            className={`px-2 py-1.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'support'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <span>الدعم</span>
            {supportBadgeCount > 0 && (
              <span className="px-1 py-0.5 text-[9px] leading-none rounded bg-emerald-600 text-white font-mono-num">
                {supportBadgeCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-2 py-1.5 rounded-md whitespace-nowrap ${
              activeTab === 'profile'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            ملفي
          </button>
        </div>
      )}

      {/* Real-time Admin Pending Recharge Requests Notification Banner */}
      {isAdmin && pendingAdminRequests.length > 0 && !dismissedPendingToast && (
        <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-100">
              <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-mono-num">
                إشعار الأدمن: يوجد {pendingAdminRequests.length} طلب شحن معلق بانتظار المراجعة
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openAdminRequestsPanel}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg cursor-pointer whitespace-nowrap"
              >
                مراجعة الطلبات المعلقة
              </button>
              <button
                type="button"
                aria-label="إغلاق الإشعار"
                onClick={() => setDismissedPendingToast(true)}
                className="p-1 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Admin Pending Reports Notification Banner */}
      {isAdmin && pendingAdminReports.length > 0 && !dismissedReportsToast && (
        <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-700 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-rose-950 dark:text-rose-100">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span className="font-mono-num">
                بلاغات جديدة: يوجد {pendingAdminReports.length} بلاغ من اللاعبين بانتظار المراجعة وتطبيق الحظر المؤقت
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openAdminReportsPanel}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
              >
                مراجعة البلاغات والحظر
              </button>
              <button
                type="button"
                aria-label="إغلاق إشعار البلاغات"
                onClick={() => setDismissedReportsToast(true)}
                className="p-1 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Admin Pending Support Tickets Notification Banner */}
      {isAdmin && openAdminSupportTickets.length > 0 && !dismissedSupportToast && (
        <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-300 dark:border-indigo-700 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-indigo-950 dark:text-indigo-100">
              <Headphones className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="font-mono-num">
                رسائل الدعم والشكاوى: يوجد {openAdminSupportTickets.length} طلب بانتظار الرد
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (activeRoom) setIsRoomMinimized(true);
                  setActiveTab('support');
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
              >
                فتح صندوق الرسائل
              </button>
              <button
                type="button"
                aria-label="إغلاق إشعار الدعم"
                onClick={() => setDismissedSupportToast(true)}
                className="p-1 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time User Support Reply Notification Banner */}
      {!isAdmin &&
        repliedUserSupportTickets.length > 0 &&
        !dismissedUserReplyToast &&
        activeTab !== 'support' && (
          <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-3">
            <div className="bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-100">
                <Headphones className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-mono-num">
                  تم الرد على {repliedUserSupportTickets.length} طلب دعم (#{repliedUserSupportTickets[0].ticketNumber}) من قِبل الإدارة
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (activeRoom) setIsRoomMinimized(true);
                    setActiveTab('support');
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  عرض الرد
                </button>
                <button
                  type="button"
                  aria-label="إغلاق الإشعار"
                  onClick={() => setDismissedUserReplyToast(true)}
                  className="p-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Real-time New Direct Message Notification Banner */}
      {latestMessageToast && (
        <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-100 min-w-0 flex-1">
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">
                رسالة جديدة من {latestMessageToast.senderName}: «{latestMessageToast.text}»
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  soundFx.tap();
                  const targetUid = latestMessageToast.senderUid;
                  handleChatSeen(targetUid, latestMessageToast.updatedAtMs);
                  setTargetFriendChatUid(targetUid);
                  setLatestMessageToast(null);
                  if (activeRoom && !isRoomMinimized) {
                    setFriendsModalOpen(true);
                  } else {
                    setActiveTab('friends');
                  }
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer whitespace-nowrap shadow-2xs"
              >
                فتح المحادثة
              </button>
              <button
                type="button"
                aria-label="إغلاق تنبيه الرسالة"
                onClick={() => setLatestMessageToast(null)}
                className="p-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Incoming Friend Requests Notification Banner */}
      {(!activeRoom || isRoomMinimized) &&
        activeTab !== 'friends' &&
        incomingFriendRequestsCount > 0 &&
        !dismissedFriendsToast && (
          <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-3">
            <div className="bg-blue-50 dark:bg-blue-950/70 border border-blue-300 dark:border-blue-700 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-blue-950 dark:text-blue-100">
                <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-mono-num">
                  لديك {incomingFriendRequestsCount} طلب صداقة جديد بانتظار القبول
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('friends')}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  عرض طلبات الصداقة
                </button>
                <button
                  type="button"
                  aria-label="إغلاق إشعار الصداقة"
                  onClick={() => setDismissedFriendsToast(true)}
                  className="p-1 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Real-time User Recharge Approval/Rejection Toast */}
      {userAlert && (
        <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm font-bold">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{userAlert}</span>
            </div>
            <button
              type="button"
              aria-label="إغلاق"
              onClick={() => setUserAlert(null)}
              className="p-1 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* App Update Notification Banner */}
      {releaseInfo && (updateAvailable || showWhatsNewBanner) && (
        <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div
            className={`rounded-xl px-4 py-2.5 border space-y-2 ${
              updateAvailable
                ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100'
                : 'bg-blue-50 dark:bg-blue-950/70 border-blue-200 dark:border-blue-800 text-blue-950 dark:text-blue-100'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold min-w-0">
                <Sparkles
                  className={`w-4 h-4 shrink-0 ${
                    updateAvailable
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                />
                <span className="truncate">
                  {updateAvailable
                    ? `يتوفر تحديث جديد (${releaseInfo.titleAr}) — حدّث الصفحة لتفعيل المزايا الجديدة`
                    : `${releaseInfo.titleAr}: تم تحسين تصميم الميكات وعرض الألعاب`}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    setWhatsNewExpanded((v) => !v);
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white/80 dark:bg-slate-900/80 border border-current/15 hover:bg-white dark:hover:bg-slate-900 cursor-pointer whitespace-nowrap"
                >
                  {whatsNewExpanded ? 'إخفاء التفاصيل' : 'ما الجديد؟'}
                </button>

                {updateAvailable ? (
                  <button
                    type="button"
                    onClick={handleApplyUpdate}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تحديث الآن</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="إغلاق إشعار التحديث"
                    onClick={dismissWhatsNew}
                    className="p-1 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {whatsNewExpanded && (
              <ul className="pt-2 border-t border-current/10 space-y-1 text-xs opacity-90">
                {releaseInfo.highlights.map((line, idx) => (
                  <li key={idx}>· {line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-sm font-semibold px-4 py-2.5 rounded-lg">
            {errorMsg}
          </div>
        </div>
      )}

      <div className={`flex-1 ${activeRoom && isRoomMinimized ? 'pb-24' : ''}`}>
        {activeRoom && (
          <div className={isRoomMinimized ? 'hidden' : 'block'}>
            <RoomArena
              room={activeRoom}
              profile={profile}
              theme={theme}
              connected={connected}
              onToggleTheme={onToggleTheme}
              onSpendCoins={handleSpendCoins}
              onGoToStore={() => {
                setIsRoomMinimized(true);
                setActiveTab('store');
              }}
              send={send}
              onLeaveRoom={() => {
                send({ type: 'room:leave' });
                setIsRoomMinimized(false);
              }}
              onMinimizeRoom={() => setIsRoomMinimized(true)}
              friendsBadgeCount={friendsTotalBadgeCount}
              onOpenFriendsModal={() => setFriendsModalOpen(true)}
            />
          </div>
        )}

        {(!activeRoom || isRoomMinimized) && (
          activeTab === 'store' ? (
            <StoreView
              profile={profile}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onUpdateCoins={(newCoins, newBasicRoomId) =>
                setProfile((prev) =>
                  prev
                    ? {
                        ...prev,
                        coins: newCoins,
                        basicRoomId: newBasicRoomId ?? prev.basicRoomId,
                      }
                    : prev
                )
              }
              onEnterBasicRoom={() => openPersistedBasicRoom()}
              userRequests={userRequests}
              adminRequests={adminRequests}
              adminInitialTab={adminTab}
              onAdminTabChange={setAdminTab}
            />
          ) : activeTab === 'support' ? (
            <SupportCenterView
              profile={profile}
              tickets={userSupportTickets}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onProfileUsernameSynced={(u) =>
                setProfile((prev) => (prev ? { ...prev, username: u } : prev))
              }
            />
          ) : activeTab === 'friends' ? (
            <FriendsView
              profile={profile}
              friendRequests={friendRequests}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onJoinRoom={(code) => {
                if (activeRoom && activeRoom.code === code) {
                  setIsRoomMinimized(false);
                } else {
                  setIsRoomMinimized(false);
                  send({ type: 'room:join', code });
                }
              }}
              initialFriendUid={targetFriendChatUid}
              onConsumedInitialFriend={() => setTargetFriendChatUid(null)}
              unreadByFriendUid={unreadFriendUids}
              onChatSeen={handleChatSeen}
              onActiveFriendChange={handleActiveFriendChange}
              presenceMap={presenceMap}
              onWatchPresence={watchPresence}
            />
          ) : activeTab === 'profile' ? (
            <ProfileView
              profile={profile}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onUpdateProfile={handleUpdateProfile}
              onGoToStore={() => setActiveTab('store')}
              onOpenAdminPanel={isAdmin ? openAdminRequestsPanel : undefined}
              pendingAdminCount={pendingAdminRequests.length}
              onEnterBasicRoom={() => openPersistedBasicRoom()}
              onOpenDailyTasks={() => setDailyTasksModalOpen(true)}
              onOpenGameStats={() => setGameStatsModalOpen(true)}
              onOpenDataProtection={() => setDataProtectionModalOpen(true)}
              onOpenSupport={() => setActiveTab('support')}
              supportRepliedCount={repliedUserSupportTickets.length}
              playTimeMin={playTimeMin}
              voiceTimeMin={voiceTimeMin}
              claimedTasks={claimedTasks}
              onClaimTask={handleClaimTask}
              releaseInfo={releaseInfo}
              updateAvailable={updateAvailable}
              onCheckForUpdates={checkForUpdates}
              onApplyUpdate={handleApplyUpdate}
            />
          ) : (
            <LobbyView
              mode={activeTab === 'games' ? 'games' : 'rooms'}
              profile={profile}
              rooms={rooms}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onJoinRoom={(code) => {
                if (activeRoom && activeRoom.code === code) {
                  setIsRoomMinimized(false);
                } else {
                  setIsRoomMinimized(false);
                  send({ type: 'room:join', code });
                }
              }}
              onOpenBasicRoom={() => openPersistedBasicRoom()}
              onOpenCreateRoom={(gt = 'ludo') => {
                setModalInitialGame(gt);
                setCreateModalOpen(true);
              }}
              onOpenFriends={() => setActiveTab('friends')}
              onOpenGameStats={() => setGameStatsModalOpen(true)}
              onOpenDataProtection={() => setDataProtectionModalOpen(true)}
            />
          )
        )}
      </div>

      {/* Persistent Floating Minimized Room Bar */}
      {activeRoom && isRoomMinimized && (() => {
        const mySeat = activeRoom.seats.find((s) => s.playerId === profile.id);
        const seatedCount = activeRoom.seats.filter((s) => s.playerId).length;
        return (
          <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:w-[410px] max-w-[calc(100vw-24px)] z-40">
            <div className="bg-[#141824]/95 dark:bg-slate-900/95 backdrop-blur border border-blue-500/40 text-white rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="relative w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-400/40 flex items-center justify-center shrink-0">
                  {mySeat ? (
                    mySeat.isMuted ? (
                      <MicOff className="w-4 h-4 text-slate-300" />
                    ) : (
                      <Mic className="w-4 h-4 text-emerald-400" />
                    )
                  ) : (
                    <Headphones className="w-4 h-4 text-blue-300" />
                  )}
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold truncate">{activeRoom.title}</p>
                  <p className="text-[10px] text-slate-300 font-mono-num truncate">
                    {activeRoom.code} · {seatedCount} على المايك ·{' '}
                    {mySeat
                      ? mySeat.isMuted
                        ? 'مايك مكتوم'
                        : 'متصل بالمايك'
                      : 'مستمع بالغرفة'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    setIsRoomMinimized(false);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-extrabold bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer whitespace-nowrap"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>العودة</span>
                </button>
                <button
                  type="button"
                  title="مغادرة الغرفة"
                  aria-label="مغادرة الغرفة"
                  onClick={() => {
                    soundFx.tap();
                    send({ type: 'room:leave' });
                    setIsRoomMinimized(false);
                  }}
                  className="p-1.5 text-rose-300 bg-rose-500/15 hover:bg-rose-500/30 rounded-xl cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {createModalOpen && (
        <CreateRoomModal
          initialGame={modalInitialGame}
          profile={profile}
          onClose={() => setCreateModalOpen(false)}
          onCreateFreeRoom={(opts) => {
            send({
              type: 'room:create',
              tier: 'free',
              title: opts.title,
              gameType: opts.gameType,
              isPrivate: opts.isPrivate,
            });
            setCreateModalOpen(false);
          }}
          onOpenBasicRoom={(opts) => openPersistedBasicRoom(opts)}
          onPurchaseBasicRoom={handlePurchaseBasicRoomAndOpen}
          onGoToStore={() => setActiveTab('store')}
        />
      )}

      {friendsModalOpen && (
        <FriendsModal
          profile={profile}
          onClose={() => setFriendsModalOpen(false)}
          onJoinRoom={(code) => {
            setFriendsModalOpen(false);
            if (activeRoom && activeRoom.code === code) {
              setIsRoomMinimized(false);
            } else {
              setIsRoomMinimized(false);
              send({ type: 'room:join', code });
            }
          }}
          initialFriendUid={targetFriendChatUid}
          onConsumedInitialFriend={() => setTargetFriendChatUid(null)}
          unreadByFriendUid={unreadFriendUids}
          onChatSeen={handleChatSeen}
          onActiveFriendChange={handleActiveFriendChange}
          presenceMap={presenceMap}
          onWatchPresence={watchPresence}
        />
      )}

      {dailyTasksModalOpen && (
        <DailyTasksModal
          profile={profile}
          playTimeMin={playTimeMin}
          voiceTimeMin={voiceTimeMin}
          claimedTasks={claimedTasks}
          onClaimTask={handleClaimTask}
          onClose={() => setDailyTasksModalOpen(false)}
        />
      )}

      {gameStatsModalOpen && (
        <GameStatsModal
          profile={profile}
          playTimeMin={playTimeMin}
          voiceTimeMin={voiceTimeMin}
          onClose={() => setGameStatsModalOpen(false)}
        />
      )}

      {dataProtectionModalOpen && (
        <DataProtectionModal
          profile={profile}
          onUpdatePrivacy={handleUpdateProfile}
          onSecureSignOut={async () => {
            if (activeRoom) send({ type: 'room:leave' });
            await signOutUser();
          }}
          onOpenSupport={() => {
            if (activeRoom) setIsRoomMinimized(true);
            setActiveTab('support');
          }}
          onClose={() => setDataProtectionModalOpen(false)}
        />
      )}

      {lockPrompt && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-pin-title"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!roomPinInput.trim()) return;
              soundFx.tap();
              send({
                type: 'room:join',
                code: lockPrompt.code,
                pin: roomPinInput.trim(),
              });
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="room-pin-title" className="text-sm font-extrabold text-[#141824] dark:text-white">
                    الغرفة مقفلة برمز سري
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                    {lockPrompt.title} ({lockPrompt.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="إغلاق"
                onClick={() => {
                  setRoomPinInput('');
                  clearLockPrompt();
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {lockPrompt.wrongPin && (
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 px-3 py-2 rounded-lg">
                رمز الدخول غير صحيح، حاول مرة أخرى.
              </p>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="room-pin-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                أدخل رمز الدخول للغرفة
              </label>
              <input
                id="room-pin-input"
                type="password"
                autoFocus
                value={roomPinInput}
                onChange={(e) => setRoomPinInput(e.target.value)}
                placeholder="رمز قفل الغرفة"
                maxLength={16}
                dir="ltr"
                className="w-full px-3.5 py-2.5 text-sm font-mono-num text-center border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRoomPinInput('');
                  clearLockPrompt();
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                دخول الغرفة
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [authReady, setAuthReady] = useState(false);
  const [authSwitching, setAuthSwitching] = useState(false);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const inFlightProfileRef = useRef<{ uid: string; promise: Promise<PlayerProfile> } | null>(null);
  const activeUidRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const hydrateUserProfile = useCallback(async (user: User) => {
    if (activeUidRef.current && activeUidRef.current !== user.uid) {
      teardownAllFirestoreListeners();
      setProfile(null);
    }
    activeUidRef.current = user.uid;

    let promise: Promise<PlayerProfile>;
    if (inFlightProfileRef.current?.uid === user.uid) {
      promise = inFlightProfileRef.current.promise;
    } else {
      promise = ensureUserProfile(user);
      inFlightProfileRef.current = { uid: user.uid, promise };
    }

    try {
      const loaded = await promise;
      if (auth.currentUser?.uid !== user.uid) {
        return;
      }
      setProfile(loaded);
      setAuthError(null);
    } catch (err) {
      if (auth.currentUser?.uid === user.uid) {
        setAuthError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الحساب');
      }
    } finally {
      if (inFlightProfileRef.current?.uid === user.uid) {
        inFlightProfileRef.current = null;
      }
      setAuthSwitching(false);
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const safetyTimer = setTimeout(() => {
      if (mounted) setAuthReady(true);
    }, 5000);

    const unsubTransition = onAuthTransition((phase) => {
      if (!mounted) return;
      if (phase === 'signout') {
        activeUidRef.current = null;
        inFlightProfileRef.current = null;
        setAuthSwitching(false);
        setProfile(null);
        setAuthError(null);
      } else if (phase === 'switch') {
        setAuthSwitching(true);
      } else if (phase === 'restore') {
        setAuthSwitching(false);
      }
    });

    Promise.allSettled([auth.authStateReady(), checkGoogleRedirectResult()]).then(([, redirectRes]) => {
      if (!mounted) return;
      if (redirectRes.status === 'fulfilled' && redirectRes.value) {
        void hydrateUserProfile(redirectRes.value);
      } else if (!auth.currentUser) {
        setAuthReady(true);
      }
    });

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!mounted) return;
      if (!user) {
        teardownAllFirestoreListeners();
        activeUidRef.current = null;
        inFlightProfileRef.current = null;
        setAuthSwitching(false);
        setProfile(null);
        setAuthError(null);
        setAuthReady(true);
        return;
      }
      void hydrateUserProfile(user);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      unsubTransition();
      unsub();
    };
  }, [hydrateUserProfile]);

  if (!authReady || authSwitching) {
    return (
      <div className="min-h-screen bg-[#F6F7FB] dark:bg-[#090D16] flex items-center justify-center p-6">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
          {authSwitching ? 'جاري تبديل حساب Google...' : 'جاري التحقق من حساب Google...'}
        </p>
      </div>
    );
  }

  if (authError && !profile) {
    return (
      <div className="min-h-screen bg-[#F6F7FB] dark:bg-[#090D16] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 text-center space-y-4">
          <h1 className="text-lg font-extrabold text-[#141824] dark:text-white">
            خطأ في تهيئة الحساب
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 break-words leading-relaxed">
            {authError}
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                if (auth.currentUser) {
                  void hydrateUserProfile(auth.currentUser);
                }
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
            >
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                void signOutUser();
              }}
              className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {profile ? (
        <MainShell
          key={profile.id}
          profile={profile || GUEST_FALLBACK}
          setProfile={setProfile}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <LoginScreen
          onSignedIn={hydrateUserProfile}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
    </ErrorBoundary>
  );
}
