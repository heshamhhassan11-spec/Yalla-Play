import React, { useState } from 'react';
import { Clock, Crown, Globe, Lock, Mic, X } from 'lucide-react';
import {
  BASIC_ROOM_GAMES,
  BASIC_ROOM_PRICE_COINS,
  FREE_ROOM_GAMES,
  GAME_CATALOG,
} from '../shared/gameCatalog';
import type { GameType, PlayerProfile, RoomTier } from '../shared/types';
import { soundFx } from '../utils/sound';

interface CreateRoomModalProps {
  initialGame?: GameType;
  profile: PlayerProfile;
  onClose: () => void;
  onCreateFreeRoom: (opts: { title: string; gameType: GameType; isPrivate: boolean }) => void;
  onOpenBasicRoom: (opts: { title: string; gameType: GameType; isPrivate: boolean }) => void;
  onPurchaseBasicRoom: (title: string) => Promise<void>;
  onGoToStore: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  initialGame = 'ludo',
  profile,
  onClose,
  onCreateFreeRoom,
  onOpenBasicRoom,
  onPurchaseBasicRoom,
  onGoToStore,
}) => {
  const hasBasicRoom = Boolean(profile.basicRoomId);
  const [tier, setTier] = useState<RoomTier>(hasBasicRoom ? 'basic' : 'free');
  const [title, setTitle] = useState(`غرفة ${profile.name}`);
  const [gameType, setGameType] = useState<GameType>(
    FREE_ROOM_GAMES.includes(initialGame) ? initialGame : 'ludo'
  );
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedGames = tier === 'basic' ? BASIC_ROOM_GAMES : FREE_ROOM_GAMES;
  const activeGame = allowedGames.includes(gameType) ? gameType : allowedGames[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    soundFx.tap();

    if (tier === 'free') {
      onCreateFreeRoom({
        title: title.trim() || `غرفة ${profile.name}`,
        gameType: activeGame,
        isPrivate,
      });
      return;
    }

    if (hasBasicRoom) {
      onOpenBasicRoom({
        title: title.trim() || `غرفة ${profile.name}`,
        gameType: activeGame,
        isPrivate,
      });
      return;
    }

    if (profile.coins < BASIC_ROOM_PRICE_COINS) {
      setError(`تحتاج ${BASIC_ROOM_PRICE_COINS} عملة لفتح الغرفة الأساسية · رصيدك الحالي ${profile.coins}`);
      return;
    }

    setBusy(true);
    try {
      await onPurchaseBasicRoom(title.trim() || `غرفة ${profile.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر شراء الغرفة الأساسية');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-room-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-xl my-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 id="create-room-title" className="text-lg font-extrabold text-[#141824] dark:text-white">
            فتح غرفة صوتية وألعاب
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tier Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTier('free')}
            className={`p-4 rounded-xl border text-right space-y-1.5 cursor-pointer transition-colors ${
              tier === 'free'
                ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 dark:border-blue-500'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-[#141824] dark:text-white">
                غرفة مجانية
              </span>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                مجاناً
              </span>
            </div>
            <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
              <li>· 10 مايكات (صاحب الغرفة + 9 ضيوف)</li>
              <li>· رقم تعريفي غير مثبت · مشرفان فقط</li>
              <li>· بدون مستويات · تقفل بعد 6 ساعات</li>
              <li>· الألعاب: لودو والسلم والثعبان</li>
            </ul>
          </button>

          <button
            type="button"
            onClick={() => setTier('basic')}
            className={`p-4 rounded-xl border text-right space-y-1.5 cursor-pointer transition-colors ${
              tier === 'basic'
                ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 dark:border-blue-500'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-[#141824] dark:text-white flex items-center gap-1">
                <Crown className="w-4 h-4 text-amber-500" />
                <span>الغرفة الأساسية</span>
              </span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 font-mono-num">
                {hasBasicRoom ? 'مفعّلة' : '2,000 عملة'}
              </span>
            </div>
            <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
              <li>· رقم تعريفي مثبت · لا تقفل أبداً</li>
              <li>· 8 مستويات · حتى 14 مايك و 11 خلفية</li>
              <li>· حتى 15 مشرفاً و 3 نواب غرفة</li>
              <li>· 6 ألعاب كاملة شاملة بنك الحظ وچاكارو</li>
            </ul>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="room-title-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              اسم الغرفة
            </label>
            <input
              id="room-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={48}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              اللعبة الافتتاحية ({tier === 'free' ? 'متاح لعبتان' : '6 ألعاب متاحة'})
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {allowedGames.map((gt) => {
                const meta = GAME_CATALOG[gt];
                return (
                  <button
                    key={gt}
                    type="button"
                    onClick={() => setGameType(gt)}
                    className={`p-2.5 rounded-xl border text-right transition-colors cursor-pointer ${
                      activeGame === gt
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 dark:border-blue-500'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <p className="text-xs font-bold text-[#141824] dark:text-white">
                      {meta.titleAr}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {meta.playersRange}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setIsPrivate(false)}
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-right cursor-pointer ${
                !isPrivate
                  ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 dark:border-blue-500'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-xs font-bold text-[#141824] dark:text-white">غرفة عامة</span>
            </button>
            <button
              type="button"
              onClick={() => setIsPrivate(true)}
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-right cursor-pointer ${
                isPrivate
                  ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 dark:border-blue-500'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <Lock className="w-4 h-4 text-slate-600 dark:text-slate-300 shrink-0" />
              <span className="text-xs font-bold text-[#141824] dark:text-white">خاصة بالكود</span>
            </button>
          </div>

          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold px-3.5 py-2.5 rounded-lg flex items-center justify-between gap-2">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToStore();
                }}
                className="underline font-bold shrink-0 cursor-pointer"
              >
                الذهاب للمتجر
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              {tier === 'free' ? <Clock className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>
                {tier === 'free'
                  ? 'تُغلق تلقائياً بعد 6 ساعات'
                  : hasBasicRoom
                    ? `رقمك المثبت: ${profile.basicRoomId}`
                    : `الرسوم: 2,000 عملة (رصيدك: ${profile.coins})`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 dark:disabled:bg-slate-700 rounded-lg cursor-pointer"
              >
                {busy
                  ? 'جاري التفعيل...'
                  : tier === 'basic' && !hasBasicRoom
                    ? 'شراء وفتح الغرفة (2,000)'
                    : 'دخول الغرفة الآن'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
