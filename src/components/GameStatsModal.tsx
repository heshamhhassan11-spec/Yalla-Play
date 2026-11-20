import React, { useMemo } from 'react';
import {
  BarChart3,
  Clock,
  Flame,
  Gamepad2,
  Mic,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import { BASIC_ROOM_GAMES, GAME_CATALOG } from '../shared/gameCatalog';
import type { GameType, PlayerProfile } from '../shared/types';
import { soundFx } from '../utils/sound';
import { AvatarBadge } from './Avatars';

export type PerGameActivityMap = Partial<Record<GameType, number>>;

export function loadPerGameActivity(uid: string): PerGameActivityMap {
  try {
    const raw = localStorage.getItem(`yallaplay_game_activity_${uid}`);
    return raw ? (JSON.parse(raw) as PerGameActivityMap) : {};
  } catch {
    return {};
  }
}

export function incrementPerGameActivity(uid: string, gameType: GameType, minutesDelta = 1): void {
  try {
    const prev = loadPerGameActivity(uid);
    const next: PerGameActivityMap = {
      ...prev,
      [gameType]: Number(prev[gameType] || 0) + minutesDelta,
    };
    localStorage.setItem(`yallaplay_game_activity_${uid}`, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
}

interface GameStatsModalProps {
  profile: PlayerProfile;
  playTimeMin: number;
  voiceTimeMin: number;
  onClose: () => void;
}

export const GameStatsModal: React.FC<GameStatsModalProps> = ({
  profile,
  playTimeMin,
  voiceTimeMin,
  onClose,
}) => {
  const winRate =
    profile.gamesPlayed > 0
      ? Math.min(100, Math.round((profile.wins / profile.gamesPlayed) * 100))
      : 0;
  const gameActivity = useMemo(() => loadPerGameActivity(profile.id), [profile.id, playTimeMin]);
  const gameEntries = BASIC_ROOM_GAMES.map((gt) => GAME_CATALOG[gt]);
  const maxGameMins = Math.max(
    1,
    ...gameEntries.map((g) => Number(gameActivity[g.id] || 0))
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="إحصائيات نشاط الألعاب"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-5 sm:p-6 space-y-5 shadow-2xl my-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#141824] dark:text-white">
                إحصائيات نشاط الألعاب والأداء
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تقرير فعلي لنشاطك في الألعاب والميكات الصوتية في يلا بلاي
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

        {/* User Summary Card */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl p-4 flex items-center gap-4 shadow-md">
          <AvatarBadge avatarId={profile.avatar} size={52} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold truncate">{profile.name}</p>
            <p className="text-xs text-blue-100 font-mono-num">
              @{profile.username || 'بدون_يوزرنيم'}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-bold text-blue-100 font-mono-num">
              <span>الانتصارات: {profile.wins}</span>
              <span aria-hidden="true">·</span>
              <span>معدل الفوز: {winRate}%</span>
              <span aria-hidden="true">·</span>
              <span>التواجد الصوتي اليوم: {voiceTimeMin} د</span>
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
            <Gamepad2 className="w-5 h-5 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">المباريات المسجلة</p>
            <p className="text-lg font-extrabold font-mono-num text-[#141824] dark:text-white mt-0.5">
              {profile.gamesPlayed}
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
            <Trophy className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">الانتصارات</p>
            <p className="text-lg font-extrabold font-mono-num text-[#141824] dark:text-white mt-0.5">
              {profile.wins}
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
            <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">نسبة الفوز</p>
            <p className="text-lg font-extrabold font-mono-num text-[#141824] dark:text-white mt-0.5">
              {winRate}%
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
            <Clock className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">لعب اليوم</p>
            <p className="text-lg font-extrabold font-mono-num text-[#141824] dark:text-white mt-0.5">
              {playTimeMin} د
            </p>
          </div>
        </div>

        {/* Voice Activity Banner */}
        <div className="p-3 bg-blue-50/70 dark:bg-blue-950/35 border border-blue-200 dark:border-blue-800/70 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-200">
            <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>النشاط الصوتي اليومي على المايكات</span>
          </div>
          <span className="text-xs font-extrabold font-mono-num text-blue-700 dark:text-blue-300">
            {voiceTimeMin} دقيقة
          </span>
        </div>

        {/* Per-Game Live Activity Breakdown */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>سجل نشاطك حسب كل لعبة</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-0.5">
            {gameEntries.map((game) => {
              const mins = Number(gameActivity[game.id] || 0);
              const barPct = mins > 0 ? Math.max(8, Math.round((mins / maxGameMins) * 100)) : 0;
              return (
                <div
                  key={game.id}
                  className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: game.accentHex }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-[#141824] dark:text-white truncate">
                          {game.titleAr}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {game.basicOnly ? 'للغرفة الأساسية' : 'متاحة للجميع'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold font-mono-num text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md shrink-0">
                      {mins} دقيقة
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${barPct}%`, backgroundColor: game.accentHex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
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
