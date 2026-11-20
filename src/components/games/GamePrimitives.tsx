import React, { useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { GAME_COVER_IMAGES } from '../../constants/gameAssets';
import { GAME_CATALOG } from '../../shared/gameCatalog';
import type { GameType } from '../../shared/types';

export const GameCoverArt: React.FC<{
  gameType: GameType;
  title?: string;
  className?: string;
}> = ({ gameType, title, className = '' }) => {
  const [failed, setFailed] = useState(false);
  const meta = GAME_CATALOG[gameType];

  if (failed) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center gap-2 text-white p-4 ${className}`}
        style={{ backgroundColor: meta.accentHex }}
      >
        <Gamepad2 className="w-8 h-8 opacity-90" />
        <span className="text-sm font-bold">{title || meta.titleAr}</span>
      </div>
    );
  }

  return (
    <img
      src={GAME_COVER_IMAGES[gameType]}
      alt={title || meta.titleAr}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`w-full h-full object-cover ${className}`}
    />
  );
};

export const GameLobbyHero: React.FC<{
  gameType: GameType;
  headline: string;
  description: string;
  seatedCount: number;
  children: React.ReactNode;
}> = ({ gameType, headline, description, seatedCount, children }) => {
  const meta = GAME_CATALOG[gameType];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5 items-stretch bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 rounded-xl overflow-hidden">
      <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[210px] bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <GameCoverArt gameType={gameType} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <div className="absolute bottom-3 right-3 left-3 text-white">
          <p className="text-xs text-white/80 font-mono-num">
            {meta.playersRange} · {meta.basicOnly ? 'الغرفة الأساسية' : 'مجانية وأساسية'}
          </p>
          <p className="text-lg font-extrabold leading-snug mt-0.5">{meta.titleAr}</p>
        </div>
      </div>

      <div className="p-5 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-lg font-extrabold text-[#141824] dark:text-white">{headline}</h4>
            <span className="text-xs font-bold font-mono-num text-emerald-700 dark:text-emerald-400">
              {seatedCount} {seatedCount === 1 ? 'لاعب على المايك' : 'لاعبين على المايك'}
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {description}
          </p>
          <ul className="space-y-1 pt-1 text-xs text-slate-500 dark:text-slate-400 list-disc list-inside">
            {meta.rulesAr.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">{children}</div>
      </div>
    </div>
  );
};

const PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export const DiceFace: React.FC<{
  value: number | null;
  size?: 'md' | 'lg';
  accentHex?: string;
}> = ({ value, size = 'lg', accentHex = '#141824' }) => {
  const boxSize = size === 'lg' ? 'w-16 h-16 p-2.5 rounded-2xl' : 'w-12 h-12 p-2 rounded-xl';
  const pipSize = size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2';

  if (!value || value < 1 || value > 6) {
    return (
      <div
        className={`${boxSize} mx-auto bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center text-2xl font-extrabold font-mono-num text-slate-400 shadow-xs`}
      >
        —
      </div>
    );
  }

  const activePips = PIP_MAP[value] || [];

  return (
    <div
      className={`${boxSize} mx-auto bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 grid grid-cols-3 grid-rows-3 place-items-center shadow-sm`}
      aria-label={`قيمة النرد ${value}`}
    >
      {Array.from({ length: 9 }, (_, idx) => (
        <span
          key={idx}
          className={`${pipSize} rounded-full transition-transform duration-150 ${
            activePips.includes(idx) ? 'scale-100' : 'scale-0 opacity-0'
          }`}
          style={
            activePips.includes(idx)
              ? { backgroundColor: value === 6 ? accentHex : undefined }
              : undefined
          }
        >
          {activePips.includes(idx) && value !== 6 && (
            <span className="block w-full h-full rounded-full bg-[#141824] dark:bg-slate-100" />
          )}
        </span>
      ))}
    </div>
  );
};
