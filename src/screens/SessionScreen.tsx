import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, BackHandler, Easing, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnnotationEditor } from '../components/AnnotationEditor';
import { AppButton } from '../components/AppButton';
import { KnowledgeCard } from '../components/KnowledgeCard';
import { ShareCardOverlay } from '../components/ShareCardOverlay';
import { buildSessionCards, importMarkdownDocument, markCardGot, toggleFavorite, unmarkGot } from '../data/repository';
import type { CardRecord, SessionSummary, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';

type Props = {
  settings: Settings;
  onClose: () => void;
  onChanged: () => void;
  onEnd: (summary: SessionSummary) => void;
  // 空态（没有未读新卡）时引导用户去复习已 get 的卡片。
  onStartReview: () => void;
};

type EndPage = { type: 'end'; id: 'end' };
type SessionItem = CardRecord | EndPage;

function isEndPage(item: SessionItem): item is EndPage {
  return 'type' in item && item.type === 'end';
}

type HeartPopItem = { id: number; x: number; y: number; rotation: number };

// 双击收藏的爱心动画（抖音式）：在点击位置弹出、上飘并淡出。
// 每次双击都会生成一个独立实例，连续快速双击时多个爱心同时飘动。
function HeartPop({ pop, topOffset, onDone }: { pop: HeartPopItem; topOffset: number; onDone: (id: number) => void }) {
  const scale = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const drift = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 130, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
      Animated.timing(drift, { toValue: -76, duration: 760, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onDone(pop.id);
    });
    return () => animation.stop();
  }, [drift, onDone, opacity, pop.id, scale]);

  return (
    <View
      pointerEvents="none"
      style={[styles.heartPop, { left: pop.x - 49, top: pop.y - topOffset - 47, transform: [{ rotate: `${pop.rotation}deg` }] }]}
    >
      <Animated.View style={{ opacity, transform: [{ scale }, { translateY: drift }] }}>
        <Ionicons name="heart" size={110} color="#FF5A79" />
      </Animated.View>
    </View>
  );
}

export function SessionScreen({ settings, onClose, onChanged, onEnd, onStartReview }: Props) {
  const theme = useAppTheme();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pageHeight, setPageHeight] = React.useState(height);
  const [cards, setCards] = React.useState<CardRecord[]>([]);
  const [index, setIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState('');
  const [annotationCard, setAnnotationCard] = React.useState<CardRecord | null>(null);
  const listRef = React.useRef<FlatList<SessionItem>>(null);
  const snapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOuterOffsetRef = React.useRef(0);
  const finishedRef = React.useRef(false);
  const gotActions = React.useRef(new Set<number>()).current;
  const favoriteActions = React.useRef(new Set<number>()).current;
  const annotationActions = React.useRef(new Set<number>()).current;
  const [heartPops, setHeartPops] = React.useState<HeartPopItem[]>([]);
  const heartIdRef = React.useRef(0);

  // 在点击位置生成一个爱心；最多同时保留 12 个，防止连点导致实例无限增长。
  const spawnHeart = React.useCallback((pageX: number, pageY: number) => {
    heartIdRef.current += 1;
    const x = Math.min(Math.max(pageX, 70), width - 70);
    const y = Math.min(Math.max(pageY, 110), height - 140);
    const pop: HeartPopItem = { id: heartIdRef.current, x, y, rotation: (Math.random() - 0.5) * 24 };
    setHeartPops((pops) => [...pops.slice(-11), pop]);
  }, [height, width]);

  const removeHeartPop = React.useCallback((id: number) => {
    setHeartPops((pops) => pops.filter((pop) => pop.id !== id));
  }, []);

  // 分享知识卡片：海报整屏挂载 → 截图 → 系统分享，流程见 ShareCardOverlay。
  const [sharingCard, setSharingCard] = React.useState<CardRecord | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    finishedRef.current = false;
    const next = await buildSessionCards(settings.sessionCardCount);
    setCards(next);
    setIndex(0);
    setLoading(false);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [settings.sessionCardCount]);

  React.useEffect(() => { void load(); }, [load]);

  const finish = React.useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onEnd({
      seen: cards.length,
      got: gotActions.size,
      favorites: favoriteActions.size,
      annotations: annotationActions.size,
      reviews: 0,
      ratings: { forgot: 0, fuzzy: 0, clear: 0 },
    });
  }, [annotationActions.size, cards.length, favoriteActions.size, gotActions.size, onEnd]);

  const updateLocalCard = React.useCallback((cardId: number, patch: Partial<CardRecord>) => {
    setCards((prev) => prev.map((item) => (item.id === cardId ? { ...item, ...patch } : item)));
    setAnnotationCard((prev) => (prev?.id === cardId ? { ...prev, ...patch } : prev));
  }, []);

  // get：标记已学并安排明天的第一次复习（评级在复习流程中进行）；再次点击取消 get。
  const handleGet = React.useCallback(async (card: CardRecord) => {
    if (card.isGot) {
      await unmarkGot(card.id);
      updateLocalCard(card.id, { isGot: 0 });
      gotActions.delete(card.id);
    } else {
      const nextReview = new Date();
      nextReview.setDate(nextReview.getDate() + 1);
      await markCardGot(card.id);
      updateLocalCard(card.id, { isGot: 1, getCount: card.getCount + 1, lastGotAt: new Date().toISOString(), nextReviewAt: nextReview.toISOString() });
      gotActions.add(card.id);
    }
    onChanged();
  }, [gotActions, onChanged, updateLocalCard]);

  const handleFavorite = React.useCallback(async (card: CardRecord) => {
    const nextFavorite = card.isFavorite ? 0 : 1;
    await toggleFavorite(card.id, Boolean(nextFavorite));
    updateLocalCard(card.id, { isFavorite: nextFavorite });
    if (nextFavorite) favoriteActions.add(card.id);
    else favoriteActions.delete(card.id);
    onChanged();
  }, [favoriteActions, onChanged, updateLocalCard]);

  // 双击正文（抖音式）：每次双击都弹出爱心动画；收藏动作只在卡片未收藏时执行
  // 一次，已收藏或收藏请求进行中时只出动画、不重复写库，也不会取消收藏。
  const doubleTapFavoriteInFlight = React.useRef(new Set<number>());
  const handleDoubleTapFavorite = React.useCallback(
    (card: CardRecord, pageX: number, pageY: number) => {
      spawnHeart(pageX, pageY);
      if (card.isFavorite || doubleTapFavoriteInFlight.current.has(card.id)) return;
      doubleTapFavoriteInFlight.current.add(card.id);
      void handleFavorite(card).finally(() => {
        doubleTapFavoriteInFlight.current.delete(card.id);
      });
    },
    [handleFavorite, spawnHeart],
  );

  const openAnnotation = React.useCallback((card: CardRecord) => {
    setAnnotationCard(card);
  }, []);

  // 批注编辑器保存后回调：更新本地卡片与统计动作，编辑器由父级关闭。
  const handleAnnotationSaved = React.useCallback(
    (note: string | null) => {
      if (!annotationCard) return;
      updateLocalCard(annotationCard.id, { annotation: note });
      if (note) annotationActions.add(annotationCard.id);
      else annotationActions.delete(annotationCard.id);
      setAnnotationCard(null);
      onChanged();
    },
    [annotationActions, annotationCard, onChanged, updateLocalCard],
  );

  // Android 返回手势/返回键：批注编辑器打开时由编辑器自行处理（返回 true 拦截），
  // 这里只负责退出刷卡回主页。
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  const importFirst = async () => {
    try {
      setLoading(true);
      setMessage('');
      const result = await importMarkdownDocument();
      if (result) {
        setMessage(`已导入 ${result.cards} 张卡片`);
        onChanged();
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败');
      setLoading(false);
    }
  };

  const sessionItems = React.useMemo<SessionItem[]>(() => [...cards, { type: 'end', id: 'end' }], [cards]);

  const clearSnapTimer = React.useCallback(() => {
    if (snapTimerRef.current) {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  }, []);

  const settleToPage = React.useCallback((offsetY: number, animated = true) => {
    const page = Math.max(1, pageHeight);
    const maxIndex = Math.max(0, sessionItems.length - 1);
    const nextIndex = Math.max(0, Math.min(maxIndex, Math.round(offsetY / page)));
    const targetOffset = nextIndex * page;

    clearSnapTimer();
    lastOuterOffsetRef.current = targetOffset;

    if (Math.abs(offsetY - targetOffset) > 1) {
      listRef.current?.scrollToOffset({ offset: targetOffset, animated });
    }

    if (nextIndex >= cards.length) {
      setIndex(Math.max(0, cards.length - 1));
      setTimeout(finish, 120);
      return;
    }
    setIndex(nextIndex);
  }, [cards.length, clearSnapTimer, finish, pageHeight, sessionItems.length]);

  const scheduleSnapBack = React.useCallback((offsetY: number) => {
    const page = Math.max(1, pageHeight);
    const maxIndex = Math.max(0, sessionItems.length - 1);
    const nearestOffset = Math.max(0, Math.min(maxIndex, Math.round(offsetY / page))) * page;

    clearSnapTimer();
    lastOuterOffsetRef.current = offsetY;
    if (Math.abs(offsetY - nearestOffset) <= 1) return;

    snapTimerRef.current = setTimeout(() => {
      settleToPage(lastOuterOffsetRef.current, true);
    }, 120);
  }, [clearSnapTimer, pageHeight, sessionItems.length, settleToPage]);

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
    return (
      <View style={[styles.bottomActions, { height: 62 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.card }] }>
        <Pressable onPress={() => handleGet(card)} style={({ pressed }) => [styles.getButton, { backgroundColor: theme.paperSoft, borderColor: theme.line }, card.isGot ? [styles.getButtonActive, { backgroundColor: theme.ink, borderColor: theme.ink }] : null, pressed && styles.pressed]}>
          <Ionicons name={card.isGot ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={card.isGot ? theme.paper : theme.ink} />
          <Text style={[styles.getText, card.isGot ? styles.getTextActive : null, { color: card.isGot ? theme.paper : theme.ink }]}>{card.isGot ? '已 get' : 'get'}</Text>
        </Pressable><Pressable onPress={() => handleFavorite(card)} style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}>
          <Ionicons name={card.isFavorite ? 'heart' : 'heart-outline'} size={25} color={card.isFavorite ? theme.red : theme.ink} />
          <Text style={[styles.actionText, { color: theme.inkMuted }]}>收藏</Text>
        </Pressable>
        <Pressable onPress={() => openAnnotation(card)} style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}>
          <Ionicons name={card.annotation ? 'chatbubble' : 'chatbubble-outline'} size={23} color={card.annotation ? theme.red : theme.ink} />
          <Text style={[styles.actionText, { color: theme.inkMuted }]}>批注</Text>
        </Pressable>
        <Pressable onPress={() => setSharingCard(card)} style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}>
          <Ionicons name="share-social-outline" size={23} color={theme.ink} />
          <Text style={[styles.actionText, { color: theme.inkMuted }]}>分享</Text>
        </Pressable>
      </View>
    );
  }, [handleFavorite, handleGet, insets.bottom, openAnnotation, theme]);

  const renderItem = React.useCallback(({ item }: { item: SessionItem }) => {
    if (isEndPage(item)) {
      return (
        <View style={[styles.pageItem, { height: pageHeight, width, backgroundColor: theme.card }]}> 
          <View style={[styles.endPage, { backgroundColor: theme.card }] }>
            <Text style={[styles.endEyebrow, { color: theme.inkMuted }]}>Session Complete</Text>
            <Text style={[styles.endTitle, { color: theme.ink }]}>这一轮读完了</Text>
            <Text style={[styles.endBody, { color: theme.inkMuted }]}>稍等一下，正在整理本轮 get、收藏与批注记录。</Text>
            <AppButton label="查看总结" icon="checkmark-outline" onPress={finish} />
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.pageItem, { height: pageHeight, width, backgroundColor: theme.card }]}>
        <KnowledgeCard card={item} settings={settings} onClose={onClose} titleInHeader onDoubleTapBody={(pageX, pageY) => handleDoubleTapFavorite(item, pageX, pageY)} />
        <View style={[styles.cardFooterBar, { borderTopColor: theme.line, backgroundColor: theme.card }]}>{renderFooter(item)}</View>
      </View>
    );
  }, [finish, handleDoubleTapFavorite, onClose, pageHeight, renderFooter, settings, theme, width]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.darkWrap, { backgroundColor: theme.paper }]} edges={['top', 'bottom']}>
        <Text style={[styles.loadingText, { color: theme.ink }]}>正在整理卡片…</Text>
      </SafeAreaView>
    );
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={[styles.emptyWrap, { backgroundColor: theme.paper }]} edges={['top', 'bottom']}>
        <Pressable onPress={onClose} style={[styles.close, { backgroundColor: theme.paperElevated }] }>
          <Ionicons name="chevron-back" size={24} color={theme.ink} />
        </Pressable>
        <View style={[styles.emptyCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }] }>
          <Text style={[styles.emptyTitle, { color: theme.ink }]}>没有待 GET 的新卡</Text>
          <Text style={[styles.emptyBody, { color: theme.inkMuted }]}>导入新的 Markdown 文档继续获取知识，或者去复习已 get 的卡片。</Text>
          <AppButton label="导入 Markdown" icon="document-attach-outline" onPress={importFirst} />
          <AppButton label="去复习" icon="repeat" variant="light" onPress={onStartReview} />
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.sessionRoot, { backgroundColor: theme.card }]}>
      <SafeAreaView style={[styles.sessionWrap, { backgroundColor: theme.card }]} edges={['top']}>
        <View style={[styles.listWrap, { backgroundColor: theme.card }]} onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}>
          <FlatList
            ref={listRef}
            data={sessionItems}
            keyExtractor={(item, itemIndex) => (isEndPage(item) ? `end-${itemIndex}` : `card-${item.id}-${item.documentId}-${item.sortOrder}-${itemIndex}`)}
            renderItem={renderItem}
            pagingEnabled
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
          <View style={[styles.progressPill]} pointerEvents="none">
            <Text style={styles.progressText}>{Math.min(index + 1, cards.length)}/{cards.length}</Text>
          </View>
          {heartPops.map((pop) => (
            <HeartPop key={pop.id} pop={pop} topOffset={insets.top} onDone={removeHeartPop} />
          ))}
        </View>
      </SafeAreaView>
      {annotationCard ? (
        <AnnotationEditor
          card={annotationCard}
          settings={settings}
          onClose={() => setAnnotationCard(null)}
          onSaved={handleAnnotationSaved}
        />
      ) : null}
      {sharingCard ? (
        <ShareCardOverlay
          key={sharingCard.id}
          card={sharingCard}
          settings={settings}
          onDone={() => setSharingCard(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  darkWrap: { flex: 1, backgroundColor: palette.dark, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: palette.paper, fontSize: 16, fontWeight: '800' },
  emptyWrap: { flex: 1, backgroundColor: palette.paper, padding: 18 },
  close: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.paperElevated, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { marginTop: 90, borderRadius: radius.xl, backgroundColor: palette.paperElevated, padding: 24, gap: 14, borderWidth: 1, borderColor: palette.line },
  emptyTitle: { color: palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -1 },
  emptyBody: { color: palette.inkMuted, fontSize: 15, lineHeight: 23 },
  message: { color: palette.blue, fontWeight: '700' },
  sessionWrap: { flex: 1, backgroundColor: '#FFFFFF' },
  listWrap: { flex: 1, backgroundColor: '#FFFFFF' },
  pageItem: { backgroundColor: '#FFFFFF' },
  progressPill: { position: 'absolute', top: 18, right: 18, minWidth: 58, height: 34, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.34)' },
  heartPop: { position: 'absolute', width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  progressText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  bottomActions: { paddingTop: 6, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF' },
  actionItem: { minWidth: 54, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionText: { color: palette.inkMuted, fontSize: 12, fontWeight: '800' },
  getButton: { minWidth: 88, height: 42, borderRadius: 21, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F4EAD8', borderWidth: 1, borderColor: palette.line },
  getButtonActive: { backgroundColor: palette.ink, borderColor: palette.ink },
  getText: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  getTextActive: { color: '#FFFFFF' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  endPage: { flex: 1, backgroundColor: '#FFFFFF', padding: 28, alignItems: 'center', justifyContent: 'center', gap: 14 },
  endEyebrow: { color: palette.inkMuted, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  endTitle: { color: palette.ink, fontSize: 36, lineHeight: 43, fontWeight: '900', letterSpacing: -1.1 },
  endBody: { color: palette.inkMuted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 8 },
  sessionRoot: { flex: 1, backgroundColor: '#FFFFFF' },
  cardFooterBar: { borderTopWidth: 1 },
});
