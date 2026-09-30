import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { CardRecord, DocumentRecord, Settings, Statistics } from '../domain/types';
import { parseMarkdownToCards } from '../utils/markdown';
import { CARD_REMOTE_IMAGE_URLS, HOME_BACKGROUND_IMAGE_URL, HOME_BACKGROUND_IMAGE_URLS } from '../config/imageUrls';
import { fontOptions } from '../theme/fonts';
import { formatDayLabel, nowIso, startOfLocalDay, uid } from '../utils/date';

const DB_NAME = 'scrollark.db';
const DEFAULT_SETTINGS: Settings = {
  sessionCardCount: 10,
  fontSize: 18,
  fontColor: '#171611',
  headerImage: 'warm0',
  fontFamily: 'LXGWWenKai',
  cardHeaderImageMode: 'remote',
  cardBackgroundImageUrl: CARD_REMOTE_IMAGE_URLS[0],
  cardImagePoolSize: 20,
  dailyGetGoal: 10,
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
    if (row.key === 'fontFamily') {
      // 字体键必须是当前注册的字体之一：老安装里可能存有已被移除的字体键。
      next.fontFamily = fontOptions.some((option) => option.key === row.value) ? row.value : DEFAULT_SETTINGS.fontFamily;
    }
    if (row.key === 'cardHeaderImageMode') {
      next.cardHeaderImageMode = row.value === 'local' || row.value === 'remote' || row.value === 'hidden' ? row.value : DEFAULT_SETTINGS.cardHeaderImageMode;
    }
    if (row.key === 'cardBackgroundImageUrl') {
      next.cardBackgroundImageUrl = CARD_REMOTE_IMAGE_URLS.includes(row.value as (typeof CARD_REMOTE_IMAGE_URLS)[number]) ? row.value : DEFAULT_SETTINGS.cardBackgroundImageUrl;
    }
    if (row.key === 'cardImagePoolSize') {
      const parsed = Number(row.value);
      next.cardImagePoolSize = row.value.trim() !== '' && [0, 4, 8, 16, 20].includes(parsed) ? parsed : DEFAULT_SETTINGS.cardImagePoolSize;
    }
    if (row.key === 'dailyGetGoal') {
      const parsed = Number(row.value);
      next.dailyGetGoal = row.value.trim() !== '' && [0, 5, 10, 20, 30].includes(parsed) ? parsed : DEFAULT_SETTINGS.dailyGetGoal;
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

async function pickMarkdownSource() {
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
  return { asset, content, parsed };
}

// 上传的文档在应用文档目录里存一份本机副本，避免依赖选择器的临时文件。
async function storeMarkdownCopy(content: string, originalName: string) {
  const docsDir = new Directory(Paths.document, 'scrollark-documents');
  docsDir.create({ intermediates: true, idempotent: true });
  const storedName = `${uid('md')}-${originalName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  const stored = new File(docsDir, storedName);
  stored.create({ intermediates: true, overwrite: true });
  stored.write(content);
  return stored;
}

export async function importMarkdownDocument(): Promise<{ document: DocumentRecord; cards: number } | null> {
  const picked = await pickMarkdownSource();
  if (!picked) return null;
  const { asset, content, parsed } = picked;
  const stored = await storeMarkdownCopy(content, asset.name);

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

// 更新文档：选择新的 Markdown 替换内容并重新生成卡片（原卡片的收藏与批注会被清除）。
export async function updateDocumentContent(documentId: number): Promise<{ document: DocumentRecord; cards: number } | null> {
  const picked = await pickMarkdownSource();
  if (!picked) return null;
  const { asset, content, parsed } = picked;
  const stored = await storeMarkdownCopy(content, asset.name);

  const db = await getDb();
  let oldStoredPath = '';
  let removedCardIds: number[] = [];
  await db.withExclusiveTransactionAsync(async (txn) => {
    const old = await txn.getFirstAsync<{ storedPath: string }>('SELECT storedPath FROM documents WHERE id = ?', documentId);
    if (!old) throw new Error('文档不存在或已被删除');
    oldStoredPath = old.storedPath;
    const oldCards = await txn.getAllAsync<{ id: number }>('SELECT id FROM cards WHERE documentId = ?', documentId);
    removedCardIds = oldCards.map((row) => row.id);

    await txn.runAsync('DELETE FROM cards WHERE documentId = ?', documentId);
    await txn.runAsync(
      'UPDATE documents SET title = ?, fileName = ?, fileUri = ?, storedPath = ?, content = ?, importedAt = ?, cardCount = ? WHERE id = ?',
      parsed.title,
      asset.name,
      asset.uri,
      stored.uri,
      content,
      nowIso(),
      parsed.cards.length,
      documentId,
    );
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
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', null, 'document-update', nowIso());
  });

  removeLocalFiles(oldStoredPath, removedCardIds);

  const document = await getDocument(documentId);
  if (!document) throw new Error('更新后读取文档失败');
  return { document, cards: parsed.cards.length };
}

// 删除文档及其全部卡片（外键级联），并清理本机副本与已下载的头图文件。
export async function deleteDocument(documentId: number) {
  const db = await getDb();
  const doc = await db.getFirstAsync<DocumentRecord>('SELECT * FROM documents WHERE id = ?', documentId);
  if (!doc) return;
  const cardRows = await db.getAllAsync<{ id: number }>('SELECT id FROM cards WHERE documentId = ?', documentId);
  await db.runAsync('DELETE FROM documents WHERE id = ?', documentId);
  removeLocalFiles(doc.storedPath, cardRows.map((row) => row.id));
}

function removeLocalFiles(storedPath: string, cardIds: number[]) {
  try {
    const stored = new File(storedPath);
    if (stored.exists) stored.delete();
  } catch {
    // 本机副本清理失败不影响数据删除。
  }
  const imageDir = new Directory(Paths.document, 'scrollark-card-images');
  for (const cardId of cardIds) {
    try {
      const image = new File(imageDir, `card-${cardId}.jpg`);
      if (image.exists) image.delete();
    } catch {
      // 头图清理失败不影响数据删除。
    }
  }
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

// 全局搜索：标题 / 正文 / 批注 任意命中即返回，标题命中排前。
export async function searchCards(query: string, limit = 50): Promise<CardRecord[]> {
  const clean = query.trim();
  if (!clean) return [];
  const like = `%${clean.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const db = await getDb();
  return db.getAllAsync<CardRecord>(
    `${cardSelect}
     WHERE cards.title LIKE ? ESCAPE '\\' OR cards.content LIKE ? ESCAPE '\\' OR annotations.note LIKE ? ESCAPE '\\'
     ORDER BY CASE WHEN cards.title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, cards.lastGotAt IS NOT NULL, cards.lastGotAt DESC, cards.sortOrder ASC
     LIMIT ?`,
    like,
    like,
    like,
    like,
    limit,
  );
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

// 切换卡片壁纸源后调用：清空已解析的头图，让卡片按新源重新解析。
export async function clearCardHeaderImageUrls() {
  const db = await getDb();
  await db.runAsync('UPDATE cards SET headerImageUrl = NULL');
}

// 当前仍被卡片引用的头图 URI（本机文件或远程地址），用于清理图池孤儿文件。
export async function getReferencedCardImageUrls(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ url: string }>("SELECT DISTINCT headerImageUrl AS url FROM cards WHERE headerImageUrl IS NOT NULL AND TRIM(headerImageUrl) != ''");
  return rows.map((row) => row.url).filter(Boolean);
}

// 单张卡片当前持久化的头图 URI（可能为 null：尚未解析或解析失败）。
export async function getCardHeaderImageUrl(cardId: number): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ url: string | null }>('SELECT headerImageUrl AS url FROM cards WHERE id = ?', cardId);
  const url = row?.url?.trim();
  return url ? url : null;
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

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 连续打卡天数：从今天（若已达标）或昨天往回数，连续达标的天数。
async function computeStreakDays(db: SQLite.SQLiteDatabase, goal: number): Promise<number> {
  const since = startOfLocalDay();
  since.setDate(since.getDate() - 90);
  const rows = await db.getAllAsync<{ lastGotAt: string }>('SELECT lastGotAt FROM cards WHERE isGot = 1 AND lastGotAt >= ?', since.toISOString());

  const counts = new Map<string, number>();
  for (const row of rows) {
    const stamped = new Date(row.lastGotAt);
    if (Number.isNaN(stamped.getTime())) continue;
    const key = localDayKey(stamped);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let streak = 0;
  const cursor = startOfLocalDay();
  if ((counts.get(localDayKey(cursor)) ?? 0) >= goal) streak += 1;
  cursor.setDate(cursor.getDate() - 1);
  while ((counts.get(localDayKey(cursor)) ?? 0) >= goal) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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

  const goalRow = await db.getFirstAsync<SettingRow>("SELECT value FROM settings WHERE key = 'dailyGetGoal'");
  const goalParsed = Number(goalRow?.value);
  const goal = goalRow?.value !== undefined && goalRow.value.trim() !== '' && [0, 5, 10, 20, 30].includes(goalParsed) ? goalParsed : DEFAULT_SETTINGS.dailyGetGoal;
  const streakDays = goal > 0 ? await computeStreakDays(db, goal) : 0;

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
    goal,
    streakDays,
    week,
    documents: documents?.count ?? 0,
  };
}

export async function resetAllData() {
  const db = await getDb();
  await db.execAsync('DELETE FROM events; DELETE FROM annotations; DELETE FROM cards; DELETE FROM documents;');
}
