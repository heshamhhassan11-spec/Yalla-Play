import React, { useEffect } from 'react';
import { Bot, Car, Crown, Flag, Gauge, RotateCcw, Trophy } from 'lucide-react';
import type { RoomFullState } from '../../shared/types';
import { soundFx } from '../../utils/sound';

interface RacingGameProps {
  room: RoomFullState;
  playerId: string;
  isHost: boolean;
  send: (payload: Record<string, unknown>) => boolean;
}

export const RacingGame: React.FC<RacingGameProps> = ({ room, playerId, isHost, send }) => {
  const racing = room.racing;
  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  const isParticipant = racing.players.some((p) => p.playerId === playerId);

  const leaderId =
    racing.players.length > 0
      ? [...racing.players].sort((a, b) => b.progress - a.progress)[0]?.playerId
      : null;

  useEffect(() => {
    if (racing.phase !== 'RACING' || !isParticipant) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        soundFx.tap();
        send({ type: 'racing:boost' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [racing.phase, isParticipant, send]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0" />
          <div>
            <h3 className="text-lg font-extrabold text-[#141824] dark:text-white">سباق السيارات</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{racing.lastEventText}</p>
          </div>
        </div>
        {isHost && racing.phase !== 'LOBBY' && (
          <button
            type="button"
            onClick={() => send({ type: 'racing:reset' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:text-[#141824] dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة السباق</span>
          </button>
        )}
      </div>

      {racing.phase === 'LOBBY' && (
        <div className="py-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <Car className="w-8 h-8" />
          </div>
          <div className="max-w-md space-y-1">
            <h4 className="text-base font-extrabold text-[#141824] dark:text-white">
              حلبة التيربو المباشرة
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              تحدّ أصدقاءك في سباق سرعة مباشر — اضغط زر التيربو (أو مسافة Space) للانطلاق نحو خط
              النهاية.
            </p>
          </div>
          {isHost ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={seatedHumans.length < 2}
                onClick={() => {
                  soundFx.tap();
                  send({ type: 'racing:start', withBot: false });
                }}
                className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                {seatedHumans.length < 2
                  ? 'سباق جماعي (2+ لاعبين)'
                  : `بدء السباق (${seatedHumans.length} سيارات)`}
              </button>
              {seatedHumans.length === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    send({ type: 'racing:start', withBot: true });
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  <span>سباق ضد روبوت التدريب</span>
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              بانتظار المضيف لبدء السباق...
            </p>
          )}
        </div>
      )}

      {racing.phase === 'COUNTDOWN' && (
        <div className="py-12 text-center space-y-2 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">استعد للانطلاق</p>
          <p className="text-6xl font-extrabold font-mono-num text-rose-600 dark:text-rose-400 animate-pulse">
            {racing.countdown}
          </p>
        </div>
      )}

      {(racing.phase === 'RACING' || racing.phase === 'FINISHED') && (
        <div className="space-y-4">
          {/* Asphalt Track Lanes */}
          <div className="bg-slate-900 rounded-2xl p-4 space-y-3 border-2 border-slate-800 shadow-inner">
            <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-400 px-2 pb-1 border-b border-slate-800">
              <span>خط النهاية 🏁</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>البداية</span>
            </div>

            {racing.players.map((car) => {
              const isLeader = car.playerId === leaderId && car.progress > 0;
              return (
                <div key={car.playerId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-200">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: car.color }}
                      />
                      <span className="font-bold">{car.name}</span>
                      {isLeader && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                          <Crown className="w-3 h-3" />
                          الأول
                        </span>
                      )}
                    </div>
                    <span className="font-mono-num font-bold text-slate-300">
                      {Math.round(car.progress)}%
                    </span>
                  </div>
                  <div className="relative h-11 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex items-center px-2">
                    {/* Track Distance Gridlines */}
                    <div className="absolute right-1/4 top-0 bottom-0 border-r border-slate-700/60" />
                    <div className="absolute right-1/2 top-0 bottom-0 border-r border-slate-700/60" />
                    <div className="absolute right-3/4 top-0 bottom-0 border-r border-slate-700/60" />
                    {/* Track Dashed Line */}
                    <div className="absolute inset-x-3 top-1/2 border-t border-dashed border-slate-600/70" />
                    {/* Checkered Finish Line */}
                    <div className="absolute left-3 top-0 bottom-0 w-2.5 bg-[repeating-linear-gradient(0deg,#fff_0_4px,#111_4px_8px)] opacity-85" />
                    {/* Moving Car (RTL: starts right, races left toward finish!) */}
                    <div
                      className="relative z-10 transition-all duration-150 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white font-bold text-xs shadow-md ring-1 ring-white/30"
                      style={{
                        backgroundColor: car.color,
                        marginRight: `${Math.min(84, car.progress * 0.84)}%`,
                      }}
                    >
                      <Car className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {racing.phase === 'RACING' && isParticipant && (
            <button
              type="button"
              onClick={() => {
                soundFx.tap();
                send({ type: 'racing:boost' });
              }}
              className="w-full py-4 bg-rose-600 hover:bg-rose-700 active:scale-[0.985] text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2.5 cursor-pointer transition-transform shadow-sm"
            >
              <Gauge className="w-5 h-5" />
              <span>دوس تيربو! (أو اضغط Space)</span>
            </button>
          )}

          {racing.phase === 'FINISHED' && (
            <div className="py-4 text-center space-y-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-2xl">
              <div className="flex items-center justify-center gap-2 text-amber-800 dark:text-amber-200 font-extrabold text-lg">
                <Trophy className="w-5 h-5" />
                <span>{racing.lastEventText}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Flag className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>انتهى السباق بنجاح</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
