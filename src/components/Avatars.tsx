import React from 'react';
import type { AvatarId } from '../shared/types';

export interface AvatarOption {
  id: AvatarId;
  label: string;
  bg: string;
  accent: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'falcon', label: 'الصقر', bg: '#DBEAFE', accent: '#1D4ED8' },
  { id: 'panda', label: 'باندا', bg: '#DCFCE7', accent: '#15803D' },
  { id: 'fox', label: 'ثعلب', bg: '#FFEDD5', accent: '#C2410C' },
  { id: 'cat', label: 'قط ذكي', bg: '#FCE7F3', accent: '#BE185D' },
  { id: 'astronaut', label: 'رائد فضاء', bg: '#E0E7FF', accent: '#4338CA' },
  { id: 'knight', label: 'فارس', bg: '#FEF3C7', accent: '#B45309' },
  { id: 'chef', label: 'طباخ', bg: '#FEE2E2', accent: '#B91C1C' },
  { id: 'wizard', label: 'ساحر', bg: '#F3E8FF', accent: '#7E22CE' },
];

export const AvatarBadge: React.FC<{
  avatarId: AvatarId | null;
  size?: number;
  className?: string;
}> = ({ avatarId, size = 48, className = '' }) => {
  const opt = AVATAR_OPTIONS.find((a) => a.id === avatarId) || AVATAR_OPTIONS[0];

  return (
    <div
      style={{ width: size, height: size, backgroundColor: opt.bg }}
      className={`rounded-full flex items-center justify-center shrink-0 select-none overflow-hidden ${className}`}
    >
      <svg viewBox="0 0 64 64" className="w-[82%] h-[82%]" aria-hidden="true">
        {opt.id === 'falcon' && (
          <g>
            <circle cx="32" cy="34" r="20" fill="#1E3A8A" />
            <path d="M18 28 Q32 14 46 28 L42 46 Q32 52 22 46 Z" fill="#F8FAFC" />
            <circle cx="25" cy="30" r="3" fill="#0F172A" />
            <circle cx="39" cy="30" r="3" fill="#0F172A" />
            <path d="M29 34 L35 34 L32 42 Z" fill="#F59E0B" />
          </g>
        )}
        {opt.id === 'panda' && (
          <g>
            <circle cx="17" cy="20" r="7" fill="#1E293B" />
            <circle cx="47" cy="20" r="7" fill="#1E293B" />
            <circle cx="32" cy="35" r="20" fill="#FFFFFF" />
            <ellipse cx="24" cy="32" rx="5.5" ry="6.5" transform="rotate(-15 24 32)" fill="#1E293B" />
            <ellipse cx="40" cy="32" rx="5.5" ry="6.5" transform="rotate(15 40 32)" fill="#1E293B" />
            <circle cx="24" cy="31" r="2" fill="#FFFFFF" />
            <circle cx="40" cy="31" r="2" fill="#FFFFFF" />
            <ellipse cx="32" cy="39" rx="3.5" ry="2.2" fill="#1E293B" />
            <path d="M27 44 Q32 47 37 44" stroke="#1E293B" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </g>
        )}
        {opt.id === 'fox' && (
          <g>
            <path d="M14 14 L26 24 L16 34 Z" fill="#EA580C" />
            <path d="M50 14 L38 24 L48 34 Z" fill="#EA580C" />
            <circle cx="32" cy="36" r="19" fill="#F97316" />
            <path d="M15 38 Q32 54 49 38 Q32 44 15 38 Z" fill="#FFF7ED" />
            <circle cx="25" cy="32" r="2.8" fill="#0F172A" />
            <circle cx="39" cy="32" r="2.8" fill="#0F172A" />
            <circle cx="32" cy="40" r="3" fill="#0F172A" />
          </g>
        )}
        {opt.id === 'cat' && (
          <g>
            <path d="M16 14 L27 25 L14 32 Z" fill="#EC4899" />
            <path d="M48 14 L37 25 L50 32 Z" fill="#EC4899" />
            <circle cx="32" cy="36" r="18" fill="#F472B6" />
            <circle cx="25" cy="34" r="2.8" fill="#1E293B" />
            <circle cx="39" cy="34" r="2.8" fill="#1E293B" />
            <path d="M30 39 L34 39 L32 42 Z" fill="#831843" />
            <path d="M16 37 L23 38 M16 41 L23 41 M48 37 L41 38 M48 41 L41 41" stroke="#FFF1F2" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        )}
        {opt.id === 'astronaut' && (
          <g>
            <circle cx="32" cy="34" r="21" fill="#F8FAFC" stroke="#4338CA" strokeWidth="3" />
            <rect x="18" y="23" width="28" height="19" rx="9" fill="#1E1B4B" />
            <circle cx="26" cy="32" r="2.5" fill="#38BDF8" />
            <circle cx="38" cy="32" r="2.5" fill="#38BDF8" />
            <path d="M22 27 L27 27" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}
        {opt.id === 'knight' && (
          <g>
            <path d="M27 10 L37 10 L35 18 L29 18 Z" fill="#DC2626" />
            <rect x="17" y="18" width="30" height="32" rx="12" fill="#475569" />
            <rect x="21" y="27" width="22" height="8" rx="3" fill="#0F172A" />
            <circle cx="27" cy="31" r="2" fill="#FBBF24" />
            <circle cx="37" cy="31" r="2" fill="#FBBF24" />
          </g>
        )}
        {opt.id === 'chef' && (
          <g>
            <path d="M18 24 C14 14 26 10 32 14 C38 10 50 14 46 24 Z" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />
            <circle cx="32" cy="38" r="16" fill="#FDBA74" />
            <circle cx="26" cy="36" r="2.5" fill="#1E293B" />
            <circle cx="38" cy="36" r="2.5" fill="#1E293B" />
            <path d="M24 44 Q32 41 40 44" stroke="#7C2D12" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        )}
        {opt.id === 'wizard' && (
          <g>
            <path d="M16 28 L32 8 L48 28 Z" fill="#6D28D9" />
            <ellipse cx="32" cy="28" rx="22" ry="4" fill="#5B21B6" />
            <circle cx="32" cy="40" r="14" fill="#FED7AA" />
            <path d="M22 44 L32 56 L42 44 Z" fill="#F8FAFC" />
            <circle cx="27" cy="38" r="2.3" fill="#1E293B" />
            <circle cx="37" cy="38" r="2.3" fill="#1E293B" />
          </g>
        )}
      </svg>
    </div>
  );
};
