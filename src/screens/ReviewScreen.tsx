import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { BackHandler, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { KnowledgeCard } from '../components/KnowledgeCard';
import { buildAheadReviewCards, buildReviewCards, rateCard } from '../data/repository';
import type { CardRecord, MasteryRating, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { masteryColors, palette, radius } from '../theme/tokens';

type Props = {
  settings: Settings;
  // due = 今日到期复习；ahead = 提前复习（新近记忆 + 巩固中，不用等到期）。
  mode?: 'due' | 'ahead';
  tomorrowCount: number;
  onClose: () => void;
  onChanged: () => void;
  onStartSession: () => void;
};

type EndPage = { type: 'end'; id: 'end' };
type ReviewItem = CardRecord | EndPage;

function isEndPage(item: ReviewItem): item is EndPage {
  return 'type' in item && item.type === 'end';
}

// 复习反馈三档：不记得归零重来，模糊降档，记得升档（间隔见 repository.REVIEW_INTERVAL_DAYS）。
const REVIEW_RATINGS: { rating: MasteryRating; label: string; hint: string }[] = [
  { rating: 1, label: '不记得', hint: '明天再来' },
  { rating: 2, label: '模糊记得', hint: '缩短间隔' },
  { rating: 3, label: '记得', hint: '间隔拉长' },
];

export function ReviewScreen({ settings, mode = 'due', tomorrowCount, onClose, onChanged, onStartSession }: Props) {
  const theme = useAppTheme();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pageHeight, setPageHeight] = React.useState(height);
  const [cards, setCards] = React.useState<CardRecord[]>([]);
  const [index, setIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  // 已揭示答案的卡片：复习以「主动回忆」为先，揭示后才出现评级按钮。
  const [revealedIds, setRevealedIds] = React.useState<ReadonlySet<number>>(() => new Set());
  const listRef = React.useRef<FlatList<ReviewItem>>(null);
  const snapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOuterOffsetRef = React.useRef(0);
  const finishedRef = React.useRef(false);
  const ratingCounts = React.useRef({ forgot: 0, fuzzy: 0, clear: 0 }).current;
  const skippedCount = React.useRef(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    finishedRef.current = false;
    const next = mode === 'ahead' ? await buildAheadReviewCards(30) : await buildReviewCards(50);
    setCards(next);
    setIndex(0);
    setRevealedIds(new Set());
    setLoading(false);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [mode]);

  React.useEffect(() => { void load(); }, [load]);

  const updateLocalCard = React.useCallback((cardId: number, patch: Partial<CardRecord>) => {
    setCards((prev) => prev.map((item) => (item.id === cardId ? { ...item, ...patch } : item)));
  }, []);

  const reveal = React.useCallback((cardId: number) => {
    setRevealedIds((prev) => new Set(prev).add(cardId));
  }, []);

  const advance = React.useCallback((fromIndex: number) => {
    const nextIndex = Math.min(fromIndex + 1, cards.length);
    setIndex(nextIndex);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: nextIndex * pageHeight, animated: true });
    });
  }, [cards.length, pageHeight]);

  const handleRate = React.useCallback(async (card: CardRecord, rating: MasteryRating) => {
    const result = await rateCard(card.id, rating);
    updateLocalCard(card.id, {
      isGot: 1,
      getCount: card.getCount + 1,
      lastGotAt: new Date().toISOString(),
      mastery: result.mastery,
      reviewStage: result.reviewStage,
      nextReviewAt: result.nextReviewAt,
    });
    if (rating === 1) ratingCounts.forgot += 1;
    else if (rating === 2) ratingCounts.fuzzy += 1;
    else ratingCounts.clear += 1;
    onChanged();
    advance(index);
  }, [advance, index, onChanged, ratingCounts, updateLocalCard]);

  const handleSkip = React.useCallback(() => {
    skippedCount.current += 1;
    advance(index);
  }, [advance, index]);

  // Android 返回键：复习中返回直接退出复习回主页。
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  const reviewItems = React.useMemo<ReviewItem[]>(() => [...cards, { type: 'end', id: 'end' }], [cards]);

  const clearSnapTimer = React.useCallback(() => {
    if (snapTimerRef.current) {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  }, []);

  const settleToPage = React.useCallback((offsetY: number, animated = true) => {
    const page = Math.max(1, pageHeight);
    const maxIndex = Math.max(0, reviewItems.length - 1);
    const nextIndex = Math.max(0, Math.min(maxIndex, Math.round(offsetY / page)));
    const targetOffset = nextIndex * page;
    clearSnapTimer();
    lastOuterOffsetRef.current = targetOffset;
    if (Math.abs(offsetY - targetOffset) > 1) {
      listRef.current?.scrollToOffset({ offset: targetOffset, animated });
    }
    setIndex(nextIndex);
  }, [clearSnapTimer, pageHeight, reviewItems.length]);

  const scheduleSnapBack = React.useCallback((offsetY: number) => {
    const page = Math.max(1, pageHeight);
    const maxIndex = Math.max(0, reviewItems.length - 1);
    const nearestOffset = Math.max(0, Math.min(maxIndex, Math.round(offsetY / page))) * page;
    clearSnapTimer();
    lastOuterOffsetRef.current = offsetY;
    if (Math.abs(offsetY - nearestOffset) <= 1) return;
    snapTimerRef.current = setTimeout(() => {
      settleToPage(lastOuterOffsetRef.current, true);
    }, 120);
  }, [clearSnapTimer, pageHeight, reviewItems.length, settleToPage]);

  React.useEffect(() => clearSnapTimer, [clearSnapTimer]);

  const onListScroll = React.useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    scheduleSnapBack(event.nativeEvent.contentOffset.y);
  }, [scheduleSnapBack]);

  const onMomentumScrollEnd = React.useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    settleToPage(event.nativeEvent.contentOffset.y, true);
  }, [settleToPage]);

  const onScrollEndDrag = React.useCallback((event: { nativeEvent: { contentOffset: { y: number }; velocity?: { y?: number } } }) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const velocityY = Math.abs(event.nativeEvent.velocity?.y ?? 0);
    if (velocityY < 0.05) {
      settleToPage(offsetY, true);
      return;
    }
    scheduleSnapBack(offsetY);
  }, [scheduleSnapBack, settleToPage]);

  const renderFooter = React.useCallback((card: CardRecord) => {
    const revealed = revealedIds.has(card.id);
    if (!revealed) {
      return (
        <View style={[styles.bottomBar, { height: 54 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.card }]}>
          <Text style={[styles.recallHint, { color: theme.inkMuted, fontFamily: settings.fontFamily }]}>先在脑海里回忆这张卡，再对照答案给自己评级。</Text>
        </View>
      );
    }
    return (
      <View style={[styles.bottomBar, { height: 86 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.card }]}>
        <View style={styles.ratingRow}>
          {REVIEW_RATINGS.map((option) => (
            <Pressable
              key={option.rating}
              accessibilityRole="button"
              accessibilityLabel={`反馈：${option.label}`}
              onPress={() => void handleRate(card, option.rating)}
              style={({ pressed }) => [styles.ratingOption, { backgroundColor: masteryColors[option.rating] }, pressed && styles.pressed]}
            >
              <Text style={styles.ratingLabel}>{option.label}</Text>
              <Text style={styles.ratingHint}>{option.hint}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={handleSkip} hitSlop={8} style={({ pressed }) => [pressed && styles.pressed]}>
          <Text style={[styles.skipText, { color: theme.inkMuted, fontFamily: settings.fontFamily }]}>跳过，稍后再评</Text>
        </Pressable>
      </View>
    );
  }, [handleRate, handleSkip, insets.bottom, revealedIds, settings.fontFamily, theme]);

  const renderEndPage = React.useCallback(() => {
    const rated = ratingCounts.forgot + ratingCounts.fuzzy + ratingCounts.clear;
    return (
      <View style={[styles.pageItem, { height: pageHeight, width, backgroundColor: theme.card }]}>
        <View style={styles.endPage}>
          <Ionicons name="sparkles-outline" size={34} color={theme.accentSoft} />
          <Text style={[styles.endTitle, { color: theme.ink, fontFamily: settings.fontFamily }]}>本轮复习完成</Text>
          <Text style={[styles.endBody, { color: theme.inkMuted, fontFamily: settings.fontFamily }]}>
            复习 {rated + skippedCount.current} 张 · 记得 {ratingCounts.clear} · 模糊 {ratingCounts.fuzzy} · 不记得 {ratingCounts.forgot}
          </Text>
          <Text style={[styles.endMeta, { color: theme.inkMuted, fontFamily: settings.fontFamily }]}>评了「不记得」的卡片会在明天优先再次出现，间隔会随着「记得」逐渐拉长。</Text>
          <View style={styles.endActions}>
            <AppButton label="去 GET 新卡" icon="flash-outline" onPress={onStartSession} />
            <AppButton label="返回首页" icon="home-outline" variant="light" onPress={onClose} />
          </View>
        </View>
      </View>
    );
  }, [onClose, onStartSession, pageHeight, ratingCounts, settings.fontFamily, theme, width]);

  const renderItem = React.useCallback(({ item }: { item: ReviewItem }) => {
    if (isEndPage(item)) return renderEndPage();
    return (
      <View style={[styles.pageItem, { height: pageHeight, width, backgroundColor: theme.card }]}>
        <KnowledgeCard
          card={item}
          settings={settings}
          titleInHeader
          recall={{ hidden: !revealedIds.has(item.id), onReveal: () => reveal(item.id) }}
        />
        <View style={[styles.footerBar, { borderTopColor: theme.line, backgroundColor: theme.card }]}>{renderFooter(item)}</View>
      </View>
    );
  }, [pageHeight, renderEndPage, renderFooter, revealedIds, reveal, settings, theme, width]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.centerWrap, { backgroundColor: theme.paper }]} edges={['top', 'bottom']}>
        <Text style={[styles.loadingText, { color: theme.ink }]}>正在准备今天的复习…</Text>
      </SafeAreaView>
    );
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={[styles.centerWrap, { backgroundColor: theme.paper }]} edges={['top', 'bottom']}>
        <Pressable onPress={onClose} style={[styles.close, { backgroundColor: theme.paperElevated }]}>
          <Ionicons name="chevron-back" size={24} color={theme.ink} />
        </Pressable>
        <View style={[styles.emptyCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          <Ionicons name="checkmark-done-circle-outline" size={40} color={masteryColors[3]} />
          <Text style={[styles.emptyTitle, { color: theme.ink, fontFamily: settings.fontFamily }]}>
            {mode === 'ahead' ? '暂时没有可提前复习的卡片' : '今天没有到期的复习'}
          </Text>
          <Text style={[styles.emptyBody, { color: theme.inkMuted, fontFamily: settings.fontFamily }]}>
            {mode === 'ahead'
              ? '新近记忆和巩固中的卡片都已复习过，等它们到期后会自动出现在复习里。'
              : tomorrowCount > 0
                ? `已 get 的卡片会按遗忘曲线自动安排，明天预计 ${tomorrowCount} 张到期。`
                : '先去 GET 几张新卡，它们会在明天进入第一次复习。'}
          </Text>
          {mode === 'ahead' ? (
            <AppButton label="返回" icon="chevron-back" variant="light" onPress={onClose} />
          ) : (
            <>
              <AppButton label="去 GET 新卡" icon="flash-outline" onPress={onStartSession} />
              <AppButton label="返回首页" icon="home-outline" variant="light" onPress={onClose} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const progress = Math.round((index / cards.length) * 100);

  return (
    <View style={[styles.root, { backgroundColor: theme.card }]}>
      <SafeAreaView style={[styles.wrap, { backgroundColor: theme.card }]} edges={['top']}>
        <View style={[styles.listWrap, { backgroundColor: theme.card }]} onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}>
          <FlatList
            ref={listRef}
            data={reviewItems}
            keyExtractor={(item, itemIndex) => (isEndPage(item) ? `review-end-${itemIndex}` : `review-${item.id}-${itemIndex}`)}
            renderItem={renderItem}
            snapToInterval={pageHeight}
            snapToAlignment="start"
            showsVerticalScrollIndicator={false}
            bounces={false}
            decelerationRate="fast"
            disableIntervalMomentum
            overScrollMode="never"
            onScroll={onListScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={clearSnapTimer}
            onScrollEndDrag={onScrollEndDrag}
            onMomentumScrollBegin={clearSnapTimer}
            onMomentumScrollEnd={onMomentumScrollEnd}
            getItemLayout={(_, itemIndex) => ({ length: pageHeight, offset: pageHeight * itemIndex, index: itemIndex })}
            initialNumToRender={2}
            maxToRenderPerBatch={3}
            windowSize={3}
          />
          <View style={[styles.progressTrack, { backgroundColor: 'rgba(0,0,0,0.10)' }]} pointerEvents="none">
            <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.accent }]} />
          </View>
          <View style={styles.topBar} pointerEvents="box-none">
            <Pressable accessibilityRole="button" accessibilityLabel="退出复习" onPress={onClose} style={({ pressed }) => [styles.close, { backgroundColor: 'rgba(0,0,0,0.34)' }, pressed && styles.pressed]}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
            <View style={styles.progressPill}>
              <Text style={styles.progressText}>{Math.min(index + 1, cards.length)}/{cards.length}</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  wrap: { flex: 1, backgroundColor: '#FFFFFF' },
  listWrap: { flex: 1, backgroundColor: '#FFFFFF' },
  centerWrap: { flex: 1, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center', padding: 18 },
  loadingText: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { marginTop: 90, borderRadius: radius.xl, backgroundColor: palette.paperElevated, padding: 24, gap: 14, borderWidth: 1, borderColor: palette.line, alignItems: 'center' },
  emptyTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  emptyBody: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  pageItem: { backgroundColor: '#FFFFFF' },
  footerBar: { borderTopWidth: 1 },
  bottomBar: { paddingTop: 10, paddingHorizontal: 18, gap: 8, alignItems: 'center' },
  recallHint: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  ratingRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  ratingOption: { flex: 1, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', gap: 2 },
  ratingLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  ratingHint: { color: 'rgba(255,255,255,0.82)', fontSize: 10, fontWeight: '700' },
  skipText: { fontSize: 12, fontWeight: '800' },
  progressTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  progressFill: { height: 3 },
  topBar: { position: 'absolute', top: 10, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressPill: { minWidth: 58, height: 34, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.34)' },
  progressText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  endPage: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 14 },
  endTitle: { fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1 },
  endBody: { fontSize: 15, lineHeight: 23, textAlign: 'center', fontWeight: '700' },
  endMeta: { fontSize: 12, lineHeight: 19, textAlign: 'center', marginBottom: 8 },
  endActions: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
