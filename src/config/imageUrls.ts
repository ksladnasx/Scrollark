export const HOME_BACKGROUND_IMAGE_URLS = [
  'https://api.4qb.cn/api/suiji-bizhi?msg=3&type=image',
  'https://www.loliapi.com/acg/pe/',
  'https://api.6045833.xyz/wsnature',
] as const;
export const HOME_BACKGROUND_IMAGE_URL = HOME_BACKGROUND_IMAGE_URLS[0];
// 卡片头图源按顺序回退：loliapi 与 4qb.cn 为国内可直连的服务，6045833.xyz
// （Vercel 托管）在部分国内移动网络下不可达，只作为最后的备用源。
export const CARD_REMOTE_IMAGE_URLS = [
  'https://www.loliapi.com/acg/pc/',
  'https://api.4qb.cn/api/suiji-bizhi?msg=3&type=image',
  'https://api.6045833.xyz/wsnature',
] as const;

const IMAGE_SOURCE_LABELS: Record<string, string> = {
  'https://api.4qb.cn/api/suiji-bizhi?msg=3&type=image': '随机壁纸源',
  'https://api.6045833.xyz/wsnature': '自然壁纸源',
  'https://www.loliapi.com/acg/pe/': '动漫壁纸源',
  'https://www.loliapi.com/acg/pc/': '动漫壁纸源',
};

export function imageSourceLabel(url: string) {
  return IMAGE_SOURCE_LABELS[url] ?? url;
}

export function withImageCacheBuster(url: string, key: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_scrollark=${encodeURIComponent(key)}`;
}
