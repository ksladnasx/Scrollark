export type TabKey = 'home' | 'review' | 'stats' | 'knowledge' | 'favorites' | 'settings';
export type CardHeaderImageMode = 'local' | 'remote' | 'hidden';
export type ThemeMode = 'system' | 'light' | 'dark';
export type Route = { name: 'tabs'; tab: TabKey } | { name: 'session' } | { name: 'review'; mode?: 'due' | 'ahead' } | { name: 'sessionEnd'; summary: SessionSummary } | { name: 'search' };

// get 时的自评等级：1 = 忘了，2 = 模糊，3 = 秒懂。评级驱动复习间隔进退。
export type MasteryRating = 1 | 2 | 3;

export type DocumentRecord = {
  id: number;
  title: string;
  fileName: string;
  fileUri: string;
  storedPath: string;
  content: string;
  importedAt: string;
  cardCount: number;
};

export type CardRecord = {
  id: number;
  documentId: number;
  documentTitle: string;
  h1: string;
  h2: string;
  h3: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  isGot: number;
  isFavorite: number;
  getCount: number;
  lastGotAt: string | null;
  headerImageUrl: string | null;
  annotation: string | null;
  mastery: number | null;
  nextReviewAt: string | null;
  reviewStage: number;
};

export type CardInput = Omit<CardRecord, 'id' | 'documentTitle' | 'createdAt' | 'isGot' | 'isFavorite' | 'getCount' | 'lastGotAt' | 'headerImageUrl' | 'annotation' | 'mastery' | 'nextReviewAt' | 'reviewStage'>;

export type Settings = {
  sessionCardCount: number;
  fontSize: number;
  headerImage: string;
  fontFamily: string;
  cardHeaderImageMode: CardHeaderImageMode;
  cardBackgroundImageUrl: string;
  cardImagePoolSize: number;
  dailyGetGoal: number;
  homeBackgroundImageUrl: string;
  homeBackgroundDownloadDirectory: string;
  themeMode: ThemeMode;
};

export type Statistics = {
  totalCards: number;
  gotCards: number;
  favoriteCards: number;
  annotatedCards: number;
  todayGets: number;
  todayReviews: number;
  goal: number;
  streakDays: number;
  week: { day: string; count: number }[];
  documents: number;
  dueCount: number;
  // 复习三状态：新近记忆（已 get 未评级）/ 巩固中（评级后档位 0-2）/ 已掌握（档位 3+）。
  recentCount: number;
  strengtheningCount: number;
  masteredCount: number;
  weakCount: number;
  dueWeakCount: number;
  tomorrowCount: number;
};

export type SessionSummary = {
  seen: number;
  got: number;
  favorites: number;
  annotations: number;
  reviews: number;
  ratings: { forgot: number; fuzzy: number; clear: number };
};

export type ParsedMarkdown = {
  title: string;
  cards: {
    h1: string;
    h2: string;
    h3: string;
    title: string;
    content: string;
    sortOrder: number;
  }[];
};
