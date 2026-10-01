import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnnotationEditor } from '../components/AnnotationEditor';
import { AppButton } from '../components/AppButton';
import { CardDetailModal } from '../components/CardDetailModal';
import { KnowledgeCard } from '../components/KnowledgeCard';
import { MarkdownBlocks } from '../components/MarkdownRenderer';
import { deleteDocument, importMarkdownDocument, updateDocumentContent } from '../data/repository';
import type { CardRecord, DocumentRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';
import { parseMarkdownBlocks } from '../utils/markdown';

type Props = { documents: DocumentRecord[]; cards: CardRecord[]; settings: Settings; onImported: () => void; onStartSession: () => void; onShare?: (card: CardRecord) => void };

// 预览分页渲染：一次只挂载一小段块，滚动到底部附近再追加，长文档不再卡顿。
const PREVIEW_BLOCK_PAGE = 40;

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function KnowledgeScreen({ documents, cards, settings, onImported, onStartSession, onShare }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const fontFamily = settings.fontFamily;
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [selectedCardId, setSelectedCardId] = React.useState<number | null>(null);
  // 按 id 派生：批注在详情里保存后，列表刷新时详情内容自动跟随更新。
  const selectedCard = selectedCardId === null ? null : cards.find((card) => card.id === selectedCardId) ?? null;
  // 预览按 id 持有，文档列表刷新后预览内容自动跟随更新。
  const [previewDocId, setPreviewDocId] = React.useState<number | null>(null);
  const [visibleBlocks, setVisibleBlocks] = React.useState(PREVIEW_BLOCK_PAGE);
  // 批注编辑在页面层级进行（不嵌在详情 Modal 里），编辑结束后回到详情。
  const [editingCardId, setEditingCardId] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 2600);
    return () => clearTimeout(timer);
  }, [message]);

  const previewDoc = previewDocId === null ? null : documents.find((doc) => doc.id === previewDocId) ?? null;
  const editingCard = editingCardId === null ? null : cards.find((card) => card.id === editingCardId) ?? null;

  const handleEditorClose = React.useCallback(() => {
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId]);

  const handleEditorSaved = React.useCallback((note: string | null) => {
    onImported();
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId, onImported]);
  const previewBlocks = React.useMemo(() => (previewDoc ? parseMarkdownBlocks(previewDoc.content) : []), [previewDoc]);

  React.useEffect(() => {
    setVisibleBlocks(PREVIEW_BLOCK_PAGE);
  }, [previewDoc]);

  const hasMorePreviewBlocks = visibleBlocks < previewBlocks.length;
  const onPreviewScroll = (event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    if (!hasMorePreviewBlocks) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 600) {
      setVisibleBlocks((count) => Math.min(count + PREVIEW_BLOCK_PAGE, previewBlocks.length));
    }
  };

  const importDoc = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const result = await importMarkdownDocument();
      if (result) {
        setMessage(`已导入《${result.document.title}》，生成 ${result.cards} 张卡片`);
        onImported();
      }
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const confirmUpdate = (doc: DocumentRecord) => {
    if (busy) return;
    Alert.alert('更新文档', `选择新的 Markdown 文件替换《${doc.title}》的内容，并重新生成卡片。原卡片的收藏与批注会被清除。`, [
      { text: '取消', style: 'cancel' },
      { text: '继续', onPress: () => { void runUpdate(doc.id); } },
    ]);
  };

  const runUpdate = async (documentId: number) => {
    if (busy) return;
    try {
      setBusy(true);
      const result = await updateDocumentContent(documentId);
      if (result) {
        setMessage(`《${result.document.title}》已更新，重新生成 ${result.cards} 张卡片`);
        onImported();
      }
    } catch (error) {
      Alert.alert('更新失败', error instanceof Error ? error.message : '请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (doc: DocumentRecord) => {
    if (busy) return;
    Alert.alert('删除文档', `将删除《${doc.title}》、${doc.cardCount} 张卡片以及相关批注，本机副本也会一并清理。此操作无法撤销。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { void runDelete(doc.id); } },
    ]);
  };

  const runDelete = async (documentId: number) => {
    if (busy) return;
    try {
      setBusy(true);
      await deleteDocument(documentId);
      setPreviewDocId(null);
      setMessage('文档已删除');
      onImported();
    } catch (error) {
      Alert.alert('删除失败', error instanceof Error ? error.message : '请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.card }}>
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <View style={styles.actions}>
        <AppButton label="导入 .md" icon="add-outline" onPress={() => { void importDoc(); }} loading={busy} />
        <AppButton label="开始 GET" icon="play-outline" variant="light" onPress={onStartSession} />
      </View>
      {message ? (
        <View style={[styles.notice, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          <Ionicons name="checkmark-circle" size={15} color={theme.accent} />
          <Text style={[styles.noticeText, { color: theme.ink, fontFamily }]}>{message}</Text>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: theme.paperSoft }]}>
          <Ionicons name="folder-outline" size={14} color={theme.accent} />
        </View>
        <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>文档</Text>
        <Text style={[styles.sectionCount, { color: theme.inkMuted, fontFamily }]}>{documents.length} 个</Text>
      </View>

      {documents.length === 0 ? (
        <Empty title="还没有文档" body="从手机本地选择 Markdown 文件后，Scrollark 会把副本存在本机，并按三级标题生成卡片。" />
      ) : (
        <View style={[styles.docCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          {documents.map((doc, index) => (
            <Pressable
              key={`document-${doc.id}-${index}`}
              accessibilityRole="button"
              onPress={() => setPreviewDocId(doc.id)}
              style={({ pressed }) => [styles.docRowInner, index > 0 && styles.dividerTop, pressed && styles.pressed]}
            >
              <View style={[styles.docIcon, { backgroundColor: theme.paperSoft }]}>
                <Ionicons name="document-text-outline" size={18} color={theme.accent} />
              </View>
              <View style={styles.docTextWrap}>
                <Text numberOfLines={1} style={[styles.docTitle, { color: theme.ink, fontFamily }]}>{doc.title}</Text>
                <Text numberOfLines={1} style={[styles.docMeta, { color: theme.inkMuted, fontFamily }]}>
                  {doc.cardCount} 张卡片 · {formatDate(doc.importedAt)} · 已存本机
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => confirmUpdate(doc)}
                style={({ pressed }) => [styles.docActionButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
              >
                <Ionicons name="create-outline" size={16} color={theme.ink} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => confirmDelete(doc)}
                style={({ pressed }) => [styles.docActionButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
              >
                <Ionicons name="trash-outline" size={16} color={theme.red} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: theme.paperSoft }]}>
          <Ionicons name="albums-outline" size={14} color={theme.accent} />
        </View>
        <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>最近卡片</Text>
      </View>
      {cards.slice(0, 5).map((card, index) => (
        <Pressable
          key={`recent-card-${card.id}-${card.documentId}-${card.sortOrder}-${index}`}
          onPress={() => setSelectedCardId(card.id)}
          style={({ pressed }) => [styles.cardPreview, pressed && styles.pressed]}
        >
          <KnowledgeCard card={card} settings={settings} compact />
        </Pressable>
      ))}
      <CardDetailModal
        card={selectedCard}
        settings={settings}
        onClose={() => setSelectedCardId(null)}
        onEditAnnotation={(card) => { setSelectedCardId(null); setEditingCardId(card.id); }}
        onShare={onShare}
      />

      <Modal visible={previewDoc !== null} transparent animationType="slide" onRequestClose={() => setPreviewDocId(null)}>
        <View style={[styles.sheetBackdrop, { backgroundColor: 'rgba(17,17,15,0.5)' }]}>
          {/* 点击遮罩关闭：放在 sheet 之下，触摸不会传给内容区，保证正文可正常滚动 */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreviewDocId(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom }]}>
            <View style={[styles.grabber, { backgroundColor: theme.inkMuted }]} />
            <View style={[styles.sheetHeader, { borderColor: theme.line }]}>
              <View style={styles.sheetHeaderSpacer} />
              <Text numberOfLines={1} style={[styles.sheetTitle, { color: theme.ink, fontFamily }]}>
                {previewDoc?.title ?? '文档预览'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setPreviewDocId(null)} style={styles.sheetDone}>
                <Text style={[styles.sheetDoneText, { color: theme.accent, fontFamily }]}>完成</Text>
              </Pressable>
            </View>
            {previewDoc ? (
              <>
                <Text numberOfLines={1} style={[styles.sheetMeta, { color: theme.inkMuted, fontFamily }]}>
                  {previewDoc.fileName} · {previewDoc.cardCount} 张卡片 · 导入于 {formatDate(previewDoc.importedAt)} · 已存本机
                </Text>
                <ScrollView
                  style={styles.sheetBody}
                  contentContainerStyle={styles.sheetBodyInner}
                  showsVerticalScrollIndicator={false}
                  scrollEventThrottle={16}
                  onScroll={onPreviewScroll}
                >
                  <MarkdownBlocks blocks={previewBlocks.slice(0, visibleBlocks)} color={theme.ink} fontSize={settings.fontSize} fontFamily={settings.fontFamily} />
                  {hasMorePreviewBlocks ? (
                    <Text style={[styles.sheetFooter, { color: theme.inkMuted, fontFamily }]}>继续上滑加载更多…</Text>
                  ) : null}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
    {editingCard ? (
      <AnnotationEditor card={editingCard} settings={settings} onClose={handleEditorClose} onSaved={handleEditorSaved} />
    ) : null}
    </View>
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  noticeText: { flex: 1, fontSize: 12, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  sectionCount: { fontSize: 12, fontWeight: '700', marginLeft: 'auto' },
  docCard: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  docRowInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  docIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docTextWrap: { flex: 1, minWidth: 0, gap: 3 },
  docTitle: { fontSize: 15, fontWeight: '700' },
  docMeta: { fontSize: 12, fontWeight: '600' },
  docActionButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardPreview: { height: 360, maxHeight: 360, marginBottom: 10 },
  pressed: { opacity: 0.72 },
  empty: { borderRadius: radius.lg, backgroundColor: palette.paperElevated, padding: 22, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: palette.line },
  emptyTitle: { fontSize: 17, fontWeight: '900' },
  emptyBody: { textAlign: 'center', lineHeight: 21, fontSize: 13 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,17,15,0.5)' },
  sheet: { height: '93%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, opacity: 0.28, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetHeaderSpacer: { width: 40 },
  sheetTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  sheetDone: { minWidth: 40, alignItems: 'flex-end' },
  sheetDoneText: { fontSize: 15, fontWeight: '700' },
  sheetMeta: { paddingHorizontal: 16, paddingVertical: 10, fontSize: 12, fontWeight: '600' },
  sheetBody: { flex: 1 },
  sheetBodyInner: { paddingHorizontal: 18, paddingBottom: 28 },
  sheetFooter: { textAlign: 'center', fontSize: 12, fontWeight: '600', paddingVertical: 10 },
});
