import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  Crown,
  Inbox,
  MessageCircle,
  Moon,
  Search,
  Send,
  Sun,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  acceptFriendRequest,
  declineOrCancelFriendRequest,
  fetchFriends,
  fetchProfilesByIds,
  fetchSuggestedPlayers,
  getDirectChatId,
  markDirectMessagesRead,
  removeMutualFriend,
  searchUserByUsername,
  sendDirectMessage,
  sendFriendRequest,
  subscribeDirectMessages,
  subscribeUserDirectChats,
} from '../firebase';
import type {
  DirectChatThread,
  DirectMessage,
  FriendRequest,
  PlayerProfile,
  UserPresenceInfo,
} from '../shared/types';
import { soundFx } from '../utils/sound';
import { AvatarBadge } from './Avatars';

interface FriendsViewProps {
  profile: PlayerProfile;
  friendRequests: FriendRequest[];
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onJoinRoom: (code: string) => void;
  initialFriendUid?: string | null;
  onConsumedInitialFriend?: () => void;
  unreadByFriendUid?: Record<string, boolean>;
  onChatSeen?: (friendUid: string, seenAtMs?: number) => void;
  onActiveFriendChange?: (friendUid: string | null) => void;
  presenceMap?: Record<string, UserPresenceInfo>;
  onWatchPresence?: (uids: string[]) => void;
}

type FriendsSubTab = 'friends' | 'requests' | 'add';

function formatMessageTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatPresenceStatus(info?: UserPresenceInfo): {
  label: string;
  isOnline: boolean;
  inRoom: boolean;
  dotClass: string;
  textClass: string;
} {
  if (info?.status === 'in_room') {
    return {
      label: info.roomTitle ? `في غرفة: ${info.roomTitle}` : 'داخل غرفة صوتية الآن',
      isOnline: true,
      inRoom: true,
      dotClass: 'bg-blue-500',
      textClass: 'text-blue-600 dark:text-blue-400 font-bold',
    };
  }
  if (info?.status === 'online') {
    return {
      label: 'متصل الآن',
      isOnline: true,
      inRoom: false,
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-600 dark:text-emerald-400 font-bold',
    };
  }
  if (info?.lastSeenMs && info.lastSeenMs > 0) {
    const mins = Math.max(0, Math.floor((Date.now() - info.lastSeenMs) / 60000));
    const agoText =
      mins < 1
        ? 'آخر ظهور منذ لحظات'
        : mins < 60
          ? `آخر ظهور منذ ${mins} د`
          : `آخر ظهور منذ ${Math.floor(mins / 60)} س`;
    return {
      label: agoText,
      isOnline: false,
      inRoom: false,
      dotClass: 'bg-slate-400',
      textClass: 'text-slate-400 dark:text-slate-500',
    };
  }
  return {
    label: 'غير متصل',
    isOnline: false,
    inRoom: false,
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-400 dark:text-slate-500',
  };
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  profile,
  friendRequests,
  theme,
  onToggleTheme,
  onJoinRoom,
  initialFriendUid,
  onConsumedInitialFriend,
  unreadByFriendUid = {},
  onChatSeen,
  onActiveFriendChange,
  presenceMap = {},
  onWatchPresence,
}) => {
  const incomingRequests = useMemo(
    () => friendRequests.filter((r) => r.status === 'pending' && r.toUid === profile.id),
    [friendRequests, profile.id]
  );
  const outgoingRequests = useMemo(
    () => friendRequests.filter((r) => r.status === 'pending' && r.fromUid === profile.id),
    [friendRequests, profile.id]
  );
  const acceptedRequestDocs = useMemo(
    () => friendRequests.filter((r) => r.status === 'accepted'),
    [friendRequests]
  );

  const [subTab, setSubTab] = useState<FriendsSubTab>(
    incomingRequests.length > 0 ? 'requests' : 'friends'
  );
  const [friends, setFriends] = useState<PlayerProfile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [friendFilter, setFriendFilter] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<PlayerProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [suggestedPlayers, setSuggestedPlayers] = useState<PlayerProfile[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const [threads, setThreads] = useState<DirectChatThread[]>([]);
  const [activeFriend, setActiveFriend] = useState<PlayerProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<DirectMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadAllFriends = async () => {
    setLoadingFriends(true);
    try {
      const legacyFriends = await fetchFriends(profile.id);
      const acceptedOtherIds = acceptedRequestDocs.map((r) =>
        r.fromUid === profile.id ? r.toUid : r.fromUid
      );
      const missingIds = acceptedOtherIds.filter(
        (uid) => !legacyFriends.some((f) => f.id === uid)
      );
      const fetchedAccepted = missingIds.length > 0 ? await fetchProfilesByIds(missingIds) : [];

      // Fallback from request metadata if user doc wasn't fetched
      const combined = [...legacyFriends];
      for (const uid of acceptedOtherIds) {
        if (combined.some((f) => f.id === uid)) continue;
        const foundProfile = fetchedAccepted.find((p) => p.id === uid);
        if (foundProfile) {
          combined.push(foundProfile);
        } else {
          const req = acceptedRequestDocs.find(
            (r) => r.fromUid === uid || r.toUid === uid
          );
          if (req) {
            const isFrom = req.fromUid === uid;
            combined.push({
              id: uid,
              name: isFrom ? req.fromName : req.toName,
              username: isFrom ? req.fromUsername : req.toUsername,
              avatar: isFrom ? req.fromAvatar : req.toAvatar,
              bio: '',
              coins: 0,
              wins: 0,
              gamesPlayed: 0,
              basicRoomId: '',
            });
          }
        }
      }
      setFriends(combined);
    } catch {
      // Handled gracefully
    } finally {
      setLoadingFriends(false);
    }
  };

  useEffect(() => {
    void loadAllFriends();
  }, [profile.id, acceptedRequestDocs.length]);

  useEffect(() => {
    if (!onWatchPresence) return;
    const ids = friends.map((f) => f.id);
    if (activeFriend && !ids.includes(activeFriend.id)) {
      ids.push(activeFriend.id);
    }
    if (ids.length > 0) {
      onWatchPresence(ids);
    }
  }, [friends, activeFriend?.id, onWatchPresence]);

  useEffect(() => {
    const unsub = subscribeUserDirectChats(profile.id, (list) => {
      setThreads(list);
    });
    return unsub;
  }, [profile.id]);

  useEffect(() => {
    if (subTab !== 'add') return;
    let active = true;
    setLoadingSuggested(true);
    fetchSuggestedPlayers(profile.id)
      .then((list) => {
        if (active) setSuggestedPlayers(list);
      })
      .finally(() => {
        if (active) setLoadingSuggested(false);
      });
    return () => {
      active = false;
    };
  }, [subTab, profile.id]);

  useEffect(() => {
    if (!activeFriend) {
      setChatMessages([]);
      return;
    }
    setChatLoading(true);
    const unsub = subscribeDirectMessages(
      profile.id,
      activeFriend.id,
      (msgs) => {
        setChatMessages(msgs);
        setChatLoading(false);
      },
      () => {
        setChatLoading(false);
        setNotice('تعذر تحميل رسائل الدردشة المباشرة');
      }
    );
    return unsub;
  }, [profile.id, activeFriend?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length, activeFriend?.id]);

  useEffect(() => {
    onActiveFriendChange?.(activeFriend?.id ?? null);
    return () => {
      onActiveFriendChange?.(null);
    };
  }, [activeFriend?.id, onActiveFriendChange]);

  useEffect(() => {
    if (!initialFriendUid) return;
    let active = true;
    const found = friends.find((f) => f.id === initialFriendUid);
    if (found) {
      setSubTab('friends');
      setActiveFriend(found);
      onChatSeen?.(found.id);
      onConsumedInitialFriend?.();
      return;
    }
    if (!loadingFriends) {
      fetchProfilesByIds([initialFriendUid])
        .then((profiles) => {
          if (!active) return;
          if (profiles[0]) {
            setSubTab('friends');
            setActiveFriend(profiles[0]);
            onChatSeen?.(profiles[0].id);
          }
          onConsumedInitialFriend?.();
        })
        .catch(() => {
          if (active) onConsumedInitialFriend?.();
        });
    }
    return () => {
      active = false;
    };
  }, [initialFriendUid, friends, loadingFriends, onChatSeen, onConsumedInitialFriend]);

  useEffect(() => {
    if (!activeFriend) return;
    const latestTs =
      chatMessages.length > 0
        ? Math.max(...chatMessages.map((m) => m.createdAtMs || 0))
        : Date.now();
    onChatSeen?.(activeFriend.id, latestTs);
    const hasUnread = chatMessages.some(
      (m) => m.receiverId === profile.id && m.senderId === activeFriend.id && !(m.readAtMs && m.readAtMs > 0)
    );
    if (hasUnread) {
      void markDirectMessagesRead(profile.id, activeFriend.id, chatMessages);
    }
  }, [activeFriend?.id, profile.id, chatMessages, onChatSeen]);

  const threadByFriendId = useMemo(() => {
    const map = new Map<string, DirectChatThread>();
    for (const f of friends) {
      const cid = getDirectChatId(profile.id, f.id);
      const found = threads.find((t) => t.chatId === cid);
      if (found) map.set(f.id, found);
    }
    return map;
  }, [friends, threads, profile.id]);

  const filteredFriends = useMemo(() => {
    const q = friendFilter.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.username || '').toLowerCase().includes(q)
    );
  }, [friends, friendFilter]);

  const getRelationWith = (
    targetUid: string
  ):
    | { kind: 'friend' }
    | { kind: 'incoming'; req: FriendRequest }
    | { kind: 'outgoing'; req: FriendRequest }
    | { kind: 'none' } => {
    if (friends.some((f) => f.id === targetUid)) return { kind: 'friend' };
    const inc = incomingRequests.find((r) => r.fromUid === targetUid);
    if (inc) return { kind: 'incoming', req: inc };
    const out = outgoingRequests.find((r) => r.toUid === targetUid);
    if (out) return { kind: 'outgoing', req: out };
    return { kind: 'none' };
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchQuery.trim().replace(/^@+/, '').toLowerCase();
    if (!clean) return;
    setSearching(true);
    setSearchResult(null);
    soundFx.tap();
    try {
      const user = await searchUserByUsername(clean);
      if (!user) {
        setNotice('لم يتم العثور على مستخدم بهذا اليوزرنيم');
      } else if (user.id === profile.id) {
        setNotice('لا يمكنك إرسال طلب صداقة لنفسك');
      } else {
        setSearchResult(user);
        setNotice(null);
      }
    } catch {
      setNotice('حدث خطأ أثناء البحث عن اللاعب');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (target: PlayerProfile) => {
    soundFx.tap();
    setBusyUid(target.id);
    try {
      const result = await sendFriendRequest(profile, target);
      soundFx.correct();
      if (result === 'accepted') {
        setNotice(`تم قبول طلب الصداقة تلقائياً وأصبح ${target.name} صديقك الآن!`);
      } else if (result === 'already_friends') {
        setNotice(`${target.name} موجود بالفعل في قائمة أصدقائك`);
      } else if (result === 'already_sent') {
        setNotice(`تم إرسال طلب صداقة مسبقاً إلى ${target.name} وبانتظار قبوله`);
      } else {
        setNotice(`تم إرسال طلب الصداقة إلى ${target.name} بنجاح!`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('إيقاف') || msg.includes('أوقف') || msg.includes('الخصوصية')) {
        setNotice(msg);
      } else if (msg.includes('جلسة الدخول')) {
        setNotice('انتهت جلسة الدخول، يرجى إعادة تسجيل الدخول بحساب Google');
      } else if (msg.includes('offline') || msg.includes('network')) {
        setNotice('تعذر الاتصال بالخادم، تأكد من اتصالك بالإنترنت وحاول مرة أخرى');
      } else {
        setNotice('تعذر إرسال طلب الصداقة، حاول مرة أخرى');
      }
    } finally {
      setBusyUid(null);
    }
  };

  const handleAcceptRequest = async (req: FriendRequest) => {
    soundFx.tap();
    setBusyUid(req.fromUid);
    try {
      await acceptFriendRequest(req, profile);
      soundFx.win();
      setNotice(`تم قبول طلب صداقة ${req.fromName} بنجاح!`);
      await loadAllFriends();
    } catch {
      setNotice('تعذر قبول طلب الصداقة، حاول مرة أخرى');
    } finally {
      setBusyUid(null);
    }
  };

  const handleDeclineOrCancel = async (req: FriendRequest, isIncoming: boolean) => {
    soundFx.tap();
    setBusyUid(isIncoming ? req.fromUid : req.toUid);
    try {
      await declineOrCancelFriendRequest(req.requestId);
      setNotice(isIncoming ? 'تم رفض طلب الصداقة' : 'تم إلغاء طلب الصداقة');
    } catch {
      setNotice('تعذر تنفيذ العملية');
    } finally {
      setBusyUid(null);
    }
  };

  const handleRemoveFriend = async (friendUid: string) => {
    soundFx.tap();
    setBusyUid(friendUid);
    try {
      await removeMutualFriend(profile.id, friendUid);
      soundFx.correct();
      setFriends((prev) => prev.filter((f) => f.id !== friendUid));
      if (activeFriend?.id === friendUid) setActiveFriend(null);
      setNotice('تمت إزالة الصديق بنجاح');
    } catch {
      setNotice('تعذر إزالة الصديق');
    } finally {
      setBusyUid(null);
    }
  };

  const handleSendDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFriend || !messageInput.trim() || sending) return;
    const text = messageInput.trim();
    setMessageInput('');
    setSending(true);
    soundFx.tap();
    try {
      await sendDirectMessage({
        sender: profile,
        receiver: activeFriend,
        text,
      });
    } catch {
      setNotice('تعذر إرسال الرسالة، تأكد من اتصالك بالإنترنت');
      setMessageInput(text);
    } finally {
      setSending(false);
    }
  };

  const renderUserCardAction = (target: PlayerProfile) => {
    const rel = getRelationWith(target.id);
    const isBusy = busyUid === target.id;
    if (rel.kind === 'friend') {
      return (
        <button
          type="button"
          onClick={() => {
            soundFx.tap();
            setActiveFriend(target);
            setSubTab('friends');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 rounded-lg cursor-pointer shrink-0 whitespace-nowrap"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>مراسلة</span>
        </button>
      );
    }
    if (rel.kind === 'incoming') {
      return (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleAcceptRequest(rel.req)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer shrink-0 whitespace-nowrap"
        >
          <Check className="w-3.5 h-3.5" />
          <span>قبول الطلب</span>
        </button>
      );
    }
    if (rel.kind === 'outgoing') {
      return (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleDeclineOrCancel(rel.req, false)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 rounded-lg cursor-pointer shrink-0 whitespace-nowrap"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>تم الإرسال · إلغاء</span>
        </button>
      );
    }
    if (target.privacyBlockFriendRequests) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 whitespace-nowrap">
          الخصوصية مفعّلة
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={isBusy}
        onClick={() => handleSendRequest(target)}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg cursor-pointer shrink-0 whitespace-nowrap shadow-2xs"
      >
        <UserPlus className="w-3.5 h-3.5" />
        <span>إرسال طلب صداقة</span>
      </button>
    );
  };

  return (
    <main className="max-w-5xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
            <Users className="w-4 h-4" />
            <span>قائمة الأصدقاء وطلبات الصداقة</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141824] dark:text-white">
            الأصدقاء والدردشة المباشرة
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            أضف أصدقاء جدد، اقبل طلبات الصداقة الواردة، وابدأ محادثات خاصة فورية
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
          <span>{theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>
        </button>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-slate-200/75 dark:bg-slate-800 rounded-xl w-full sm:w-auto">
        <button
          type="button"
          onClick={() => {
            soundFx.tap();
            setSubTab('friends');
          }}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold rounded-lg transition-colors cursor-pointer min-w-0 ${
            subTab === 'friends'
              ? 'bg-white dark:bg-slate-900 text-[#141824] dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">أصدقائي ({friends.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            soundFx.tap();
            setSubTab('requests');
          }}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold rounded-lg transition-colors cursor-pointer min-w-0 ${
            subTab === 'requests'
              ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
          }`}
        >
          <Inbox className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">الطلبات</span>
          {incomingRequests.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] leading-none font-extrabold rounded bg-emerald-600 text-white font-mono-num shrink-0">
              {incomingRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundFx.tap();
            setSubTab('add');
          }}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-extrabold rounded-lg transition-colors cursor-pointer min-w-0 ${
            subTab === 'add'
              ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">إضافة أصدقاء</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs font-semibold rounded-xl flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-blue-600 dark:text-blue-300 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: FRIENDS & DIRECT CHAT */}
      {subTab === 'friends' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Friends List Column */}
          <section
            className={`lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5 ${
              activeFriend ? 'hidden lg:block' : 'block'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-[#141824] dark:text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600" />
                <span>قائمة الأصدقاء ({friends.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => setSubTab('add')}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>إضافة صديق</span>
              </button>
            </div>

            {friends.length > 2 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={friendFilter}
                  onChange={(e) => setFriendFilter(e.target.value)}
                  placeholder="تصفية الأصدقاء..."
                  className="w-full pr-8 pl-3 py-2 text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600"
                />
              </div>
            )}

            {loadingFriends ? (
              <p className="text-xs text-slate-400 text-center py-10">جاري تحميل الأصدقاء...</p>
            ) : filteredFriends.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <Users className="w-9 h-9 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {friends.length === 0
                    ? 'لا يوجد لديك أصدقاء بعد'
                    : 'لا توجد نتائج مطابقة للبحث'}
                </p>
                {friends.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setSubTab('add')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>ابحث وأرسل طلب صداقة</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-0.5">
                {filteredFriends.map((friend) => {
                  const lastThread = threadByFriendId.get(friend.id);
                  const isSelected = activeFriend?.id === friend.id;
                  const hasUnread = Boolean(unreadByFriendUid[friend.id]) && !isSelected;
                  const pres = presenceMap[friend.id];
                  const presUI = formatPresenceStatus(pres);
                  const joinableCode =
                    pres?.status === 'in_room' && !pres.isRoomPrivate && !pres.isRoomLocked && pres.roomCode
                      ? pres.roomCode
                      : friend.basicRoomId || '';
                  return (
                    <div
                      key={friend.id}
                      className={`p-3 border rounded-xl flex items-center justify-between gap-2.5 transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                          : hasUnread
                            ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.tap();
                          setActiveFriend(friend);
                          onChatSeen?.(friend.id, lastThread?.updatedAtMs || Date.now());
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-right cursor-pointer"
                      >
                        <div className="relative shrink-0">
                          <AvatarBadge avatarId={friend.avatar} size={40} />
                          <span
                            title={presUI.label}
                            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${presUI.dotClass}`}
                          />
                          {hasUnread && (
                            <span className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-extrabold text-[#141824] dark:text-white truncate">
                              {friend.name}
                            </p>
                            {hasUnread && (
                              <span className="px-1.5 py-0.5 text-[9px] leading-none font-extrabold rounded bg-emerald-600 text-white shrink-0">
                                جديد
                              </span>
                            )}
                          </div>
                          <p className={`text-[10px] truncate ${presUI.textClass}`}>
                            {presUI.label}
                          </p>
                          <p
                            className={`text-[10px] font-mono-num truncate ${
                              hasUnread
                                ? 'text-emerald-800 dark:text-emerald-300 font-bold'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            @{friend.username || 'صديق'}
                            {lastThread?.lastMessageText
                              ? ` · ${lastThread.lastMessageText}`
                              : ''}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            soundFx.tap();
                            setActiveFriend(friend);
                            onChatSeen?.(friend.id, lastThread?.updatedAtMs || Date.now());
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                            hasUnread
                              ? 'text-white bg-emerald-600 hover:bg-emerald-700'
                              : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100'
                          }`}
                          title="فتح المحادثة المباشرة"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>دردشة</span>
                        </button>
                        {joinableCode && (
                          <button
                            type="button"
                            onClick={() => {
                              soundFx.tap();
                              onJoinRoom(joinableCode);
                            }}
                            className="p-1.5 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 rounded-lg cursor-pointer"
                            title={pres?.status === 'in_room' ? 'انضمام لغرفة الصديق الحالية' : 'دخول غرفة الصديق الأساسية'}
                          >
                            <Crown className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyUid === friend.id}
                          onClick={() => handleRemoveFriend(friend.id)}
                          className="p-1.5 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 rounded-lg cursor-pointer disabled:opacity-50"
                          title="إزالة من الأصدقاء"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Direct Chat Column */}
          <section
            className={`lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col min-h-[420px] ${
              activeFriend ? 'block' : 'hidden lg:flex'
            }`}
          >
            {activeFriend ? (
              <div className="flex flex-col flex-1 min-h-[390px] space-y-3">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.tap();
                        setActiveFriend(null);
                      }}
                      className="lg:hidden p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                      title="العودة لقائمة الأصدقاء"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <div className="relative shrink-0">
                      <AvatarBadge avatarId={activeFriend.avatar} size={40} />
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                          formatPresenceStatus(presenceMap[activeFriend.id]).dotClass
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-[#141824] dark:text-white truncate">
                        {activeFriend.name}
                      </h3>
                      <p className="text-[11px] truncate flex items-center gap-1.5">
                        <span className={formatPresenceStatus(presenceMap[activeFriend.id]).textClass}>
                          {formatPresenceStatus(presenceMap[activeFriend.id]).label}
                        </span>
                        <span className="text-slate-400 font-mono-num">
                          · @{activeFriend.username || 'صديق'}
                        </span>
                      </p>
                    </div>
                  </div>
                  {(() => {
                    const pres = presenceMap[activeFriend.id];
                    const code =
                      pres?.status === 'in_room' && !pres.isRoomPrivate && !pres.isRoomLocked && pres.roomCode
                        ? pres.roomCode
                        : activeFriend.basicRoomId;
                    if (!code) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.tap();
                          onJoinRoom(code);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg cursor-pointer shrink-0"
                      >
                        <Crown className="w-3.5 h-3.5" />
                        <span>{pres?.status === 'in_room' ? 'دخول غرفته الآن' : 'دخول غرفته'}</span>
                      </button>
                    );
                  })()}
                </div>

                <div className="flex-1 min-h-[260px] max-h-[380px] overflow-y-auto bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2.5">
                  {chatLoading ? (
                    <p className="text-xs text-slate-400 text-center py-14">جاري تحميل المحادثة...</p>
                  ) : chatMessages.length === 0 ? (
                    <div className="text-center py-14 space-y-1.5">
                      <MessageCircle className="w-7 h-7 text-slate-300 dark:text-slate-700 mx-auto" />
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        ابدأ المحادثة الخاصة مع {activeFriend.name}
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isMine = msg.senderId === profile.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}
                        >
                          <div
                            className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-xs space-y-1 shadow-2xs ${
                              isMine
                                ? 'bg-blue-600 text-white rounded-tr-sm'
                                : 'bg-white dark:bg-slate-800 text-[#141824] dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-sm'
                            }`}
                          >
                            <p className="leading-relaxed break-words">{msg.text}</p>
                            <div
                              className={`text-[9px] font-mono-num flex items-center justify-end gap-1 ${
                                isMine ? 'text-blue-100' : 'text-slate-400'
                              }`}
                            >
                              <span>{formatMessageTime(msg.createdAtMs)}</span>
                              {isMine && (
                                msg.pending ? (
                                  <span title="جاري الإرسال">
                                    <Clock className="w-2.5 h-2.5 opacity-80" />
                                  </span>
                                ) : msg.readAtMs && msg.readAtMs > 0 ? (
                                  <span title="تم فتح الرسالة">
                                    <CheckCheck className="w-3.5 h-3.5 text-cyan-200" />
                                  </span>
                                ) : (
                                  <span title="تم التوصيل">
                                    <Check className="w-3 h-3 text-blue-100" />
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendDirect} className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={`اكتب رسالة خاصة إلى ${activeFriend.name}...`}
                    maxLength={800}
                    className="flex-1 min-w-0 px-3.5 py-2.5 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={sending || !messageInput.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 space-y-2.5">
                <MessageCircle className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                <h3 className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  اختر صديقاً لبدء الدردشة المباشرة
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                  اضغط على زر دردشة بجانب أي صديق من القائمة لفتح محادثة خاصة فورية معه.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: INCOMING & OUTGOING FRIEND REQUESTS */}
      {subTab === 'requests' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Incoming Friend Requests */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-extrabold text-[#141824] dark:text-white flex items-center gap-2">
                <Inbox className="w-4 h-4 text-emerald-600" />
                <span>طلبات الصداقة الواردة ({incomingRequests.length})</span>
              </h2>
            </div>

            {incomingRequests.length === 0 ? (
              <div className="text-center py-10 space-y-1.5">
                <Inbox className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  لا توجد طلبات صداقة واردة حالياً
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {incomingRequests.map((req) => {
                  const isBusy = busyUid === req.fromUid;
                  return (
                    <div
                      key={req.requestId}
                      className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AvatarBadge avatarId={req.fromAvatar} size={40} />
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-[#141824] dark:text-white truncate">
                            {req.fromName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num truncate">
                            {req.fromUsername ? `@${req.fromUsername}` : 'مستخدم يلا بلاي'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAcceptRequest(req)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>قبول</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDeclineOrCancel(req, true)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 disabled:opacity-50 rounded-lg cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>رفض</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Outgoing Friend Requests */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-extrabold text-[#141824] dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>الطلبات المرسلة ({outgoingRequests.length})</span>
              </h2>
            </div>

            {outgoingRequests.length === 0 ? (
              <div className="text-center py-10 space-y-1.5">
                <UserPlus className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  لم ترسل أي طلبات صداقة معلقة
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {outgoingRequests.map((req) => {
                  const isBusy = busyUid === req.toUid;
                  return (
                    <div
                      key={req.requestId}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AvatarBadge avatarId={req.toAvatar} size={40} />
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-[#141824] dark:text-white truncate">
                            {req.toName}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num truncate">
                            {req.toUsername ? `@${req.toUsername} · ` : ''}بانتظار القبول
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeclineOrCancel(req, false)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/60 disabled:opacity-50 rounded-lg cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>إلغاء الطلب</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: ADD FRIENDS (USERNAME SEARCH + SUGGESTED PLAYERS) */}
      {subTab === 'add' && (
        <div className="space-y-5">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <form onSubmit={handleSearch} className="space-y-2">
              <label className="block text-xs sm:text-sm font-extrabold text-[#141824] dark:text-white">
                البحث باليوزرنيم لإرسال طلب صداقة
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="اكتب يوزرنيم اللاعب (مثل hesham12)..."
                    dir="ltr"
                    className="w-full pr-9 pl-3 py-2.5 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600 text-right font-mono-num"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl cursor-pointer shrink-0"
                >
                  {searching ? 'جاري البحث...' : 'بحث'}
                </button>
              </div>
            </form>

            {searchResult && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/75 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarBadge avatarId={searchResult.avatar} size={42} />
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-[#141824] dark:text-white truncate">
                      {searchResult.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num truncate">
                      @{searchResult.username || 'بدون_يوزر'}
                    </p>
                  </div>
                </div>
                {renderUserCardAction(searchResult)}
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-extrabold text-[#141824] dark:text-white">
                  مستخدمون على المنصة
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  أرسل طلب صداقة مباشرة للاعبين الآخرين
                </p>
              </div>
            </div>

            {loadingSuggested ? (
              <p className="text-xs text-slate-400 text-center py-8">جاري تحميل المستخدمين...</p>
            ) : suggestedPlayers.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                لا يوجد مستخدمون آخرون متاحون حالياً
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suggestedPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AvatarBadge avatarId={player.avatar} size={40} />
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-[#141824] dark:text-white truncate">
                          {player.name}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono-num truncate">
                          {player.username ? `@${player.username} · ` : ''}
                          {player.wins} فوز
                        </p>
                      </div>
                    </div>
                    {renderUserCardAction(player)}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
};
