export type TabKey = 'home' | 'review' | 'stats' | 'knowledge' | 'favorites' | 'settings';
export type CardHeaderImageMode = 'local' | 'remote' | 'hidden';
export type ThemeMode = 'system' | 'light' | 'dark';
// 知识库列表展示方式：按文件夹浏览（默认），或平铺显示全部文档。
export type KnowledgeListMode = 'folders' | 'documents';
// 设置页二级分类：一级页只显示入口，点入后进入对应详情页。
export type SettingsSection = 'reading' | 'wallpaper' | 'card' | 'pacing' | 'data' | 'about';
export type Route = { name: 'tabs'; tab: TabKey } | { name: 'session'; startCardId?: number } | { name: 'review'; mode?: 'due' | 'ahead' } | { name: 'sessionEnd'; summary: SessionSummary } | { name: 'search' } | { name: 'settingsDetail'; section: SettingsSection; tab: TabKey };

// get 时的自评等级：1 = 忘了，2 = 模糊，3 = 秒懂。评级驱动复习间隔进退。
export type MasteryRating = 1 | 2 | 3;

// 文件夹：文档与手写分组的容器。isDefault = 1 的是系统兜底文件夹（唯一，不可删除）。
export type FolderRecord = {
  id: number;
  name: string;
  isDefault: number;
  createdAt: string;
};

// 手写分组（= 一份「文件」）：归属某个文件夹，其下挂手写卡片。
export type CardGroupRecord = {
  id: number;
  name: string;
  folderId: number;
  createdAt: string;
};

export type CardGroupWithCount = CardGroupRecord & { cardCount: number };

export type DocumentRecord = {
  id: number;
  title: string;
  fileName: string;
  fileUri: string;
  storedPath: string;
  content: string;
  importedAt: string;
  cardCount: number;
  folderId: number | null;
};

export type CardRecord = {
  id: number;
  documentId: number;
  groupId: number | null;
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
  // 到期复习的单次数量（10/20/50），在复习流程页顶部可改；提前复习固定 30 张。
  reviewBatchSize: number;
  fontSize: number;
  // 正文字体间距（px）：-1 紧凑 / 0 标准 / 1 宽松 / 2 加宽，作用于阅读正文。
  fontLetterSpacing: number;
  headerImage: string;
  fontFamily: string;
  cardHeaderImageMode: CardHeaderImageMode;
  cardBackgroundImageUrl: string;
  cardImagePoolSize: number;
  dailyGetGoal: number;
  homeBackgroundImageUrl: string;
  homeBackgroundDownloadDirectory: string;
  themeMode: ThemeMode;
  knowledgeListMode: KnowledgeListMode;
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
  // 复习四状态按「最近一次反馈」划分（互斥，加总 = 已 GET 数）：
  // 新近记忆 = 已 get 未评级；需要复习 = 最近评「模糊记得」；已掌握 = 最近评「记得」；遗忘 = 最近评「不记得」。
  recentCount: number;
  fuzzyCount: number;
  clearCount: number;
  forgotCount: number;
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
