import React, { useState } from 'react';
import { AlertTriangle, Check, MessageSquareWarning, Send, User, X } from 'lucide-react';
import { submitReport } from '../firebase';
import type { AvatarId, PlayerProfile } from '../shared/types';
import { soundFx } from '../utils/sound';
import { AvatarBadge } from './Avatars';

interface ReportModalProps {
  profile: PlayerProfile;
  reportedUser?: { id: string; name: string } | null;
  reportedMessage?: { id: string; text: string } | null;
  availableUsers?: Array<{ id: string; name: string; avatar?: AvatarId }>;
  onClose: () => void;
}

const REPORT_REASONS = [
  'شتم أو ألفاظ نابية في الدردشة أو الصوت',
  'سلوك غير لائق أو مضايقة وتتبع',
  'غش وتلاعب أو استغلال ثغرات في الألعاب',
  'تخريب اللعبة أو مغادرة متعمدة متكررة',
  'انتحال شخصية أو سبام ونشر روابط',
  'أخرى',
];

export const ReportModal: React.FC<ReportModalProps> = ({
  profile,
  reportedUser,
  reportedMessage,
  availableUsers = [],
  onClose,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<{ id: string; name: string } | null>(
    reportedUser || (availableUsers.length > 0 ? { id: availableUsers[0].id, name: availableUsers[0].name } : null)
  );
  const [customName, setCustomName] = useState('');
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const targetId = selectedTarget?.id || (customName.trim() ? `user_${customName.trim()}` : '');
    const targetName = selectedTarget?.name || customName.trim();

    if (!targetId || !targetName) {
      setError('يرجى تحديد أو كتابة اسم اللاعب المراد الإبلاغ عنه');
      return;
    }
    if (targetId === profile.id) {
      setError('لا يمكنك الإبلاغ عن نفسك!');
      return;
    }

    setSubmitting(true);
    setError(null);
    soundFx.tap();

    try {
      await submitReport(
        profile.id,
        profile.name,
        targetId,
        targetName,
        reason,
        description.trim(),
        reportedMessage?.text
      );
      soundFx.correct();
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال البلاغ');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/70 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#141824] dark:text-white">
                تقديم بلاغ عن مخالفة
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                يصل البلاغ مباشرة إلى الإدارة لاتخاذ إجراء الحظر المناسب
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 mx-auto flex items-center justify-center font-bold text-xl shadow-xs">
              ✓
            </div>
            <h4 className="text-base font-extrabold text-[#141824] dark:text-white">
              تم إرسال البلاغ بنجاح!
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-xs mx-auto">
              وصل البلاغ إلى لوحة تحكم الإدارة لمراجعته وتطبيق الحظر المؤقت على المخالف فوراً.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Target User Section */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                اللاعب المبلّغ عنه:
              </label>

              {reportedUser ? (
                <div className="p-3 bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="text-xs font-extrabold text-rose-950 dark:text-rose-200">
                      {reportedUser.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {reportedUser.id.slice(0, 10)}
                  </span>
                </div>
              ) : availableUsers.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                    {availableUsers.map((u) => {
                      const selected = selectedTarget?.id === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setSelectedTarget({ id: u.id, name: u.name });
                            setCustomName('');
                          }}
                          className={`p-2 rounded-lg text-right flex items-center gap-2 transition-all cursor-pointer ${
                            selected
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <AvatarBadge avatarId={u.avatar || 'falcon'} size={24} />
                          <span className="text-xs font-bold truncate flex-1">{u.name}</span>
                          {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="اكتب اسم أو يوزر اللاعب..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-rose-600"
                />
              )}
            </div>

            {reportedMessage && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-xl space-y-1">
                <p className="text-[11px] font-extrabold text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
                  <MessageSquareWarning className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>الرسالة / الشتيمة المُبلغ عنها:</span>
                </p>
                <p className="text-xs font-bold text-[#141824] dark:text-white bg-white/80 dark:bg-slate-900/70 px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900 break-words">
                  «{reportedMessage.text}»
                </p>
              </div>
            )}

            {/* Reasons List */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                سبب البلاغ:
              </label>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                      reason === r
                        ? 'border-rose-600 bg-rose-50/80 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-850'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                تفاصيل إضافية (اختياري)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="اكتب تفاصيل المخالفة لتساعد الإدارة في اتخاذ القرار..."
                className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-rose-600 resize-none"
              />
            </div>

            {error && <p className="text-xs text-rose-600 font-bold">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {submitting
                    ? 'جاري الإرسال...'
                    : reportedMessage
                      ? 'إرسال البلاغ على الرسالة'
                      : 'إرسال البلاغ'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
