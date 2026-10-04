import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import type { CardGroupRecord, CardGroupWithCount, CardRecord, DocumentRecord, FolderRecord, MasteryRating, Settings, Statistics } from '../domain/types';
import { parseMarkdownToCards } from '../utils/markdown';
import { CARD_REMOTE_IMAGE_URLS, HOME_BACKGROUND_IMAGE_URL, HOME_BACKGROUND_IMAGE_URLS } from '../config/imageUrls';
import { fontOptions } from '../theme/fonts';
import { formatDayLabel, nowIso, startOfLocalDay, uid } from '../utils/date';

const DB_NAME = 'scrollark.db';
const DEFAULT_SETTINGS: Settings = {
  sessionCardCount: 10,
  reviewBatchSize: 50,
  fontSize: 18,
  headerImage: 'warm0',
  fontFamily: 'LXGWWenKai',
  cardHeaderImageMode: 'remote',
  cardBackgroundImageUrl: CARD_REMOTE_IMAGE_URLS[0],
  cardImagePoolSize: 20,
  dailyGetGoal: 10,
  homeBackgroundImageUrl: HOME_BACKGROUND_IMAGE_URL,
  homeBackgroundDownloadDirectory: '',
  themeMode: 'system',
  knowledgeListMode: 'folders',
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

    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      isDefault INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS card_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      folderId INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_document ON cards(documentId);
    CREATE INDEX IF NOT EXISTS idx_cards_last_got ON cards(lastGotAt);
    CREATE INDEX IF NOT EXISTS idx_events_created ON events(createdAt);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_folder_name ON card_groups(folderId, name);
  `);

  const cardColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(cards)');
  if (!cardColumns.some((column) => column.name === 'headerImageUrl')) {
    await db.execAsync('ALTER TABLE cards ADD COLUMN headerImageUrl TEXT;');
  }
  // 评级与间隔重复：mastery 记最近一次自评（1 忘了 / 2 模糊 / 3 秒懂），
  // reviewStage 决定复习间隔档位，nextReviewAt 为下次到期时间。
  if (!cardColumns.some((column) => column.name === 'mastery')) {
    await db.execAsync('ALTER TABLE cards ADD COLUMN mastery INTEGER;');
  }
  if (!cardColumns.some((column) => column.name === 'nextReviewAt')) {
    await db.execAsync('ALTER TABLE cards ADD COLUMN nextReviewAt TEXT;');
  }
  if (!cardColumns.some((column) => column.name === 'reviewStage')) {
    await db.execAsync('ALTER TABLE cards ADD COLUMN reviewStage INTEGER NOT NULL DEFAULT 0;');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(nextReviewAt);');
  }
  if (!cardColumns.some((column) => column.name === 'forgetCount')) {
    await db.execAsync('ALTER TABLE cards ADD COLUMN forgetCount INTEGER NOT NULL DEFAULT 0;');
  }

  // 文件夹归属：documents.folderId 指向所在文件夹；手写卡片的 groupId 指向所属
  // 手写分组（分组 = 文件夹里的一份「文件」）。两张表在上方 CREATE 之后必然存在。
  const documentColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(documents)');
  if (!documentColumns.some((column) => column.name === 'folderId')) {
    await db.execAsync('ALTER TABLE documents ADD COLUMN folderId INTEGER;');
  }
  if (!cardColumns.some((column) => column.name === 'groupId')) {
    await db.execAsync('ALTER TABLE cards ADD COLUMN groupId INTEGER;');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_cards_group ON cards(groupId);');
  }

  // 兜底策略：默认文件夹始终存在；没有任何归属的文档/手写卡都归入它，不产生孤立数据。
  const defaultFolderId = await getDefaultFolderId(db);
  await db.runAsync('UPDATE documents SET folderId = ? WHERE folderId IS NULL', defaultFolderId);

  // 旧数据回填：手写卡原本只按 h2 存分组名，这里按分组名在默认文件夹下建出手写分组并挂上。
  const customDoc = await db.getFirstAsync<{ id: number }>('SELECT id FROM documents WHERE fileName = ?', CUSTOM_DOCUMENT_FILE_NAME);
  if (customDoc) {
    const names = await db.getAllAsync<{ h2: string }>('SELECT DISTINCT h2 FROM cards WHERE documentId = ? AND groupId IS NULL', customDoc.id);
    for (const row of names) {
      const groupName = row.h2.trim() || DEFAULT_CUSTOM_GROUP_NAME;
      const groupId = await getOrCreateCardGroup(db, defaultFolderId, groupName);
      await db.runAsync(
        'UPDATE cards SET groupId = ?, h2 = ? WHERE documentId = ? AND groupId IS NULL AND h2 = ?',
        groupId,
        groupName,
        customDoc.id,
        row.h2,
      );
    }
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
    if (row.key === 'reviewBatchSize') {
      const parsed = Number(row.value);
      next.reviewBatchSize = row.value.trim() !== '' && [10, 20, 50].includes(parsed) ? parsed : DEFAULT_SETTINGS.reviewBatchSize;
    }
    if (row.key === 'fontSize') next.fontSize = Number(row.value) || DEFAULT_SETTINGS.fontSize;
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
    if (row.key === 'knowledgeListMode') {
      next.knowledgeListMode = row.value === 'folders' || row.value === 'documents' ? row.value : DEFAULT_SETTINGS.knowledgeListMode;
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

// 导入文档：folderId 未提供（或为空）时归入默认文件夹，保证文档始终有合法归属。
export async function importMarkdownDocument(folderId?: number | null): Promise<{ document: DocumentRecord; cards: number } | null> {
  const picked = await pickMarkdownSource();
  if (!picked) return null;
  const { asset, content, parsed } = picked;
  const stored = await storeMarkdownCopy(content, asset.name);

  const db = await getDb();
  const targetFolderId = folderId ?? (await getDefaultFolderId(db));
  let documentId = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const inserted = await txn.runAsync(
      'INSERT INTO documents(title, fileName, fileUri, storedPath, content, importedAt, cardCount, folderId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      parsed.title,
      asset.name,
      asset.uri,
      stored.uri,
      content,
      nowIso(),
      parsed.cards.length,
      targetFolderId,
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

// 编辑文档：标题 / 所属文件夹 / Markdown 内容都在应用内直接改，不再走文件替换。
// 内容有变化时按新内容重新生成卡片（原卡片的收藏、批注与学习进度会被清除）；
// 只改标题或文件夹时不动卡片。folderId 为空时兜底到默认文件夹。
export async function updateDocument(
  documentId: number,
  input: { title: string; folderId: number | null; content?: string },
): Promise<{ document: DocumentRecord; cards: number; regenerated: boolean }> {
  const title = input.title.trim();
  if (!title) throw new Error('请填写文档标题');
  const db = await getDb();
  const doc = await db.getFirstAsync<DocumentRecord>('SELECT * FROM documents WHERE id = ?', documentId);
  if (!doc) throw new Error('文档不存在或已被删除');
  const targetFolderId = input.folderId ?? (await getDefaultFolderId(db));

  const normalize = (value: string) => value.replace(/\r\n/g, '\n');
  const nextContent = input.content !== undefined ? normalize(input.content) : null;
  const regenerated = nextContent !== null && nextContent !== normalize(doc.content);
  let cardCount = doc.cardCount;
  let removedCardIds: number[] = [];

  if (regenerated) {
    if (!nextContent.trim()) throw new Error('文档内容不能为空');
    const parsed = parseMarkdownToCards(nextContent, title);
    await db.withExclusiveTransactionAsync(async (txn) => {
      const oldCards = await txn.getAllAsync<{ id: number }>('SELECT id FROM cards WHERE documentId = ?', documentId);
      removedCardIds = oldCards.map((row) => row.id);
      await txn.runAsync('DELETE FROM cards WHERE documentId = ?', documentId);
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
      await txn.runAsync(
        'UPDATE documents SET title = ?, content = ?, cardCount = ?, folderId = ? WHERE id = ?',
        title,
        nextContent,
        parsed.cards.length,
        targetFolderId,
        documentId,
      );
      await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', null, 'document-update', nowIso());
    });
    cardCount = parsed.cards.length;
    // 清理被替换卡片的头图文件；原导入文件的本机副本保留（文档仍以它为来源快照）。
    removeCardHeaderImages(removedCardIds);
  } else {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync('UPDATE documents SET title = ?, folderId = ? WHERE id = ?', title, targetFolderId, documentId);
      await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', null, 'document-update', nowIso());
    });
  }

  const document = await getDocument(documentId);
  if (!document) throw new Error('更新后读取文档失败');
  return { document, cards: cardCount, regenerated };
}

// ===== 手写卡片：用户在应用内逐张创建，不经过 Markdown 文件 =====
// 所有手写卡归入同一份「手动创建」文档（fileName = 'custom-cards'），
// 完整复用文档→卡片的既有结构与级联删除；卡片正文里的本机配图存在 scrollark-custom-images。
// 层级：文件夹 → 手写分组（= 一份「文件」，见 card_groups 表）→ 卡片；
// 未选择文件夹/分组时分别兜底到「默认文件夹」和「手写」分组。
const CUSTOM_DOCUMENT_FILE_NAME = 'custom-cards';
const CUSTOM_DOCUMENT_TITLE = '手动创建';
const CUSTOM_IMAGE_DIR_NAME = 'scrollark-custom-images';
const CUSTOM_IMAGE_PATTERN = /!\[[^\]]*\]\((file:\/\/[^)]+)\)/g;
export const DEFAULT_CUSTOM_GROUP_NAME = '手写';

// ===== 文件夹管理 =====

export async function getDefaultFolderId(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM folders WHERE isDefault = 1');
  if (row) return row.id;
  const inserted = await db.runAsync('INSERT INTO folders(name, isDefault, createdAt) VALUES (?, 1, ?)', '默认文件夹', nowIso());
  return inserted.lastInsertRowId;
}

export async function listFolders(): Promise<FolderRecord[]> {
  const db = await getDb();
  return db.getAllAsync<FolderRecord>('SELECT * FROM folders ORDER BY isDefault DESC, id ASC');
}

export async function createFolder(name: string): Promise<FolderRecord> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('请填写文件夹名称');
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM folders WHERE LOWER(name) = LOWER(?)', clean);
  if (existing) throw new Error(`已存在名为「${clean}」的文件夹`);
  const inserted = await db.runAsync('INSERT INTO folders(name, isDefault, createdAt) VALUES (?, 0, ?)', clean, nowIso());
  const row = await db.getFirstAsync<FolderRecord>('SELECT * FROM folders WHERE id = ?', inserted.lastInsertRowId);
  if (!row) throw new Error('创建文件夹失败');
  return row;
}

// 删除文件夹：其中的文档与手写分组一并删除（卡片、批注随外键级联，事件置空），
// 文档本机副本、卡片头图与手写配图在事务成功后清理本机文件。
// 「手动创建」文档是全部手写卡的容器，不随文件夹删除：若它落在该文件夹下则移回默认文件夹，
// 其卡片数按被删分组的卡片数递减，其余分组下的手写卡保持不动。
export async function deleteFolder(folderId: number): Promise<void> {
  const db = await getDb();
  const folder = await db.getFirstAsync<{ id: number; isDefault: number }>('SELECT id, isDefault FROM folders WHERE id = ?', folderId);
  if (!folder) return;
  if (folder.isDefault === 1) throw new Error('默认文件夹不能删除');

  const docs = await db.getAllAsync<DocumentRecord>('SELECT * FROM documents WHERE folderId = ?', folderId);
  const deletableDocs = docs.filter((doc) => !isCustomDocument(doc));
  const docIds = deletableDocs.map((doc) => doc.id);
  const customDoc = docs.find((doc) => isCustomDocument(doc)) ?? null;
  const groupIds = (await db.getAllAsync<{ id: number }>('SELECT id FROM card_groups WHERE folderId = ?', folderId)).map((row) => row.id);

  // 事务前收集将被删除内容的本机文件引用（事务里不做文件操作，回滚时不留半清理状态）。
  const storedPaths = deletableDocs.filter((doc) => doc.storedPath).map((doc) => doc.storedPath);
  const headerCardIds: number[] = [];
  const customImageUris: string[] = [];
  let groupCardCount = 0;
  if (docIds.length > 0) {
    const docCards = await db.getAllAsync<{ id: number }>(`SELECT id FROM cards WHERE documentId IN (${docIds.map(() => '?').join(', ')})`, docIds);
    headerCardIds.push(...docCards.map((row) => row.id));
  }
  if (groupIds.length > 0) {
    const groupCards = await db.getAllAsync<{ id: number; content: string }>(`SELECT id, content FROM cards WHERE groupId IN (${groupIds.map(() => '?').join(', ')})`, groupIds);
    groupCardCount = groupCards.length;
    for (const card of groupCards) {
      headerCardIds.push(card.id);
      for (const match of card.content.matchAll(CUSTOM_IMAGE_PATTERN)) {
        customImageUris.push(match[1]);
      }
    }
  }

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const id of docIds) {
      await txn.runAsync('DELETE FROM documents WHERE id = ?', id);
    }
    if (groupIds.length > 0) {
      await txn.runAsync(`DELETE FROM cards WHERE groupId IN (${groupIds.map(() => '?').join(', ')})`, groupIds);
      await txn.runAsync(`DELETE FROM card_groups WHERE id IN (${groupIds.map(() => '?').join(', ')})`, groupIds);
    }
    const defaultId = await getDefaultFolderId(txn);
    if (customDoc) {
      await txn.runAsync('UPDATE documents SET folderId = ? WHERE id = ?', defaultId, customDoc.id);
      if (groupCardCount > 0) {
        await txn.runAsync('UPDATE documents SET cardCount = MAX(cardCount - ?, 0) WHERE id = ?', groupCardCount, customDoc.id);
      }
    }
    await txn.runAsync('DELETE FROM folders WHERE id = ?', folderId);
  });

  for (const storedPath of storedPaths) {
    try {
      const stored = new File(storedPath);
      if (stored.exists) stored.delete();
    } catch {
      // 本机副本清理失败不影响数据删除。
    }
  }
  removeCardHeaderImages(headerCardIds);
  await deleteCustomCardImages(customImageUris);
}

// ===== 手写分组（= 文件夹里的一份「文件」） =====

async function getOrCreateCardGroup(db: SQLite.SQLiteDatabase, folderId: number, name: string): Promise<number> {
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM card_groups WHERE folderId = ? AND name = ?', folderId, name);
  if (existing) return existing.id;
  const inserted = await db.runAsync('INSERT INTO card_groups(name, folderId, createdAt) VALUES (?, ?, ?)', name, folderId, nowIso());
  return inserted.lastInsertRowId;
}

export async function listCardGroupsWithCounts(): Promise<CardGroupWithCount[]> {
  const db = await getDb();
  return db.getAllAsync<CardGroupWithCount>(
    'SELECT g.id, g.name, g.folderId, g.createdAt, (SELECT COUNT(*) FROM cards WHERE cards.groupId = g.id) AS cardCount FROM card_groups g ORDER BY g.id ASC',
  );
}

// 新建手写分组：需要明确指定所属文件夹（未选时兜底默认文件夹）与分组名，同名直接报错。
export async function createCardGroup(folderId: number | null, name: string): Promise<CardGroupRecord> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('请填写分组名称');
  const db = await getDb();
  const targetFolderId = folderId ?? (await getDefaultFolderId(db));
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM card_groups WHERE folderId = ? AND name = ?', targetFolderId, clean);
  if (existing) throw new Error(`该文件夹下已存在名为「${clean}」的分组`);
  const inserted = await db.runAsync('INSERT INTO card_groups(name, folderId, createdAt) VALUES (?, ?, ?)', clean, targetFolderId, nowIso());
  const row = await db.getFirstAsync<CardGroupRecord>('SELECT * FROM card_groups WHERE id = ?', inserted.lastInsertRowId);
  if (!row) throw new Error('创建分组失败');
  return row;
}

export async function listCardsByGroup(groupId: number): Promise<CardRecord[]> {
  const db = await getDb();
  return db.getAllAsync<CardRecord>(`${cardSelect} WHERE cards.groupId = ? ORDER BY cards.sortOrder ASC`, groupId);
}

// 编辑手写分组：改名与移动到其他文件夹（与文档编辑同一套信息编辑口径）。
// 目标文件夹下已存在同名分组时直接报错（改名场景合并会让人意外，先改名再移动更清晰）；
// 分组名变化会同步其下卡片的 h2 展示字段。
export async function updateCardGroup(groupId: number, input: { name: string; folderId: number | null }): Promise<void> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('请填写分组名称');
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const group = await txn.getFirstAsync<CardGroupRecord>('SELECT * FROM card_groups WHERE id = ?', groupId);
    if (!group) throw new Error('分组不存在或已被删除');
    const folderId = input.folderId ?? (await getDefaultFolderId(txn));
    const conflict = await txn.getFirstAsync<{ id: number }>('SELECT id FROM card_groups WHERE folderId = ? AND name = ?', folderId, name);
    if (conflict && conflict.id !== groupId) {
      throw new Error(`目标文件夹下已存在名为「${name}」的分组`);
    }
    await txn.runAsync('UPDATE card_groups SET name = ?, folderId = ? WHERE id = ?', name, folderId, groupId);
    await txn.runAsync('UPDATE cards SET h2 = ? WHERE groupId = ?', name, groupId);
  });
}

// 删除手写分组：其中卡片与配图一并删除（与删除文档同一套兜底口径）。
export async function deleteCardGroup(groupId: number): Promise<void> {
  const db = await getDb();
  let imageUris: string[] = [];
  await db.withExclusiveTransactionAsync(async (txn) => {
    const group = await txn.getFirstAsync<{ id: number }>('SELECT id FROM card_groups WHERE id = ?', groupId);
    if (!group) return;
    const cards = await txn.getAllAsync<{ content: string }>('SELECT content FROM cards WHERE groupId = ?', groupId);
    for (const card of cards) {
      for (const match of card.content.matchAll(CUSTOM_IMAGE_PATTERN)) {
        imageUris.push(match[1]);
      }
    }
    await txn.runAsync('DELETE FROM cards WHERE groupId = ?', groupId);
    await txn.runAsync('DELETE FROM card_groups WHERE id = ?', groupId);
    const customDoc = await txn.getFirstAsync<{ id: number }>('SELECT id FROM documents WHERE fileName = ?', CUSTOM_DOCUMENT_FILE_NAME);
    if (customDoc && cards.length > 0) {
      await txn.runAsync('UPDATE documents SET cardCount = MAX(cardCount - ?, 0) WHERE id = ?', cards.length, customDoc.id);
    }
  });
  await deleteCustomCardImages(imageUris);
}

export function isCustomDocument(doc: Pick<DocumentRecord, 'fileName'>) {
  return doc.fileName === CUSTOM_DOCUMENT_FILE_NAME;
}

// 卡片是否属于手写卡集：手写卡片一定挂在某个手写分组下（groupId 非空），
// 导入文档的卡片没有分组。按 groupId 判定与「手动创建」文档的名称无关，
// 因此分组文档改名不会破坏识别。
export function isCustomCard(card: Pick<CardRecord, 'groupId'>) {
  return card.groupId != null;
}

async function getOrCreateCustomDocument(txn: SQLite.SQLiteDatabase): Promise<number> {
  const existing = await txn.getFirstAsync<{ id: number }>('SELECT id FROM documents WHERE fileName = ?', CUSTOM_DOCUMENT_FILE_NAME);
  if (existing) return existing.id;
  const folderId = await getDefaultFolderId(txn);
  const inserted = await txn.runAsync(
    'INSERT INTO documents(title, fileName, fileUri, storedPath, content, importedAt, cardCount, folderId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    CUSTOM_DOCUMENT_TITLE,
    CUSTOM_DOCUMENT_FILE_NAME,
    '',
    '',
    '',
    nowIso(),
    0,
    folderId,
  );
  return inserted.lastInsertRowId;
}

// 把选择器给出的临时图片复制进应用目录（选择器的缓存随时可能被系统清掉），返回持久 URI。
export async function storeCustomCardImages(uris: string[]): Promise<string[]> {
  const dir = new Directory(Paths.document, CUSTOM_IMAGE_DIR_NAME);
  dir.create({ intermediates: true, idempotent: true });
  const stored: string[] = [];
  for (const uri of uris) {
    try {
      const source = new File(uri);
      if (!source.exists) continue;
      const extension = (source.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = new File(dir, `${uid('img')}.${extension || 'jpg'}`);
      target.write(await source.bytes());
      stored.push(target.uri);
    } catch {
      // 单张复制失败不阻断其余图片。
    }
  }
  return stored;
}

// 删除未保存卡片引用的配图（放弃编辑 / 移除单张时调用），失败静默。
export async function deleteCustomCardImages(uris: string[]): Promise<void> {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // 清理失败不影响主流程。
    }
  }
}

// 创建手写卡片：分组通过下拉选择的 groupId 指定（文件夹随分组）；
// 未选择分组时兜底归入默认文件夹的「手写」分组，永不产生孤立数据。
export async function createCustomCard(input: { title: string; content?: string; groupId?: number | null }): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new Error('请填写卡片标题');
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const documentId = await getOrCreateCustomDocument(txn);
    let groupId: number;
    let groupName: string;
    const pickedGroup = input.groupId != null
      ? await txn.getFirstAsync<CardGroupRecord>('SELECT * FROM card_groups WHERE id = ?', input.groupId)
      : null;
    if (pickedGroup) {
      groupId = pickedGroup.id;
      groupName = pickedGroup.name;
    } else {
      const folderId = await getDefaultFolderId(txn);
      groupId = await getOrCreateCardGroup(txn, folderId, DEFAULT_CUSTOM_GROUP_NAME);
      groupName = DEFAULT_CUSTOM_GROUP_NAME;
    }
    const row = await txn.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(sortOrder), -1) + 1 AS next FROM cards WHERE documentId = ?', documentId);
    await txn.runAsync(
      'INSERT INTO cards(documentId, h1, h2, h3, title, content, sortOrder, createdAt, groupId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      documentId,
      CUSTOM_DOCUMENT_TITLE,
      groupName,
      title,
      title,
      input.content?.trim() ?? '',
      row?.next ?? 0,
      nowIso(),
      groupId,
    );
    await txn.runAsync('UPDATE documents SET cardCount = cardCount + 1 WHERE id = ?', documentId);
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', null, 'custom-card', nowIso());
  });
}

// 编辑手写卡片：可改标题 / 分组（分组变化即移动到目标文件夹的该分组）/ 正文；
// 编辑后不再被引用的旧配图文件一并清理。groupId 为空时保留原分组。仅限手写卡集的卡片。
export async function updateCustomCard(cardId: number, input: { title: string; content: string; groupId?: number | null }): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new Error('请填写卡片标题');
  const db = await getDb();
  let removedImages: string[] = [];
  await db.withExclusiveTransactionAsync(async (txn) => {
    const card = await txn.getFirstAsync<{ documentId: number; content: string; groupId: number | null; h2: string }>('SELECT documentId, content, groupId, h2 FROM cards WHERE id = ?', cardId);
    if (!card) throw new Error('卡片不存在或已被删除');
    const doc = await txn.getFirstAsync<{ fileName: string }>('SELECT fileName FROM documents WHERE id = ?', card.documentId);
    if (!doc || doc.fileName !== CUSTOM_DOCUMENT_FILE_NAME) {
      throw new Error('只能编辑手写创建的卡片');
    }
    let groupId = card.groupId;
    let groupName = card.h2;
    if (input.groupId != null) {
      const pickedGroup = await txn.getFirstAsync<CardGroupRecord>('SELECT * FROM card_groups WHERE id = ?', input.groupId);
      if (!pickedGroup) throw new Error('目标分组不存在或已被删除');
      groupId = pickedGroup.id;
      groupName = pickedGroup.name;
    }
    const oldUris = [...card.content.matchAll(CUSTOM_IMAGE_PATTERN)].map((match) => match[1]);
    const keptUris = new Set([...input.content.matchAll(CUSTOM_IMAGE_PATTERN)].map((match) => match[1]));
    removedImages = oldUris.filter((uri) => !keptUris.has(uri));
    await txn.runAsync(
      'UPDATE cards SET h2 = ?, h3 = ?, title = ?, content = ?, groupId = ? WHERE id = ?',
      groupName,
      title,
      title,
      input.content,
      groupId,
      cardId,
    );
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', cardId, 'custom-card-update', nowIso());
  });
  await deleteCustomCardImages(removedImages);
}

async function collectCustomImageUris(documentId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ content: string }>('SELECT content FROM cards WHERE documentId = ?', documentId);
  const uris = new Set<string>();
  for (const row of rows) {
    for (const match of row.content.matchAll(CUSTOM_IMAGE_PATTERN)) {
      uris.add(match[1]);
    }
  }
  return [...uris];
}

// 删除单张卡片（文档生成的卡片与手写卡片通用）：
// 卡片行、配图文件、头图文件一并清理，归属文档的卡片数同步递减。
export async function deleteCard(cardId: number): Promise<void> {
  const db = await getDb();
  let imageUris: string[] = [];
  await db.withExclusiveTransactionAsync(async (txn) => {
    const card = await txn.getFirstAsync<{ documentId: number; content: string }>('SELECT documentId, content FROM cards WHERE id = ?', cardId);
    if (!card) return;
    const doc = await txn.getFirstAsync<{ fileName: string }>('SELECT fileName FROM documents WHERE id = ?', card.documentId);
    if (doc && doc.fileName === CUSTOM_DOCUMENT_FILE_NAME) {
      for (const match of card.content.matchAll(CUSTOM_IMAGE_PATTERN)) {
        imageUris.push(match[1]);
      }
    }
    await txn.runAsync('DELETE FROM cards WHERE id = ?', cardId);
    await txn.runAsync('UPDATE documents SET cardCount = MAX(cardCount - 1, 0) WHERE id = ?', card.documentId);
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', null, 'card-delete', nowIso());
  });
  await deleteCustomCardImages(imageUris);
  removeCardHeaderImages([cardId]);
}

// 删除文档及其全部卡片（外键级联），并清理本机副本与已下载的头图文件。
// 手写卡集的卡片全部删除时，其手写分组也随之清空，避免留下空壳分组。
export async function deleteDocument(documentId: number) {
  const db = await getDb();
  const doc = await db.getFirstAsync<DocumentRecord>('SELECT * FROM documents WHERE id = ?', documentId);
  if (!doc) return;
  const cardRows = await db.getAllAsync<{ id: number }>('SELECT id FROM cards WHERE documentId = ?', documentId);
  const custom = isCustomDocument(doc);
  const customImageUris = custom ? await collectCustomImageUris(documentId) : [];
  await db.runAsync('DELETE FROM documents WHERE id = ?', documentId);
  if (custom) await db.runAsync('DELETE FROM card_groups');
  removeLocalFiles(doc.storedPath, cardRows.map((row) => row.id));
  await deleteCustomCardImages(customImageUris);
}

function removeCardHeaderImages(cardIds: number[]) {
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

function removeLocalFiles(storedPath: string, cardIds: number[]) {
  try {
    const stored = new File(storedPath);
    if (stored.exists) stored.delete();
  } catch {
    // 本机副本清理失败不影响数据删除。
  }
  removeCardHeaderImages(cardIds);
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

// 文档内全部卡片（按切卡顺序）：手写卡集的预览用它渲染卡片列表。
export async function listCardsByDocument(documentId: number): Promise<CardRecord[]> {
  const db = await getDb();
  return db.getAllAsync<CardRecord>(`${cardSelect} WHERE cards.documentId = ? ORDER BY cards.sortOrder ASC`, documentId);
}

// 全局搜索：标题 / 正文 / 批注 / 来源文档名 任意命中即返回，标题命中排前。
export async function searchCards(query: string, limit = 50): Promise<CardRecord[]> {
  const clean = query.trim();
  if (!clean) return [];
  const like = `%${clean.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const db = await getDb();
  return db.getAllAsync<CardRecord>(
    `${cardSelect}
     WHERE cards.title LIKE ? ESCAPE '\\' OR cards.content LIKE ? ESCAPE '\\' OR annotations.note LIKE ? ESCAPE '\\' OR documents.title LIKE ? ESCAPE '\\'
     ORDER BY CASE WHEN cards.title LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END, cards.lastGotAt IS NOT NULL, cards.lastGotAt DESC, cards.sortOrder ASC
     LIMIT ?`,
    like,
    like,
    like,
    like,
    like,
    limit,
  );
}

export async function buildSessionCards(limit: number, startCardId?: number) {
  const db = await getDb();
  // 从首页推荐卡点进来时，点中的那张固定排在流的开头（无论是否已 get），
  // 其余位置仍从 isGot = 0 的未读池随机补齐；GET 流程本身只出新卡。
  if (startCardId != null) {
    const start = await db.getFirstAsync<CardRecord>(`${cardSelect} WHERE cards.id = ?`, startCardId);
    if (start) {
      const rest = await db.getAllAsync<CardRecord>(
        `${cardSelect}
         WHERE cards.isGot = 0 AND cards.id != ?
         ORDER BY RANDOM()
         LIMIT ?`,
        startCardId,
        Math.max(0, limit - 1),
      );
      return [start, ...rest];
    }
  }
  const rows = await db.getAllAsync<CardRecord>(
    `${cardSelect}
     WHERE cards.isGot = 0
     ORDER BY RANDOM()
     LIMIT ?`,
    limit,
  );
  return rows;
}

// 复习流程的到期卡片：遗忘过 / 评过「忘了」的重点优先，其余按逾期最久排前。
// nextReviewAt 为空的历史已 get 卡视作到期，进入首次复习。
export async function buildReviewCards(limit = 50) {
  const db = await getDb();
  const now = nowIso();
  return db.getAllAsync<CardRecord>(
    `${cardSelect}
     WHERE cards.isGot = 1 AND (cards.nextReviewAt IS NULL OR cards.nextReviewAt <= ?)
     ORDER BY CASE WHEN cards.mastery = 1 OR cards.forgetCount > 0 THEN 0 ELSE 1 END ASC,
              COALESCE(cards.nextReviewAt, '1970-01-01T00:00:00.000Z') ASC
     LIMIT ?`,
    now,
    limit,
  );
}

// 提前复习：不等到期，直接复习「新近记忆」（刚 get 未评级）与「巩固中」（档位 0-2 未到期）的卡片。
// 新近记忆排前（越早 get 的越先），巩固中按最近的到期时间排前。
export async function buildAheadReviewCards(limit = 30) {
  const db = await getDb();
  const now = nowIso();
  return db.getAllAsync<CardRecord>(
    `${cardSelect}
     WHERE cards.isGot = 1 AND cards.nextReviewAt IS NOT NULL AND cards.nextReviewAt > ?
       AND (cards.mastery IS NULL OR cards.reviewStage <= 2)
     ORDER BY CASE WHEN cards.mastery IS NULL THEN 0 ELSE 1 END ASC, cards.nextReviewAt ASC
     LIMIT ?`,
    now,
    limit,
  );
}

// ===== 复习 Tab 下钻：按「最近一次反馈」状态筛选卡片 =====
// 状态口径与复习 Tab 四状态仪表一致（见 buildReviewCards / getStatistics 的划分）。

export type ReviewStatusFilter = 'recent' | 'fuzzy' | 'clear' | 'forgot';

const REVIEW_STATUS_CONDITIONS: Record<ReviewStatusFilter, string> = {
  recent: 'cards.isGot = 1 AND cards.mastery IS NULL',
  fuzzy: 'cards.mastery = 2',
  clear: 'cards.mastery = 3',
  forgot: 'cards.mastery = 1',
};

export async function listCardsByStatus(status: ReviewStatusFilter, limit = 200): Promise<CardRecord[]> {
  const db = await getDb();
  return db.getAllAsync<CardRecord>(
    `${cardSelect}
     WHERE ${REVIEW_STATUS_CONDITIONS[status]}
     ORDER BY cards.lastGotAt DESC, cards.sortOrder ASC
     LIMIT ?`,
    limit,
  );
}

// 未来 N 天到期预览：按本地日分桶统计尚未到期卡片的 nextReviewAt
// （起点是「现在」，今天已到期的归入今日待复习 dueCount，不在这里重复计）。
export async function getUpcomingReviewCounts(days = 7): Promise<{ date: string; count: number }[]> {
  const db = await getDb();
  const today = startOfLocalDay();
  const rangeEnd = new Date(today);
  rangeEnd.setDate(today.getDate() + days + 1);
  const rows = await db.getAllAsync<{ nextReviewAt: string }>(
    'SELECT nextReviewAt FROM cards WHERE isGot = 1 AND nextReviewAt > ? AND nextReviewAt < ?',
    nowIso(),
    rangeEnd.toISOString(),
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    const stamped = new Date(row.nextReviewAt);
    if (Number.isNaN(stamped.getTime())) continue;
    const key = localDayKey(stamped);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result: { date: string; count: number }[] = [];
  for (let i = 1; i <= days; i += 1) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    result.push({ date: localDayKey(day), count: counts.get(localDayKey(day)) ?? 0 });
  }
  return result;
}

// 最近一轮复习小结（复习 Tab）：从 rate-* 事件倒序回溯同一轮 ——
// 相邻两次评级间隔超过 30 分钟即视为上一轮结束。无任何评级记录时返回 null。
export type LastReviewSession = { lastAt: string; total: number; clear: number; fuzzy: number; forgot: number };

export async function getLastReviewSession(): Promise<LastReviewSession | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ type: string; createdAt: string }>(
    "SELECT type, createdAt FROM events WHERE type LIKE 'rate-%' ORDER BY createdAt DESC LIMIT 80",
  );
  if (rows.length === 0) return null;
  let clear = 0;
  let fuzzy = 0;
  let forgot = 0;
  let prevTime = Number.NaN;
  for (const row of rows) {
    const time = new Date(row.createdAt).getTime();
    if (Number.isNaN(time)) continue;
    if (!Number.isNaN(prevTime) && prevTime - time > 30 * 60 * 1000) break;
    if (row.type === 'rate-clear') clear += 1;
    else if (row.type === 'rate-fuzzy') fuzzy += 1;
    else if (row.type === 'rate-forgot') forgot += 1;
    prevTime = time;
  }
  const total = clear + fuzzy + forgot;
  if (total === 0) return null;
  return { lastAt: rows[0].createdAt, total, clear, fuzzy, forgot };
}

// ===== 周对比（我的 Tab）：近 7 天 vs 上一个 7 天的学习行为 =====
// 数据源与打卡热力图一致（events 表的 get / rate-* 事件），打卡天数 = 当日 get 数 ≥ 目标。

export type WeeklyComparison = {
  thisGets: number;
  lastGets: number;
  thisReviews: number;
  lastReviews: number;
  thisHits: number;
  lastHits: number;
};

export async function getWeeklyComparison(goal: number): Promise<WeeklyComparison> {
  const db = await getDb();
  const todayStart = startOfLocalDay();
  const windowStart = new Date(todayStart);
  windowStart.setDate(todayStart.getDate() - 13);
  const rows = await db.getAllAsync<{ type: string; createdAt: string }>(
    "SELECT type, createdAt FROM events WHERE createdAt >= ? AND (type = 'get' OR type LIKE 'rate-%')",
    windowStart.toISOString(),
  );

  // 按本地日 × 行为类型计数，再分别汇总两个 7 天窗口（本周含今天，上周是其前 7 天）。
  const perDay = new Map<string, { gets: number; reviews: number }>();
  for (const row of rows) {
    const stamped = new Date(row.createdAt);
    if (Number.isNaN(stamped.getTime())) continue;
    const key = localDayKey(stamped);
    const bucket = perDay.get(key) ?? { gets: 0, reviews: 0 };
    if (row.type === 'get') bucket.gets += 1;
    else bucket.reviews += 1;
    perDay.set(key, bucket);
  }

  const summarize = (offsetDays: number, length: number) => {
    let gets = 0;
    let reviews = 0;
    let hits = 0;
    for (let i = 0; i < length; i += 1) {
      const day = new Date(todayStart);
      day.setDate(todayStart.getDate() - offsetDays - i);
      const bucket = perDay.get(localDayKey(day));
      if (!bucket) continue;
      gets += bucket.gets;
      reviews += bucket.reviews;
      if (goal > 0 && bucket.gets >= goal) hits += 1;
    }
    return { gets, reviews, hits };
  };

  const current = summarize(0, 7);
  const previous = summarize(7, 7);
  return {
    thisGets: current.gets,
    lastGets: previous.gets,
    thisReviews: current.reviews,
    lastReviews: previous.reviews,
    thisHits: current.hits,
    lastHits: previous.hits,
  };
}

// 首页「今天推荐」：从全部卡片中随机挑几张做内容展示（含已 GET 的卡），
// 点击推荐卡会以该卡为起点进入 GET 流。推荐位一天只换一批：
// 首次访问时随机抽取并把卡片 id 存进 settings，之后整天返回同一批，
// 切页返回、重开应用都不重抽；点首页的刷新按钮才手动换一批。
function readStoredIdList(raw: string | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
  } catch {
    return [];
  }
}

async function pickDailyRecommendations(db: SQLite.SQLiteDatabase, limit: number, day: string): Promise<CardRecord[]> {
  const cards = await db.getAllAsync<CardRecord>(`${cardSelect} ORDER BY RANDOM() LIMIT ?`, limit);
  await db.runAsync("INSERT OR REPLACE INTO settings(key, value) VALUES ('dailyRecoDate', ?)", day);
  await db.runAsync("INSERT OR REPLACE INTO settings(key, value) VALUES ('dailyRecoIds', ?)", JSON.stringify(cards.map((card) => card.id)));
  return cards;
}

export async function getDailyRecommendedCards(limit = 3): Promise<CardRecord[]> {
  const db = await getDb();
  const today = localDayKey(new Date());
  const rows = await db.getAllAsync<SettingRow>("SELECT key, value FROM settings WHERE key IN ('dailyRecoDate', 'dailyRecoIds')");
  const storedDate = rows.find((row) => row.key === 'dailyRecoDate')?.value;
  const storedIds = readStoredIdList(rows.find((row) => row.key === 'dailyRecoIds')?.value);
  if (storedDate === today && storedIds.length > 0) {
    const placeholders = storedIds.map(() => '?').join(', ');
    const cards = await db.getAllAsync<CardRecord>(`${cardSelect} WHERE cards.id IN (${placeholders})`, storedIds);
    // 记录里可能有被删除的卡片：还有剩余就按记录顺序返回，全被删光才重抽。
    if (cards.length > 0) {
      const byId = new Map(cards.map((card) => [card.id, card]));
      return storedIds.map((id) => byId.get(id)).filter((card): card is CardRecord => Boolean(card));
    }
  }
  return pickDailyRecommendations(db, limit, today);
}

// 刷新按钮：立刻重抽一批并覆盖今天的推荐记录。
export async function refreshDailyRecommendedCards(limit = 3): Promise<CardRecord[]> {
  const db = await getDb();
  return pickDailyRecommendations(db, limit, localDayKey(new Date()));
}

// 简化版间隔重复：reviewStage 对应间隔档位（天）。
// 评级规则：秒懂升一档（封顶），模糊降一档（不低于首档），忘了归零重来。
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 16, 35] as const;

// GET 流程：标记已学并安排首次复习（明天进入「新近记忆」）；评级留给复习流程。
export async function markCardGot(cardId: number) {
  const db = await getDb();
  const time = nowIso();
  const next = new Date(time);
  next.setDate(next.getDate() + 1);
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      'UPDATE cards SET isGot = 1, getCount = getCount + 1, lastGotAt = ?, nextReviewAt = ? WHERE id = ?',
      time,
      next.toISOString(),
      cardId,
    );
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', cardId, 'get', time);
  });
}

export async function rateCard(cardId: number, rating: MasteryRating): Promise<{ mastery: MasteryRating; reviewStage: number; nextReviewAt: string }> {
  const db = await getDb();
  const time = nowIso();
  let nextStage = 0;
  let nextReviewAt = time;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const card = await txn.getFirstAsync<{ reviewStage: number }>('SELECT reviewStage FROM cards WHERE id = ?', cardId);
    if (!card) throw new Error('卡片不存在或已被删除');
    const stage = rating === 3
      ? Math.min(card.reviewStage + 1, REVIEW_INTERVAL_DAYS.length - 1)
      : rating === 2
        ? Math.max(card.reviewStage - 1, 0)
        : 0;
    const next = new Date(time);
    next.setDate(next.getDate() + REVIEW_INTERVAL_DAYS[stage]);
    nextStage = stage;
    nextReviewAt = next.toISOString();
    await txn.runAsync(
      'UPDATE cards SET isGot = 1, getCount = getCount + 1, lastGotAt = ?, mastery = ?, reviewStage = ?, nextReviewAt = ?, forgetCount = forgetCount + ? WHERE id = ?',
      time,
      rating,
      stage,
      nextReviewAt,
      rating === 1 ? 1 : 0,
      cardId,
    );
    await txn.runAsync(
      'INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)',
      cardId,
      rating === 3 ? 'rate-clear' : rating === 2 ? 'rate-fuzzy' : 'rate-forgot',
      time,
    );
  });
  return { mastery: rating, reviewStage: nextStage, nextReviewAt };
}

export async function unmarkGot(cardId: number) {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE cards SET isGot = 0 WHERE id = ?', cardId);
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', cardId, 'unget', nowIso());
  });
}

// 手动重置单张卡的复习进度：清掉评级与间隔档位，立刻安排进今天的到期复习（可马上重评）。
export async function resetCardReviewProgress(cardId: number) {
  const db = await getDb();
  const time = nowIso();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE cards SET mastery = NULL, reviewStage = 0, nextReviewAt = ? WHERE id = ?', time, cardId);
    await txn.runAsync('INSERT INTO events(cardId, type, createdAt) VALUES (?, ?, ?)', cardId, 'review-reset', time);
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
  const now = nowIso();
  const tomorrowStart = startOfLocalDay();
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterStart = new Date(tomorrowStart);
  dayAfterStart.setDate(tomorrowStart.getDate() + 1);
  const todayStart = startOfLocalDay();
  const [totalCards, gotCards, favoriteCards, annotatedCards, documents, dueCards, recent, fuzzy, clear, forgot, weak, dueWeak, tomorrowDue, todayReviewRow] = await Promise.all([
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE isGot = 1'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE isFavorite = 1'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM annotations WHERE TRIM(note) != ""'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM documents'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE isGot = 1 AND nextReviewAt IS NOT NULL AND nextReviewAt <= ?', now),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE isGot = 1 AND mastery IS NULL'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE mastery = 2'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE mastery = 3'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE mastery = 1'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE forgetCount > 0'),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE isGot = 1 AND (mastery = 1 OR forgetCount > 0) AND nextReviewAt IS NOT NULL AND nextReviewAt <= ?', now),
    db.getFirstAsync<CountRow>('SELECT COUNT(*) as count FROM cards WHERE nextReviewAt >= ? AND nextReviewAt < ?', tomorrowStart.toISOString(), dayAfterStart.toISOString()),
    db.getFirstAsync<CountRow>("SELECT COUNT(*) as count FROM events WHERE type LIKE 'rate-%' AND createdAt >= ? AND createdAt < ?", todayStart.toISOString(), tomorrowStart.toISOString()),
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
    todayReviews: todayReviewRow?.count ?? 0,
    goal,
    streakDays,
    week,
    documents: documents?.count ?? 0,
    dueCount: dueCards?.count ?? 0,
    recentCount: recent?.count ?? 0,
    fuzzyCount: fuzzy?.count ?? 0,
    clearCount: clear?.count ?? 0,
    forgotCount: forgot?.count ?? 0,
    weakCount: weak?.count ?? 0,
    dueWeakCount: dueWeak?.count ?? 0,
    tomorrowCount: tomorrowDue?.count ?? 0,
  };
}

// 打卡热力图数据：按本地日聚合近一年的 get / 评级行为，空缺日期补 0。
export async function getDailyActivity(days = 364): Promise<{ date: string; count: number }[]> {
  const db = await getDb();
  const first = startOfLocalDay();
  first.setDate(first.getDate() - days);
  const rows = await db.getAllAsync<{ type: string; createdAt: string }>(
    "SELECT type, createdAt FROM events WHERE createdAt >= ? AND (type = 'get' OR type LIKE 'rate-%')",
    first.toISOString(),
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    const stamped = new Date(row.createdAt);
    if (Number.isNaN(stamped.getTime())) continue;
    const key = localDayKey(stamped);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result: { date: string; count: number }[] = [];
  const cursor = startOfLocalDay();
  cursor.setDate(cursor.getDate() - days);
  for (let i = 0; i <= days; i += 1) {
    const key = localDayKey(cursor);
    result.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export async function resetAllData() {
  const db = await getDb();
  await db.execAsync('DELETE FROM events; DELETE FROM annotations; DELETE FROM cards; DELETE FROM documents; DELETE FROM card_groups; DELETE FROM folders;');
  // 重置后重建默认文件夹，保证后续创建的内容始终有兜底归属。
  await getDefaultFolderId(db);
  // 库清空的同时清掉本机附属文件：自定义配图、恢复暂存、已下载头图与文档本机副本，
  // 否则它们会以孤儿文件形式留在应用目录里（目录名与各写入处保持一致）。
  for (const name of [CUSTOM_IMAGE_DIR_NAME, RESTORE_TMP_DIR_NAME, 'scrollark-card-images', 'scrollark-documents']) {
    try {
      const dir = new Directory(Paths.document, name);
      if (dir.exists) dir.delete();
    } catch {
      // 单个目录清理失败不影响数据清空。
    }
  }
}

// ===== 数据备份：JSON 导出 / 导入 =====

type BackupDocumentRow = DocumentRecord;
type BackupCardRow = {
  id: number;
  documentId: number;
  groupId: number | null;
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
  mastery: number | null;
  nextReviewAt: string | null;
  reviewStage: number;
  forgetCount: number;
};
type BackupFolderRow = { id: number; name: string; isDefault: number; createdAt: string };
type BackupGroupRow = { id: number; name: string; folderId: number; createdAt: string };

// 自定义卡片的本机配图：以 base64 内嵌进备份文件，换机/重装后仍能还原。
export type BackupCustomImage = { fileName: string; data: string };

export type BackupPayload = {
  app: 'scrollark';
  schema: 3;
  exportedAt: string;
  folders: BackupFolderRow[];
  cardGroups: BackupGroupRow[];
  documents: BackupDocumentRow[];
  cards: BackupCardRow[];
  annotations: { id: number; cardId: number; note: string; updatedAt: string }[];
  events: { id: number; cardId: number | null; type: string; createdAt: string }[];
  settings: SettingRow[];
  customImages: BackupCustomImage[];
};

// 备份文件名带秒与随机后缀：SAF 目录下重复导出也不会撞名。
function backupFileName(): string {
  const stamp = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `scrollark-backup-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}-${suffix}.json`;
}

// 从配图 file:// URI 提取文件名：只收录应用自定义配图目录内的引用，
// 避免把用户手写 Markdown 里指向任意外部文件的 file:// 链接打进备份。
function customImageFileName(uri: string): string | null {
  if (!uri.includes(CUSTOM_IMAGE_DIR_NAME)) return null;
  const trimmed = uri.replace(/\/+$/, '');
  const name = trimmed.slice(trimmed.lastIndexOf('/') + 1).trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? name : null;
}

// 收集备份卡片引用且本机仍存在的自定义配图（base64 内嵌），按文件名去重。
async function collectCustomImagesForBackup(cards: BackupCardRow[]): Promise<BackupCustomImage[]> {
  const names = new Set<string>();
  for (const card of cards) {
    for (const match of card.content.matchAll(CUSTOM_IMAGE_PATTERN)) {
      const name = customImageFileName(match[1]);
      if (name) names.add(name);
    }
  }
  if (names.size === 0) return [];
  const dir = new Directory(Paths.document, CUSTOM_IMAGE_DIR_NAME);
  const images: BackupCustomImage[] = [];
  for (const name of names) {
    try {
      const file = new File(dir, name);
      if (file.exists) images.push({ fileName: name, data: await file.base64() });
    } catch {
      // 单张配图读取失败不阻断导出：恢复后该图缺失，其余数据不受影响。
    }
  }
  return images;
}

// 导出全部数据到用户选择的目录，返回写入的文件 URI；用户取消选目录时返回 null。
// 注意：Directory.createFile 的签名是 (文件名, MIME)，Android SAF 下参数顺序反了会
// 生成名为 "application/json" 的坏文件，导致再次导入时被类型校验拒绝。
export async function exportBackupData(): Promise<string | null> {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch {
    return null; // 用户取消了目录选择，不算失败。
  }
  const db = await getDb();
  const [folders, cardGroups, documents, cards, annotations, events, settings] = await Promise.all([
    db.getAllAsync<BackupFolderRow>('SELECT * FROM folders ORDER BY id'),
    db.getAllAsync<BackupGroupRow>('SELECT * FROM card_groups ORDER BY id'),
    db.getAllAsync<BackupDocumentRow>('SELECT * FROM documents ORDER BY id'),
    db.getAllAsync<BackupCardRow>('SELECT * FROM cards ORDER BY id'),
    db.getAllAsync<BackupPayload['annotations'][number]>('SELECT * FROM annotations ORDER BY id'),
    db.getAllAsync<BackupPayload['events'][number]>('SELECT * FROM events ORDER BY id'),
    db.getAllAsync<SettingRow>('SELECT key, value FROM settings ORDER BY key'),
  ]);
  const customImages = await collectCustomImagesForBackup(cards);
  const payload: BackupPayload = { app: 'scrollark', schema: 3, exportedAt: nowIso(), folders, cardGroups, documents, cards, annotations, events, settings, customImages };

  try {
    const file = directory.createFile(backupFileName(), 'application/json');
    file.write(JSON.stringify(payload));
    return file.uri;
  } catch {
    // SAF 直接写入失败时的兜底：写入应用目录后调起系统分享面板，由用户选择保存位置。
    const dir = new Directory(Paths.document, 'scrollark-backups');
    dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, backupFileName());
    file.write(JSON.stringify(payload));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: '保存数据备份' });
    return file.uri;
  }
}

// 选择并校验备份文件，返回规范化后的数据；用户取消时返回 null，校验失败抛错（由页面提示）。
// 先尝试解析再校验扩展名：经第三方应用中转后文件名/MIME 不规范的备份也能导入。
export async function readBackupFile(): Promise<BackupPayload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  let parsed: unknown;
  try {
    parsed = JSON.parse(await new File(asset.uri).text());
  } catch {
    const looksLikeJson = asset.name.toLowerCase().endsWith('.json') || (asset.mimeType?.includes('json') ?? false);
    throw new Error(looksLikeJson ? '备份文件不是有效的 JSON' : '请选择 Scrollark 导出的 JSON 备份文件');
  }
  return normalizeBackupPayload(parsed);
}

function normalizeBackupPayload(value: unknown): BackupPayload {
  if (!value || typeof value !== 'object') throw new Error('不是有效的 Scrollark 备份文件');
  const data = value as { app?: unknown; schema?: unknown; folders?: unknown; cardGroups?: unknown; documents?: unknown; cards?: unknown; annotations?: unknown; events?: unknown; settings?: unknown; customImages?: unknown };
  if (data.app !== 'scrollark' || !Array.isArray(data.documents) || !Array.isArray(data.cards)) {
    throw new Error('不是有效的 Scrollark 备份文件');
  }
  const record = (row: unknown): Record<string, unknown> => (row && typeof row === 'object' ? (row as Record<string, unknown>) : {});
  const str = (row: Record<string, unknown>, key: string, fallback = '') => (typeof row[key] === 'string' ? (row[key] as string) : fallback);
  const num = (row: Record<string, unknown>, key: string, fallback = 0) => {
    const value = row[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  const nullableStr = (row: Record<string, unknown>, key: string) => {
    const value = row[key];
    return typeof value === 'string' && value !== '' ? value : null;
  };
  const nullableId = (row: Record<string, unknown>, key: string) => {
    const id = num(row, key);
    return id > 0 ? id : null;
  };
  const isMasterRating = (value: unknown): value is MasteryRating => value === 1 || value === 2 || value === 3;

  // 老版本备份（schema 1）没有文件夹/分组数据：这里补成空数组，恢复时统一兜底到默认文件夹。
  const folders = (Array.isArray(data.folders) ? data.folders : []).map((row, index) => {
    const item = record(row);
    return {
      id: num(item, 'id', index + 1),
      name: str(item, 'name', '未命名文件夹'),
      isDefault: num(item, 'isDefault') === 1 ? 1 : 0,
      createdAt: str(item, 'createdAt', nowIso()),
    };
  });
  const cardGroups = (Array.isArray(data.cardGroups) ? data.cardGroups : []).map((row, index) => {
    const item = record(row);
    return {
      id: num(item, 'id', index + 1),
      name: str(item, 'name', DEFAULT_CUSTOM_GROUP_NAME),
      folderId: num(item, 'folderId'),
      createdAt: str(item, 'createdAt', nowIso()),
    };
  });
  const documents = data.documents.map((row, index) => {
    const item = record(row);
    return {
      id: num(item, 'id', index + 1),
      title: str(item, 'title', '未命名文档'),
      fileName: str(item, 'fileName'),
      fileUri: str(item, 'fileUri'),
      storedPath: str(item, 'storedPath'),
      content: str(item, 'content'),
      importedAt: str(item, 'importedAt', nowIso()),
      cardCount: num(item, 'cardCount'),
      folderId: nullableId(item, 'folderId'),
    };
  });
  const cards = data.cards.map((row, index) => {
    const item = record(row);
    const mastery = item.mastery;
    return {
      id: num(item, 'id', index + 1),
      documentId: num(item, 'documentId'),
      groupId: nullableId(item, 'groupId'),
      h1: str(item, 'h1', '未分组'),
      h2: str(item, 'h2', '未分组'),
      h3: str(item, 'h3'),
      title: str(item, 'title'),
      content: str(item, 'content'),
      sortOrder: num(item, 'sortOrder'),
      createdAt: str(item, 'createdAt', nowIso()),
      isGot: num(item, 'isGot') === 1 ? 1 : 0,
      isFavorite: num(item, 'isFavorite') === 1 ? 1 : 0,
      getCount: num(item, 'getCount'),
      lastGotAt: nullableStr(item, 'lastGotAt'),
      headerImageUrl: nullableStr(item, 'headerImageUrl'),
      mastery: isMasterRating(mastery) ? mastery : null,
      nextReviewAt: nullableStr(item, 'nextReviewAt'),
      reviewStage: Math.max(0, Math.min(REVIEW_INTERVAL_DAYS.length - 1, num(item, 'reviewStage'))),
      forgetCount: Math.max(0, num(item, 'forgetCount')),
    };
  });
  const annotations = (Array.isArray(data.annotations) ? data.annotations : []).map((row, index) => {
    const item = record(row);
    return { id: num(item, 'id', index + 1), cardId: num(item, 'cardId'), note: str(item, 'note'), updatedAt: str(item, 'updatedAt', nowIso()) };
  });
  const events = (Array.isArray(data.events) ? data.events : []).map((row, index) => {
    const item = record(row);
    return { id: num(item, 'id', index + 1), cardId: num(item, 'cardId', -1) >= 0 ? num(item, 'cardId') : null, type: str(item, 'type'), createdAt: str(item, 'createdAt', nowIso()) };
  });
  const settings = (Array.isArray(data.settings) ? data.settings : [])
    .filter((row) => str(record(row), 'key') !== '')
    .map((row) => ({ key: str(record(row), 'key'), value: str(record(row), 'value') }));

  // 自定义配图（schema 3 起才有）：老备份没有此字段，按空数组处理。
  // 文件名只放行安全字符，防止备份文件里的路径穿越写坏应用目录。
  const customImages = (Array.isArray(data.customImages) ? data.customImages : []).reduce<BackupCustomImage[]>((list, row) => {
    const item = record(row);
    const fileName = typeof item.fileName === 'string' ? item.fileName : '';
    const data64 = typeof item.data === 'string' ? item.data : '';
    if (fileName && data64 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName)) {
      list.push({ fileName, data: data64 });
    }
    return list;
  }, []);

  return { app: 'scrollark', schema: 3, exportedAt: typeof (value as { exportedAt?: unknown }).exportedAt === 'string' ? (value as { exportedAt: string }).exportedAt : nowIso(), folders, cardGroups, documents, cards, annotations, events, settings, customImages };
}

// ===== 备份恢复：自定义配图的落盘 =====
// 配图先写入暂存目录（数据库事务失败时不污染现有配图），事务提交成功后再移入正式目录。
const RESTORE_TMP_DIR_NAME = 'scrollark-custom-images-staging';

type StagedCustomImages = {
  tmpDir: Directory;
  finalDir: Directory;
  files: File[];
  // 文件名 → 恢复后的本机 URI：写卡片正文时用它替换指向导出设备的 file:// 路径。
  urisByName: Map<string, string>;
};

async function stageCustomImagesForRestore(images: BackupCustomImage[]): Promise<StagedCustomImages | null> {
  if (images.length === 0) return null;
  const tmpDir = new Directory(Paths.document, RESTORE_TMP_DIR_NAME);
  try {
    if (tmpDir.exists) tmpDir.delete();
  } catch {
    // 上次残留清理失败不阻断：文件按覆盖模式写入。
  }
  try {
    tmpDir.create({ intermediates: true, idempotent: true });
  } catch {
    return null;
  }
  const finalDir = new Directory(Paths.document, CUSTOM_IMAGE_DIR_NAME);
  const files: File[] = [];
  const urisByName = new Map<string, string>();
  for (const image of images) {
    try {
      const staged = new File(tmpDir, image.fileName);
      staged.create({ intermediates: true, overwrite: true });
      staged.write(image.data, { encoding: 'base64' });
      files.push(staged);
      urisByName.set(image.fileName, new File(finalDir, image.fileName).uri);
    } catch {
      // 单张写入失败（如 base64 损坏）跳过：卡片恢复后该图缺失，其余数据完整。
    }
  }
  if (files.length === 0) {
    discardStagedCustomImages({ tmpDir, finalDir, files, urisByName });
    return null;
  }
  return { tmpDir, finalDir, files, urisByName };
}

function discardStagedCustomImages(staged: StagedCustomImages) {
  try {
    if (staged.tmpDir.exists) staged.tmpDir.delete();
  } catch {
    // 暂存清理失败只留下孤儿文件，不影响主流程。
  }
}

// 数据库替换成功后调用：清空旧配图目录（库已整体替换，旧文件全是孤儿），再移入暂存文件。
async function commitStagedCustomImages(staged: StagedCustomImages) {
  try {
    staged.finalDir.create({ intermediates: true, idempotent: true });
    for (const item of staged.finalDir.list()) {
      try {
        item.delete();
      } catch {
        // 单个旧文件清理失败不阻断移入。
      }
    }
  } catch {
    // 目录重建失败时仍尝试逐个移入。
  }
  for (const file of staged.files) {
    try {
      file.move(new File(staged.finalDir, file.name));
    } catch {
      // 移动失败退回复制；仍失败则保留暂存文件（孤儿，不影响数据）。
      try {
        file.copy(new File(staged.finalDir, file.name));
      } catch {
        // 忽略。
      }
    }
  }
  discardStagedCustomImages(staged);
}

// 把卡片正文里指向导出设备的配图 file:// 路径，按文件名匹配改写到本机恢复后的路径。
function remapCustomImageUris(content: string, urisByName: Map<string, string>): string {
  if (urisByName.size === 0 || !content.includes('file://')) return content;
  return content.replace(CUSTOM_IMAGE_PATTERN, (whole, uri: string) => {
    const name = customImageFileName(uri);
    const mapped = name ? urisByName.get(name) : undefined;
    // 用函数形式替换，避免新路径里的 $ 序列被 String.replace 特殊解释。
    return mapped ? whole.replace(uri, () => mapped) : whole;
  });
}

// 用备份数据整体替换当前库（先清空再按外键顺序写入），并保留备份中的行为事件。
// 头图统一清空：备份里的本机文件路径指向导出设备，恢复后让卡片重新解析。
// 归属校验：folderId / groupId 指向不存在的记录时兜底到默认文件夹 / 置空；
// documentId / cardId 悬空的卡片、批注与事件直接跳过，避免外键约束失败导致整体回滚。
export async function restoreBackupData(payload: BackupPayload): Promise<{ documents: number; cards: number; images: number }> {
  const db = await getDb();
  const documentIds = new Set(payload.documents.map((doc) => doc.id));
  const restoredCards = payload.cards.filter((card) => documentIds.has(card.documentId));
  const cardIds = new Set(restoredCards.map((card) => card.id));
  const restoredAnnotations = payload.annotations.filter((item) => cardIds.has(item.cardId));
  const restoredEvents = payload.events.filter((item) => item.cardId === null || cardIds.has(item.cardId));
  const staged = await stageCustomImagesForRestore(payload.customImages);
  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync('DELETE FROM events; DELETE FROM annotations; DELETE FROM cards; DELETE FROM documents; DELETE FROM card_groups; DELETE FROM folders; DELETE FROM settings;');

      const folderIds = new Set<number>();
      let defaultFolderId: number | null = null;
      for (const folder of payload.folders) {
        await txn.runAsync(
          'INSERT INTO folders(id, name, isDefault, createdAt) VALUES (?, ?, ?, ?)',
          folder.id, folder.name, folder.isDefault, folder.createdAt,
        );
        folderIds.add(folder.id);
        if (folder.isDefault === 1) defaultFolderId = folder.id;
      }
      if (defaultFolderId === null) {
        defaultFolderId = await getDefaultFolderId(txn);
      }
      folderIds.add(defaultFolderId);

      const groupIds = new Set<number>();
      for (const group of payload.cardGroups) {
        const folderId = folderIds.has(group.folderId) ? group.folderId : defaultFolderId;
        await txn.runAsync(
          'INSERT INTO card_groups(id, name, folderId, createdAt) VALUES (?, ?, ?, ?)',
          group.id, group.name, folderId, group.createdAt,
        );
        groupIds.add(group.id);
      }

      for (const doc of payload.documents) {
        const folderId = doc.folderId !== null && folderIds.has(doc.folderId) ? doc.folderId : defaultFolderId;
        await txn.runAsync(
          'INSERT INTO documents(id, title, fileName, fileUri, storedPath, content, importedAt, cardCount, folderId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          doc.id, doc.title, doc.fileName, doc.fileUri, doc.storedPath, doc.content, doc.importedAt, doc.cardCount, folderId,
        );
      }
      const imageUrisByName = staged?.urisByName ?? new Map<string, string>();
      for (const card of restoredCards) {
        const groupId = card.groupId !== null && groupIds.has(card.groupId) ? card.groupId : null;
        await txn.runAsync(
          `INSERT INTO cards(id, documentId, groupId, h1, h2, h3, title, content, sortOrder, createdAt, isGot, isFavorite, getCount, lastGotAt, headerImageUrl, mastery, nextReviewAt, reviewStage, forgetCount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          card.id, card.documentId, groupId, card.h1, card.h2, card.h3, card.title, remapCustomImageUris(card.content, imageUrisByName), card.sortOrder, card.createdAt,
          card.isGot, card.isFavorite, card.getCount, card.lastGotAt, card.headerImageUrl, card.mastery, card.nextReviewAt, card.reviewStage, card.forgetCount,
        );
      }
      // 老备份的手写卡没有分组：优先挂到已有同名分组（可能在任意文件夹），
      // 不存在时才在默认文件夹下建组并挂载（与数据库迁移同一套回填），
      // 保证「groupId 非空 = 手写卡」的判定成立，也避免同名分组在默认文件夹里再出现一份。
      const restoredCustomDoc = await txn.getFirstAsync<{ id: number }>('SELECT id FROM documents WHERE fileName = ?', CUSTOM_DOCUMENT_FILE_NAME);
      if (restoredCustomDoc) {
        const names = await txn.getAllAsync<{ h2: string }>('SELECT DISTINCT h2 FROM cards WHERE documentId = ? AND groupId IS NULL', restoredCustomDoc.id);
        for (const row of names) {
          const groupName = row.h2.trim() || DEFAULT_CUSTOM_GROUP_NAME;
          const existing = await txn.getFirstAsync<{ id: number }>('SELECT id FROM card_groups WHERE name = ? ORDER BY id LIMIT 1', groupName);
          const groupId = existing ? existing.id : await getOrCreateCardGroup(txn, defaultFolderId, groupName);
          await txn.runAsync(
            'UPDATE cards SET groupId = ?, h2 = ? WHERE documentId = ? AND groupId IS NULL AND h2 = ?',
            groupId,
            groupName,
            restoredCustomDoc.id,
            row.h2,
          );
        }
      }
      for (const item of restoredAnnotations) {
        await txn.runAsync('INSERT INTO annotations(id, cardId, note, updatedAt) VALUES (?, ?, ?, ?)', item.id, item.cardId, item.note, item.updatedAt);
      }
      for (const item of restoredEvents) {
        await txn.runAsync('INSERT INTO events(id, cardId, type, createdAt) VALUES (?, ?, ?, ?)', item.id, item.cardId, item.type, item.createdAt);
      }
      for (const item of payload.settings) {
        await txn.runAsync('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', item.key, item.value);
      }
      await txn.execAsync('UPDATE cards SET headerImageUrl = NULL;');
    });
  } catch (error) {
    // 事务回滚后当前库原样保留，暂存配图一并丢弃。
    if (staged) discardStagedCustomImages(staged);
    throw error;
  }
  if (staged) await commitStagedCustomImages(staged);
  return { documents: payload.documents.length, cards: restoredCards.length, images: staged?.files.length ?? 0 };
}
