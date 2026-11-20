import React, { useState } from 'react';
import { Eye, EyeOff, Flag, RotateCcw, Send, ShieldAlert, Users, Vote } from 'lucide-react';
import { SPY_WORD_PAIRS } from '../../shared/gameCatalog';
import type { RoomFullState } from '../../shared/types';
import { soundFx } from '../../utils/sound';
import { AvatarBadge } from '../Avatars';

interface SpyGameProps {
  room: RoomFullState;
  playerId: string;
  isHost: boolean;
  send: (payload: Record<string, unknown>) => boolean;
  onReportMessage?: (target: { id: string; name: string; messageId: string; text: string }) => void;
}

interface LocalPassPlayState {
  active: boolean;
  playerNames: string[];
  revealIndex: number;
  wordVisible: boolean;
  civilianWord: string;
  spyWord: string;
  category: string;
  spyIndex: number;
  phase: 'SETUP' | 'REVEAL' | 'DISCUSS' | 'RESULT';
}

export const SpyGame: React.FC<SpyGameProps> = ({
  room,
  playerId,
  isHost,
  send,
  onReportMessage,
}) => {
  const spy = room.spy;
  const [wordPeek, setWordPeek] = useState(false);
  const [clueInput, setClueInput] = useState('');
  const [localMode, setLocalMode] = useState<LocalPassPlayState>({
    active: false,
    playerNames: ['اللاعب 1', 'اللاعب 2', 'اللاعب 3', 'اللاعب 4'],
    revealIndex: 0,
    wordVisible: false,
    civilianWord: '',
    spyWord: '',
    category: '',
    spyIndex: 0,
    phase: 'SETUP',
  });

  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  const isSeated = seatedHumans.some((s) => s.playerId === playerId);

  const getPlayerName = (pid: string) =>
    room.members.find((m) => m.id === pid)?.name ||
    room.seats.find((s) => s.playerId === pid)?.playerName ||
    'لاعب';

  const getPlayerAvatar = (pid: string) =>
    room.members.find((m) => m.id === pid)?.avatar ||
    room.seats.find((s) => s.playerId === pid)?.avatar ||
    'falcon';

  const startLocalPassPlay = () => {
    const validNames = localMode.playerNames.map((n) => n.trim()).filter(Boolean);
    if (validNames.length < 3) return;
    const pair = SPY_WORD_PAIRS[Math.floor(Math.random() * SPY_WORD_PAIRS.length)];
    const spyIndex = Math.floor(Math.random() * validNames.length);
    soundFx.tap();
    setLocalMode({
      ...localMode,
      active: true,
      playerNames: validNames,
      revealIndex: 0,
      wordVisible: false,
      civilianWord: pair.civilian,
      spyWord: pair.spy,
      category: pair.category,
      spyIndex,
      phase: 'REVEAL',
    });
  };

  // Single-device Pass & Play view
  if (localMode.active) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-[#141824] dark:text-white">
              مين الجاسوس · اللعب على جهاز واحد
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              مرر الجهاز بين الأصدقاء ليرى كل لاعب كلمته السرية
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLocalMode((prev) => ({ ...prev, active: false, phase: 'SETUP' }))}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:text-[#141824] dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
          >
            العودة للغرفة المباشرة
          </button>
        </div>

        {localMode.phase === 'SETUP' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {localMode.playerNames.map((name, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono-num text-slate-400 w-5">{idx + 1}.</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      const next = [...localMode.playerNames];
                      next[idx] = e.target.value;
                      setLocalMode({ ...localMode, playerNames: next });
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-lg focus:outline-none focus:border-emerald-600"
                    placeholder={`اسم اللاعب ${idx + 1}`}
                  />
                  {localMode.playerNames.length > 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLocalMode({
                          ...localMode,
                          playerNames: localMode.playerNames.filter((_, i) => i !== idx),
                        })
                      }
                      className="text-xs text-rose-600 dark:text-rose-400 px-2 py-1 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded cursor-pointer"
                    >
                      حذف
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {localMode.playerNames.length < 8 && (
                <button
                  type="button"
                  onClick={() =>
                    setLocalMode({
                      ...localMode,
                      playerNames: [
                        ...localMode.playerNames,
                        `اللاعب ${localMode.playerNames.length + 1}`,
                      ],
                    })
                  }
                  className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  + إضافة لاعب
                </button>
              )}
              <button
                type="button"
                onClick={startLocalPassPlay}
                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
              >
                بدء توزيع الكلمات
              </button>
            </div>
          </div>
        )}

        {localMode.phase === 'REVEAL' && (
          <div className="py-6 flex flex-col items-center text-center gap-5">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              الفئة: {localMode.category} · اللاعب {localMode.revealIndex + 1} من{' '}
              {localMode.playerNames.length}
            </p>
            <h4 className="text-2xl font-extrabold text-[#141824] dark:text-white">
              دور {localMode.playerNames[localMode.revealIndex]}
            </h4>

            <div className="w-full max-w-sm bg-emerald-950 text-white rounded-xl p-6 text-center space-y-4">
              {localMode.wordVisible ? (
                <>
                  <p className="text-xs text-emerald-300">كلمتك السرية هي:</p>
                  <p className="text-3xl font-extrabold tracking-tight">
                    {localMode.revealIndex === localMode.spyIndex
                      ? localMode.spyWord
                      : localMode.civilianWord}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      if (localMode.revealIndex + 1 < localMode.playerNames.length) {
                        setLocalMode({
                          ...localMode,
                          revealIndex: localMode.revealIndex + 1,
                          wordVisible: false,
                        });
                      } else {
                        setLocalMode({ ...localMode, phase: 'DISCUSS', wordVisible: false });
                      }
                    }}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-sm cursor-pointer"
                  >
                    {localMode.revealIndex + 1 < localMode.playerNames.length
                      ? 'إخفاء وتمرير للاعب التالي'
                      : 'إخفاء وبدء النقاش'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-emerald-100">تأكد أن لا أحد ينظر إلى الشاشة</p>
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      setLocalMode({ ...localMode, wordVisible: true });
                    }}
                    className="w-full py-2.5 bg-white text-emerald-950 font-bold rounded-lg text-sm cursor-pointer"
                  >
                    اضغط لكشف كلمتك
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {localMode.phase === 'DISCUSS' && (
          <div className="py-6 text-center space-y-5">
            <h4 className="text-xl font-bold text-[#141824] dark:text-white">
              وقت التلميحات والنقاش!
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
              يقول كل لاعب تلميحاً واحداً عن كلمته بصوت عالٍ. بعد الانتهاء، اتفقوا بالتصويت على من
              تعتقدون أنه الجاسوس ثم اكشفوا الحقيقة.
            </p>
            <button
              type="button"
              onClick={() => {
                soundFx.win();
                setLocalMode({ ...localMode, phase: 'RESULT' });
              }}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-sm cursor-pointer"
            >
              كشف الجاسوس
            </button>
          </div>
        )}

        {localMode.phase === 'RESULT' && (
          <div className="py-6 text-center space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">الجاسوس في هذه الجولة كان</p>
            <h4 className="text-3xl font-extrabold text-rose-600 dark:text-rose-400">
              {localMode.playerNames[localMode.spyIndex]}
            </h4>
            <div className="flex items-center justify-center gap-6 text-sm text-slate-700 dark:text-slate-200 pt-2">
              <span>كلمة المدنيين: <strong>{localMode.civilianWord}</strong></span>
              <span aria-hidden="true">·</span>
              <span>كلمة الجاسوس: <strong>{localMode.spyWord}</strong></span>
            </div>
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setLocalMode({ ...localMode, phase: 'SETUP' })}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-sm cursor-pointer"
              >
                لعب جولة جديدة
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-[#141824] dark:text-white">مين الجاسوس؟</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {spy.phase === 'LOBBY'
              ? `اللاعبون الجاهزون: ${seatedHumans.length} · يُنصح بـ 3 إلى 6 لاعبين`
              : `الفئة: ${spy.category} · الجولة ${spy.round}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {spy.phase === 'LOBBY' && (
            <button
              type="button"
              onClick={() =>
                setLocalMode((prev) => ({ ...prev, active: true, phase: 'SETUP' }))
              }
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
            >
              اللعب على جهاز واحد
            </button>
          )}
          {isHost && spy.phase !== 'LOBBY' && (
            <button
              type="button"
              onClick={() => send({ type: 'spy:reset' })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-200 hover:text-[#141824] dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إنهاء الجولة</span>
            </button>
          )}
        </div>
      </div>

      {/* LOBBY PHASE */}
      {spy.phase === 'LOBBY' && (
        <div className="py-6 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
            <Users className="w-7 h-7" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h4 className="text-base font-bold text-[#141824] dark:text-white">
              بانتظار جلوس اللاعبين على المقاعد
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              كل لاعب يجلس على مقعد يستلم كلمة سرية عبر الشبكة. انسخ رابط الغرفة لدعوة أصدقائك أو
              افتح تبويباً جديداً للتجربة الفورية.
            </p>
          </div>
          {isHost ? (
            <button
              type="button"
              disabled={seatedHumans.length < 2}
              onClick={() => {
                soundFx.tap();
                send({ type: 'spy:start' });
              }}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {seatedHumans.length < 2
                ? 'يلزم لاعبان على الأقل على المقاعد'
                : `بدء الجولة الآن (${seatedHumans.length} لاعبين)`}
            </button>
          ) : (
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              بانتظار قيام مضيف الغرفة ببدء الجولة...
            </p>
          )}
        </div>
      )}

      {/* SECRET WORD BANNER (Visible during ROLE_REVEAL, CLUE_ROUND, VOTING) */}
      {spy.phase !== 'LOBBY' && spy.phase !== 'RESULT' && spy.myWord && (
        <div className="bg-emerald-950 text-white rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-xs text-emerald-300">بطاقتك السرية (لا تكشفها لأحد)</p>
            <p className="text-xl font-extrabold tracking-tight">
              {wordPeek ? spy.myWord : '••••••••'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              soundFx.tap();
              setWordPeek((p) => !p);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-white/10 hover:bg-white/20 rounded-lg cursor-pointer"
          >
            {wordPeek ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{wordPeek ? 'إخفاء الكلمة' : 'إظهار الكلمة'}</span>
          </button>
        </div>
      )}

      {/* ROLE REVEAL PHASE */}
      {spy.phase === 'ROLE_REVEAL' && (
        <div className="py-5 text-center space-y-4">
          <h4 className="text-base font-bold text-[#141824] dark:text-white">
            اطّلع على كلمتك السرية ثم ابدأوا جولة التلميحات
          </h4>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            تذكر: الجاسوس لا يعلم أنه الجاسوس، وقد تكون كلمته مختلفة قليلاً!
          </p>
          {isHost ? (
            <button
              type="button"
              onClick={() => {
                soundFx.tap();
                send({ type: 'spy:begin_clues' });
              }}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
            >
              بدء جولة التلميحات
            </button>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              بانتظار المضيف لبدء التلميحات...
            </p>
          )}
        </div>
      )}

      {/* CLUE ROUND PHASE */}
      {spy.phase === 'CLUE_ROUND' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-[#141824] dark:text-white">
              الدور الحالي:{' '}
              <span className="text-emerald-700 dark:text-emerald-400">
                {spy.currentTurnPlayerId ? getPlayerName(spy.currentTurnPlayerId) : ''}
              </span>
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
              {spy.clues.length} / {spy.turnOrder.length} تلميحات
            </span>
          </div>

          {spy.clues.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {spy.clues.map((c, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                    {c.playerName}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-[#141824] dark:text-white truncate">
                      {c.text}
                    </span>
                    {onReportMessage && c.playerId !== playerId && (
                      <button
                        type="button"
                        title="إبلاغ عن هذا التلميح / الرسالة"
                        onClick={() => {
                          soundFx.tap();
                          onReportMessage({
                            id: c.playerId,
                            name: c.playerName,
                            messageId: `spy_clue_${spy.round}_${idx}`,
                            text: c.text,
                          });
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 rounded border border-rose-200 dark:border-rose-800 cursor-pointer shrink-0"
                      >
                        <Flag className="w-2.5 h-2.5" />
                        <span>إبلاغ</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {spy.currentTurnPlayerId === playerId && isSeated && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!clueInput.trim()) return;
                soundFx.tap();
                send({ type: 'spy:clue', text: clueInput.trim() });
                setClueInput('');
              }}
              className="flex gap-2 pt-1"
            >
              <input
                type="text"
                value={clueInput}
                onChange={(e) => setClueInput(e.target.value)}
                placeholder="اكتب تلميحاً قصيراً دون ذكر الكلمة..."
                className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white rounded-lg focus:outline-none focus:border-emerald-600"
                maxLength={60}
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>إرسال</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* VOTING PHASE */}
      {spy.phase === 'VOTING' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-[#141824] dark:text-white flex items-center gap-2">
              <Vote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>صوّت على من تشك أنه الجاسوس</span>
            </h4>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
              {Object.keys(spy.votes).length} / {spy.turnOrder.length} أصوات
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {spy.clues.map((c, idx) => (
              <div
                key={idx}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs"
              >
                <span className="font-bold text-slate-600 dark:text-slate-300 shrink-0">{c.playerName}</span>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[#141824] dark:text-white font-semibold truncate">«{c.text}»</span>
                  {onReportMessage && c.playerId !== playerId && (
                    <button
                      type="button"
                      title="إبلاغ عن هذا التلميح / الرسالة"
                      onClick={() => {
                        soundFx.tap();
                        onReportMessage({
                          id: c.playerId,
                          name: c.playerName,
                          messageId: `spy_vote_clue_${spy.round}_${idx}`,
                          text: c.text,
                        });
                      }}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 rounded border border-rose-200 dark:border-rose-800 cursor-pointer shrink-0"
                    >
                      <Flag className="w-2.5 h-2.5" />
                      <span>إبلاغ</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
            {spy.turnOrder.map((pid) => {
              const myVote = spy.votes[playerId];
              const isVotedByMe = myVote === pid;
              const voteCount = Object.values(spy.votes).filter((v) => v === pid).length;

              return (
                <button
                  key={pid}
                  type="button"
                  disabled={!spy.turnOrder.includes(playerId) || Boolean(myVote)}
                  onClick={() => {
                    soundFx.tap();
                    send({ type: 'spy:vote', targetId: pid });
                  }}
                  className={`p-3 rounded-xl border text-right flex items-center gap-3 transition-colors cursor-pointer disabled:cursor-default ${
                    isVotedByMe
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:border-emerald-500'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                  }`}
                >
                  <AvatarBadge avatarId={getPlayerAvatar(pid)} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#141824] dark:text-white truncate">
                      {getPlayerName(pid)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                      {voteCount > 0 ? `${voteCount} صوت` : 'اضغط للتصويت'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* RESULT PHASE */}
      {spy.phase === 'RESULT' && (
        <div className="py-5 text-center space-y-4">
          <div
            className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${
              spy.winner === 'civilians'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
            }`}
          >
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h4 className="text-2xl font-extrabold text-[#141824] dark:text-white">
            {spy.winner === 'civilians' ? 'فاز المدنيون! تم كشف الجاسوس' : 'فاز الجاسوس!'}
          </h4>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            الجاسوس كان:{' '}
            <strong className="text-rose-600 dark:text-rose-400">
              {spy.spyIds?.map(getPlayerName).join('، ')}
            </strong>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 px-4 max-w-md mx-auto">
            <span>
              كلمة المدنيين:{' '}
              <strong className="text-emerald-700 dark:text-emerald-400">{spy.civilianWord}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              كلمة الجاسوس:{' '}
              <strong className="text-rose-600 dark:text-rose-400">{spy.spyWord}</strong>
            </span>
          </div>

          {isHost && (
            <button
              type="button"
              onClick={() => {
                soundFx.tap();
                send({ type: 'spy:start' });
              }}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
            >
              جولة جديدة
            </button>
          )}
        </div>
      )}
    </div>
  );
};
