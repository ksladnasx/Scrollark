import React from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { MarkdownBlocks } from './MarkdownRenderer';
import { parseMarkdownBlocks } from '../utils/markdown';
import { softIcon } from '../theme/assets';
import type { CardRecord, Settings } from '../domain/types';
import { palette, radius } from '../theme/tokens';

type Props = {
  card: CardRecord;
  settings: Settings;
  width: number;
  // 已解析好的头图来源（内存/持久化/图池下载，全部失败时为本地图）。
  imageSource: ImageSourcePropType;
  maxBlocks?: number;
  onLayout?: (height: number) => void;
  // 头图加载完成（成功或失败）后回调，供截图方等待图片真正上屏。
  onImageLoaded?: () => void;
};

// 海报配色固定为纸质浅色（分享图在深色手机上也保持一致的观感），
// 正文字色跟随用户设置的阅读颜色与字体。
function formatDateText(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function SharePoster({ card, settings, width, imageSource, maxBlocks = 30, onLayout, onImageLoaded }: Props) {
  const blocks = React.useMemo(() => parseMarkdownBlocks(card.content), [card.content]);
  const shown = blocks.slice(0, maxBlocks);
  const truncated = blocks.length > maxBlocks;
  const meta = [card.h2, card.documentTitle].filter(Boolean).join(' · ');

  return (
    <View
      style={[styles.poster, { width }]}
      collapsable={false}
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.height)}
    >
      <View style={styles.heroWrap}>
        <Image
          source={imageSource}
          style={styles.heroImage}
          resizeMode="cover"
          fadeDuration={0}
          onLoadEnd={() => onImageLoaded?.()}
        />
        <View style={styles.heroScrim} />
        <View style={styles.heroBrandRow}>
          <Image source={softIcon} style={styles.brandIcon} />
          <Text style={styles.heroBrandName}>Scrollark · 知识卡片</Text>
          <Text style={styles.heroBrandDate}>{formatDateText(new Date())}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { fontFamily: settings.fontFamily }]}>{card.title}</Text>
        {meta ? <Text numberOfLines={1} style={[styles.meta, { fontFamily: settings.fontFamily }]}>{meta}</Text> : null}
        <View style={styles.divider} />

        <View style={styles.content}>
          <MarkdownBlocks blocks={shown} color={palette.ink} fontSize={15} fontFamily={settings.fontFamily} />
          {truncated ? <Text style={styles.truncated}>—— 内容较长，这里展示前部分，完整内容在 Scrollark 中阅读 ——</Text> : null}
          {card.annotation?.trim() ? (
            <View style={styles.annotation}>
              <Text style={styles.annotationLabel}>我的批注</Text>
              <Text style={[styles.annotationText, { fontFamily: settings.fontFamily }]}>{card.annotation.trim()}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    backgroundColor: '#FFF9EE',
    paddingBottom: 28,
  },
  heroWrap: {
    height: 220,
    backgroundColor: '#EFE6D5',
    overflow: 'hidden',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  heroBrandRow: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandIcon: { width: 22, height: 22, borderRadius: 6 },
  heroBrandName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
  heroBrandDate: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  body: {
    paddingTop: 22,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.6,
    color: '#171611',
  },
  meta: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6E6A5E',
    marginTop: 8,
  },
  divider: {
    width: 46,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#11110F',
    marginVertical: 18,
  },
  content: {
    gap: 6,
  },
  truncated: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6E6A5E',
    textAlign: 'center',
    marginTop: 14,
  },
  annotation: {
    marginTop: 16,
    backgroundColor: '#F4EAD8',
    borderRadius: radius.lg,
    padding: 14,
  },
  annotationLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#6E6A5E',
  },
  annotationText: {
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '600',
    color: '#171611',
    marginTop: 6,
  },
});
