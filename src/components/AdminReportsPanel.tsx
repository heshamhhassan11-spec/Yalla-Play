import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserX,
  X,
} from 'lucide-react';
import { adminBanUser, adminUpdateReportStatus, auth, subscribeReports } from '../firebase';
import { isAdminEmail } from '../shared/gameCatalog';
import type { ReportRecord } from '../shared/types';
import { soundFx } from '../utils/sound';

interface AdminReportsPanelProps {
  onClose?: () => void;
}

const PRESET_MINUTE_BANS = [
  { label: '5 دقائق', minutes: 5 },
  { label: '15 دقيقة', minutes: 15 },
  { label: '30 دقيقة', minutes: 30 },
  { label: '60 دقيقة (ساعة)', minutes: 60 },
  { label: '180 دقيقة (3 ساعات)', minutes: 180 },
  { label: '1440 دقيقة (يوم)', minutes: 1440 },
  { label: '43200 دقيقة (شهر)', minutes: 43200 },
];

export const AdminReportsPanel: React.FC<AdminReportsPanelProps> = ({ onClose }) => {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customMinutes, setCustomMinutes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
      setReports([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeReports(
      (list) => {
        setReports(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const handleUpdateStatus = async (reportId: string, status: 'resolved' | 'dismissed') => {
    soundFx.tap();
    try {
      await adminUpdateReportStatus(reportId, status);
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status } : r))
      );
      setNotice(status === 'resolved' ? 'تم اعتماد معالجة البلاغ بنجاح' : 'تم تجاهل البلاغ');
    } catch {
      setNotice('تعذر تحديث حالة البلاغ');
    }
  };

  const handleApplyBanMinutes = async (
    targetUserId: string,
    targetUserName: string,
    minutes: number,
    reportId?: string
  ) => {
    if (minutes < 0) return;
    soundFx.gift();
    setBusyUserId(targetUserId);
    setNotice(null);

    const durationMs = minutes * 60 * 1000;
    try {
      await adminBanUser(targetUserId, durationMs);
      if (reportId) {
        await adminUpdateReportStatus(reportId, minutes > 0 ? 'resolved' : 'dismissed').catch(() => {});
      }
      soundFx.win();
      setNotice(
        minutes === 0
          ? `✅ تم رفع الحظر عن اللاعب (${targetUserName}) بنجاح.`
          : `⛔ تم تفعيل الحظر المؤقت على اللاعب (${targetUserName}) لمدة ${minutes} دقيقة بنجاح.`
      );
    } catch {
      setNotice('تعذر تطبيق الحظر، تحقق من الاتصال وقواعد الأمان.');
    } finally {
      setBusyUserId(null);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const pendingCount = reports.filter((r) => r.status === 'pending').length;

  return (
    <div id="admin-reports-panel" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-extrabold text-[#141824] dark:text-white">
                لوحة تحكم بلاغات المستخدمين والحظر المؤقت (Ban)
              </h3>
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-black rounded-full bg-rose-600 text-white animate-pulse">
                  {pendingCount} جديد
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              مراجعة البلاغات الواردة من غرف الألعاب وفرض عقوبات الحظر بالدقائق بدقة
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {notice && (
        <div className="p-3.5 bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 text-xs font-bold rounded-xl flex items-center justify-between gap-2 shadow-xs">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-blue-600 dark:text-blue-300 hover:underline cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-[#141824] dark:bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          الكل ({reports.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            filter === 'pending'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          قيد المراجعة ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter('resolved')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            filter === 'resolved'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          تم اتخاذ إجراء ({reports.filter((r) => r.status === 'resolved').length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('dismissed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            filter === 'dismissed'
              ? 'bg-slate-700 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          مرفوضة / متجاهلة ({reports.filter((r) => r.status === 'dismissed').length})
        </button>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 space-y-2">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-slate-400" />
          <p>جاري تحديث البلاغات في الوقت الفعلي...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="py-12 text-center text-slate-400 space-y-2">
          <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
            {filter === 'pending' ? 'لا توجد بلاغات معلقة حالياً' : 'لا توجد بلاغات في هذا القسم'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((rep) => {
            const currentMins = customMinutes[rep.id] ?? 30;
            return (
              <div
                key={rep.id}
                className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-4 shadow-2xs"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 text-xs font-black rounded-lg ${
                        rep.status === 'pending'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                          : rep.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {rep.status === 'pending'
                        ? 'قيد المراجعة'
                        : rep.status === 'resolved'
                          ? 'تم اتخاذ إجراء / محظور'
                          : 'مرفوض / تم التجاهل'}
                    </span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono-num flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(rep.createdAtMs).toLocaleString('ar-EG')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {rep.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(rep.id, 'dismissed')}
                        className="px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        تجاهل البلاغ
                      </button>
                    )}
                    {rep.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(rep.id, 'resolved')}
                        className="px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 rounded-lg cursor-pointer"
                      >
                        قبول البلاغ
                      </button>
                    )}
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="space-y-0.5">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">اللاعب المُبلِغ:</span>
                    <p className="font-bold text-[#141824] dark:text-white">
                      {rep.reporterName}{' '}
                      <span className="text-[10px] text-slate-400 font-mono">({rep.reporterId.slice(0, 8)})</span>
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">المُبلَغ ضده (المخالف):</span>
                    <p className="font-extrabold text-rose-600 dark:text-rose-400">
                      {rep.reportedName}{' '}
                      <span className="text-[10px] text-slate-400 font-mono">({rep.reportedId.slice(0, 8)})</span>
                    </p>
                  </div>
                </div>

                {/* Reason & Details */}
                <div className="p-3.5 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-rose-900 dark:text-rose-200 font-extrabold text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>سبب البلاغ: {rep.reason}</span>
                  </div>
                  {rep.reportedMessageText && (
                    <div className="p-2.5 rounded-lg bg-rose-100/90 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 space-y-1">
                      <span className="block text-[11px] font-extrabold text-rose-800 dark:text-rose-200">
                        نص الرسالة / الشتيمة المُبلغ عنها:
                      </span>
                      <p className="text-xs font-extrabold text-[#141824] dark:text-white break-words">
                        «{rep.reportedMessageText}»
                      </p>
                    </div>
                  )}
                  {rep.description ? (
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-lg border border-rose-100 dark:border-rose-950">
                      "{rep.description}"
                    </p>
                  ) : (
                    !rep.reportedMessageText && (
                      <p className="text-[11px] text-slate-400 italic">لا توجد تفاصيل إضافية مكتوبة</p>
                    )
                  )}
                </div>

                {/* Ban Controls Section - Specified in Minutes */}
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Ban className="w-4 h-4 text-rose-600" />
                      <span className="text-xs font-black text-[#141824] dark:text-white">
                        تفعيل الحظر المؤقت (Ban) للاعب: {rep.reportedName}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      حدد مدة الحظر بالدقائق
                    </span>
                  </div>

                  {/* Quick Preset Ban Buttons in Minutes */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PRESET_MINUTE_BANS.map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        disabled={busyUserId === rep.reportedId}
                        onClick={() =>
                          handleApplyBanMinutes(rep.reportedId, rep.reportedName, b.minutes, rep.id)
                        }
                        className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer shadow-2xs"
                      >
                        {b.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busyUserId === rep.reportedId}
                      onClick={() => handleApplyBanMinutes(rep.reportedId, rep.reportedName, 0, rep.id)}
                      className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-2xs"
                    >
                      رفع الحظر تماماً (0 دقيقة)
                    </button>
                  </div>

                  {/* Custom Minutes Input & Action */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        مدة حظر مخصصة:
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="525600"
                        value={currentMins}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setCustomMinutes((prev) => ({ ...prev, [rep.id]: val }));
                        }}
                        className="w-24 px-2.5 py-1.5 text-xs font-mono font-bold text-center border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-[#141824] dark:text-white focus:outline-none focus:border-rose-600"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">دقيقة</span>
                    </div>

                    <button
                      type="button"
                      disabled={busyUserId === rep.reportedId}
                      onClick={() =>
                        handleApplyBanMinutes(rep.reportedId, rep.reportedName, currentMins, rep.id)
                      }
                      className="px-4 py-1.5 text-xs font-black rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shadow-2xs disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>{busyUserId === rep.reportedId ? 'جاري التطبيق...' : `حظر لمدة ${currentMins} دقيقة`}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
