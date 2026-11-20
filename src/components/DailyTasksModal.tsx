import React from 'react';
import { Award, X } from 'lucide-react';
import type { PlayerProfile } from '../shared/types';
import { DailyTasksSection } from './DailyTasksSection';

interface DailyTasksModalProps {
  profile: PlayerProfile;
  playTimeMin: number;
  voiceTimeMin: number;
  claimedTasks: Record<string, boolean>;
  onClaimTask: (taskId: string, rewardCoins: number) => Promise<void>;
  onClose: () => void;
}

export const DailyTasksModal: React.FC<DailyTasksModalProps> = ({
  profile,
  playTimeMin,
  voiceTimeMin,
  claimedTasks,
  onClaimTask,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-5 shadow-xl my-6">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-extrabold text-[#141824] dark:text-white">
              المهام اليومية ومكافآت العملات
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <DailyTasksSection
          profile={profile}
          playTimeMin={playTimeMin}
          voiceTimeMin={voiceTimeMin}
          claimedTasks={claimedTasks}
          onClaimTask={onClaimTask}
          compactHeader
        />

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
