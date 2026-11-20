import React from 'react';
import {
  Bot,
  Building2,
  Coins,
  Dices,
  Home,
  Hotel,
  Lock,
  Plane,
  RotateCcw,
  Sparkles,
  Tag,
  Trophy,
} from 'lucide-react';
import { BANK_BOARD_TILES } from '../../shared/gameCatalog';
import type { RoomFullState } from '../../shared/types';
import { soundFx } from '../../utils/sound';
import { DiceFace } from './DiceFace';
import { TurnTimerBar } from './TurnTimerBar';

interface BankGameProps {
  room: RoomFullState;
  playerId: string;
  isHost: boolean;
  send: (payload: Record<string, unknown>) => boolean;
}

// Clockwise 24-tile perimeter on a 7x7 grid (rendered with dir="ltr")
const TILE_GRID_POS: Record<number, { row: number; col: number }> = {
  0: { row: 1, col: 1 },
  1: { row: 1, col: 2 },
  2: { row: 1, col: 3 },
  3: { row: 1, col: 4 },
  4: { row: 1, col: 5 },
  5: { row: 1, col: 6 },
  6: { row: 1, col: 7 },
  7: { row: 2, col: 7 },
  8: { row: 3, col: 7 },
  9: { row: 4, col: 7 },
  10: { row: 5, col: 7 },
  11: { row: 6, col: 7 },
  12: { row: 7, col: 7 },
  13: { row: 7, col: 6 },
  14: { row: 7, col: 5 },
  15: { row: 7, col: 4 },
  16: { row: 7, col: 3 },
  17: { row: 7, col: 2 },
  18: { row: 7, col: 1 },
  19: { row: 6, col: 1 },
  20: { row: 5, col: 1 },
  21: { row: 4, col: 1 },
  22: { row: 3, col: 1 },
  23: { row: 2, col: 1 },
};

export const BankGame: React.FC<BankGameProps> = ({ room, playerId, isHost, send }) => {
  const bank = room.bank;
  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  const activePlayer = bank.players[bank.currentTurnIndex];
  const myPlayer = bank.players.find((p) => p.playerId === playerId);
  const isMyTurn = activePlayer?.playerId === playerId;
  const awaitingTile =
    bank.awaitingBuyTile !== null ? BANK_BOARD_TILES[bank.awaitingBuyTile] : null;

  const getPlayerColor = (pid: string) =>
    bank.players.find((p) => p.playerId === pid)?.color || '#64748B';

  const getOwnedTiles = (pid: string) =>
    BANK_BOARD_TILES.filter((t) => bank.owners[t.index] === pid);

  const hasColorMonopoly = (pid: string, color?: string) => {
    if (!color) return false;
    const group = BANK_BOARD_TILES.filter((t) => t.kind === 'city' && t.color === color);
    return group.length > 0 && group.every((t) => bank.owners[t.index] === pid);
  };

  const getEffectiveRent = (tileIndex: number, ownerId: string) => {
    const tile = BANK_BOARD_TILES[tileIndex];
    if (!tile || !tile.rent) return 0;
    const houses = bank.buildings?.[tileIndex] || 0;
    let rent = Math.round(tile.rent * (1 + houses * 0.75));
    if (tile.kind === 'city' && hasColorMonopoly(ownerId, tile.color)) {
      rent = Math.round(rent * 1.35);
    }
    return rent;
  };

  const myOwnedTiles = getOwnedTiles(playerId);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col gap-3.5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-600 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-extrabold text-[#141824] dark:text-white truncate">
              بنك الحظ الكامل
            </h3>
            <p className="text-[11px] sm:text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5 truncate">
              {bank.lastEventText}
            </p>
          </div>
        </div>
        {isHost && bank.phase !== 'LOBBY' && (
          <button
            type="button"
            onClick={() => send({ type: 'bank:reset' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:text-[#141824] dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط</span>
          </button>
        )}
      </div>

      {bank.phase === 'LOBBY' && (
        <div className="py-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-900 text-teal-700 dark:text-teal-400 flex items-center justify-center">
            <Building2 className="w-8 h-8" />
          </div>
          <div className="max-w-lg space-y-1.5">
            <h4 className="text-base font-extrabold text-[#141824] dark:text-white">
              بنك الحظ · رقعة 24 خانة متكاملة
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              يبدأ كل لاعب بـ 1,500 جنيه. اشترِ المدن والمحطات، ابنِ حتى 3 منازل وفندق لمضاعفة
              الإيجار، اجمع المجموعة اللونية الكاملة (+35%)، وتجنب السجن والضرائب!
            </p>
          </div>
          {isHost ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={seatedHumans.length < 2}
                onClick={() => {
                  soundFx.tap();
                  send({ type: 'bank:start', withBot: false });
                }}
                className="px-5 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                {seatedHumans.length < 2
                  ? 'مباراة جماعية (2+ لاعبين)'
                  : `بدء بنك الحظ (${seatedHumans.length} لاعبين)`}
              </button>
              {seatedHumans.length === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    send({ type: 'bank:start', withBot: true });
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

      {bank.phase === 'FINISHED' && (
        <div className="py-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
            <Trophy className="w-8 h-8" />
          </div>
          <h4 className="text-2xl font-extrabold text-[#141824] dark:text-white">
            {bank.lastEventText}
          </h4>
          {isHost && (
            <button
              type="button"
              onClick={() => send({ type: 'bank:reset' })}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl cursor-pointer"
            >
              مباراة جديدة
            </button>
          )}
        </div>
      )}

      {bank.phase === 'PLAYING' && (
        <div className="space-y-3.5">
          {/* Compact Top Cash Balances & Player Roster (keeps full width free for 7x7 board) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {bank.players.map((p, idx) => {
              const isActive = idx === bank.currentTurnIndex;
              const ownedList = getOwnedTiles(p.playerId);
              const totalHouses = ownedList.reduce(
                (s, t) => s + (bank.buildings?.[t.index] || 0),
                0
              );
              return (
                <div
                  key={p.playerId}
                  className={`px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors ${
                    isActive
                      ? 'bg-teal-50/80 dark:bg-teal-950/35 border-teal-400 dark:border-teal-600 shadow-2xs'
                      : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <div className="min-w-0">
                      <p
                        className={`font-bold truncate flex items-center gap-1 ${
                          p.bankrupt
                            ? 'line-through text-slate-400'
                            : 'text-[#141824] dark:text-white'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {p.jailTurns > 0 && !p.bankrupt && (
                          <Lock className="w-3 h-3 text-rose-500 shrink-0" />
                        )}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono-num truncate">
                        {p.bankrupt ? 'مفلس' : `${ownedList.length} عقار · ${totalHouses} مبنى`}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono-num font-extrabold text-teal-700 dark:text-teal-400 text-xs sm:text-sm shrink-0">
                    {p.cash} ج
                  </span>
                </div>
              );
            })}
          </div>

          {/* 100%-Width Responsive 7x7 Monopoly Perimeter Property Board (Zero horizontal scroll) */}
          <div
            dir="ltr"
            className="w-full grid grid-cols-7 grid-rows-7 gap-0.5 sm:gap-1 bg-slate-200/90 dark:bg-slate-800/95 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-300 dark:border-slate-700 shadow-inner"
          >
            {BANK_BOARD_TILES.map((tile) => {
              const gridPos = TILE_GRID_POS[tile.index];
              const ownerId = bank.owners[tile.index];
              const houses = bank.buildings?.[tile.index] || 0;
              const playersHere = bank.players.filter(
                (p) => !p.bankrupt && p.position === tile.index
              );
              const isActiveTile =
                activePlayer && !activePlayer.bankrupt && activePlayer.position === tile.index;

              const subLabel =
                tile.kind === 'start'
                  ? '+200 ج'
                  : tile.kind === 'tax'
                    ? tile.index === 5
                      ? '-120 ج'
                      : '-180 ج'
                    : tile.kind === 'jail'
                      ? 'سجن'
                      : tile.kind === 'goto_jail'
                        ? 'توقيف'
                        : tile.kind === 'chance'
                          ? 'فرصة'
                          : tile.kind === 'chest'
                            ? 'حظ'
                            : tile.kind === 'rest'
                              ? 'أمان'
                              : ownerId
                                ? `إيجار ${getEffectiveRent(tile.index, ownerId)}`
                                : `${tile.price} ج`;

              return (
                <div
                  key={tile.index}
                  dir="rtl"
                  title={tile.name}
                  style={{ gridRowStart: gridPos.row, gridColumnStart: gridPos.col }}
                  className={`min-w-0 overflow-hidden bg-white dark:bg-slate-900 border rounded-lg sm:rounded-xl p-0.5 sm:p-1 min-h-[48px] sm:min-h-[62px] md:min-h-[68px] flex flex-col justify-between relative transition-all ${
                    isActiveTile
                      ? 'border-teal-600 dark:border-teal-400 ring-2 ring-teal-500/30 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {/* Top Color Strip + Houses */}
                  <div className="space-y-0.5 min-w-0">
                    {tile.color ? (
                      <div
                        className="h-1.5 sm:h-2 w-full rounded-xs flex items-center justify-center gap-0.5 px-0.5"
                        style={{ backgroundColor: tile.color }}
                      >
                        {houses === 4 ? (
                          <span className="text-[7px] sm:text-[8px] font-black text-white leading-none">
                            ★
                          </span>
                        ) : (
                          Array.from({ length: houses }).map((_, hi) => (
                            <span
                              key={hi}
                              className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white shadow-2xs"
                            />
                          ))
                        )}
                      </div>
                    ) : (
                      <div
                        className={`h-1.5 w-full rounded-xs ${
                          tile.kind === 'start'
                            ? 'bg-emerald-500'
                            : tile.kind === 'goto_jail'
                              ? 'bg-rose-500'
                              : tile.kind === 'jail'
                                ? 'bg-slate-600'
                                : tile.kind === 'chance' || tile.kind === 'chest'
                                  ? 'bg-amber-400'
                                  : tile.kind === 'tax'
                                    ? 'bg-orange-500'
                                    : 'bg-sky-400'
                        }`}
                      />
                    )}

                    <p className="text-[8px] sm:text-[9.5px] md:text-[10px] font-extrabold text-[#141824] dark:text-white leading-tight text-center truncate px-0.5">
                      {tile.kind === 'station' && (
                        <Plane className="hidden sm:inline w-2.5 h-2.5 ml-0.5 opacity-75" />
                      )}
                      {tile.kind === 'jail' && (
                        <Lock className="hidden sm:inline w-2.5 h-2.5 ml-0.5 opacity-75" />
                      )}
                      {tile.name}
                    </p>
                  </div>

                  <p
                    className={`text-[7.5px] sm:text-[9px] font-mono-num text-center leading-none truncate ${
                      ownerId
                        ? 'font-extrabold text-teal-700 dark:text-teal-400'
                        : 'font-semibold text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {subLabel}
                  </p>

                  <div className="flex items-center justify-between gap-0.5 min-h-[10px] sm:min-h-[13px]">
                    {ownerId ? (
                      <span
                        className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-xs border border-white dark:border-slate-900 shadow-2xs shrink-0"
                        style={{ backgroundColor: getPlayerColor(ownerId) }}
                        title="مملوكة"
                      />
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-0.5 flex-wrap justify-end">
                      {playersHere.map((p) => (
                        <span
                          key={p.playerId}
                          className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-white dark:border-slate-900 shadow-xs"
                          style={{ backgroundColor: p.color }}
                          title={p.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Center Arena Controls (5x5 Inner Hub) */}
            <div
              dir="rtl"
              className="col-start-2 col-end-7 row-start-2 row-end-7 min-w-0 overflow-hidden bg-gradient-to-br from-white via-slate-50 to-teal-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-teal-950/20 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl p-2 sm:p-4 flex flex-col items-center justify-between text-center gap-1.5 sm:gap-2.5 shadow-xs"
            >
              <div className="w-full max-w-[210px]">
                <TurnTimerBar
                  timeLeft={bank.turnTimeLeft}
                  duration={bank.turnDuration}
                  isMyTurn={isMyTurn}
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2 flex flex-col items-center min-w-0 w-full">
                <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
                  <span
                    className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ring-2 ring-white dark:ring-slate-900 shrink-0"
                    style={{ backgroundColor: activePlayer?.color || '#64748B' }}
                  />
                  <p className="text-xs sm:text-sm font-extrabold text-[#141824] dark:text-white truncate">
                    {isMyTurn ? 'دورك الآن' : `دور: ${activePlayer?.name}`}
                  </p>
                  {activePlayer && activePlayer.jailTurns > 0 && (
                    <span className="text-[9px] sm:text-[10px] font-bold text-rose-600 dark:text-rose-400 inline-flex items-center gap-0.5 shrink-0">
                      <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      سجن
                    </span>
                  )}
                </div>

                <div className="sm:hidden">
                  <DiceFace
                    value={bank.diceValue}
                    size="sm"
                    highlight={isMyTurn && bank.awaitingBuyTile === null}
                  />
                </div>
                <div className="hidden sm:block">
                  <DiceFace
                    value={bank.diceValue}
                    size="md"
                    highlight={isMyTurn && bank.awaitingBuyTile === null}
                  />
                </div>
              </div>

              {awaitingTile && isMyTurn ? (
                <div className="space-y-1.5 sm:space-y-2 w-full max-w-[240px] bg-teal-50/85 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl p-2 sm:p-2.5">
                  <div className="flex items-center justify-center gap-1.5">
                    {awaitingTile.color && (
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: awaitingTile.color }}
                      />
                    )}
                    <p className="text-[11px] sm:text-xs font-extrabold text-[#141824] dark:text-white truncate">
                      شراء {awaitingTile.name} بـ{' '}
                      <span className="font-mono-num">{awaitingTile.price} ج</span>؟
                    </p>
                  </div>
                  <p className="text-[9.5px] sm:text-[10px] text-slate-600 dark:text-slate-300 font-mono-num">
                    الإيجار: {awaitingTile.rent} ج
                    {awaitingTile.buildCost ? ` · بناء: ${awaitingTile.buildCost} ج` : ''}
                  </p>
                  <div className="flex gap-1.5 justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.correct();
                        send({ type: 'bank:buy', accept: true });
                      }}
                      className="px-3 py-1 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      شراء
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.tap();
                        send({ type: 'bank:buy', accept: false });
                      }}
                      className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      تخطي
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  {isMyTurn && activePlayer && activePlayer.jailTurns > 0 && (
                    <button
                      type="button"
                      disabled={activePlayer.cash < 100}
                      onClick={() => {
                        soundFx.tap();
                        send({ type: 'bank:pay_bail' });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 rounded-xl cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Coins className="w-3.5 h-3.5" />
                      <span>كفالة (100 ج)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!isMyTurn || bank.awaitingBuyTile !== null}
                    onClick={() => {
                      soundFx.dice();
                      send({ type: 'bank:roll' });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-5 sm:py-2.5 text-[11px] sm:text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl cursor-pointer disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    <Dices className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>
                      {!isMyTurn
                        ? 'انتظر دورك'
                        : activePlayer?.jailTurns
                          ? 'ارمِ للخروج (6)'
                          : 'ارمِ النرد'}
                    </span>
                  </button>
                </div>
              )}

              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 leading-snug max-w-[240px] line-clamp-2">
                {bank.lastEventText}
              </p>
            </div>
          </div>

          {/* Compact Rules Hint Strip */}
          <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
            <span className="font-extrabold text-[#141824] dark:text-white inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>قواعد التطوير:</span>
            </span>
            <span className="text-[11px]">
              كل منزل يرفع الإيجار +75% (حتى 3 منازل ثم فندق) · امتلاك كامل اللون يمنحك +35% إضافي
            </span>
          </div>

          {/* Player Property Manager (Build Houses/Hotels & Sell Back to Bank) */}
          {myPlayer && !myPlayer.bankrupt && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold text-[#141824] dark:text-white flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>عقاراتك وتطوير المباني ({myOwnedTiles.length})</span>
                </h4>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isMyTurn
                    ? 'يمكنك البناء أو البيع الآن خلال دورك'
                    : 'تتفعّل أزرار البناء والبيع خلال دورك'}
                </span>
              </div>

              {myOwnedTiles.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
                  لم تشترِ أي مدينة أو محطة بعد — اشترِ العقارات لجمع الإيجارات وبناء المنازل.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {myOwnedTiles.map((tile) => {
                    const houses = bank.buildings?.[tile.index] || 0;
                    const effRent = getEffectiveRent(tile.index, playerId);
                    const hasMonopoly = hasColorMonopoly(playerId, tile.color);
                    const canBuild =
                      isMyTurn &&
                      tile.kind === 'city' &&
                      Boolean(tile.buildCost) &&
                      houses < 4 &&
                      myPlayer.cash >= (tile.buildCost || 0);
                    const sellRefund = Math.round(
                      ((tile.price || 0) + houses * (tile.buildCost || 0)) * 0.7
                    );

                    return (
                      <div
                        key={tile.index}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col justify-between gap-2.5"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-xs shrink-0"
                                style={{ backgroundColor: tile.color || '#475569' }}
                              />
                              <span className="text-xs font-extrabold text-[#141824] dark:text-white truncate">
                                {tile.name}
                              </span>
                            </div>
                            {hasMonopoly && (
                              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                احتكار +35%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                            <span>الإيجار: {effRent} ج</span>
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                              {houses === 4 ? (
                                <>
                                  <Hotel className="w-3 h-3" /> فندق
                                </>
                              ) : (
                                <>
                                  <Home className="w-3 h-3" /> {houses}/3 منازل
                                </>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {tile.kind === 'city' && tile.buildCost && (
                            <button
                              type="button"
                              disabled={!canBuild}
                              onClick={() => {
                                soundFx.tap();
                                send({ type: 'bank:build', tileIndex: tile.index });
                              }}
                              className="flex-1 py-1.5 px-2 text-[11px] font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors font-mono-num"
                            >
                              {houses >= 4
                                ? 'مكتمل (فندق)'
                                : houses === 3
                                  ? `بناء فندق (${tile.buildCost} ج)`
                                  : `بناء منزل (${tile.buildCost} ج)`}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!isMyTurn}
                            onClick={() => {
                              soundFx.tap();
                              send({ type: 'bank:sell', tileIndex: tile.index });
                            }}
                            title={`بيع للبنك مقابل ${sellRefund} ج`}
                            className="inline-flex items-center gap-1 py-1.5 px-2.5 text-[11px] font-bold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 disabled:opacity-45 rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors font-mono-num"
                          >
                            <Tag className="w-3 h-3" />
                            <span>+{sellRefund}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
