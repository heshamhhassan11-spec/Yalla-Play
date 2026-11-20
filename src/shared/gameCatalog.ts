import type {
  BankTile,
  CoinPackage,
  GameType,
  GiftItem,
  RoomBackgroundTheme,
  RoomLevelSpec,
  RoomTier,
} from './types';

export const BASIC_ROOM_PRICE_COINS = 2000;
export const FREE_ROOM_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

export const FREE_ROOM_GAMES: GameType[] = ['ludo', 'snakes'];
export const BASIC_ROOM_GAMES: GameType[] = [
  'ludo',
  'snakes',
  'bank',
  'jackaroo',
  'draw',
  'racing',
];

export const ROOM_LEVELS: RoomLevelSpec[] = [
  { level: 1, minXp: 0, maxXp: 1999, maxMods: 4, maxCoHosts: 1, maxMics: 10, backgroundsCount: 3 },
  { level: 2, minXp: 2000, maxXp: 3499, maxMods: 5, maxCoHosts: 1, maxMics: 11, backgroundsCount: 3 },
  { level: 3, minXp: 3500, maxXp: 5999, maxMods: 6, maxCoHosts: 1, maxMics: 12, backgroundsCount: 4 },
  { level: 4, minXp: 6000, maxXp: 9999, maxMods: 7, maxCoHosts: 1, maxMics: 12, backgroundsCount: 6 },
  { level: 5, minXp: 10000, maxXp: 19999, maxMods: 9, maxCoHosts: 1, maxMics: 14, backgroundsCount: 6 },
  { level: 6, minXp: 20000, maxXp: 39999, maxMods: 10, maxCoHosts: 2, maxMics: 14, backgroundsCount: 7 },
  { level: 7, minXp: 40000, maxXp: 99999, maxMods: 12, maxCoHosts: 2, maxMics: 14, backgroundsCount: 8 },
  { level: 8, minXp: 100000, maxXp: null, maxMods: 15, maxCoHosts: 3, maxMics: 14, backgroundsCount: 11 },
];

export function getLevelForXp(xp: number): RoomLevelSpec {
  for (let i = ROOM_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= ROOM_LEVELS[i].minXp) return ROOM_LEVELS[i];
  }
  return ROOM_LEVELS[0];
}

export function getRoomCapabilities(tier: RoomTier, xp: number) {
  if (tier === 'free') {
    return {
      level: 0,
      maxMics: 10,
      maxMods: 2,
      maxCoHosts: 1,
      backgroundsCount: 1,
      hasLevels: false,
      allowedGames: FREE_ROOM_GAMES,
    };
  }
  const spec = getLevelForXp(xp);
  return {
    level: spec.level,
    maxMics: spec.maxMics,
    maxMods: spec.maxMods,
    maxCoHosts: spec.maxCoHosts,
    backgroundsCount: spec.backgroundsCount,
    hasLevels: true,
    allowedGames: BASIC_ROOM_GAMES,
  };
}

export const ROOM_BACKGROUNDS: RoomBackgroundTheme[] = [
  { index: 0, nameAr: 'سماء صافية', unlockLevel: 1, surfaceClass: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800', headerTextClass: 'text-[#141824] dark:text-slate-100' },
  { index: 1, nameAr: 'نسيم البحر', unlockLevel: 1, surfaceClass: 'bg-gradient-to-br from-sky-100 via-cyan-50 to-blue-100 dark:from-sky-950 dark:via-slate-900 dark:to-cyan-950 border-sky-300 dark:border-sky-700', headerTextClass: 'text-sky-950 dark:text-sky-100' },
  { index: 2, nameAr: 'واحة الزمرد', unlockLevel: 1, surfaceClass: 'bg-gradient-to-br from-emerald-100 via-teal-50 to-green-100 dark:from-emerald-950 dark:via-slate-900 dark:to-teal-950 border-emerald-300 dark:border-emerald-700', headerTextClass: 'text-emerald-950 dark:text-emerald-100' },
  { index: 3, nameAr: 'شفق الغروب', unlockLevel: 3, surfaceClass: 'bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100 dark:from-amber-950 dark:via-slate-900 dark:to-rose-950 border-amber-300 dark:border-amber-700', headerTextClass: 'text-amber-950 dark:text-amber-100' },
  { index: 4, nameAr: 'ليلة قمرية', unlockLevel: 4, surfaceClass: 'bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 border-slate-700 text-white', headerTextClass: 'text-white' },
  { index: 5, nameAr: 'رمال الصحراء', unlockLevel: 4, surfaceClass: 'bg-gradient-to-br from-yellow-100 via-amber-50 to-orange-100 dark:from-stone-900 dark:via-amber-950 dark:to-yellow-950 border-amber-300 dark:border-amber-700', headerTextClass: 'text-amber-950 dark:text-amber-100' },
  { index: 6, nameAr: 'أفق الكوبالت', unlockLevel: 6, surfaceClass: 'bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-900 border-blue-800 text-white', headerTextClass: 'text-white' },
  { index: 7, nameAr: 'قصر الياقوت', unlockLevel: 7, surfaceClass: 'bg-gradient-to-br from-rose-950 via-slate-900 to-amber-950 border-rose-800 text-white', headerTextClass: 'text-white' },
  { index: 8, nameAr: 'الشفق القطبي', unlockLevel: 8, surfaceClass: 'bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-900 border-emerald-800 text-white', headerTextClass: 'text-white' },
  { index: 9, nameAr: 'ذهب الملوك', unlockLevel: 8, surfaceClass: 'bg-gradient-to-br from-amber-950 via-stone-900 to-yellow-950 border-amber-700 text-white', headerTextClass: 'text-amber-100' },
  { index: 10, nameAr: 'المجرة الملكية', unlockLevel: 8, surfaceClass: 'bg-gradient-to-br from-neutral-950 via-zinc-900 to-blue-950 border-zinc-700 text-white', headerTextClass: 'text-white' },
];

export const COIN_STORE_PACKAGES: CoinPackage[] = [
  { id: 'pkg_150', coins: 150, priceEgp: 10 },
  { id: 'pkg_500', coins: 500, priceEgp: 35 },
  { id: 'pkg_1650', coins: 1650, priceEgp: 90, popular: true },
  { id: 'pkg_3700', coins: 3700, priceEgp: 200 },
  { id: 'pkg_6250', coins: 6250, priceEgp: 350 },
  { id: 'pkg_10500', coins: 10500, priceEgp: 500 },
  { id: 'pkg_22000', coins: 22000, priceEgp: 800 },
];

export const RECHARGE_METHODS = {
  vodafone_cash: {
    id: 'vodafone_cash' as const,
    labelAr: 'فودافون كاش',
    accountNumber: '01044581972',
    instructionAr: 'حوّل المبلغ عبر محفظة فودافون كاش إلى الرقم التالي ثم أرسل طلب الشحن',
  },
  instapay: {
    id: 'instapay' as const,
    labelAr: 'إنستا باي',
    accountNumber: '01228823207',
    instructionAr: 'حوّل المبلغ عبر تطبيق InstaPay على الرقم التالي ثم أرسل طلب الشحن',
  },
};

export const ADMIN_EMAILS = ['heshamhhassan12@gmail.com'] as const;

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return (ADMIN_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}

// Exact 51 Voice Room Gifts: 5(10), 8(20), 7(50), 12(100), 10(200), 6(500), 3(1500)
export const GIFT_ITEMS: GiftItem[] = [
  // 5 gifts @ 10 coins
  { id: 'g10_rose', name: 'وردة', emoji: '🌹', cost: 10 },
  { id: 'g10_tea', name: 'شاي', emoji: '🍵', cost: 10 },
  { id: 'g10_heart', name: 'قلب', emoji: '💛', cost: 10 },
  { id: 'g10_clap', name: 'تصفيق', emoji: '👏', cost: 10 },
  { id: 'g10_star', name: 'نجمة', emoji: '⭐', cost: 10 },

  // 8 gifts @ 20 coins
  { id: 'g20_coffee', name: 'قهوة', emoji: '☕', cost: 20 },
  { id: 'g20_cookie', name: 'كوكيز', emoji: '🍪', cost: 20 },
  { id: 'g20_balloon', name: 'بالون', emoji: '🎈', cost: 20 },
  { id: 'g20_blue', name: 'جوهرة', emoji: '💠', cost: 20 },
  { id: 'g20_smile', name: 'تحية', emoji: '😊', cost: 20 },
  { id: 'g20_music', name: 'نغمة', emoji: '🎵', cost: 20 },
  { id: 'g20_cupcake', name: 'كب كيك', emoji: '🧁', cost: 20 },
  { id: 'g20_candy', name: 'حلوى', emoji: '🍭', cost: 20 },

  // 7 gifts @ 50 coins
  { id: 'g50_bouquet', name: 'باقة ورد', emoji: '💐', cost: 50 },
  { id: 'g50_glasses', name: 'نظارة', emoji: '🕶️', cost: 50 },
  { id: 'g50_donut', name: 'دونات', emoji: '🍩', cost: 50 },
  { id: 'g50_mic', name: 'مايك ذهبي', emoji: '🎤', cost: 50 },
  { id: 'g50_box', name: 'صندوق هدية', emoji: '🎁', cost: 50 },
  { id: 'g50_pizza', name: 'بيتزا', emoji: '🍕', cost: 50 },
  { id: 'g50_clover', name: 'حظ سعيد', emoji: '🍀', cost: 50 },

  // 12 gifts @ 100 coins
  { id: 'g100_crown', name: 'تاج', emoji: '👑', cost: 100 },
  { id: 'g100_cake', name: 'تورتة', emoji: '🎂', cost: 100 },
  { id: 'g100_butterfly', name: 'فراشة', emoji: '🦋', cost: 100 },
  { id: 'g100_watch', name: 'ساعة', emoji: '⌚', cost: 100 },
  { id: 'g100_headphones', name: 'سماعة', emoji: '🎧', cost: 100 },
  { id: 'g100_icecream', name: 'آيس كريم', emoji: '🍨', cost: 100 },
  { id: 'g100_choco', name: 'شوكولاتة', emoji: '🍫', cost: 100 },
  { id: 'g100_teddy', name: 'دبدوب', emoji: '🧸', cost: 100 },
  { id: 'g100_fire', name: 'حماس', emoji: '🔥', cost: 100 },
  { id: 'g100_eagle', name: 'صقر', emoji: '🦅', cost: 100 },
  { id: 'g100_ring', name: 'خاتم', emoji: '💍', cost: 100 },
  { id: 'g100_flower', name: 'زهرة ملكية', emoji: '🌺', cost: 100 },

  // 10 gifts @ 200 coins
  { id: 'g200_diamond', name: 'ألماس', emoji: '💎', cost: 200 },
  { id: 'g200_car', name: 'سيارة سباق', emoji: '🏎️', cost: 200 },
  { id: 'g200_coin', name: 'كنز ذهب', emoji: '🪙', cost: 200 },
  { id: 'g200_moon', name: 'هلال ذهبي', emoji: '🌙', cost: 200 },
  { id: 'g200_trophy', name: 'كأس بطل', emoji: '🏆', cost: 200 },
  { id: 'g200_guitar', name: 'جيتار', emoji: '🎸', cost: 200 },
  { id: 'g200_moto', name: 'دراجة نارية', emoji: '🏍️', cost: 200 },
  { id: 'g200_lantern', name: 'فانوس', emoji: '🏮', cost: 200 },
  { id: 'g200_comet', name: 'شهاب', emoji: '🌠', cost: 200 },
  { id: 'g200_party', name: 'احتفال', emoji: '🎉', cost: 200 },

  // 6 gifts @ 500 coins
  { id: 'g500_yacht', name: 'يخت فاخر', emoji: '🛥️', cost: 500 },
  { id: 'g500_rocket', name: 'صاروخ', emoji: '🚀', cost: 500 },
  { id: 'g500_castle', name: 'قصر', emoji: '🏰', cost: 500 },
  { id: 'g500_jet', name: 'طائرة خاصة', emoji: '✈️', cost: 500 },
  { id: 'g500_lion', name: 'أسد ملكي', emoji: '🦁', cost: 500 },
  { id: 'g500_gem', name: 'تاج الياقوت', emoji: '🔱', cost: 500 },

  // 3 gifts @ 1500 coins
  { id: 'g1500_dragon', name: 'تنين أسطوري', emoji: '🐉', cost: 1500 },
  { id: 'g1500_throne', name: 'عرش الملوك', emoji: '🦚', cost: 1500 },
  { id: 'g1500_ufo', name: 'مركبة النجوم', emoji: '🛸', cost: 1500 },
];

/**
 * Calculate random gift cashback / payback based on cost tier:
 * - 100 coins: payback <= 70 coins (10 to 70 coins)
 * - 200 coins: payback <= 160 coins (20 to 160 coins)
 * - 500 coins: payback <= 350 coins (50 to 350 coins)
 * - 1500 coins: payback <= 1000 coins (150 to 1000 coins)
 * - Other gifts (10, 20, 50): 0 payback
 */
export function calculateGiftPayback(cost: number): number {
  if (cost === 100) {
    return Math.floor(Math.random() * (70 - 10 + 1)) + 10;
  }
  if (cost === 200) {
    return Math.floor(Math.random() * (160 - 20 + 1)) + 20;
  }
  if (cost === 500) {
    return Math.floor(Math.random() * (350 - 50 + 1)) + 50;
  }
  if (cost === 1500) {
    return Math.floor(Math.random() * (1000 - 150 + 1)) + 150;
  }
  return 0;
}

export function getMaxGiftPayback(cost: number): number {
  if (cost === 100) return 70;
  if (cost === 200) return 160;
  if (cost === 500) return 350;
  if (cost === 1500) return 1000;
  return 0;
}

export interface GameMeta {
  id: GameType;
  titleAr: string;
  subtitleAr: string;
  playersRange: string;
  durationLabel: string;
  rulesAr: string[];
  accentHex: string;
  basicOnly?: boolean;
}

export const GAME_CATALOG: Record<GameType, GameMeta> = {
  ludo: {
    id: 'ludo',
    titleAr: 'لودو يلا',
    subtitleAr: 'سباق النرد الكلاسيكي وتحدي القطع الأربع',
    playersRange: '2 – 4 لاعبين',
    durationLabel: '8 دقائق',
    rulesAr: [
      'احصل على الرقم 6 لإخراج قطعتك من القاعدة والانطلاق.',
      'تمنحك النجوم أماناً من الإقصاء، والرقم 6 يمنحك رمية إضافية.',
      'أوصل جميع قطعك الأربع إلى قلب اللوحة للفوز باللقب.',
    ],
    accentHex: '#2563EB',
  },
  snakes: {
    id: 'snakes',
    titleAr: 'السلم والثعبان',
    subtitleAr: 'تحدي الـ 100 خانة بين صعود السلالم ومفاجآت الثعابين',
    playersRange: '2 – 4 لاعبين',
    durationLabel: '5 دقائق',
    rulesAr: [
      'ارمِ النرد بالتناوب للتقدم من المربع 1 نحو المربع 100.',
      'عند الوقوف أسفل السلم تصعد فوراً لأعلاه.',
      'احذر من رأس الثعبان الذي يعيدك للخلف.',
    ],
    accentHex: '#16A34A',
  },
  bank: {
    id: 'bank',
    titleAr: 'بنك الحظ',
    subtitleAr: 'شراء المدن العربية وتحصيل الإيجار حتى الإفلاس',
    playersRange: '2 – 4 لاعبين',
    durationLabel: '10 دقائق',
    rulesAr: [
      'يبدأ كل لاعب برصيد 1500 جنيه ويحصل على 200 جنيه عند المرور بالانطلاق.',
      'اشترِ المدن التي تقف عليها لتحصل على الإيجار من المنافسين.',
      'آخر لاعب يتجنب الإفلاس يفوز بالجولة.',
    ],
    accentHex: '#0D9488',
    basicOnly: true,
  },
  jackaroo: {
    id: 'jackaroo',
    titleAr: 'چاكارو',
    subtitleAr: 'لعبة الأحجار والكروت الاستراتيجية الشهيرة',
    playersRange: '2 – 4 لاعبين',
    durationLabel: '10 دقائق',
    rulesAr: [
      'استخدم كروت A أو K لإخراج حجرك من القاعدة إلى المسار.',
      'كرت 4 يرجعك للخلف، وكرت J يبدّل مكان حجرك مع حجر منافس.',
      'أدخل أحجارك الأربعة في بيت الأمان أولاً للفوز.',
    ],
    accentHex: '#B45309',
    basicOnly: true,
  },
  draw: {
    id: 'draw',
    titleAr: 'الرسم والتخمين',
    subtitleAr: 'لوحة رسم فورية وسباق تخمين الكلمات',
    playersRange: '2 – 6 لاعبين',
    durationLabel: '3 دقائق',
    rulesAr: [
      'يختار الرسام كلمة من 3 خيارات ويرسمها أمام الجميع.',
      'اكتب تخمينك في الدردشة بأسرع وقت للحصول على أعلى النقاط.',
      'يدعم الرسم الحر الفوري للتدريب حتى عند اللعب منفرداً.',
    ],
    accentHex: '#EA580C',
    basicOnly: true,
  },
  racing: {
    id: 'racing',
    titleAr: 'سباق السيارات',
    subtitleAr: 'سباق حلبة مباشر بسرعة التيربو نحو خط النهاية',
    playersRange: '2 – 6 لاعبين',
    durationLabel: 'دقيقتان',
    rulesAr: [
      'تتنافس السيارات في حلبة مباشرة بعد العد التنازلي.',
      'اضغط زر التسارع والتيربو بانتظام لرفع سرعة سيارتك.',
      'أول من يعبر خط النهاية 100% يفوز بالسباق.',
    ],
    accentHex: '#DC2626',
    basicOnly: true,
  },
  spy: {
    id: 'spy',
    titleAr: 'مين الجاسوس؟',
    subtitleAr: 'لعبة الذكاء والشك والتصويت الجماعي',
    playersRange: '3 – 6 لاعبين',
    durationLabel: '5 دقائق',
    rulesAr: [
      'يستلم كل لاعب كلمة سرية متطابقة ما عدا الجاسوس يستلم كلمة قريبة.',
      'يكتب كل لاعب تلميحاً ذكياً دون كشف الكلمة مباشرة.',
      'يصوّت الجميع لطرد المشتبه به.',
    ],
    accentHex: '#059669',
  },
  trivia: {
    id: 'trivia',
    titleAr: 'سباق القنبلة',
    subtitleAr: 'أسئلة سريعة وتحدي سرعة البديهة',
    playersRange: '1 – 6 لاعبين',
    durationLabel: '4 دقائق',
    rulesAr: [
      'تظهر الأسئلة مع عداد تنازلي سريع مدته 15 ثانية لكل جولة.',
      'الإجابات الأسرع تمنحك نقاطاً مضاعفة.',
      'يتصدر الترتيب اللاعب صاحب أعلى مجموع نقاط بعد 8 جولات.',
    ],
    accentHex: '#D97706',
  },
};

export const SNAKES_LADDERS_MAP: Record<number, number> = {
  // Ladders (up)
  4: 25,
  13: 46,
  33: 49,
  42: 63,
  50: 69,
  62: 81,
  74: 92,
  // Snakes (down)
  27: 5,
  40: 3,
  43: 18,
  54: 31,
  66: 45,
  76: 58,
  89: 53,
  99: 41,
};

export const BANK_BOARD_TILES: BankTile[] = [
  { index: 0, name: 'انطلاق', kind: 'start' },
  { index: 1, name: 'الإسكندرية', kind: 'city', price: 120, rent: 40, buildCost: 80, color: '#0EA5E9' },
  { index: 2, name: 'صندوق حظ', kind: 'chest' },
  { index: 3, name: 'الغردقة', kind: 'city', price: 150, rent: 55, buildCost: 90, color: '#0EA5E9' },
  { index: 4, name: 'مطار القاهرة', kind: 'station', price: 200, rent: 75, color: '#475569' },
  { index: 5, name: 'ضريبة دخل', kind: 'tax' },
  { index: 6, name: 'السجن', kind: 'jail' },
  { index: 7, name: 'الجيزة', kind: 'city', price: 180, rent: 65, buildCost: 100, color: '#10B981' },
  { index: 8, name: 'بطاقة فرصة', kind: 'chance' },
  { index: 9, name: 'القاهرة', kind: 'city', price: 220, rent: 85, buildCost: 110, color: '#10B981' },
  { index: 10, name: 'عمّان', kind: 'city', price: 240, rent: 95, buildCost: 120, color: '#F59E0B' },
  { index: 11, name: 'بيروت', kind: 'city', price: 260, rent: 105, buildCost: 130, color: '#F59E0B' },
  { index: 12, name: 'ساحة السلام', kind: 'rest' },
  { index: 13, name: 'مراكش', kind: 'city', price: 280, rent: 115, buildCost: 140, color: '#EC4899' },
  { index: 14, name: 'صندوق حظ', kind: 'chest' },
  { index: 15, name: 'الدار البيضاء', kind: 'city', price: 300, rent: 125, buildCost: 150, color: '#EC4899' },
  { index: 16, name: 'شركة الاتصالات', kind: 'station', price: 240, rent: 90, color: '#475569' },
  { index: 17, name: 'تونس', kind: 'city', price: 320, rent: 135, buildCost: 160, color: '#EC4899' },
  { index: 18, name: 'ادخل السجن!', kind: 'goto_jail' },
  { index: 19, name: 'الكويت', kind: 'city', price: 350, rent: 150, buildCost: 170, color: '#E11D48' },
  { index: 20, name: 'بطاقة فرصة', kind: 'chance' },
  { index: 21, name: 'الدوحة', kind: 'city', price: 380, rent: 165, buildCost: 180, color: '#E11D48' },
  { index: 22, name: 'الرياض', kind: 'city', price: 420, rent: 185, buildCost: 200, color: '#7C3AED' },
  { index: 23, name: 'دبي', kind: 'city', price: 460, rent: 210, buildCost: 220, color: '#7C3AED' },
];

export const QUICK_REACTIONS = ['😂', '🔥', '👏', '❤️', '🤔', '🎯'];

export interface SpyWordPair {
  category: string;
  civilian: string;
  spy: string;
}

export const SPY_WORD_PAIRS: SpyWordPair[] = [
  { category: 'مشروبات', civilian: 'قهوة تركي', spy: 'نسكافيه' },
  { category: 'طعام', civilian: 'بيتزا', spy: 'فطيرة شرقي' },
  { category: 'أماكن', civilian: 'مطار', spy: 'محطة قطار' },
  { category: 'رياضة', civilian: 'كرة قدم', spy: 'كرة يد' },
  { category: 'حيوانات', civilian: 'أسد', spy: 'نمر' },
  { category: 'تقنية', civilian: 'لابتوب', spy: 'تابلت' },
  { category: 'أكلات عربية', civilian: 'كشري', spy: 'مكرونة بشاميل' },
  { category: 'فواكه', civilian: 'بطيخ', spy: 'شمام' },
];

export const DRAW_WORDS: string[] = [
  'تفاحة',
  'صاروخ',
  'شمس',
  'دراجة',
  'قلعة',
  'فنجان قهوة',
  'ساعة يد',
  'نخلة',
  'طائرة',
  'سمكة',
  'جيتار',
  'مظلة',
  'تاج',
  'كاميرا',
  'سفينة',
  'منزل',
  'مفتاح',
  'هلال',
  'كرة قدم',
  'فراشة',
  'بركان',
  'روبوت',
];

export interface TriviaQuestion {
  category: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    category: 'جغرافيا',
    question: 'ما هي أكبر دولة عربية من حيث المساحة؟',
    options: ['السعودية', 'الجزائر', 'مصر', 'السودان'],
    correctIndex: 1,
  },
  {
    category: 'علوم',
    question: 'أي كوكب يُلقب بالكوكب الأحمر؟',
    options: ['الزهرة', 'المشتري', 'المريخ', 'عطارد'],
    correctIndex: 2,
  },
  {
    category: 'ثقافة عامة',
    question: 'كم عدد ألوان قوس قزح الأساسية؟',
    options: ['5 ألوان', '6 ألوان', '7 ألوان', '8 ألوان'],
    correctIndex: 2,
  },
  {
    category: 'رياضة',
    question: 'كم عدد لاعبي فريق كرة اليد داخل الملعب؟',
    options: ['7 لاعبين', '6 لاعبين', '9 لاعبين', '5 لاعبين'],
    correctIndex: 0,
  },
  {
    category: 'تاريخ',
    question: 'في أي مدينة توجد مكتبة الإسكندرية الشهيرة؟',
    options: ['القاهرة', 'الإسكندرية', 'دمشق', 'بغداد'],
    correctIndex: 1,
  },
  {
    category: 'حيوانات',
    question: 'ما هو أسرع حيوان بري في العالم؟',
    options: ['الفهد', 'الغزال', 'الحصان', 'الذئب'],
    correctIndex: 0,
  },
  {
    category: 'لغات',
    question: 'كم عدد حروف اللغة العربية؟',
    options: ['26 حرفاً', '28 حرفاً', '29 حرفاً', '30 حرفاً'],
    correctIndex: 1,
  },
  {
    category: 'جغرافيا',
    question: 'ما هو أطول نهر في العالم؟',
    options: ['الأمازون', 'النيل', 'الفرات', 'المسيسيبي'],
    correctIndex: 1,
  },
];
