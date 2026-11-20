import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  BANK_BOARD_TILES,
  DRAW_WORDS,
  FREE_ROOM_DURATION_MS,
  GIFT_ITEMS,
  SNAKES_LADDERS_MAP,
  SPY_WORD_PAIRS,
  TRIVIA_QUESTIONS,
  calculateGiftPayback,
  getMaxGiftPayback,
  getRoomCapabilities,
} from './src/shared/gameCatalog.ts';
import type {
  AvatarId,
  BankGameState,
  ChatMessage,
  DrawGameState,
  DrawStroke,
  GameType,
  JackarooGameState,
  LudoColor,
  LudoGameState,
  LudoPlayerState,
  RacingGameState,
  RoomFullState,
  RoomMember,
  RoomSummary,
  RoomTier,
  Seat,
  SnakesGameState,
  SpyGameState,
  StaffRole,
  TriviaGameState,
  UserPresenceInfo,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

interface InternalSpyState {
  phase: SpyGameState['phase'];
  round: number;
  category: string;
  civilianWord: string;
  spyWord: string;
  spyIds: string[];
  playerWords: Record<string, string>;
  turnOrder: string[];
  currentTurnPlayerId: string | null;
  clues: SpyGameState['clues'];
  votes: Record<string, string>;
  eliminatedPlayerId: string | null;
  winner: SpyGameState['winner'];
}

interface InternalDrawState {
  phase: DrawGameState['phase'];
  drawerId: string | null;
  drawerName: string | null;
  wordChoices: string[];
  actualWord: string;
  timeLeft: number;
  strokes: DrawStroke[];
  guessedPlayerIds: string[];
  scores: Record<string, number>;
  round: number;
  maxRounds: number;
  drawerRotationIndex: number;
}

interface InternalTriviaState {
  phase: TriviaGameState['phase'];
  round: number;
  maxRounds: number;
  questionPoolIndices: number[];
  currentQuestionIndex: number;
  timeLeft: number;
  answers: Record<string, { optionIndex: number; isCorrect: boolean; points: number }>;
  scores: Record<string, number>;
}

interface InternalRoom {
  id: string;
  code: string;
  title: string;
  tier: RoomTier;
  isPinnedId: boolean;
  xp: number;
  backgroundIndex: number;
  expiresAtMs: number;
  gameType: GameType;
  hostId: string;
  permanentOwnerId?: string;
  isPrivate: boolean;
  isLocked: boolean;
  lockPin: string;
  micsLocked: boolean;
  mutedUsers: Set<string>;
  kickedUsers: Record<string, number>;
  isOfficial: boolean;
  staff: Record<string, 'moderator' | 'cohost'>;
  seats: Seat[];
  members: Map<string, RoomMember>;
  messages: ChatMessage[];
  ludo: LudoGameState;
  snakes: SnakesGameState;
  bank: BankGameState;
  jackaroo: JackarooGameState;
  draw: InternalDrawState;
  racing: RacingGameState;
  spy: InternalSpyState;
  trivia: InternalTriviaState;
  cleanupTimeout?: NodeJS.Timeout;
  drawTimer?: NodeJS.Timeout;
  triviaTimer?: NodeJS.Timeout;
  botTimer?: NodeJS.Timeout;
  racingTimer?: NodeJS.Timeout;
  boardTurnTimer?: NodeJS.Timeout;
}

interface ClientConn {
  ws: WebSocket;
  playerId: string;
  name: string;
  avatar: AvatarId;
  roomId: string | null;
  watchedUids: Set<string>;
  hideOnline: boolean;
  hideRoom: boolean;
}

const clients = new Map<WebSocket, ClientConn>();
const lastSeenByUid = new Map<string, number>();
const privacyHiddenOnlineUids = new Set<string>();
const rooms = new Map<string, InternalRoom>();

const LUDO_COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];
const LUDO_START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};
const LUDO_SAFE_GLOBAL_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const PLAYER_COLORS = ['#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#0D9488'];
const JACKAROO_DECK = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const BOARD_TURN_SECONDS = 25;

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateTempRoomCode(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const code = `TMP${digits}`;
  if (rooms.has(code)) return generateTempRoomCode();
  return code;
}

function createSeats(count: number): Seat[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    isOwnerSeat: index === 0,
    playerId: null,
    playerName: null,
    avatar: null,
    staffRole: 'guest',
    isBot: false,
    isMuted: false,
    forceMuted: false,
    isLocked: false,
    isSpeaking: false,
  }));
}

function resizeSeatsForRoom(room: InternalRoom) {
  const caps = getRoomCapabilities(room.tier, room.xp);
  const target = caps.maxMics;
  if (room.seats.length < target) {
    for (let i = room.seats.length; i < target; i++) {
      room.seats.push({
        index: i,
        isOwnerSeat: i === 0,
        playerId: null,
        playerName: null,
        avatar: null,
        staffRole: 'guest',
        isBot: false,
        isMuted: false,
        forceMuted: false,
        isLocked: i >= 1 ? room.micsLocked : false,
        isSpeaking: false,
      });
    }
  }
}

function createInitialSpy(): InternalSpyState {
  return {
    phase: 'LOBBY',
    round: 1,
    category: '',
    civilianWord: '',
    spyWord: '',
    spyIds: [],
    playerWords: {},
    turnOrder: [],
    currentTurnPlayerId: null,
    clues: [],
    votes: {},
    eliminatedPlayerId: null,
    winner: null,
  };
}

function createInitialDraw(): InternalDrawState {
  return {
    phase: 'LOBBY',
    drawerId: null,
    drawerName: null,
    wordChoices: [],
    actualWord: '',
    timeLeft: 60,
    strokes: [],
    guessedPlayerIds: [],
    scores: {},
    round: 1,
    maxRounds: 4,
    drawerRotationIndex: 0,
  };
}

function createInitialLudo(): LudoGameState {
  return {
    phase: 'LOBBY',
    players: [],
    currentTurnIndex: 0,
    diceValue: null,
    hasRolled: false,
    movableTokenIndices: [],
    winnerId: null,
    lastEventText: 'بانتظار بدء السباق',
    turnTimeLeft: BOARD_TURN_SECONDS,
    turnDuration: BOARD_TURN_SECONDS,
  };
}

function createInitialSnakes(): SnakesGameState {
  return {
    phase: 'LOBBY',
    players: [],
    currentTurnIndex: 0,
    diceValue: null,
    winnerId: null,
    lastEventText: 'بانتظار بدء السلم والثعبان',
    turnTimeLeft: BOARD_TURN_SECONDS,
    turnDuration: BOARD_TURN_SECONDS,
  };
}

function createInitialBank(): BankGameState {
  return {
    phase: 'LOBBY',
    players: [],
    owners: {},
    buildings: {},
    currentTurnIndex: 0,
    diceValue: null,
    awaitingBuyTile: null,
    winnerId: null,
    lastEventText: 'بانتظار بدء بنك الحظ',
    turnTimeLeft: BOARD_TURN_SECONDS,
    turnDuration: BOARD_TURN_SECONDS,
  };
}

function createInitialJackaroo(): JackarooGameState {
  return {
    phase: 'LOBBY',
    players: [],
    currentTurnIndex: 0,
    selectedCard: null,
    lastPlayedCard: null,
    winnerId: null,
    lastEventText: 'بانتظار بدء چاكارو',
    turnTimeLeft: BOARD_TURN_SECONDS,
    turnDuration: BOARD_TURN_SECONDS,
  };
}

function createInitialRacing(): RacingGameState {
  return {
    phase: 'LOBBY',
    countdown: 3,
    players: [],
    winnerId: null,
    lastEventText: 'بانتظار انطلاق سباق السيارات',
  };
}

function createInitialTrivia(): InternalTriviaState {
  return {
    phase: 'LOBBY',
    round: 0,
    maxRounds: 8,
    questionPoolIndices: [],
    currentQuestionIndex: 0,
    timeLeft: 15,
    answers: {},
    scores: {},
  };
}

function createRoom(opts: {
  code?: string;
  title: string;
  tier: RoomTier;
  xp?: number;
  backgroundIndex?: number;
  gameType: GameType;
  hostId: string;
  permanentOwnerId?: string;
  isPrivate?: boolean;
  isLocked?: boolean;
  lockPin?: string;
  isOfficial?: boolean;
}): InternalRoom {
  const tier = opts.tier;
  const xp = tier === 'basic' ? opts.xp || 0 : 0;
  const caps = getRoomCapabilities(tier, xp);
  const code = opts.code || generateTempRoomCode();
  const allowed = caps.allowedGames;
  const initialGame = allowed.includes(opts.gameType) ? opts.gameType : allowed[0];

  const room: InternalRoom = {
    id: code,
    code,
    title: opts.title,
    tier,
    isPinnedId: tier === 'basic',
    xp,
    backgroundIndex: opts.backgroundIndex || 0,
    expiresAtMs: tier === 'free' && !opts.isOfficial ? Date.now() + FREE_ROOM_DURATION_MS : 0,
    gameType: initialGame,
    hostId: opts.hostId,
    permanentOwnerId:
      tier === 'basic' && !opts.isOfficial ? opts.permanentOwnerId || opts.hostId : undefined,
    isPrivate: Boolean(opts.isPrivate),
    isLocked: tier === 'basic' ? Boolean(opts.isLocked) : false,
    lockPin: tier === 'basic' ? (opts.lockPin || '').trim().slice(0, 16) : '',
    micsLocked: false,
    mutedUsers: new Set<string>(),
    kickedUsers: {},
    isOfficial: Boolean(opts.isOfficial),
    staff: {},
    seats: createSeats(caps.maxMics),
    members: new Map(),
    messages: [
      {
        id: uid('msg'),
        senderId: 'system',
        senderName: 'النظام',
        senderAvatar: 'falcon',
        text:
          tier === 'basic'
            ? `أهلاً بكم في الغرفة الأساسية الدائمة "${opts.title}" · رقم مثبت ${code}`
            : `أهلاً بكم في الغرفة الصوتية المجانية "${opts.title}" · تقفل تلقائياً بعد 6 ساعات`,
        type: 'system',
        timestamp: Date.now(),
      },
    ],
    ludo: createInitialLudo(),
    snakes: createInitialSnakes(),
    bank: createInitialBank(),
    jackaroo: createInitialJackaroo(),
    draw: createInitialDraw(),
    racing: createInitialRacing(),
    spy: createInitialSpy(),
    trivia: createInitialTrivia(),
  };
  rooms.set(room.id, room);
  return room;
}

function seedOfficialRooms() {
  createRoom({
    code: 'ID1001',
    title: 'الغرفة الصوتية · لودو يلا',
    tier: 'basic',
    xp: 0,
    gameType: 'ludo',
    hostId: 'official',
    isOfficial: true,
  });
  createRoom({
    code: 'TMP2002',
    title: 'غرفة مجانية · السلم والثعبان',
    tier: 'free',
    gameType: 'snakes',
    hostId: 'official',
    isOfficial: true,
  });
  createRoom({
    code: 'ID3003',
    title: 'صالة بنك الحظ وچاكارو',
    tier: 'basic',
    xp: 6200, // Demonstrates Lv4 Basic room capabilities in official lobby
    gameType: 'bank',
    hostId: 'official',
    isOfficial: true,
  });
  createRoom({
    code: 'ID4004',
    title: 'حلبة الرسم وسباق السيارات',
    tier: 'basic',
    xp: 2200,
    gameType: 'draw',
    hostId: 'official',
    isOfficial: true,
  });
}

seedOfficialRooms();

// Periodically expire free rooms after 6 hours
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.tier === 'free' && room.expiresAtMs > 0 && now >= room.expiresAtMs) {
      clearRoomTimers(room);
      for (const [ws, c] of clients.entries()) {
        if (c.roomId === roomId) {
          c.roomId = null;
          sendJson(ws, { type: 'room:left' });
          sendJson(ws, {
            type: 'error',
            message: 'انتهت مدة الغرفة المجانية (6 ساعات) وتم إغلاقها تلقائياً',
          });
        }
      }
      rooms.delete(roomId);
      broadcastRoomsDirectory();
    }
  }
}, 30000);

function getStaffRole(room: InternalRoom, playerId: string): StaffRole {
  if (room.hostId === playerId) return 'owner';
  return room.staff[playerId] || 'guest';
}

function isRoomStaff(role: StaffRole): boolean {
  return role === 'owner' || role === 'cohost' || role === 'moderator';
}

function canKickTarget(actorRole: StaffRole, targetRole: StaffRole): boolean {
  if (targetRole === 'owner') return false;
  if (actorRole === 'owner') return true; // owner: cohost, moderator, guest
  if (actorRole === 'cohost') return targetRole === 'moderator' || targetRole === 'guest';
  if (actorRole === 'moderator') return targetRole === 'guest';
  return false;
}

function canMuteTarget(actorRole: StaffRole, targetRole: StaffRole): boolean {
  if (targetRole === 'owner') return false;
  if (actorRole === 'owner') return true; // owner: cohost, moderator, guest
  if (actorRole === 'cohost') return targetRole === 'moderator' || targetRole === 'guest';
  if (actorRole === 'moderator') return targetRole === 'guest';
  return false;
}

function syncRoleFlags(room: InternalRoom) {
  for (const member of room.members.values()) {
    member.isHost = member.id === room.hostId;
    member.staffRole = getStaffRole(room, member.id);
    member.isForceMuted = room.mutedUsers.has(member.id);
  }
  for (const seat of room.seats) {
    if (seat.playerId) {
      seat.staffRole = getStaffRole(room, seat.playerId);
      seat.forceMuted = room.mutedUsers.has(seat.playerId);
      if (seat.forceMuted) {
        seat.isMuted = true;
        seat.isSpeaking = false;
      }
    } else {
      seat.staffRole = 'guest';
      seat.forceMuted = false;
    }
  }
}

function normalizeArabic(text: string): string {
  return text
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function maskArabicWord(word: string): string {
  if (!word) return '';
  return word
    .split('')
    .map((ch) => (ch === ' ' ? '  ' : '_'))
    .join(' ');
}

function addSystemMessage(room: InternalRoom, text: string) {
  room.messages.push({
    id: uid('msg'),
    senderId: 'system',
    senderName: 'النظام',
    senderAvatar: 'falcon',
    text,
    type: 'system',
    timestamp: Date.now(),
  });
  if (room.messages.length > 80) room.messages = room.messages.slice(-80);
}

function getPublicRoomSummaries(): RoomSummary[] {
  const list: RoomSummary[] = [];
  for (const room of rooms.values()) {
    if (room.isPrivate) continue;
    const caps = getRoomCapabilities(room.tier, room.xp);
    const hostMember = room.members.get(room.hostId);
    const seatedCount = room.seats.filter((s) => s.playerId !== null).length;
    list.push({
      id: room.id,
      code: room.code,
      title: room.title,
      tier: room.tier,
      isPinnedId: room.isPinnedId,
      level: caps.level,
      xp: room.xp,
      gameType: room.gameType,
      hostName: hostMember ? hostMember.name : 'غرفة مفتوحة',
      playerCount: room.members.size,
      seatedCount,
      maxSeats: room.seats.length,
      expiresAtMs: room.expiresAtMs,
      isPrivate: room.isPrivate,
      isLocked: room.isLocked,
      hasLockPin: Boolean(room.lockPin),
      phaseLabel: room.tier === 'basic' ? `المستوى ${caps.level}` : 'مجانية · 6 ساعات',
      isOfficial: room.isOfficial,
    });
  }
  return list.sort((a, b) => b.playerCount - a.playerCount);
}

function serializeRoomForPlayer(room: InternalRoom, playerId: string): RoomFullState {
  const caps = getRoomCapabilities(room.tier, room.xp);
  const isDrawer = room.draw.drawerId === playerId;
  const q = TRIVIA_QUESTIONS[room.trivia.currentQuestionIndex] || TRIVIA_QUESTIONS[0];

  return {
    id: room.id,
    code: room.code,
    title: room.title,
    tier: room.tier,
    isPinnedId: room.isPinnedId,
    level: caps.level,
    xp: room.xp,
    backgroundIndex: room.backgroundIndex,
    expiresAtMs: room.expiresAtMs,
    gameType: room.gameType,
    hostId: room.hostId,
    isPrivate: room.isPrivate,
    isLocked: room.isLocked,
    hasLockPin: Boolean(room.lockPin),
    micsLocked: room.micsLocked,
    staff: room.staff,
    seats: room.seats,
    members: Array.from(room.members.values()),
    messages: room.messages,
    ludo: room.ludo,
    snakes: room.snakes,
    bank: room.bank,
    jackaroo: room.jackaroo,
    racing: room.racing,
    draw: {
      phase: room.draw.phase,
      drawerId: room.draw.drawerId,
      drawerName: room.draw.drawerName,
      wordChoices:
        isDrawer && room.draw.phase === 'CHOOSING_WORD' ? room.draw.wordChoices : undefined,
      maskedWord:
        isDrawer || room.draw.phase === 'ROUND_END'
          ? room.draw.actualWord
          : maskArabicWord(room.draw.actualWord),
      wordLength: room.draw.actualWord.replace(/\s/g, '').length,
      actualWord:
        isDrawer || room.draw.phase === 'ROUND_END' ? room.draw.actualWord : undefined,
      timeLeft: room.draw.timeLeft,
      strokes: room.draw.strokes,
      guessedPlayerIds: room.draw.guessedPlayerIds,
      scores: room.draw.scores,
      round: room.draw.round,
      maxRounds: room.draw.maxRounds,
    },
    spy: {
      phase: room.spy.phase,
      round: room.spy.round,
      category: room.spy.category,
      myWord: room.spy.playerWords[playerId],
      isMeSpy: room.spy.phase === 'RESULT' ? room.spy.spyIds.includes(playerId) : undefined,
      civilianWord: room.spy.phase === 'RESULT' ? room.spy.civilianWord : undefined,
      spyWord: room.spy.phase === 'RESULT' ? room.spy.spyWord : undefined,
      spyIds: room.spy.phase === 'RESULT' ? room.spy.spyIds : undefined,
      turnOrder: room.spy.turnOrder,
      currentTurnPlayerId: room.spy.currentTurnPlayerId,
      clues: room.spy.clues,
      votes: room.spy.votes,
      eliminatedPlayerId: room.spy.eliminatedPlayerId,
      winner: room.spy.winner,
    },
    trivia: {
      phase: room.trivia.phase,
      round: room.trivia.round,
      maxRounds: room.trivia.maxRounds,
      question: q.question,
      category: q.category,
      options: q.options,
      correctIndex:
        room.trivia.phase === 'REVEAL' || room.trivia.phase === 'FINISHED'
          ? q.correctIndex
          : undefined,
      timeLeft: room.trivia.timeLeft,
      answers: room.trivia.answers,
      scores: room.trivia.scores,
    },
  };
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function formatKickDurationLabel(minutes: number): string {
  if (minutes >= 1440) return '24 ساعة';
  if (minutes >= 60) return 'ساعة واحدة';
  return '5 دقائق';
}

function formatRemainingKickTime(kickedUntilMs: number): string {
  const diffMins = Math.max(1, Math.ceil((kickedUntilMs - Date.now()) / 60000));
  if (diffMins >= 60) {
    const hours = Math.ceil(diffMins / 60);
    return hours === 1 ? 'ساعة واحدة' : `${hours} ساعة`;
  }
  return diffMins === 1 ? 'دقيقة واحدة' : `${diffMins} دقيقة`;
}

function computePresenceForUid(uid: string): UserPresenceInfo {
  let activeOnline = false;
  let hideOnline = false;
  let hideRoom = false;
  let activeRoomCandidate: InternalRoom | null = null;

  for (const [, conn] of clients.entries()) {
    if (conn.ws.readyState !== WebSocket.OPEN || conn.playerId !== uid) continue;
    activeOnline = true;
    if (conn.hideOnline) hideOnline = true;
    if (conn.hideRoom) hideRoom = true;
    if (!activeRoomCandidate && conn.roomId) {
      const room = rooms.get(conn.roomId);
      if (room) activeRoomCandidate = room;
    }
  }

  if (hideOnline || (!activeOnline && privacyHiddenOnlineUids.has(uid))) {
    return {
      uid,
      status: 'offline',
      lastSeenMs: 0,
    };
  }

  if (activeOnline && activeRoomCandidate && !hideRoom) {
    return {
      uid,
      status: 'in_room',
      roomCode: activeRoomCandidate.isPrivate ? undefined : activeRoomCandidate.code,
      roomTitle: activeRoomCandidate.isPrivate ? 'غرفة خاصة' : activeRoomCandidate.title,
      isRoomLocked: activeRoomCandidate.isLocked,
      isRoomPrivate: activeRoomCandidate.isPrivate,
    };
  }

  if (activeOnline) {
    return { uid, status: 'online' };
  }
  return {
    uid,
    status: 'offline',
    lastSeenMs: lastSeenByUid.get(uid) || 0,
  };
}

function broadcastPresenceUpdate(uid: string) {
  if (!uid) return;
  const info = computePresenceForUid(uid);
  for (const [sock, conn] of clients.entries()) {
    if (sock.readyState === WebSocket.OPEN && conn.watchedUids.has(uid)) {
      sendJson(sock, { type: 'presence:update', info });
    }
  }
}

function broadcastRoomState(room: InternalRoom) {
  for (const [ws, client] of clients.entries()) {
    if (client.roomId === room.id) {
      sendJson(ws, {
        type: 'room:state',
        room: serializeRoomForPlayer(room, client.playerId),
      });
    }
  }
}

function broadcastRoomsDirectory() {
  const summaries = getPublicRoomSummaries();
  for (const [ws, client] of clients.entries()) {
    if (!client.roomId) {
      sendJson(ws, { type: 'rooms:list', rooms: summaries });
    }
  }
}

function clearBoardTurnTimer(room: InternalRoom) {
  if (room.boardTurnTimer) clearInterval(room.boardTurnTimer);
  room.boardTurnTimer = undefined;
}

function clearRoomTimers(room: InternalRoom) {
  if (room.drawTimer) clearInterval(room.drawTimer);
  if (room.triviaTimer) clearInterval(room.triviaTimer);
  if (room.botTimer) clearTimeout(room.botTimer);
  if (room.racingTimer) clearInterval(room.racingTimer);
  if (room.boardTurnTimer) clearInterval(room.boardTurnTimer);
  room.drawTimer = undefined;
  room.triviaTimer = undefined;
  room.botTimer = undefined;
  room.racingTimer = undefined;
  room.boardTurnTimer = undefined;
}

function startBoardTurnTimer(
  room: InternalRoom,
  game: 'ludo' | 'snakes' | 'bank' | 'jackaroo'
) {
  clearBoardTurnTimer(room);
  const state = room[game];
  if (state.phase !== 'PLAYING') return;

  state.turnDuration = BOARD_TURN_SECONDS;
  state.turnTimeLeft = BOARD_TURN_SECONDS;

  room.boardTurnTimer = setInterval(() => {
    const r = rooms.get(room.id);
    if (!r) return;
    const current = r[game];
    if (current.phase !== 'PLAYING' || r.gameType !== game) {
      clearBoardTurnTimer(r);
      return;
    }

    current.turnTimeLeft = Math.max(0, current.turnTimeLeft - 1);
    if (current.turnTimeLeft > 0) {
      broadcastRoomState(r);
      return;
    }

    clearBoardTurnTimer(r);

    // Time expired -> execute clean automatic turn action so games never hang!
    if (game === 'ludo') {
      const active = r.ludo.players[r.ludo.currentTurnIndex];
      if (!active) return;
      if (!r.ludo.hasRolled) {
        executeLudoRoll(r, active.playerId);
      } else if (r.ludo.movableTokenIndices.length > 0) {
        executeLudoMove(r, active.playerId, r.ludo.movableTokenIndices[0]);
      } else {
        advanceLudoTurn(r);
        broadcastRoomState(r);
      }
    } else if (game === 'snakes') {
      const active = r.snakes.players[r.snakes.currentTurnIndex];
      if (active) executeSnakesRoll(r, active.playerId);
    } else if (game === 'bank') {
      const active = r.bank.players[r.bank.currentTurnIndex];
      if (!active) return;
      if (r.bank.awaitingBuyTile !== null) {
        r.bank.lastEventText = `انتهى وقت ${active.name} وتخطى الشراء`;
        advanceBankTurn(r);
      } else {
        executeBankRoll(r, active.playerId);
      }
    } else if (game === 'jackaroo') {
      const active = r.jackaroo.players[r.jackaroo.currentTurnIndex];
      if (!active) return;
      const opponentsOnTrack = r.jackaroo.players.some(
        (p) => p.playerId !== active.playerId && p.marbles.some((m) => m >= 0 && m <= 51)
      );
      const baseIdx = active.marbles.findIndex((m) => m === -1);
      const akCard = active.hand.find((c) => c === 'A' || c === 'K');
      if (baseIdx !== -1 && akCard) {
        executeJackarooPlay(r, active.playerId, akCard, baseIdx);
        return;
      }
      const activeIdx = active.marbles.findIndex((m) => m >= 0 && m < 55);
      if (activeIdx !== -1) {
        const playable = active.hand.find((c) =>
          canJackarooCardMoveMarble(c, active.marbles[activeIdx], opponentsOnTrack)
        );
        if (playable) {
          executeJackarooPlay(r, active.playerId, playable, activeIdx);
          return;
        }
      }
      const discarded = active.hand.shift() || '5';
      active.hand.push(drawJackarooCard(active.marbles.every((m) => m === -1)));
      r.jackaroo.lastPlayedCard = discarded;
      r.jackaroo.lastEventText = `انتهى وقت ${active.name} · حرق تلقائي لكرت ${discarded}`;
      advanceJackarooTurn(r);
    }
  }, 1000);
}

function seatPlayerInRoom(room: InternalRoom, member: RoomMember, preferredIndex?: number): boolean {
  const existing = room.seats.find((s) => s.playerId === member.id);
  if (existing) return true;

  const role = getStaffRole(room, member.id);
  const isOwner = role === 'owner';
  const isStaff = isRoomStaff(role);
  const isTargetForceMuted = room.mutedUsers.has(member.id);

  let targetSeat: Seat | undefined;
  if (preferredIndex !== undefined && preferredIndex >= 0 && preferredIndex < room.seats.length) {
    if (preferredIndex === 0 && !isOwner) {
      return false; // Seat 0 is reserved for Room Owner!
    }
    const candidate = room.seats[preferredIndex];
    if (candidate.playerId === null) {
      if (candidate.isLocked || (room.micsLocked && preferredIndex > 0)) {
        return false;
      }
      targetSeat = candidate;
    }
  } else if (isOwner && room.seats[0].playerId === null) {
    targetSeat = room.seats[0];
  } else {
    targetSeat = room.seats.find(
      (s) => s.index > 0 && s.playerId === null && !s.isLocked && !room.micsLocked
    );
  }

  if (!targetSeat) return false;
  targetSeat.playerId = member.id;
  targetSeat.playerName = member.name;
  targetSeat.avatar = member.avatar;
  targetSeat.staffRole = role;
  targetSeat.isBot = Boolean(member.isBot);
  targetSeat.isMuted = isTargetForceMuted;
  targetSeat.forceMuted = isTargetForceMuted;
  targetSeat.isSpeaking = false;
  return true;
}

function removePlayerFromRoom(playerId: string, roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const member = room.members.get(playerId);
  room.members.delete(playerId);

  for (const seat of room.seats) {
    if (seat.playerId === playerId) {
      seat.playerId = null;
      seat.playerName = null;
      seat.avatar = null;
      seat.staffRole = 'guest';
      seat.isBot = false;
      seat.isMuted = false;
      seat.forceMuted = false;
      seat.isSpeaking = false;
    }
  }

  if (member) {
    addSystemMessage(room, `غادر ${member.name} الغرفة`);
  }

  const remainingHumans = Array.from(room.members.values()).filter((m) => !m.isBot);
  if (remainingHumans.length === 0) {
    clearRoomTimers(room);
    if (room.isOfficial || room.tier === 'basic') {
      if (room.isOfficial) {
        room.hostId = 'official';
        room.isLocked = false;
        room.lockPin = '';
      }
      room.micsLocked = false;
      room.mutedUsers.clear();
      const caps = getRoomCapabilities(room.tier, room.xp);
      room.seats = createSeats(caps.maxMics);
      room.members.clear();
    } else {
      room.cleanupTimeout = setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && r.members.size === 0 && !r.isOfficial && r.tier === 'free') {
          clearRoomTimers(r);
          rooms.delete(roomId);
          broadcastRoomsDirectory();
        }
      }, 20000);
    }
  } else if (
    (room.hostId === playerId || room.hostId === 'official') &&
    (room.isOfficial || room.tier === 'free' || !room.permanentOwnerId)
  ) {
    room.hostId = remainingHumans[0].id;
    syncRoleFlags(room);
  }

  broadcastRoomState(room);
  broadcastRoomsDirectory();
}

// ==========================================
// LUDO ENGINE
// ==========================================
function getMovableLudoTokens(player: LudoPlayerState, dice: number): number[] {
  const movable: number[] = [];
  player.tokens.forEach((pos, idx) => {
    if (pos === -1) {
      if (dice === 6) movable.push(idx);
    } else if (pos >= 0 && pos + dice <= 56) {
      movable.push(idx);
    }
  });
  return movable;
}

function advanceLudoTurn(room: InternalRoom) {
  const ludo = room.ludo;
  if (ludo.players.length === 0) return;
  ludo.currentTurnIndex = (ludo.currentTurnIndex + 1) % ludo.players.length;
  ludo.diceValue = null;
  ludo.hasRolled = false;
  ludo.movableTokenIndices = [];
  startBoardTurnTimer(room, 'ludo');
  scheduleLudoBotIfNeeded(room);
}

function executeLudoRoll(room: InternalRoom, playerId: string) {
  const ludo = room.ludo;
  if (ludo.phase !== 'PLAYING' || ludo.hasRolled) return;
  const activePlayer = ludo.players[ludo.currentTurnIndex];
  if (!activePlayer || activePlayer.playerId !== playerId) return;

  const dice = Math.floor(Math.random() * 6) + 1;
  ludo.diceValue = dice;
  ludo.hasRolled = true;
  ludo.movableTokenIndices = getMovableLudoTokens(activePlayer, dice);

  if (ludo.movableTokenIndices.length === 0) {
    ludo.lastEventText = `${activePlayer.name} رمى ${dice} · لا توجد حركة متاحة`;
    broadcastRoomState(room);
    setTimeout(() => {
      const r = rooms.get(room.id);
      if (r && r.ludo.phase === 'PLAYING' && r.ludo.hasRolled && r.ludo.movableTokenIndices.length === 0) {
        advanceLudoTurn(r);
        broadcastRoomState(r);
      }
    }, 900);
  } else {
    ludo.lastEventText = `${activePlayer.name} رمى الرقم ${dice}`;
    broadcastRoomState(room);
    if (activePlayer.isBot) {
      room.botTimer = setTimeout(() => {
        executeLudoMove(room, activePlayer.playerId, ludo.movableTokenIndices[0]);
      }, 650);
    }
  }
}

function executeLudoMove(room: InternalRoom, playerId: string, tokenIndex: number) {
  const ludo = room.ludo;
  if (ludo.phase !== 'PLAYING' || !ludo.hasRolled || ludo.diceValue === null) return;
  const activePlayer = ludo.players[ludo.currentTurnIndex];
  if (!activePlayer || activePlayer.playerId !== playerId) return;
  if (!ludo.movableTokenIndices.includes(tokenIndex)) return;

  const dice = ludo.diceValue;
  const oldPos = activePlayer.tokens[tokenIndex];
  const newPos = oldPos === -1 ? 0 : oldPos + dice;
  activePlayer.tokens[tokenIndex] = newPos;

  let capturedSomeone = false;
  const reachedHome = newPos === 56;

  if (newPos >= 0 && newPos <= 50) {
    const globalCell = (LUDO_START_OFFSET[activePlayer.color] + newPos) % 52;
    if (!LUDO_SAFE_GLOBAL_CELLS.has(globalCell)) {
      for (const opp of ludo.players) {
        if (opp.playerId === activePlayer.playerId) continue;
        opp.tokens.forEach((oppPos, oppIdx) => {
          if (oppPos >= 0 && oppPos <= 50) {
            const oppGlobal = (LUDO_START_OFFSET[opp.color] + oppPos) % 52;
            if (oppGlobal === globalCell) {
              opp.tokens[oppIdx] = -1;
              capturedSomeone = true;
            }
          }
        });
      }
    }
  }

  if (activePlayer.tokens.every((t) => t === 56)) {
    clearBoardTurnTimer(room);
    ludo.phase = 'FINISHED';
    ludo.winnerId = activePlayer.playerId;
    ludo.lastEventText = `فاز ${activePlayer.name} ببطولة لودو يلا!`;
    addSystemMessage(room, ludo.lastEventText);
    broadcastRoomState(room);
    return;
  }

  if (dice === 6 || capturedSomeone || reachedHome) {
    ludo.diceValue = null;
    ludo.hasRolled = false;
    ludo.movableTokenIndices = [];
    ludo.lastEventText = `${activePlayer.name} حصل على رمية إضافية!`;
    startBoardTurnTimer(room, 'ludo');
    broadcastRoomState(room);
    scheduleLudoBotIfNeeded(room);
  } else {
    ludo.lastEventText = `${activePlayer.name} حرّك قطعة ${dice} خطوات`;
    advanceLudoTurn(room);
    broadcastRoomState(room);
  }
}

function scheduleLudoBotIfNeeded(room: InternalRoom) {
  if (room.botTimer) clearTimeout(room.botTimer);
  const active = room.ludo.players[room.ludo.currentTurnIndex];
  if (room.ludo.phase === 'PLAYING' && active && active.isBot && !room.ludo.hasRolled) {
    room.botTimer = setTimeout(() => executeLudoRoll(room, active.playerId), 750);
  }
}

// ==========================================
// SNAKES & LADDERS ENGINE
// ==========================================
function executeSnakesRoll(room: InternalRoom, playerId: string) {
  const snk = room.snakes;
  if (snk.phase !== 'PLAYING') return;
  const active = snk.players[snk.currentTurnIndex];
  if (!active || active.playerId !== playerId) return;

  const dice = Math.floor(Math.random() * 6) + 1;
  snk.diceValue = dice;
  let nextPos = active.position + dice;
  if (nextPos > 100) nextPos = active.position;

  let note = `${active.name} رمى ${dice} وتقدم إلى الخانة ${nextPos}`;
  const jump = SNAKES_LADDERS_MAP[nextPos];
  if (jump) {
    note =
      jump > nextPos
        ? `${active.name} صعد السلم من ${nextPos} إلى ${jump}!`
        : `${active.name} لدغه ثعبان من ${nextPos} إلى ${jump}!`;
    nextPos = jump;
  }
  active.position = nextPos;
  snk.lastEventText = note;

  if (nextPos === 100) {
    clearBoardTurnTimer(room);
    snk.phase = 'FINISHED';
    snk.winnerId = active.playerId;
    snk.lastEventText = `فاز ${active.name} بسباق السلم والثعبان!`;
    addSystemMessage(room, snk.lastEventText);
    broadcastRoomState(room);
    return;
  }

  snk.currentTurnIndex = (snk.currentTurnIndex + 1) % snk.players.length;
  startBoardTurnTimer(room, 'snakes');
  broadcastRoomState(room);

  const nextPlayer = snk.players[snk.currentTurnIndex];
  if (nextPlayer?.isBot) {
    room.botTimer = setTimeout(() => executeSnakesRoll(room, nextPlayer.playerId), 800);
  }
}

// ==========================================
// BANK AL-HAZ ENGINE (COMPLETE MONOPOLY)
// ==========================================
function calculateBankRent(room: InternalRoom, tileIndex: number, ownerId: string): number {
  const tile = BANK_BOARD_TILES[tileIndex];
  if (!tile || !tile.rent) return 0;
  const houses = room.bank.buildings[tileIndex] || 0;
  let rent = Math.round(tile.rent * (1 + houses * 0.75));
  if (tile.color && tile.kind === 'city') {
    const groupTiles = BANK_BOARD_TILES.filter(
      (t) => t.kind === 'city' && t.color === tile.color
    );
    const ownsWholeGroup = groupTiles.every((t) => room.bank.owners[t.index] === ownerId);
    if (ownsWholeGroup) {
      rent = Math.round(rent * 1.35);
    }
  }
  return rent;
}

function bankruptBankPlayer(room: InternalRoom, playerIdx: number) {
  const bank = room.bank;
  const target = bank.players[playerIdx];
  if (!target) return;
  target.bankrupt = true;
  target.cash = 0;
  for (const [tileStr, ownerId] of Object.entries(bank.owners)) {
    if (ownerId === target.playerId) {
      const tIdx = Number(tileStr);
      delete bank.owners[tIdx];
      delete bank.buildings[tIdx];
    }
  }
}

function advanceBankTurn(room: InternalRoom) {
  const bank = room.bank;
  const alive = bank.players.filter((p) => !p.bankrupt);
  if (alive.length <= 1) {
    clearBoardTurnTimer(room);
    bank.phase = 'FINISHED';
    bank.winnerId = alive[0]?.playerId || null;
    bank.lastEventText = alive[0] ? `فاز ${alive[0].name} بلقب بنك الحظ!` : 'انتهت المباراة';
    if (alive[0]) addSystemMessage(room, bank.lastEventText);
    broadcastRoomState(room);
    return;
  }
  let next = (bank.currentTurnIndex + 1) % bank.players.length;
  while (bank.players[next].bankrupt) {
    next = (next + 1) % bank.players.length;
  }
  bank.currentTurnIndex = next;
  bank.awaitingBuyTile = null;
  startBoardTurnTimer(room, 'bank');
  broadcastRoomState(room);

  const active = bank.players[next];
  if (active?.isBot) {
    room.botTimer = setTimeout(() => {
      if (room.bank.phase !== 'PLAYING') return;
      if (active.jailTurns > 0 && active.cash >= 100) {
        active.cash -= 100;
        active.jailTurns = 0;
        room.bank.lastEventText = `${active.name} دفع كفالة 100 ج وخرج من السجن`;
      }
      executeBankRoll(room, active.playerId);
    }, 850);
  }
}

function executeBankRoll(room: InternalRoom, playerId: string) {
  const bank = room.bank;
  if (bank.phase !== 'PLAYING' || bank.awaitingBuyTile !== null) return;
  const activeIdx = bank.currentTurnIndex;
  const active = bank.players[activeIdx];
  if (!active || active.playerId !== playerId || active.bankrupt) return;

  const dice = Math.floor(Math.random() * 6) + 1;
  bank.diceValue = dice;

  if (active.jailTurns > 0) {
    if (dice === 6) {
      active.jailTurns = 0;
      bank.lastEventText = `${active.name} رمى 6 وخرج من السجن مجاناً!`;
    } else {
      active.jailTurns -= 1;
      bank.lastEventText = `${active.name} رمى ${dice} وبقي موقوفاً في السجن (${active.jailTurns} دور متبقي)`;
      advanceBankTurn(room);
      return;
    }
  }

  const totalTiles = BANK_BOARD_TILES.length; // 24 tiles
  const oldPos = active.position;
  const rawNew = oldPos + dice;
  const newPos = rawNew % totalTiles;
  active.position = newPos;

  let salaryNote = '';
  if (rawNew >= totalTiles) {
    active.cash += 200;
    salaryNote = ' · (+200 ج مرور بالانطلاق)';
  }

  const tile = BANK_BOARD_TILES[newPos];
  if (tile.kind === 'city' || tile.kind === 'station') {
    const ownerId = bank.owners[tile.index];
    if (!ownerId && tile.price && active.cash >= tile.price) {
      if (active.isBot) {
        active.cash -= tile.price;
        bank.owners[tile.index] = active.playerId;
        bank.lastEventText = `${active.name} اشترى ${tile.name} بـ ${tile.price} ج${salaryNote}`;
        advanceBankTurn(room);
      } else {
        bank.awaitingBuyTile = tile.index;
        bank.lastEventText = `${active.name} وصل إلى ${tile.name}${salaryNote}`;
        startBoardTurnTimer(room, 'bank');
        broadcastRoomState(room);
      }
      return;
    } else if (ownerId && ownerId !== active.playerId) {
      const owner = bank.players.find((p) => p.playerId === ownerId);
      const dueRent = calculateBankRent(room, tile.index, ownerId);
      const paid = Math.min(active.cash, dueRent);
      active.cash -= dueRent;
      if (owner && !owner.bankrupt) owner.cash += paid;
      if (active.cash <= 0) {
        bankruptBankPlayer(room, activeIdx);
        bank.lastEventText = `أفلس ${active.name} بعد دفع إيجار ${tile.name} (${dueRent} ج)!`;
      } else {
        bank.lastEventText = `${active.name} دفع ${dueRent} ج إيجار ${tile.name}${salaryNote}`;
      }
    } else if (ownerId === active.playerId) {
      bank.lastEventText = `${active.name} يزور عقاره في ${tile.name}${salaryNote}`;
    } else {
      bank.lastEventText = `${active.name} في ${tile.name} (لا يكفي الرصيد للشراء)${salaryNote}`;
    }
  } else if (tile.kind === 'tax') {
    const taxAmt = tile.index === 5 ? 120 : 180;
    active.cash = Math.max(0, active.cash - taxAmt);
    if (active.cash === 0) {
      bankruptBankPlayer(room, activeIdx);
      bank.lastEventText = `أفلس ${active.name} بعد سداد ${tile.name}!`;
    } else {
      bank.lastEventText = `${active.name} دفع ${taxAmt} ج (${tile.name})${salaryNote}`;
    }
  } else if (tile.kind === 'chance' || tile.kind === 'chest') {
    const cards = [
      { text: 'منحة استثمارية ناجحة +200 ج', delta: 200 },
      { text: 'عائد سياحي +150 ج', delta: 150 },
      { text: 'هدية من البنك +100 ج', delta: 100 },
      { text: 'صيانة وتأمين -80 ج', delta: -80 },
      { text: 'مخالفة مرورية -110 ج', delta: -110 },
    ];
    const picked = cards[Math.floor(Math.random() * cards.length)];
    active.cash = Math.max(0, active.cash + picked.delta);
    bank.lastEventText = `${tile.name}: ${picked.text}${salaryNote}`;
    if (active.cash === 0) bankruptBankPlayer(room, activeIdx);
  } else if (tile.kind === 'goto_jail') {
    active.position = 6; // Jail index
    active.jailTurns = 1;
    bank.lastEventText = `${active.name} أُرسل فوراً إلى السجن!`;
  } else {
    bank.lastEventText = `${active.name} في ${tile.name}${salaryNote}`;
  }

  advanceBankTurn(room);
}

// ==========================================
// JACKAROO ENGINE
// ==========================================
function drawJackarooCard(forceStarterChance = false): string {
  if (forceStarterChance && Math.random() < 0.45) {
    return Math.random() < 0.5 ? 'A' : 'K';
  }
  return JACKAROO_DECK[Math.floor(Math.random() * JACKAROO_DECK.length)];
}

function dealJackarooInitialHand(): string[] {
  const starter = Math.random() < 0.5 ? 'A' : 'K';
  const hand = [starter, drawJackarooCard(), drawJackarooCard(), drawJackarooCard()];
  // Shuffle hand order
  for (let i = hand.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hand[i], hand[j]] = [hand[j], hand[i]];
  }
  return hand;
}

function canJackarooCardMoveMarble(
  card: string,
  oldPos: number,
  hasOpponentOnTrack: boolean
): boolean {
  if (oldPos === -1) {
    return card === 'A' || card === 'K';
  }
  if (oldPos >= 55) return false;
  if (card === 'J') {
    return hasOpponentOnTrack || oldPos < 55;
  }
  if (card === '4') {
    return oldPos >= 0;
  }
  return true;
}

function advanceJackarooTurn(room: InternalRoom) {
  const jack = room.jackaroo;
  jack.selectedCard = null;
  jack.currentTurnIndex = (jack.currentTurnIndex + 1) % jack.players.length;
  startBoardTurnTimer(room, 'jackaroo');
  broadcastRoomState(room);

  const next = jack.players[jack.currentTurnIndex];
  if (next?.isBot) {
    room.botTimer = setTimeout(() => {
      if (room.jackaroo.phase !== 'PLAYING') return;
      const opponentsOnTrack = jack.players.some(
        (p) => p.playerId !== next.playerId && p.marbles.some((m) => m >= 0 && m <= 51)
      );
      // 1. Prefer bringing out a marble from base with A or K
      const baseIdx = next.marbles.findIndex((m) => m === -1);
      const akCard = next.hand.find((c) => c === 'A' || c === 'K');
      if (baseIdx !== -1 && akCard) {
        executeJackarooPlay(room, next.playerId, akCard, baseIdx);
        return;
      }
      // 2. Otherwise move an active marble on the track/home
      const activeIndices = next.marbles
        .map((m, idx) => ({ m, idx }))
        .filter((x) => x.m >= 0 && x.m < 55)
        .sort((a, b) => b.m - a.m);

      for (const item of activeIndices) {
        const playableCard = next.hand.find((c) =>
          canJackarooCardMoveMarble(c, item.m, opponentsOnTrack)
        );
        if (playableCard) {
          executeJackarooPlay(room, next.playerId, playableCard, item.idx);
          return;
        }
      }
      // 3. Fallback: discard first card cleanly
      const discardCard = next.hand[0] || '5';
      next.hand.splice(0, 1);
      next.hand.push(drawJackarooCard(next.marbles.every((m) => m === -1)));
      jack.lastPlayedCard = discardCard;
      jack.lastEventText = `${next.name} حرق كرت ${discardCard}`;
      advanceJackarooTurn(room);
    }, 900);
  }
}

function executeJackarooPlay(
  room: InternalRoom,
  playerId: string,
  card: string,
  marbleIdx: number
) {
  const jack = room.jackaroo;
  if (jack.phase !== 'PLAYING') return;
  const active = jack.players[jack.currentTurnIndex];
  if (!active || active.playerId !== playerId) return;
  const cardPos = active.hand.indexOf(card);
  if (cardPos === -1) return;
  if (marbleIdx < 0 || marbleIdx >= active.marbles.length) return;

  const oldPos = active.marbles[marbleIdx] ?? -1;
  let moved = false;
  let capturedName: string | null = null;
  let swappedName: string | null = null;

  if ((card === 'A' || card === 'K') && oldPos === -1) {
    active.marbles[marbleIdx] = 0;
    moved = true;
  } else if (oldPos >= 0 && oldPos < 55) {
    if (card === 'J') {
      // Real Jackaroo J card: swap with farthest opponent marble on outer track (0..51) if possible
      let bestTarget: { playerIdx: number; marbleIdx: number; myNewPos: number; oppNewPos: number } | null = null;
      const myOffset = LUDO_START_OFFSET[active.color];

      if (oldPos <= 51) {
        const myGlobal = (myOffset + oldPos) % 52;
        jack.players.forEach((opp, pIdx) => {
          if (opp.playerId === active.playerId) return;
          const oppOffset = LUDO_START_OFFSET[opp.color];
          opp.marbles.forEach((oppPos, mIdx) => {
            if (oppPos >= 0 && oppPos <= 51) {
              const oppGlobal = (oppOffset + oppPos) % 52;
              const myRelativeTarget = (oppGlobal - myOffset + 52) % 52;
              const oppRelativeTarget = (myGlobal - oppOffset + 52) % 52;
              if (!bestTarget || oppPos > jack.players[bestTarget.playerIdx].marbles[bestTarget.marbleIdx]) {
                bestTarget = {
                  playerIdx: pIdx,
                  marbleIdx: mIdx,
                  myNewPos: myRelativeTarget,
                  oppNewPos: oppRelativeTarget,
                };
              }
            }
          });
        });
      }

      if (bestTarget !== null) {
        const targetInfo = bestTarget as {
          playerIdx: number;
          marbleIdx: number;
          myNewPos: number;
          oppNewPos: number;
        };
        const oppPlayer = jack.players[targetInfo.playerIdx];
        oppPlayer.marbles[targetInfo.marbleIdx] = targetInfo.oppNewPos;
        active.marbles[marbleIdx] = targetInfo.myNewPos;
        swappedName = oppPlayer.name;
        moved = true;
      } else {
        active.marbles[marbleIdx] = Math.min(55, oldPos + 11);
        moved = true;
      }
    } else {
      const steps =
        card === 'A'
          ? 1
          : card === 'K'
            ? 13
            : card === 'Q'
              ? 12
              : card === '4'
                ? -4
                : Number(card) || 5;
      const target =
        card === '4'
          ? (oldPos <= 51 ? (oldPos - 4 + 52) % 52 : Math.max(52, oldPos - 4))
          : Math.min(55, oldPos + steps);
      active.marbles[marbleIdx] = target;
      moved = true;
    }
  }

  // If rejected move (e.g. clicked base marble with non-A/K card), keep turn & inform player cleanly
  if (!moved) {
    jack.lastEventText = `كرت ${card} لا يحرّك هذا الحجر — اختر حجراً على المسار أو استخدم A / K للإخراج`;
    broadcastRoomState(room);
    return;
  }

  // Check for landing on opponent marble on global outer track (0..51) -> send opponent marble back to base!
  const newPos = active.marbles[marbleIdx];
  if (!swappedName && newPos >= 0 && newPos <= 51) {
    const myGlobal = (LUDO_START_OFFSET[active.color] + newPos) % 52;
    for (const opp of jack.players) {
      if (opp.playerId === active.playerId) continue;
      const oppOffset = LUDO_START_OFFSET[opp.color];
      for (let m = 0; m < opp.marbles.length; m++) {
        const oppPos = opp.marbles[m];
        if (oppPos >= 0 && oppPos <= 51) {
          const oppGlobal = (oppOffset + oppPos) % 52;
          if (oppGlobal === myGlobal) {
            opp.marbles[m] = -1;
            capturedName = opp.name;
          }
        }
      }
    }
  }

  active.hand.splice(cardPos, 1);
  active.hand.push(drawJackarooCard(active.marbles.every((m) => m === -1)));
  jack.lastPlayedCard = card;

  if (swappedName) {
    jack.lastEventText = `${active.name} استخدم الجاك (J) وبدّل حجره مع ${swappedName}!`;
  } else if (capturedName) {
    jack.lastEventText = `${active.name} لعب ${card} وأكل حجر ${capturedName} وأعاده للقاعدة!`;
  } else if ((card === 'A' || card === 'K') && oldPos === -1) {
    jack.lastEventText = `${active.name} أخرج حجراً للمسار بكرت ${card}!`;
  } else {
    jack.lastEventText = `${active.name} لعب كرت ${card} وحرّك حجره`;
  }

  if (active.marbles.every((m) => m >= 52)) {
    clearBoardTurnTimer(room);
    jack.phase = 'FINISHED';
    jack.winnerId = active.playerId;
    jack.lastEventText = `فاز ${active.name} ببطولة چاكارو!`;
    addSystemMessage(room, jack.lastEventText);
    broadcastRoomState(room);
    return;
  }
  advanceJackarooTurn(room);
}

// ==========================================
// CAR RACING ENGINE
// ==========================================
function startRacingMatch(room: InternalRoom, withBot: boolean) {
  if (room.racingTimer) clearInterval(room.racingTimer);
  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  if (seatedHumans.length === 0) return;

  const players = seatedHumans.slice(0, 6).map((s, idx) => ({
    playerId: s.playerId as string,
    name: s.playerName || 'متسابق',
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
    isBot: false,
    progress: 0,
    speed: 0,
    finishedOrder: null,
  }));

  if (withBot && players.length === 1) {
    players.push({
      playerId: 'race_bot_1',
      name: 'روبوت السرعة',
      color: '#16A34A',
      isBot: true,
      progress: 0,
      speed: 0,
      finishedOrder: null,
    });
  }
  if (players.length < 2) return;

  room.racing = {
    phase: 'COUNTDOWN',
    countdown: 3,
    players,
    winnerId: null,
    lastEventText: 'استعدوا للانطلاق!',
  };
  broadcastRoomState(room);

  room.racingTimer = setInterval(() => {
    if (room.racing.phase === 'COUNTDOWN') {
      room.racing.countdown -= 1;
      if (room.racing.countdown <= 0) {
        room.racing.phase = 'RACING';
        room.racing.lastEventText = 'انطلقوا! اضغط تيربو للوصول أولاً';
      }
      broadcastRoomState(room);
      return;
    }

    if (room.racing.phase === 'RACING') {
      for (const car of room.racing.players) {
        if (car.isBot) {
          car.progress = Math.min(100, car.progress + 2.8 + Math.random() * 2.2);
        } else if (car.speed > 0) {
          car.progress = Math.min(100, car.progress + car.speed);
          car.speed = Math.max(0, car.speed - 0.8);
        }
        if (car.progress >= 100 && !room.racing.winnerId) {
          room.racing.winnerId = car.playerId;
          room.racing.phase = 'FINISHED';
          room.racing.lastEventText = `فاز ${car.name} بسباق السيارات!`;
          if (room.racingTimer) {
            clearInterval(room.racingTimer);
            room.racingTimer = undefined;
          }
          break;
        }
      }
      broadcastRoomState(room);
    }
  }, 250);
}

// ==========================================
// DRAW & GUESS + SPY + TRIVIA
// ==========================================
function pickRandomDrawChoices(): string[] {
  return [...DRAW_WORDS].sort(() => Math.random() - 0.5).slice(0, 3);
}

function startDrawRound(room: InternalRoom, nextRoundNumber = 1) {
  if (room.drawTimer) {
    clearInterval(room.drawTimer);
    room.drawTimer = undefined;
  }
  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  if (seatedHumans.length < 2) {
    room.draw = {
      ...createInitialDraw(),
      phase: 'FREE_DRAW',
      drawerId: seatedHumans[0]?.playerId || null,
      drawerName: seatedHumans[0]?.playerName || null,
    };
    broadcastRoomState(room);
    return;
  }
  const idx = room.draw.drawerRotationIndex % seatedHumans.length;
  const drawer = seatedHumans[idx];
  room.draw.phase = 'CHOOSING_WORD';
  room.draw.drawerId = drawer.playerId;
  room.draw.drawerName = drawer.playerName;
  room.draw.wordChoices = pickRandomDrawChoices();
  room.draw.actualWord = '';
  room.draw.timeLeft = 60;
  room.draw.strokes = [];
  room.draw.guessedPlayerIds = [];
  room.draw.round = nextRoundNumber;
  broadcastRoomState(room);
}

function beginDrawingPhase(room: InternalRoom, chosenWord: string) {
  if (room.drawTimer) clearInterval(room.drawTimer);
  room.draw.phase = 'DRAWING';
  room.draw.actualWord = chosenWord;
  room.draw.timeLeft = 60;
  room.draw.strokes = [];
  room.draw.guessedPlayerIds = [];
  broadcastRoomState(room);

  room.drawTimer = setInterval(() => {
    room.draw.timeLeft -= 1;
    if (room.draw.timeLeft <= 0) {
      finishDrawRound(room);
    } else {
      broadcastRoomState(room);
    }
  }, 1000);
}

function finishDrawRound(room: InternalRoom) {
  if (room.drawTimer) {
    clearInterval(room.drawTimer);
    room.drawTimer = undefined;
  }
  room.draw.phase = 'ROUND_END';
  addSystemMessage(room, `انتهت الجولة! الكلمة كانت: ${room.draw.actualWord}`);
  broadcastRoomState(room);

  setTimeout(() => {
    const r = rooms.get(room.id);
    if (!r || r.gameType !== 'draw' || r.draw.phase !== 'ROUND_END') return;
    const seatedHumans = r.seats.filter((s) => s.playerId && !s.isBot);
    if (seatedHumans.length < 2 || r.draw.round >= r.draw.maxRounds) {
      r.draw.phase = 'LOBBY';
      broadcastRoomState(r);
      return;
    }
    r.draw.drawerRotationIndex += 1;
    startDrawRound(r, r.draw.round + 1);
  }, 4500);
}

function startSpyGame(room: InternalRoom) {
  const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
  if (seatedHumans.length < 2) return;
  const pair = SPY_WORD_PAIRS[Math.floor(Math.random() * SPY_WORD_PAIRS.length)];
  const playerIds = seatedHumans.map((s) => s.playerId as string);
  const spyId = playerIds[Math.floor(Math.random() * playerIds.length)];
  const playerWords: Record<string, string> = {};
  for (const pid of playerIds) playerWords[pid] = pid === spyId ? pair.spy : pair.civilian;

  room.spy = {
    phase: 'ROLE_REVEAL',
    round: 1,
    category: pair.category,
    civilianWord: pair.civilian,
    spyWord: pair.spy,
    spyIds: [spyId],
    playerWords,
    turnOrder: [...playerIds],
    currentTurnPlayerId: playerIds[0],
    clues: [],
    votes: {},
    eliminatedPlayerId: null,
    winner: null,
  };
  broadcastRoomState(room);
}

function startTriviaGame(room: InternalRoom) {
  if (room.triviaTimer) clearInterval(room.triviaTimer);
  const indices = TRIVIA_QUESTIONS.map((_, i) => i).sort(() => Math.random() - 0.5);
  room.trivia = {
    phase: 'QUESTION',
    round: 1,
    maxRounds: Math.min(8, TRIVIA_QUESTIONS.length),
    questionPoolIndices: indices,
    currentQuestionIndex: indices[0],
    timeLeft: 15,
    answers: {},
    scores: {},
  };
  runTriviaTimer(room);
  broadcastRoomState(room);
}

function runTriviaTimer(room: InternalRoom) {
  if (room.triviaTimer) clearInterval(room.triviaTimer);
  room.triviaTimer = setInterval(() => {
    if (room.trivia.phase !== 'QUESTION') return;
    room.trivia.timeLeft -= 1;
    if (room.trivia.timeLeft <= 0) revealTriviaQuestion(room);
    else broadcastRoomState(room);
  }, 1000);
}

function revealTriviaQuestion(room: InternalRoom) {
  if (room.triviaTimer) {
    clearInterval(room.triviaTimer);
    room.triviaTimer = undefined;
  }
  room.trivia.phase = 'REVEAL';
  broadcastRoomState(room);

  setTimeout(() => {
    const r = rooms.get(room.id);
    if (!r || r.gameType !== 'trivia' || r.trivia.phase !== 'REVEAL') return;
    if (r.trivia.round >= r.trivia.maxRounds) {
      r.trivia.phase = 'FINISHED';
      broadcastRoomState(r);
    } else {
      r.trivia.round += 1;
      r.trivia.currentQuestionIndex =
        r.trivia.questionPoolIndices[(r.trivia.round - 1) % r.trivia.questionPoolIndices.length];
      r.trivia.phase = 'QUESTION';
      r.trivia.timeLeft = 15;
      r.trivia.answers = {};
      runTriviaTimer(r);
      broadcastRoomState(r);
    }
  }, 3500);
}

// ==========================================
// SERVER BOOTSTRAP
// ==========================================
const APP_RELEASE_INFO = {
  version: '2.5.0',
  buildId: Date.now().toString(36),
  releasedAt: new Date().toISOString(),
  titleAr: 'تحديث يلا بلاي (v2.5.0)',
  highlights: [
    'تحسين تصميم المايكات ومنصة الغرفة الصوتية مع زر كتم سريع على المايك',
    'تحسين عرض الألعاب وإضافة وضع توسيع ساحة اللعب وفلاتر مكتبة الألعاب',
    'لوحة تحكم بالألعاب مطوّرة وعرض كامل لرقعة بنك الحظ بدون تمرير جانبي',
  ],
};

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      rooms: rooms.size,
      connections: clients.size,
      version: APP_RELEASE_INFO.version,
      buildId: APP_RELEASE_INFO.buildId,
    });
  });

  app.get('/api/version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(APP_RELEASE_INFO);
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getPublicRoomSummaries() });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const wsKeepaliveTimer = setInterval(() => {
    for (const [sock] of clients.entries()) {
      if (sock.readyState === WebSocket.OPEN) {
        try {
          sock.ping();
        } catch {
          // ignore transient ping error
        }
      }
    }
  }, 25000);

  wss.on('close', () => clearInterval(wsKeepaliveTimer));

  wss.on('connection', (ws) => {
    const client: ClientConn = {
      ws,
      playerId: uid('player'),
      name: 'لاعب جديد',
      avatar: 'falcon',
      roomId: null,
      watchedUids: new Set(),
      hideOnline: false,
      hideRoom: false,
    };
    clients.set(ws, client);

    ws.on('message', (raw) => {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = msg.type as string;

      if (type === 'hello') {
        const prevPlayerId = client.playerId;
        if (typeof msg.playerId === 'string' && msg.playerId.trim()) {
          client.playerId = msg.playerId.trim();
        }
        if (typeof msg.name === 'string' && msg.name.trim()) {
          client.name = msg.name.trim().slice(0, 32);
        }
        if (typeof msg.avatar === 'string') {
          client.avatar = msg.avatar as AvatarId;
        }
        if (typeof msg.hideOnline === 'boolean') {
          client.hideOnline = msg.hideOnline;
          if (msg.hideOnline) {
            privacyHiddenOnlineUids.add(client.playerId);
          } else {
            privacyHiddenOnlineUids.delete(client.playerId);
          }
        }
        if (typeof msg.hideRoom === 'boolean') {
          client.hideRoom = msg.hideRoom;
        }
        if (client.roomId) {
          const r = rooms.get(client.roomId);
          if (r) {
            const m = r.members.get(client.playerId);
            if (m) {
              m.name = client.name;
              m.avatar = client.avatar;
            }
            for (const s of r.seats) {
              if (s.playerId === client.playerId) {
                s.playerName = client.name;
                s.avatar = client.avatar;
              }
            }
            broadcastRoomState(r);
          }
        }
        sendJson(ws, { type: 'rooms:list', rooms: getPublicRoomSummaries() });
        if (prevPlayerId !== client.playerId) {
          broadcastPresenceUpdate(prevPlayerId);
        }
        broadcastPresenceUpdate(client.playerId);
        return;
      }

      if (type === 'presence:watch') {
        const rawList = Array.isArray(msg.uids) ? msg.uids : [];
        const cleanUids = rawList
          .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
          .slice(0, 200);
        client.watchedUids = new Set(cleanUids);
        const statuses: Record<string, UserPresenceInfo> = {};
        for (const targetUid of client.watchedUids) {
          statuses[targetUid] = computePresenceForUid(targetUid);
        }
        sendJson(ws, { type: 'presence:snapshot', statuses });
        return;
      }

      if (type === 'rooms:list') {
        sendJson(ws, { type: 'rooms:list', rooms: getPublicRoomSummaries() });
        return;
      }

      if (type === 'room:create') {
        if (client.roomId) {
          removePlayerFromRoom(client.playerId, client.roomId);
          client.roomId = null;
        }
        const tier: RoomTier = msg.tier === 'basic' ? 'basic' : 'free';
        const code =
          tier === 'basic' && typeof msg.fixedCode === 'string' && msg.fixedCode.trim()
            ? msg.fixedCode.trim().toUpperCase()
            : undefined;

        const existingFixed = code ? rooms.get(code) : undefined;
        const room =
          existingFixed ||
          createRoom({
            code,
            title:
              typeof msg.title === 'string' && msg.title.trim()
                ? msg.title.trim().slice(0, 48)
                : `غرفة ${client.name}`,
            tier,
            xp: tier === 'basic' ? Number(msg.xp || 0) : 0,
            backgroundIndex: Number(msg.backgroundIndex || 0),
            gameType: (msg.gameType as GameType) || 'ludo',
            hostId: client.playerId,
            isPrivate: Boolean(msg.isPrivate),
            isLocked: tier === 'basic' ? Boolean(msg.isLocked) : false,
            lockPin:
              tier === 'basic' && typeof msg.lockPin === 'string'
                ? msg.lockPin.trim().slice(0, 16)
                : '',
          });

        if (existingFixed) {
          if (existingFixed.hostId === 'official') {
            existingFixed.hostId = client.playerId;
          } else if (tier === 'basic' && !existingFixed.isOfficial) {
            if (!existingFixed.permanentOwnerId || existingFixed.permanentOwnerId === client.playerId) {
              existingFixed.permanentOwnerId = client.playerId;
              existingFixed.hostId = client.playerId;
            }
          }
        }

        const member: RoomMember = {
          id: client.playerId,
          name: client.name,
          avatar: client.avatar,
          isHost: room.hostId === client.playerId,
          staffRole: getStaffRole(room, client.playerId),
        };
        room.members.set(client.playerId, member);
        seatPlayerInRoom(room, member, 0);
        syncRoleFlags(room);
        client.roomId = room.id;

        sendJson(ws, { type: 'room:state', room: serializeRoomForPlayer(room, client.playerId) });
        broadcastRoomsDirectory();
        broadcastPresenceUpdate(client.playerId);
        return;
      }

      if (type === 'room:join') {
        const code = String(msg.code || '').trim().toUpperCase();
        const targetRoom = rooms.get(code);
        if (!targetRoom) {
          sendJson(ws, { type: 'error', message: 'لم يتم العثور على غرفة بهذا الكود' });
          return;
        }
        const kickedUntil = targetRoom.kickedUsers[client.playerId];
        if (kickedUntil && kickedUntil > Date.now() && targetRoom.hostId !== client.playerId) {
          sendJson(ws, {
            type: 'error',
            message: `تم طردك من هذه الغرفة مؤقتاً، يمكنك المحاولة بعد ${formatRemainingKickTime(kickedUntil)}`,
          });
          return;
        } else if (kickedUntil) {
          delete targetRoom.kickedUsers[client.playerId];
        }
        if (targetRoom.tier === 'basic' && targetRoom.isLocked) {
          const isHostOrStaff =
            targetRoom.hostId === client.playerId || Boolean(targetRoom.staff[client.playerId]);
          if (!isHostOrStaff) {
            if (targetRoom.lockPin) {
              const suppliedPin = String(msg.pin || '').trim();
              if (suppliedPin !== targetRoom.lockPin) {
                sendJson(ws, {
                  type: 'room:lock_required',
                  code: targetRoom.code,
                  title: targetRoom.title,
                  wrongPin: Boolean(suppliedPin),
                });
                return;
              }
            } else {
              sendJson(ws, {
                type: 'error',
                message: 'عذراً، هذه الغرفة الأساسية مقفلة حالياً من قِبل صاحب الغرفة',
              });
              return;
            }
          }
        }
        if (targetRoom.cleanupTimeout) {
          clearTimeout(targetRoom.cleanupTimeout);
          targetRoom.cleanupTimeout = undefined;
        }
        if (client.roomId && client.roomId !== targetRoom.id) {
          removePlayerFromRoom(client.playerId, client.roomId);
        }
        client.roomId = targetRoom.id;

        if (
          targetRoom.permanentOwnerId === client.playerId ||
          ((targetRoom.isOfficial || targetRoom.tier === 'free') &&
            (targetRoom.hostId === 'official' || !targetRoom.members.has(targetRoom.hostId)))
        ) {
          targetRoom.hostId = client.playerId;
        }
        const member: RoomMember = {
          id: client.playerId,
          name: client.name,
          avatar: client.avatar,
          isHost: targetRoom.hostId === client.playerId,
          staffRole: getStaffRole(targetRoom, client.playerId),
        };
        targetRoom.members.set(client.playerId, member);
        seatPlayerInRoom(targetRoom, member);
        syncRoleFlags(targetRoom);
        addSystemMessage(targetRoom, `انضم ${client.name} إلى الغرفة`);

        broadcastRoomState(targetRoom);
        broadcastRoomsDirectory();
        broadcastPresenceUpdate(client.playerId);
        return;
      }

      if (type === 'room:rejoin') {
        const code = String(msg.code || '').trim().toUpperCase();
        if (!code) return;

        let targetRoom = rooms.get(code);
        if (!targetRoom && msg.snapshot && typeof msg.snapshot === 'object') {
          const snap = msg.snapshot as Record<string, unknown>;
          const snapTier: RoomTier = snap.tier === 'basic' ? 'basic' : 'free';
          const isSeededOfficial =
            code === 'ID1001' || code === 'TMP2002' || code === 'ID3003' || code === 'ID4004';
          targetRoom = createRoom({
            code,
            title:
              typeof snap.title === 'string' && snap.title.trim()
                ? snap.title.trim().slice(0, 48)
                : `غرفة ${client.name}`,
            tier: snapTier,
            xp: snapTier === 'basic' ? Number(snap.xp || 0) : 0,
            backgroundIndex: Number(snap.backgroundIndex || 0),
            gameType: (snap.gameType as GameType) || 'ludo',
            hostId:
              typeof snap.hostId === 'string' && snap.hostId.trim()
                ? snap.hostId.trim()
                : client.playerId,
            permanentOwnerId:
              snapTier === 'basic' && !isSeededOfficial
                ? typeof snap.hostId === 'string' && snap.hostId.trim()
                  ? snap.hostId.trim()
                  : client.playerId
                : undefined,
            isPrivate: Boolean(snap.isPrivate),
            isLocked: snapTier === 'basic' ? Boolean(snap.isLocked) : false,
            isOfficial: isSeededOfficial,
          });
          if (snap.staff && typeof snap.staff === 'object') {
            for (const [uidKey, roleVal] of Object.entries(
              snap.staff as Record<string, unknown>
            )) {
              if (roleVal === 'moderator' || roleVal === 'cohost') {
                targetRoom.staff[uidKey] = roleVal;
              }
            }
          }
        }

        if (!targetRoom) {
          sendJson(ws, { type: 'room:left' });
          sendJson(ws, { type: 'error', message: 'انتهت جلسة هذه الغرفة المؤقتة' });
          return;
        }

        const rejoinKickedUntil = targetRoom.kickedUsers[client.playerId];
        if (rejoinKickedUntil && rejoinKickedUntil > Date.now() && targetRoom.hostId !== client.playerId) {
          sendJson(ws, {
            type: 'room:left',
            kicked: true,
            reason: `تم طردك من هذه الغرفة مؤقتاً (المتبقي: ${formatRemainingKickTime(rejoinKickedUntil)})`,
          });
          return;
        }

        if (targetRoom.cleanupTimeout) {
          clearTimeout(targetRoom.cleanupTimeout);
          targetRoom.cleanupTimeout = undefined;
        }

        if (client.roomId && client.roomId !== targetRoom.id) {
          removePlayerFromRoom(client.playerId, client.roomId);
        }

        if (
          targetRoom.permanentOwnerId === client.playerId ||
          ((targetRoom.isOfficial || targetRoom.tier === 'free') &&
            (targetRoom.hostId === 'official' || !targetRoom.members.has(targetRoom.hostId)))
        ) {
          targetRoom.hostId = client.playerId;
        }

        client.roomId = targetRoom.id;
        const member: RoomMember = {
          id: client.playerId,
          name: client.name,
          avatar: client.avatar,
          isHost: targetRoom.hostId === client.playerId,
          staffRole: getStaffRole(targetRoom, client.playerId),
        };
        targetRoom.members.set(client.playerId, member);
        seatPlayerInRoom(
          targetRoom,
          member,
          targetRoom.hostId === client.playerId ? 0 : undefined
        );
        syncRoleFlags(targetRoom);

        sendJson(ws, {
          type: 'room:state',
          room: serializeRoomForPlayer(targetRoom, client.playerId),
        });
        broadcastRoomState(targetRoom);
        broadcastRoomsDirectory();
        broadcastPresenceUpdate(client.playerId);
        return;
      }

      if (type === 'room:leave') {
        if (client.roomId) {
          removePlayerFromRoom(client.playerId, client.roomId);
          client.roomId = null;
        }
        sendJson(ws, { type: 'room:left' });
        sendJson(ws, { type: 'rooms:list', rooms: getPublicRoomSummaries() });
        broadcastPresenceUpdate(client.playerId);
        return;
      }

      const room = client.roomId ? rooms.get(client.roomId) : undefined;
      if (!room) {
        sendJson(ws, {
          type: 'error',
          message: 'تم إعادة مزامنة اتصال الغرفة، حاول الضغط مرة أخرى الآن',
        });
        return;
      }

      const myRole = getStaffRole(room, client.playerId);
      const canManageRoom = myRole === 'owner' || myRole === 'cohost';
      const isStaff = isRoomStaff(myRole);

      if (type === 'seat:take') {
        const seatIndex = Number(msg.seatIndex);
        const member = room.members.get(client.playerId);
        if (!member) return;
        if (seatIndex === 0 && room.hostId !== client.playerId) {
          sendJson(ws, { type: 'error', message: 'المايك الأول مخصص لصاحب الغرفة فقط' });
          return;
        }
        const candidateSeat = room.seats[seatIndex];
        if (!candidateSeat) return;
        if (candidateSeat.playerId !== null && candidateSeat.playerId !== client.playerId) {
          sendJson(ws, { type: 'error', message: 'هذا المايك مشغول حالياً' });
          return;
        }
        if (candidateSeat.isLocked || (room.micsLocked && seatIndex > 0)) {
          sendJson(ws, {
            type: 'error',
            message: isStaff
              ? 'هذا المايك مقفل حالياً · افتح القفل أولاً للجلوس عليه'
              : 'هذا المايك مقفل حالياً من قِبل إدارة الغرفة',
          });
          return;
        }
        for (const s of room.seats) {
          if (s.playerId === client.playerId) {
            s.playerId = null;
            s.playerName = null;
            s.avatar = null;
            s.staffRole = 'guest';
            s.isMuted = false;
            s.forceMuted = false;
            s.isSpeaking = false;
          }
        }
        seatPlayerInRoom(room, member, seatIndex);
        broadcastRoomState(room);
        broadcastRoomsDirectory();
        return;
      }

      if (type === 'seat:leave') {
        for (const s of room.seats) {
          if (s.playerId === client.playerId) {
            s.playerId = null;
            s.playerName = null;
            s.avatar = null;
            s.staffRole = 'guest';
            s.isMuted = false;
            s.forceMuted = false;
            s.isSpeaking = false;
          }
        }
        broadcastRoomState(room);
        broadcastRoomsDirectory();
        return;
      }

      if (type === 'seat:mic') {
        const isForceMuted = room.mutedUsers.has(client.playerId);
        if (msg.isMuted === false && isForceMuted) {
          sendJson(ws, {
            type: 'error',
            message: 'تم كتم المايك الخاص بك من قِبل إدارة الغرفة',
          });
          for (const s of room.seats) {
            if (s.playerId === client.playerId) {
              s.isMuted = true;
              s.forceMuted = true;
              s.isSpeaking = false;
            }
          }
          broadcastRoomState(room);
          return;
        }
        for (const s of room.seats) {
          if (s.playerId === client.playerId) {
            if (isForceMuted) {
              s.isMuted = true;
              s.forceMuted = true;
              s.isSpeaking = false;
            } else {
              if (typeof msg.isMuted === 'boolean') s.isMuted = msg.isMuted;
              if (typeof msg.isSpeaking === 'boolean') {
                s.isSpeaking = s.isMuted ? false : msg.isSpeaking;
              }
            }
          }
        }
        broadcastRoomState(room);
        return;
      }

      if (type === 'seat:mute_target') {
        const targetUid = String(msg.targetUid || '');
        const nextMuted = Boolean(msg.isMuted);
        if (!targetUid || targetUid === client.playerId) return;
        const targetMember = room.members.get(targetUid);
        const targetRole = getStaffRole(room, targetUid);
        if (!canMuteTarget(myRole, targetRole)) {
          sendJson(ws, {
            type: 'error',
            message:
              myRole === 'moderator'
                ? 'صلاحية المشرف تسمح بكتم أو إلغاء كتم الضيوف فقط'
                : myRole === 'cohost'
                  ? 'صلاحية نائب الغرفة تسمح بكتم أو إلغاء كتم الضيوف والمشرفين فقط'
                  : 'لا تملك صلاحية كتم هذا العضو',
          });
          return;
        }
        if (nextMuted) {
          room.mutedUsers.add(targetUid);
        } else {
          room.mutedUsers.delete(targetUid);
        }
        for (const s of room.seats) {
          if (s.playerId === targetUid) {
            s.isMuted = nextMuted;
            s.forceMuted = nextMuted;
            if (nextMuted) s.isSpeaking = false;
          }
        }
        if (targetMember) {
          targetMember.isForceMuted = nextMuted;
          addSystemMessage(
            room,
            nextMuted
              ? `قام ${client.name} بكتم مايك ${targetMember.name}`
              : `قام ${client.name} بإلغاء كتم مايك ${targetMember.name}`
          );
        }
        broadcastRoomState(room);
        return;
      }

      if (type === 'seat:set_lock') {
        if (!isStaff) {
          sendJson(ws, {
            type: 'error',
            message: 'قفل وفتح المايكات متاح لصاحب الغرفة أو النائب أو المشرفين فقط',
          });
          return;
        }
        const seatIndex = Number(msg.seatIndex);
        const nextLocked = Boolean(msg.isLocked);
        if (seatIndex === 0) {
          sendJson(ws, { type: 'error', message: 'مايك صاحب الغرفة لا يمكن قفله' });
          return;
        }
        const seat = room.seats.find((s) => s.index === seatIndex);
        if (!seat) return;
        seat.isLocked = nextLocked;
        if (!nextLocked && room.micsLocked) {
          room.micsLocked = false;
        }
        addSystemMessage(
          room,
          nextLocked
            ? `قام ${client.name} بقفل المايك رقم ${seatIndex + 1}`
            : `قام ${client.name} بفتح المايك رقم ${seatIndex + 1}`
        );
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:set_mics_lock') {
        if (!isStaff) {
          sendJson(ws, {
            type: 'error',
            message: 'قفل وفتح المايكات متاح لصاحب الغرفة أو النائب أو المشرفين فقط',
          });
          return;
        }
        const nextLocked = Boolean(msg.isLocked);
        room.micsLocked = nextLocked;
        for (const s of room.seats) {
          if (s.index >= 1) {
            s.isLocked = nextLocked;
          }
        }
        addSystemMessage(
          room,
          nextLocked
            ? `قام ${client.name} بقفل مايكات الضيوف في الغرفة`
            : `قام ${client.name} بفتح جميع المايكات في الغرفة`
        );
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:kick') {
        const targetUid = String(msg.targetUid || '');
        if (!targetUid || targetUid === client.playerId) return;
        const targetMember = room.members.get(targetUid);
        if (!targetMember) return;
        const targetRole = getStaffRole(room, targetUid);
        if (!canKickTarget(myRole, targetRole)) {
          sendJson(ws, {
            type: 'error',
            message:
              myRole === 'moderator'
                ? 'صلاحية المشرف تسمح بطرد الضيوف فقط'
                : myRole === 'cohost'
                  ? 'صلاحية نائب الغرفة تسمح بطرد المشرفين والضيوف فقط'
                  : 'لا تملك صلاحية طرد هذا العضو',
          });
          return;
        }

        const rawDuration = Number(msg.durationMinutes);
        const durationMinutes =
          rawDuration === 1440 ? 1440 : rawDuration === 60 ? 60 : 5;
        const durationLabel = formatKickDurationLabel(durationMinutes);

        delete room.staff[targetUid];
        room.mutedUsers.delete(targetUid);
        room.kickedUsers[targetUid] = Date.now() + durationMinutes * 60 * 1000;

        for (const [sock, c] of clients.entries()) {
          if (c.playerId === targetUid && c.roomId === room.id) {
            c.roomId = null;
            sendJson(sock, {
              type: 'room:left',
              kicked: true,
              reason: `تم طردك من الغرفة "${room.title}" بواسطة ${client.name} لمدة ${durationLabel}`,
            });
            sendJson(sock, { type: 'rooms:list', rooms: getPublicRoomSummaries() });
          }
        }

        room.members.delete(targetUid);
        for (const seat of room.seats) {
          if (seat.playerId === targetUid) {
            seat.playerId = null;
            seat.playerName = null;
            seat.avatar = null;
            seat.staffRole = 'guest';
            seat.isBot = false;
            seat.isMuted = false;
            seat.forceMuted = false;
            seat.isSpeaking = false;
          }
        }
        addSystemMessage(
          room,
          `تم طرد ${targetMember.name} من الغرفة بواسطة ${client.name} لمدة ${durationLabel}`
        );
        broadcastRoomState(room);
        broadcastRoomsDirectory();
        broadcastPresenceUpdate(targetUid);
        return;
      }

      if (type === 'room:switch_game') {
        if (!canManageRoom) {
          sendJson(ws, { type: 'error', message: 'تبديل اللعبة متاح لصاحب الغرفة أو النائب فقط' });
          return;
        }
        const caps = getRoomCapabilities(room.tier, room.xp);
        const nextGame = msg.gameType as GameType;
        if (!caps.allowedGames.includes(nextGame)) {
          sendJson(ws, {
            type: 'error',
            message: 'هذه اللعبة متاحة في الغرفة الأساسية الدائمة فقط',
          });
          return;
        }
        clearRoomTimers(room);
        room.gameType = nextGame;
        room.ludo = createInitialLudo();
        room.snakes = createInitialSnakes();
        room.bank = createInitialBank();
        room.jackaroo = createInitialJackaroo();
        room.draw = createInitialDraw();
        room.racing = createInitialRacing();
        broadcastRoomState(room);
        broadcastRoomsDirectory();
        return;
      }

      if (type === 'room:set_background') {
        if (!isStaff) {
          sendJson(ws, {
            type: 'error',
            message: 'تغيير خلفية الغرفة متاح لصاحب الغرفة أو النائب أو المشرفين فقط',
          });
          return;
        }
        const bgIdx = Number(msg.backgroundIndex);
        const caps = getRoomCapabilities(room.tier, room.xp);
        if (bgIdx < 0 || bgIdx >= caps.backgroundsCount) {
          sendJson(ws, { type: 'error', message: 'هذه الخلفية لم تُفتح بعد في مستوى الغرفة الحالي' });
          return;
        }
        room.backgroundIndex = bgIdx;
        broadcastRoomState(room);
        return;
      }

      if (type === 'room:set_lock') {
        if (!isStaff) {
          sendJson(ws, {
            type: 'error',
            message: 'فتح أو قفل كلمة مرور الغرفة متاح لصاحب الغرفة أو النائب أو المشرفين فقط',
          });
          return;
        }
        if (room.tier !== 'basic') {
          sendJson(ws, {
            type: 'error',
            message: 'ميزة قفل كلمة مرور الغرفة متاحة في الغرف الأساسية الدائمة فقط',
          });
          return;
        }
        const nextLocked = Boolean(msg.isLocked);
        const nextPin =
          nextLocked && typeof msg.lockPin === 'string' ? msg.lockPin.trim().slice(0, 16) : '';
        room.isLocked = nextLocked;
        room.lockPin = nextLocked ? nextPin : '';
        addSystemMessage(
          room,
          room.isLocked
            ? room.lockPin
              ? `قام ${client.name} بتفعيل كلمة مرور للغرفة`
              : `قام ${client.name} بقفل الغرفة (الدخول للإدارة فقط)`
            : `قام ${client.name} بفتح الغرفة وإلغاء القفل`
        );
        broadcastRoomState(room);
        broadcastRoomsDirectory();
        return;
      }

      if (type === 'room:set_staff') {
        if (myRole !== 'owner' && myRole !== 'cohost') {
          sendJson(ws, {
            type: 'error',
            message: 'إدارة المشرفين متاحة لصاحب الغرفة أو النائب فقط',
          });
          return;
        }
        const targetUid = String(msg.targetUid || '');
        const role = msg.role as 'moderator' | 'cohost' | null;
        if (!targetUid || targetUid === room.hostId) return;

        const existingTargetRole = getStaffRole(room, targetUid);
        if (myRole === 'cohost' && (role === 'cohost' || existingTargetRole === 'cohost')) {
          sendJson(ws, {
            type: 'error',
            message: 'تعيين أو إلغاء تعيين نائب الغرفة متاح لصاحب الغرفة فقط',
          });
          return;
        }

        const caps = getRoomCapabilities(room.tier, room.xp);
        const targetName = room.members.get(targetUid)?.name || 'عضو';
        if (role === 'moderator') {
          const currentMods = Object.values(room.staff).filter((r) => r === 'moderator').length;
          if (room.staff[targetUid] !== 'moderator' && currentMods >= caps.maxMods) {
            sendJson(ws, {
              type: 'error',
              message: `وصلت للحد الأقصى للمشرفين (${caps.maxMods}) في هذا المستوى`,
            });
            return;
          }
          room.staff[targetUid] = 'moderator';
          addSystemMessage(room, `تم تعيين ${targetName} مشرفاً في الغرفة بواسطة ${client.name}`);
        } else if (role === 'cohost') {
          const currentCoHosts = Object.values(room.staff).filter((r) => r === 'cohost').length;
          if (room.staff[targetUid] !== 'cohost' && currentCoHosts >= caps.maxCoHosts) {
            sendJson(ws, {
              type: 'error',
              message:
                caps.maxCoHosts === 0
                  ? 'نواب الغرفة غير متاحين في هذا المستوى'
                  : `الحد الأقصى لنواب الغرفة في هذا المستوى هو ${caps.maxCoHosts}`,
            });
            return;
          }
          room.staff[targetUid] = 'cohost';
          addSystemMessage(room, `تم تعيين ${targetName} نائباً لصاحب الغرفة`);
        } else {
          delete room.staff[targetUid];
          addSystemMessage(room, `تمت إزالة صلاحيات الإدارة من ${targetName} بواسطة ${client.name}`);
        }
        syncRoleFlags(room);
        broadcastRoomState(room);
        return;
      }

      if (type === 'reaction:send') {
        const emoji = String(msg.emoji || '🔥').slice(0, 8);
        for (const s of room.seats) {
          if (s.playerId === client.playerId) {
            s.lastReaction = { emoji, ts: Date.now() };
          }
        }
        broadcastRoomState(room);
        return;
      }

      if (type === 'gift:send') {
        const gift = GIFT_ITEMS.find((g) => g.id === msg.giftId);
        if (!gift) return;
        const recipientName = String(msg.recipientName || 'الجميع');
        const maxAllowed = getMaxGiftPayback(gift.cost);
        let paybackCoins = 0;
        if (typeof msg.paybackCoins === 'number' && msg.paybackCoins > 0) {
          paybackCoins = Math.min(Math.floor(msg.paybackCoins), maxAllowed);
        } else if (maxAllowed > 0) {
          paybackCoins = calculateGiftPayback(gift.cost);
        }

        let levelUpNote = '';
        if (room.tier === 'basic') {
          const prevCaps = getRoomCapabilities('basic', room.xp);
          const xpGain = Math.floor(gift.cost / 10);
          room.xp += xpGain;
          const nextCaps = getRoomCapabilities('basic', room.xp);
          resizeSeatsForRoom(room);
          if (nextCaps.level > prevCaps.level) {
            levelUpNote = ` · ترقت الغرفة إلى المستوى ${nextCaps.level}!`;
          }
        }

        const paybackNote = paybackCoins > 0 ? ` (🎁 مردود حظ: +${paybackCoins} عملة!)` : '';

        room.messages.push({
          id: uid('msg'),
          senderId: client.playerId,
          senderName: client.name,
          senderAvatar: client.avatar,
          text: `أرسل ${gift.emoji} ${gift.name} (${gift.cost} عملة) إلى ${recipientName}${levelUpNote}${paybackNote}`,
          type: 'gift',
          giftId: gift.id,
          giftCost: gift.cost,
          paybackCoins,
          likedBy: [],
          timestamp: Date.now(),
        });
        if (room.messages.length > 80) room.messages = room.messages.slice(-80);
        broadcastRoomState(room);
        broadcastRoomsDirectory();
        return;
      }

      if (type === 'gift:like') {
        const messageId = String(msg.messageId || '');
        const targetMsg = room.messages.find(
          (m) => m.id === messageId && m.type === 'gift'
        );
        if (!targetMsg) return;
        if (!Array.isArray(targetMsg.likedBy)) {
          targetMsg.likedBy = [];
        }
        const existingIdx = targetMsg.likedBy.indexOf(client.playerId);
        if (existingIdx >= 0) {
          targetMsg.likedBy.splice(existingIdx, 1);
        } else {
          targetMsg.likedBy.push(client.playerId);
        }
        broadcastRoomState(room);
        return;
      }

      if (type === 'chat:send') {
        const text = String(msg.text || '').trim().slice(0, 180);
        if (!text) return;

        if (
          room.gameType === 'draw' &&
          room.draw.phase === 'DRAWING' &&
          client.playerId !== room.draw.drawerId &&
          !room.draw.guessedPlayerIds.includes(client.playerId) &&
          normalizeArabic(text) === normalizeArabic(room.draw.actualWord)
        ) {
          room.draw.guessedPlayerIds.push(client.playerId);
          const pts = Math.max(10, 35 - room.draw.guessedPlayerIds.length * 5);
          room.draw.scores[client.playerId] = (room.draw.scores[client.playerId] || 0) + pts;
          if (room.draw.drawerId) {
            room.draw.scores[room.draw.drawerId] = (room.draw.scores[room.draw.drawerId] || 0) + 15;
          }
          room.messages.push({
            id: uid('msg'),
            senderId: client.playerId,
            senderName: client.name,
            senderAvatar: client.avatar,
            text: `خمّن الكلمة الصحيحة! (+${pts} نقطة)`,
            type: 'guess_correct',
            timestamp: Date.now(),
          });
          const eligibleGuessers = room.seats.filter(
            (s) => s.playerId && !s.isBot && s.playerId !== room.draw.drawerId
          );
          if (room.draw.guessedPlayerIds.length >= eligibleGuessers.length) {
            finishDrawRound(room);
          } else {
            broadcastRoomState(room);
          }
          return;
        }

        room.messages.push({
          id: uid('msg'),
          senderId: client.playerId,
          senderName: client.name,
          senderAvatar: client.avatar,
          text,
          type: 'chat',
          timestamp: Date.now(),
        });
        if (room.messages.length > 80) room.messages = room.messages.slice(-80);
        broadcastRoomState(room);
        return;
      }

      // ---- LUDO ----
      if (type === 'ludo:start') {
        if (!canManageRoom) return;
        const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
        if (seatedHumans.length === 0) return;
        const players: LudoPlayerState[] = seatedHumans.slice(0, 4).map((s, idx) => ({
          playerId: s.playerId as string,
          name: s.playerName || 'لاعب',
          color: LUDO_COLORS[idx],
          isBot: false,
          tokens: [-1, -1, -1, -1],
        }));
        if (msg.withBot && players.length === 1) {
          players.push({
            playerId: 'ludo_bot_1',
            name: 'روبوت التدريب',
            color: LUDO_COLORS[2],
            isBot: true,
            tokens: [-1, -1, -1, -1],
          });
        }
        if (players.length < 2) return;
        room.ludo = {
          phase: 'PLAYING',
          players,
          currentTurnIndex: 0,
          diceValue: null,
          hasRolled: false,
          movableTokenIndices: [],
          winnerId: null,
          lastEventText: `بدأ السباق! دور ${players[0].name}`,
          turnTimeLeft: BOARD_TURN_SECONDS,
          turnDuration: BOARD_TURN_SECONDS,
        };
        startBoardTurnTimer(room, 'ludo');
        broadcastRoomState(room);
        return;
      }
      if (type === 'ludo:roll') { executeLudoRoll(room, client.playerId); return; }
      if (type === 'ludo:move') { executeLudoMove(room, client.playerId, Number(msg.tokenIndex)); return; }
      if (type === 'ludo:reset') {
        if (!canManageRoom) return;
        clearBoardTurnTimer(room);
        room.ludo = createInitialLudo();
        broadcastRoomState(room);
        return;
      }

      // ---- SNAKES & LADDERS ----
      if (type === 'snakes:start') {
        if (!canManageRoom) return;
        const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
        if (seatedHumans.length === 0) return;
        const players = seatedHumans.slice(0, 4).map((s, idx) => ({
          playerId: s.playerId as string,
          name: s.playerName || 'لاعب',
          color: PLAYER_COLORS[idx],
          isBot: false,
          position: 1,
        }));
        if (msg.withBot && players.length === 1) {
          players.push({
            playerId: 'snakes_bot_1',
            name: 'روبوت التدريب',
            color: PLAYER_COLORS[1],
            isBot: true,
            position: 1,
          });
        }
        if (players.length < 2) return;
        room.snakes = {
          phase: 'PLAYING',
          players,
          currentTurnIndex: 0,
          diceValue: null,
          winnerId: null,
          lastEventText: `دور ${players[0].name}`,
          turnTimeLeft: BOARD_TURN_SECONDS,
          turnDuration: BOARD_TURN_SECONDS,
        };
        startBoardTurnTimer(room, 'snakes');
        broadcastRoomState(room);
        return;
      }
      if (type === 'snakes:roll') { executeSnakesRoll(room, client.playerId); return; }
      if (type === 'snakes:reset') {
        if (!canManageRoom) return;
        clearBoardTurnTimer(room);
        room.snakes = createInitialSnakes();
        broadcastRoomState(room);
        return;
      }

      // ---- BANK AL-HAZ ----
      if (type === 'bank:start') {
        if (!canManageRoom) return;
        const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
        if (seatedHumans.length === 0) return;
        const players = seatedHumans.slice(0, 4).map((s, idx) => ({
          playerId: s.playerId as string,
          name: s.playerName || 'لاعب',
          color: PLAYER_COLORS[idx],
          isBot: false,
          position: 0,
          cash: 1500,
          bankrupt: false,
          jailTurns: 0,
        }));
        if (msg.withBot && players.length === 1) {
          players.push({
            playerId: 'bank_bot_1',
            name: 'روبوت التدريب',
            color: PLAYER_COLORS[1],
            isBot: true,
            position: 0,
            cash: 1500,
            bankrupt: false,
            jailTurns: 0,
          });
        }
        if (players.length < 2) return;
        room.bank = {
          phase: 'PLAYING',
          players,
          owners: {},
          buildings: {},
          currentTurnIndex: 0,
          diceValue: null,
          awaitingBuyTile: null,
          winnerId: null,
          lastEventText: `انطلقت جولة بنك الحظ! دور ${players[0].name}`,
          turnTimeLeft: BOARD_TURN_SECONDS,
          turnDuration: BOARD_TURN_SECONDS,
        };
        startBoardTurnTimer(room, 'bank');
        broadcastRoomState(room);
        return;
      }
      if (type === 'bank:roll') { executeBankRoll(room, client.playerId); return; }
      if (type === 'bank:buy') {
        const bank = room.bank;
        const active = bank.players[bank.currentTurnIndex];
        if (!active || active.playerId !== client.playerId || bank.awaitingBuyTile === null) return;
        const tile = BANK_BOARD_TILES[bank.awaitingBuyTile];
        if (msg.accept && tile && tile.price && active.cash >= tile.price) {
          active.cash -= tile.price;
          bank.owners[tile.index] = active.playerId;
          bank.lastEventText = `${active.name} اشترى ${tile.name} بـ ${tile.price} ج`;
        } else {
          bank.lastEventText = `${active.name} تخطى الشراء`;
        }
        advanceBankTurn(room);
        return;
      }
      if (type === 'bank:build') {
        const bank = room.bank;
        if (bank.phase !== 'PLAYING') return;
        const active = bank.players[bank.currentTurnIndex];
        if (!active || active.playerId !== client.playerId || active.bankrupt) return;
        const tileIndex = Number(msg.tileIndex);
        const tile = BANK_BOARD_TILES[tileIndex];
        if (!tile || tile.kind !== 'city' || !tile.buildCost) return;
        if (bank.owners[tileIndex] !== active.playerId) return;
        const currentHouses = bank.buildings[tileIndex] || 0;
        if (currentHouses >= 4 || active.cash < tile.buildCost) return;
        active.cash -= tile.buildCost;
        bank.buildings[tileIndex] = currentHouses + 1;
        bank.lastEventText =
          currentHouses + 1 === 4
            ? `${active.name} بنى فندقاً في ${tile.name}!`
            : `${active.name} بنى منزلاً (${currentHouses + 1}/3) في ${tile.name}`;
        broadcastRoomState(room);
        return;
      }
      if (type === 'bank:sell') {
        const bank = room.bank;
        if (bank.phase !== 'PLAYING') return;
        const active = bank.players[bank.currentTurnIndex];
        if (!active || active.playerId !== client.playerId || active.bankrupt) return;
        const tileIndex = Number(msg.tileIndex);
        const tile = BANK_BOARD_TILES[tileIndex];
        if (!tile || bank.owners[tileIndex] !== active.playerId) return;
        const houses = bank.buildings[tileIndex] || 0;
        const invested = (tile.price || 0) + houses * (tile.buildCost || 0);
        const refund = Math.round(invested * 0.7);
        active.cash += refund;
        delete bank.owners[tileIndex];
        delete bank.buildings[tileIndex];
        bank.lastEventText = `${active.name} باع عقار ${tile.name} للبنك مقابل ${refund} ج`;
        broadcastRoomState(room);
        return;
      }
      if (type === 'bank:pay_bail') {
        const bank = room.bank;
        if (bank.phase !== 'PLAYING') return;
        const active = bank.players[bank.currentTurnIndex];
        if (!active || active.playerId !== client.playerId || active.jailTurns <= 0) return;
        if (active.cash < 100) {
          sendJson(ws, { type: 'error', message: 'تحتاج إلى 100 ج لدفع الكفالة' });
          return;
        }
        active.cash -= 100;
        active.jailTurns = 0;
        bank.lastEventText = `${active.name} دفع كفالة 100 ج وخرج من السجن!`;
        startBoardTurnTimer(room, 'bank');
        broadcastRoomState(room);
        return;
      }
      if (type === 'bank:reset') {
        if (!canManageRoom) return;
        clearBoardTurnTimer(room);
        room.bank = createInitialBank();
        broadcastRoomState(room);
        return;
      }

      // ---- JACKAROO ----
      if (type === 'jackaroo:start') {
        if (!canManageRoom) return;
        const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
        if (seatedHumans.length === 0) return;
        const players = seatedHumans.slice(0, 4).map((s, idx) => ({
          playerId: s.playerId as string,
          name: s.playerName || 'لاعب',
          color: LUDO_COLORS[idx],
          isBot: false,
          marbles: [-1, -1, -1, -1],
          hand: dealJackarooInitialHand(),
        }));
        if (msg.withBot && players.length === 1) {
          players.push({
            playerId: 'jack_bot_1',
            name: 'روبوت التدريب',
            color: LUDO_COLORS[2],
            isBot: true,
            marbles: [-1, -1, -1, -1],
            hand: dealJackarooInitialHand(),
          });
        }
        if (players.length < 2) return;
        room.jackaroo = {
          phase: 'PLAYING',
          players,
          currentTurnIndex: 0,
          selectedCard: null,
          lastPlayedCard: null,
          winnerId: null,
          lastEventText: `بدأت جولة چاكارو! اختر كرت A أو K لإخراج أول حجر`,
          turnTimeLeft: BOARD_TURN_SECONDS,
          turnDuration: BOARD_TURN_SECONDS,
        };
        startBoardTurnTimer(room, 'jackaroo');
        broadcastRoomState(room);
        return;
      }
      if (type === 'jackaroo:select_card') {
        const active = room.jackaroo.players[room.jackaroo.currentTurnIndex];
        if (!active || active.playerId !== client.playerId) return;
        const cardVal = String(msg.card || '');
        if (!active.hand.includes(cardVal)) return;
        room.jackaroo.selectedCard = cardVal;
        broadcastRoomState(room);
        return;
      }
      if (type === 'jackaroo:play') {
        executeJackarooPlay(room, client.playerId, String(msg.card || ''), Number(msg.marbleIndex));
        return;
      }
      if (type === 'jackaroo:discard') {
        const active = room.jackaroo.players[room.jackaroo.currentTurnIndex];
        if (!active || active.playerId !== client.playerId) return;
        let idx = active.hand.indexOf(room.jackaroo.selectedCard || '');
        if (idx === -1) idx = 0;
        const removed = active.hand.splice(idx, 1)[0] || '5';
        active.hand.push(drawJackarooCard(active.marbles.every((m) => m === -1)));
        room.jackaroo.lastPlayedCard = removed;
        room.jackaroo.lastEventText = `${active.name} حرق كرت ${removed} وسحب بديلاً`;
        advanceJackarooTurn(room);
        return;
      }
      if (type === 'jackaroo:reset') {
        if (!canManageRoom) return;
        clearBoardTurnTimer(room);
        room.jackaroo = createInitialJackaroo();
        broadcastRoomState(room);
        return;
      }

      // ---- CAR RACING ----
      if (type === 'racing:start') {
        if (!canManageRoom) return;
        startRacingMatch(room, Boolean(msg.withBot));
        return;
      }
      if (type === 'racing:boost') {
        if (room.racing.phase !== 'RACING') return;
        const car = room.racing.players.find((p) => p.playerId === client.playerId);
        if (car) {
          car.speed = Math.min(5.5, car.speed + 2.4);
        }
        return;
      }
      if (type === 'racing:reset') {
        if (!canManageRoom) return;
        if (room.racingTimer) clearInterval(room.racingTimer);
        room.racing = createInitialRacing();
        broadcastRoomState(room);
        return;
      }

      // ---- DRAW & GUESS ----
      if (type === 'draw:start') {
        if (!canManageRoom) return;
        room.draw.scores = {};
        room.draw.drawerRotationIndex = 0;
        startDrawRound(room, 1);
        return;
      }
      if (type === 'draw:free_mode') {
        if (!canManageRoom) return;
        if (room.drawTimer) clearInterval(room.drawTimer);
        room.draw = {
          ...createInitialDraw(),
          phase: 'FREE_DRAW',
          drawerId: client.playerId,
          drawerName: client.name,
        };
        broadcastRoomState(room);
        return;
      }
      if (type === 'draw:choose_word') {
        if (room.draw.phase !== 'CHOOSING_WORD' || room.draw.drawerId !== client.playerId) return;
        const word = String(msg.word || '');
        if (!room.draw.wordChoices.includes(word)) return;
        beginDrawingPhase(room, word);
        return;
      }
      if (type === 'draw:stroke') {
        const canDraw =
          (room.draw.phase === 'DRAWING' && room.draw.drawerId === client.playerId) ||
          room.draw.phase === 'FREE_DRAW';
        if (!canDraw) return;
        const stroke = msg.stroke as DrawStroke;
        if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return;
        room.draw.strokes.push(stroke);
        if (room.draw.strokes.length > 250) room.draw.strokes = room.draw.strokes.slice(-250);
        broadcastRoomState(room);
        return;
      }
      if (type === 'draw:clear') {
        const canDraw =
          (room.draw.phase === 'DRAWING' && room.draw.drawerId === client.playerId) ||
          room.draw.phase === 'FREE_DRAW';
        if (!canDraw) return;
        room.draw.strokes = [];
        broadcastRoomState(room);
        return;
      }
      if (type === 'draw:undo') {
        const canDraw =
          (room.draw.phase === 'DRAWING' && room.draw.drawerId === client.playerId) ||
          room.draw.phase === 'FREE_DRAW';
        if (!canDraw) return;
        room.draw.strokes.pop();
        broadcastRoomState(room);
        return;
      }

      // ---- SPY & TRIVIA ----
      if (type === 'spy:start') { if (canManageRoom) startSpyGame(room); return; }
      if (type === 'spy:begin_clues') {
        if (canManageRoom && room.spy.phase === 'ROLE_REVEAL') {
          room.spy.phase = 'CLUE_ROUND';
          room.spy.currentTurnPlayerId = room.spy.turnOrder[0] || null;
          broadcastRoomState(room);
        }
        return;
      }
      if (type === 'spy:clue') {
        if (room.spy.phase !== 'CLUE_ROUND' || room.spy.currentTurnPlayerId !== client.playerId) return;
        const clueText = String(msg.text || '').trim().slice(0, 60);
        if (!clueText) return;
        room.spy.clues.push({ playerId: client.playerId, playerName: client.name, text: clueText });
        const idx = room.spy.turnOrder.indexOf(client.playerId);
        if (idx >= 0 && idx + 1 < room.spy.turnOrder.length) {
          room.spy.currentTurnPlayerId = room.spy.turnOrder[idx + 1];
        } else {
          room.spy.phase = 'VOTING';
          room.spy.currentTurnPlayerId = null;
        }
        broadcastRoomState(room);
        return;
      }
      if (type === 'spy:vote') {
        if (room.spy.phase !== 'VOTING') return;
        const targetId = String(msg.targetId || '');
        if (!room.spy.turnOrder.includes(targetId)) return;
        room.spy.votes[client.playerId] = targetId;
        if (Object.keys(room.spy.votes).length >= room.spy.turnOrder.length) {
          const tally: Record<string, number> = {};
          for (const v of Object.values(room.spy.votes)) tally[v] = (tally[v] || 0) + 1;
          let topId = room.spy.turnOrder[0];
          let topVotes = -1;
          let tie = false;
          for (const [pid, count] of Object.entries(tally)) {
            if (count > topVotes) { topVotes = count; topId = pid; tie = false; }
            else if (count === topVotes) { tie = true; }
          }
          room.spy.eliminatedPlayerId = tie ? null : topId;
          const spyCaught = !tie && room.spy.spyIds.includes(topId);
          room.spy.winner = spyCaught ? 'civilians' : 'spy';
          room.spy.phase = 'RESULT';
        }
        broadcastRoomState(room);
        return;
      }
      if (type === 'spy:reset') {
        if (!canManageRoom) return;
        room.spy = createInitialSpy();
        broadcastRoomState(room);
        return;
      }

      if (type === 'trivia:start') { if (canManageRoom) startTriviaGame(room); return; }
      if (type === 'trivia:answer') {
        if (room.trivia.phase !== 'QUESTION' || room.trivia.answers[client.playerId]) return;
        const optionIndex = Number(msg.optionIndex);
        const q = TRIVIA_QUESTIONS[room.trivia.currentQuestionIndex];
        const isCorrect = optionIndex === q.correctIndex;
        const points = isCorrect ? 100 + room.trivia.timeLeft * 5 : 0;
        room.trivia.answers[client.playerId] = { optionIndex, isCorrect, points };
        room.trivia.scores[client.playerId] = (room.trivia.scores[client.playerId] || 0) + points;
        const seatedHumans = room.seats.filter((s) => s.playerId && !s.isBot);
        if (seatedHumans.length > 0 && seatedHumans.every((s) => s.playerId && room.trivia.answers[s.playerId])) {
          revealTriviaQuestion(room);
        } else {
          broadcastRoomState(room);
        }
        return;
      }
    });

    ws.on('close', () => {
      const c = clients.get(ws);
      if (c && c.roomId) removePlayerFromRoom(c.playerId, c.roomId);
      clients.delete(ws);
      if (c && c.playerId) {
        const stillConnected = Array.from(clients.values()).some(
          (other) => other.playerId === c.playerId && other.ws.readyState === WebSocket.OPEN
        );
        if (!stillConnected) {
          lastSeenByUid.set(c.playerId, Date.now());
        }
        broadcastPresenceUpdate(c.playerId);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`YallaPlay server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
