export type TabKey = 'home' | 'knowledge' | 'favorites' | 'stats' | 'settings';
export type CardHeaderImageMode = 'local' | 'remote' | 'hidden';
export type Route = { name: 'tabs'; tab: TabKey } | { name: 'session' } | { name: 'sessionEnd'; summary: SessionSummary };

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
  annotation: string | null;
};

export type CardInput = Omit<CardRecord, 'id' | 'documentTitle' | 'createdAt' | 'isGot' | 'isFavorite' | 'getCount' | 'lastGotAt' | 'annotation'>;

export type Settings = {
  sessionCardCount: number;
  fontSize: number;
  fontColor: string;
  headerImage: string;
  fontFamily: string;
  cardHeaderImageMode: CardHeaderImageMode;
};

export type Statistics = {
  totalCards: number;
  gotCards: number;
  favoriteCards: number;
  annotatedCards: number;
  todayGets: number;
  week: { day: string; count: number }[];
  documents: number;
};

export type SessionSummary = {
  seen: number;
  got: number;
  favorites: number;
  annotations: number;
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
