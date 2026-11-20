import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  Crown,
  Inbox,
  MessageCircle,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  acceptFriendRequest,
  declineOrCancelFriendRequest,
  fetchFriends,
  fetchProfilesByIds,
  getDirectChatId,
  markDirectMessagesRead,
  removeMutualFriend,
  searchUserByUsername,
  sendDirectMessage,
  sendFriendRequest,
  subscribeDirectMessages,
  subscribeFriendRequests,
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

interface FriendsModalProps {
  profile: PlayerProfile;
  onClose: () => void;
  onJoinRoom?: (code: string) => void;
  initialFriendUid?: string | null;
  onConsumedInitialFriend?: () => void;
  unreadByFriendUid?: Record<string, boolean>;
  onChatSeen?: (friendUid: string, seenAtMs?: number) => void;
  onActiveFriendChange?: (friendUid: string | null) => void;
  presenceMap?: Record<string, UserPresenceInfo>;
  onWatchPresence?: (uids: string[]) => void;
}

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
  dotClass: string;
  textClass: string;
} {
  if (info?.status === 'in_room') {
    return {
      label: info.roomTitle ? `في غرفة: ${info.roomTitle}` : 'داخل غرفة صوتية الآن',
      dotClass: 'bg-blue-500',
      textClass: 'text-blue-600 dark:text-blue-400 font-bold',
    };
  }
  if (info?.status === 'online') {
    return {
      label: 'متصل الآن',
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
      dotClass: 'bg-slate-400',
      textClass: 'text-slate-400 dark:text-slate-500',
    };
  }
  return {
    label: 'غير متصل',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-400 dark:text-slate-500',
  };
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  profile,
  onClose,
  onJoinRoom,
  initialFriendUid,
  onConsumedInitialFriend,
  unreadByFriendUid = {},
  onChatSeen,
  onActiveFriendChange,
  presenceMap = {},
  onWatchPresence,
}) => {
  const [friends, setFriends] = useState<PlayerProfile[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<PlayerProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [threads, setThreads] = useState<DirectChatThread[]>([]);
  const [activeFriend, setActiveFriend] = useState<PlayerProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<DirectMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const incomingRequests = useMemo(
    () => friendRequests.filter((r) => r.status === 'pending' && r.toUid === profile.id),
    [friendRequests, profile.id]
  );

  const acceptedDocs = useMemo(
    () => friendRequests.filter((r) => r.status === 'accepted'),
    [friendRequests]
  );

  const loadFriends = async () => {
    setLoading(true);
    try {
      const legacy = await fetchFriends(profile.id);
      const otherIds = acceptedDocs.map((r) =>
        r.fromUid === profile.id ? r.toUid : r.fromUid
      );
      const missingIds = otherIds.filter((uid) => !legacy.some((f) => f.id === uid));
      const fetched = missingIds.length > 0 ? await fetchProfilesByIds(missingIds) : [];
      setFriends([...legacy, ...fetched]);
    } catch {
      // Handled gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFriends();
  }, [profile.id, acceptedDocs.length]);

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
    const unsubReqs = subscribeFriendRequests(profile.id, setFriendRequests);
    const unsubChats = subscribeUserDirectChats(profile.id, setThreads);
    return () => {
      unsubReqs();
      unsubChats();
    };
  }, [profile.id]);

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
      setActiveFriend(found);
      onChatSeen?.(found.id);
      onConsumedInitialFriend?.();
      return;
    }
    if (!loading) {
      fetchProfilesByIds([initialFriendUid])
        .then((profiles) => {
          if (!active) return;
          if (profiles[0]) {
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
  }, [initialFriendUid, friends, loading, onChatSeen, onConsumedInitialFriend]);

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
      setNotice('حدث خطأ أثناء البحث');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (target: PlayerProfile) => {
    soundFx.tap();
    try {
      const res = await sendFriendRequest(profile, target);
      soundFx.correct();
      setNotice(
        res === 'accepted'
          ? `أصبح ${target.name} صديقك الآن!`
          : res === 'already_friends'
            ? 'أنتما أصدقاء بالفعل'
            : res === 'already_sent'
              ? 'تم إرسال الطلب مسبقاً وبانتظار القبول'
              : `تم إرسال طلب الصداقة إلى ${target.name}`
      );
      setSearchResult(null);
      setSearchQuery('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('أوقف') || msg.includes('الخصوصية')) {
        setNotice(msg);
      } else if (msg.includes('جلسة الدخول')) {
        setNotice('انتهت جلسة الدخول، يرجى إعادة تسجيل الدخول بحساب Google');
      } else if (msg.includes('offline') || msg.includes('network')) {
        setNotice('تعذر الاتصال بالخادم، تأكد من اتصالك بالإنترنت');
      } else {
        setNotice('تعذر إرسال طلب الصداقة، حاول مرة أخرى');
      }
    }
  };

  const handleRemove = async (friendUid: string) => {
    soundFx.tap();
    try {
      await removeMutualFriend(profile.id, friendUid);
      soundFx.correct();
      setFriends((prev) => prev.filter((f) => f.id !== friendUid));
      if (activeFriend?.id === friendUid) setActiveFriend(null);
    } catch {
      setNotice('تعذر إزالة الصديق');
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

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="الأصدقاء والدردشة المباشرة"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-4 sm:p-6 space-y-4 shadow-2xl my-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeFriend ? (
              <button
                type="button"
                onClick={() => {
                  soundFx.tap();
                  setActiveFriend(null);
                }}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer shrink-0"
                title="العودة لقائمة الأصدقاء"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-[#141824] dark:text-white truncate">
                {activeFriend ? `محادثة: ${activeFriend.name}` : 'الأصدقاء وطلبات الصداقة'}
              </h3>
              <p className="text-[11px] truncate font-mono-num">
                {activeFriend ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={formatPresenceStatus(presenceMap[activeFriend.id]).textClass}>
                      {formatPresenceStatus(presenceMap[activeFriend.id]).label}
                    </span>
                    <span className="text-slate-400">· @{activeFriend.username || 'صديق'}</span>
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">
                    إضافة أصدقاء، قبول طلبات الصداقة، والدردشة المباشرة
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => {
              soundFx.tap();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {notice && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs font-semibold rounded-xl flex items-center justify-between gap-2 shrink-0">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-blue-600 dark:text-blue-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {activeFriend ? (
          <div className="flex flex-col flex-1 min-h-0 space-y-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/75 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <AvatarBadge avatarId={activeFriend.avatar} size={38} />
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-[#141824] dark:text-white truncate">
                    {activeFriend.name}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {activeFriend.bio || 'لاعب في منصة يلا بلاي'}
                  </p>
                </div>
              </div>
              {activeFriend.basicRoomId && onJoinRoom && (
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    onJoinRoom(activeFriend.basicRoomId);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg cursor-pointer shrink-0"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>دخول غرفته</span>
                </button>
              )}
            </div>

            <div className="flex-1 min-h-[240px] max-h-[360px] overflow-y-auto bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2.5">
              {chatLoading ? (
                <p className="text-xs text-slate-400 text-center py-12">جاري تحميل المحادثة...</p>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-12 space-y-1.5">
                  <MessageCircle className="w-7 h-7 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    لا توجد رسائل بعد مع {activeFriend.name}
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

            <form onSubmit={handleSendDirect} className="flex items-center gap-2 shrink-0">
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
          <div className="space-y-4 overflow-y-auto flex-1 pr-0.5">
            <form onSubmit={handleSearch} className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                إرسال طلب صداقة باليوزرنيم
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="اكتب يوزرنيم الصديق (مثل hesham12)..."
                    dir="ltr"
                    className="w-full pr-9 pl-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600 text-right font-mono-num"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer shadow-2xs shrink-0"
                >
                  {searching ? '...' : 'بحث'}
                </button>
              </div>
            </form>

            {searchResult && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <AvatarBadge avatarId={searchResult.avatar} size={36} />
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-[#141824] dark:text-white truncate">
                      {searchResult.name}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono-num">
                      @{searchResult.username || 'بدون_يوزر'}
                    </p>
                  </div>
                </div>
                {searchResult.privacyBlockFriendRequests ? (
                  <span className="px-2.5 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-700 rounded-lg shrink-0">
                    الخصوصية مفعّلة
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendRequest(searchResult)}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer shrink-0 shadow-2xs"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>إرسال طلب</span>
                  </button>
                )}
              </div>
            )}

            {incomingRequests.length > 0 && (
              <div className="space-y-2 pt-1">
                <h4 className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Inbox className="w-3.5 h-3.5" />
                  <span>طلبات صداقة واردة ({incomingRequests.length})</span>
                </h4>
                <div className="space-y-2">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.requestId}
                      className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <AvatarBadge avatarId={req.fromAvatar} size={34} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{req.fromName}</p>
                          <p className="text-[10px] text-slate-500 font-mono-num truncate">
                            @{req.fromUsername || 'مستخدم'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await acceptFriendRequest(req, profile);
                            soundFx.win();
                            await loadFriends();
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 text-white rounded-lg cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 inline ml-0.5" />
                          قبول
                        </button>
                        <button
                          type="button"
                          onClick={() => declineOrCancelFriendRequest(req.requestId)}
                          className="px-2.5 py-1 text-[11px] font-bold bg-rose-50 text-rose-700 rounded-lg cursor-pointer"
                        >
                          رفض
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-1">
              <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>أصدقائي ({friends.length})</span>
              </h4>

              {loading ? (
                <p className="text-xs text-slate-400 text-center py-6">جاري تحميل الأصدقاء...</p>
              ) : friends.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  ليس لديك أصدقاء مضافون بعد.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                  {friends.map((friend) => {
                    const lastThread = threadByFriendId.get(friend.id);
                    const hasUnread = Boolean(unreadByFriendUid[friend.id]);
                    const presUI = formatPresenceStatus(presenceMap[friend.id]);
                    return (
                      <div
                        key={friend.id}
                        className={`p-3 border rounded-xl flex items-center justify-between gap-3 shadow-2xs ${
                          hasUnread
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <AvatarBadge avatarId={friend.avatar} size={38} />
                            <span
                              title={presUI.label}
                              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${presUI.dotClass}`}
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
                              {lastThread?.lastMessageText ? ` · ${lastThread.lastMessageText}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              soundFx.tap();
                              setActiveFriend(friend);
                              onChatSeen?.(friend.id, lastThread?.updatedAtMs || Date.now());
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-2 text-xs font-bold rounded-lg cursor-pointer ${
                              hasUnread
                                ? 'text-white bg-emerald-600 hover:bg-emerald-700'
                                : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100'
                            }`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>دردشة</span>
                          </button>
                          {friend.basicRoomId && onJoinRoom && (
                            <button
                              type="button"
                              onClick={() => {
                                soundFx.tap();
                                onJoinRoom(friend.basicRoomId);
                              }}
                              className="p-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 rounded-lg cursor-pointer"
                            >
                              <Crown className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemove(friend.id)}
                            className="p-2 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundFx.tap();
              onClose();
            }}
            className="px-5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
