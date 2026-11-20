import React, { useEffect, useState } from 'react';
import { Award, Bell, Check, Coins, Copy, Crown, Eye, EyeOff, Headphones, LogOut, Moon, RefreshCw, ShieldCheck, Sparkles, Sun, Trophy } from 'lucide-react';
import { isUsernameAvailable, signOutUser, switchGoogleAccount } from '../firebase';
import { isAdminEmail } from '../shared/gameCatalog';
import type { AppReleaseInfo, AvatarId, PlayerProfile } from '../shared/types';
import { soundFx } from '../utils/sound';
import { AVATAR_OPTIONS, AvatarBadge } from './Avatars';
import { DAILY_TASK_DEFINITIONS, DailyTasksSection } from './DailyTasksSection';

interface ProfileViewProps {
  profile: PlayerProfile;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onUpdateProfile: (next: Partial<PlayerProfile>) => Promise<void>;
  onGoToStore: () => void;
  onOpenAdminPanel?: () => void;
  pendingAdminCount?: number;
  onEnterBasicRoom: (roomId: string) => void;
  onOpenDailyTasks: () => void;
  onOpenGameStats: () => void;
  onOpenDataProtection: () => void;
  onOpenSupport?: () => void;
  supportRepliedCount?: number;
  playTimeMin: number;
  voiceTimeMin: number;
  claimedTasks: Record<string, boolean>;
  onClaimTask: (taskId: string, rewardCoins: number) => Promise<void>;
  releaseInfo?: AppReleaseInfo | null;
  updateAvailable?: boolean;
  onCheckForUpdates?: () => Promise<'updated' | 'latest' | 'error'>;
  onApplyUpdate?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  theme,
  onToggleTheme,
  onUpdateProfile,
  onGoToStore,
  onOpenAdminPanel,
  pendingAdminCount = 0,
  onEnterBasicRoom,
  onOpenDailyTasks,
  onOpenGameStats,
  onOpenDataProtection,
  onOpenSupport,
  supportRepliedCount = 0,
  playTimeMin,
  voiceTimeMin,
  claimedTasks,
  onClaimTask,
  releaseInfo,
  updateAvailable = false,
  onCheckForUpdates,
  onApplyUpdate,
}) => {
  const readyTasksCount = DAILY_TASK_DEFINITIONS.filter((t) => {
    const current = t.category === 'play' ? playTimeMin : voiceTimeMin;
    return current >= t.targetMin && !claimedTasks[t.id];
  }).length;
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username || '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState<AvatarId>(profile.avatar);
  const [saved, setSaved] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<string | null>(null);
  const [showFullEmail, setShowFullEmail] = useState(false);
  const isAdmin = isAdminEmail(profile.email);

  const formatMaskedEmail = (email?: string) => {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const prefix = local.slice(0, 2);
    return `${prefix}${'•'.repeat(Math.max(3, Math.min(6, local.length - 2)))}@${domain}`;
  };

  useEffect(() => {
    setName(profile.name);
    setUsername(profile.username || '');
    setBio(profile.bio);
    setAvatar(profile.avatar);
  }, [profile.id, profile.name, profile.username, profile.bio, profile.avatar]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const trimmedName = name.trim() || 'لاعب يلا بلاي';
    const cleanUsername = username.trim().replace(/^@+/, '').toLowerCase();

    if (cleanUsername && /\s/.test(cleanUsername)) {
      setUsernameError('اليوزرنيم لا يجب أن يحتوي على مسافات');
      return;
    }

    if (cleanUsername && cleanUsername.length < 3) {
      setUsernameError('اليوزرنيم يجب ألا يقل عن 3 أحرف');
      return;
    }

    setSaving(true);
    setUsernameError(null);
    setSaveError(null);

    try {
      if (cleanUsername && cleanUsername !== (profile.username || '').toLowerCase()) {
        const available = await isUsernameAvailable(cleanUsername, profile.id);
        if (!available) {
          setUsernameError('هذا اليوزرنيم مستخدم مسبقاً من شخص آخر، اختر يوزراً غيره');
          setSaving(false);
          return;
        }
      }

      soundFx.tap();
      await onUpdateProfile({
        name: trimmedName.slice(0, 32),
        username: cleanUsername.slice(0, 24),
        bio: bio.trim().slice(0, 100),
        avatar,
      });
      setUsername(cleanUsername.slice(0, 24));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'تعذر حفظ الملف الشخصي، حاول مرة أخرى');
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchAccount = async () => {
    setSwitching(true);
    try {
      await switchGoogleAccount();
    } catch {
      // User closed popup or cancelled
    } finally {
      setSwitching(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#141824] dark:text-white">ملفي الشخصي</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
            {profile.email ? (
              <>
                <span>
                  مسجل بحساب Google:{' '}
                  <span dir="ltr" className="font-mono-num">
                    {showFullEmail ? profile.email : formatMaskedEmail(profile.email)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    setShowFullEmail((v) => !v);
                  }}
                  title={showFullEmail ? 'إخفاء البريد الإلكتروني' : 'إظهار البريد الإلكتروني'}
                  aria-label={showFullEmail ? 'إخفاء البريد الإلكتروني' : 'إظهار البريد الإلكتروني'}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md cursor-pointer"
                >
                  {showFullEmail ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  <span>{showFullEmail ? 'إخفاء' : 'إظهار'}</span>
                </button>
              </>
            ) : (
              'حسابك الشخصي في يلا بلاي'
            )}
            {isAdmin && (
              <>
                <span aria-hidden="true" className="mx-1">·</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">حساب الأدمن</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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
            disabled={switching}
            onClick={handleSwitchAccount}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${switching ? 'animate-spin' : ''}`} />
            <span>{switching ? 'جاري التبديل...' : 'تبديل حساب Google'}</span>
          </button>

          <button
            type="button"
            onClick={() => signOutUser()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-lg cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>

      {isAdmin && onOpenAdminPanel && (
        <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-[#141824] dark:text-white">
                صلاحيات الأدمن مفعّلة على حسابك
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-mono-num">
                طلبات الشحن المعلقة حالياً: {pendingAdminCount}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAdminPanel}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>مراجعة طلبات الشحن</span>
          </button>
        </div>
      )}

      {/* Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">رصيد العملات</p>
            <p className="text-2xl font-extrabold font-mono-num text-[#141824] dark:text-white mt-0.5">
              {profile.coins.toLocaleString('en-US')}
            </p>
            <button
              type="button"
              onClick={onGoToStore}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline mt-1 cursor-pointer"
            >
              المتجر وتاريخ المعاملات
            </button>
          </div>
          <Coins className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">عدد الانتصارات</p>
            <p className="text-2xl font-extrabold font-mono-num text-[#141824] dark:text-white mt-0.5">
              {profile.wins}
            </p>
          </div>
          <Trophy className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">الغرفة الأساسية الدائمة</p>
            {profile.basicRoomId ? (
              <button
                type="button"
                onClick={() => onEnterBasicRoom(profile.basicRoomId)}
                className="text-xs font-mono-num font-bold text-emerald-700 dark:text-emerald-400 hover:underline mt-1 cursor-pointer"
              >
                دخول ({profile.basicRoomId})
              </button>
            ) : (
              <button
                type="button"
                onClick={onGoToStore}
                className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline mt-1 cursor-pointer"
              >
                شراء بـ 2,000 عملة
              </button>
            )}
          </div>
          <Crown className="w-6 h-6 text-amber-500" />
        </div>
      </div>

      {/* Quick Feature Action Cards / Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            soundFx.tap();
            onOpenGameStats();
          }}
          className="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl flex items-center justify-between shadow-md hover:opacity-95 transition-opacity cursor-pointer text-right"
        >
          <div>
            <p className="text-xs opacity-90">تقرير الأداء</p>
            <p className="text-sm font-extrabold mt-0.5">إحصائيات نشاط الألعاب</p>
          </div>
          <Sparkles className="w-5 h-5 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => {
            soundFx.tap();
            onOpenDataProtection();
          }}
          className="p-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-xl flex items-center justify-between shadow-md hover:opacity-95 transition-opacity cursor-pointer text-right"
        >
          <div>
            <p className="text-xs opacity-90">الأمان والخصوصية</p>
            <p className="text-sm font-extrabold mt-0.5">حماية بيانات المستخدم</p>
          </div>
          <ShieldCheck className="w-5 h-5 shrink-0" />
        </button>
      </div>

      {/* Daily Tasks Embedded Directly in Profile */}
      <section
        id="profile-daily-tasks"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6"
      >
        <DailyTasksSection
          profile={profile}
          playTimeMin={playTimeMin}
          voiceTimeMin={voiceTimeMin}
          claimedTasks={claimedTasks}
          onClaimTask={onClaimTask}
        />
      </section>

      {/* Edit Form */}
      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6"
      >
        <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <AvatarBadge avatarId={avatar} size={68} />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-extrabold text-[#141824] dark:text-white">
                {name || 'لاعب جديد'}
              </p>
              {profile.username && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(profile.username || '').catch(() => {});
                    setCopiedUsername(true);
                    soundFx.tap();
                    setTimeout(() => setCopiedUsername(false), 2000);
                  }}
                  title="نسخ اليوزرنيم لمشاركته مع أصدقائك"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-mono-num font-bold cursor-pointer"
                  dir="ltr"
                >
                  <span>@{profile.username}</span>
                  {copiedUsername ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {bio || 'جاهز للتحدي في يلا بلاي'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            اختر شخصيتك
          </span>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
            {AVATAR_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAvatar(opt.id)}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                  avatar === opt.id
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 dark:border-blue-500'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <AvatarBadge avatarId={opt.id} size={42} />
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Daily Tasks & Support Quick Access */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('profile-daily-tasks');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else {
                onOpenDailyTasks();
              }
            }}
            className="p-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-right flex items-center justify-between cursor-pointer transition-colors"
          >
            <div className="space-y-1">
              <p className="text-sm font-extrabold text-[#141824] dark:text-white flex items-center gap-2">
                <span>المهام اليومية</span>
                {readyTasksCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-emerald-600 text-white font-mono-num">
                    {readyTasksCount} للاستلام
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                العب واجلس في الغرفة لربح واستلام العملات
              </p>
            </div>
            <Award className="w-6 h-6 text-amber-500 shrink-0" />
          </button>

          {onOpenSupport && (
            <button
              type="button"
              onClick={onOpenSupport}
              className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-right flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="space-y-1">
                <p className="text-sm font-extrabold text-[#141824] dark:text-white flex items-center gap-2">
                  <span>الدعم والشكاوى</span>
                  {supportRepliedCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-emerald-600 text-white font-mono-num">
                      {supportRepliedCount} تم الرد
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  رسائل الدعم والشكاوى والاقتراحات
                </p>
              </div>
              <Headphones className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="profile-name"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              الاسم المستعار
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-username"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              اليوزرنيم (فريد غير مكرر)
            </label>
            <input
              id="profile-username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setUsernameError(null);
              }}
              placeholder="مثل: hesham12"
              dir="ltr"
              maxLength={24}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-lg focus:outline-none focus:border-blue-600 text-right font-mono-num"
            />
            {usernameError && (
              <p className="text-[11px] text-rose-600 font-semibold">{usernameError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-bio"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              نبذة قصيرة
            </label>
            <input
              id="profile-bio"
              type="text"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={100}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {saveError && (
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
              {saveError}
            </span>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Check className="w-4 h-4" />
              تم حفظ التغييرات واليوزرنيم في حسابك بنجاح
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ الملف الشخصي'}
          </button>
        </div>
      </form>

      {/* App Release & Live Update Check Section */}
      {releaseInfo && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-base font-extrabold text-[#141824] dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{releaseInfo.titleAr}</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                الإصدار الحالي: v{releaseInfo.version}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {updateAvailable && onApplyUpdate ? (
                <button
                  type="button"
                  onClick={onApplyUpdate}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>تحديث الآن</span>
                </button>
              ) : onCheckForUpdates ? (
                <button
                  type="button"
                  disabled={checkingUpdate}
                  onClick={async () => {
                    soundFx.tap();
                    setCheckingUpdate(true);
                    setUpdateCheckStatus(null);
                    const result = await onCheckForUpdates();
                    setCheckingUpdate(false);
                    setUpdateCheckStatus(
                      result === 'updated'
                        ? 'يتوفر تحديث جديد الآن! اضغط تحديث الآن لتفعيله.'
                        : result === 'latest'
                          ? 'التطبيق محدّث إلى أحدث إصدار حالياً.'
                          : 'تعذر التحقق من التحديثات الآن، حاول مجدداً.'
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  <span>{checkingUpdate ? 'جاري الفحص...' : 'فحص التحديثات'}</span>
                </button>
              ) : null}
            </div>
          </div>

          {updateCheckStatus && (
            <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
              {updateCheckStatus}
            </p>
          )}

          <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-3">
            {releaseInfo.highlights.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                · {item}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
};
