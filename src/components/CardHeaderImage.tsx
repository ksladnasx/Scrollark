import React from 'react';
import { ImageBackground, type ImageSourcePropType, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { CARD_REMOTE_IMAGE_URL, withImageCacheBuster } from '../config/imageUrls';
import { saveCardHeaderImageUrl } from '../data/repository';
import type { CardHeaderImageMode } from '../domain/types';
import { cardImages } from '../theme/assets';

type Props = {
  mode: CardHeaderImageMode;
  cardKey: string;
  cardId: number;
  cachedUrl?: string | null;
  style: StyleProp<ViewStyle>;
  imageStyle: StyleProp<ImageStyle>;
  children?: React.ReactNode;
};

const cardImageKeys = Object.keys(cardImages);
const pendingRemoteUrls = new Map<number, Promise<string>>();
const memoryRemoteUrls = new Map<number, string>();

function pickLocalCardImage(cardKey: string): ImageSourcePropType {
  const key = cardImageKeys[Math.floor((Math.random() + cardKey.length * 0) * cardImageKeys.length)] ?? 'warm0';
  return cardImages[key] ?? cardImages.warm0;
}

async function requestRemoteCardImageUrl(cardId: number, cardKey: string) {
  const cached = memoryRemoteUrls.get(cardId);
  if (cached) return cached;

  const pending = pendingRemoteUrls.get(cardId);
  if (pending) return pending;

  const request = fetch(withImageCacheBuster(CARD_REMOTE_IMAGE_URL, `${cardKey}-${Date.now()}`))
    .then((response) => {
      const url = response.url;
      if (!url) throw new Error('empty image url');
      memoryRemoteUrls.set(cardId, url);
      return url;
    })
    .finally(() => {
      pendingRemoteUrls.delete(cardId);
    });

  pendingRemoteUrls.set(cardId, request);
  return request;
}

export function CardHeaderImage({ mode, cardKey, cardId, cachedUrl, style, imageStyle, children }: Props) {
  const localFallback = React.useMemo(() => pickLocalCardImage(cardKey), [cardKey]);
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

    requestRemoteCardImageUrl(cardId, cardKey)
      .then((url) => {
        if (!mounted) return;
        setRemoteUrl(url);
        void saveCardHeaderImageUrl(cardId, url);
      })
      .catch(() => {
        if (mounted) setFailed(true);
      });

    return () => {
      mounted = false;
    };
  }, [cachedUrl, cardId, cardKey, mode]);

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
