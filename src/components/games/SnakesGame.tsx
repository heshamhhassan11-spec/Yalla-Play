import React from 'react';
import { Bot, Crown, Dices, RotateCcw, Trophy, Users } from 'lucide-react';
import { SNAKES_LADDERS_MAP } from '../../shared/gameCatalog';
import type { RoomFullState } from '../../shared/types';
import { soundFx } from '../../utils/sound';
import { DiceFace } from './DiceFace';
import { TurnTimerBar } from './TurnTimerBar';

interface SnakesGameProps {
  room: RoomFullState;
  playerId: string;
  isHost: boolean;
  send: (payload: Record<string, unknown>) => boolean;
}

function getCellCenter(pos: number): [number, number] {
  const clamped = Math.max(1, Math.min(100, pos));
  const zeroBased = clamped - 1;
  const rowFromBottom = Math.floor(zeroBased / 10);
  const colInRow = zeroBased % 10;
  const col = rowFromBottom % 2 === 0 ? colInRow : 9 - colInRow;
  const row = 9 - rowFromBottom;
  return [col + 0.5, row + 0.5];
}

// Build a natural multi-wave winding S-curve path for realistic snakes
function buildSnakePath(x1: number, y1: number, x2: number, y2: number, seed: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const dir = seed % 2 === 0 ? 1 : -1;
  const amp = Math.min(0.85, Math.max(0.45, len * 0.16)) * dir;

  const p1x = x1 + dx * 0.25 + nx * amp;
  const p1y = y1 + dy * 0.25 + ny * amp;
  const p2x = x1 + dx * 0.5;
  const p2y = y1 + dy * 0.5;
  const p3x = x1 + dx * 0.75 - nx * amp;
  const p3y = y1 + dy * 0.75 - ny * amp;

  return {
    d: `M ${x1} ${y1} Q ${p1x} ${p1y} ${p2x} ${p2y} Q ${p3x} ${p3y} ${x2} ${y2}`,
    angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

const SNAKE_PALETTES = [
  { outer: '#7F1D1D', inner: '#F87171', head: '#991B1B' },
  { outer: '#14532D', inner: '#4ADE80', head: '#166534' },
  { outer: '#581C87', inner: '#C084FC', head: '#6B21A8' },
  { outer: '#9A3412', inner: '#FB923C', head: '#C2410C' },
];

export const SnakesGame: React.FC<SnakesGameProps> = ({ room, playerId, isHost, send }) => {
  const snakes = room.snakes;
  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  const activePlayer = snakes.players[snakes.currentTurnIndex];
  const isMyTurn = activePlayer?.playerId === playerId;

  const cells = Array.from({ length: 100 }, (_, idx) => {
    const num = idx + 1;
    const [cx, cy] = getCellCenter(num);
    return { num, x: cx - 0.5, y: cy - 0.5, cx, cy };
  });

  const entries = Object.entries(SNAKES_LADDERS_MAP);
  const ladders = entries.filter(([fromStr, to]) => to > Number(fromStr));
  const snakeList = entries.filter(([fromStr, to]) => to < Number(fromStr));

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
          <div>
            <h3 className="text-lg font-extrabold text-[#141824] dark:text-white">السلم والثعبان</h3>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
              {snakes.lastEventText}
            </p>
          </div>
        </div>
        {isHost && snakes.phase !== 'LOBBY' && (
          <button
            type="button"
            onClick={() => send({ type: 'snakes:reset' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:text-[#141824] dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط</span>
          </button>
        )}
      </div>

      {snakes.phase === 'LOBBY' && (
        <div className="py-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
            <Users className="w-8 h-8" />
          </div>
          <div className="max-w-md space-y-1">
            <h4 className="text-base font-extrabold text-[#141824] dark:text-white">سباق المئة خانة</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              اصعد السلالم الخشبية وتجنب لدغات الثعابين في سباق مباشر حتى الخانة 100.
            </p>
          </div>
          {isHost ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={seatedHumans.length < 2}
                onClick={() => {
                  soundFx.tap();
                  send({ type: 'snakes:start', withBot: false });
                }}
                className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                {seatedHumans.length < 2
                  ? 'مباراة جماعية (2+ لاعبين)'
                  : `بدء السباق (${seatedHumans.length} لاعبين)`}
              </button>
              {seatedHumans.length === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    send({ type: 'snakes:start', withBot: true });
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
              بانتظار المضيف لبدء اللعبة...
            </p>
          )}
        </div>
      )}

      {snakes.phase === 'FINISHED' && (
        <div className="py-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
            <Trophy className="w-8 h-8" />
          </div>
          <h4 className="text-2xl font-extrabold text-[#141824] dark:text-white">
            {snakes.lastEventText}
          </h4>
          {isHost && (
            <button
              type="button"
              onClick={() => send({ type: 'snakes:reset' })}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl cursor-pointer"
            >
              جولة جديدة
            </button>
          )}
        </div>
      )}

      {snakes.phase === 'PLAYING' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5 items-start">
          {/* Carved Wooden Board with Winding Snakes, 3D Ladders & Animated Pawns */}
          <div className="w-full max-w-[490px] mx-auto p-2.5 bg-gradient-to-br from-[#5C280B] via-[#451A03] to-[#2B1002] rounded-3xl shadow-xl border-2 border-[#78350F]">
            <div className="aspect-square rounded-2xl overflow-hidden bg-amber-50 border border-[#78350F]">
              <svg viewBox="0 0 10 10" className="w-full h-full block select-none">
                <defs>
                  <filter id="pawnShadow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="0.04" stdDeviation="0.03" floodOpacity="0.35" />
                  </filter>
                </defs>

                {/* Numbered 10x10 Board Squares */}
                {cells.map((c) => {
                  const paletteIdx = (Math.floor(c.x) + Math.floor(c.y) * 3) % 4;
                  const tilePalette = ['#FFFBEB', '#FEF3C7', '#ECFDF5', '#EFF6FF'];
                  const fill =
                    c.num === 100
                      ? '#FDE68A'
                      : c.num === 1
                        ? '#BBF7D0'
                        : tilePalette[paletteIdx];
                  return (
                    <g key={c.num}>
                      <rect
                        x={c.x}
                        y={c.y}
                        width={1}
                        height={1}
                        fill={fill}
                        stroke="#D97706"
                        strokeOpacity={0.22}
                        strokeWidth={0.03}
                      />
                      <text
                        x={c.x + 0.11}
                        y={c.y + 0.28}
                        fontSize="0.22"
                        fontWeight="800"
                        fill={c.num === 100 ? '#92400E' : c.num === 1 ? '#15803D' : '#475569'}
                      >
                        {c.num}
                      </text>
                      {c.num === 100 && (
                        <text x={c.x + 0.55} y={c.y + 0.74} textAnchor="middle" fontSize="0.46">
                          👑
                        </text>
                      )}
                      {c.num === 1 && (
                        <text x={c.x + 0.55} y={c.y + 0.74} textAnchor="middle" fontSize="0.36">
                          🚩
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* 3D Wooden Ladders */}
                {ladders.map(([fromStr, to]) => {
                  const from = Number(fromStr);
                  const [x1, y1] = getCellCenter(from);
                  const [x2, y2] = getCellCenter(to);
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const len = Math.hypot(dx, dy) || 1;
                  const nx = (-dy / len) * 0.14;
                  const ny = (dx / len) * 0.14;
                  const rungs = Math.max(4, Math.floor(len * 2.8));

                  return (
                    <g key={`lad_${from}`}>
                      {/* Drop shadow */}
                      <line
                        x1={x1 - nx + 0.04}
                        y1={y1 - ny + 0.04}
                        x2={x2 - nx + 0.04}
                        y2={y2 - ny + 0.04}
                        stroke="#0F172A"
                        strokeOpacity={0.2}
                        strokeWidth={0.09}
                        strokeLinecap="round"
                      />
                      <line
                        x1={x1 + nx + 0.04}
                        y1={y1 + ny + 0.04}
                        x2={x2 + nx + 0.04}
                        y2={y2 + ny + 0.04}
                        stroke="#0F172A"
                        strokeOpacity={0.2}
                        strokeWidth={0.09}
                        strokeLinecap="round"
                      />
                      {/* Ladder Rungs */}
                      {Array.from({ length: rungs }, (_, rIdx) => {
                        const t = (rIdx + 1) / (rungs + 1);
                        const rx = x1 + dx * t;
                        const ry = y1 + dy * t;
                        return (
                          <g key={rIdx}>
                            <line
                              x1={rx - nx}
                              y1={ry - ny}
                              x2={rx + nx}
                              y2={ry + ny}
                              stroke="#78350F"
                              strokeWidth={0.08}
                              strokeLinecap="round"
                            />
                            <line
                              x1={rx - nx}
                              y1={ry - ny}
                              x2={rx + nx}
                              y2={ry + ny}
                              stroke="#F59E0B"
                              strokeWidth={0.04}
                              strokeLinecap="round"
                            />
                          </g>
                        );
                      })}
                      {/* Side Wooden Rails */}
                      <line
                        x1={x1 - nx}
                        y1={y1 - ny}
                        x2={x2 - nx}
                        y2={y2 - ny}
                        stroke="#78350F"
                        strokeWidth={0.09}
                        strokeLinecap="round"
                      />
                      <line
                        x1={x1 - nx}
                        y1={y1 - ny}
                        x2={x2 - nx}
                        y2={y2 - ny}
                        stroke="#FBBF24"
                        strokeWidth={0.03}
                        strokeLinecap="round"
                      />
                      <line
                        x1={x1 + nx}
                        y1={y1 + ny}
                        x2={x2 + nx}
                        y2={y2 + ny}
                        stroke="#78350F"
                        strokeWidth={0.09}
                        strokeLinecap="round"
                      />
                      <line
                        x1={x1 + nx}
                        y1={y1 + ny}
                        x2={x2 + nx}
                        y2={y2 + ny}
                        stroke="#FBBF24"
                        strokeWidth={0.03}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}

                {/* Realistic Curvy Winding Snakes */}
                {snakeList.map(([fromStr, to], sIdx) => {
                  const from = Number(fromStr);
                  const [x1, y1] = getCellCenter(from);
                  const [x2, y2] = getCellCenter(to);
                  const pal = SNAKE_PALETTES[sIdx % SNAKE_PALETTES.length];
                  const { d, angleDeg } = buildSnakePath(x1, y1, x2, y2, from);

                  return (
                    <g key={`snk_${from}`}>
                      {/* Body Shadow */}
                      <path
                        d={d}
                        transform="translate(0.04, 0.05)"
                        fill="none"
                        stroke="#0F172A"
                        strokeOpacity={0.22}
                        strokeWidth={0.24}
                        strokeLinecap="round"
                      />
                      {/* Outer Body */}
                      <path
                        d={d}
                        fill="none"
                        stroke={pal.outer}
                        strokeWidth={0.23}
                        strokeLinecap="round"
                      />
                      {/* Inner Patterned Belly Scales */}
                      <path
                        d={d}
                        fill="none"
                        stroke={pal.inner}
                        strokeWidth={0.13}
                        strokeDasharray="0.14 0.14"
                        strokeLinecap="round"
                      />
                      {/* Tail Tip */}
                      <circle cx={x2} cy={y2} r={0.075} fill={pal.outer} />
                      {/* Snake Head Oriented Toward Direction */}
                      <g transform={`translate(${x1}, ${y1}) rotate(${angleDeg})`}>
                        {/* Forked Tongue pointing slightly ahead */}
                        <path
                          d="M -0.18 0 L -0.34 -0.05 M -0.18 0 L -0.34 0.05"
                          stroke="#EF4444"
                          strokeWidth={0.035}
                          strokeLinecap="round"
                        />
                        <ellipse
                          cx={0}
                          cy={0}
                          rx={0.23}
                          ry={0.17}
                          fill={pal.head}
                          stroke="#FFFFFF"
                          strokeWidth={0.03}
                        />
                        <circle cx={-0.06} cy={-0.07} r={0.04} fill="#FEF08A" />
                        <circle cx={-0.06} cy={0.07} r={0.04} fill="#FEF08A" />
                        <circle cx={-0.07} cy={-0.07} r={0.018} fill="#0F172A" />
                        <circle cx={-0.07} cy={0.07} r={0.018} fill="#0F172A" />
                      </g>
                    </g>
                  );
                })}

                {/* Smooth Animated Pawns */}
                {snakes.players.map((p, idx) => {
                  const [cx, cy] = getCellCenter(p.position);
                  const offsetX = idx % 2 === 0 ? -0.16 : 0.16;
                  const offsetY = idx < 2 ? -0.11 : 0.15;
                  const isActive = idx === snakes.currentTurnIndex;
                  return (
                    <g
                      key={p.playerId}
                      filter="url(#pawnShadow)"
                      style={{
                        transform: `translate(${cx + offsetX}px, ${cy + offsetY}px)`,
                        transition: 'transform 560ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    >
                      {isActive && (
                        <circle
                          cx={0}
                          cy={0}
                          r={0.33}
                          fill={p.color}
                          fillOpacity={0.2}
                          stroke="#141824"
                          strokeWidth={0.06}
                          className="animate-pulse"
                        />
                      )}
                      {/* Pawn Pedestal */}
                      <path
                        d="M -0.15 0.19 L 0.15 0.19 L 0.08 -0.04 L -0.08 -0.04 Z"
                        fill={p.color}
                        stroke="#FFFFFF"
                        strokeWidth={0.04}
                      />
                      {/* Pawn Sphere Head */}
                      <circle
                        cx={0}
                        cy={-0.1}
                        r={0.14}
                        fill={p.color}
                        stroke="#FFFFFF"
                        strokeWidth={0.045}
                      />
                      <circle cx={-0.04} cy={-0.14} r={0.04} fill="#FFFFFF" opacity={0.75} />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Right Controls & Progress */}
          <div className="flex flex-col gap-3">
            <div
              className={`border rounded-2xl p-4 text-center space-y-3 transition-colors ${
                isMyTurn
                  ? 'bg-emerald-50/75 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
              }`}
            >
              <TurnTimerBar
                timeLeft={snakes.turnTimeLeft}
                duration={snakes.turnDuration}
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
                  className="w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-slate-900"
                  style={{ backgroundColor: activePlayer?.color || '#CBD5E1' }}
                />
                <span className="text-base font-extrabold text-[#141824] dark:text-white">
                  {activePlayer?.name}
                </span>
              </div>

              <div className="py-1">
                <DiceFace value={snakes.diceValue} size="md" highlight={isMyTurn} />
              </div>

              <button
                type="button"
                disabled={!isMyTurn}
                onClick={() => {
                  soundFx.dice();
                  send({ type: 'snakes:roll' });
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <Dices className="w-4 h-4" />
                <span>{isMyTurn ? 'ارمِ النرد' : 'انتظر دورك'}</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {snakes.players.map((p, idx) => {
                const isActive = idx === snakes.currentTurnIndex;
                return (
                  <div
                    key={p.playerId}
                    className={`px-3.5 py-2.5 space-y-1.5 ${
                      isActive ? 'bg-emerald-50/50 dark:bg-emerald-950/25' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="font-bold text-[#141824] dark:text-white truncate">
                          {p.name}
                        </span>
                      </div>
                      <span className="font-mono-num text-slate-600 dark:text-slate-300 font-bold flex items-center gap-1">
                        {p.position === 100 && <Crown className="w-3 h-3 text-amber-500" />}
                        خانة {p.position}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-500"
                        style={{ width: `${p.position}%`, backgroundColor: p.color }}
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
