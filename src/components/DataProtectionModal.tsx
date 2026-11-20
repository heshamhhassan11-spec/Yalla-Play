import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Server,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import type { PlayerProfile } from '../shared/types';
import { soundFx } from '../utils/sound';

interface DataProtectionModalProps {
  profile: PlayerProfile;
  onUpdatePrivacy?: (
    patch: Partial<
      Pick<
        PlayerProfile,
        'privacyHideOnline' | 'privacyHideRoom' | 'privacyBlockFriendRequests'
      >
    >
  ) => Promise<void>;
  onSecureSignOut?: () => Promise<void>;
  onOpenSupport?: () => void;
  onClose: () => void;
}

export const DataProtectionModal: React.FC<DataProtectionModalProps> = ({
  profile,
  onUpdatePrivacy,
  onSecureSignOut,
  onOpenSupport,
  onClose,
}) => {
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const handleTogglePrivacy = async (
    key: 'privacyHideOnline' | 'privacyHideRoom' | 'privacyBlockFriendRequests',
    nextValue: boolean,
    enabledMsg: string,
    disabledMsg: string
  ) => {
    if (!onUpdatePrivacy || savingKey) return;
    soundFx.tap();
    setSavingKey(key);
    try {
      await onUpdatePrivacy({ [key]: nextValue });
      soundFx.correct();
      setStatusNotice(nextValue ? enabledMsg : disabledMsg);
    } catch {
      setStatusNotice('تعذر حفظ إعداد الخصوصية الآن، يرجى المحاولة مرة أخرى.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleExportMyData = () => {
    soundFx.tap();
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        uid: profile.id,
        name: profile.name,
        username: profile.username || '',
        bio: profile.bio,
        coins: profile.coins,
        wins: profile.wins,
        gamesPlayed: profile.gamesPlayed,
        basicRoomId: profile.basicRoomId || null,
        privacySettings: {
          hideOnlineStatus: Boolean(profile.privacyHideOnline),
          hideCurrentRoom: Boolean(profile.privacyHideRoom),
          blockFriendRequests: Boolean(profile.privacyBlockFriendRequests),
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yallaplay-profile-${profile.username || profile.id.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusNotice('تم تنزيل نسخة آمنة من بيانات ملفك الشخصي وإعدادات الخصوصية بصيغة JSON.');
    } catch {
      setStatusNotice('تعذر تصدير البيانات من المتصفح.');
    }
  };

  const clearLocalStorageKeys = () => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('yallaplay_') && key !== 'yallaplay_theme') {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    return keysToRemove.length;
  };

  const handleClearLocalCache = () => {
    soundFx.tap();
    try {
      const count = clearLocalStorageKeys();
      setStatusNotice(
        `تم مسح ذاكرة التخزين المؤقت المحلية (${count} سجل) مع إبقاء حسابك ومشترياتك آمنة.`
      );
    } catch {
      setStatusNotice('تعذر مسح التخزين المحلي.');
    }
  };

  const handleSecureSignOutClick = async () => {
    if (!onSecureSignOut || signingOut) return;
    soundFx.tap();
    setSigningOut(true);
    try {
      clearLocalStorageKeys();
      sessionStorage.clear();
      onClose();
      await onSecureSignOut();
    } catch {
      setSigningOut(false);
      setStatusNotice('تعذر تسجيل الخروج الآمن الآن.');
    }
  };

  const isEmailVerified = Boolean(auth.currentUser?.emailVerified);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="حماية بيانات المستخدم"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-5 sm:p-6 space-y-5 shadow-2xl my-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#141824] dark:text-white">
                مركز الأمان وحماية بيانات المستخدم
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                الخصوصية، التحكم في الظهور، وعزل المعلومات الشخصية في يلا بلاي
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
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Protection Status Summary */}
        <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>حماية الحساب مفعّلة ({isEmailVerified ? 'بريد Google موثّق' : 'جلسة موثّقة'})</span>
          </div>
          <span className="text-[11px] font-mono-num text-emerald-700 dark:text-emerald-300">
            ID: {profile.id.slice(0, 10)}…
          </span>
        </div>

        {statusNotice && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs font-semibold rounded-xl">
            {statusNotice}
          </div>
        )}

        {/* Interactive User Privacy Controls */}
        {onUpdatePrivacy && (
          <div className="space-y-2.5">
            <p className="text-xs font-extrabold text-[#141824] dark:text-white">
              إعدادات الخصوصية والتحكم في بياناتك
            </p>

            <label className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3 cursor-pointer">
              <div className="flex items-start gap-2.5 min-w-0">
                <EyeOff className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[#141824] dark:text-white">
                    إخفاء حالة الاتصال وآخر ظهور
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    تظهر كـ «غير متصل» لجميع الأصدقاء مع إخفاء توقيت آخر ظهور
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(profile.privacyHideOnline)}
                disabled={savingKey === 'privacyHideOnline'}
                onChange={(e) =>
                  handleTogglePrivacy(
                    'privacyHideOnline',
                    e.target.checked,
                    'تم تفعيل وضع التخفي: حالتك وآخر ظهور مخفيان عن الأصدقاء.',
                    'تم إظهار حالة الاتصال للأصدقاء.'
                  )
                }
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
              />
            </label>

            <label className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3 cursor-pointer">
              <div className="flex items-start gap-2.5 min-w-0">
                <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[#141824] dark:text-white">
                    إخفاء الغرفة الصوتية الحالية عن الأصدقاء
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    لا يظهر اسم الغرفة أو زر الانضمام بجانب اسمك عند الأصدقاء
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(profile.privacyHideRoom)}
                disabled={savingKey === 'privacyHideRoom'}
                onChange={(e) =>
                  handleTogglePrivacy(
                    'privacyHideRoom',
                    e.target.checked,
                    'تم إخفاء الغرفة الصوتية التي تتواجد بها عن الأصدقاء.',
                    'تم السماح للأصدقاء برؤية الغرف العامة التي تتواجد بها.'
                  )
                }
                className="w-4 h-4 accent-blue-600 rounded cursor-pointer shrink-0"
              />
            </label>

            <label className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3 cursor-pointer">
              <div className="flex items-start gap-2.5 min-w-0">
                <UserX className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-[#141824] dark:text-white">
                    منع استقبال طلبات صداقة جديدة
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    يمنع أي مستخدم من إرسال طلبات صداقة إليك في قاعدة البيانات
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(profile.privacyBlockFriendRequests)}
                disabled={savingKey === 'privacyBlockFriendRequests'}
                onChange={(e) =>
                  handleTogglePrivacy(
                    'privacyBlockFriendRequests',
                    e.target.checked,
                    'تم إيقاف استقبال طلبات الصداقة الجديدة بنجاح.',
                    'تم تفعيل استقبال طلبات الصداقة من المستخدمين.'
                  )
                }
                className="w-4 h-4 accent-rose-600 rounded cursor-pointer shrink-0"
              />
            </label>
          </div>
        )}

        {/* Security Pillars */}
        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-0.5">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-start gap-3">
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-extrabold text-[#141824] dark:text-white">
                عزل البيانات الشخصية الحساسة (PII Isolation)
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                بريدك الإلكتروني وصورة حسابك محفوظة في مسار خاص لا يراه أي لاعب آخر، ولا يظهر سوى الاسم المستعار والأفاتار واليوزرنيم.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-start gap-3">
            <Server className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-extrabold text-[#141824] dark:text-white">
                قواعد أمان صارمة للرسائل والمحادثات الخاصة
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                رسائل الأصدقاء المباشرة وتذاكر الدعم محمية بقواعد وصول تمنع أي مستخدم غير مشارك من قراءتها، كما تُحفظ رموز القفل في الخادم فقط.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-start gap-3">
            <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-extrabold text-[#141824] dark:text-white">
                حماية الهوية والمصادقة المعتمدة
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                يتم التحقق من الجلسة عبر Google ولا نقوم بتخزين أي كلمات مرور على الخادم مطلقاً.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl flex items-start gap-3">
            <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-extrabold text-[#141824] dark:text-white">
                عدم مشاركة البيانات مع أطراف خارجية
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                لا نبيع أو نشارك بيانات اللاعبين أو سجل محادثاتهم مع أي جهة إعلانية أو طرف ثالث.
              </p>
            </div>
          </div>
        </div>

        {/* User Privacy Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleExportMyData}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-xl cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير بياناتي (JSON)</span>
          </button>

          <button
            type="button"
            onClick={handleClearLocalCache}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>مسح الكاش المحلي</span>
          </button>

          {onSecureSignOut && (
            <button
              type="button"
              disabled={signingOut}
              onClick={handleSecureSignOutClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-xl cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{signingOut ? 'جاري التأمين...' : 'خروج آمن ومسح الجلسة'}</span>
            </button>
          )}

          {onOpenSupport && (
            <button
              type="button"
              onClick={() => {
                soundFx.tap();
                onClose();
                onOpenSupport();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl cursor-pointer"
            >
              <span>طلب خصوصية / دعم</span>
            </button>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              soundFx.tap();
              onClose();
            }}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
