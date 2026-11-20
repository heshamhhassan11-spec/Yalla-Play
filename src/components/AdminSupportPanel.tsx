import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Headphones,
  Lock,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  adminCloseSupportTicket,
  adminReplySupportTicket,
  auth,
  subscribeAdminSupportTickets,
  subscribeSupportMessages,
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

interface AdminSupportPanelProps {
  adminProfile: PlayerProfile;
}

type AdminSupportFilter = 'all' | SupportTicketStatus;

function categoryLabel(cat: SupportCategory): string {
  if (cat === 'complaint') return 'شكوى';
  if (cat === 'suggestion') return 'اقتراح';
  return 'دعم فني';
}

function statusBadge(status: SupportTicketStatus) {
  if (status === 'replied') {
    return {
      label: 'تم الرد',
      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    };
  }
  if (status === 'closed') {
    return {
      label: 'منتهي (مغلق)',
      cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    };
  }
  return {
    label: 'بانتظار الرد',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  };
}

export const AdminSupportPanel: React.FC<AdminSupportPanelProps> = ({ adminProfile }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AdminSupportFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const msgEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      !auth.currentUser ||
      auth.currentUser.uid !== adminProfile.id ||
      !isAdminEmail(auth.currentUser.email)
    ) {
      setTickets([]);
      setLoading(false);
      return;
    }
    const unsub = subscribeAdminSupportTickets(
      (items) => {
        setTickets(items);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return unsub;
  }, [adminProfile.id]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.ticketNumber === selectedId) || null,
    [tickets, selectedId]
  );

  useEffect(() => {
    if (
      !selectedId ||
      !auth.currentUser ||
      auth.currentUser.uid !== adminProfile.id ||
      !isAdminEmail(auth.currentUser.email)
    ) {
      setMessages([]);
      return;
    }
    const unsub = subscribeSupportMessages(
      selectedId,
      adminProfile.id,
      true,
      (msgs) => {
        setMessages(msgs);
        setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      }
    );
    return unsub;
  }, [selectedId, adminProfile.id]);

  const filteredTickets = useMemo(() => {
    const q = searchText.trim().toLowerCase().replace(/^@+/, '').replace(/^#+/, '');
    return tickets.filter((t) => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (!q) return true;
      return (
        t.ticketNumber.includes(q) ||
        t.username.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q)
      );
    });
  }, [tickets, filter, searchText]);

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const repliedCount = tickets.filter((t) => t.status === 'replied').length;
  const closedCount = tickets.filter((t) => t.status === 'closed').length;

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim() || busy) return;
    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      await adminReplySupportTicket({
        ticket: selectedTicket,
        adminProfile,
        text: replyText.trim(),
      });
      soundFx.correct();
      setReplyText('');
      setFeedback(`تم إرسال الرد على الطلب رقم #${selectedTicket.ticketNumber} وحفظ الحالة "تم الرد"`);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إرسال الرد');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket || selectedTicket.status === 'closed' || busy) return;
    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      await adminCloseSupportTicket({
        ticket: selectedTicket,
        adminProfile,
      });
      soundFx.tap();
      setFeedback(`تم إنهاء وإغلاق رقم الطلب #${selectedTicket.ticketNumber} بنجاح.`);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر إنهاء الطلب');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="admin-support-panel"
      className="bg-white dark:bg-slate-900 border-2 border-indigo-300 dark:border-indigo-700/80 rounded-2xl p-6 space-y-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-[#141824] dark:text-white">
                صندوق رسائل الدعم والشكاوى والاقتراحات (الأدمن)
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
                الإدارة فقط
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              استعرض رسائل المستخدمين برقم الطلب واليوزرنيم، أرسل ردك، أو قم بإنهاء الطلب بعد حل المشكلة
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', `الكل (${tickets.length})`],
              ['open', `بانتظار الرد (${openCount})`],
              ['replied', `تم الرد (${repliedCount})`],
              ['closed', `منتهي (${closedCount})`],
            ] as Array<[AdminSupportFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                filter === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search by Ticket Number or Username */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="ابحث برقم الطلب (مثل 4829103) أو باليوزرنيم (@username) أو الاسم..."
          className="w-full pr-10 pl-4 py-2.5 text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-indigo-600"
        />
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-bold rounded-xl">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Tickets List */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 p-2.5 space-y-2 max-h-[500px] overflow-y-auto">
          {loading ? (
            <p className="text-xs text-slate-500 text-center py-10">جاري تحميل الطلبات...</p>
          ) : filteredTickets.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-10">
              لا توجد رسائل أو طلبات مطابقة حالياً
            </p>
          ) : (
            filteredTickets.map((t) => {
              const badge = statusBadge(t.status);
              const isSelected = selectedId === t.ticketNumber;
              return (
                <button
                  key={t.ticketNumber}
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    setSelectedId(t.ticketNumber);
                    setErrorMsg(null);
                  }}
                  className={`w-full text-right p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 ${
                    isSelected
                      ? 'border-indigo-600 bg-white dark:bg-slate-900 shadow-xs ring-1 ring-indigo-600/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black font-mono-num text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                      #{t.ticketNumber}
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded border ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-extrabold text-[#141824] dark:text-white truncate">
                      {t.userName}
                    </span>
                    <span className="font-mono-num font-bold text-blue-600 dark:text-blue-400 shrink-0" dir="ltr">
                      @{t.username || 'بدون_يوزر'}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    [{categoryLabel(t.category)}] {t.subject}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {t.lastMessageText}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {/* Selected Conversation Thread */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950/60 flex flex-col h-[500px] overflow-hidden">
          {!selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
              <MessageSquare className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                اختر طلباً من القائمة لفتح الرسائل والرد عليه أو إنهائه
              </p>
            </div>
          ) : (
            <>
              {/* Ticket Header */}
              <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black font-mono-num text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                      رقم الطلب: #{selectedTicket.ticketNumber}
                    </span>
                    <span
                      className="text-xs font-mono-num font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800"
                      dir="ltr"
                    >
                      @{selectedTicket.username || 'بدون_يوزر'}
                    </span>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      ({selectedTicket.userName} · {categoryLabel(selectedTicket.category)})
                    </span>
                  </div>
                  <p className="text-sm font-extrabold text-[#141824] dark:text-white truncate">
                    {selectedTicket.subject}
                  </p>
                </div>

                {selectedTicket.status !== 'closed' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCloseTicket}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>إنهاء الطلب</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 rounded-xl shrink-0">
                    <Lock className="w-3.5 h-3.5" />
                    <span>الطلب منتهي ومغلق</span>
                  </span>
                )}
              </div>

              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                          <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                            <ShieldCheck className="w-3 h-3" />
                            <span>الإدارة ({m.senderName})</span>
                          </span>
                        ) : (
                          <span>
                            {m.senderName}{' '}
                            <span className="font-mono-num" dir="ltr">
                              (@{m.senderUsername || 'مستخدم'})
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
                        className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed break-words shadow-2xs ${
                          isAdminMsg
                            ? 'bg-indigo-600 text-white rounded-tl-sm'
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

              {/* Admin Reply Box */}
              {selectedTicket.status === 'closed' ? (
                <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
                  تم إنهاء رقم الطلب #{selectedTicket.ticketNumber}. لا يمكن للمستخدم إرسال رسائل أخرى فيه.
                </div>
              ) : (
                <form
                  onSubmit={handleSendReply}
                  className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex gap-2"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="اكتب رد الإدارة على المستخدم هنا..."
                    maxLength={1000}
                    className="flex-1 px-3.5 py-2.5 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-indigo-600"
                  />
                  <button
                    type="submit"
                    disabled={busy || !replyText.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال الرد</span>
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
