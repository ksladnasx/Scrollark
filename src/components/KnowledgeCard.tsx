import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CardRecord, Settings } from '../domain/types';
import { palette, radius, shadow } from '../theme/tokens';
import { CardHeaderImage } from './CardHeaderImage';
import { MarkdownRenderer } from './MarkdownRenderer';

type Props = {
  card: CardRecord;
  settings: Settings;
  compact?: boolean;
  onClose?: () => void;
  footer?: React.ReactNode;
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

export function KnowledgeCard({ card, settings, compact = false, onClose, footer }: Props) {
  const meta = [card.h2, card.documentTitle].filter(Boolean).join(' · ');
  const title = card.title || card.h3 || '未命名卡片';

  const body = (
    <>
      <Text style={[styles.title, compact && styles.compactTitle, { color: settings.fontColor, fontFamily: settings.fontFamily }]} numberOfLines={compact ? 2 : undefined}>
        {title}
      </Text>
      {meta ? <Text style={[styles.meta, { fontFamily: settings.fontFamily }]} numberOfLines={compact ? 1 : undefined}>{meta}</Text> : null}
      {compact ? (
        <Text style={[styles.previewText, { color: settings.fontColor, fontFamily: settings.fontFamily }]} numberOfLines={6} ellipsizeMode="tail">
          {makeCompactPreview(card.content, title) || '点击查看卡片详情'}
        </Text>
      ) : (
        <MarkdownRenderer markdown={stripDuplicatedLeadingTitle(card.content, title)} color={settings.fontColor} fontSize={settings.fontSize} fontFamily={settings.fontFamily} />
      )}
      {card.annotation && !compact ? (
        <View style={styles.annotationBox}>
          <Text style={styles.annotationLabel}>我的批注</Text>
          <Text style={[styles.annotationText, { fontFamily: settings.fontFamily }]}>{card.annotation}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.card, compact && styles.compactCard]}>
      {settings.cardHeaderImageMode !== 'hidden' ? (
        <CardHeaderImage
          mode={settings.cardHeaderImageMode}
          cardKey={`${card.id}-${card.documentId}-${card.sortOrder}`}
          imageStyle={styles.headerImage}
          style={[styles.header, compact && styles.compactHeader]}
        >
          <View style={styles.headerScrim} />
          {onClose ? (
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </CardHeaderImage>
      ) : null}

      {compact ? (
        <View style={styles.compactContent}>{body}</View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {body}
        </ScrollView>
      )}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
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
    marginTop: 12,
    borderRadius: radius.lg,
    backgroundColor: '#F4EAD8',
    padding: 15,
    gap: 6,
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
