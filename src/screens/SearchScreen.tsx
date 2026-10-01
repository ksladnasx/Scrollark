import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnnotationEditor } from '../components/AnnotationEditor';
import { CardDetailModal } from '../components/CardDetailModal';
import { searchCards } from '../data/repository';
import type { CardRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';

type Props = { settings: Settings; onBack: () => void; onShare?: (card: CardRecord) => void };

// 搜索防抖间隔：输入停顿后再查询 SQLite，避免每个字符都触发全表 LIKE。
const SEARCH_DEBOUNCE_MS = 280;

function snippetOf(card: CardRecord) {
  const source = card.annotation?.trim() || card.content.replace(/[#*`>[\]()-]/g, ' ').replace(/\s+/g, ' ').trim();
  return source.length > 90 ? `${source.slice(0, 90)}…` : source;
}

export function SearchScreen({ settings, onBack, onShare }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<CardRecord[]>([]);
  const [searched, setSearched] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [selectedCardId, setSelectedCardId] = React.useState<number | null>(null);
  const [editingCardId, setEditingCardId] = React.useState<number | null>(null);

  React.useEffect(() => {
    const clean = query.trim();
    if (!clean) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchCards(clean)
        .then((cards) => {
          setResults(cards);
          setSearched(true);
        })
        .catch(() => {
          setResults([]);
          setSearched(true);
        })
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const selectedCard = selectedCardId === null ? null : results.find((card) => card.id === selectedCardId) ?? null;
  const editingCard = editingCardId === null ? null : results.find((card) => card.id === editingCardId) ?? null;
  // 批注在详情里保存后重新搜索，结果与详情内容保持最新。
  const refreshResults = React.useCallback(() => {
    const clean = query.trim();
    if (!clean) return;
    searchCards(clean).then(setResults).catch(() => {});
  }, [query]);

  const handleEditorClose = React.useCallback(() => {
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId]);

  const handleEditorSaved = React.useCallback((note: string | null) => {
    refreshResults();
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId, refreshResults]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.paper }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={23} color={theme.ink} />
        </Pressable>
        <View style={[styles.searchBox, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          <Ionicons name="search-outline" size={17} color={theme.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="搜索标题、内容或批注"
            placeholderTextColor={theme.inkMuted}
            style={[styles.searchInput, { color: theme.ink, fontFamily }]}
            returnKeyType="search"
          />
          {query ? (
            <Pressable accessibilityRole="button" onPress={() => setQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={16} color={theme.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {query.trim() ? (
        <Text style={[styles.resultMeta, { color: theme.inkMuted, fontFamily }]}>
          {searching ? '正在搜索…' : searched ? `${results.length} 张卡片` : ''}
        </Text>
      ) : (
        <Text style={[styles.resultMeta, { color: theme.inkMuted, fontFamily }]}>输入关键字，在全部卡片的标题、正文与批注中查找。</Text>
      )}

      <FlatList
        style={styles.resultList}
        contentContainerStyle={styles.resultListInner}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={(card) => `search-${card.id}`}
        ListEmptyComponent={
          searched && !searching ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
              <Ionicons name="search-outline" size={26} color={theme.inkMuted} />
              <Text style={[styles.emptyTitle, { color: theme.ink, fontFamily }]}>没有找到匹配的卡片</Text>
              <Text style={[styles.emptyBody, { color: theme.inkMuted, fontFamily }]}>换个关键字试试，比如章节名或批注里的词。</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedCardId(item.id)}
            style={({ pressed }) => [styles.resultCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[styles.resultTitle, { color: theme.ink, fontFamily }]}>{item.title}</Text>
            <Text numberOfLines={2} style={[styles.resultSnippet, { color: theme.inkMuted, fontFamily }]}>{snippetOf(item)}</Text>
            <View style={styles.resultMetaRow}>
              <Ionicons name="document-text-outline" size={12} color={theme.inkMuted} />
              <Text numberOfLines={1} style={[styles.resultDoc, { color: theme.inkMuted, fontFamily }]}>
                {[item.documentTitle, item.h2].filter(Boolean).join(' · ')}
              </Text>
              {item.annotation ? (
                <View style={[styles.resultBadge, { backgroundColor: theme.paperSoft }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={11} color={theme.inkMuted} />
                  <Text style={[styles.resultBadgeText, { color: theme.inkMuted }]}>批注</Text>
                </View>
              ) : null}
              {item.isFavorite ? (
                <View style={[styles.resultBadge, { backgroundColor: theme.paperSoft }]}>
                  <Ionicons name="heart" size={11} color={theme.red} />
                  <Text style={[styles.resultBadgeText, { color: theme.inkMuted }]}>收藏</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        )}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 10 },
  clearButton: { padding: 4 },
  resultMeta: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8, fontSize: 12, fontWeight: '700' },
  resultList: { flex: 1 },
  resultListInner: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  resultCard: { borderRadius: radius.lg, borderWidth: 1, padding: 14, gap: 7 },
  resultTitle: { fontSize: 15, fontWeight: '800' },
  resultSnippet: { fontSize: 13, lineHeight: 19 },
  resultMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultDoc: { flex: 1, fontSize: 11, fontWeight: '600' },
  resultBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill },
  resultBadgeText: { fontSize: 10, fontWeight: '800' },
  emptyBox: { marginTop: 20, borderRadius: radius.lg, borderWidth: 1, padding: 22, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '900' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
