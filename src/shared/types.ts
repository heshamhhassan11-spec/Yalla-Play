export type GameType =
  | 'ludo'
  | 'snakes'
  | 'bank'
  | 'jackaroo'
  | 'draw'
  | 'racing'
  | 'spy'
  | 'trivia';

export type RoomTier = 'free' | 'basic';

export type StaffRole = 'owner' | 'cohost' | 'moderator' | 'guest';

export type AvatarId =
  | 'falcon'
  | 'panda'
  | 'fox'
  | 'cat'
  | 'astronaut'
  | 'knight'
  | 'chef'
  | 'wizard';

export interface PlayerProfile {
  id: string;
  name: string;
  username?: string;
  email?: string;
  photoURL?: string;
  avatar: AvatarId;
  bio: string;
  coins: number;
  wins: number;
  gamesPlayed: number;
  basicRoomId: string;
  bannedUntilMs?: number;
  privacyHideOnline?: boolean;
  privacyHideRoom?: boolean;
  privacyBlockFriendRequests?: boolean;
}

export interface FriendInfo {
  uid: string;
  name: string;
  username: string;
  avatar: AvatarId;
}

export interface UserPresenceInfo {
  uid: string;
  status: 'online' | 'in_room' | 'offline';
  roomCode?: string;
  roomTitle?: string;
  isRoomLocked?: boolean;
  isRoomPrivate?: boolean;
  lastSeenMs?: number;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendRequest {
  requestId: string;
  fromUid: string;
  toUid: string;
  fromName: string;
  fromUsername: string;
  fromAvatar: AvatarId;
  toName: string;
  toUsername: string;
  toAvatar: AvatarId;
  status: FriendRequestStatus;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedId: string;
  reportedName: string;
  reason: string;
  description: string;
  reportedMessageText?: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAtMs: number;
}

export type SupportCategory = 'support' | 'complaint' | 'suggestion';
export type SupportTicketStatus = 'open' | 'replied' | 'closed';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  userId: string;
  userName: string;
  username: string;
  category: SupportCategory;
  subject: string;
  status: SupportTicketStatus;
  lastMessageText: string;
  lastSenderRole: 'user' | 'admin';
  createdAtMs: number;
  updatedAtMs: number;
  closedAtMs: number;
}

export interface SupportMessage {
  id: string;
  ticketNumber: string;
  ticketUserId: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  senderName: string;
  senderUsername: string;
  text: string;
  createdAtMs: number;
}

export interface DirectMessage {
  id: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  text: string;
  createdAtMs: number;
  readAtMs?: number;
  pending?: boolean;
}

export interface DirectChatThread {
  chatId: string;
  participantA: string;
  participantB: string;
  participantAName: string;
  participantBName: string;
  lastMessageText: string;
  lastSenderId: string;
  updatedAtMs: number;
}

export interface DailyTaskProgress {
  playTimeMin: number;
  voiceTimeMin: number;
  claimed: Record<string, boolean>;
  dateKey: string;
}

export interface CoinPackage {
  id: string;
  coins: number;
  priceEgp: number;
  popular?: boolean;
}

export type PaymentMethod = 'vodafone_cash' | 'instapay';
export type RechargeStatus = 'pending' | 'approved' | 'rejected';

export interface RechargeRequest {
  id: string;
  requestId: string;
  userId: string;
  userName: string;
  userEmail: string;
  packageId: string;
  coins: number;
  priceEgp: number;
  paymentMethod: PaymentMethod;
  targetNumber: string;
  senderInfo: string;
  receiptImage: string;
  status: RechargeStatus;
  adminNote: string;
  reviewedBy: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface RoomLevelSpec {
  level: number;
  minXp: number;
  maxXp: number | null;
  maxMods: number;
  maxCoHosts: number;
  maxMics: number;
  backgroundsCount: number;
}

export interface RoomBackgroundTheme {
  index: number;
  nameAr: string;
  unlockLevel: number;
  surfaceClass: string;
  headerTextClass: string;
}

export interface RoomMember {
  id: string;
  name: string;
  avatar: AvatarId;
  isHost: boolean;
  staffRole: StaffRole;
  isForceMuted?: boolean;
  isBot?: boolean;
}

export interface Seat {
  index: number;
  isOwnerSeat: boolean;
  playerId: string | null;
  playerName: string | null;
  avatar: AvatarId | null;
  staffRole: StaffRole;
  isBot?: boolean;
  isMuted: boolean;
  forceMuted?: boolean;
  isLocked?: boolean;
  isSpeaking: boolean;
  lastReaction?: {
    emoji: string;
    ts: number;
  };
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: AvatarId;
  text: string;
  type: 'chat' | 'system' | 'gift' | 'guess_correct';
  giftId?: string;
  giftCost?: number;
  paybackCoins?: number;
  likedBy?: string[];
  timestamp: number;
}

export type GiftPriceTier = 10 | 20 | 50 | 100 | 200 | 500 | 1500;

export interface GiftItem {
  id: string;
  name: string;
  emoji: string;
  cost: GiftPriceTier;
}

export interface DrawStroke {
  id: string;
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
}

export interface DrawGameState {
  phase: 'LOBBY' | 'CHOOSING_WORD' | 'DRAWING' | 'ROUND_END' | 'FREE_DRAW';
  drawerId: string | null;
  drawerName: string | null;
  wordChoices?: string[];
  maskedWord: string;
  wordLength: number;
  actualWord?: string;
  timeLeft: number;
  strokes: DrawStroke[];
  guessedPlayerIds: string[];
  scores: Record<string, number>;
  round: number;
  maxRounds: number;
}

export type LudoColor = 'red' | 'blue' | 'yellow' | 'green';

export interface LudoPlayerState {
  playerId: string;
  name: string;
  color: LudoColor;
  isBot?: boolean;
  tokens: number[];
}

export interface LudoGameState {
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  players: LudoPlayerState[];
  currentTurnIndex: number;
  diceValue: number | null;
  hasRolled: boolean;
  movableTokenIndices: number[];
  winnerId: string | null;
  lastEventText: string;
  turnTimeLeft: number;
  turnDuration: number;
}

export interface SnakesPlayerState {
  playerId: string;
  name: string;
  color: string;
  isBot?: boolean;
  position: number; // 1..100
}

export interface SnakesGameState {
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  players: SnakesPlayerState[];
  currentTurnIndex: number;
  diceValue: number | null;
  winnerId: string | null;
  lastEventText: string;
  turnTimeLeft: number;
  turnDuration: number;
}

export interface BankTile {
  index: number;
  name: string;
  kind: 'start' | 'city' | 'station' | 'chance' | 'chest' | 'tax' | 'rest' | 'jail' | 'goto_jail';
  price?: number;
  rent?: number;
  buildCost?: number;
  color?: string;
}

export interface BankPlayerState {
  playerId: string;
  name: string;
  color: string;
  isBot?: boolean;
  position: number; // 0..23
  cash: number;
  bankrupt: boolean;
  jailTurns: number;
}

export interface BankGameState {
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  players: BankPlayerState[];
  owners: Record<number, string>; // tileIndex -> playerId
  buildings: Record<number, number>; // tileIndex -> 0..4 (1-3 houses, 4 hotel)
  currentTurnIndex: number;
  diceValue: number | null;
  awaitingBuyTile: number | null;
  winnerId: string | null;
  lastEventText: string;
  turnTimeLeft: number;
  turnDuration: number;
}

export interface JackarooPlayerState {
  playerId: string;
  name: string;
  color: LudoColor;
  isBot?: boolean;
  marbles: number[]; // -1 base, 0..51 track, 52..55 home
  hand: string[]; // card ranks e.g. 'A','K','Q','J','10','7','4','5'
}

export interface JackarooGameState {
  phase: 'LOBBY' | 'PLAYING' | 'FINISHED';
  players: JackarooPlayerState[];
  currentTurnIndex: number;
  selectedCard: string | null;
  lastPlayedCard: string | null;
  winnerId: string | null;
  lastEventText: string;
  turnTimeLeft: number;
  turnDuration: number;
}

export interface RacingPlayerState {
  playerId: string;
  name: string;
  color: string;
  isBot?: boolean;
  progress: number; // 0..100
  speed: number;
  finishedOrder: number | null;
}

export interface RacingGameState {
  phase: 'LOBBY' | 'COUNTDOWN' | 'RACING' | 'FINISHED';
  countdown: number;
  players: RacingPlayerState[];
  winnerId: string | null;
  lastEventText: string;
}

export interface SpyClue {
  playerId: string;
  playerName: string;
  text: string;
}

export interface SpyGameState {
  phase: 'LOBBY' | 'ROLE_REVEAL' | 'CLUE_ROUND' | 'VOTING' | 'RESULT';
  round: number;
  category: string;
  myWord?: string;
  isMeSpy?: boolean;
  civilianWord?: string;
  spyWord?: string;
  spyIds?: string[];
  turnOrder: string[];
  currentTurnPlayerId: string | null;
  clues: SpyClue[];
  votes: Record<string, string>;
  eliminatedPlayerId: string | null;
  winner: 'civilians' | 'spy' | null;
}

export interface TriviaGameState {
  phase: 'LOBBY' | 'QUESTION' | 'REVEAL' | 'FINISHED';
  round: number;
  maxRounds: number;
  question: string;
  category: string;
  options: string[];
  correctIndex?: number;
  timeLeft: number;
  answers: Record<string, { optionIndex: number; isCorrect: boolean; points: number }>;
  scores: Record<string, number>;
}

export interface RoomSummary {
  id: string;
  code: string;
  title: string;
  tier: RoomTier;
  isPinnedId: boolean;
  level: number;
  xp: number;
  gameType: GameType;
  hostName: string;
  playerCount: number;
  seatedCount: number;
  maxSeats: number;
  expiresAtMs: number; // 0 if permanent
  isPrivate: boolean;
  isLocked: boolean;
  hasLockPin?: boolean;
  phaseLabel: string;
  isOfficial?: boolean;
}

export interface RoomFullState {
  id: string;
  code: string;
  title: string;
  tier: RoomTier;
  isPinnedId: boolean;
  level: number;
  xp: number;
  backgroundIndex: number;
  expiresAtMs: number; // 0 if permanent
  gameType: GameType;
  hostId: string;
  isPrivate: boolean;
  isLocked: boolean;
  hasLockPin?: boolean;
  micsLocked?: boolean;
  staff: Record<string, 'moderator' | 'cohost'>;
  seats: Seat[];
  members: RoomMember[];
  messages: ChatMessage[];
  ludo: LudoGameState;
  snakes: SnakesGameState;
  bank: BankGameState;
  jackaroo: JackarooGameState;
  draw: DrawGameState;
  racing: RacingGameState;
  spy: SpyGameState;
  trivia: TriviaGameState;
}

export interface AppReleaseInfo {
  version: string;
  buildId: string;
  releasedAt: string;
  titleAr: string;
  highlights: string[];
}
