import React, { useEffect, useState } from 'react';
import { Bot, Crown, Disc, Flame, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import type { LudoColor, RoomFullState } from '../../shared/types';
import { soundFx } from '../../utils/sound';
import { TurnTimerBar } from './TurnTimerBar';

interface JackarooGameProps {
  room: RoomFullState;
  playerId: string;
  isHost: boolean;
  send: (payload: Record<string, unknown>) => boolean;
}

const COLOR_THEME: Record<
  LudoColor,
  { fill: string; light: string; dark: string; nameAr: string }
> = {
  red: { fill: '#DC2626', light: '#FCA5A5', dark: '#7F1D1D', nameAr: 'الأحمر' },
  green: { fill: '#16A34A', light: '#86EFAC', dark: '#14532D', nameAr: 'الأخضر' },
  yellow: { fill: '#D97706', light: '#FDE68A', dark: '#78350F', nameAr: 'الأصفر' },
  blue: { fill: '#2563EB', light: '#93C5FD', dark: '#1E3A8A', nameAr: 'الأزرق' },
};

const START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

// Squircle perimeter coordinates so the 52 holes trace an authentic rounded-square wooden Jackaroo track
function getTrackPoint(globalIdx: number, radius = 39): [number, number] {
  const angle = (globalIdx / 52) * Math.PI * 2 - Math.PI / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const exp = 0.72; // slight squircle flattening for 4 distinct sides
  const sx = Math.sign(cos) * Math.pow(Math.abs(cos), exp);
  const sy = Math.sign(sin) * Math.pow(Math.abs(sin), exp);
  return [50 + radius * sx, 50 + radius * sy];
}

// Corner base sockets neatly inlaid inside each player's quadrant
function getBaseSocketCoords(color: LudoColor, idx: number): [number, number] {
  const anchors: Record<LudoColor, [number, number]> = {
    red: [28, 28],
    green: [72, 28],
    yellow: [72, 72],
    blue: [28, 72],
  };
  const [bx, by] = anchors[color];
  const offsets: Array<[number, number]> = [
    [-3.6, -3.6],
    [3.6, -3.6],
    [-3.6, 3.6],
    [3.6, 3.6],
  ];
  return [bx + offsets[idx][0], by + offsets[idx][1]];
}

// Home lane holes curving cleanly from each side's entry toward the center medallion
function getHomeSocketCoords(color: LudoColor, step1to4: number): [number, number] {
  const r = 39 - step1to4 * 5.6;
  return getTrackPoint(START_OFFSET[color], r);
}

function getMarbleCoords(color: LudoColor, pos: number, idx: number): [number, number] {
  if (pos === -1) {
    return getBaseSocketCoords(color, idx);
  }
  if (pos >= 0 && pos <= 51) {
    const g = (START_OFFSET[color] + pos) % 52;
    return getTrackPoint(g, 39);
  }
  const step = Math.max(1, Math.min(4, pos - 51));
  return getHomeSocketCoords(color, step);
}

const CARD_META: Record<string, { label: string; badge: string }> = {
  A: { label: 'إخراج حجر أو +1 خطوة', badge: 'إخراج / +1' },
  K: { label: 'إخراج حجر أو +13 خطوة', badge: 'إخراج / +13' },
  Q: { label: '+12 خطوة للأمام', badge: '+12' },
  J: { label: 'تبديل مع خصم أو +11', badge: 'تبديل ⇄' },
  '10': { label: '+10 خطوات', badge: '+10' },
  '9': { label: '+9 خطوات', badge: '+9' },
  '8': { label: '+8 خطوات', badge: '+8' },
  '7': { label: '+7 خطوات', badge: '+7' },
  '6': { label: '+6 خطوات', badge: '+6' },
  '5': { label: '+5 خطوات', badge: '+5' },
  '4': { label: 'الرجوع 4 خطوات للخلف', badge: 'رجوع -4' },
  '3': { label: '+3 خطوات', badge: '+3' },
  '2': { label: '+2 خطوتين', badge: '+2' },
};

const CARD_SUITS = ['♠', '♥', '♣', '♦'];

export const JackarooGame: React.FC<JackarooGameProps> = ({ room, playerId, isHost, send }) => {
  const jack = room.jackaroo;
  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  const activePlayer = jack.players[jack.currentTurnIndex];
  const isMyTurn = activePlayer?.playerId === playerId;
  const myState = jack.players.find((p) => p.playerId === playerId);
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!isMyTurn || !jack.selectedCard) {
      setSelectedCardIdx(null);
    }
  }, [isMyTurn, jack.selectedCard, jack.currentTurnIndex]);

  const canMarbleMoveWithCard = (pos: number, card: string | null) => {
    if (!card) return false;
    if (pos === -1) return card === 'A' || card === 'K';
    return pos >= 0 && pos < 55;
  };

  const validPlayableMarbles =
    isMyTurn && myState && jack.selectedCard
      ? myState.marbles
          .map((pos, mIdx) => ({ pos, mIdx }))
          .filter((item) => canMarbleMoveWithCard(item.pos, jack.selectedCard))
      : [];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-600 shrink-0" />
          <div>
            <h3 className="text-lg font-extrabold text-[#141824] dark:text-white">چاكارو الأصلي</h3>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
              {jack.lastEventText}
            </p>
          </div>
        </div>
        {isHost && jack.phase !== 'LOBBY' && (
          <button
            type="button"
            onClick={() => send({ type: 'jackaroo:reset' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:text-[#141824] dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط</span>
          </button>
        )}
      </div>

      {/* Lobby */}
      {jack.phase === 'LOBBY' && (
        <div className="py-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400 flex items-center justify-center shadow-xs">
            <Disc className="w-8 h-8" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h4 className="text-base font-extrabold text-[#141824] dark:text-white">
              طاولة چاكارو الخشبية بالأحجار والكروت
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              يبدأ كل لاعب بكرت إخراج مضمون (A أو K). اختر الكرت ثم اضغط على الحجر المضيء لتحريكه
              على المسار وإدخال أحجارك الأربعة قبل خصومك.
            </p>
          </div>
          {isHost ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={seatedHumans.length < 2}
                onClick={() => {
                  soundFx.tap();
                  send({ type: 'jackaroo:start', withBot: false });
                }}
                className="px-5 py-2.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                {seatedHumans.length < 2
                  ? 'مباراة جماعية (2+ لاعبين)'
                  : `بدء چاكارو (${seatedHumans.length} لاعبين)`}
              </button>
              {seatedHumans.length === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    send({ type: 'jackaroo:start', withBot: true });
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

      {/* Finished */}
      {jack.phase === 'FINISHED' && (
        <div className="py-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
            <Trophy className="w-8 h-8" />
          </div>
          <h4 className="text-2xl font-extrabold text-[#141824] dark:text-white">
            {jack.lastEventText}
          </h4>
          {isHost && (
            <button
              type="button"
              onClick={() => send({ type: 'jackaroo:reset' })}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl cursor-pointer"
            >
              جولة جديدة
            </button>
          )}
        </div>
      )}

      {/* Playing */}
      {jack.phase === 'PLAYING' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_290px] gap-5 items-start">
          {/* Authentic Octagonal Wooden Jackaroo Table SVG */}
          <div className="w-full max-w-[490px] mx-auto p-3 bg-gradient-to-br from-[#5C280B] via-[#451A03] to-[#2B1002] rounded-[2rem] shadow-xl border-2 border-[#78350F]">
            <div className="aspect-square rounded-[1.5rem] overflow-hidden relative bg-[#3A1705]">
              <svg viewBox="0 0 100 100" className="w-full h-full block select-none">
                <defs>
                  {/* Realistic Walnut & Oak Wood Gradients */}
                  <radialGradient id="jackWoodSurface" cx="45%" cy="40%" r="65%">
                    <stop offset="0%" stopColor="#F5D08A" />
                    <stop offset="55%" stopColor="#D99B4E" />
                    <stop offset="100%" stopColor="#9C5B1D" />
                  </radialGradient>
                  <radialGradient id="jackCenterFelt" cx="50%" cy="50%" r="55%">
                    <stop offset="0%" stopColor="#065F46" />
                    <stop offset="85%" stopColor="#064E3B" />
                    <stop offset="100%" stopColor="#022C22" />
                  </radialGradient>
                  <radialGradient id="holeRecess" cx="50%" cy="40%" r="60%">
                    <stop offset="0%" stopColor="#5C2D0C" />
                    <stop offset="70%" stopColor="#854D1E" />
                    <stop offset="100%" stopColor="#B46927" />
                  </radialGradient>
                  {/* 3D Glass Marble Gradients per Color */}
                  {(Object.keys(COLOR_THEME) as LudoColor[]).map((c) => (
                    <radialGradient
                      key={`grad_${c}`}
                      id={`marble_${c}`}
                      cx="33%"
                      cy="30%"
                      r="68%"
                    >
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                      <stop offset="28%" stopColor={COLOR_THEME[c].light} />
                      <stop offset="68%" stopColor={COLOR_THEME[c].fill} />
                      <stop offset="100%" stopColor={COLOR_THEME[c].dark} />
                    </radialGradient>
                  ))}
                </defs>

                {/* Carved Octagonal Wooden Plate */}
                <polygon
                  points="30,3 70,3 97,30 97,70 70,97 30,97 3,70 3,30"
                  fill="url(#jackWoodSurface)"
                  stroke="#451A03"
                  strokeWidth="1.5"
                />
                {/* Inner Carved Decorative Bevel Frame */}
                <polygon
                  points="31.5,5.5 68.5,5.5 94.5,31.5 94.5,68.5 68.5,94.5 31.5,94.5 5.5,68.5 5.5,31.5"
                  fill="none"
                  stroke="#78350F"
                  strokeOpacity="0.45"
                  strokeWidth="0.6"
                />

                {/* 4 Wooden Quadrant Dividers */}
                <line x1="20" y1="20" x2="80" y2="80" stroke="#78350F" strokeOpacity="0.16" strokeWidth="0.6" />
                <line x1="80" y1="20" x2="20" y2="80" stroke="#78350F" strokeOpacity="0.16" strokeWidth="0.6" />

                {/* Center Velvet Card Discard Zone */}
                <circle
                  cx={50}
                  cy={50}
                  r={12.5}
                  fill="url(#jackCenterFelt)"
                  stroke="#78350F"
                  strokeWidth="1.1"
                />
                <circle
                  cx={50}
                  cy={50}
                  r={11.2}
                  fill="none"
                  stroke="#FDE68A"
                  strokeOpacity="0.35"
                  strokeWidth="0.35"
                  strokeDasharray="1.2 1.2"
                />

                {/* Center Table Last Played Card Render */}
                {jack.lastPlayedCard ? (
                  <g transform="translate(50, 50)">
                    <rect
                      x={-5.2}
                      y={-7}
                      width={10.4}
                      height={14}
                      rx={1.5}
                      fill="#FFFFFF"
                      stroke="#CBD5E1"
                      strokeWidth="0.4"
                    />
                    <text
                      x={-3.6}
                      y={-3.8}
                      fontSize="2.8"
                      fontWeight="800"
                      fill="#0F172A"
                    >
                      {jack.lastPlayedCard}
                    </text>
                    <text
                      x={0}
                      y={1.8}
                      textAnchor="middle"
                      fontSize="6"
                      fontWeight="900"
                      fill={
                        jack.lastPlayedCard === 'A' || jack.lastPlayedCard === 'K' || jack.lastPlayedCard === 'Q'
                          ? '#DC2626'
                          : '#0F172A'
                      }
                    >
                      {jack.lastPlayedCard}
                    </text>
                    <text
                      x={3.6}
                      y={5.4}
                      textAnchor="end"
                      fontSize="2.6"
                      fill="#64748B"
                    >
                      ♠
                    </text>
                  </g>
                ) : (
                  <text
                    x={50}
                    y={51.5}
                    textAnchor="middle"
                    fontSize="3.4"
                    fontWeight="700"
                    fill="#FDE68A"
                    opacity={0.75}
                  >
                    چاكارو
                  </text>
                )}

                {/* Corner Player Base Plates & 4 Recessed Sockets */}
                {(Object.keys(START_OFFSET) as LudoColor[]).map((color) => {
                  const corners: Record<LudoColor, [number, number]> = {
                    red: [28, 28],
                    green: [72, 28],
                    yellow: [72, 72],
                    blue: [28, 72],
                  };
                  const [px, py] = corners[color];
                  return (
                    <g key={`base_${color}`}>
                      <circle
                        cx={px}
                        cy={py}
                        r={7.5}
                        fill={COLOR_THEME[color].fill}
                        fillOpacity={0.14}
                        stroke={COLOR_THEME[color].fill}
                        strokeOpacity={0.5}
                        strokeWidth={0.5}
                      />
                      {[0, 1, 2, 3].map((idx) => {
                        const [hx, hy] = getBaseSocketCoords(color, idx);
                        return (
                          <circle
                            key={`yh_${color}_${idx}`}
                            cx={hx}
                            cy={hy}
                            r={1.95}
                            fill="url(#holeRecess)"
                            stroke={COLOR_THEME[color].fill}
                            strokeWidth={0.55}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* 52 Outer Carved Perimeter Holes */}
                {Array.from({ length: 52 }, (_, g) => {
                  const [x, y] = getTrackPoint(g, 39);
                  const startEntry = (Object.entries(START_OFFSET) as Array<[LudoColor, number]>).find(
                    ([, val]) => val === g
                  );
                  return (
                    <g key={`h_${g}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r={startEntry ? 2.15 : 1.6}
                        fill={startEntry ? COLOR_THEME[startEntry[0]].fill : 'url(#holeRecess)'}
                        fillOpacity={startEntry ? 0.85 : 0.92}
                        stroke={startEntry ? '#FFFFFF' : '#5C2D0C'}
                        strokeWidth={startEntry ? 0.5 : 0.35}
                      />
                      {startEntry && (
                        <circle
                          cx={x}
                          cy={y}
                          r={0.65}
                          fill="#FFFFFF"
                          opacity={0.75}
                        />
                      )}
                    </g>
                  );
                })}

                {/* 4 Carved Safe Home Lanes */}
                {(Object.keys(START_OFFSET) as LudoColor[]).map((c) =>
                  [1, 2, 3, 4].map((step) => {
                    const [x, y] = getHomeSocketCoords(c, step);
                    return (
                      <circle
                        key={`hl_${c}_${step}`}
                        cx={x}
                        cy={y}
                        r={1.85}
                        fill="#FEF3C7"
                        stroke={COLOR_THEME[c].fill}
                        strokeWidth={0.75}
                      />
                    );
                  })
                )}

                {/* Glossy Glass Marbles with Smooth Transform Motion */}
                {jack.players.map((p) =>
                  p.marbles.map((pos, mIdx) => {
                    const [cx, cy] = getMarbleCoords(p.color, pos, mIdx);
                    const isMine = p.playerId === playerId;
                    const selectable =
                      isMyTurn && isMine && canMarbleMoveWithCard(pos, jack.selectedCard);

                    return (
                      <g
                        key={`m_${p.playerId}_${mIdx}`}
                        onClick={() => {
                          if (!selectable || !jack.selectedCard) return;
                          soundFx.tap();
                          send({
                            type: 'jackaroo:play',
                            card: jack.selectedCard,
                            marbleIndex: mIdx,
                          });
                        }}
                        style={{
                          transform: `translate(${cx}px, ${cy}px)`,
                          transition: 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
                          cursor: selectable ? 'pointer' : 'default',
                        }}
                      >
                        {/* Pulsing selection ring when card can move this marble */}
                        {selectable && (
                          <circle
                            cx={0}
                            cy={0}
                            r={3.55}
                            fill={COLOR_THEME[p.color].fill}
                            fillOpacity={0.2}
                            stroke="#FFFFFF"
                            strokeWidth={0.75}
                            className="animate-pulse"
                          />
                        )}
                        {/* Soft marble shadow */}
                        <ellipse cx={0.35} cy={0.75} rx={2.25} ry={1.85} fill="#0F172A" opacity={0.38} />
                        {/* Glass Marble Body */}
                        <circle
                          cx={0}
                          cy={0}
                          r={2.35}
                          fill={`url(#marble_${p.color})`}
                          stroke={selectable ? '#FFFFFF' : '#1E293B'}
                          strokeWidth={selectable ? 0.6 : 0.3}
                        />
                        {/* Marble tiny index number for clarity when picking */}
                        {isMine && selectable && (
                          <text
                            x={0}
                            y={0.85}
                            textAnchor="middle"
                            fontSize="2.2"
                            fontWeight="900"
                            fill="#FFFFFF"
                          >
                            {mIdx + 1}
                          </text>
                        )}
                      </g>
                    );
                  })
                )}
              </svg>
            </div>
          </div>

          {/* Right Panel: Turn Banner, Playing Cards Hand, Quick Play & Scores */}
          <div className="space-y-4">
            <div
              className={`border rounded-2xl p-4 space-y-2 text-center transition-colors ${
                isMyTurn
                  ? 'bg-amber-50/80 dark:bg-amber-950/35 border-amber-300 dark:border-amber-800 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
              }`}
            >
              <TurnTimerBar
                timeLeft={jack.turnTimeLeft}
                duration={jack.turnDuration}
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
                  style={{
                    backgroundColor: activePlayer
                      ? COLOR_THEME[activePlayer.color].fill
                      : '#94A3B8',
                  }}
                />
                <p className="text-base font-extrabold text-[#141824] dark:text-white">
                  {activePlayer?.name}
                </p>
              </div>

              {jack.lastPlayedCard && (
                <p className="text-xs text-slate-600 dark:text-slate-300 font-mono-num">
                  آخر كرت على الطاولة:{' '}
                  <strong className="text-[#141824] dark:text-white">{jack.lastPlayedCard}</strong>
                </p>
              )}
            </div>

            {myState && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                    {isMyTurn
                      ? jack.selectedCard
                        ? 'اضغط على حجر مضيء باللوحة للتحريك'
                        : 'اختر كرتاً من أوراقك'
                      : 'أوراق يدك'}
                  </p>
                  <span className="text-[11px] font-mono-num text-slate-400">
                    {myState.hand.length} أوراق
                  </span>
                </div>

                {/* Fanned / Crisp Playing Cards Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {myState.hand.map((card, i) => {
                    const isSelected =
                      isMyTurn &&
                      ((selectedCardIdx !== null && selectedCardIdx === i && jack.selectedCard === card) ||
                        (selectedCardIdx === null && jack.selectedCard === card && myState.hand.indexOf(card) === i));
                    const suit = CARD_SUITS[(i + card.charCodeAt(0)) % CARD_SUITS.length];
                    const isRedSuit = suit === '♥' || suit === '♦';
                    const meta = CARD_META[card] || { label: `+${card} خطوات`, badge: `+${card}` };
                    const hasAnyValidMove = myState.marbles.some((m) =>
                      canMarbleMoveWithCard(m, card)
                    );

                    return (
                      <button
                        key={`${card}_${i}`}
                        type="button"
                        disabled={!isMyTurn}
                        onClick={() => {
                          soundFx.tap();
                          setSelectedCardIdx(i);
                          send({ type: 'jackaroo:select_card', card });
                        }}
                        className={`group p-2.5 rounded-2xl border-2 text-center transition-all cursor-pointer disabled:opacity-60 disabled:cursor-default relative flex flex-col justify-between min-h-[104px] shadow-xs ${
                          isSelected
                            ? 'border-amber-600 bg-white dark:bg-slate-800 -translate-y-1.5 shadow-md ring-4 ring-amber-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:-translate-y-0.5 hover:border-amber-400'
                        }`}
                      >
                        <div className="w-full flex items-center justify-between text-xs font-extrabold">
                          <span
                            className={`font-mono-num ${
                              isRedSuit
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-[#141824] dark:text-white'
                            }`}
                          >
                            {card}
                          </span>
                          <span
                            className={
                              isRedSuit
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {suit}
                          </span>
                        </div>

                        <div className="my-0.5 flex flex-col items-center">
                          <span
                            className={`text-2xl font-black font-mono-num leading-none ${
                              isRedSuit
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-[#141824] dark:text-white'
                            }`}
                          >
                            {card}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-1">
                            {meta.badge}
                          </span>
                        </div>

                        <div className="w-full flex items-center justify-between text-[10px]">
                          <span
                            className={
                              isRedSuit
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {suit}
                          </span>
                          {isMyTurn && (
                            <span
                              className={`font-bold ${
                                hasAnyValidMove
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {hasAnyValidMove ? 'جاهز' : 'حرق فقط'}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Smart helper action if card selected so user can also tap a quick button to move */}
                {isMyTurn && jack.selectedCard && (
                  <div className="space-y-2 pt-1">
                    {validPlayableMarbles.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.tap();
                          send({
                            type: 'jackaroo:play',
                            card: jack.selectedCard,
                            marbleIndex: validPlayableMarbles[0].mIdx,
                          });
                        }}
                        className="w-full py-2.5 text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          تحريك الحجر #{validPlayableMarbles[0].mIdx + 1} بكرت {jack.selectedCard}
                        </span>
                      </button>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-200 text-center">
                        لا توجد أحجار على المسار لهذا الكرت — يمكنك حرقه وسحب كرت جديد
                      </div>
                    )}
                  </div>
                )}

                {isMyTurn && (
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      send({ type: 'jackaroo:discard' });
                    }}
                    className="w-full py-2 text-xs font-bold text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Flame className="w-3.5 h-3.5 text-orange-500" />
                    <span>
                      {jack.selectedCard
                        ? `حرق كرت (${jack.selectedCard}) وسحب بديل`
                        : 'حرق كرت وتمرير الدور'}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Players Home Progress */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {jack.players.map((p, idx) => {
                const homeCount = p.marbles.filter((m) => m >= 52).length;
                const onTrackCount = p.marbles.filter((m) => m >= 0 && m < 52).length;
                const isActive = idx === jack.currentTurnIndex;
                return (
                  <div
                    key={p.playerId}
                    className={`px-3.5 py-2.5 flex items-center justify-between text-xs ${
                      isActive ? 'bg-amber-50/50 dark:bg-amber-950/25' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: COLOR_THEME[p.color].fill }}
                      />
                      <span className="font-bold text-[#141824] dark:text-white truncate">
                        {p.name}
                      </span>
                    </div>
                    <span className="font-mono-num text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">مسار {onTrackCount}</span>
                      <span className="font-bold flex items-center gap-1">
                        {homeCount === 4 && <Crown className="w-3 h-3 text-amber-500" />}
                        {homeCount}/4
                      </span>
                    </span>
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
