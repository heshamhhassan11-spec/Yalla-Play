import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Crown, Mic, Moon, RotateCcw, ShieldCheck, Sparkles, Sun } from 'lucide-react';
import { signInWithGoogle, signInWithGoogleRedirect } from '../firebase';

interface LoginScreenProps {
  onSignedIn: (user: User) => Promise<void>;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

function mapAuthErrorToArabic(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google';

  if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
    return 'تم إغلاق نافذة تسجيل الدخول قبل اختيار الحساب، اضغط للمحاولة من جديد';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'تم إلغاء المحاولة السابقة، يمكنك المحاولة الآن';
  }
  if (code === 'auth/popup-blocked') {
    return 'المتصفح منع النافذة المنبثقة، استخدم زر الدخول بالتحويل المباشر بالأسفل';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'هذا النطاق غير مضاف في النطاقات المصرح بها في Firebase Auth';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بخادم Google، تأكد من اتصالك بالإنترنت وحاول مرة أخرى';
  }
  if (code === 'auth/too-many-requests') {
    return 'محاولات متكررة كثيرة، انتظر لحظات ثم أعد المحاولة';
  }
  if (code === 'auth/user-disabled') {
    return 'تم تعطيل هذا الحساب من قبل إدارة المصادقة';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'يوجد حساب مرتبط بطريقة دخول مختلفة، استخدم حساب Google الأساسي';
  }
  return `تعذر إتمام تسجيل الدخول بحساب Google (${code || msg})`;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onSignedIn,
  theme,
  onToggleTheme,
}) => {
  const [loading, setLoading] = useState(false);
  const [showCancelEscape, setShowCancelEscape] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      setShowCancelEscape(false);
      return;
    }
    const timer = setTimeout(() => setShowCancelEscape(true), 4000);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setStatusLabel('جاري فتح نافذة Google...');
    try {
      const user = await signInWithGoogle();
      if (user) {
        setStatusLabel('تم تأكيد الحساب، جاري تحميل ملفك...');
        await onSignedIn(user);
      } else {
        setStatusLabel('جاري التحويل إلى صفحة Google...');
      }
    } catch (err) {
      setError(mapAuthErrorToArabic(err));
      setStatusLabel(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRedirectFallback = async () => {
    setLoading(true);
    setError(null);
    setStatusLabel('جاري التحويل لصفحة تسجيل الدخول...');
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      setError(mapAuthErrorToArabic(err));
      setStatusLabel(null);
      setLoading(false);
    }
  };

  const handleResetAttempt = () => {
    setLoading(false);
    setShowCancelEscape(false);
    setStatusLabel(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB] dark:bg-[#090D16] flex items-center justify-center p-4 sm:p-8 transition-colors">
      <div className="max-w-4xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2 shadow-sm">
        {/* Right Column (RTL): Login Card */}
        <div className="p-7 sm:p-10 flex flex-col justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-2xl font-extrabold text-[#141824] dark:text-white tracking-tight">
                يلا بلاي · YallaPlay
              </div>
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={theme === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
                <span>{theme === 'dark' ? 'فاتح' : 'داكن'}</span>
              </button>
            </div>

            <h1 className="text-3xl font-extrabold text-[#141824] dark:text-white leading-tight">
              سجّل دخولك وابدأ السهرة مع أصدقائك
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              أنشئ غرفتك الصوتية المجانية أو فعّل الغرفة الأساسية الدائمة بـ 8 مستويات، واستمتع
              باللعب الجماعي وتبادل الهدايا مباشرة.
            </p>
          </div>

          <div className="space-y-3">
            {error && (
              <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold px-3.5 py-2.5 rounded-lg leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleSignIn}
              className="w-full py-3.5 px-5 bg-[#141824] dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 disabled:bg-slate-400 dark:disabled:bg-slate-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:cursor-wait"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.31 0 3.25 2.69 1.28 6.61l3.67 2.84C5.82 6.86 8.66 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.71 2.88c2.17-2 3.71-4.95 3.71-8.7z"
                />
                <path
                  fill="#FBBC05"
                  d="M4.95 14.55A7.01 7.01 0 0 1 4.59 12c0-.89.15-1.75.41-2.55L1.33 6.61A11.97 11.97 0 0 0 0 12c0 1.93.46 3.76 1.28 5.39l3.67-2.84z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.88c-1.08.72-2.45 1.16-4.22 1.16-3.34 0-6.18-1.86-7.05-4.45l-3.67 2.84C3.25 21.31 7.31 24 12 24z"
                />
              </svg>
              <span>{loading && statusLabel ? statusLabel : 'تسجيل الدخول بحساب Google'}</span>
            </button>

            {showCancelEscape && loading && (
              <button
                type="button"
                onClick={handleResetAttempt}
                className="w-full py-2 px-4 text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إلغاء المحاولة وإعادة التنشيط</span>
              </button>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={handleRedirectFallback}
              className="w-full py-2.5 px-4 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              الدخول عبر التحويل المباشر (إذا لم تستجب النافذة المنبثقة)
            </button>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
              يُحفظ رصيد عملاتك وغرفتك الدائمة ومستوياتها تلقائياً على حسابك
            </p>
          </div>
        </div>

        {/* Left Column (RTL): Platform Features */}
        <div className="bg-[#141824] dark:bg-slate-950 text-white p-7 sm:p-10 flex flex-col justify-between gap-6 border-t md:border-t-0 md:border-r border-slate-800">
          <div className="space-y-2">
            <p className="text-xs font-bold text-blue-400">منصة الترفيه الجماعي</p>
            <h2 className="text-xl font-extrabold leading-snug">
              غرف صوتية حتى 14 مايك وأشهر 6 ألعاب تفاعلية
            </h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Mic className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold">غرف مجانية وأساسية</p>
                <p className="text-xs text-slate-300 mt-0.5">
                  غرفة مجانية بـ 10 مايكات لمدة 6 ساعات، أو غرفة أساسية دائمة بـ 8 مستويات
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold">نظام ترقية وهدايا متكامل</p>
                <p className="text-xs text-slate-300 mt-0.5">
                  51 هدية داخل الغرفة الصوتية، كل 10 عملات تمنح غرفتك الأساسية نقطة مستوى
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <p className="text-sm font-bold">لودو · السلم والثعبان · بنك الحظ · چاكارو</p>
                <p className="text-xs text-slate-300 mt-0.5">
                  مع الرسم والتخمين وسباق السيارات بتزامن لحظي مباشر
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-white/10 pt-4">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>حساب محمي عبر مصادقة Google الآمنة</span>
          </div>
        </div>
      </div>
    </div>
  );
};
