import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AnnotationEditor } from '../components/AnnotationEditor';
import { CardDetailModal } from '../components/CardDetailModal';
import { KnowledgeCard } from '../components/KnowledgeCard';
import type { CardRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette } from '../theme/tokens';
import { Empty } from './KnowledgeScreen';

type Props = { cards: CardRecord[]; settings: Settings; onChanged?: () => void; onShare?: (card: CardRecord) => void };

const CARD_ITEM_HEIGHT = 370;

export function FavoritesScreen({ cards, settings, onChanged, onShare }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  const [selectedCardId, setSelectedCardId] = React.useState<number | null>(null);
  const [editingCardId, setEditingCardId] = React.useState<number | null>(null);
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper }}>
      <FlatList
        contentContainerStyle={styles.wrap}
        showsVerticalScrollIndicator={false}
        data={cards}
        keyExtractor={(card, index) => `favorite-card-${card.id}-${card.documentId}-${card.sortOrder}-${index}`}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: CARD_ITEM_HEIGHT, offset: CARD_ITEM_HEIGHT * index, index })}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: theme.inkMuted }]}>Saved</Text>
            <Text style={[styles.title, { color: theme.ink, fontFamily }]}>收藏</Text>
            <Text style={[styles.subtitle, { color: theme.inkMuted, fontFamily }]}>所有收藏状态都会落到本地数据库，重启应用后仍然保留。</Text>
          </View>
        }
        ListEmptyComponent={<Empty title="还没有收藏" body="在刷卡时点击收藏按钮，重要内容会出现在这里。" />}
      />
      {editingCard ? (
        <AnnotationEditor card={editingCard} settings={settings} onClose={handleEditorClose} onSaved={handleEditorSaved} />
      ) : null}
      <CardDetailModal
        card={selectedCard}
        settings={settings}
        onClose={() => setSelectedCardId(null)}
        onEditAnnotation={(card) => { setSelectedCardId(null); setEditingCardId(card.id); }}
        onShare={onShare}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 120, gap: 14 },
  header: { gap: 7 },
  eyebrow: { color: palette.inkMuted, textTransform: 'uppercase', fontWeight: '900', letterSpacing: 1.2, fontSize: 12 },
  title: { color: palette.ink, fontSize: 38, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { color: palette.inkMuted, fontSize: 15, lineHeight: 23 },
  cardWrap: { height: 360, maxHeight: 360, marginBottom: 10 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
