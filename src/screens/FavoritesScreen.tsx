import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CardDetailModal } from '../components/CardDetailModal';
import { KnowledgeCard } from '../components/KnowledgeCard';
import type { CardRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette } from '../theme/tokens';
import { Empty } from './KnowledgeScreen';

export function FavoritesScreen({ cards, settings }: { cards: CardRecord[]; settings: Settings }) {
  const theme = useAppTheme();
  const [selectedCard, setSelectedCard] = React.useState<CardRecord | null>(null);

  return (
    <>
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.inkMuted }]}>Saved</Text>
        <Text style={[styles.title, { color: theme.ink }]}>收藏</Text>
        <Text style={[styles.subtitle, { color: theme.inkMuted }]}>所有收藏状态都会落到本地数据库，重启应用后仍然保留。</Text>
      </View>
      {cards.length === 0 ? <Empty title="还没有收藏" body="在刷卡时点击收藏按钮，重要内容会出现在这里。" /> : null}
      {cards.map((card, index) => (
        <Pressable
          key={`favorite-card-${card.id}-${card.documentId}-${card.sortOrder}-${index}`}
          onPress={() => setSelectedCard(card)}
          style={({ pressed }) => [styles.cardWrap, pressed && styles.pressed]}
        >
          <KnowledgeCard card={card} settings={settings} compact />
        </Pressable>
      ))}
    </ScrollView>
    <CardDetailModal card={selectedCard} settings={settings} onClose={() => setSelectedCard(null)} />
    </>
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
