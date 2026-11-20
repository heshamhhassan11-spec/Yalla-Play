import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Crown,
  Gamepad2,
  KeyRound,
  Lock,
  Mic,
  Moon,
  Plus,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Users,
} from 'lucide-react';
import { GAME_COVER_IMAGES } from '../constants/gameAssets';
import {
  BASIC_ROOM_GAMES,
  BASIC_ROOM_PRICE_COINS,
  GAME_CATALOG,
  getRoomCapabilities,
} from '../shared/gameCatalog';
import type { GameType, PlayerProfile, RoomSummary } from '../shared/types';
import { soundFx } from '../utils/sound';

interface LobbyViewProps {
  mode: 'rooms' | 'games';
  profile: PlayerProfile;
  rooms: RoomSummary[];
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onJoinRoom: (code: string) => void;
  onOpenBasicRoom: () => void;
  onOpenCreateRoom: (initialGame?: GameType) => void;
  onOpenFriends?: () => void;
  onOpenGameStats?: () => void;
  onOpenDataProtection?: () => void;
}

const GameCoverImage: React.FC<{ gameType: GameType; title: string }> = ({
  gameType,
  title,
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center gap-2 text-white p-4"
        style={{ backgroundColor: GAME_CATALOG[gameType].accentHex }}
      >
        <Gamepad2 className="w-9 h-9 opacity-90" />
        <span className="text-sm font-bold">{title}</span>
      </div>
    );
  }

  return (
    <img
      src={GAME_COVER_IMAGES[gameType]}
      alt={title}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
};

function formatSummaryDuration(expiresAtMs: number): string {
  if (!expiresAtMs) return 'دائمة (لا تقفل)';
  const diff = Math.max(0, expiresAtMs - Date.now());
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `متبقي ${hrs} س ${mins} د`;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  mode,
  profile,
  rooms,
  theme,
  onToggleTheme,
  onJoinRoom,
  onOpenBasicRoom,
  onOpenCreateRoom,
  onOpenFriends,
  onOpenGameStats,
  onOpenDataProtection,
}) => {
  const [filter, setFilter] = useState<GameType | 'all'>('all');
  const [gamesTierFilter, setGamesTierFilter] = useState<'all' | 'free' | 'basic'>('all');
  const [joinCode, setJoinCode] = useState('');

  const filteredRooms =
    filter === 'all' ? rooms : rooms.filter((r) => r.gameType === filter);

  const displayedCatalogGames = BASIC_ROOM_GAMES.filter((gt) => {
    const meta = GAME_CATALOG[gt];
    if (gamesTierFilter === 'free') return !meta.basicOnly;
    if (gamesTierFilter === 'basic') return Boolean(meta.basicOnly);
    return true;
  });

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) return;
    soundFx.tap();
    onJoinRoom(cleaned);
  };

  if (mode === 'games') {
    return (
      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
              <Gamepad2 className="w-4 h-4" />
              <span>مكتبة ألعاب يلا بلاي التفاعلية</span>
            </div>
            <h1 className="text-3xl font-extrabold text-[#141824] dark:text-white">
              ألعاب الغرف الصوتية
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300">
              تضم الغرفة المجانية لعبتي لودو والسلم والثعبان، وتفتح الغرفة الأساسية جميع الألعاب
              الستة مع مؤقت دور 25 ثانية وتزامن لحظي مباشر.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/75 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  soundFx.tap();
                  setGamesTierFilter('all');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gamesTierFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-[#141824] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
                }`}
              >
                الكل ({BASIC_ROOM_GAMES.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFx.tap();
                  setGamesTierFilter('free');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gamesTierFilter === 'free'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
                }`}
              >
                المجانية (2)
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFx.tap();
                  setGamesTierFilter('basic');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gamesTierFilter === 'basic'
                    ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
                }`}
              >
                الغرفة الأساسية (4)
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0 shadow-2xs whitespace-nowrap"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
              <span>{theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayedCatalogGames.map((gt) => {
            const game = GAME_CATALOG[gt];
            const liveMatchingRoom = rooms.find((r) => r.gameType === gt && !r.isPrivate);
            const matchingCount = rooms.filter((r) => r.gameType === gt && !r.isPrivate).length;
            return (
              <article
                key={gt}
                className="group bg-white dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col sm:flex-row items-stretch hover:border-blue-400/70 dark:hover:border-blue-500/70 shadow-xs hover:shadow-md transition-all"
              >
                <div className="sm:w-56 aspect-[4/3] sm:aspect-auto shrink-0 bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                  <GameCoverImage gameType={gt} title={game.titleAr} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent sm:hidden" />
                  <div
                    className="hidden sm:block absolute inset-y-0 right-0 w-1"
                    style={{ backgroundColor: game.accentHex }}
                  />
                </div>
                <div className="p-5 flex flex-col justify-between gap-4 flex-1">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: game.accentHex }}
                      />
                      <span className="font-mono-num">{game.playersRange}</span>
                      <span aria-hidden="true">·</span>
                      <span>{game.durationLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          game.basicOnly
                            ? 'font-bold text-amber-600 dark:text-amber-400'
                            : 'font-semibold text-emerald-700 dark:text-emerald-400'
                        }
                      >
                        {game.basicOnly ? 'الغرفة الأساسية' : 'مجانية وأساسية'}
                      </span>
                      {matchingCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num font-semibold text-blue-600 dark:text-blue-400">
                            {matchingCount} غرفة نشطة
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="text-xl font-extrabold text-[#141824] dark:text-white">
                      {game.titleAr}
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {game.subtitleAr}
                    </p>
                    <ul className="space-y-1 pt-1 text-xs text-slate-500 dark:text-slate-400 list-disc list-inside">
                      {game.rulesAr.map((rule, idx) => (
                        <li key={idx}>{rule}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.tap();
                        onOpenCreateRoom(gt);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>تشغيل في غرفة جديدة</span>
                    </button>

                    {liveMatchingRoom && (
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.tap();
                          onJoinRoom(liveMatchingRoom.code);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#141824] dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>انضمام لغرفة مفتوحة ({liveMatchingRoom.code})</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-[1360px] mx-auto px-4 sm:px-6 py-7 space-y-10">
      {/* Hero Split */}
      <section className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch shadow-xs">
        <div className="flex flex-col justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
                أهلاً {profile.name} · غرف صوتية وألعاب جماعية
              </p>
              <button
                type="button"
                onClick={onToggleTheme}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shrink-0"
              >
                {theme === 'dark' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
                <span>{theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</span>
              </button>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#141824] dark:text-white leading-tight">
              افتح غرفتك الصوتية والعب لودو وبنك الحظ وچاكارو مباشرة
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              ابدأ بغرفة مجانية (10 مايكات لمدة 6 ساعات) أو فعّل غرفتك الأساسية الدائمة بـ 2,000
              عملة لفتح 8 مستويات و14 مايك و6 ألعاب و51 هدية صوتية بمؤقت دور حي لكل الألعاب.
            </p>
          </div>

          <div className="space-y-3">
            <form onSubmit={handleQuickJoin} className="flex flex-wrap gap-2.5 max-w-md">
              <div className="relative flex-1 min-w-[180px]">
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="أدخل كود الغرفة (مثل ID1001)"
                  dir="ltr"
                  className="w-full pr-9 pl-3 py-2.5 text-sm font-mono-num uppercase border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-xl focus:outline-none focus:border-blue-600 text-right"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#141824] dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
              >
                انضمام بالكود
              </button>
            </form>

            {profile.basicRoomId && (
              <div>
                <button
                  type="button"
                  onClick={onOpenBasicRoom}
                  className="inline-flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 cursor-pointer"
                >
                  <Crown className="w-4 h-4" />
                  <span>فتح غرفتي الأساسية المثبتة ({profile.basicRoomId})</span>
                </button>
              </div>
            )}

            {(onOpenFriends || onOpenGameStats || onOpenDataProtection) && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {onOpenFriends && (
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      onOpenFriends();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>الأصدقاء والدردشة</span>
                  </button>
                )}
                {onOpenGameStats && (
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      onOpenGameStats();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>إحصائيات الألعاب</span>
                  </button>
                )}
                {onOpenDataProtection && (
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      onOpenDataProtection();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>حماية البيانات</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2x2 Featured Game Art Grid */}
        <div className="grid grid-cols-2 gap-3.5">
          {(['ludo', 'snakes', 'bank', 'jackaroo'] as GameType[]).map((gt) => {
            const game = GAME_CATALOG[gt];
            return (
              <button
                key={gt}
                type="button"
                onClick={() => {
                  soundFx.tap();
                  onOpenCreateRoom(gt);
                }}
                className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 text-right cursor-pointer shadow-2xs hover:shadow-md transition-all"
              >
                <GameCoverImage gameType={gt} title={game.titleAr} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute bottom-3 right-3.5 left-3.5 text-white">
                  <p className="text-sm font-extrabold leading-snug">{game.titleAr}</p>
                  <p className="text-[11px] text-white/80">{game.playersRange}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active Rooms Section with Expanded Details */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-[#141824] dark:text-white flex items-center gap-2">
              <Mic className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>الغرف الصوتية المباشرة</span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              تفاصيل كل غرفة مفتوحة، مستوى الترقية، عدد المايكات والمدة قبل الدخول
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                filter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-[#141824] dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
              }`}
            >
              الكل ({rooms.length})
            </button>
            {BASIC_ROOM_GAMES.map((gt) => (
              <button
                key={gt}
                type="button"
                onClick={() => setFilter(gt)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  filter === gt
                    ? 'bg-white dark:bg-slate-900 text-[#141824] dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
                }`}
              >
                {GAME_CATALOG[gt].titleAr}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {filteredRooms.map((room) => {
            const meta = GAME_CATALOG[room.gameType];
            const caps = getRoomCapabilities(room.tier, room.xp);
            const micRatio = Math.min(
              100,
              Math.round((room.seatedCount / Math.max(1, room.maxSeats)) * 100)
            );
            return (
              <article
                key={room.id}
                className="group bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between transition-all hover:border-blue-400/70 dark:hover:border-blue-500/70 shadow-2xs hover:shadow-md"
              >
                <div>
                  <div className="relative aspect-[16/10] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <GameCoverImage gameType={room.gameType} title={meta.titleAr} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-2.5 right-3 left-3 flex items-center justify-between text-white text-xs">
                      <span className="font-bold flex items-center gap-1">
                        {room.tier === 'basic' && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                        {room.tier === 'basic' ? `أساسية م${room.level}` : 'غرفة مجانية'}
                        {room.isLocked && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-rose-600/90 text-white px-1.5 py-0.5 rounded">
                            <Lock className="w-2.5 h-2.5" />
                            <span>{room.hasLockPin ? 'برمز' : 'مقفلة'}</span>
                          </span>
                        )}
                      </span>
                      <span className="font-mono-num font-bold opacity-95">
                        {room.isPinnedId ? `مثبت ${room.code}` : room.code}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: meta.accentHex }}
                        />
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          {meta.titleAr}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">المالك: {room.hostName}</span>
                      </div>
                      <h3 className="text-base font-extrabold text-[#141824] dark:text-white truncate mt-1">
                        {room.title}
                      </h3>
                    </div>

                    {/* Expanded Room Key Specs */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>المدة</span>
                        </span>
                        <span className="font-bold text-[#141824] dark:text-slate-200 font-mono-num">
                          {formatSummaryDuration(room.expiresAtMs)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span>الحضور</span>
                        </span>
                        <span className="font-bold text-[#141824] dark:text-slate-200 font-mono-num">
                          {room.playerCount} متواجد
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Gamepad2 className="w-3 h-3" />
                          <span>الألعاب</span>
                        </span>
                        <span className="font-bold text-[#141824] dark:text-slate-200 font-mono-num">
                          {caps.allowedGames.length} ألعاب
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          <span>الإدارة</span>
                        </span>
                        <span className="font-bold text-[#141824] dark:text-slate-200 font-mono-num">
                          {caps.maxMods} مشرف
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 pt-0.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Mic className="w-3 h-3" />
                          <span>إشغال المايكات</span>
                        </span>
                        <span className="font-mono-num font-bold text-[#141824] dark:text-slate-200">
                          {room.seatedCount}/{room.maxSeats}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.max(8, micRatio)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4">
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      onJoinRoom(room.code);
                    }}
                    className="w-full py-2.5 px-4 text-xs font-bold text-[#141824] dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 dark:hover:bg-blue-600 hover:text-white rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>دخول الغرفة الصوتية</span>
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Room Tiers Comparison Guide (Free vs Basic) */}
      <section className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-7 space-y-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-[#141824] dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span>تفاصيل باقات الغرف الصوتية</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              قارن بين الغرفة المجانية المؤقتة والغرفة الأساسية الدائمة ذات الـ 8 مستويات
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenCreateRoom()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>أنشئ غرفتك الآن</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#141824] dark:text-white">
                الغرفة المجانية
              </h3>
              <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                مجانية بالكامل
              </span>
            </div>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>10 مايكات صوتية (مايك لصاحب الغرفة + 9 مايكات للضيوف)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>رقم تعريفي مؤقت غير مثبت ومشرفان اثنان فقط للغرفة</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>بدون مستويات ترقية وتُغلق تلقائياً بعد 6 ساعات من فتحها</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>تشمل لعبتي لودو والسلم والثعبان</span>
              </li>
            </ul>
          </div>

          <div className="border border-amber-300/80 dark:border-amber-800/80 rounded-2xl p-5 bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#141824] dark:text-white flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-amber-500" />
                <span>الغرفة الأساسية الدائمة</span>
              </h3>
              <span className="text-xs font-extrabold text-amber-700 dark:text-amber-400 font-mono-num">
                {BASIC_ROOM_PRICE_COINS.toLocaleString('en-US')} عملة
              </span>
            </div>
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                <span>رقم تعريفي دائم ومثبت ولا تُغلق الغرفة تلقائياً أبداً</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                <span>8 مستويات ترقية (حتى 14 مايك و 15 مشرفاً و 3 نواب و 11 خلفية)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                <span>تحتسب نقطة لمستوى الغرفة لكل هدية بقيمة 10 عملات داخل الغرفة</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                <span>جميع الألعاب الستة: لودو، السلم والثعبان، بنك الحظ، چاكارو، الرسم، السيارات</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
};
