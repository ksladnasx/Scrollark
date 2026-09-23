import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { CardDetailModal } from '../components/CardDetailModal';
import { KnowledgeCard } from '../components/KnowledgeCard';
import { importMarkdownDocument } from '../data/repository';
import type { CardRecord, DocumentRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';

type Props = { documents: DocumentRecord[]; cards: CardRecord[]; settings: Settings; onImported: () => void; onStartSession: () => void };

export function KnowledgeScreen({ documents, cards, settings, onImported, onStartSession }: Props) {
  const theme = useAppTheme();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [selectedCard, setSelectedCard] = React.useState<CardRecord | null>(null);

  const importDoc = async () => {
    try {
      setBusy(true);
      const result = await importMarkdownDocument();
      if (result) {
        setMessage(`已生成 ${result.cards} 张卡片`);
        onImported();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.inkMuted }]}>Library</Text>
        <Text style={[styles.title, { color: theme.ink }]}>知识库</Text>
        <Text style={[styles.subtitle, { color: theme.inkMuted }]}>所有 Markdown 原文、解析结果和知识卡片都保存在本地 SQLite 与应用文档目录中。</Text>
      </View>
      <View style={styles.actions}>
        <AppButton label="导入 .md" icon="add-outline" onPress={importDoc} loading={busy} />
        <AppButton label="开始 GET" icon="play-outline" variant="light" onPress={onStartSession} />
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Text style={[styles.sectionTitle, { color: theme.ink }]}>文档</Text>
      {documents.length === 0 ? <Empty title="还没有文档" body="从手机本地选择 Markdown 文件后，Scrollark 会按三级标题生成卡片。" /> : null}
      {documents.map((doc, index) => (
        <View key={`document-${doc.id}-${index}`} style={[styles.docRow, { backgroundColor: theme.paperElevated, borderColor: theme.line }] }>
          <View style={[styles.docIcon, { backgroundColor: theme.paperSoft }] }><Ionicons name="document-text-outline" size={19} color={theme.ink} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docTitle, { color: theme.ink }]}>{doc.title}</Text>
            <Text style={[styles.docMeta, { color: theme.inkMuted }]}>{doc.fileName} · {doc.cardCount} 张卡片</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.sectionTitle, { color: theme.ink }]}>最近卡片</Text>
      {cards.slice(0, 5).map((card, index) => (
        <Pressable
          key={`recent-card-${card.id}-${card.documentId}-${card.sortOrder}-${index}`}
          onPress={() => setSelectedCard(card)}
          style={({ pressed }) => [styles.cardPreview, pressed && styles.pressed]}
        >
          <KnowledgeCard card={card} settings={settings} compact />
        </Pressable>
      ))}
      <CardDetailModal card={selectedCard} settings={settings} onClose={() => setSelectedCard(null)} />
    </ScrollView>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.empty, { backgroundColor: theme.paperElevated, borderColor: theme.line }] }>
      <Ionicons name="file-tray-outline" size={28} color={theme.inkMuted} />
      <Text style={[styles.emptyTitle, { color: theme.ink }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.inkMuted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 120, gap: 14 },
  header: { gap: 7 },
  eyebrow: { color: palette.inkMuted, textTransform: 'uppercase', fontWeight: '900', letterSpacing: 1.2, fontSize: 12 },
  title: { color: palette.ink, fontSize: 38, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { color: palette.inkMuted, fontSize: 15, lineHeight: 23 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  message: { color: palette.blue, fontSize: 13, fontWeight: '700' },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '900', marginTop: 14 },
  docRow: { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: radius.lg, backgroundColor: palette.paperElevated, padding: 14, borderWidth: 1, borderColor: palette.line },
  docIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.paperSoft, alignItems: 'center', justifyContent: 'center' },
  docTitle: { color: palette.ink, fontSize: 16, fontWeight: '900' },
  docMeta: { color: palette.inkMuted, fontSize: 12, marginTop: 3 },
  cardPreview: { height: 360, maxHeight: 360, marginBottom: 10 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  empty: { borderRadius: radius.lg, backgroundColor: palette.paperElevated, padding: 22, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: palette.line },
  emptyTitle: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  emptyBody: { color: palette.inkMuted, textAlign: 'center', lineHeight: 21 },
});
