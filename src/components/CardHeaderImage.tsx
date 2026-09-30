import React from 'react';
import { ImageBackground, type ImageSourcePropType, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { CARD_REMOTE_IMAGE_URLS, withImageCacheBuster } from '../config/imageUrls';
import { getCardHeaderImageUrl, saveCardHeaderImageUrl } from '../data/repository';
import type { CardHeaderImageMode } from '../domain/types';
import { downloadImageFile } from '../utils/imageDownload';
import { cardImages } from '../theme/assets';

type Props = {
  mode: CardHeaderImageMode;
  cardKey: string;
  cardId: number;
  cachedUrl?: string | null;
  sourceUrl?: string;
  poolSize?: number;
  style: StyleProp<ViewStyle>;
  imageStyle: StyleProp<ImageStyle>;
  children?: React.ReactNode;
};

const CARD_IMAGE_DIR = 'scrollark-card-images';
const MIN_IMAGE_BYTES = 2048;
// 槽位下载失败后的冷却时间：冷却期内同槽位不再发起请求，避免源不稳定时反复重试。
const FAILURE_COOLDOWN_MS = 60_000;

const cardImageKeys = Object.keys(cardImages);
const pendingDownloads = new Map<string, Promise<string>>();
const memoryRemoteUrls = new Map<number, string>();
const recentSlotFailures = new Map<string, number>();
// 解析代数：切换壁纸源时自增，让仍在途的旧下载结果作废。
let resolutionGeneration = 0;

// 本地图库模式的确定性头图：同一张卡永远固定同一张本地图，重挂载不会变脸
// （也供分享海报复用）。
export function pickLocalCardImage(cardId: number): ImageSourcePropType {
  const key = cardImageKeys[cardId % cardImageKeys.length] ?? 'warm0';
  return cardImages[key] ?? cardImages.warm0;
}

function cardImageDir() {
  const dir = new Directory(Paths.document, CARD_IMAGE_DIR);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

// 槽位文件已在本地（本次或历史会话下载过）且内容有效：直接复用，零网络请求。
async function resolveReusableFile(target: File): Promise<string | null> {
  try {
    if (!target.exists) return null;
    const info = target.info();
    if (info.exists && (info.size ?? 0) >= MIN_IMAGE_BYTES) return target.uri;
  } catch {
    // 读取失败按未缓存处理，走下载流程。
  }
  return null;
}

// 切换卡片壁纸源后调用：作废内存缓存与在途下载，并删除已下载的头图文件，
// 配合 clearCardHeaderImageUrls() 让卡片按新源重新解析。
export function clearResolvedCardImages() {
  resolutionGeneration += 1;
  memoryRemoteUrls.clear();
  recentSlotFailures.clear();
  try {
    const dir = new Directory(Paths.document, CARD_IMAGE_DIR);
    if (dir.exists) dir.delete();
  } catch {
    // 删除失败不影响重新解析：下载会以幂等模式覆盖旧文件。
  }
}

// 解析卡片当前生效的头图来源（分享海报等离屏场景用）：
// 内存缓存 → 数据库持久化 → 按图池规则解析（会触发下载并持久化），
// 全部失败时回退到确定性本地图，与卡片实显示的头图保持一致。
export async function resolveCardImageSource(
  cardId: number,
  sourceUrl?: string,
  poolSize?: number,
): Promise<ImageSourcePropType> {
  const cached = memoryRemoteUrls.get(cardId);
  if (cached) return { uri: cached };

  try {
    const persisted = await getCardHeaderImageUrl(cardId);
    if (persisted) {
      memoryRemoteUrls.set(cardId, persisted);
      return { uri: persisted };
    }
  } catch {
    // 数据库读取失败时继续按图池规则解析。
  }

  try {
    const uri = await requestRemoteCardImageUrl(cardId, `share-${cardId}`, sourceUrl, poolSize);
    return { uri };
  } catch {
    return pickLocalCardImage(cardId);
  }
}

// 图池容量变化后调用：删除不再被任何卡片引用的头图文件。
export async function pruneUnreferencedCardImages(referencedUris: Set<string>) {
  try {
    const dir = new Directory(Paths.document, CARD_IMAGE_DIR);
    if (!dir.exists) return;
    for (const item of dir.list()) {
      if (item instanceof File && !referencedUris.has(item.uri)) {
        try {
          item.delete();
        } catch {
          // 单个文件清理失败不影响其余文件。
        }
      }
    }
  } catch {
    // 目录读取失败时跳过清理。
  }
}

// 头图解析规则：
// 1) 卡片已持久化头图 → 直接显示，零请求；
// 2) poolSize > 0 时多张卡片按 cardId % 容量 复用 K 个图池槽位，
//    全库最多只下载 K 次；poolSize = 0 时每卡独立下载一张；
// 3) 槽位文件已在本地 → 直接复用；否则按源顺序下载（多源回退 + 重试）；
// 4) 失败槽位进入冷却期，冷却期内不再发请求。
async function requestRemoteCardImageUrl(cardId: number, cardKey: string, sourceUrl?: string, poolSize = 8) {
  const cached = memoryRemoteUrls.get(cardId);
  if (cached) return cached;

  const normalizedPool = Number.isFinite(poolSize) && poolSize > 0 ? Math.floor(poolSize) : 0;
  const slotIndex = normalizedPool > 0 ? cardId % normalizedPool : cardId;
  const slotKey = normalizedPool > 0 ? `pool-${slotIndex}` : `card-${cardId}`;
  const target = new File(cardImageDir(), normalizedPool > 0 ? `pool-${slotIndex}.jpg` : `card-${cardId}.jpg`);

  const reusable = await resolveReusableFile(target);
  if (reusable) {
    memoryRemoteUrls.set(cardId, reusable);
    void saveCardHeaderImageUrl(cardId, reusable);
    return reusable;
  }

  const pending = pendingDownloads.get(slotKey);
  if (pending) return pending;

  const lastFailure = recentSlotFailures.get(slotKey);
  if (lastFailure && Date.now() - lastFailure < FAILURE_COOLDOWN_MS) {
    throw new Error('卡片头图刚下载失败，稍后自动重试');
  }

  const generation = resolutionGeneration;
  const preferred = sourceUrl && CARD_REMOTE_IMAGE_URLS.includes(sourceUrl as (typeof CARD_REMOTE_IMAGE_URLS)[number]) ? sourceUrl : null;
  const sources = preferred ? [preferred, ...CARD_REMOTE_IMAGE_URLS.filter((url) => url !== preferred)] : [...CARD_REMOTE_IMAGE_URLS];

  const request = (async () => {
    let lastError: unknown = null;
    for (const source of sources) {
      if (generation !== resolutionGeneration) throw new Error('卡片壁纸源已切换');
      try {
        const downloaded = await downloadImageFile(withImageCacheBuster(source, `${cardKey}-${Date.now()}`), target);
        if (generation !== resolutionGeneration) throw new Error('卡片壁纸源已切换');
        memoryRemoteUrls.set(cardId, downloaded.uri);
        void saveCardHeaderImageUrl(cardId, downloaded.uri);
        return downloaded.uri;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('没有可用的卡片头图源');
  })();

  pendingDownloads.set(slotKey, request);
  request
    .finally(() => {
      pendingDownloads.delete(slotKey);
    })
    .then(() => {
      recentSlotFailures.delete(slotKey);
    })
    .catch(() => {
      recentSlotFailures.set(slotKey, Date.now());
    });
  return request;
}

export function CardHeaderImage({ mode, cardKey, cardId, cachedUrl, sourceUrl, poolSize, style, imageStyle, children }: Props) {
  const localFallback = React.useMemo(() => pickLocalCardImage(cardId), [cardId]);
  const initialRemoteUrl = cachedUrl || memoryRemoteUrls.get(cardId) || '';
  const [remoteUrl, setRemoteUrl] = React.useState(initialRemoteUrl);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const savedUrl = cachedUrl || memoryRemoteUrls.get(cardId) || '';
    setFailed(false);
    setRemoteUrl(savedUrl);

    if (mode !== 'remote' || savedUrl) {
      return () => {
        mounted = false;
      };
    }

    requestRemoteCardImageUrl(cardId, cardKey, sourceUrl, poolSize)
      .then((url) => {
        if (!mounted) return;
        setRemoteUrl(url);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, [cachedUrl, cardId, cardKey, mode, poolSize, sourceUrl]);

  const source = React.useMemo(() => {
    if (mode === 'remote' && remoteUrl && !failed) return { uri: remoteUrl };
    return localFallback;
  }, [failed, localFallback, mode, remoteUrl]);

  return (
    <ImageBackground source={source} resizeMode="cover" imageStyle={imageStyle} style={style} onError={() => setFailed(true)}>
      {children}
    </ImageBackground>
  );
}
