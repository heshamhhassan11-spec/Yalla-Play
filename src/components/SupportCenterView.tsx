import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Headphones,
  Inbox,
  Lightbulb,
  Lock,
  MessageSquarePlus,
  Moon,
  Send,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import {
  createSupportTicket,
  sendUserSupportReply,
  subscribeSupportMessages,
  updateUserProfileFields,
} from '../firebase';
import { isAdminEmail } from '../shared/gameCatalog';
import type {
  PlayerProfile,
  SupportCategory,
  SupportMessage,
  SupportTicket,
  SupportTicketStatus,
} from '../shared/types';
import { soundFx } from '../utils/sound';
import { AdminSupportPanel } from './AdminSupportPanel';

interface SupportCenterViewProps {
  profile: PlayerProfile;
  tickets: SupportTicket[];
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onProfileUsernameSynced?: (username: string) => void;
}

type UserTicketFilter = 'all' | SupportTicketStatus;

const CATEGORY_META: Array<{
  id: SupportCategory;
  label: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'support',
    label: 'دعم فني',
    desc: 'مشكلة تقنية في الغرف أو الرصيد أو الحساب',
    icon: <Headphones className="w-4 h-4" />,
  },
  {
    id: 'complaint',
    label: 'شكوى',
    desc: 'تقديم شكوى رسمية بخصوص لاعب أو موقف معين',
    icon: <AlertCircle className="w-4 h-4" />,
  },
  {
    id: 'suggestion',
    label: 'اقتراح',
    desc: 'أفكار جديدة لتطوير الألعاب والغرف في يلا بلاي',
    icon: <Lightbulb className="w-4 h-4" />,
  },
];

function getStatusBadge(status: SupportTicketStatus) {
  if (status === 'replied') {
    return {
      label: 'تم الرد',
      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
    };
  }
  if (status === 'closed') {
    return {
      label: 'منتهي (مغلق)',
      cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    };
  }
  return {
    label: 'قيد المراجعة',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  };
}

function getCategoryText(cat: SupportCategory): string {
  if (cat === 'complaint') return 'شكوى';
  if (cat === 'suggestion') return 'اقتراح';
  return 'دعم فني';
}

export const SupportCenterView: React.FC<SupportCenterViewProps> = ({
  profile,
  tickets,
  theme,
  onToggleTheme,
  onProfileUsernameSynced,
}) => {
  const isAdmin = isAdminEmail(profile.email);
  const [filter, setFilter] = useState<UserTicketFilter>('all');
  const [creatingNew, setCreatingNew] = useState(tickets.length === 0);
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<string | null>(
    tickets[0]?.ticketNumber || null
  );

  // New Ticket Form
  const [category, setCategory] = useState<SupportCategory>('support');
  const [usernameInput, setUsernameInput] = useState(profile.username || '');
  const [subject, setSubject] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [submittingNew, setSubmittingNew] = useState(false);
  const [createdBanner, setCreatedBanner] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Thread state
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [copiedNum, setCopiedNum] = useState<string | null>(null);
  const msgEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setUsernameInput(profile.username || '');
  }, [profile.username]);

  useEffect(() => {
    if (!creatingNew && !selectedTicketNumber && tickets.length > 0) {
      setSelectedTicketNumber(tickets[0].ticketNumber);
    }
  }, [tickets, creatingNew, selectedTicketNumber]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.ticketNumber === selectedTicketNumber) || null,
    [tickets, selectedTicketNumber]
  );

  useEffect(() => {
    if (!selectedTicketNumber || creatingNew) {
      setMessages([]);
      return;
    }
    const unsub = subscribeSupportMessages(
      selectedTicketNumber,
      profile.id,
      false,
      (msgs) => {
        setMessages(msgs);
        setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      }
    );
    return unsub;
  }, [selectedTicketNumber, creatingNew, profile.id]);

  const filteredTickets = useMemo(() => {
    if (filter === 'all') return tickets;
    return tickets.filter((t) => t.status === filter);
  }, [tickets, filter]);

  const repliedCount = tickets.filter((t) => t.status === 'replied').length;

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingNew) return;
    const cleanUser = usernameInput.trim().replace(/^@+/, '').toLowerCase();
    if (!cleanUser || cleanUser.length < 3) {
      setFormError('يرجى كتابة اليوزرنيم الخاص بك (3 أحرف على الأقل) ليتم ربط الطلب بحسابك');
      return;
    }
    if (/\s/.test(cleanUser)) {
      setFormError('اليوزرنيم لا يجب أن يحتوي على مسافات');
      return;
    }
    if (!subject.trim() || !initialMessage.trim()) {
      setFormError('يرجى كتابة عنوان الطلب وتفاصيل رسالتك');
      return;
    }

    setSubmittingNew(true);
    setFormError(null);
    setCreatedBanner(null);

    try {
      if (!profile.username && cleanUser) {
        await updateUserProfileFields(profile.id, { username: cleanUser }).catch(() => {});
        onProfileUsernameSynced?.(cleanUser);
      }

      const ticketNumber = await createSupportTicket({
        profile,
        usernameInput: cleanUser,
        category,
        subject: subject.trim(),
        initialMessage: initialMessage.trim(),
      });
      soundFx.win();
      setSubject('');
      setInitialMessage('');
      setCreatingNew(false);
      setSelectedTicketNumber(ticketNumber);
      setCreatedBanner(`تم إرسال طلبك بنجاح! رقم الطلب الخاص بك هو: #${ticketNumber}`);
      setTimeout(() => setCreatedBanner(null), 6000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر إرسال الطلب، حاول مرة أخرى');
    } finally {
      setSubmittingNew(false);
    }
  };

  const handleSendFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || selectedTicket.status === 'closed' || !replyText.trim() || sendingReply) {
      return;
    }
    setSendingReply(true);
    setReplyError(null);
    try {
      await sendUserSupportReply({
        ticket: selectedTicket,
        profile,
        text: replyText.trim(),
      });
      soundFx.tap();
      setReplyText('');
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'تعذر إرسال الرسالة');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <main className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-[#141824] dark:text-white flex items-center gap-2.5">
            <Headphones className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            <span>الدعم والشكاوى والاقتراحات</span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            تواصل مع الإدارة عبر صندوق الرسائل باليوزرنيم ورقم الطلب العشوائي الفريد
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
            <span>{theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFx.tap();
              setCreatingNew(true);
              setFormError(null);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer shadow-xs"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>فتح طلب جديد</span>
          </button>
        </div>
      </div>

      {/* Admin Support Inbox Section (Admin Only) */}
      {isAdmin && <AdminSupportPanel adminProfile={profile} />}

      {createdBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100 text-sm font-extrabold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{createdBanner}</span>
        </div>
      )}

      {/* User Inbox & Message Thread */}
      <section className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        {/* Left/Right Sidebar: User's Ticket List (Message Box) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-extrabold text-[#141824] dark:text-white">
                صندوق طلباتي ({tickets.length})
              </h2>
            </div>
            {repliedCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-emerald-600 text-white font-mono-num">
                {repliedCount} تم الرد عليها
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'الكل'],
                ['replied', 'تم الرد'],
                ['open', 'قيد المراجعة'],
                ['closed', 'منتهي'],
              ] as Array<[UserTicketFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer transition-colors ${
                  filter === key
                    ? 'bg-[#141824] dark:bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-0.5">
            {filteredTickets.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  لا توجد طلبات في هذا التصنيف بعد
                </p>
                <button
                  type="button"
                  onClick={() => setCreatingNew(true)}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  + إرسال رسالة أو شكوى أو اقتراح جديد
                </button>
              </div>
            ) : (
              filteredTickets.map((t) => {
                const badge = getStatusBadge(t.status);
                const active = !creatingNew && selectedTicketNumber === t.ticketNumber;
                return (
                  <button
                    key={t.ticketNumber}
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      setCreatingNew(false);
                      setSelectedTicketNumber(t.ticketNumber);
                      setReplyError(null);
                    }}
                    className={`w-full text-right p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 ${
                      active
                        ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 shadow-xs'
                        : t.status === 'replied'
                          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-400'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black font-mono-num text-blue-700 dark:text-blue-300">
                        طلب #{t.ticketNumber}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded border ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-bold">{getCategoryText(t.category)}</span>
                      <span className="font-mono-num font-bold" dir="ltr">
                        @{t.username || profile.username || 'مستخدم'}
                      </span>
                    </div>

                    <p className="text-xs font-extrabold text-[#141824] dark:text-white truncate">
                      {t.subject}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {t.lastSenderRole === 'admin' ? 'رد الإدارة: ' : ''}
                      {t.lastMessageText}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Main Content Area: New Request Form OR Open Ticket Thread */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden min-h-[540px] flex flex-col">
          {creatingNew ? (
            <form onSubmit={handleCreateTicket} className="p-6 space-y-5 flex-1">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-[#141824] dark:text-white">
                    فتح طلب تواصل جديد (دعم / شكوى / اقتراح)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    سيتم إنشاء رقم طلب عشوائي فريد (من 6 إلى 10 أرقام) وإرساله مع اليوزرنيم للإدارة
                  </p>
                </div>
                {tickets.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingNew(false);
                      if (!selectedTicketNumber && tickets[0]) {
                        setSelectedTicketNumber(tickets[0].ticketNumber);
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    العودة لطلباتي
                  </button>
                )}
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  نوع الرسالة:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {CATEGORY_META.map((cat) => {
                    const selected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`p-3 rounded-xl border text-right space-y-1 transition-all cursor-pointer ${
                          selected
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-1 ring-blue-600/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-extrabold text-xs">
                          {cat.icon}
                          <span>{cat.label}</span>
                        </div>
                        <p className="text-[11px] opacity-80 leading-snug">{cat.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Username & Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    اليوزرنيم الخاص بك (يظهر للإدارة):
                  </label>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="مثل: hesham12"
                    dir="ltr"
                    maxLength={24}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600 text-right font-mono-num"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    عنوان الطلب / المشكلة:
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="ملخص سريع للرسالة..."
                    maxLength={100}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Message Body */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  تفاصيل الرسالة:
                </label>
                <textarea
                  value={initialMessage}
                  onChange={(e) => setInitialMessage(e.target.value)}
                  rows={5}
                  maxLength={1000}
                  placeholder="اشرح طلبك، شكواك، أو اقتراحك بوضوح ليتمكن الأدمن من مساعدتك بسرعة..."
                  className="w-full px-3.5 py-3 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600 resize-none"
                />
              </div>

              {formError && (
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{formError}</p>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={submittingNew}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{submittingNew ? 'جاري إنشاء الطلب...' : 'إرسال الطلب الآن'}</span>
                </button>
              </div>
            </form>
          ) : !selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
              <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                اختر أي طلب من القائمة لقراءة الردود أو افتح طلباً جديداً
              </p>
              <button
                type="button"
                onClick={() => setCreatingNew(true)}
                className="px-4 py-2 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer"
              >
                + فتح طلب جديد
              </button>
            </div>
          ) : (
            <>
              {/* Selected Ticket Thread Header */}
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedTicket.ticketNumber).catch(() => {});
                        setCopiedNum(selectedTicket.ticketNumber);
                        soundFx.tap();
                        setTimeout(() => setCopiedNum(null), 1800);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-black font-mono-num text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 rounded-md cursor-pointer"
                      title="نسخ رقم الطلب"
                    >
                      <span>رقم الطلب: #{selectedTicket.ticketNumber}</span>
                      {copiedNum === selectedTicket.ticketNumber ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>

                    <span
                      className="text-xs font-mono-num font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                      dir="ltr"
                    >
                      @{selectedTicket.username || profile.username || 'مستخدم'}
                    </span>

                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {getCategoryText(selectedTicket.category)}
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-[#141824] dark:text-white truncate">
                    {selectedTicket.subject}
                  </h3>
                </div>

                {(() => {
                  const badge = getStatusBadge(selectedTicket.status);
                  return (
                    <span className={`px-3 py-1 text-xs font-extrabold rounded-lg border ${badge.cls}`}>
                      {badge.label}
                    </span>
                  );
                })()}
              </div>

              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3.5 max-h-[420px]">
                {messages.map((m) => {
                  const isAdminMsg = m.senderRole === 'admin';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-1 max-w-[85%] ${
                        isAdminMsg ? 'mr-auto items-end' : 'ml-auto items-start'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {isAdminMsg ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-extrabold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>رد الإدارة ({m.senderName})</span>
                          </span>
                        ) : (
                          <span>
                            أنت{' '}
                            <span className="font-mono-num" dir="ltr">
                              (@{m.senderUsername || selectedTicket.username || 'مستخدم'})
                            </span>
                          </span>
                        )}
                        <span>·</span>
                        <span className="font-mono-num flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(m.createdAtMs).toLocaleString('ar-EG')}
                        </span>
                      </div>
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed break-words shadow-2xs ${
                          isAdminMsg
                            ? 'bg-emerald-600 text-white rounded-tl-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-[#141824] dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tr-sm'
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={msgEndRef} />
              </div>

              {/* Reply Input OR Closed Lock Banner */}
              {selectedTicket.status === 'closed' ? (
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-rose-50/70 dark:bg-rose-950/30 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-rose-800 dark:text-rose-200">
                    <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      تم إنهاء وإغلاق رقم الطلب (#{selectedTicket.ticketNumber}) من قِبل الإدارة. لا يمكنك إرسال رسائل جديدة هنا — افتح طلباً جديداً للتواصل.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      setCreatingNew(true);
                    }}
                    className="px-4 py-2 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer shrink-0"
                  >
                    + فتح طلب جديد
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSendFollowUp}
                  className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-2"
                >
                  {replyError && (
                    <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{replyError}</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="اكتب ردك أو متابعتك على نفس رقم الطلب..."
                      maxLength={1000}
                      className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600"
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl cursor-pointer shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sendingReply ? 'جاري الإرسال...' : 'إرسال'}</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
};
