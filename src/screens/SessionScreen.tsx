import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { KnowledgeCard } from '../components/KnowledgeCard';
import { buildSessionCards, importMarkdownDocument, markGot, saveAnnotation, toggleFavorite } from '../data/repository';
import type { CardRecord, SessionSummary, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';

type Props = {
  settings: Settings;
  onClose: () => void;
  onChanged: () => void;
  onEnd: (summary: SessionSummary) => void;
};

type EndPage = { type: 'end'; id: 'end' };
type SessionItem = CardRecord | EndPage;

function isEndPage(item: SessionItem): item is EndPage {
  return 'type' in item && item.type === 'end';
}

export function SessionScreen({ settings, onClose, onChanged, onEnd }: Props) {
  const theme = useAppTheme();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pageHeight, setPageHeight] = React.useState(height);
  const [cards, setCards] = React.useState<CardRecord[]>([]);
  const [index, setIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState('');
  const [annotationCard, setAnnotationCard] = React.useState<CardRecord | null>(null);
  const [draftNote, setDraftNote] = React.useState('');
  const listRef = React.useRef<FlatList<SessionItem>>(null);
  const snapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOuterOffsetRef = React.useRef(0);
  const finishedRef = React.useRef(false);
  const gotActions = React.useRef(new Set<number>()).current;
  const favoriteActions = React.useRef(new Set<number>()).current;
  const annotationActions = React.useRef(new Set<number>()).current;

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
    });
  }, [annotationActions.size, cards.length, favoriteActions.size, gotActions.size, onEnd]);

  const updateLocalCard = React.useCallback((cardId: number, patch: Partial<CardRecord>) => {
    setCards((prev) => prev.map((item) => (item.id === cardId ? { ...item, ...patch } : item)));
    setAnnotationCard((prev) => (prev?.id === cardId ? { ...prev, ...patch } : prev));
  }, []);

  const handleGet = React.useCallback(async (card: CardRecord) => {
    const nextGot = card.isGot ? 0 : 1;
    await markGot(card.id, Boolean(nextGot));
    updateLocalCard(card.id, { isGot: nextGot, getCount: card.getCount + (nextGot ? 1 : 0), lastGotAt: nextGot ? new Date().toISOString() : card.lastGotAt });
    if (nextGot) gotActions.add(card.id);
    else gotActions.delete(card.id);
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

  const openAnnotation = React.useCallback((card: CardRecord) => {
    setAnnotationCard(card);
    setDraftNote(card.annotation ?? '');
  }, []);

  const persistAnnotation = React.useCallback(async () => {
    if (!annotationCard) return;
    await saveAnnotation(annotationCard.id, draftNote);
    const note = draftNote.trim();
    updateLocalCard(annotationCard.id, { annotation: note || null });
    if (note) annotationActions.add(annotationCard.id);
    else annotationActions.delete(annotationCard.id);
    setAnnotationCard(null);
    onChanged();
  }, [annotationActions, annotationCard, draftNote, onChanged, updateLocalCard]);

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

  const renderFooter = React.useCallback((card: CardRecord) => (
    <View style={[styles.bottomActions, { height: 62 + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.card }] }>
      <Pressable onPress={() => openAnnotation(card)} style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}>
        <Ionicons name={card.annotation ? 'chatbubble' : 'chatbubble-outline'} size={23} color={card.annotation ? theme.red : theme.ink} />
        <Text style={[styles.actionText, { color: theme.inkMuted }]}>批注</Text>
      </Pressable>
      <Pressable onPress={() => handleFavorite(card)} style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}>
        <Ionicons name={card.isFavorite ? 'heart' : 'heart-outline'} size={25} color={card.isFavorite ? theme.red : theme.ink} />
        <Text style={[styles.actionText, { color: theme.inkMuted }]}>收藏</Text>
      </Pressable>
      <Pressable onPress={() => handleGet(card)} style={({ pressed }) => [styles.getButton, { backgroundColor: theme.paperSoft, borderColor: theme.line }, card.isGot ? [styles.getButtonActive, { backgroundColor: theme.ink, borderColor: theme.ink }] : null, pressed && styles.pressed]}>
        <Ionicons name={card.isGot ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={card.isGot ? theme.paper : theme.ink} />
        <Text style={[styles.getText, card.isGot ? styles.getTextActive : null, { color: card.isGot ? theme.paper : theme.ink }]}>{card.isGot ? '已 get' : 'get'}</Text>
      </Pressable>
      <Pressable onPress={onClose} style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}>
        <Ionicons name="ellipsis-horizontal" size={25} color={theme.ink} />
      </Pressable>
    </View>
  ), [handleFavorite, handleGet, insets.bottom, onClose, openAnnotation, theme]);

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
        <KnowledgeCard card={item} settings={settings} onClose={onClose} footer={renderFooter(item)} />
      </View>
    );
  }, [finish, onClose, pageHeight, renderFooter, settings, theme, width]);

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
          <Text style={[styles.emptyTitle, { color: theme.ink }]}>还没有可读卡片</Text>
          <Text style={[styles.emptyBody, { color: theme.inkMuted }]}>先导入一个 Markdown 文档。每个三级标题会生成一张知识卡片。</Text>
          <AppButton label="导入 Markdown" icon="document-attach-outline" onPress={importFirst} />
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
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
      <View style={styles.progressPill} pointerEvents="none">
        <Text style={styles.progressText}>{Math.min(index + 1, cards.length)}/{cards.length}</Text>
      </View>
      </View>
      <Modal visible={Boolean(annotationCard)} transparent animationType="fade" onRequestClose={() => setAnnotationCard(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.paperElevated }] }>
            <Text style={[styles.modalTitle, { color: theme.ink }]}>卡片批注</Text>
            <TextInput
              value={draftNote}
              onChangeText={setDraftNote}
              multiline
              autoFocus
              placeholder="写下你的理解、疑问或行动点"
              placeholderTextColor={palette.inkMuted}
              style={[styles.noteInput, { fontFamily: settings.fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <AppButton label="取消" variant="light" onPress={() => setAnnotationCard(null)} />
              <AppButton label="保存批注" icon="checkmark-outline" onPress={persistAnnotation} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(17,17,15,0.55)', justifyContent: 'flex-end', padding: 14 },
  modalCard: { borderRadius: radius.xl, backgroundColor: palette.paperElevated, padding: 18, gap: 12 },
  modalTitle: { color: palette.ink, fontSize: 22, fontWeight: '900' },
  noteInput: { minHeight: 150, borderRadius: radius.lg, backgroundColor: palette.paperSoft, padding: 14, color: palette.ink, fontSize: 16, lineHeight: 23 },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
});
