import { Directory, File, Paths } from 'expo-file-system';
import { HOME_BACKGROUND_IMAGE_URL, withImageCacheBuster } from '../config/imageUrls';

type HomeBackgroundMeta = {
  date: string;
  uri: string;
  updatedAt: string;
};

const HOME_BACKGROUND_DIR = 'scrollark-home-background';
const HOME_BACKGROUND_META = 'meta.json';

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getHomeBackgroundDir() {
  const dir = new Directory(Paths.document, HOME_BACKGROUND_DIR);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function readMeta(dir: Directory): HomeBackgroundMeta | null {
  const metaFile = new File(dir, HOME_BACKGROUND_META);
  if (!metaFile.exists) return null;
  try {
    const meta = JSON.parse(metaFile.textSync()) as Partial<HomeBackgroundMeta>;
    if (typeof meta.date === 'string' && typeof meta.uri === 'string') {
      return { date: meta.date, uri: meta.uri, updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : '' };
    }
  } catch {
    return null;
  }
  return null;
}

function writeMeta(dir: Directory, meta: HomeBackgroundMeta) {
  const metaFile = new File(dir, HOME_BACKGROUND_META);
  metaFile.create({ intermediates: true, overwrite: true });
  metaFile.write(JSON.stringify(meta));
}

function getCachedFile(meta: HomeBackgroundMeta | null) {
  if (!meta?.uri) return null;
  const file = new File(meta.uri);
  return file.exists ? file : null;
}

function cleanupOldImages(dir: Directory, keepName: string) {
  try {
    for (const item of dir.list()) {
      if (item instanceof File && item.name !== keepName && item.name !== HOME_BACKGROUND_META) {
        item.delete();
      }
    }
  } catch {
    // 清理失败不影响壁纸显示，下一次刷新时会继续尝试覆盖旧图。
  }
}

async function downloadHomeBackground(dir: Directory, date: string) {
  const name = `home-${date}-${Date.now()}.jpg`;
  const file = new File(dir, name);
  if (file.exists) file.delete();
  const sourceUrl = withImageCacheBuster(HOME_BACKGROUND_IMAGE_URL, `home-${date}-${Date.now()}`);
  return File.downloadFileAsync(sourceUrl, file, { idempotent: true });
}

export async function getDailyHomeBackgroundImageUri() {
  const dir = getHomeBackgroundDir();
  const meta = readMeta(dir);
  const cached = getCachedFile(meta);
  const date = todayKey();

  if (meta?.date === date && cached) return cached.uri;

  try {
    const downloaded = await downloadHomeBackground(dir, date);
    cleanupOldImages(dir, downloaded.name);
    writeMeta(dir, { date, uri: downloaded.uri, updatedAt: new Date().toISOString() });
    return downloaded.uri;
  } catch (error) {
    if (cached) return cached.uri;
    throw error;
  }
}

export async function refreshHomeBackgroundImageUri() {
  const dir = getHomeBackgroundDir();
  const meta = readMeta(dir);
  const cached = getCachedFile(meta);
  const date = todayKey();

  try {
    const downloaded = await downloadHomeBackground(dir, date);
    cleanupOldImages(dir, downloaded.name);
    writeMeta(dir, { date, uri: downloaded.uri, updatedAt: new Date().toISOString() });
    return downloaded.uri;
  } catch (error) {
    if (cached) return cached.uri;
    throw error;
  }
}