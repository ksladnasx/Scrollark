import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { HOME_BACKGROUND_IMAGE_URL, withImageCacheBuster } from '../config/imageUrls';

type HomeBackgroundMeta = {
  date: string;
  uri: string;
  updatedAt: string;
  sourceUrl: string;
};

const HOME_BACKGROUND_DIR = 'scrollark-home-background';
const HOME_BACKGROUND_DOWNLOAD_DIR = 'scrollark-wallpapers';
const HOME_BACKGROUND_META = 'meta.json';

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timestampKey() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
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
      return { date: meta.date, uri: meta.uri, updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : '', sourceUrl: typeof meta.sourceUrl === 'string' ? meta.sourceUrl : HOME_BACKGROUND_IMAGE_URL };
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

function getExtensionFromUri(uri: string) {
  const clean = uri.split('?')[0]?.split('#')[0] ?? uri;
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();
  if (ext === 'png' || ext === 'webp' || ext === 'jpeg' || ext === 'jpg') return ext === 'jpeg' ? 'jpg' : ext;
  return 'jpg';
}

function getMimeTypeFromExtension(extension: string) {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function getDefaultDownloadDirectory() {
  const dir = new Directory(Paths.document, HOME_BACKGROUND_DOWNLOAD_DIR);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function getDownloadDirectory(directoryUri?: string) {
  const clean = directoryUri?.trim();
  if (!clean) return getDefaultDownloadDirectory();
  const dir = new Directory(clean);
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  } catch {
    // 用户选择的外部目录可能不支持 exists/create 检查，后续写入时再交给系统处理。
  }
  return dir;
}

function createTargetFile(dir: Directory, fileName: string, mimeType: string) {
  try {
    const file = new File(dir, fileName);
    file.create({ intermediates: true, overwrite: true });
    return file;
  } catch {
    return dir.createFile(fileName, mimeType);
  }
}

async function downloadHomeBackground(dir: Directory, date: string, sourceUrl: string = HOME_BACKGROUND_IMAGE_URL) {
  const name = `home-${date}-${Date.now()}.jpg`;
  const file = new File(dir, name);
  if (file.exists) file.delete();
  const requestUrl = withImageCacheBuster(sourceUrl, `home-${date}-${Date.now()}`);
  return File.downloadFileAsync(requestUrl, file, { idempotent: true });
}

export function getDefaultHomeBackgroundDownloadDirectoryUri() {
  return getDefaultDownloadDirectory().uri;
}

export function getReadableHomeBackgroundDownloadDirectory(directoryUri?: string) {
  const clean = directoryUri?.trim();
  if (!clean) return '默认保存到系统相册';
  return clean;
}

export async function pickHomeBackgroundDownloadDirectory(initialUri?: string) {
  const clean = initialUri?.trim();
  const directory = await Directory.pickDirectoryAsync(clean || undefined);
  return directory.uri;
}

async function ensureMediaLibraryPermission() {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) throw new Error('需要允许访问相册，才能把背景图保存到系统相册。');
}

async function saveHomeBackgroundImageToAlbum(sourceUri: string) {
  let localUri = sourceUri;
  let temporaryFile: File | null = null;

  if (/^https?:\/\//i.test(sourceUri)) {
    const extension = getExtensionFromUri(sourceUri);
    const fileName = `scrollark-wallpaper-${timestampKey()}.${extension}`;
    temporaryFile = new File(Paths.cache, fileName);
    const downloaded = await File.downloadFileAsync(sourceUri, temporaryFile, { idempotent: true });
    localUri = downloaded.uri;
  }

  await ensureMediaLibraryPermission();
  await MediaLibrary.saveToLibraryAsync(localUri);

  try {
    temporaryFile?.delete();
  } catch {
    // 临时文件清理失败不影响图片已经保存到相册。
  }

  return '系统相册';
}

export async function saveHomeBackgroundImageToDirectory(sourceUri: string, directoryUri?: string) {
  const cleanDirectoryUri = directoryUri?.trim();
  if (!cleanDirectoryUri) return saveHomeBackgroundImageToAlbum(sourceUri);

  const extension = getExtensionFromUri(sourceUri);
  const mimeType = getMimeTypeFromExtension(extension);
  const dir = getDownloadDirectory(cleanDirectoryUri);
  const fileName = `scrollark-wallpaper-${timestampKey()}.${extension}`;

  if (/^https?:\/\//i.test(sourceUri)) {
    const target = createTargetFile(dir, fileName, mimeType);
    const downloaded = await File.downloadFileAsync(sourceUri, target, { idempotent: true });
    return downloaded.uri;
  }

  const source = new File(sourceUri);
  if (!source.exists) throw new Error('当前背景图还未准备好，请稍后再试。');
  const target = createTargetFile(dir, fileName, mimeType);
  target.write(await source.bytes());
  return target.uri;
}

export async function getDailyHomeBackgroundImageUri(sourceUrl: string = HOME_BACKGROUND_IMAGE_URL) {
  const dir = getHomeBackgroundDir();
  const meta = readMeta(dir);
  const cached = getCachedFile(meta);
  const date = todayKey();

  if (meta?.date === date && meta.sourceUrl === sourceUrl && cached) return cached.uri;

  try {
    const downloaded = await downloadHomeBackground(dir, date, sourceUrl);
    cleanupOldImages(dir, downloaded.name);
    writeMeta(dir, { date, uri: downloaded.uri, updatedAt: new Date().toISOString(), sourceUrl });
    return downloaded.uri;
  } catch (error) {
    if (cached) return cached.uri;
    throw error;
  }
}

export async function refreshHomeBackgroundImageUri(sourceUrl: string = HOME_BACKGROUND_IMAGE_URL) {
  const dir = getHomeBackgroundDir();
  const meta = readMeta(dir);
  const cached = getCachedFile(meta);
  const date = todayKey();

  try {
    const downloaded = await downloadHomeBackground(dir, date, sourceUrl);
    cleanupOldImages(dir, downloaded.name);
    writeMeta(dir, { date, uri: downloaded.uri, updatedAt: new Date().toISOString(), sourceUrl });
    return downloaded.uri;
  } catch (error) {
    if (cached) return cached.uri;
    throw error;
  }
}
