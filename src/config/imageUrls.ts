export const HOME_BACKGROUND_IMAGE_URL = 'https://www.loliapi.com/acg/pe/';
export const CARD_REMOTE_IMAGE_URL = 'https://api.6045833.xyz/wsnature';

export function withImageCacheBuster(url: string, key: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_scrollark=${encodeURIComponent(key)}`;
}
