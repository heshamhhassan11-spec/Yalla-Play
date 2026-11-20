import React from 'react';
import { Bot, Crown, Dices, RotateCcw, Trophy, Users } from 'lucide-react';
import type { LudoColor, RoomFullState } from '../../shared/types';
import { soundFx } from '../../utils/sound';
import { DiceFace } from './DiceFace';
import { TurnTimerBar } from './TurnTimerBar';

interface LudoGameProps {
  room: RoomFullState;
  playerId: string;
  isHost: boolean;
  send: (payload: Record<string, unknown>) => boolean;
}

const TRACK_COORDS: Array<[number, number]> = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];

const START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

const HOME_STRETCH: Record<LudoColor, Array<[number, number]>> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};

const YARD_SLOTS: Record<LudoColor, Array<[number, number]>> = {
  red: [[1.8, 1.8], [3.6, 1.8], [1.8, 3.6], [3.6, 3.6]],
  green: [[10.8, 1.8], [12.6, 1.8], [10.8, 3.6], [12.6, 3.6]],
  yellow: [[10.8, 10.8], [12.6, 10.8], [10.8, 12.6], [12.6, 12.6]],
  blue: [[1.8, 10.8], [3.6, 10.8], [1.8, 12.6], [3.6, 12.6]],
};

const COLOR_HEX: Record<LudoColor, { fill: string; soft: string; nameAr: string }> = {
  red: { fill: '#DC2626', soft: '#FEE2E2', nameAr: 'الأحمر' },
  green: { fill: '#16A34A', soft: '#DCFCE7', nameAr: 'الأخضر' },
  yellow: { fill: '#D97706', soft: '#FEF3C7', nameAr: 'الأصفر' },
  blue: { fill: '#2563EB', soft: '#DBEAFE', nameAr: 'الأزرق' },
};

const SAFE_GLOBAL_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

function getTokenGridCenter(color: LudoColor, pos: number, tokenIdx: number): [number, number] {
  if (pos === -1) {
    const [cx, cy] = YARD_SLOTS[color][tokenIdx];
    return [cx + 0.3, cy + 0.3];
  }
  if (pos >= 0 && pos <= 50) {
    const g = (START_OFFSET[color] + pos) % 52;
    const [c, r] = TRACK_COORDS[g];
    return [c + 0.5, r + 0.5];
  }
  if (pos >= 51 && pos <= 55) {
    const [c, r] = HOME_STRETCH[color][pos - 51];
    return [c + 0.5, r + 0.5];
  }
  const centerOffsets: Record<LudoColor, [number, number]> = {
    red: [6.65, 7.5],
    green: [7.5, 6.65],
    yellow: [8.35, 7.5],
    blue: [7.5, 8.35],
  };
  return centerOffsets[color];
}

export const LudoGame: React.FC<LudoGameProps> = ({ room, playerId, isHost, send }) => {
  const ludo = room.ludo;
  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  const activePlayer = ludo.players[ludo.currentTurnIndex];
  const isMyTurn = activePlayer?.playerId === playerId;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
          <div>
            <h3 className="text-lg font-extrabold text-[#141824] dark:text-white">لودو يلا</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ludo.lastEventText}</p>
          </div>
        </div>
        {isHost && ludo.phase !== 'LOBBY' && (
          <button
            type="button"
            onClick={() => send({ type: 'ludo:reset' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:text-[#141824] dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط</span>
          </button>
        )}
      </div>

      {ludo.phase === 'LOBBY' && (
        <div className="py-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Users className="w-8 h-8" />
          </div>
          <div className="max-w-md space-y-1">
            <h4 className="text-base font-extrabold text-[#141824] dark:text-white">
              حلبة لودو جاهزة للانطلاق
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              العب مع 2 إلى 4 أصدقاء على المقاعد، أو جرّب اللوحة فوراً ضد روبوت التدريب.
            </p>
          </div>
          {isHost ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={seatedHumans.length < 2}
                onClick={() => {
                  soundFx.tap();
                  send({ type: 'ludo:start', withBot: false });
                }}
                className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                {seatedHumans.length < 2
                  ? 'مباراة جماعية (2+ لاعبين)'
                  : `بدء المباراة (${seatedHumans.length} لاعبين)`}
              </button>
              {seatedHumans.length === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    send({ type: 'ludo:start', withBot: true });
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  <span>لعب مع روبوت التدريب</span>
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              بانتظار المضيف لبدء المباراة...
            </p>
          )}
        </div>
      )}

      {ludo.phase === 'FINISHED' && (
        <div className="py-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
            <Trophy className="w-8 h-8" />
          </div>
          <h4 className="text-2xl font-extrabold text-[#141824] dark:text-white">
            {ludo.lastEventText}
          </h4>
          {isHost && (
            <button
              type="button"
              onClick={() => send({ type: 'ludo:reset' })}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl cursor-pointer"
            >
              مباراة جديدة
            </button>
          )}
        </div>
      )}

      {ludo.phase === 'PLAYING' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_256px] gap-5 items-start">
          {/* Custom 15x15 SVG Ludo Board with Wooden/Slate Outer Frame */}
          <div className="w-full max-w-[490px] mx-auto p-2 bg-slate-800 dark:bg-slate-950 rounded-2xl shadow-md border border-slate-700">
            <div className="aspect-square rounded-xl overflow-hidden bg-white border border-slate-900">
              <svg viewBox="0 0 15 15" className="w-full h-full block">
                {/* Outer track squares */}
                {TRACK_COORDS.map(([c, r], idx) => {
                  let fill = '#FFFFFF';
                  if (idx === 0) fill = COLOR_HEX.red.fill;
                  else if (idx === 13) fill = COLOR_HEX.green.fill;
                  else if (idx === 26) fill = COLOR_HEX.yellow.fill;
                  else if (idx === 39) fill = COLOR_HEX.blue.fill;
                  const isSafe = SAFE_GLOBAL_INDICES.includes(idx);
                  const isStartTile = [0, 13, 26, 39].includes(idx);

                  return (
                    <g key={`t_${idx}`}>
                      <rect
                        x={c}
                        y={r}
                        width={1}
                        height={1}
                        fill={fill}
                        stroke="#CBD5E1"
                        strokeWidth={0.04}
                      />
                      {isSafe && (
                        <text
                          x={c + 0.5}
                          y={r + 0.68}
                          textAnchor="middle"
                          fontSize="0.52"
                          fill={isStartTile ? '#FFFFFF' : '#94A3B8'}
                        >
                          ★
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Home stretch colored tracks */}
                {(Object.keys(HOME_STRETCH) as LudoColor[]).map((color) =>
                  HOME_STRETCH[color].map(([c, r], idx) => (
                    <rect
                      key={`hs_${color}_${idx}`}
                      x={c}
                      y={r}
                      width={1}
                      height={1}
                      fill={COLOR_HEX[color].soft}
                      stroke={COLOR_HEX[color].fill}
                      strokeOpacity={0.35}
                      strokeWidth={0.04}
                    />
                  ))
                )}

                {/* 4 Corner Yards */}
                <rect x={0} y={0} width={6} height={6} fill={COLOR_HEX.red.fill} stroke="#1E293B" strokeWidth={0.06} />
                <rect x={0.68} y={0.68} width={4.64} height={4.64} rx={0.48} fill="#FFFFFF" stroke="#B91C1C" strokeWidth={0.06} />

                <rect x={9} y={0} width={6} height={6} fill={COLOR_HEX.green.fill} stroke="#1E293B" strokeWidth={0.06} />
                <rect x={9.68} y={0.68} width={4.64} height={4.64} rx={0.48} fill="#FFFFFF" stroke="#15803D" strokeWidth={0.06} />

                <rect x={9} y={9} width={6} height={6} fill={COLOR_HEX.yellow.fill} stroke="#1E293B" strokeWidth={0.06} />
                <rect x={9.68} y={9.68} width={4.64} height={4.64} rx={0.48} fill="#FFFFFF" stroke="#B45309" strokeWidth={0.06} />

                <rect x={0} y={9} width={6} height={6} fill={COLOR_HEX.blue.fill} stroke="#1E293B" strokeWidth={0.06} />
                <rect x={0.68} y={9.68} width={4.64} height={4.64} rx={0.48} fill="#FFFFFF" stroke="#1D4ED8" strokeWidth={0.06} />

                {/* Yard inner circles */}
                {(Object.keys(YARD_SLOTS) as LudoColor[]).map((color) =>
                  YARD_SLOTS[color].map(([cx, cy], idx) => (
                    <circle
                      key={`ys_${color}_${idx}`}
                      cx={cx + 0.3}
                      cy={cy + 0.3}
                      r={0.5}
                      fill={COLOR_HEX[color].soft}
                      stroke={COLOR_HEX[color].fill}
                      strokeWidth={0.06}
                    />
                  ))
                )}

                {/* Center Home Triangles & Center Hub */}
                <polygon points="6,6 7.5,7.5 6,9" fill={COLOR_HEX.red.fill} stroke="#1E293B" strokeWidth={0.05} />
                <polygon points="6,6 9,6 7.5,7.5" fill={COLOR_HEX.green.fill} stroke="#1E293B" strokeWidth={0.05} />
                <polygon points="9,6 9,9 7.5,7.5" fill={COLOR_HEX.yellow.fill} stroke="#1E293B" strokeWidth={0.05} />
                <polygon points="6,9 9,9 7.5,7.5" fill={COLOR_HEX.blue.fill} stroke="#1E293B" strokeWidth={0.05} />
                <circle cx={7.5} cy={7.5} r={0.42} fill="#FFFFFF" stroke="#1E293B" strokeWidth={0.06} />
                <text x={7.5} y={7.68} textAnchor="middle" fontSize="0.48" fill="#D97706">
                  ★
                </text>

                {/* Player Tokens */}
                {ludo.players.map((p) =>
                  p.tokens.map((pos, tIdx) => {
                    const [cx, cy] = getTokenGridCenter(p.color, pos, tIdx);
                    const isMovable =
                      isMyTurn &&
                      p.playerId === playerId &&
                      ludo.hasRolled &&
                      ludo.movableTokenIndices.includes(tIdx);

                    return (
                      <g
                        key={`tok_${p.playerId}_${tIdx}`}
                        onClick={() => {
                          if (!isMovable) return;
                          soundFx.tap();
                          send({ type: 'ludo:move', tokenIndex: tIdx });
                        }}
                        style={{ cursor: isMovable ? 'pointer' : 'default' }}
                      >
                        {isMovable && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={0.48}
                            fill="none"
                            stroke="#141824"
                            strokeWidth={0.11}
                            className="animate-pulse"
                          />
                        )}
                        <circle cx={cx} cy={cy + 0.05} r={0.35} fill="#0F172A" opacity={0.22} />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={0.35}
                          fill={COLOR_HEX[p.color].fill}
                          stroke="#FFFFFF"
                          strokeWidth={0.09}
                        />
                        <circle cx={cx - 0.08} cy={cy - 0.08} r={0.11} fill="#FFFFFF" opacity={0.7} />
                      </g>
                    );
                  })
                )}
              </svg>
            </div>
          </div>

          {/* Turn & Dice Controls */}
          <div className="flex flex-col gap-3">
            <div
              className={`border rounded-2xl p-4 text-center space-y-3 transition-colors ${
                isMyTurn
                  ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                  : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
              }`}
            >
              <TurnTimerBar
                timeLeft={ludo.turnTimeLeft}
                duration={ludo.turnDuration}
                isMyTurn={isMyTurn}
              />

              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {isMyTurn ? 'دورك الآن' : 'الدور الحالي'}
                </span>
                {isMyTurn && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>

              <div className="flex items-center justify-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full inline-block ring-2 ring-white dark:ring-slate-900"
                  style={{
                    backgroundColor: activePlayer
                      ? COLOR_HEX[activePlayer.color].fill
                      : '#CBD5E1',
                  }}
                />
                <span className="text-base font-extrabold text-[#141824] dark:text-white">
                  {activePlayer?.name}
                </span>
              </div>

              <div className="py-1">
                <DiceFace value={ludo.diceValue} size="md" highlight={isMyTurn && !ludo.hasRolled} />
              </div>

              <button
                type="button"
                disabled={!isMyTurn || ludo.hasRolled}
                onClick={() => {
                  soundFx.dice();
                  send({ type: 'ludo:roll' });
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <Dices className="w-4 h-4" />
                <span>
                  {!isMyTurn
                    ? 'انتظر دورك'
                    : ludo.hasRolled
                      ? 'اضغط على القطعة المضيئة'
                      : 'ارمِ النرد'}
                </span>
              </button>
            </div>

            {/* Players Progress List */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {ludo.players.map((p, idx) => {
                const finished = p.tokens.filter((t) => t === 56).length;
                const isActive = idx === ludo.currentTurnIndex;
                return (
                  <div
                    key={p.playerId}
                    className={`px-3.5 py-2.5 space-y-1.5 ${
                      isActive ? 'bg-blue-50/50 dark:bg-blue-950/25' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: COLOR_HEX[p.color].fill }}
                        />
                        <span className="font-bold text-[#141824] dark:text-white truncate">
                          {p.name}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                            · يلعب
                          </span>
                        )}
                      </div>
                      <span className="font-mono-num font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                        {finished === 4 && <Crown className="w-3 h-3 text-amber-500" />}
                        {finished}/4
                      </span>
                    </div>
                    <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${(finished / 4) * 100}%`,
                          backgroundColor: COLOR_HEX[p.color].fill,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
