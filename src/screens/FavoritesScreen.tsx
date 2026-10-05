import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnnotationEditor } from '../components/AnnotationEditor';
import { CardDetailModal } from '../components/CardDetailModal';
import { KnowledgeCard } from '../components/KnowledgeCard';
import type { CardRecord, Settings } from '../domain/types';
import { deleteCard, resetCardReviewProgress } from '../data/repository';
import { setOverlaySlot } from '../components/AppOverlay';
import { useAppTheme } from '../theme/ThemeContext';
import { Empty } from './KnowledgeScreen';

type Props = { cards: CardRecord[]; settings: Settings; onChanged?: () => void; onShare?: (card: CardRecord) => void; onBack: () => void };

const CARD_ITEM_HEIGHT = 360;

// 收藏与批注二级页：从「我的」页推入（无 Tab 栏），左上角返回，标题居中。
export function FavoritesScreen({ cards, settings, onChanged, onShare, onBack }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  const [selectedCardId, setSelectedCardId] = React.useState<number | null>(null);
  const [editingCardId, setEditingCardId] = React.useState<number | null>(null);

  // 重置复习进度：写库后刷新列表（App 层 refresh），详情弹窗里的状态随之更新。
  const handleResetProgress = React.useCallback(async (card: CardRecord) => {
    await resetCardReviewProgress(card.id);
    onChanged?.();
  }, [onChanged]);

  // 删除单张卡片（手写卡与文档生成的卡通用）：写库后刷新列表，收藏视图里该卡随之消失。
  const handleDeleteCard = React.useCallback(async (card: CardRecord) => {
    await deleteCard(card.id);
    onChanged?.();
  }, [onChanged]);
  // 按 id 派生：批注在编辑器里保存后，列表刷新时详情/编辑内容自动跟随更新。
  const selectedCard = selectedCardId === null ? null : cards.find((card) => card.id === selectedCardId) ?? null;
  const editingCard = editingCardId === null ? null : cards.find((card) => card.id === editingCardId) ?? null;

  // 编辑流程：详情收起 → 屏幕层级编辑器弹出（与刷卡页同一架构，键盘行为可靠）；
  // 编辑结束（保存或放弃）后自动回到详情。
  const handleEditorClose = React.useCallback(() => {
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId]);

  const handleEditorSaved = React.useCallback((note: string | null) => {
    onChanged?.();
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId, onChanged]);

  const renderItem = React.useCallback(({ item }: { item: CardRecord }) => (
    <Pressable
      onPress={() => setSelectedCardId(item.id)}
      style={({ pressed }) => [styles.cardWrap, pressed && styles.pressed]}
    >
      <KnowledgeCard card={item} settings={settings} compact showAnnotationPreview />
    </Pressable>
  ), [settings]);

  // 批注编辑浮层经传送门渲染到 App 根部（盖住悬浮 Tab 栏），本页每次渲染同步最新节点。
  React.useEffect(() => {
    setOverlaySlot('favorites-annotation', () => (
      editingCard ? (
        <AnnotationEditor card={editingCard} settings={settings} onClose={handleEditorClose} onSaved={handleEditorSaved} />
      ) : null
    ));
    return () => setOverlaySlot('favorites-annotation', null);
  });

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.paper }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回我的"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={23} color={theme.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.ink, fontFamily }]}>收藏与批注</Text>
        <View style={styles.headerSide} />
      </View>
      <FlatList
        contentContainerStyle={styles.wrap}
        showsVerticalScrollIndicator={false}
        data={cards}
        keyExtractor={(card, index) => `favorite-card-${card.id}-${card.documentId}-${card.sortOrder}-${index}`}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: CARD_ITEM_HEIGHT, offset: CARD_ITEM_HEIGHT * index, index })}
        ListEmptyComponent={<Empty title="还没有收藏" body="在刷卡时点击收藏按钮，重要内容会出现在这里。" />}
      />
      <CardDetailModal
        card={selectedCard}
        settings={settings}
        onClose={() => setSelectedCardId(null)}
        onEditAnnotation={(card) => { setSelectedCardId(null); setEditingCardId(card.id); }}
        onShare={onShare}
        onResetProgress={handleResetProgress}
        onDelete={handleDeleteCard}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '900' },
  headerSide: { width: 44 },
  wrap: { padding: 18, paddingBottom: 40, gap: 14 },
  cardWrap: { height: 360, maxHeight: 360, marginBottom: 10 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
