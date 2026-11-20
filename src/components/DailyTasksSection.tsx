import React, { useState } from 'react';
import { Award, CheckCircle2, Coins, Flame, Gamepad2, Mic, Timer } from 'lucide-react';
import type { PlayerProfile } from '../shared/types';
import { soundFx } from '../utils/sound';

export interface DailyTaskDefinition {
  id: string;
  category: 'play' | 'voice';
  title: string;
  targetMin: number;
  reward: number;
}

export const DAILY_TASK_DEFINITIONS: DailyTaskDefinition[] = [
  {
    id: 'task_play_10',
    category: 'play',
    title: 'اللعب لمدة 10 دقائق في أي لعبة',
    targetMin: 10,
    reward: 20,
  },
  {
    id: 'task_play_25',
    category: 'play',
    title: 'اللعب لمدة 25 دقيقة في أي لعبة',
    targetMin: 25,
    reward: 60,
  },
  {
    id: 'task_voice_30',
    category: 'voice',
    title: 'الجلوس في الغرفة الصوتية لمدة 30 دقيقة',
    targetMin: 30,
    reward: 50,
  },
  {
    id: 'task_voice_60',
    category: 'voice',
    title: 'الجلوس في الغرفة الصوتية لمدة 60 دقيقة',
    targetMin: 60,
    reward: 120,
  },
];

interface DailyTasksSectionProps {
  profile: PlayerProfile;
  playTimeMin: number;
  voiceTimeMin: number;
  claimedTasks: Record<string, boolean>;
  onClaimTask: (taskId: string, rewardCoins: number) => Promise<void>;
  compactHeader?: boolean;
}

export const DailyTasksSection: React.FC<DailyTasksSectionProps> = ({
  profile,
  playTimeMin,
  voiceTimeMin,
  claimedTasks,
  onClaimTask,
  compactHeader = false,
}) => {
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const claimableCount = DAILY_TASK_DEFINITIONS.filter((t) => {
    const current = t.category === 'play' ? playTimeMin : voiceTimeMin;
    return current >= t.targetMin && !claimedTasks[t.id];
  }).length;

  const handleClaim = async (task: DailyTaskDefinition) => {
    if (claimingId || claimedTasks[task.id]) return;
    setClaimingId(task.id);
    setClaimNotice(null);
    setClaimError(null);
    try {
      await onClaimTask(task.id, task.reward);
      soundFx.win();
      setClaimNotice(`تم استلام مكافأة +${task.reward} عملة وإضافتها إلى رصيدك بنجاح!`);
      setTimeout(() => setClaimNotice(null), 4000);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'تعذر استلام المكافأة، حاول مرة أخرى');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {!compactHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#141824] dark:text-white flex items-center gap-2">
                <span>المهام اليومية ومكافآت العملات</span>
                {claimableCount > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-md bg-emerald-600 text-white font-mono-num">
                    {claimableCount} جاهزة للاستلام
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                أتمم المهام أثناء اللعب أو التواجد في الغرف الصوتية واستلم عملاتك فوراً
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono-num">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>لعب اليوم: {playTimeMin} د</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
              <Mic className="w-3.5 h-3.5" />
              <span>الغرفة اليوم: {voiceTimeMin} د</span>
            </span>
          </div>
        </div>
      )}

      <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
            أتمم المهام اليومية واجمع حتى 250 عملة يومياً مجاناً
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 font-mono-num">
            رصيدك الحالي: {profile.coins.toLocaleString('en-US')} عملة
          </p>
        </div>
        <Coins className="w-7 h-7 text-amber-500 shrink-0" />
      </div>

      {claimNotice && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-extrabold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{claimNotice}</span>
        </div>
      )}

      {claimError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-bold">
          {claimError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DAILY_TASK_DEFINITIONS.map((task) => {
          const currentMin = task.category === 'play' ? playTimeMin : voiceTimeMin;
          const progress = Math.min(100, Math.round((currentMin / task.targetMin) * 100));
          const isCompleted = currentMin >= task.targetMin;
          const isClaimed = Boolean(claimedTasks[task.id]);
          const remainingMin = Math.max(0, task.targetMin - currentMin);
          const isClaimingThis = claimingId === task.id;

          return (
            <div
              key={task.id}
              className={`p-4 rounded-2xl border space-y-3 shadow-2xs transition-colors ${
                isClaimed
                  ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/70'
                  : isCompleted
                    ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700'
                    : 'bg-slate-50/70 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Timer className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <p className="text-xs font-extrabold text-[#141824] dark:text-white leading-snug">
                    {task.title}
                  </p>
                </div>
                <span className="text-xs font-extrabold font-mono-num text-amber-600 dark:text-amber-400 shrink-0 flex items-center gap-1 bg-amber-100/80 dark:bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                  <Coins className="w-3.5 h-3.5" />
                  +{task.reward} عملة
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 font-mono-num font-semibold">
                  <span>
                    التقدم: {Math.min(currentMin, task.targetMin)} / {task.targetMin} دقيقة
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      isClaimed || isCompleted ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono-num">
                  {isClaimed
                    ? 'اكتملت المهمة وتم صرف الجائزة'
                    : isCompleted
                      ? 'جاهزة للاستلام الآن!'
                      : `متبقي ${remainingMin} دقيقة`}
                </span>

                {isClaimed ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تم الاستلام</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!isCompleted || Boolean(claimingId)}
                    onClick={() => handleClaim(task)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition-colors ${
                      isCompleted
                        ? 'text-white bg-amber-600 hover:bg-amber-700 cursor-pointer shadow-xs'
                        : 'text-slate-400 dark:text-slate-500 bg-slate-200/70 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>
                      {isClaimingThis
                        ? 'جاري الاستلام...'
                        : `استلام المكافأة (+${task.reward})`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
