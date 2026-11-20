import React, { useEffect } from 'react';
import { Award, CheckCircle2, Clock, Play, RotateCcw, XCircle, Zap } from 'lucide-react';
import type { RoomFullState } from '../../shared/types';
import { soundFx } from '../../utils/sound';

interface TriviaGameProps {
  room: RoomFullState;
  playerId: string;
  isHost: boolean;
  send: (payload: Record<string, unknown>) => boolean;
}

export const TriviaGame: React.FC<TriviaGameProps> = ({ room, playerId, isHost, send }) => {
  const trivia = room.trivia;
  const myAnswer = trivia.answers[playerId];

  useEffect(() => {
    if (trivia.phase === 'QUESTION' && trivia.timeLeft <= 5 && trivia.timeLeft > 0) {
      soundFx.tick();
    }
  }, [trivia.phase, trivia.timeLeft]);

  const getMemberName = (pid: string) =>
    room.members.find((m) => m.id === pid)?.name || 'لاعب';

  const sortedScores = Object.entries(trivia.scores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-[#141824] dark:text-white">
            سباق القنبلة والمعلومات
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {trivia.phase === 'LOBBY'
              ? '8 أسئلة سريعة · الإجابة الأسرع تمنح نقاطاً أعلى'
              : `الجولة ${trivia.round} من ${trivia.maxRounds} · ${trivia.category}`}
          </p>
        </div>
        {trivia.phase === 'QUESTION' && (
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono-num text-sm font-bold ${
              trivia.timeLeft <= 5
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300'
                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{trivia.timeLeft} ث</span>
          </div>
        )}
      </div>

      {trivia.phase === 'LOBBY' && (
        <div className="py-8 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Zap className="w-7 h-7" />
          </div>
          <div className="max-w-md space-y-1">
            <h4 className="text-base font-bold text-[#141824] dark:text-white">
              تحدي سرعة البديهة
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              أجب عن الأسئلة قبل انفجار المؤقت! يمكنك اللعب منفرداً لتحقيق رقم قياسي أو التنافس مع
              الجميع في الغرفة.
            </p>
          </div>
          {isHost ? (
            <button
              type="button"
              onClick={() => {
                soundFx.tap();
                send({ type: 'trivia:start' });
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>ابدأ المسابقة</span>
            </button>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              بانتظار المضيف لبدء المسابقة...
            </p>
          )}
        </div>
      )}

      {(trivia.phase === 'QUESTION' || trivia.phase === 'REVEAL') && (
        <div className="space-y-5">
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                trivia.timeLeft <= 5 ? 'bg-rose-500' : 'bg-amber-500'
              }`}
              style={{ width: `${(trivia.timeLeft / 15) * 100}%` }}
            />
          </div>

          <h4 className="text-xl sm:text-2xl font-extrabold text-[#141824] dark:text-white text-center py-2 leading-snug">
            {trivia.question}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {trivia.options.map((option, idx) => {
              const isSelected = myAnswer?.optionIndex === idx;
              const isCorrectOption =
                trivia.phase === 'REVEAL' && trivia.correctIndex === idx;
              const isWrongSelected =
                trivia.phase === 'REVEAL' && isSelected && trivia.correctIndex !== idx;

              let btnStyle =
                'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-950/40 text-[#141824] dark:text-white';
              if (isSelected && trivia.phase === 'QUESTION') {
                btnStyle =
                  'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200';
              } else if (isCorrectOption) {
                btnStyle =
                  'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200';
              } else if (isWrongSelected) {
                btnStyle =
                  'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={trivia.phase !== 'QUESTION' || Boolean(myAnswer)}
                  onClick={() => {
                    soundFx.tap();
                    send({ type: 'trivia:answer', optionIndex: idx });
                  }}
                  className={`p-4 rounded-xl border text-right font-semibold text-sm flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:cursor-default ${btnStyle}`}
                >
                  <span>{option}</span>
                  {isCorrectOption && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                  {isWrongSelected && <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
                </button>
              );
            })}
          </div>

          {trivia.phase === 'REVEAL' && myAnswer && (
            <p className="text-center text-sm font-bold">
              {myAnswer.isCorrect ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  إجابة صحيحة! (+{myAnswer.points} نقطة)
                </span>
              ) : (
                <span className="text-rose-600 dark:text-rose-400">حظاً أوفر في السؤال القادم</span>
              )}
            </p>
          )}
        </div>
      )}

      {trivia.phase === 'FINISHED' && (
        <div className="py-5 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
            <Award className="w-7 h-7" />
          </div>
          <h4 className="text-2xl font-extrabold text-[#141824] dark:text-white">نتائج المسابقة</h4>

          <div className="max-w-md mx-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {sortedScores.length === 0 ? (
              <p className="py-4 text-slate-500 dark:text-slate-400">
                لم يسجل أحد نقاطاً في هذه الجولة
              </p>
            ) : (
              sortedScores.map(([pid, pts], i) => (
                <div key={pid} className="px-4 py-3 flex items-center justify-between">
                  <span className="font-bold text-[#141824] dark:text-white">
                    {i + 1}. {getMemberName(pid)}
                  </span>
                  <span className="font-mono-num font-bold text-amber-700 dark:text-amber-400">
                    {pts} نقطة
                  </span>
                </div>
              ))
            )}
          </div>

          {isHost && (
            <button
              type="button"
              onClick={() => {
                soundFx.tap();
                send({ type: 'trivia:start' });
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>مسابقة جديدة</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
