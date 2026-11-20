import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Crown,
  Flag,
  Gamepad2,
  Gift,
  Heart,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Lock,
  LogOut,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Moon,
  Send,
  Settings,
  Share2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Unlock,
  UserX,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  persistBasicRoomAppearance,
  persistBasicRoomGiftXp,
  persistRoomStaffRole,
} from '../firebase';
import { ReportModal } from './ReportModal';
import {
  BASIC_ROOM_GAMES,
  GAME_CATALOG,
  GIFT_ITEMS,
  QUICK_REACTIONS,
  ROOM_BACKGROUNDS,
  ROOM_LEVELS,
  calculateGiftPayback,
  getMaxGiftPayback,
  getRoomCapabilities,
} from '../shared/gameCatalog';
import type {
  GameType,
  GiftItem,
  GiftPriceTier,
  PlayerProfile,
  RoomFullState,
} from '../shared/types';
import { soundFx } from '../utils/sound';
import { AvatarBadge } from './Avatars';
import { BankGame } from './games/BankGame';
import { DrawGame } from './games/DrawGame';
import { JackarooGame } from './games/JackarooGame';
import { LudoGame } from './games/LudoGame';
import { RacingGame } from './games/RacingGame';
import { SnakesGame } from './games/SnakesGame';
import { SpyGame } from './games/SpyGame';
import { TriviaGame } from './games/TriviaGame';

interface RoomArenaProps {
  room: RoomFullState;
  profile: PlayerProfile;
  theme: 'light' | 'dark';
  connected?: boolean;
  onToggleTheme: () => void;
  onSpendCoins: (amount: number, label: string) => Promise<boolean>;
  onGoToStore: () => void;
  send: (payload: Record<string, unknown>) => boolean;
  onLeaveRoom: () => void;
  onMinimizeRoom?: () => void;
  friendsBadgeCount?: number;
  onOpenFriendsModal?: () => void;
}

const GIFT_TIERS: GiftPriceTier[] = [10, 20, 50, 100, 200, 500, 1500];

function formatRemainingTime(expiresAtMs: number, nowTs: number): string {
  if (!expiresAtMs) return 'دائمة (لا تقفل أبداً)';
  const diff = Math.max(0, expiresAtMs - nowTs);
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `متبقي ${hrs} س ${mins} د`;
}

export const RoomArena: React.FC<RoomArenaProps> = ({
  room,
  profile,
  theme,
  connected = true,
  onToggleTheme,
  onSpendCoins,
  onGoToStore,
  send,
  onLeaveRoom,
  onMinimizeRoom,
  friendsBadgeCount = 0,
  onOpenFriendsModal,
}) => {
  const [chatText, setChatText] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [soundMuted, setSoundMuted] = useState(soundFx.muted);
  const [micActive, setMicActive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    text: string;
    tone: 'success' | 'warn';
  } | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTierTab, setGiftTierTab] = useState<GiftPriceTier | 'fav'>(10);
  const [favGiftIds, setFavGiftIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`yallaplay_fav_gifts_${profile.id}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'all' | 'backgrounds' | 'lock' | 'staff' | 'details'>('all');
  const [lockPinInput, setLockPinInput] = useState('');
  const [roomView, setRoomView] = useState<'voice' | 'game'>('voice');
  const [gamePanelOpen, setGamePanelOpen] = useState(false);
  const [inlineGamePickerOpen, setInlineGamePickerOpen] = useState(false);
  const [gameRulesOpen, setGameRulesOpen] = useState(false);
  const [gameFocusMode, setGameFocusMode] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const [reportingUser, setReportingUser] = useState<{ id: string; name: string } | null>(null);
  const [reportingMessage, setReportingMessage] = useState<{ id: string; text: string } | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedSeatIdx, setSelectedSeatIdx] = useState<number | null>(null);
  const [confirmKickTarget, setConfirmKickTarget] = useState<{
    uid: string;
    name: string;
    roleLabel: string;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micRafRef = useRef<number | null>(null);
  const lastSpeakSentRef = useRef<boolean>(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = room.hostId === profile.id;
  const myStaffRole = room.staff[profile.id];
  const isStaff = isOwner || myStaffRole === 'cohost' || myStaffRole === 'moderator';
  const canManageGames = isOwner || myStaffRole === 'cohost';
  const canChangeBackground = isStaff;
  const canControlLock = isStaff;
  const canControlMics = isStaff;
  const canAssignCohost = isOwner;
  const canAssignMod = isOwner || myStaffRole === 'cohost';
  const mySeat = room.seats.find((s) => s.playerId === profile.id);

  const getMemberRole = (uid: string): 'owner' | 'cohost' | 'moderator' | 'guest' => {
    if (room.hostId === uid) return 'owner';
    return room.staff[uid] || 'guest';
  };

  const canKickTarget = (targetUid: string): boolean => {
    if (!targetUid || targetUid === profile.id) return false;
    const targetRole = getMemberRole(targetUid);
    if (targetRole === 'owner') return false;
    if (isOwner) return true;
    if (myStaffRole === 'cohost') return targetRole === 'moderator' || targetRole === 'guest';
    if (myStaffRole === 'moderator') return targetRole === 'guest';
    return false;
  };

  const canMuteTarget = (targetUid: string): boolean => {
    if (!targetUid || targetUid === profile.id) return false;
    const targetRole = getMemberRole(targetUid);
    if (targetRole === 'owner') return false;
    if (isOwner) return true;
    if (myStaffRole === 'cohost') return targetRole === 'moderator' || targetRole === 'guest';
    if (myStaffRole === 'moderator') return targetRole === 'guest';
    return false;
  };

  const caps = getRoomCapabilities(room.tier, room.xp);
  const levelSpec =
    room.tier === 'basic'
      ? ROOM_LEVELS.find((l) => l.level === caps.level) || ROOM_LEVELS[0]
      : null;
  const nextLevelSpec =
    room.tier === 'basic'
      ? ROOM_LEVELS.find((l) => l.level === caps.level + 1) || null
      : null;
  const bgTheme = ROOM_BACKGROUNDS[room.backgroundIndex] || ROOM_BACKGROUNDS[0];
  const isDarkBg =
    bgTheme.index >= 4 && bgTheme.index !== 5 ? true : theme === 'dark';

  const modsCount = Object.values(room.staff).filter((r) => r === 'moderator').length;
  const coHostsCount = Object.values(room.staff).filter((r) => r === 'cohost').length;
  const activeGameMeta = GAME_CATALOG[room.gameType];

  const totalGiftLikes = useMemo(
    () =>
      room.messages.reduce(
        (sum, m) => sum + (m.type === 'gift' ? (m.likedBy?.length || 0) : 0),
        0
      ),
    [room.messages]
  );

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.messages.length]);

  useEffect(() => {
    if (mySeat?.forceMuted && micActive) {
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      setMicActive(false);
      lastSpeakSentRef.current = false;
    }
  }, [mySeat?.forceMuted, micActive]);

  useEffect(() => {
    return () => {
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (settingsFeedbackTimerRef.current) clearTimeout(settingsFeedbackTimerRef.current);
    };
  }, []);

  const showNotice = (msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
  };

  const showSettingsFeedback = (text: string, tone: 'success' | 'warn') => {
    setSettingsFeedback({ text, tone });
    if (settingsFeedbackTimerRef.current) clearTimeout(settingsFeedbackTimerRef.current);
    settingsFeedbackTimerRef.current = setTimeout(() => setSettingsFeedback(null), 4000);
  };

  const toggleFavoriteGift = (giftId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    soundFx.tap();
    setFavGiftIds((prev) => {
      const next = prev.includes(giftId)
        ? prev.filter((id) => id !== giftId)
        : [...prev, giftId];
      try {
        localStorage.setItem(`yallaplay_fav_gifts_${profile.id}`, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  const toggleMic = async () => {
    if (!mySeat) return;
    if (!micActive && mySeat.forceMuted) {
      showNotice('المايك الخاص بك مكتوم من قِبل إدارة الغرفة حتى يتم إلغاء الكتم');
      return;
    }
    if (micActive) {
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      setMicActive(false);
      lastSpeakSentRef.current = false;
      send({ type: 'seat:mic', isMuted: true, isSpeaking: false });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicActive(true);
      send({ type: 'seat:mic', isMuted: false, isSpeaking: false });

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      let lastCheck = 0;
      const loop = (ts: number) => {
        if (!micStreamRef.current) return;
        if (ts - lastCheck > 160) {
          lastCheck = ts;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const speaking = sum / data.length > 18;
          if (speaking !== lastSpeakSentRef.current) {
            lastSpeakSentRef.current = speaking;
            send({ type: 'seat:mic', isMuted: false, isSpeaking: speaking });
          }
        }
        micRafRef.current = requestAnimationFrame(loop);
      };
      micRafRef.current = requestAnimationFrame(loop);
    } catch {
      showNotice('تعذر الوصول إلى الميكروفون · تأكد من السماح للإذن في المتصفح');
    }
  };

  const handleSendGift = async (gift: GiftItem) => {
    if (profile.coins < gift.cost) {
      showNotice('رصيد العملات غير كافٍ · يمكنك شحن العملات من المتجر');
      return;
    }
    const payback = calculateGiftPayback(gift.cost);
    const netCost = gift.cost - payback;
    const label =
      payback > 0
        ? `هدية ${gift.name} (مردود حظ +${payback} عملة)`
        : `هدية ${gift.name} في غرفة ${room.title}`;
    const ok = await onSpendCoins(netCost, label);
    if (!ok) {
      showNotice('رصيد العملات غير كافٍ');
      return;
    }

    if (payback > 0) {
      soundFx.win();
      showNotice(`🎉 مبروك! حصلت على مردود حظ عشوائي بقيمة +${payback} عملة!`);
    } else {
      soundFx.gift();
    }

    const targetSeat = room.seats.find((s) => s.playerId && s.playerId !== profile.id);
    send({
      type: 'gift:send',
      giftId: gift.id,
      recipientName: targetSeat?.playerName || 'الجميع في الغرفة',
      paybackCoins: payback,
    });

    if (
      room.tier === 'basic' &&
      !room.code.startsWith('ID1001') &&
      !room.code.startsWith('ID3003') &&
      !room.code.startsWith('ID4004')
    ) {
      const nextXp = room.xp + Math.floor(gift.cost / 10);
      persistBasicRoomGiftXp(room.code, nextXp).catch(() => {});
    }
  };

  const handleSelectBackground = (index: number) => {
    soundFx.tap();
    const bgItem = ROOM_BACKGROUNDS[index];
    const unlocked =
      room.tier === 'basic' ? index < caps.backgroundsCount : index === 0;
    if (!unlocked) {
      const msg =
        room.tier !== 'basic'
          ? 'تغيير الخلفيات المتعددة متاح في الغرف الأساسية الدائمة فقط'
          : `خلفية "${bgItem?.nameAr || ''}" تُفتح في المستوى ${bgItem?.unlockLevel || 2} للغرفة`;
      showSettingsFeedback(msg, 'warn');
      showNotice(msg);
      return;
    }
    if (!canChangeBackground) {
      const msg = 'تغيير خلفية الغرفة متاح لصاحب الغرفة أو النائب أو المشرفين فقط';
      showSettingsFeedback(msg, 'warn');
      showNotice(msg);
      return;
    }

    const sentNow = send({ type: 'room:set_background', backgroundIndex: index });
    if (
      room.tier === 'basic' &&
      isStaff &&
      !room.code.startsWith('ID1001') &&
      !room.code.startsWith('ID3003') &&
      !room.code.startsWith('ID4004')
    ) {
      persistBasicRoomAppearance(room.code, { backgroundIndex: index }).catch(() => {});
    }
    if (sentNow) {
      const msg = `تم تغيير خلفية الغرفة إلى "${bgItem?.nameAr || ''}" بنجاح`;
      showSettingsFeedback(msg, 'success');
      showNotice(msg);
    } else {
      showSettingsFeedback('جاري إعادة الاتصال وتطبيق الخلفية المختارة...', 'warn');
    }
  };

  const handleSetRoomLock = (nextLocked: boolean, pinValue = '') => {
    soundFx.tap();
    if (room.tier !== 'basic') {
      const msg = 'ميزة قفل كلمة مرور الغرفة متاحة في الغرف الأساسية الدائمة فقط';
      showSettingsFeedback(msg, 'warn');
      showNotice(msg);
      return;
    }
    if (!canControlLock) {
      const msg = 'فتح أو قفل كلمة مرور الغرفة متاح لصاحب الغرفة أو النائب أو المشرفين فقط';
      showSettingsFeedback(msg, 'warn');
      showNotice(msg);
      return;
    }

    const cleanPin = nextLocked ? pinValue.trim().slice(0, 16) : '';
    const sentNow = send({ type: 'room:set_lock', isLocked: nextLocked, lockPin: cleanPin });
    if (
      isStaff &&
      !room.code.startsWith('ID1001') &&
      !room.code.startsWith('ID3003') &&
      !room.code.startsWith('ID4004')
    ) {
      persistBasicRoomAppearance(room.code, { isLocked: nextLocked }).catch(() => {});
    }
    if (!nextLocked) setLockPinInput('');

    if (sentNow) {
      const msg = nextLocked
        ? cleanPin
          ? 'تم تفعيل كلمة مرور الغرفة بنجاح'
          : 'تم قفل الغرفة بنجاح (الدخول للإدارة فقط)'
        : 'تم فتح الغرفة وإلغاء كلمة المرور للجميع';
      showSettingsFeedback(msg, 'success');
      showNotice(msg);
    } else {
      showSettingsFeedback('جاري إعادة الاتصال وتطبيق حالة القفل...', 'warn');
    }
  };

  const handleAssignStaff = (
    targetUid: string,
    targetName: string,
    role: 'moderator' | 'cohost' | null
  ) => {
    soundFx.tap();
    const targetRole = getMemberRole(targetUid);
    if (!canAssignMod) {
      const msg = 'تعيين المشرفين متاح لصاحب الغرفة أو النائب فقط';
      showSettingsFeedback(msg, 'warn');
      showNotice(msg);
      return;
    }
    if ((role === 'cohost' || targetRole === 'cohost') && !canAssignCohost) {
      const msg = 'تعيين أو إلغاء تعيين نائب الغرفة متاح لصاحب الغرفة فقط';
      showSettingsFeedback(msg, 'warn');
      showNotice(msg);
      return;
    }
    send({ type: 'room:set_staff', targetUid, role });
    if (room.tier === 'basic' && canAssignMod) {
      persistRoomStaffRole(room.code, targetUid, targetName, role, profile.id).catch(() => {});
    }
    const feedbackText =
      role === 'moderator'
        ? `تم تعيين ${targetName} مشرفاً في الغرفة`
        : role === 'cohost'
          ? `تم تعيين ${targetName} نائباً لصاحب الغرفة`
          : `تمت إزالة صلاحيات الإدارة من ${targetName}`;
    showSettingsFeedback(feedbackText, 'success');
    showNotice(feedbackText);
  };

  const handleToggleMicsLock = () => {
    soundFx.tap();
    if (!canControlMics) {
      showNotice('فتح أو قفل المايكات متاح لصاحب الغرفة أو النائب أو المشرفين فقط');
      return;
    }
    const nextLocked = !room.micsLocked;
    send({ type: 'room:set_mics_lock', isLocked: nextLocked });
    showNotice(nextLocked ? 'تم قفل مايكات الضيوف في الغرفة' : 'تم فتح المايكات في الغرفة');
  };

  const handleToggleSeatLock = (seatIndex: number, currentlyLocked: boolean) => {
    soundFx.tap();
    if (!canControlMics || seatIndex === 0) return;
    send({ type: 'seat:set_lock', seatIndex, isLocked: !currentlyLocked });
    showNotice(!currentlyLocked ? `تم قفل المايك ${seatIndex + 1}` : `تم فتح المايك ${seatIndex + 1}`);
  };

  const handleMuteMember = (targetUid: string, targetName: string, nextMuted: boolean) => {
    soundFx.tap();
    if (!canMuteTarget(targetUid)) {
      showNotice('لا تملك صلاحية كتم هذا العضو حسب رتبتك');
      return;
    }
    send({ type: 'seat:mute_target', targetUid, isMuted: nextMuted });
    const msg = nextMuted ? `تم كتم مايك ${targetName}` : `تم إلغاء كتم مايك ${targetName}`;
    showSettingsFeedback(msg, 'success');
    showNotice(msg);
  };

  const handleKickMember = (targetUid: string, targetName: string) => {
    soundFx.tap();
    if (!canKickTarget(targetUid)) {
      showNotice('لا تملك صلاحية طرد هذا العضو حسب رتبتك');
      return;
    }
    const targetRole = getMemberRole(targetUid);
    const roleLabel =
      targetRole === 'cohost'
        ? 'نائب الغرفة'
        : targetRole === 'moderator'
          ? 'مشرف'
          : 'ضيف';
    setConfirmKickTarget({ uid: targetUid, name: targetName, roleLabel });
  };

  const confirmExecuteKick = (durationMinutes: 5 | 60 | 1440) => {
    if (!confirmKickTarget) return;
    soundFx.tap();
    send({
      type: 'room:kick',
      targetUid: confirmKickTarget.uid,
      durationMinutes,
    });
    setSelectedSeatIdx(null);
    const durationLabel =
      durationMinutes === 1440
        ? '24 ساعة'
        : durationMinutes === 60
          ? 'ساعة واحدة'
          : '5 دقائق';
    const msg = `تم طرد ${confirmKickTarget.name} من الغرفة لمدة ${durationLabel}`;
    setConfirmKickTarget(null);
    showSettingsFeedback(msg, 'success');
    showNotice(msg);
  };

  const openSettingsSection = (tab: 'all' | 'backgrounds' | 'lock' | 'staff' | 'details') => {
    soundFx.tap();
    if (settingsOpen && settingsTab === tab) {
      setSettingsOpen(false);
    } else {
      setSettingsTab(tab);
      setSettingsOpen(true);
    }
  };

  const displayedGifts =
    giftTierTab === 'fav'
      ? GIFT_ITEMS.filter((g) => favGiftIds.includes(g.id))
      : GIFT_ITEMS.filter((g) => g.cost === giftTierTab);

  // Organize seats: Top VIP tier ALWAYS stays 2 main mics (Owner + Co-Main); every level-unlocked mic opens below!
  const seatByIndex = (idx: number) => room.seats.find((s) => s.index === idx);
  const vipTopSeats = [seatByIndex(0), seatByIndex(1)].filter(
    (s): s is RoomFullState['seats'][number] => Boolean(s)
  );
  const bottomAudienceSeats = room.seats.filter((s) => s.index >= 2);

  const renderSeatCard = (
    seat: RoomFullState['seats'][number],
    variant: 'vip' | 'standard' | 'compact',
    extraClass = ''
  ) => {
    const hasFreshReaction =
      seat.lastReaction && nowTs - seat.lastReaction.ts < 2300;
    const isMe = seat.playerId === profile.id;
    const seatNo = String(seat.index + 1).padStart(2, '0');
    const isLiveSpeaking = Boolean(seat.playerId && seat.isSpeaking && !seat.isMuted);
    const seatMicLocked = Boolean(
      !seat.isOwnerSeat && (seat.isLocked || room.micsLocked)
    );
    const isSelected = selectedSeatIdx === seat.index;

    const handleEmptySeatClick = () => {
      soundFx.tap();
      if (seat.isOwnerSeat && !isOwner) {
        showNotice('المايك الأول مخصص لصاحب الغرفة فقط');
        return;
      }
      if (seatMicLocked) {
        showNotice(
          canControlMics
            ? 'هذا المايك مقفل حالياً · اضغط على أيقونة القفل لفتحه أولاً'
            : 'هذا المايك مقفل حالياً من إدارة الغرفة'
        );
        return;
      }
      send({ type: 'seat:take', seatIndex: seat.index });
    };

    if (variant === 'compact') {
      if (!seat.playerId) {
        const lockedForGuest = (seat.isOwnerSeat && !isOwner) || seatMicLocked;
        return (
          <div
            key={seat.index}
            role="button"
            tabIndex={0}
            onClick={handleEmptySeatClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleEmptySeatClick();
              }
            }}
            className={`group relative h-[84px] min-w-[74px] flex-1 rounded-2xl border flex flex-col items-center justify-center gap-1.5 px-1.5 transition-all duration-150 cursor-pointer ${
              seatMicLocked
                ? isDarkBg
                  ? 'border-rose-400/40 bg-rose-500/10 text-rose-200'
                  : 'border-rose-200 bg-rose-50/75 text-rose-800'
                : seat.isOwnerSeat
                  ? isDarkBg
                    ? 'border-amber-400/50 bg-gradient-to-b from-amber-500/16 to-amber-500/5 text-amber-200 hover:border-amber-400'
                    : 'border-amber-300/90 bg-gradient-to-b from-amber-50 to-white text-amber-900 hover:border-amber-400'
                  : isDarkBg
                    ? 'border-white/15 border-dashed bg-white/[0.04] text-slate-200 hover:border-white/40 hover:bg-white/10'
                    : 'border-slate-300/80 border-dashed bg-slate-50/75 text-slate-600 hover:border-blue-400 hover:bg-blue-50/40'
            } ${lockedForGuest ? 'opacity-65' : ''} ${extraClass}`}
          >
            <span className="absolute top-1 right-1.5 text-[9px] font-mono-num font-bold opacity-55">
              {seatNo}
            </span>
            {canControlMics && !seat.isOwnerSeat && (
              <button
                type="button"
                title={seatMicLocked ? 'فتح المايك' : 'قفل المايك'}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSeatLock(seat.index, seatMicLocked);
                }}
                className={`absolute top-1 left-1 p-0.5 rounded transition-colors cursor-pointer ${
                  seatMicLocked
                    ? 'text-rose-600 dark:text-rose-300'
                    : 'text-slate-400 hover:text-blue-600'
                }`}
              >
                {seatMicLocked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
              </button>
            )}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center border transition-transform duration-150 group-hover:scale-105 ${
                seatMicLocked
                  ? 'border-rose-300 bg-rose-500/15 text-rose-600 dark:text-rose-300'
                  : seat.isOwnerSeat
                    ? 'border-amber-400/60 bg-amber-500/15 text-amber-500'
                    : isDarkBg
                      ? 'border-white/20 bg-white/10 text-slate-200'
                      : 'border-slate-200 bg-white text-slate-500 shadow-2xs'
              }`}
            >
              {seatMicLocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : seat.isOwnerSeat ? (
                <Crown className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </div>
            <span className="text-[10px] font-extrabold truncate max-w-full">
              {seatMicLocked ? 'مقفل' : seat.isOwnerSeat ? 'المالك' : `مايك ${seat.index + 1}`}
            </span>
          </div>
        );
      }

      return (
        <div
          key={seat.index}
          onClick={() => {
            if (!isMe) {
              soundFx.tap();
              setSelectedSeatIdx((prev) => (prev === seat.index ? null : seat.index));
            }
          }}
          className={`relative h-[84px] min-w-[74px] flex-1 rounded-2xl border px-1.5 py-1.5 flex flex-col items-center justify-center gap-1 transition-all duration-150 ${
            !isMe ? 'cursor-pointer' : ''
          } ${isSelected ? 'ring-2 ring-blue-500' : ''} ${
            isLiveSpeaking
              ? 'border-emerald-500 bg-emerald-500/12 ring-2 ring-emerald-500/20 shadow-xs'
              : seat.isOwnerSeat
                ? isDarkBg
                  ? 'border-amber-400/55 bg-gradient-to-b from-amber-500/15 to-white/5 text-white'
                  : 'border-amber-300 bg-gradient-to-b from-amber-50/90 to-white text-[#141824]'
                : isDarkBg
                  ? 'border-white/15 bg-white/10 text-white'
                  : 'border-slate-200 bg-white text-[#141824] shadow-2xs'
          } ${extraClass}`}
        >
          <span className="absolute top-1 right-1.5 text-[9px] font-mono-num font-bold opacity-50">
            {seatNo}
          </span>
          {hasFreshReaction && seat.lastReaction && (
            <div
              key={seat.lastReaction.ts}
              className="absolute -top-3 left-1/2 -translate-x-1/2 text-xl pointer-events-none animate-float-reaction z-10"
            >
              {seat.lastReaction.emoji}
            </div>
          )}
          {!isMe && seat.playerId && (
            <button
              type="button"
              title={`إبلاغ عن اللاعب ${seat.playerName || ''}`}
              onClick={(e) => {
                e.stopPropagation();
                soundFx.tap();
                setReportingMessage(null);
                setReportingUser({ id: seat.playerId!, name: seat.playerName || 'لاعب' });
              }}
              className="absolute top-1 left-1 p-0.5 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
            </button>
          )}
          <div className="relative mt-1">
            <AvatarBadge
              avatarId={seat.avatar}
              size={32}
              className={
                isLiveSpeaking
                  ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900'
                  : seat.isOwnerSeat
                    ? 'ring-2 ring-amber-400/70'
                    : ''
              }
            />
            {isMe ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleMic();
                }}
                title={seat.forceMuted ? 'مكتوم من الإدارة' : seat.isMuted ? 'فتح المايك' : 'كتم المايك'}
                className={`absolute -bottom-0.5 -left-1 w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white cursor-pointer transition-transform hover:scale-110 ${
                  seat.forceMuted
                    ? 'bg-rose-600 text-white'
                    : seat.isMuted
                      ? 'bg-slate-500 text-white'
                      : 'bg-emerald-600 text-white'
                }`}
              >
                {seat.isMuted ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
              </button>
            ) : (
              <span
                className={`absolute -bottom-0.5 -left-1 w-4 h-4 rounded-full flex items-center justify-center border border-white ${
                  seat.forceMuted
                    ? 'bg-rose-600 text-white'
                    : seat.isMuted
                      ? 'bg-slate-400 text-white'
                      : 'bg-emerald-600 text-white'
                }`}
              >
                {seat.isMuted ? <MicOff className="w-2 h-2" /> : <Mic className="w-2 h-2" />}
              </span>
            )}
          </div>
          <p className="text-[10px] font-bold truncate max-w-full flex items-center justify-center gap-0.5">
            {seat.isOwnerSeat && <Crown className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
            <span className="truncate">{seat.playerName}</span>
          </p>
        </div>
      );
    }

    const isVip = variant === 'vip';
    const boxHeight = isVip ? 'min-h-[114px] sm:min-h-[132px]' : 'min-h-[88px] sm:min-h-[108px]';
    const avatarSize = isVip ? 48 : 34;

    if (!seat.playerId) {
      const lockedForGuest = (seat.isOwnerSeat && !isOwner) || seatMicLocked;
      return (
        <div
          key={seat.index}
          role="button"
          tabIndex={0}
          onClick={handleEmptySeatClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleEmptySeatClick();
            }
          }}
          className={`group relative ${boxHeight} rounded-2xl border flex flex-col items-center justify-center cursor-pointer ${
            isVip ? 'gap-2 px-2.5 py-2.5' : 'gap-1.5 px-1 sm:px-2.5 py-2'
          } transition-all duration-150 min-w-0 ${
            seatMicLocked
              ? isDarkBg
                ? 'border-rose-400/45 bg-rose-500/12 text-rose-100'
                : 'border-rose-200 bg-rose-50/75 text-rose-900 shadow-2xs'
              : seat.isOwnerSeat
                ? isDarkBg
                  ? 'border-amber-400/60 bg-gradient-to-b from-amber-500/20 via-amber-500/8 to-transparent text-amber-100 hover:border-amber-300'
                  : 'border-amber-300 bg-gradient-to-b from-amber-50 via-amber-50/40 to-white text-amber-900 hover:border-amber-400 shadow-2xs'
                : isVip
                  ? isDarkBg
                    ? 'border-blue-400/50 bg-gradient-to-b from-blue-500/18 via-blue-500/6 to-transparent text-blue-100 hover:border-blue-300'
                    : 'border-blue-200 bg-gradient-to-b from-blue-50/85 via-white to-white text-blue-900 hover:border-blue-400 shadow-2xs'
                  : isDarkBg
                    ? 'border-white/15 border-dashed bg-white/[0.04] text-slate-200 hover:border-white/40 hover:bg-white/10'
                    : 'border-slate-300/85 border-dashed bg-gradient-to-b from-slate-50/90 to-white text-slate-700 hover:border-blue-400 hover:from-blue-50/50 shadow-2xs'
          } ${lockedForGuest ? 'opacity-65' : 'hover:-translate-y-0.5'} ${extraClass}`}
        >
          <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2.5 text-[9px] sm:text-[10px] font-mono-num font-bold opacity-55">
            {seatNo}
          </span>

          {canControlMics && !seat.isOwnerSeat && (
            <button
              type="button"
              title={seatMicLocked ? 'فتح هذا المايك' : 'قفل هذا المايك'}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSeatLock(seat.index, seatMicLocked);
              }}
              className={`absolute top-1 left-1 sm:top-1.5 sm:left-1.5 p-1 rounded-md transition-colors cursor-pointer ${
                seatMicLocked
                  ? 'bg-rose-600/15 text-rose-600 dark:text-rose-300 hover:bg-rose-600/25'
                  : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60'
              }`}
            >
              {seatMicLocked ? (
                <Lock className="w-3 h-3" />
              ) : (
                <Unlock className="w-3 h-3" />
              )}
            </button>
          )}

          <div
            className={`${
              isVip ? 'w-11 h-11 sm:w-12 sm:h-12 ring-4' : 'w-8 h-8 sm:w-9 sm:h-9 ring-2 sm:ring-4'
            } rounded-full flex items-center justify-center transition-transform duration-150 group-hover:scale-105 ${
              seatMicLocked
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-400/20 border border-rose-400/50'
                : seat.isOwnerSeat
                  ? 'bg-amber-500/15 text-amber-500 ring-amber-400/20 border border-amber-400/50'
                  : isVip
                    ? 'bg-blue-500/12 text-blue-600 dark:text-blue-300 ring-blue-400/15 border border-blue-400/40'
                    : isDarkBg
                      ? 'bg-white/10 text-slate-200 ring-white/5 border border-white/20'
                      : 'bg-white text-slate-500 ring-slate-200/50 border border-slate-200 shadow-2xs'
            }`}
          >
            {seatMicLocked ? (
              <Lock className={isVip ? 'w-4.5 h-4.5' : 'w-3.5 h-3.5'} />
            ) : seat.isOwnerSeat ? (
              <Crown className={isVip ? 'w-5 h-5' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'} />
            ) : (
              <Mic className={isVip ? 'w-4.5 h-4.5' : 'w-3.5 h-3.5'} />
            )}
          </div>

          <div className="text-center w-full min-w-0 space-y-0.5">
            <p
              className={`${
                isVip ? 'text-[11px] sm:text-xs' : 'text-[10px] sm:text-[11px]'
              } font-extrabold leading-tight truncate`}
            >
              {seatMicLocked
                ? 'مايك مقفل'
                : seat.isOwnerSeat
                  ? 'مايك صاحب الغرفة'
                  : seat.index === 1
                    ? 'المايك الرئيسي 2'
                    : `مايك ${seat.index + 1}`}
            </p>
            <p className={`${isVip ? 'block' : 'hidden sm:block'} text-[9px] sm:text-[10px] opacity-70 truncate`}>
              {seat.isOwnerSeat && !isOwner
                ? 'مخصص للمالك'
                : seatMicLocked
                  ? canControlMics
                    ? 'مقفل · اضغط القفل للفتح'
                    : 'مقفل من الإدارة'
                  : 'اضغط للصعود'}
            </p>
          </div>
        </div>
      );
    }

    const roleLabel =
      seat.staffRole === 'owner'
        ? 'صاحب الغرفة'
        : seat.staffRole === 'cohost'
          ? 'نائب الغرفة'
          : seat.staffRole === 'moderator'
            ? 'مشرف'
            : isMe
              ? 'أنت'
              : 'ضيف';

    return (
      <div
        key={seat.index}
        onClick={() => {
          if (!isMe) {
            soundFx.tap();
            setSelectedSeatIdx((prev) => (prev === seat.index ? null : seat.index));
          }
        }}
        className={`relative ${boxHeight} rounded-2xl border ${
          isVip ? 'p-2.5 sm:p-3 gap-1.5' : 'p-1.5 sm:p-2.5 gap-1'
        } flex flex-col items-center justify-center min-w-0 transition-all duration-150 ${
          !isMe ? 'cursor-pointer' : ''
        } ${isSelected ? 'ring-2 ring-blue-500' : ''} ${
          isLiveSpeaking
            ? isDarkBg
              ? 'border-emerald-400 bg-emerald-500/18 ring-2 ring-emerald-400/25 shadow-sm'
              : 'border-emerald-500 bg-gradient-to-b from-emerald-50/80 to-white ring-2 ring-emerald-500/20 shadow-sm text-[#141824]'
            : seat.isOwnerSeat
              ? isDarkBg
                ? 'border-amber-400/60 bg-gradient-to-b from-amber-500/18 to-white/5 text-white'
                : 'border-amber-300 bg-gradient-to-b from-amber-50/90 to-white text-[#141824] shadow-2xs'
              : isVip
                ? isDarkBg
                  ? 'border-blue-400/45 bg-gradient-to-b from-blue-500/15 to-white/5 text-white'
                  : 'border-blue-200 bg-gradient-to-b from-blue-50/60 to-white text-[#141824] shadow-2xs'
                : isDarkBg
                  ? 'border-white/15 bg-white/10 text-white'
                  : 'border-slate-200 bg-white text-[#141824] shadow-2xs'
        } ${extraClass}`}
      >
        <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2.5 text-[9px] sm:text-[10px] font-mono-num font-bold opacity-55">
          {seatNo}
        </span>

        {hasFreshReaction && seat.lastReaction && (
          <div
            key={seat.lastReaction.ts}
            className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl pointer-events-none animate-float-reaction z-10"
          >
            {seat.lastReaction.emoji}
          </div>
        )}

        {!isMe && seat.playerId && (
          <button
            type="button"
            title={
              canMuteTarget(seat.playerId) || canKickTarget(seat.playerId)
                ? 'خيارات الإدارة والإبلاغ'
                : `إبلاغ عن اللاعب ${seat.playerName || ''}`
            }
            onClick={(e) => {
              e.stopPropagation();
              soundFx.tap();
              if (canMuteTarget(seat.playerId!) || canKickTarget(seat.playerId!) || canAssignMod) {
                setSelectedSeatIdx((prev) => (prev === seat.index ? null : seat.index));
              } else {
                setReportingMessage(null);
                setReportingUser({ id: seat.playerId!, name: seat.playerName || 'لاعب' });
              }
            }}
            className="absolute top-1.5 left-1 sm:top-2 sm:left-2 p-0.5 sm:p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
          >
            {canMuteTarget(seat.playerId) || canKickTarget(seat.playerId) || canAssignMod ? (
              <SlidersHorizontal className={isVip ? 'w-3.5 h-3.5' : 'w-3 h-3 sm:w-3.5 sm:h-3.5'} />
            ) : (
              <AlertTriangle className={isVip ? 'w-3.5 h-3.5' : 'w-3 h-3 sm:w-3.5 sm:h-3.5'} />
            )}
          </button>
        )}

        <div className="relative mt-1">
          <div
            className={`rounded-full p-0.5 ${
              isLiveSpeaking
                ? 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900'
                : seat.isOwnerSeat
                  ? 'ring-2 ring-amber-400/75'
                  : isVip
                    ? 'ring-2 ring-blue-400/50'
                    : ''
            }`}
          >
            <AvatarBadge avatarId={seat.avatar} size={avatarSize} />
          </div>

          {isMe ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void toggleMic();
              }}
              title={
                seat.forceMuted
                  ? 'مكتوم من الإدارة'
                  : seat.isMuted
                    ? 'فتح المايك'
                    : 'كتم المايك'
              }
              className={`absolute -bottom-0.5 -left-0.5 sm:-left-1 ${
                isVip ? 'w-6 h-6' : 'w-4.5 h-4.5 sm:w-5 sm:h-5'
              } rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 cursor-pointer transition-transform hover:scale-110 shadow-xs ${
                seat.forceMuted
                  ? 'bg-rose-600 text-white'
                  : seat.isMuted
                    ? 'bg-slate-500 text-white'
                    : 'bg-emerald-600 text-white'
              }`}
            >
              {seat.isMuted ? (
                <MicOff className={isVip ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
              ) : (
                <Mic className={isVip ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
              )}
            </button>
          ) : (
            <span
              className={`absolute -bottom-0.5 -left-0.5 sm:-left-1 ${
                isVip ? 'w-5.5 h-5.5' : 'w-4 h-4 sm:w-4.5 sm:h-4.5'
              } rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-2xs ${
                seat.forceMuted
                  ? 'bg-rose-600 text-white'
                  : seat.isMuted
                    ? 'bg-slate-400 text-white'
                    : 'bg-emerald-600 text-white'
              }`}
            >
              {seat.isMuted ? (
                <MicOff className={isVip ? 'w-3 h-3' : 'w-2 h-2 sm:w-2.5 sm:h-2.5'} />
              ) : (
                <Mic className={isVip ? 'w-3 h-3' : 'w-2 h-2 sm:w-2.5 sm:h-2.5'} />
              )}
            </span>
          )}
        </div>

        <div className="text-center w-full min-w-0 space-y-0.5">
          <p className={`${isVip ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'} font-extrabold truncate flex items-center justify-center gap-0.5 sm:gap-1`}>
            {seat.isOwnerSeat && <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500 shrink-0" />}
            {seat.staffRole === 'cohost' && <Shield className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
            {seat.staffRole === 'moderator' && <Shield className="w-2.5 h-2.5 text-blue-500 shrink-0" />}
            <span className="truncate">{seat.playerName}</span>
          </p>
          <p
            className={`text-[9px] sm:text-[10px] truncate flex items-center justify-center gap-1 ${
              seat.forceMuted
                ? 'text-rose-600 dark:text-rose-400 font-bold'
                : isLiveSpeaking
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : isDarkBg
                    ? 'text-slate-300'
                    : 'text-slate-500'
            }`}
          >
            {seat.forceMuted ? (
              <span>مكتوم من الإدارة</span>
            ) : isLiveSpeaking ? (
              <>
                <span className="inline-flex items-end gap-0.5 h-2.5 shrink-0" aria-hidden="true">
                  <span className="w-0.5 h-full bg-emerald-500 rounded-full voice-eq-bar" />
                  <span className="w-0.5 h-full bg-emerald-500 rounded-full voice-eq-bar voice-eq-bar-delay-1" />
                  <span className="w-0.5 h-full bg-emerald-500 rounded-full voice-eq-bar voice-eq-bar-delay-2" />
                </span>
                <span>يتحدث</span>
              </>
            ) : (
              <span>{roleLabel}</span>
            )}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1360px] mx-auto px-2.5 sm:px-6 py-3 sm:py-3.5 space-y-3 overflow-x-hidden">
      {/* Unified Room Workspace: Header + Settings + Game Switcher + Mics in the Same Region */}
      <div className={`w-full min-w-0 overflow-hidden border rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-3.5 transition-colors ${bgTheme.surfaceClass}`}>
        {/* 1. Room Top Identity & Global Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 min-w-0">
          <div className="space-y-1 min-w-0 flex-1 basis-[240px]">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
              {room.tier === 'basic' && <Crown className="w-5 h-5 text-amber-500 shrink-0" />}
              <h1 className={`text-sm sm:text-xl font-extrabold truncate max-w-full ${bgTheme.headerTextClass}`}>
                {room.title}
              </h1>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(room.code).catch(() => {});
                  setCopiedCode(true);
                  soundFx.tap();
                  setTimeout(() => setCopiedCode(false), 1800);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-mono-num font-bold text-slate-700 dark:text-slate-200 bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-md cursor-pointer"
              >
                <span>{room.isPinnedId ? `رقم مثبت: ${room.code}` : `رقم مؤقت: ${room.code}`}</span>
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {room.tier === 'basic' && room.isLocked && (
                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md">
                  <Lock className="w-3 h-3" />
                  <span>{room.hasLockPin ? 'مقفلة برمز' : 'مقفلة'}</span>
                </span>
              )}
            </div>

            <div className={`text-xs flex flex-wrap items-center gap-2 ${isDarkBg ? 'text-slate-300' : 'text-slate-600'}`}>
              <span>{room.tier === 'basic' ? `الغرفة الأساسية · المستوى ${caps.level}` : 'غرفة مجانية · بدون مستويات'}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono-num">
                <Clock className="w-3.5 h-3.5" />
                {formatRemainingTime(room.expiresAtMs, nowTs)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">
                {room.seats.filter((s) => s.playerId).length}/{caps.maxMics} مايك
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-full">
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/?room=${room.code}`;
                navigator.clipboard?.writeText(url).catch(() => {});
                setCopiedLink(true);
                soundFx.tap();
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'تم نسخ الرابط' : 'دعوة'}</span>
            </button>

            {onOpenFriendsModal && (
              <button
                type="button"
                onClick={() => {
                  soundFx.tap();
                  onOpenFriendsModal();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                title="الأصدقاء والرسائل المباشرة"
              >
                <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>الأصدقاء</span>
                {friendsBadgeCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] leading-none font-extrabold rounded bg-emerald-600 text-white font-mono-num">
                    {friendsBadgeCount}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
              className="p-2 text-slate-700 dark:text-slate-200 bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 rounded-lg cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                soundFx.muted = !soundMuted;
                setSoundMuted(!soundMuted);
              }}
              className="p-2 text-slate-700 dark:text-slate-200 bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              title={soundMuted ? 'تشغيل الأصوات' : 'كتم الأصوات'}
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                soundFx.tap();
                setReportingUser(null);
                setReportingMessage(null);
                setReportModalOpen(true);
              }}
              title="تقديم بلاغ ضد لاعب مخالف"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-lg cursor-pointer transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>إبلاغ</span>
            </button>

            {onMinimizeRoom && (
              <button
                type="button"
                onClick={() => {
                  soundFx.tap();
                  onMinimizeRoom();
                }}
                title="تصغير الغرفة للتحدث مع الأصدقاء أو الشحن مع البقاء في الغرفة"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg cursor-pointer transition-colors"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>تصغير</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                soundFx.tap();
                onLeaveRoom();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>مغادرة</span>
            </button>
          </div>
        </div>

        {/* 2. Unified Control Bar: View Switcher + Game Switcher + Room Settings (Background, Lock, Staff) + XP */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 pt-2.5 border-t border-black/10 dark:border-white/10 w-full min-w-0">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto min-w-0">
            {/* Switch between Voice Stage & Game Stage */}
            <div
              role="tablist"
              aria-label="تبديل واجهة الغرفة"
              className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100/95 dark:bg-slate-800/95 border border-slate-200 dark:border-slate-700 w-full sm:w-auto min-w-0"
            >
              <button
                type="button"
                role="tab"
                aria-selected={roomView === 'voice'}
                onClick={() => {
                  soundFx.tap();
                  setRoomView('voice');
                }}
                className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-extrabold rounded-lg transition-all duration-150 min-w-0 cursor-pointer ${
                  roomView === 'voice'
                    ? 'bg-[#141824] dark:bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-700/70'
                }`}
              >
                <Mic className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">الميكات والصوت</span>
                <span
                  className={`text-[10px] font-mono-num px-1.5 py-0.5 rounded-md shrink-0 ${
                    roomView === 'voice'
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {room.seats.filter((s) => s.playerId).length}/{caps.maxMics}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={roomView === 'game'}
                onClick={() => {
                  soundFx.tap();
                  setRoomView('game');
                }}
                className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-extrabold rounded-lg transition-all duration-150 min-w-0 cursor-pointer ${
                  roomView === 'game'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-700/70'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                <span className="shrink-0">ساحة اللعب</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold opacity-95 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0 border border-white/50"
                    style={{ backgroundColor: roomView === 'game' ? '#FFFFFF' : activeGameMeta.accentHex }}
                  />
                  <span className="truncate max-w-[66px] sm:max-w-none">{activeGameMeta.titleAr}</span>
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
              {/* Game Switcher Trigger (in same region) */}
              <button
                type="button"
                aria-expanded={gamePanelOpen}
                onClick={() => {
                  soundFx.tap();
                  setGamePanelOpen((v) => !v);
                  setSettingsOpen(false);
                }}
                className={`w-full sm:w-auto min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-extrabold rounded-xl border transition-colors cursor-pointer ${
                  gamePanelOpen
                    ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                    : 'bg-white/95 dark:bg-slate-800/95 text-[#141824] dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">تبديل الألعاب ({caps.allowedGames.length})</span>
                {gamePanelOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>

              {/* Unified Room Settings Trigger (Backgrounds + Lock + Moderators + Details) */}
              <button
                type="button"
                aria-expanded={settingsOpen}
                onClick={() => {
                  setGamePanelOpen(false);
                  openSettingsSection('all');
                }}
                className={`w-full sm:w-auto min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs font-extrabold rounded-xl border transition-colors cursor-pointer ${
                  settingsOpen
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white/95 dark:bg-slate-800/95 text-[#141824] dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">إعدادات الغرفة</span>
                {room.tier === 'basic' && room.isLocked && (
                  <Lock className="w-3 h-3 text-rose-400 shrink-0" />
                )}
                {settingsOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>
            </div>

            {/* Quick In-Region Settings Shortcuts (Visible on Mobile & Desktop) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setGamePanelOpen(false);
                  openSettingsSection('backgrounds');
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                  settingsOpen && settingsTab === 'backgrounds'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white/85 dark:bg-slate-800/85 border-slate-200/90 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700'
                }`}
              >
                <ImageIcon className="w-3 h-3 shrink-0" />
                <span>الخلفية: {bgTheme.nameAr}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGamePanelOpen(false);
                  openSettingsSection('lock');
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                  settingsOpen && settingsTab === 'lock'
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : room.isLocked
                      ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                      : 'bg-white/85 dark:bg-slate-800/85 border-slate-200/90 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700'
                }`}
              >
                {room.isLocked ? <Lock className="w-3 h-3 shrink-0" /> : <Unlock className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                <span>
                  {room.tier === 'basic'
                    ? room.isLocked
                      ? 'مقفلة (تعديل)'
                      : 'قفل الروم'
                    : 'قفل الروم'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGamePanelOpen(false);
                  openSettingsSection('staff');
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border cursor-pointer whitespace-nowrap transition-colors ${
                  settingsOpen && settingsTab === 'staff'
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white/85 dark:bg-slate-800/85 border-slate-200/90 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700'
                }`}
              >
                <Shield className="w-3 h-3 shrink-0" />
                <span className="font-mono-num">المشرفون ({modsCount}/{caps.maxMods})</span>
              </button>
            </div>
          </div>

          {room.tier === 'basic' && levelSpec ? (
            <div className="w-full lg:flex-1 lg:max-w-xs min-w-0 space-y-1">
              <div className={`flex items-center justify-between text-[11px] font-bold ${isDarkBg ? 'text-slate-200' : 'text-slate-700'}`}>
                <span>المستوى {levelSpec.level} · {caps.maxMics} مايك</span>
                <span className="font-mono-num">
                  {levelSpec.maxXp !== null
                    ? `${room.xp.toLocaleString('en-US')} / ${(levelSpec.maxXp + 1).toLocaleString('en-US')}`
                    : `${room.xp.toLocaleString('en-US')} نقطة`}
                </span>
              </div>
              <div className="w-full h-1.5 bg-black/15 dark:bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{
                    width:
                      levelSpec.maxXp !== null
                        ? `${Math.min(100, Math.max(4, ((room.xp - levelSpec.minXp) / (levelSpec.maxXp + 1 - levelSpec.minXp)) * 100))}%`
                        : '100%',
                  }}
                />
              </div>
            </div>
          ) : (
            <p className={`text-xs ${isDarkBg ? 'text-slate-300' : 'text-slate-600'}`}>
              غرفة مجانية · 10 مايكات · ألعاب لودو والسلم والثعبان
            </p>
          )}
        </div>

        {!connected && (
          <div className="bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center justify-between gap-2">
            <span>جاري إعادة الاتصال المباشر بالغرفة... أعد المحاولة لحظياً</span>
          </div>
        )}

        {notice && (
          <div className="bg-amber-50 dark:bg-amber-950/75 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 text-xs font-bold px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <span>{notice}</span>
            <button type="button" onClick={onGoToStore} className="underline font-extrabold cursor-pointer">
              المتجر
            </button>
          </div>
        )}

        {/* 3. Inline Game Control Drawer (لوحة التحكم وتبديل الألعاب في نفس المنطقة) */}
        {gamePanelOpen && (
          <div className="animate-stage-enter bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-700 rounded-2xl p-4 space-y-3.5 text-[#141824] dark:text-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold flex items-center gap-2">
                    <span>تبديل الألعاب ولوحة التحكم</span>
                    <span className="text-[11px] font-mono-num font-bold text-slate-500 dark:text-slate-400">
                      ({caps.allowedGames.length}/{BASIC_ROOM_GAMES.length} متاحة)
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {canManageGames
                      ? 'اختر أي لعبة متاحة لتبديلها وتشغيلها فوراً في ساحة اللعب'
                      : 'تصفح ألعاب الغرفة وقواعدها · المضيف والنائب يتحكمان بتبديل اللعبة'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    setRoomView(roomView === 'voice' ? 'game' : 'voice');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {roomView === 'voice' ? (
                    <>
                      <Gamepad2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>فتح ساحة اللعب</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>العودة للميكات</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setGamePanelOpen(false)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {BASIC_ROOM_GAMES.map((gt: GameType) => {
                const gameMeta = GAME_CATALOG[gt];
                const isAllowed = caps.allowedGames.includes(gt);
                const isActiveGame = room.gameType === gt;

                return (
                  <div
                    key={gt}
                    className={`rounded-xl border p-3 flex flex-col justify-between gap-2.5 transition-all ${
                      isActiveGame
                        ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30 ring-1 ring-emerald-500/20'
                        : isAllowed
                          ? 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-600'
                          : 'border-slate-200/70 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/20 opacity-75'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: gameMeta.accentHex }}
                          />
                          <h4 className="text-xs font-extrabold truncate">{gameMeta.titleAr}</h4>
                        </div>
                        {isActiveGame ? (
                          <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 shrink-0">
                            نشطة الآن
                          </span>
                        ) : !isAllowed ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 shrink-0">
                            <Lock className="w-3 h-3" />
                            <span>أساسية</span>
                          </span>
                        ) : null}
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">
                        {gameMeta.subtitleAr}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                      <span className="text-[10px] font-mono-num text-slate-500 dark:text-slate-400">
                        {gameMeta.playersRange} · {gameMeta.durationLabel}
                      </span>

                      {isAllowed ? (
                        canManageGames ? (
                          <button
                            type="button"
                            onClick={() => {
                              soundFx.tap();
                              if (!isActiveGame) {
                                send({ type: 'room:switch_game', gameType: gt });
                                if (room.tier === 'basic' && isOwner) {
                                  persistBasicRoomAppearance(room.code, { activeGame: gt }).catch(() => {});
                                }
                              }
                              setRoomView('game');
                              setGamePanelOpen(false);
                            }}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isActiveGame
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-[#141824] dark:bg-blue-600 text-white hover:opacity-90'
                            }`}
                          >
                            {isActiveGame ? 'دخول اللعب' : 'تشغيل اللعبة'}
                          </button>
                        ) : (
                          isActiveGame && (
                            <button
                              type="button"
                              onClick={() => {
                                soundFx.tap();
                                setRoomView('game');
                                setGamePanelOpen(false);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              مشاهدة اللعبة
                            </button>
                          )
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={onGoToStore}
                          className="text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer whitespace-nowrap"
                        >
                          ترقية للأساسية
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Unified Room Settings Panel (خلفية الغرفة + قفل الروم + المشرفون والنواب + التفاصيل في نفس المنطقة) */}
        {settingsOpen && (
          <div className="animate-stage-enter bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-700 rounded-2xl p-4 space-y-4 text-[#141824] dark:text-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">إعدادات الغرفة</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    خلفية الغرفة، قفل الروم (للرومات الأساسية)، وإدارة المشرفين والنواب في مكان واحد
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                <div className="flex flex-wrap sm:inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg max-w-full">
                  {(
                    [
                      { id: 'all', label: 'الكل' },
                      { id: 'backgrounds', label: 'الخلفية' },
                      { id: 'lock', label: 'قفل الروم' },
                      { id: 'staff', label: 'المشرفون' },
                      { id: 'details', label: 'التفاصيل' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        soundFx.tap();
                        setSettingsTab(tab.id);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        settingsTab === tab.id
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-[#141824] dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {settingsFeedback && (
              <div
                className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                  settingsFeedback.tone === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                }`}
              >
                <span>{settingsFeedback.text}</span>
              </div>
            )}

            {/* Settings Body: 3 Core Sections (Backgrounds, Room Lock, Staff) */}
            {(settingsTab === 'all' || settingsTab !== 'details') && (
              <div
                className={`grid gap-3 ${
                  settingsTab === 'all' ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'
                }`}
              >
                {/* Section 1: خلفية الغرفة */}
                {(settingsTab === 'all' || settingsTab === 'backgrounds') && (
                  <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5 bg-slate-50/70 dark:bg-slate-800/35 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>خلفية الغرفة</span>
                      </h4>
                      <span className="text-[10px] font-mono-num text-slate-500 dark:text-slate-400">
                        {caps.backgroundsCount}/11 متاحة
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                      {ROOM_BACKGROUNDS.map((bg) => {
                        const unlocked =
                          room.tier === 'basic'
                            ? bg.index < caps.backgroundsCount
                            : bg.index === 0;
                        const active = room.backgroundIndex === bg.index;
                        const canClick = unlocked && canChangeBackground;
                        return (
                          <button
                            key={bg.index}
                            type="button"
                            onClick={() => handleSelectBackground(bg.index)}
                            className={`p-2 rounded-lg border text-right space-y-0.5 transition-all cursor-pointer ${bg.surfaceClass} ${bg.headerTextClass} ${
                              active ? 'ring-2 ring-blue-600' : ''
                            } ${canClick ? 'hover:scale-[1.01]' : 'opacity-65 hover:opacity-85'}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-bold truncate">{bg.nameAr}</span>
                              {!unlocked ? (
                                <Lock className="w-3 h-3 shrink-0" />
                              ) : active ? (
                                <Check className="w-3 h-3 text-blue-600 shrink-0" />
                              ) : null}
                            </div>
                            <p className="text-[9px] opacity-80">
                              {unlocked
                                ? active
                                  ? 'مُفعّلة الآن'
                                  : canChangeBackground
                                    ? 'اضغط للتطبيق'
                                    : 'مفتوحة'
                                : `مستوى ${bg.unlockLevel}`}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    {!canChangeBackground && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        تغيير الخلفية متاح لصاحب الغرفة والنائب والمشرفين فقط.
                      </p>
                    )}
                  </div>
                )}

                {/* Section 2: قفل وكلمة مرور الغرفة (Basic Rooms) */}
                {(settingsTab === 'all' || settingsTab === 'lock') && (
                  <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5 bg-slate-50/70 dark:bg-slate-800/35 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                          {room.isLocked ? (
                            <Lock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          )}
                          <span>كلمة مرور وقفل الغرفة</span>
                        </h4>
                        <span
                          className={`text-[10px] font-bold ${
                            room.tier !== 'basic'
                              ? 'text-slate-500 dark:text-slate-400'
                              : room.isLocked
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {room.tier !== 'basic'
                            ? 'للرومات الأساسية'
                            : room.isLocked
                              ? room.hasLockPin
                                ? 'مقفلة بكلمة مرور'
                                : 'مقفلة تماماً'
                              : 'مفتوحة للجميع'}
                        </span>
                      </div>

                      {room.tier === 'basic' ? (
                        <div className="space-y-2.5">
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            يمكن للمالك والنائب والمشرفين فتح أو قفل كلمة مرور الغرفة الأساسية للتحكم في دخول الضيوف.
                          </p>

                          {canControlLock ? (
                            <>
                              <div className="space-y-1">
                                <label
                                  htmlFor="room-lock-pin-input"
                                  className="block text-[10px] font-bold text-slate-600 dark:text-slate-300"
                                >
                                  كلمة مرور الغرفة (اتركها فارغة للقفل التام)
                                </label>
                                <input
                                  id="room-lock-pin-input"
                                  type="text"
                                  value={lockPinInput}
                                  onChange={(e) => setLockPinInput(e.target.value)}
                                  placeholder="مثال: 1234 (اختياري)"
                                  maxLength={16}
                                  dir="ltr"
                                  className="w-full px-3 py-1.5 text-xs font-mono-num text-center border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg focus:outline-none focus:border-blue-600"
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSetRoomLock(true, lockPinInput)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer whitespace-nowrap"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>
                                    {room.isLocked
                                      ? lockPinInput.trim()
                                        ? 'تحديث كلمة المرور'
                                        : 'تأكيد القفل التام'
                                      : lockPinInput.trim()
                                        ? 'قفل بكلمة مرور'
                                        : 'قفل الغرفة'}
                                  </span>
                                </button>
                                {room.isLocked && (
                                  <button
                                    type="button"
                                    onClick={() => handleSetRoomLock(false)}
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
                                  >
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>فتح الغرفة</span>
                                  </button>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              فتح أو قفل كلمة مرور الغرفة متاح لصاحب الغرفة والنائب والمشرفين فقط.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            ميزة قفل كلمة مرور الغرفة متاحة حصرياً في الغرف الأساسية الدائمة للحفاظ على خصوصية غرفتك.
                          </p>
                          <button
                            type="button"
                            onClick={onGoToStore}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white cursor-pointer whitespace-nowrap"
                          >
                            <Crown className="w-3.5 h-3.5" />
                            <span>ترقية للغرفة الأساسية</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Section 3: المشرفون والنواب وإدارة الأعضاء */}
                {(settingsTab === 'all' || settingsTab === 'staff') && (
                  <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3.5 bg-slate-50/70 dark:bg-slate-800/35 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>المشرفون وإدارة الأعضاء</span>
                      </h4>
                      <span className="text-[10px] font-mono-num text-slate-500 dark:text-slate-400">
                        {modsCount}/{caps.maxMods} مشرف · {coHostsCount}/{caps.maxCoHosts} نائب
                      </span>
                    </div>

                    <div className="divide-y divide-slate-200/70 dark:divide-slate-700/70 max-h-60 overflow-y-auto pr-0.5">
                      {room.members.filter((m) => m.id !== room.hostId).length === 0 ? (
                        <p className="py-6 text-center text-[11px] text-slate-500 dark:text-slate-400">
                          لا يوجد أعضاء آخرون في الغرفة حالياً
                        </p>
                      ) : (
                        room.members
                          .filter((m) => m.id !== room.hostId)
                          .map((m) => {
                            const role = room.staff[m.id] || null;
                            const roleName =
                              role === 'cohost' ? 'نائب الغرفة' : role === 'moderator' ? 'مشرف' : 'ضيف';
                            const isTargetMuted = Boolean(
                              m.isForceMuted ||
                                room.seats.find((s) => s.playerId === m.id)?.forceMuted
                            );
                            const allowModButton =
                              canAssignMod && !(myStaffRole === 'cohost' && role === 'cohost');
                            const allowCohostButton = canAssignCohost && caps.maxCoHosts > 0;
                            const allowMute = canMuteTarget(m.id);
                            const allowKick = canKickTarget(m.id);

                            return (
                              <div key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <AvatarBadge avatarId={m.avatar} size={26} />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold truncate">{m.name}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                      <span>{roleName}</span>
                                      {isTargetMuted && (
                                        <span className="text-rose-600 dark:text-rose-400 font-bold">
                                          · مكتوم
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1 shrink-0">
                                  {allowMute && (
                                    <button
                                      type="button"
                                      onClick={() => handleMuteMember(m.id, m.name, !isTargetMuted)}
                                      title={isTargetMuted ? 'إلغاء كتم المايك' : 'كتم المايك'}
                                      className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md cursor-pointer ${
                                        isTargetMuted
                                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      {isTargetMuted ? (
                                        <Mic className="w-2.5 h-2.5" />
                                      ) : (
                                        <MicOff className="w-2.5 h-2.5" />
                                      )}
                                      <span>{isTargetMuted ? 'فك الكتم' : 'كتم'}</span>
                                    </button>
                                  )}

                                  {allowModButton && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleAssignStaff(
                                          m.id,
                                          m.name,
                                          role === 'moderator' ? null : 'moderator'
                                        )
                                      }
                                      className={`px-2 py-1 text-[10px] font-bold rounded-md cursor-pointer ${
                                        role === 'moderator'
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      مشرف
                                    </button>
                                  )}

                                  {allowCohostButton && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleAssignStaff(
                                          m.id,
                                          m.name,
                                          role === 'cohost' ? null : 'cohost'
                                        )
                                      }
                                      className={`px-2 py-1 text-[10px] font-bold rounded-md cursor-pointer ${
                                        role === 'cohost'
                                          ? 'bg-amber-600 text-white'
                                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      نائب
                                    </button>
                                  )}

                                  {allowKick && (
                                    <button
                                      type="button"
                                      onClick={() => handleKickMember(m.id, m.name)}
                                      title="طرد من الغرفة"
                                      className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] font-bold rounded-md bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                                    >
                                      <UserX className="w-2.5 h-2.5" />
                                      <span>طرد</span>
                                    </button>
                                  )}

                                  {m.id !== profile.id && !allowKick && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        soundFx.tap();
                                        setReportingMessage(null);
                                        setReportingUser({ id: m.id, name: m.name });
                                      }}
                                      className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                                    >
                                      إبلاغ
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {isOwner
                        ? 'بصفتك مالك الغرفة: يمكنك تعيين/إلغاء المشرفين والنواب، وطرد وكتم الضيوف والمشرفين والنواب، والتحكم بالخلفيات وكلمة المرور والمايكات.'
                        : myStaffRole === 'cohost'
                          ? 'بصفتك نائب الغرفة: يمكنك تعيين/إلغاء المشرفين، وطرد وكتم المشرفين والضيوف، وتغيير الخلفيات وكلمة المرور وقفل المايكات.'
                          : myStaffRole === 'moderator'
                            ? 'بصفتك مشرفاً: يمكنك طرد وكتم الضيوف، وتغيير الخلفيات، وفتح/قفل كلمة مرور الغرفة والمايكات.'
                            : 'صلاحيات الإدارة مخصصة لصاحب الغرفة والنائب والمشرفين.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Section 4: تفاصيل الغرفة والمواصفات */}
            {(settingsTab === 'details' || settingsTab === 'all') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-extrabold text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      هوية الغرفة
                    </span>
                    <span className="font-mono-num">{room.code}</span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400">المالك:</span>
                      <span className="font-bold truncate">
                        {room.members.find((m) => m.id === room.hostId)?.name || 'المضيف'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">النوع:</span>
                      <span className="font-bold">
                        {room.tier === 'basic' ? 'أساسية دائمة' : 'غرفة مجانية'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">الخصوصية:</span>
                      <span className="font-bold">
                        {room.isLocked
                          ? 'مقفلة'
                          : room.isPrivate
                            ? 'خاصة بالرمز'
                            : 'مفتوحة للجميع'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-extrabold text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      المستوى والترقية
                    </span>
                    <span className="font-mono-num">
                      {room.tier === 'basic' ? `مستوى ${caps.level}/8` : 'مجانية'}
                    </span>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">المايكات:</span>
                      <span className="font-bold font-mono-num">{caps.maxMics} مايك</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">الخلفيات:</span>
                      <span className="font-bold">{bgTheme.nameAr}</span>
                    </div>
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 truncate">
                      {room.tier === 'basic'
                        ? nextLevelSpec
                          ? `المستوى ${nextLevelSpec.level} عند ${nextLevelSpec.minXp.toLocaleString('en-US')} نقطة`
                          : 'أقصى مستوى للغرفة'
                        : 'الترقية للأساسية تفتح 8 مستويات و6 ألعاب'}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-extrabold text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Gamepad2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      اللعبة النشطة
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: activeGameMeta.accentHex }}
                    />
                  </div>
                  <p className="font-extrabold text-xs">{activeGameMeta.titleAr}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                    {activeGameMeta.rulesAr[0]}
                  </p>
                </div>

                <div className="bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-extrabold text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      المتواجدون ({room.members.length})
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-rose-500 text-[11px] font-mono-num">
                      <Heart className="w-3 h-3 fill-current" />
                      {totalGiftLikes}
                    </span>
                  </div>
                  <div className="space-y-1 max-h-20 overflow-y-auto pr-0.5">
                    {room.members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <AvatarBadge avatarId={m.avatar} size={18} />
                          <span className="font-semibold truncate">{m.name}</span>
                        </div>
                        {m.id !== profile.id && (
                          <button
                            type="button"
                            onClick={() => {
                              soundFx.tap();
                              setReportingMessage(null);
                              setReportingUser({ id: m.id, name: m.name });
                            }}
                            className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer shrink-0"
                          >
                            إبلاغ
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {(reportModalOpen || reportingUser) && (
          <ReportModal
            profile={profile}
            reportedUser={reportingUser}
            reportedMessage={reportingMessage}
            availableUsers={room.members.filter((m) => m.id !== profile.id)}
            onClose={() => {
              setReportingUser(null);
              setReportingMessage(null);
              setReportModalOpen(false);
            }}
          />
        )}

        {/* 5. Mics & Stage Inside the Exact Same Unified Region */}
        {roomView === 'voice' ? (
          <section key="voice-stage" className="animate-stage-enter pt-2 border-t border-black/10 dark:border-white/10 space-y-2.5 sm:space-y-3">
            {/* Voice Stage Header + Mic Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 min-w-0">
              <div className="space-y-0.5 min-w-0">
                <h2 className={`text-sm sm:text-base font-extrabold flex items-center gap-2 ${bgTheme.headerTextClass}`}>
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="truncate">منصة المايكات الصوتية ({caps.maxMics} مايك)</span>
                </h2>
                <p className={`text-[11px] sm:text-xs ${isDarkBg ? 'text-slate-300' : 'text-slate-500'}`}>
                  المتحدثون: {room.seats.filter((s) => s.playerId && !s.isMuted).length} · الجالسون:{' '}
                  {room.seats.filter((s) => s.playerId).length}/{caps.maxMics}
                  {room.tier === 'basic' && nextLevelSpec
                    ? ` · المستوى ${nextLevelSpec.level} يفتح مايك بالأسفل (${nextLevelSpec.maxMics})`
                    : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-full">
                {canControlMics && (
                  <button
                    type="button"
                    onClick={handleToggleMicsLock}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                      room.micsLocked
                        ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700'
                        : 'bg-white/95 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    {room.micsLocked ? (
                      <Unlock className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{room.micsLocked ? 'فتح المايكات' : 'قفل المايكات'}</span>
                  </button>
                )}

                {mySeat ? (
                  <>
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl cursor-pointer transition-colors ${
                        mySeat.forceMuted
                          ? 'bg-rose-600 text-white hover:bg-rose-700'
                          : micActive
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-white/95 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700'
                      }`}
                    >
                      {micActive && !mySeat.forceMuted ? (
                        <Mic className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <MicOff className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {mySeat.forceMuted
                          ? 'مكتوم من الإدارة'
                          : micActive
                            ? 'المايك مفتوح'
                            : 'فتح المايك'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => send({ type: 'seat:leave' })}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                        isDarkBg
                          ? 'border-white/20 text-slate-200 hover:bg-white/10'
                          : 'border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-200 bg-white/80'
                      }`}
                    >
                      نزول
                    </button>
                  </>
                ) : (
                  <span className={`text-[11px] sm:text-xs font-semibold ${isDarkBg ? 'text-slate-300' : 'text-slate-600'}`}>
                    اضغط على أي مقعد فارغ للصعود
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    soundFx.tap();
                    setRoomView('game');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer max-w-full min-w-0"
                >
                  <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">ساحة اللعب ({activeGameMeta.titleAr})</span>
                </button>
              </div>
            </div>

            {/* Selected Seat Quick Moderation & Report Bar */}
            {(() => {
              const targetSeat =
                selectedSeatIdx !== null
                  ? room.seats.find((s) => s.index === selectedSeatIdx && s.playerId && s.playerId !== profile.id)
                  : undefined;
              if (!targetSeat || !targetSeat.playerId) return null;
              const tUid = targetSeat.playerId;
              const tName = targetSeat.playerName || 'عضو';
              const tRole = getMemberRole(tUid);
              const tMuted = Boolean(targetSeat.forceMuted || targetSeat.isMuted);
              const allowMute = canMuteTarget(tUid);
              const allowKick = canKickTarget(tUid);
              const allowModBtn =
                canAssignMod && !targetSeat.isOwnerSeat && !(myStaffRole === 'cohost' && tRole === 'cohost');
              const allowCohostBtn = canAssignCohost && !targetSeat.isOwnerSeat && caps.maxCoHosts > 0;

              return (
                <div className="bg-white/95 dark:bg-slate-900/95 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[#141824] dark:text-white shadow-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <AvatarBadge avatarId={targetSeat.avatar} size={26} />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold truncate">{tName}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        مايك #{targetSeat.index + 1} ·{' '}
                        {tRole === 'owner'
                          ? 'صاحب الغرفة'
                          : tRole === 'cohost'
                            ? 'نائب الغرفة'
                            : tRole === 'moderator'
                              ? 'مشرف'
                              : 'ضيف'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {allowMute && (
                      <button
                        type="button"
                        onClick={() => handleMuteMember(tUid, tName, !tMuted)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${
                          tMuted
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {tMuted ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                        <span>{tMuted ? 'إلغاء الكتم' : 'كتم المايك'}</span>
                      </button>
                    )}
                    {canControlMics && !targetSeat.isOwnerSeat && (
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleSeatLock(targetSeat.index, Boolean(targetSeat.isLocked))
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 cursor-pointer"
                      >
                        {targetSeat.isLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        <span>{targetSeat.isLocked ? 'فتح المقعد' : 'قفل المقعد'}</span>
                      </button>
                    )}
                    {allowModBtn && (
                      <button
                        type="button"
                        onClick={() =>
                          handleAssignStaff(tUid, tName, tRole === 'moderator' ? null : 'moderator')
                        }
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${
                          tRole === 'moderator'
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        }`}
                      >
                        {tRole === 'moderator' ? 'إزالة مشرف' : 'تعيين مشرف'}
                      </button>
                    )}
                    {allowCohostBtn && (
                      <button
                        type="button"
                        onClick={() =>
                          handleAssignStaff(tUid, tName, tRole === 'cohost' ? null : 'cohost')
                        }
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg cursor-pointer ${
                          tRole === 'cohost'
                            ? 'bg-amber-600 text-white'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {tRole === 'cohost' ? 'إزالة نائب' : 'تعيين نائب'}
                      </button>
                    )}
                    {allowKick && (
                      <button
                        type="button"
                        onClick={() => handleKickMember(tUid, tName)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                      >
                        <UserX className="w-3 h-3" />
                        <span>طرد</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        soundFx.tap();
                        setReportingMessage(null);
                        setReportingUser({ id: tUid, name: tName });
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg cursor-pointer"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>إبلاغ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSeatIdx(null)}
                      className="px-2 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Acoustic Voice Stage: Top VIP Tier (Always 2 Mics) + Bottom Audience Grid (Level-ups Unlock Here) */}
            <div
              className={`rounded-2xl p-2 sm:p-3.5 border space-y-2.5 sm:space-y-3 ${
                isDarkBg
                  ? 'border-white/12 bg-white/[0.04]'
                  : 'border-slate-200/80 bg-slate-50/70'
              }`}
            >
              {/* Tier 1: Top VIP Row (Strictly Owner + Main Mic 2) */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3.5 max-w-xl mx-auto items-stretch">
                {vipTopSeats.map((seat) => renderSeatCard(seat, 'vip'))}
              </div>

              <div className="flex items-center gap-2 px-1">
                <div className={`h-px flex-1 ${isDarkBg ? 'bg-white/10' : 'bg-slate-200'}`} />
                <span className={`text-[10px] font-bold font-mono-num ${isDarkBg ? 'text-slate-300' : 'text-slate-500'}`}>
                  مقاعد الغرفة ({bottomAudienceSeats.length} مايكات)
                </span>
                <div className={`h-px flex-1 ${isDarkBg ? 'bg-white/10' : 'bg-slate-200'}`} />
              </div>

              {/* Tier 2: Bottom Audience Rows — every level-up unlocks mics strictly below */}
              {bottomAudienceSeats.length === 9 ? (
                <div className="space-y-1.5 sm:space-y-2.5">
                  <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
                    {bottomAudienceSeats.slice(0, 4).map((seat) => renderSeatCard(seat, 'standard'))}
                  </div>
                  <div className="grid grid-cols-5 gap-1 sm:gap-2.5">
                    {bottomAudienceSeats.slice(4, 9).map((seat) => renderSeatCard(seat, 'standard'))}
                  </div>
                </div>
              ) : bottomAudienceSeats.length === 10 ? (
                <div className="grid grid-cols-5 gap-1 sm:gap-2.5">
                  {bottomAudienceSeats.map((seat) => renderSeatCard(seat, 'standard'))}
                </div>
              ) : bottomAudienceSeats.length >= 12 ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 sm:gap-2.5">
                  {bottomAudienceSeats.map((seat) => renderSeatCard(seat, 'standard'))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
                  {bottomAudienceSeats.map((seat) => renderSeatCard(seat, 'standard'))}
                </div>
              )}
            </div>
          </section>
        ) : (
          <div key="game-stage" className="animate-stage-enter pt-2 border-t border-black/10 dark:border-white/10 space-y-3">
            {/* Compact Horizontal Mics Strip right above Game Stage */}
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`text-xs font-extrabold flex items-center gap-2 ${bgTheme.headerTextClass}`}>
                  <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>مايكات الغرفة ({room.seats.filter((s) => s.playerId).length}/{caps.maxMics})</span>
                  <span aria-hidden="true" className="opacity-50">·</span>
                  <span className={`font-semibold text-[11px] ${isDarkBg ? 'text-slate-300' : 'text-slate-500'}`}>
                    اضغط على أي مايك فارغ للصعود أثناء اللعب
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {canControlMics && (
                    <button
                      type="button"
                      onClick={handleToggleMicsLock}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                        room.micsLocked
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'bg-white/95 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {room.micsLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      <span>{room.micsLocked ? 'فتح المايكات' : 'قفل المايكات'}</span>
                    </button>
                  )}
                  {mySeat && (
                    <>
                      <button
                        type="button"
                        onClick={toggleMic}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-lg cursor-pointer transition-colors ${
                          mySeat.forceMuted
                            ? 'bg-rose-600 text-white hover:bg-rose-700'
                            : micActive
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-white/95 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {micActive && !mySeat.forceMuted ? (
                          <Mic className="w-3 h-3" />
                        ) : (
                          <MicOff className="w-3 h-3" />
                        )}
                        <span>
                          {mySeat.forceMuted
                            ? 'مكتوم'
                            : micActive
                              ? 'المايك مفتوح'
                              : 'فتح المايك'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => send({ type: 'seat:leave' })}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer ${
                          isDarkBg
                            ? 'border-white/20 text-slate-200 hover:bg-white/10'
                            : 'border-slate-200 text-slate-600 hover:text-rose-600 bg-white/80'
                        }`}
                      >
                        نزول
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      setRoomView('voice');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold rounded-lg bg-[#141824] dark:bg-blue-600 text-white hover:opacity-90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Mic className="w-3 h-3" />
                    <span>عرض الميكات كاملة</span>
                  </button>
                </div>
              </div>

              <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
                {room.seats.map((seat) => renderSeatCard(seat, 'compact'))}
              </div>
            </section>

            {/* Active Game Control Bar inside Game Stage */}
            <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-2xl px-3.5 py-2.5 space-y-2 shadow-2xs text-[#141824] dark:text-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: activeGameMeta.accentHex }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-extrabold text-[#141824] dark:text-white">
                        {activeGameMeta.titleAr}
                      </span>
                      <span className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                        {activeGameMeta.playersRange} · {activeGameMeta.durationLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      setGameFocusMode((v) => !v);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      gameFocusMode
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {gameFocusMode ? (
                      <>
                        <Minimize2 className="w-3 h-3" />
                        <span>إظهار الدردشة</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-3 h-3" />
                        <span>توسيع العرض</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      setGameRulesOpen((v) => !v);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      gameRulesOpen
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>قواعد سريعة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundFx.tap();
                      setInlineGamePickerOpen((v) => !v);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      inlineGamePickerOpen
                        ? 'bg-amber-500 text-white'
                        : 'bg-[#141824] dark:bg-blue-600 text-white hover:opacity-90'
                    }`}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>{canManageGames ? 'تبديل اللعبة' : 'قائمة الألعاب'}</span>
                    {inlineGamePickerOpen ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              {gameRulesOpen && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {activeGameMeta.rulesAr.map((rule, rIdx) => (
                    <p key={rIdx} className="leading-relaxed">
                      · {rule}
                    </p>
                  ))}
                </div>
              )}

              {inlineGamePickerOpen && (
                <div className="animate-stage-enter pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {BASIC_ROOM_GAMES.map((gt: GameType) => {
                      const meta = GAME_CATALOG[gt];
                      const isAllowed = caps.allowedGames.includes(gt);
                      const isActive = room.gameType === gt;
                      return (
                        <button
                          key={gt}
                          type="button"
                          onClick={() => {
                            soundFx.tap();
                            if (!isAllowed) {
                              showNotice('هذه اللعبة متاحة في الغرفة الأساسية الدائمة فقط');
                              return;
                            }
                            if (!canManageGames) {
                              showNotice('تبديل اللعبة متاح لصاحب الغرفة أو النائب فقط');
                              return;
                            }
                            if (!isActive) {
                              send({ type: 'room:switch_game', gameType: gt });
                              if (room.tier === 'basic' && isOwner) {
                                persistBasicRoomAppearance(room.code, { activeGame: gt }).catch(() => {});
                              }
                            }
                            setInlineGamePickerOpen(false);
                          }}
                          className={`p-2 rounded-xl border text-right flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            isActive
                              ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/35 text-[#141824] dark:text-white'
                              : isAllowed && canManageGames
                                ? 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 text-[#141824] dark:text-white'
                                : 'border-slate-200/70 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 text-slate-400 opacity-75'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: meta.accentHex }}
                            />
                            <span className="text-[11px] font-extrabold truncate">{meta.titleAr}</span>
                          </span>
                          {isActive ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          ) : !isAllowed ? (
                            <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {!canManageGames && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      تبديل اللعبة متاح لصاحب الغرفة أو النائب فقط.
                    </p>
                  )}
                </div>
              )}
            </div>

            {room.gameType === 'ludo' && <LudoGame room={room} playerId={profile.id} isHost={canManageGames} send={send} />}
            {room.gameType === 'snakes' && <SnakesGame room={room} playerId={profile.id} isHost={canManageGames} send={send} />}
            {room.gameType === 'bank' && <BankGame room={room} playerId={profile.id} isHost={canManageGames} send={send} />}
            {room.gameType === 'jackaroo' && <JackarooGame room={room} playerId={profile.id} isHost={canManageGames} send={send} />}
            {room.gameType === 'draw' && <DrawGame room={room} playerId={profile.id} isHost={canManageGames} send={send} />}
            {room.gameType === 'racing' && <RacingGame room={room} playerId={profile.id} isHost={canManageGames} send={send} />}
            {room.gameType === 'spy' && (
              <SpyGame
                room={room}
                playerId={profile.id}
                isHost={canManageGames}
                send={send}
                onReportMessage={(target) => {
                  setReportingUser({ id: target.id, name: target.name });
                  setReportingMessage({ id: target.messageId, text: target.text });
                }}
              />
            )}
            {room.gameType === 'trivia' && <TriviaGame room={room} playerId={profile.id} isHost={canManageGames} send={send} />}
          </div>
        )}

        {/* 6. Compact Coordinated Chat & Gifts Dock Directly Below Mics/Stage Inside the Room */}
        {!(roomView === 'game' && gameFocusMode) && (
          <section
            aria-label="دردشة وهدايا الغرفة"
            className={`rounded-2xl border flex flex-col overflow-hidden transition-all duration-200 shadow-2xs ${
              giftOpen ? 'h-[410px] sm:h-[430px]' : 'h-[245px] sm:h-[275px]'
            } ${
              isDarkBg
                ? 'bg-slate-950/65 border-white/12 text-white backdrop-blur-sm'
                : 'bg-white/95 dark:bg-slate-900/95 border-slate-200/90 dark:border-slate-800 text-[#141824] dark:text-white'
            }`}
          >
            <div
              className={`px-3.5 py-2 border-b flex items-center justify-between gap-2 ${
                isDarkBg ? 'border-white/10 bg-white/[0.03]' : 'border-slate-100 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-xs sm:text-sm font-extrabold truncate">
                  دردشة وهدايا الغرفة
                </h2>
                <span
                  className={`text-[10px] font-mono-num px-1.5 py-0.5 rounded-md shrink-0 ${
                    isDarkBg
                      ? 'bg-white/10 text-slate-200'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {room.messages.length}
                </span>
                {totalGiftLikes > 0 && (
                  <span className="text-[10px] font-semibold text-rose-500 dark:text-rose-400 inline-flex items-center gap-1 shrink-0">
                    <Heart className="w-3 h-3 fill-current" />
                    <span className="font-mono-num">{totalGiftLikes}</span>
                  </span>
                )}
              </div>
              <span className="text-[11px] font-mono-num font-bold text-amber-600 dark:text-amber-400 shrink-0">
                {profile.coins.toLocaleString('en-US')} عملة
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
              {room.messages.length === 0 && (
                <p className={`py-8 text-center text-xs ${isDarkBg ? 'text-slate-400' : 'text-slate-400'}`}>
                  ابدأ المحادثة مع أعضاء الغرفة أو أرسل تفاعلاً أو هدية
                </p>
              )}
              {room.messages.map((msg) => {
                if (msg.type === 'system') {
                  return (
                    <p
                      key={msg.id}
                      className={`text-[10px] text-center py-0.5 ${
                        isDarkBg ? 'text-slate-300/80' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {msg.text}
                    </p>
                  );
                }
                if (msg.type === 'guess_correct') {
                  return (
                    <div
                      key={msg.id}
                      className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-200 rounded-lg px-2.5 py-1.5 text-[11px] font-bold flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 break-words">
                        {msg.senderName}: {msg.text}
                      </span>
                      {msg.senderId !== profile.id && (
                        <button
                          type="button"
                          title="إبلاغ عن هذه الرسالة"
                          onClick={() => {
                            soundFx.tap();
                            setReportingUser({ id: msg.senderId, name: msg.senderName });
                            setReportingMessage({ id: msg.id, text: msg.text });
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/70 hover:bg-rose-100 rounded border border-rose-200 dark:border-rose-800 shrink-0 cursor-pointer"
                        >
                          <Flag className="w-2.5 h-2.5" />
                          <span>إبلاغ</span>
                        </button>
                      )}
                    </div>
                  );
                }
                if (msg.type === 'gift') {
                  const likedBy = msg.likedBy || [];
                  const likedByMe = likedBy.includes(profile.id);
                  return (
                    <div
                      key={msg.id}
                      className={`border rounded-lg px-2.5 py-1.5 text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                        isDarkBg
                          ? 'bg-amber-500/15 border-amber-400/30 text-amber-100'
                          : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="font-bold leading-snug">
                          {msg.senderName} {msg.text}
                        </span>
                        {Boolean(msg.paybackCoins && msg.paybackCoins > 0) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-200/90 dark:bg-amber-900/80 text-amber-950 dark:text-amber-100 border border-amber-300 dark:border-amber-700">
                            <span>🎁 +{msg.paybackCoins}</span>
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.tap();
                          send({ type: 'gift:like', messageId: msg.id });
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer shrink-0 ${
                          likedByMe
                            ? 'bg-rose-600 text-white'
                            : 'bg-white/85 dark:bg-slate-800 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60'
                        }`}
                      >
                        <Heart className={`w-2.5 h-2.5 ${likedByMe ? 'fill-current' : ''}`} />
                        <span className="font-mono-num">{likedBy.length}</span>
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={msg.id} className="flex items-start gap-2">
                    <AvatarBadge avatarId={msg.senderAvatar} size={24} />
                    <div
                      className={`min-w-0 flex-1 rounded-xl px-2.5 py-1.5 ${
                        isDarkBg ? 'bg-white/10' : 'bg-slate-50 dark:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={`text-[10px] font-bold ${
                            isDarkBg ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {msg.senderName}
                        </p>
                        {msg.senderId !== profile.id && (
                          <button
                            type="button"
                            title="إبلاغ عن هذه الرسالة أو الشتيمة مباشرة"
                            onClick={() => {
                              soundFx.tap();
                              setReportingUser({ id: msg.senderId, name: msg.senderName });
                              setReportingMessage({ id: msg.id, text: msg.text });
                            }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer shrink-0"
                          >
                            <Flag className="w-2.5 h-2.5" />
                            <span>إبلاغ</span>
                          </button>
                        )}
                      </div>
                      <p
                        className={`text-xs break-words leading-snug ${
                          isDarkBg ? 'text-white' : 'text-[#141824] dark:text-slate-100'
                        }`}
                      >
                        {msg.text}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* 51 Voice-Room-Only Gifts Organized by 7 Price Tiers + Favorites */}
            {giftOpen && (
              <div
                className={`border-t p-2.5 space-y-2 ${
                  isDarkBg
                    ? 'bg-slate-900/95 border-white/12 text-white'
                    : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className={`flex items-center justify-between text-[10px] ${isDarkBg ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'}`}>
                  <span className="font-bold">هدايا الغرفة (مردود عشوائي حتى 1000 عملة)</span>
                  <span>كل 10 عملات = نقطة مستوى</span>
                </div>
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setGiftTierTab('fav')}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md shrink-0 cursor-pointer ${
                      giftTierTab === 'fav'
                        ? 'bg-rose-600 text-white'
                        : 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Heart className="w-3 h-3 fill-current" />
                    <span>المفضلة ({favGiftIds.length})</span>
                  </button>
                  {GIFT_TIERS.map((cost) => (
                    <button
                      key={cost}
                      type="button"
                      onClick={() => setGiftTierTab(cost)}
                      className={`px-2 py-1 text-[10px] font-mono-num font-bold rounded-md shrink-0 cursor-pointer ${
                        giftTierTab === cost
                          ? 'bg-[#141824] dark:bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {cost}
                    </button>
                  ))}
                </div>
                {displayedGifts.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
                    اضغط على علامة القلب أعلى أي هدية لإضافتها لقائمة الهدايا المفضلة
                  </p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto">
                    {displayedGifts.map((g) => {
                      const isFav = favGiftIds.includes(g.id);
                      const maxPayback = getMaxGiftPayback(g.cost);
                      return (
                        <div
                          key={g.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => void handleSendGift(g)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void handleSendGift(g);
                            }
                          }}
                          className="relative p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-400 rounded-lg flex flex-col items-center gap-0.5 cursor-pointer text-[#141824] dark:text-white"
                        >
                          <button
                            type="button"
                            aria-label={isFav ? 'إزالة من المفضلة' : 'إعجاب بالهدية'}
                            onClick={(e) => toggleFavoriteGift(g.id, e)}
                            className={`absolute top-1 left-1 p-0.5 rounded cursor-pointer ${
                              isFav
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-300 dark:text-slate-600 hover:text-rose-500'
                            }`}
                          >
                            <Heart className={`w-2.5 h-2.5 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                          <span className="text-base">{g.emoji}</span>
                          <span className="text-[10px] font-bold truncate w-full text-center">
                            {g.name}
                          </span>
                          <span className="text-[10px] font-mono-num font-bold text-amber-700 dark:text-amber-400">
                            {g.cost} 🪙
                          </span>
                          {maxPayback > 0 && (
                            <span className="text-[8px] font-bold px-1 py-0.5 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 rounded border border-emerald-300 dark:border-emerald-700 leading-none">
                              حتى {maxPayback}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Reactions, Gift Toggle & Message Input */}
            <div
              className={`px-3 py-2 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                isDarkBg
                  ? 'border-white/10 bg-white/[0.03]'
                  : 'border-slate-100 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between sm:justify-start gap-1 overflow-x-auto">
                <div className="flex items-center gap-0.5">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        soundFx.tap();
                        send({ type: 'reaction:send', emoji });
                      }}
                      className={`w-7 h-7 rounded-md text-sm flex items-center justify-center cursor-pointer ${
                        isDarkBg ? 'hover:bg-white/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setGiftOpen((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer shrink-0 ${
                    giftOpen
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                  }`}
                >
                  <Gift className="w-3 h-3" />
                  <span>هدايا (51)</span>
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatText.trim()) return;
                  soundFx.tap();
                  send({ type: 'chat:send', text: chatText.trim() });
                  setChatText('');
                }}
                className="flex-1 min-w-0 w-full sm:w-auto flex gap-1.5"
              >
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder={
                    room.gameType === 'draw' && room.draw.phase === 'DRAWING'
                      ? 'اكتب تخمينك هنا...'
                      : 'اكتب رسالة للغرفة...'
                  }
                  className={`flex-1 min-w-0 px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:border-blue-600 ${
                    isDarkBg
                      ? 'border-white/20 bg-white/10 text-white placeholder:text-slate-300/70'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#141824] dark:text-white'
                  }`}
                  maxLength={180}
                />
                <button
                  type="submit"
                  aria-label="إرسال"
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </section>
        )}
      </div>

      {confirmKickTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد طرد المستخدم من الغرفة"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <UserX className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-[#141824] dark:text-white">
                  تأكيد طرد المستخدم من الغرفة
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  اختر مدة منع{' '}
                  <span className="font-extrabold text-[#141824] dark:text-white">
                    «{confirmKickTarget.name}»
                  </span>{' '}
                  ({confirmKickTarget.roleLabel}) من العودة إلى الغرفة بعد إخراجه:
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => confirmExecuteKick(5)}
                className="w-full inline-flex items-center justify-between px-4 py-2.5 text-xs font-bold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-xl cursor-pointer transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <UserX className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>تأكيد الطرد لمدة 5 دقائق</span>
                </span>
                <span className="text-[11px] font-mono-num text-rose-600 dark:text-rose-400">
                  5 د
                </span>
              </button>

              <button
                type="button"
                onClick={() => confirmExecuteKick(60)}
                className="w-full inline-flex items-center justify-between px-4 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <UserX className="w-4 h-4" />
                  <span>تأكيد الطرد لمدة ساعة</span>
                </span>
                <span className="text-[11px] font-mono-num text-rose-100">
                  1 س
                </span>
              </button>

              <button
                type="button"
                onClick={() => confirmExecuteKick(1440)}
                className="w-full inline-flex items-center justify-between px-4 py-2.5 text-xs font-bold text-white bg-rose-800 hover:bg-rose-900 rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <UserX className="w-4 h-4" />
                  <span>تأكيد الطرد لمدة 24 ساعة</span>
                </span>
                <span className="text-[11px] font-mono-num text-rose-200">
                  24 س
                </span>
              </button>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  soundFx.tap();
                  setConfirmKickTarget(null);
                }}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
