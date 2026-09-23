import React from 'react';
import { ImageBackground, type ImageSourcePropType, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import type { CardHeaderImageMode } from '../domain/types';
import { cardImages } from '../theme/assets';
import { CARD_REMOTE_IMAGE_URL, withImageCacheBuster } from '../config/imageUrls';

type Props = {
  mode: CardHeaderImageMode;
  cardKey: string;
  style: StyleProp<ViewStyle>;
  imageStyle: StyleProp<ImageStyle>;
  children?: React.ReactNode;
};

const cardImageKeys = Object.keys(cardImages);

function pickLocalCardImage(cardKey: string): ImageSourcePropType {
  const key = cardImageKeys[Math.floor((Math.random() + cardKey.length * 0) * cardImageKeys.length)] ?? 'warm0';
  return cardImages[key] ?? cardImages.warm0;
}

function createRemoteCardImage(cardKey: string): ImageSourcePropType {
  return { uri: withImageCacheBuster(CARD_REMOTE_IMAGE_URL, `${cardKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`) };
}

export function CardHeaderImage({ mode, cardKey, style, imageStyle, children }: Props) {
  const localFallback = React.useMemo(() => pickLocalCardImage(cardKey), [cardKey]);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [mode, cardKey]);

  const source = React.useMemo(() => {
    if (mode === 'remote' && !failed) return createRemoteCardImage(cardKey);
    return localFallback;
  }, [cardKey, failed, localFallback, mode]);

  return (
    <ImageBackground source={source} resizeMode="cover" imageStyle={imageStyle} style={style} onError={() => setFailed(true)}>
      {children}
    </ImageBackground>
  );
}
