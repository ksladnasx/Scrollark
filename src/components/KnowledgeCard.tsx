import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { CardRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius, shadow, type AppTheme } from '../theme/tokens';
import { CardHeaderImage } from './CardHeaderImage';
import { MarkdownRenderer } from './MarkdownRenderer';

type Props = {
  card: CardRecord;
  settings: Settings;
  compact?: boolean;
  onClose?: () => void;
  footer?: React.ReactNode;
  titleInHeader?: boolean;
  showAnnotationPreview?: boolean;
};

function normalizeTitle(value: string) {
  return value.replace(/^[#\s]+/, '').replace(/[\s#*_`>\[\]]/g, '').trim().toLowerCase();
}

function makeCompactPreview(markdown: string, title: string) {
  return stripDuplicatedLeadingTitle(markdown, title)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[-:]{3,}/g, ' ')
    .replace(/[*_`=#>\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripDuplicatedLeadingTitle(markdown: string, title: string) {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex < 0) return markdown;

  const firstLine = lines[firstContentIndex].trim();
  const heading = firstLine.match(/^(#{1,6})\s+(.+)\s*$/);
  const firstTitle = heading ? heading[2] : firstLine;

  if (normalizeTitle(firstTitle) !== normalizeTitle(title)) return markdown;
  return [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)].join('\n').trimStart();
}

function readableCardTextColor(theme: AppTheme, color: string) {
  if (!theme.dark) return color;
  return color === '#171611' || color === '#30443A' || color === '#263E4B' || color === '#5B3B28' ? theme.ink : color;
}

export function KnowledgeCard({ card, settings, compact = false, onClose, footer, titleInHeader = false, showAnnotationPreview = false }: Props) {
  const theme = useAppTheme();
  const meta = [card.h2, card.documentTitle].filter(Boolean).join(' · ');
  const title = card.title || card.h3 || '未命名卡片';
  const textColor = readableCardTextColor(theme, settings.fontColor);
  const annotation = card.annotation?.trim() ?? '';
  const shouldShowTitleInHeader = titleInHeader && !compact;
  const shouldShowTitleInBody = !shouldShowTitleInHeader;
  const [showHeaderTitle, setShowHeaderTitle] = React.useState(false);
  const showHeaderTitleRef = React.useRef(false);
  const titleHeightRef = React.useRef(42);

  React.useEffect(() => {
    showHeaderTitleRef.current = false;
    setShowHeaderTitle(false);
  }, [card.id, settings.cardHeaderImageMode, titleInHeader]);

  const handleTitleLayout = React.useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    titleHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  const handleContentScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (compact || shouldShowTitleInHeader || settings.cardHeaderImageMode !== 'hidden') return;
    const titleOutOfViewOffset = 16 + titleHeightRef.current + 6;
    const next = event.nativeEvent.contentOffset.y >= titleOutOfViewOffset;
    if (next !== showHeaderTitleRef.current) {
      showHeaderTitleRef.current = next;
      setShowHeaderTitle(next);
    }
  }, [compact, settings.cardHeaderImageMode, shouldShowTitleInHeader]);

  const body = (
    <>
      {shouldShowTitleInBody ? (
        <>
          <Text
            selectable
            onLayout={compact ? undefined : handleTitleLayout}
            style={[styles.title, compact && styles.compactTitle, { color: textColor, fontFamily: settings.fontFamily }]}
            numberOfLines={compact ? 2 : undefined}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
          {meta ? <Text selectable style={[styles.meta, { color: theme.inkMuted, fontFamily: settings.fontFamily }]} numberOfLines={compact ? 1 : undefined} ellipsizeMode="tail">{meta}</Text> : null}
        </>
      ) : null}
      {annotation && (!compact || showAnnotationPreview) ? (
        <View style={[styles.annotationBox, compact && styles.compactAnnotationBox, { backgroundColor: theme.paperSoft }] }>
          <Text selectable style={[styles.annotationLabel, { color: theme.inkMuted }]}>我的批注</Text>
          <Text selectable style={[styles.annotationText, compact && styles.compactAnnotationText, { color: theme.ink, fontFamily: settings.fontFamily }]} numberOfLines={compact ? 2 : undefined} ellipsizeMode="tail">{annotation}</Text>
        </View>
      ) : null}
      {compact ? (
        <Text selectable style={[styles.previewText, { color: textColor, fontFamily: settings.fontFamily }]} numberOfLines={showAnnotationPreview && annotation ? 3 : 4} ellipsizeMode="tail">
          {makeCompactPreview(card.content, title) || '点击查看卡片内容'}
        </Text>
      ) : (
        <MarkdownRenderer markdown={stripDuplicatedLeadingTitle(card.content, title)} color={textColor} fontSize={settings.fontSize} fontFamily={settings.fontFamily} />
      )}
    </>
  );

  return (
    <View style={[styles.card, { backgroundColor: theme.card }, compact && [styles.compactCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]]}>
      {settings.cardHeaderImageMode !== 'hidden' ? (
        <CardHeaderImage
          mode={settings.cardHeaderImageMode}
          cardKey={`${card.id}-${card.documentId}-${card.sortOrder}`}
          cardId={card.id}
          cachedUrl={card.headerImageUrl}
          imageStyle={styles.headerImage}
          style={[styles.header, compact && styles.compactHeader]}
        >
          <View style={styles.headerScrim} />
          {shouldShowTitleInHeader ? (
            <View style={styles.imageHeaderTitleWrap}>
              <Text selectable style={[styles.imageHeaderTitle, { fontFamily: settings.fontFamily }]} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
              {meta ? <Text selectable style={[styles.imageHeaderSource, { fontFamily: settings.fontFamily }]} numberOfLines={1} ellipsizeMode="tail">{meta}</Text> : null}
            </View>
          ) : null}
          {onClose ? (
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </CardHeaderImage>
      ) : (
        <View style={[styles.textHeader, compact && styles.compactTextHeader, { backgroundColor: theme.paperSoft, borderBottomColor: theme.line }] }>
          {onClose ? (
            <Pressable onPress={onClose} style={({ pressed }) => [styles.textCloseButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}>
              <Ionicons name="chevron-back" size={23} color={theme.ink} />
            </Pressable>
          ) : null}
          {(showHeaderTitle || shouldShowTitleInHeader) && !compact ? (
            <View style={styles.textHeaderContent}>
              <Text selectable style={[styles.textHeaderTitle, { color: theme.ink, fontFamily: settings.fontFamily }]} numberOfLines={1}>{title}</Text>
              {meta ? <Text selectable style={[styles.textHeaderSource, { color: theme.inkMuted, fontFamily: settings.fontFamily }]} numberOfLines={1}>{meta}</Text> : null}
            </View>
          ) : (
            <Text style={[styles.textHeaderLabel, { color: theme.inkMuted, fontFamily: settings.fontFamily }]} numberOfLines={1}>Scrollark · Knowledge Card</Text>
          )}
        </View>
      )}

      {compact ? (
        <View style={[styles.compactContent, { backgroundColor: theme.paperElevated }]}>{body}</View>
      ) : (
        <ScrollView
          style={[styles.content, { backgroundColor: theme.card }]}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          scrollEventThrottle={16}
          onScroll={handleContentScroll}
        >
          {body}
        </ScrollView>
      )}

      {footer ? <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.line }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
  },
  compactCard: {
    height: 360,
    maxHeight: 360,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.line,
    ...shadow.soft,
  },
  header: {
    width: '100%',
    height: '30%',
    minHeight: 172,
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#D8D0C3',
  },
  compactHeader: {
    height: 108,
    minHeight: 108,
  },
  headerImage: {
    width: '100%',
    height: '100%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  headerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  imageHeaderTitleWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 20,
    gap: 5,
  },
  imageHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    textShadowColor: 'rgba(0,0,0,0.36)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  imageHeaderSource: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.32)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  textHeader: {
    height: 86,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  compactTextHeader: {
    height: 54,
  },
  textHeaderLabel: {
    marginLeft: 58,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  textHeaderContent: {
    marginLeft: 58,
    gap: 3,
  },
  textHeaderTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  textHeaderSource: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  textCloseButton: {
    position: 'absolute',
    left: 18,
    top: 21,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  closeButton: {
    position: 'absolute',
    left: 18,
    top: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  content: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentInner: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 10,
  },
  compactContent: {
    flex: 1,
    padding: 16,
    gap: 8,
    overflow: 'hidden',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  compactTitle: {
    fontSize: 22,
    lineHeight: 28,
  },
  meta: {
    color: palette.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  previewText: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 23,
  },
  annotationBox: {
    marginTop: 8,
    borderRadius: radius.lg,
    backgroundColor: '#F4EAD8',
    padding: 15,
    gap: 6,
  },
  compactAnnotationBox: {
    marginTop: 0,
    padding: 12,
    gap: 4,
  },
  annotationLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  annotationText: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 23,
  },
  compactAnnotationText: {
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#EEE6DA',
    backgroundColor: '#FFFFFF',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
});
