export interface LevelTier {
  minLevel: number;
  maxLevel: number | null;
  titleAr: string;
  accentColor: string;
  bgTint: string;
}

export const LEVEL_TIERS: LevelTier[] = [
  { minLevel: 1, maxLevel: 3, titleAr: 'مبتدئ السهرة', accentColor: '#475569', bgTint: '#F1F5F9' },
  { minLevel: 4, maxLevel: 7, titleAr: 'منافس ذكي', accentColor: '#059669', bgTint: '#ECFDF5' },
  { minLevel: 8, maxLevel: 12, titleAr: 'لاعب محترف', accentColor: '#2563EB', bgTint: '#EFF6FF' },
  { minLevel: 13, maxLevel: 19, titleAr: 'نجم الغرف', accentColor: '#D97706', bgTint: '#FFFBEB' },
  { minLevel: 20, maxLevel: null, titleAr: 'أسطورة يلا بلاي', accentColor: '#E11D48', bgTint: '#FFF1F2' },
];

export interface LevelProgress {
  level: number;
  titleAr: string;
  accentColor: string;
  bgTint: string;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
}

export function xpNeededForLevel(level: number): number {
  return 60 + level * 40;
}

export function getTierForLevel(level: number): LevelTier {
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (level >= LEVEL_TIERS[i].minLevel) {
      return LEVEL_TIERS[i];
    }
  }
  return LEVEL_TIERS[0];
}

export function getLevelProgress(totalXp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(totalXp || 0));
  let level = 1;
  let remaining = safeXp;

  while (remaining >= xpNeededForLevel(level)) {
    remaining -= xpNeededForLevel(level);
    level += 1;
  }

  const nextLevelXp = xpNeededForLevel(level);
  const progressPercent = Math.min(100, Math.round((remaining / nextLevelXp) * 100));
  const tier = getTierForLevel(level);

  return {
    level,
    titleAr: tier.titleAr,
    accentColor: tier.accentColor,
    bgTint: tier.bgTint,
    totalXp: safeXp,
    currentLevelXp: remaining,
    nextLevelXp,
    progressPercent,
  };
}
