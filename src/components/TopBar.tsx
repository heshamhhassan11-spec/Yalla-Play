import React from 'react';
import { Maximize2, Plus } from 'lucide-react';

export type AppTab = 'rooms' | 'games' | 'friends' | 'store' | 'support' | 'profile';

interface TopBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenCreateRoom: () => void;
  inRoom: boolean;
  isRoomMinimized?: boolean;
  onMinimizeRoom?: () => void;
  onRestoreRoom?: () => void;
  onLeaveRoom: () => void;
  supportBadgeCount?: number;
  friendsBadgeCount?: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenCreateRoom,
  inRoom,
  isRoomMinimized = false,
  onMinimizeRoom,
  onRestoreRoom,
  onLeaveRoom,
  supportBadgeCount = 0,
  friendsBadgeCount = 0,
}) => {
  const handleNav = (tab: AppTab) => {
    if (inRoom && !isRoomMinimized) {
      if (onMinimizeRoom) {
        onMinimizeRoom();
      } else {
        onLeaveRoom();
      }
    }
    onSelectTab(tab);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/80 dark:border-slate-800 w-full">
      <div className="max-w-[1360px] mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav('rooms')}
          className="text-xl font-extrabold tracking-tight text-[#141824] dark:text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 rounded-md"
        >
          يلا بلاي
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-4 lg:gap-6 text-sm font-semibold">
          <button
            type="button"
            onClick={() => handleNav('rooms')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              (!inRoom || isRoomMinimized) && activeTab === 'rooms'
                ? 'text-blue-600 dark:text-blue-400 underline underline-offset-8 decoration-2'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
            }`}
          >
            الغرف الصوتية
          </button>
          <button
            type="button"
            onClick={() => handleNav('games')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              (!inRoom || isRoomMinimized) && activeTab === 'games'
                ? 'text-blue-600 dark:text-blue-400 underline underline-offset-8 decoration-2'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
            }`}
          >
            الألعاب
          </button>
          <button
            type="button"
            onClick={() => handleNav('friends')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
              (!inRoom || isRoomMinimized) && activeTab === 'friends'
                ? 'text-blue-600 dark:text-blue-400 underline underline-offset-8 decoration-2'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
            }`}
          >
            <span>الأصدقاء</span>
            {friendsBadgeCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] leading-none font-extrabold rounded bg-emerald-600 text-white font-mono-num">
                {friendsBadgeCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleNav('store')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              (!inRoom || isRoomMinimized) && activeTab === 'store'
                ? 'text-blue-600 dark:text-blue-400 underline underline-offset-8 decoration-2'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
            }`}
          >
            المتجر
          </button>
          <button
            type="button"
            onClick={() => handleNav('support')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
              (!inRoom || isRoomMinimized) && activeTab === 'support'
                ? 'text-blue-600 dark:text-blue-400 underline underline-offset-8 decoration-2'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
            }`}
          >
            <span>الدعم والشكاوى</span>
            {supportBadgeCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] leading-none font-extrabold rounded bg-emerald-600 text-white font-mono-num">
                {supportBadgeCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleNav('profile')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              (!inRoom || isRoomMinimized) && activeTab === 'profile'
                ? 'text-blue-600 dark:text-blue-400 underline underline-offset-8 decoration-2'
                : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
            }`}
          >
            ملفي الشخصي
          </button>
        </nav>

        {/* Zone 3: Primary CTA / Restore Room CTA */}
        <div className="shrink-0 flex items-center gap-2">
          {inRoom && isRoomMinimized && onRestoreRoom && (
            <button
              type="button"
              onClick={onRestoreRoom}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>العودة للغرفة</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCreateRoom}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء غرفة</span>
          </button>
        </div>
      </div>
    </header>
  );
};
