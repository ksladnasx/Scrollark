import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { CardRecord, DocumentRecord, Settings, Statistics } from '../domain/types';
import { parseMarkdownToCards } from '../utils/markdown';
import { HOME_BACKGROUND_IMAGE_URL, HOME_BACKGROUND_IMAGE_URLS } from '../config/imageUrls';
import { formatDayLabel, nowIso, startOfLocalDay, uid } from '../utils/date';

const DB_NAME = 'scrollark.db';
const DEFAULT_SETTINGS: Settings = {
  sessionCardCount: 10,
  fontSize: 18,
  fontColor: '#171611',
  headerImage: 'warm0',
  fontFamily: 'LXGWWenKai',
  cardHeaderImageMode: 'local',
  homeBackgroundImageMode: 'remote',
  homeBackgroundImageUrl: HOME_BACKGROUND_IMAGE_URL,
  homeBackgroundDownloadDirectory: '',
  themeMode: 'system',
};

type CountRow = { count: number };
type SettingRow = { key: string; value: string };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  return dbPromise;
}

async function migrate() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      fileName TEXT NOT NULL,
      fileUri TEXT NOT NULL,
      storedPath TEXT NOT NULL,
      content TEXT NOT NULL,
      importedAt TEXT NOT NULL,
      cardCount INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documentId INTEGER NOT NULL,
      h1 TEXT NOT NULL,
      h2 TEXT NOT NULL,
      h3 TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sortOrder INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      isGot INTEGER NOT NULL DEFAULT 0,
      isFavorite INTEGER NOT NULL DEFAULT 0,
      getCount INTEGER NOT NULL DEFAULT 0,
      lastGotAt TEXT,
      headerImageUrl TEXT,
      FOREIGN KEY(documentId) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cardId INTEGER NOT NULL UNIQUE,
      note TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(cardId) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cardId INTEGER,
      type TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(cardId) REFERENCES cards(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_document ON cards(documentId);
    CREATE INDEX IF NOT EXISTS idx_cards_last_got ON cards(lastGotAt);
    CREATE INDEX IF NOT EXISTS idx_events_created ON events(createdAt);
  `);

  const cardColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(cards)');
  if (!cardColumns.some((column) => column.name === 'headerImageUrl')) {
    await db.execAsync('ALTER TABLE cards ADD COLUMN headerImageUrl TEXT;');
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.runAsync('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', key, String(value));
  }
}

export async function initializeDatabase() {
  await migrate();
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const rows = await db.getAllAsync<SettingRow>('SELECT key, value FROM settings');
  const next = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key === 'sessionCardCount') next.sessionCardCount = Number(row.value) || DEFAULT_SETTINGS.sessionCardCount;
    if (row.key === 'fontSize') next.fontSize = Number(row.value) || DEFAULT_SETTINGS.fontSize;
    if (row.key === 'fontColor') next.fontColor = row.value || DEFAULT_SETTINGS.fontColor;
    if (row.key === 'headerImage') next.headerImage = row.value || DEFAULT_SETTINGS.headerImage;
    if (row.key === 'fontFamily') next.fontFamily = row.value || DEFAULT_SETTINGS.fontFamily;
    if (row.key === 'cardHeaderImageMode') {
      next.cardHeaderImageMode = row.value === 'local' || row.value === 'remote' || row.value === 'hidden' ? row.value : DEFAULT_SETTINGS.cardHeaderImageMode;
    }
    if (row.key === 'homeBackgroundImageMode') {
      next.homeBackgroundImageMode = row.value === 'local' || row.value === 'remote' ? row.value : DEFAULT_SETTINGS.homeBackgroundImageMode;
    }
    if (row.key === 'homeBackgroundImageUrl') {
      next.homeBackgroundImageUrl = HOME_BACKGROUND_IMAGE_URLS.includes(row.value as (typeof HOME_BACKGROUND_IMAGE_URLS)[number]) ? row.value : DEFAULT_SETTINGS.homeBackgroundImageUrl;
    }
    if (row.key === 'homeBackgroundDownloadDirectory') {
      next.homeBackgroundDownloadDirectory = row.value || DEFAULT_SETTINGS.homeBackgroundDownloadDirectory;
    }
    if (row.key === 'themeMode') {
      next.themeMode = row.value === 'system' || row.value === 'light' || row.value === 'dark' ? row.value : DEFAULT_SETTINGS.themeMode;
    }
  }
  return next;
}

export async function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', key, String(value));
}

export async function importMarkdownDocument(): Promise<{ document: DocumentRecord; cards: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/markdown', 'text/plain', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (!asset.name.toLowerCase().endsWith('.md') && asset.mimeType && !asset.mimeType.includes('markdown') && !asset.mimeType.includes('text')) {
    throw new Error('请选择 Markdown（.md）或文本文件');
  }

  const picked = new File(asset.uri);
  const content = await picked.text();
  const parsed = parseMarkdownToCards(content, asset.name);

  const docsDir = new Directory(Paths.document, 'scrollark-documents');
  docsDir.create({ intermediates: true, idempotent: true });
  const storedName = `${uid('md')}-${asset.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  const stored = new File(docsDir, storedName);
  stored.create({ intermediates: true, overwrite: true });
  stored.write(content);

  const db = await getDb();
  let documentId = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const inserted = await txn.runAsync(
      'INSERT INTO documents(title, fileName, fileUri, storedPath, content, importedAt, cardCount) VALUES (?, ?, ?, ?, ?, ?, ?)',
      parsed.title,
      asset.name,
      asset.uri,
      stored.uri,
      content,
      nowIso(),
      parsed.cards.length,
    );
    documentId = inserted.lastInsertRowId;

    for (const card of parsed.cards) {
      await txn.runAsync(
        'INSERT INTO cards(documentId, h1, h2, h3, title, content, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        documentId,
        card.h1,
        card.h2,
        card.h3,
        card.title,
        card.content,
        card.sortOrder,
        nowIso(),
      );
    }
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', null, 'import', nowIso());
  });

  const document = await getDocument(documentId);
  if (!document) throw new Error('导入后读取文档失败');
  return { document, cards: parsed.cards.length };
}

export async function getDocument(id: number) {
  const db = await getDb();
  return db.getFirstAsync<DocumentRecord>('SELECT * FROM documents WHERE id = ?', id);
}

export async function listDocuments() {
  const db = await getDb();
  return db.getAllAsync<DocumentRecord>('SELECT * FROM documents ORDER BY importedAt DESC');
}

const cardSelect = `
  SELECT cards.*, documents.title as documentTitle, annotations.note as annotation
  FROM cards
  JOIN documents ON documents.id = cards.documentId
  LEFT JOIN annotations ON annotations.cardId = cards.id
`;

export async function listCards(limit = 200) {
  const db = await getDb();
  return db.getAllAsync<CardRecord>(`${cardSelect} ORDER BY cards.lastGotAt IS NOT NULL, cards.lastGotAt ASC, cards.createdAt DESC, cards.sortOrder ASC LIMIT ?`, limit);
}

export async function listFavoriteCards() {
  const db = await getDb();
  return db.getAllAsync<CardRecord>(`${cardSelect} WHERE cards.isFavorite = 1 ORDER BY cards.lastGotAt DESC, cards.createdAt DESC`);
}

export async function buildSessionCards(limit: number) {
  const db = await getDb();
  const rows = await db.getAllAsync<CardRecord>(
    `${cardSelect}
     ORDER BY CASE WHEN cards.isGot = 0 THEN 0 ELSE 1 END, COALESCE(cards.lastGotAt, '1970-01-01T00:00:00.000Z') ASC, RANDOM()
     LIMIT ?`,
    limit,
  );
  return rows;
}

export async function markGot(cardId: number, got: boolean) {
  const db = await getDb();
  const time = nowIso();
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (got) {
      await txn.runAsync('UPDATE cards SET isGot = 1, getCount = getCount + 1, lastGotAt = ? WHERE id = ?', time, cardId);
      await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', cardId, 'get', time);
    } else {
      await txn.runAsync('UPDATE cards SET isGot = 0 WHERE id = ?', cardId);
      await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', cardId, 'unget', time);
    }
  });
}

export async function toggleFavorite(cardId: number, favorite: boolean) {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE cards SET isFavorite = ? WHERE id = ?', favorite ? 1 : 0, cardId);
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', cardId, favorite ? 'favorite' : 'unfavorite', nowIso());
  });
}

export async function saveCardHeaderImageUrl(cardId: number, url: string) {
  const clean = url.trim();
  if (!clean) return;
  const db = await getDb();
  await db.runAsync('UPDATE cards SET headerImageUrl = ? WHERE id = ? AND (headerImageUrl IS NULL OR TRIM(headerImageUrl) = "")', clean, cardId);
}

export async function saveAnnotation(cardId: number, note: string) {
  const db = await getDb();
  const clean = note.trim();
  if (!clean) {
    await db.runAsync('DELETE FROM annotations WHERE cardId = ?', cardId);
    return;
  }
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      'INSERT INTO annotations(cardId, note, updatedAt) VALUES (?, ?, ?) ON CONFLICT(cardId) DO UPDATE SET note = excluded.note, updatedAt = excluded.updatedAt',
      cardId,
      clean,
      nowIso(),
    );
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', cardId, 'annotate', nowIso());
  });
}

export async function getStatistics(): Promise<Statistics> {
  const db = await getDb();
  const [totalCards, gotCards, favoriteCards, annotatedCards, documents] = await Promise.all([
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE isGot = 1'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE isFavorite = 1'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM annotations WHERE TRIM(note) != ""'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM documents'),
  ]);

  const today = startOfLocalDay();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todayGets = await db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE isGot = 1 AND lastGotAt >= ? AND lastGotAt < ?', today.toISOString(), tomorrow.toISOString());

  const week: Statistics['week'] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = startOfLocalDay();
    day.setDate(day.getDate() - i);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    const row = await db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE isGot = 1 AND lastGotAt >= ? AND lastGotAt < ?', day.toISOString(), nextDay.toISOString());
    week.push({ day: formatDayLabel(day), count: row?.count ?? 0 });
  }

  return {
    totalCards: totalCards?.count ?? 0,
    gotCards: gotCards?.count ?? 0,
    favoriteCards: favoriteCards?.count ?? 0,
    annotatedCards: annotatedCards?.count ?? 0,
    todayGets: todayGets?.count ?? 0,
    week,
    documents: documents?.count ?? 0,
  };
}

export async function resetAllData() {
  const db = await getDb();
  await db.execAsync('DELETE FROM events; DELETE FROM annotations; DELETE FROM cards; DELETE FROM documents;');
}
