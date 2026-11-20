import React from 'react';
import { Clock } from 'lucide-react';

interface TurnTimerBarProps {
  timeLeft: number;
  duration: number;
  isMyTurn: boolean;
}

export const TurnTimerBar: React.FC<TurnTimerBarProps> = ({
  timeLeft,
  duration,
  isMyTurn,
}) => {
  const safeDuration = Math.max(1, duration || 25);
  const clamped = Math.max(0, Math.min(safeDuration, timeLeft ?? safeDuration));
  const pct = Math.round((clamped / safeDuration) * 100);
  const isUrgent = clamped <= 7;

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span
          className={`inline-flex items-center gap-1 ${
            isUrgent
              ? 'text-rose-600 dark:text-rose-400 animate-pulse'
              : isMyTurn
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>مؤقت الدور</span>
        </span>
        <span
          className={`font-mono-num font-extrabold ${
            isUrgent
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-[#141824] dark:text-slate-200'
          }`}
        >
          {clamped} ث
        </span>
      </div>
      <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-700 rounded-full ${
            isUrgent
              ? 'bg-rose-500'
              : isMyTurn
                ? 'bg-amber-500'
                : 'bg-blue-500 dark:bg-blue-400'
          }`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  );
};
