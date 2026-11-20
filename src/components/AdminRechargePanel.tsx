import React, { useMemo, useState } from 'react';
import {
  Check,
  Coins,
  Eye,
  Image as ImageIcon,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { approveRechargeRequest, rejectRechargeRequest } from '../firebase';
import { RECHARGE_METHODS } from '../shared/gameCatalog';
import type { RechargeRequest } from '../shared/types';
import { soundFx } from '../utils/sound';

export type AdminFilterTab = 'pending' | 'approved' | 'rejected' | 'all';

interface AdminRechargePanelProps {
  adminEmail: string;
  requests: RechargeRequest[];
  activeFilter?: AdminFilterTab;
  onChangeFilter?: (tab: AdminFilterTab) => void;
}

function formatReqDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

export const AdminRechargePanel: React.FC<AdminRechargePanelProps> = ({
  adminEmail,
  requests,
  activeFilter,
  onChangeFilter,
}) => {
  const [internalFilter, setInternalFilter] = useState<AdminFilterTab>('pending');
  const filter = activeFilter ?? internalFilter;
  const setFilter = onChangeFilter ?? setInternalFilter;

  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of requests) {
      if (r.status === 'pending') pending += 1;
      else if (r.status === 'approved') approved += 1;
      else if (r.status === 'rejected') rejected += 1;
    }
    return { pending, approved, rejected, all: requests.length };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    if (filter === 'all') return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const handleApprove = async (req: RechargeRequest) => {
    setBusyId(req.requestId);
    setFeedback(null);
    try {
      await approveRechargeRequest(req, adminEmail, notesById[req.requestId] || '');
      soundFx.win();
      setFeedback({
        kind: 'ok',
        text: `تمت الموافقة على طلب ${req.userName} وإرسال ${req.coins.toLocaleString('en-US')} عملة إلى حسابه بنجاح.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'تعذر اعتماد الطلب وإرسال العملات',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (req: RechargeRequest) => {
    setBusyId(req.requestId);
    setFeedback(null);
    try {
      await rejectRechargeRequest(req, adminEmail, notesById[req.requestId] || '');
      soundFx.tap();
      setFeedback({
        kind: 'ok',
        text: `تم رفض طلب ${req.userName} وإزالته من الطلبات المعلقة.`,
      });
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'تعذر رفض الطلب',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      id="admin-recharge-panel"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-[#141824] dark:text-white">
              لوحة الأدمن · طلبات الشحن
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span>حساب الإدارة: {adminEmail}</span>
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span className="font-mono-num">{counts.pending} طلب معلق</span>
            </p>
          </div>
        </div>

        {/* 4 Status Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {(
            [
              { id: 'pending', label: `الطلبات المعلقة (${counts.pending})` },
              { id: 'approved', label: `الطلبات المقبولة (${counts.approved})` },
              { id: 'rejected', label: `الطلبات المرفوضة (${counts.rejected})` },
              { id: 'all', label: `الكل (${counts.all})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-[#141824] dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div
          className={`text-xs font-semibold px-4 py-3 rounded-xl border ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {filteredRequests.length === 0 ? (
        <div className="py-10 text-center space-y-1.5 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {filter === 'pending'
              ? 'لا توجد طلبات شحن معلقة حالياً'
              : filter === 'approved'
                ? 'لا توجد طلبات مقبولة حتى الآن'
                : filter === 'rejected'
                  ? 'لا توجد طلبات مرفوضة حتى الآن'
                  : 'لا توجد طلبات شحن مسجلة حتى الآن'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ستظهر هنا جميع الطلبات فور إرسالها عبر فودافون كاش أو إنستا باي
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredRequests.map((req) => {
            const methodMeta = RECHARGE_METHODS[req.paymentMethod];
            const isBusy = busyId === req.requestId;

            return (
              <div
                key={req.requestId}
                className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {/* Optional Receipt Thumbnail */}
                  {req.receiptImage ? (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(req.receiptImage)}
                      className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 group cursor-pointer bg-slate-100 dark:bg-slate-800"
                      title="عرض صورة التحويل"
                    >
                      <img
                        src={req.receiptImage}
                        alt={`إيصال تحويل ${req.userName}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Eye className="w-4 h-4" />
                      </span>
                    </button>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center justify-center text-[10px] text-slate-400 shrink-0 px-1 text-center">
                      <ImageIcon className="w-4 h-4 mb-0.5 opacity-70" />
                      <span>بدون صورة</span>
                    </div>
                  )}

                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-[#141824] dark:text-white">
                        {req.userName}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {req.userEmail}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                      <span
                        className={`text-xs font-bold ${
                          req.status === 'pending'
                            ? 'text-amber-600 dark:text-amber-400'
                            : req.status === 'approved'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {req.status === 'pending'
                          ? 'معلق'
                          : req.status === 'approved'
                            ? 'مقبول'
                            : 'مرفوض'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-mono-num">
                      <span className="inline-flex items-center gap-1 font-extrabold text-amber-700 dark:text-amber-400">
                        <Coins className="w-3.5 h-3.5" />
                        +{req.coins.toLocaleString('en-US')} عملة
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-bold">{req.priceEgp} جنيه</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        {methodMeta.labelAr} ({req.targetNumber})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {formatReqDate(req.createdAtMs)}
                      </span>
                    </div>

                    {(req.senderInfo || req.adminNote) && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                        {req.senderInfo && (
                          <p>بيانات التحويل من المرسل: {req.senderInfo}</p>
                        )}
                        {req.status !== 'pending' && req.adminNote && (
                          <p>ملاحظة المراجعة: {req.adminNote}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Controls for Pending Requests */}
                {req.status === 'pending' ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={notesById[req.requestId] || ''}
                      onChange={(e) =>
                        setNotesById((prev) => ({ ...prev, [req.requestId]: e.target.value }))
                      }
                      maxLength={120}
                      placeholder="ملاحظة اختيارية (مثلاً سبب الرفض)"
                      className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#141824] dark:text-white rounded-lg focus:outline-none focus:border-blue-600 sm:w-52"
                    />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleApprove(req)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isBusy ? 'جاري التنفيذ...' : 'موافقة وإرسال العملات'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleReject(req)}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>رفض</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num shrink-0">
                    تمت المراجعة · {formatReqDate(req.updatedAtMs)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen Receipt Preview Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#141824] dark:text-white">
                صورة إيصال التحويل
              </h3>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-xl bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-2">
              <img
                src={previewImage}
                alt="صورة التحويل"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[64vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
