export const HOME_BACKGROUND_IMAGE_URLS = [
  'https://api.4qb.cn/api/suiji-bizhi?msg=3&type=image',
  'https://api.6045833.xyz/wsnature',
] as const;
export const HOME_BACKGROUND_IMAGE_URL = HOME_BACKGROUND_IMAGE_URLS[0];
export const CARD_REMOTE_IMAGE_URL = 'https://api.6045833.xyz/wsnature';

export function withImageCacheBuster(url: string, key: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_scrollark=${encodeURIComponent(key)}`;
}
