import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnnotationEditor } from '../components/AnnotationEditor';
import { AppButton } from '../components/AppButton';
import { AppSelectSheet, SelectField, folderSelectOptions } from '../components/AppSelectSheet';
import { showAlert } from '../components/AppAlert';
import { setOverlaySlot } from '../components/AppOverlay';
import { CardDetailModal } from '../components/CardDetailModal';
import { CustomCardEditor } from '../components/CustomCardEditor';
import { DocumentEditor } from '../components/DocumentEditor';
import { GroupEditor } from '../components/GroupEditor';
import { ImportConfigModal } from '../components/ImportConfigModal';
import { KnowledgeCard } from '../components/KnowledgeCard';
import {
  createCardGroup,
  createFolder,
  deleteCard,
  deleteCardGroup,
  deleteDocument,
  deleteFolder,
  isCustomDocument,
  listCardsByDocument,
  listCardsByGroup,
} from '../data/repository';
import type { CardGroupWithCount, CardRecord, DocumentRecord, FolderRecord, KnowledgeListMode, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius, shadow } from '../theme/tokens';

type Props = {
  documents: DocumentRecord[];
  cards: CardRecord[];
  folders: FolderRecord[];
  cardGroups: CardGroupWithCount[];
  settings: Settings;
  onImported: () => void;
  // 导入配置弹窗里「去 AI 设置」的跳转（App 层导航到 settingsDetail 的 ai 分区）。
  onOpenAiSettings?: () => void;
  onStartSession: () => void;
  onShare?: (card: CardRecord) => void;
  // 知识库列表展示方式切换（文件夹 / 文档），持久化由 App 层负责。
  onChangeListMode?: (mode: KnowledgeListMode) => void;
};

// 点击文档 / 手写分组后进入的卡片列表容器（替换原来的 Markdown 内容预览）。
type OpenContainer = { kind: 'document' | 'group'; id: number; title: string; subtitle: string };

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function KnowledgeScreen({ documents, cards, folders, cardGroups, settings, onImported, onOpenAiSettings, onStartSession, onShare, onChangeListMode }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const fontFamily = settings.fontFamily;
  // 列表展示方式：文件夹（默认）/ 文档平铺，来自持久化配置。
  const listMode = settings.knowledgeListMode ?? 'folders';
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [selectedCardId, setSelectedCardId] = React.useState<number | null>(null);
  // 批注编辑在页面层级进行（不嵌在详情 Modal 里），编辑结束后回到详情。
  const [editingCardId, setEditingCardId] = React.useState<number | null>(null);
  // 手写卡片编辑器：cardEditor = null 表示创建模式，非 null 表示编辑这张卡。
  const [cardEditorOpen, setCardEditorOpen] = React.useState(false);
  const [editorCard, setEditorCard] = React.useState<CardRecord | null>(null);
  const [editorFolderId, setEditorFolderId] = React.useState<number | null>(null);

  // ===== 文件夹管理（新建文件夹只在本页提供入口） =====
  const defaultFolder = folders.find((folder) => folder.isDefault === 1) ?? folders[0] ?? null;
  const [folderCreateOpen, setFolderCreateOpen] = React.useState(false);
  const [folderName, setFolderName] = React.useState('');
  const [openFolderId, setOpenFolderId] = React.useState<number | null>(null);

  // ===== 新建分组（选所属文件夹 + 填分组名称） =====
  const [groupCreateOpen, setGroupCreateOpen] = React.useState(false);
  const [groupCreateName, setGroupCreateName] = React.useState('');
  const [groupCreateFolderId, setGroupCreateFolderId] = React.useState<number | null>(null);
  const [groupCreateFolderSelectOpen, setGroupCreateFolderSelectOpen] = React.useState(false);
  const groupCreateFolderName = folders.find((folder) => folder.id === (groupCreateFolderId ?? defaultFolder?.id))?.name ?? '';

  // 右下角悬浮操作钮：展开后显示导入 / 手写 / GET 三个操作项。
  const [fabOpen, setFabOpen] = React.useState(false);
  const fabAnim = React.useRef(new Animated.Value(0)).current;
  const toggleFab = React.useCallback((open: boolean) => {
    setFabOpen(open);
    Animated.spring(fabAnim, { toValue: open ? 1 : 0, useNativeDriver: true, friction: 7, tension: 140 }).start();
  }, [fabAnim]);

  // ===== 文档编辑（标题 / 所属文件夹 / 内容） =====
  const [docEditorOpen, setDocEditorOpen] = React.useState(false);
  const [editorDoc, setEditorDoc] = React.useState<DocumentRecord | null>(null);

  // ===== 手写分组编辑（名称 / 所属文件夹） =====
  const [groupEditor, setGroupEditor] = React.useState<CardGroupWithCount | null>(null);

  // ===== 导入文档：先在配置弹窗里完成 文件夹 / AI 开关 / 文件选择，确定后才走导入流水线 =====
  const [importConfigOpen, setImportConfigOpen] = React.useState(false);

  // ===== 卡片列表容器（文档 / 手写分组通用） =====
  const [container, setContainer] = React.useState<OpenContainer | null>(null);
  const [containerCards, setContainerCards] = React.useState<CardRecord[] | null>(null);

  // 悬浮提示（toast）：顶部浮现、停留约 2.4 秒后淡出，不占据列表布局；
  // message 清空以便相同文案再次触发时动画能重新播放。
  const toastOpacity = React.useRef(new Animated.Value(0)).current;
  const [toast, setToast] = React.useState('');
  React.useEffect(() => {
    if (!message) return;
    setToast(message);
    Animated.timing(toastOpacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 240, useNativeDriver: true }).start();
      setMessage('');
    }, 2400);
    return () => clearTimeout(timer);
  }, [message, toastOpacity]);

  React.useEffect(() => {
    if (!container) {
      setContainerCards(null);
      return;
    }
    let alive = true;
    setContainerCards(null);
    const load = container.kind === 'group' ? listCardsByGroup(container.id) : listCardsByDocument(container.id);
    load
      .then((rows) => {
        if (alive) setContainerCards(rows);
      })
      .catch(() => {
        if (alive) setContainerCards([]);
      });
    return () => {
      alive = false;
    };
  }, [container]);

  // 详情弹窗的卡片在打开的容器列表里找（保证删除后列表即时同步），容器外用全局卡片池。
  const cardPool = container ? containerCards ?? [] : cards;
  const selectedCard = selectedCardId === null ? null : cardPool.find((card) => card.id === selectedCardId) ?? null;
  const editingCard = editingCardId === null ? null : cardPool.find((card) => card.id === editingCardId) ?? null;

  const folderDocs = React.useCallback((folderId: number) => documents.filter((doc) => doc.folderId === folderId && !isCustomDocument(doc)), [documents]);
  const folderGroups = React.useCallback((folderId: number) => cardGroups.filter((group) => group.folderId === folderId), [cardGroups]);
  const openFolder = openFolderId === null ? null : folders.find((folder) => folder.id === openFolderId) ?? null;

  // ===== 导入 =====

  const beginImport = () => {
    if (busy) return;
    setImportConfigOpen(true);
  };

  // 导入配置弹窗完成全流程后回调：关弹窗、提示结果并刷新数据。
  const handleImported = (result: { document: DocumentRecord; cards: number }, folderName: string) => {
    setImportConfigOpen(false);
    setMessage(`已导入《${result.document.title}》到「${folderName}」，生成 ${result.cards} 张卡片`);
    onImported();
  };

  // ===== 文档删除 =====

  const confirmDelete = (doc: DocumentRecord) => {
    if (busy) return;
    const message = isCustomDocument(doc)
      ? `将删除分组文档「${doc.title}」和其中的 ${doc.cardCount} 张手写卡片，卡片配图文件也会一并清理。此操作无法撤销。`
      : `将删除《${doc.title}》、${doc.cardCount} 张卡片以及相关批注，本机副本也会一并清理。此操作无法撤销。`;
    showAlert({
      title: '删除文档',
      message,
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => { void runDelete(doc.id); } },
      ],
    });
  };

  const runDelete = async (documentId: number) => {
    if (busy) return;
    try {
      setBusy(true);
      await deleteDocument(documentId);
      setContainer((current) => (current?.kind === 'document' && current.id === documentId ? null : current));
      setMessage('文档已删除');
      onImported();
    } catch (error) {
      showAlert({ title: '删除失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setBusy(false);
    }
  };

  // ===== 文件夹 =====

  const beginCreateGroup = () => {
    if (busy) return;
    setGroupCreateFolderId(defaultFolder?.id ?? null);
    setGroupCreateName('');
    setGroupCreateOpen(true);
  };

  const submitCreateGroup = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const group = await createCardGroup(groupCreateFolderId, groupCreateName);
      setGroupCreateOpen(false);
      setGroupCreateName('');
      setMessage(`分组「${group.name}」已创建`);
      onImported();
    } catch (error) {
      showAlert({ title: '创建失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setBusy(false);
    }
  };

  const submitCreateFolder = async () => {
    if (busy) return;
    try {
      setBusy(true);
      const folder = await createFolder(folderName);
      setFolderCreateOpen(false);
      setFolderName('');
      setMessage(`文件夹「${folder.name}」已创建`);
      onImported();
    } catch (error) {
      showAlert({ title: '创建失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteFolder = (folder: FolderRecord) => {
    if (busy || folder.isDefault === 1) return;
    const docs = folderDocs(folder.id);
    const groups = folderGroups(folder.id);
    const cardTotal = docs.reduce((sum, doc) => sum + doc.cardCount, 0) + groups.reduce((sum, group) => sum + group.cardCount, 0);
    showAlert({
      title: '删除文件夹',
      message: `将删除文件夹「${folder.name}」，其中 ${docs.length} 个文档和 ${groups.length} 个手写分组（共 ${cardTotal} 张卡片）及其批注会一并删除。此操作无法撤销。`,
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => { void runDeleteFolder(folder.id); } },
      ],
    });
  };

  const runDeleteFolder = async (folderId: number) => {
    if (busy) return;
    try {
      setBusy(true);
      await deleteFolder(folderId);
      if (openFolderId === folderId) setOpenFolderId(null);
      setContainer(null);
      setMessage('文件夹已删除，其中文档与分组一并删除');
      onImported();
    } catch (error) {
      showAlert({ title: '删除失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setBusy(false);
    }
  };

  // ===== 手写分组 =====

  const confirmDeleteGroup = (group: CardGroupWithCount) => {
    if (busy) return;
    showAlert({
      title: '删除手写分组',
      message: `将删除分组「${group.name}」和其中的 ${group.cardCount} 张手写卡片，卡片配图会一并清理。此操作无法撤销。`,
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => { void runDeleteGroup(group.id); } },
      ],
    });
  };

  const runDeleteGroup = async (groupId: number) => {
    if (busy) return;
    try {
      setBusy(true);
      await deleteCardGroup(groupId);
      setContainer((current) => (current?.kind === 'group' && current.id === groupId ? null : current));
      setMessage('分组已删除');
      onImported();
    } catch (error) {
      showAlert({ title: '删除失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setBusy(false);
    }
  };

  // ===== 卡片删除（文档生成卡片与手写卡片通用） =====

  const confirmDeleteCard = (card: CardRecord) => {
    showAlert({
      title: '删除这张卡片？',
      message: '卡片正文、配图与批注会一并删除，无法恢复。',
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => { void handleDeleteCard(card); } },
      ],
    });
  };

  const handleDeleteCard = React.useCallback(async (card: CardRecord) => {
    await deleteCard(card.id);
    setSelectedCardId(null);
    // 容器列表本地同步移除，无需等 App 层刷新；容器未开时 containerCards 为 null 不受影响。
    setContainerCards((current) => (current ? current.filter((item) => item.id !== card.id) : current));
    setMessage('卡片已删除');
    onImported();
  }, [onImported]);

  // ===== 容器与编辑器入口 =====

  const openDocContainer = React.useCallback((doc: DocumentRecord) => {
    setContainer({ kind: 'document', id: doc.id, title: doc.title, subtitle: isCustomDocument(doc) ? '分组文档' : `${doc.fileName} · 已存本机` });
  }, []);

  const openGroupContainer = React.useCallback((group: CardGroupWithCount) => {
    setContainer({ kind: 'group', id: group.id, title: group.name, subtitle: '手写分组' });
  }, []);

  const handleEditorClose = React.useCallback(() => {
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId]);

  const handleEditorSaved = React.useCallback(() => {
    onImported();
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId, onImported]);

  // 关闭所有原生 Modal 后再打开页面层级的编辑浮层（原生 Modal 会盖住普通浮层）。
  const openCardEditor = React.useCallback((card: CardRecord | null) => {
    setSelectedCardId(null);
    setContainer(null);
    setOpenFolderId(null);
    setEditorCard(card);
    setEditorFolderId(card ? cardGroups.find((group) => group.id === card.groupId)?.folderId ?? null : null);
    setCardEditorOpen(true);
  }, [cardGroups]);

  // 文档编辑：同样先收起原生 Modal，再弹页面层级的编辑浮层。
  const openDocEditor = React.useCallback((doc: DocumentRecord) => {
    setSelectedCardId(null);
    setContainer(null);
    setOpenFolderId(null);
    setEditorDoc(doc);
    setDocEditorOpen(true);
  }, []);

  // 分组编辑：先收起原生 Modal（分组入口在文件夹弹层里），再弹页面层级编辑浮层。
  const openGroupEditor = React.useCallback((group: CardGroupWithCount) => {
    setSelectedCardId(null);
    setContainer(null);
    setOpenFolderId(null);
    setGroupEditor(group);
  }, []);

  const handleGroupEditorSaved = React.useCallback(() => {
    setGroupEditor(null);
    setMessage('分组已更新');
    onImported();
  }, [onImported]);

  const handleDocEditorSaved = React.useCallback((result: { regenerated: boolean; cards: number }) => {
    setDocEditorOpen(false);
    setEditorDoc(null);
    setMessage(result.regenerated ? `文档已更新，重新生成 ${result.cards} 张卡片` : '文档信息已更新');
    onImported();
  }, [onImported]);

  const handleCardEditorCreated = React.useCallback(() => {
    const wasEditing = editorCard !== null;
    setCardEditorOpen(false);
    setEditorCard(null);
    setMessage(wasEditing ? '卡片已更新' : '卡片已创建，可在所属文件夹的分组里查看');
    onImported();
  }, [editorCard, onImported]);

  // 编辑浮层经传送门渲染到 App 根部（盖住悬浮 Tab 栏）：本页每次渲染同步最新节点，
  // 浮层的内部状态由其自身维护，不受这里重渲染影响。
  const pageEditors = (
    <>
      {editingCard ? (
        <AnnotationEditor card={editingCard} settings={settings} onClose={handleEditorClose} onSaved={handleEditorSaved} />
      ) : null}
      {cardEditorOpen ? (
        <CustomCardEditor
          settings={settings}
          folders={folders}
          cardGroups={cardGroups}
          onDataChanged={onImported}
          card={editorCard}
          initialFolderId={editorFolderId}
          onClose={() => { setCardEditorOpen(false); setEditorCard(null); }}
          onCreated={handleCardEditorCreated}
        />
      ) : null}
      {docEditorOpen && editorDoc ? (
        <DocumentEditor
          settings={settings}
          folders={folders}
          document={editorDoc}
          onClose={() => { setDocEditorOpen(false); setEditorDoc(null); }}
          onSaved={handleDocEditorSaved}
        />
      ) : null}
      {groupEditor ? (
        <GroupEditor
          settings={settings}
          folders={folders}
          group={groupEditor}
          onClose={() => setGroupEditor(null)}
          onSaved={handleGroupEditorSaved}
        />
      ) : null}
    </>
  );

  React.useEffect(() => {
    setOverlaySlot('knowledge-editors', () => pageEditors);
    return () => setOverlaySlot('knowledge-editors', null);
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.card }}>
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      {/* 列表主体：默认按文件夹浏览，可切换为平铺显示全部文档（配置项，会持久化） */}
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: theme.paperSoft }]}>
          <Ionicons name={listMode === 'folders' ? 'folder-outline' : 'document-text-outline'} size={14} color={theme.accent} />
        </View>
        <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>{listMode === 'folders' ? '文件夹' : '文档'}</Text>
        <Text style={[styles.sectionCount, { color: theme.inkMuted, fontFamily }]}>{listMode === 'folders' ? `${folders.length} 个` : `${documents.length} 个`}</Text>
        <View style={styles.listModeSwitch}>
          {(['folders', 'documents'] as KnowledgeListMode[]).map((mode) => (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityLabel={mode === 'folders' ? '按文件夹浏览' : '平铺显示文档'}
              accessibilityState={{ selected: listMode === mode }}
              onPress={() => onChangeListMode?.(mode)}
              style={[styles.listModeButton, { backgroundColor: listMode === mode ? theme.accent : theme.paperSoft }]}
            >
              <Text style={[styles.listModeText, { color: listMode === mode ? theme.paper : theme.inkMuted, fontFamily }]}>
                {mode === 'folders' ? '文件夹' : '文档'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {listMode === 'folders' ? (
        <>
          <View style={[styles.docCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
            {folders.map((folder, index) => {
              const docs = folderDocs(folder.id);
              const groups = folderGroups(folder.id);
              return (
                <Pressable
                  key={`folder-${folder.id}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`打开文件夹：${folder.name}`}
                  onPress={() => setOpenFolderId(folder.id)}
                  style={({ pressed }) => [styles.docRowInner, index > 0 && styles.dividerTop, pressed && styles.pressed]}
                >
                  <View style={[styles.docIcon, { backgroundColor: theme.paperSoft }]}>
                    <Ionicons name="folder-outline" size={18} color={theme.accent} />
                  </View>
                  <View style={styles.docTextWrap}>
                    <View style={styles.folderTitleRow}>
                      <Text numberOfLines={1} style={[styles.docTitle, { color: theme.ink, fontFamily }]}>{folder.name}</Text>
                      {folder.isDefault === 1 ? (
                        <View style={[styles.folderBadge, { backgroundColor: theme.paperSoft }]}>
                          <Text style={[styles.folderBadgeText, { color: theme.inkMuted, fontFamily }]}>默认</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} style={[styles.docMeta, { color: theme.inkMuted, fontFamily }]}>
                      {docs.length} 个文档 · {groups.length} 个手写分组
                    </Text>
                  </View>
                  {folder.isDefault !== 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`删除文件夹：${folder.name}`}
                      disabled={busy}
                      onPress={() => confirmDeleteFolder(folder)}
                      style={({ pressed }) => [styles.docActionButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.red} />
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {/* 文件夹列表底部操作：新建分组（选文件夹 + 填名称）与新建文件夹 */}
          <View style={styles.folderActions}>
            <AppButton label="新建分组" icon="albums-outline" variant="light" style={styles.folderActionButton} onPress={beginCreateGroup} />
            <AppButton label="新建文件夹" icon="folder-open-outline" variant="light" style={styles.folderActionButton} onPress={() => { setFolderName(''); setFolderCreateOpen(true); }} />
          </View>
        </>
      ) : documents.length === 0 ? (
        <Empty title="还没有文档" body="从手机本地选择 Markdown 文件后，Scrollark 会把副本存在本机，并按三级标题生成卡片。" />
      ) : (
        <View style={[styles.docCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          {documents.map((doc, index) => {
            const folderName = folders.find((folder) => folder.id === doc.folderId)?.name ?? '';
            return (
              <Pressable
                key={`document-${doc.id}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`查看卡片列表：${doc.title}`}
                onPress={() => openDocContainer(doc)}
                style={({ pressed }) => [styles.docRowInner, index > 0 && styles.dividerTop, pressed && styles.pressed]}
              >
                <View style={[styles.docIcon, { backgroundColor: theme.paperSoft }]}>
                  <Ionicons name={isCustomDocument(doc) ? 'albums-outline' : 'document-text-outline'} size={18} color={theme.accent} />
                </View>
                <View style={styles.docTextWrap}>
                  <Text numberOfLines={1} style={[styles.docTitle, { color: theme.ink, fontFamily }]}>{doc.title}</Text>
                  <Text numberOfLines={1} style={[styles.docMeta, { color: theme.inkMuted, fontFamily }]}>
                    {isCustomDocument(doc)
                      ? `分组文档 · ${doc.cardCount} 张卡片 · ${formatDate(doc.importedAt)}`
                      : `${folderName || '默认文件夹'} · ${doc.cardCount} 张卡片 · ${formatDate(doc.importedAt)} · 已存本机`}
                  </Text>
                </View>
                {/* 铅笔 = 编辑文档信息（标题 / 所属文件夹）；分组文档不提供内容编辑 */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`编辑文档：${doc.title}`}
                  disabled={busy}
                  onPress={() => openDocEditor(doc)}
                  style={({ pressed }) => [styles.docActionButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
                >
                  <Ionicons name="create-outline" size={16} color={theme.ink} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`删除文档：${doc.title}`}
                  disabled={busy}
                  onPress={() => confirmDelete(doc)}
                  style={({ pressed }) => [styles.docActionButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.red} />
                </Pressable>
              </Pressable>
            );
          })}
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
        // 详情可能叠在卡片列表浮层之上：编辑批注 / 编辑卡片与分享都挂在页面/主窗口层级，
        // 必须先收起这些原生 Modal 浮层，否则会被挡住。
        onEditAnnotation={(card) => { setSelectedCardId(null); setContainer(null); setOpenFolderId(null); setEditingCardId(card.id); }}
        onEdit={(card) => openCardEditor(card)}
        onShare={(card) => { setContainer(null); setOpenFolderId(null); onShare?.(card); }}
        onDelete={(card) => { void handleDeleteCard(card); }}
      />

      {/* 文件夹内容：文档 + 手写分组 */}
      <Modal visible={openFolder !== null} transparent animationType="slide" onRequestClose={() => setOpenFolderId(null)}>
        <View style={[styles.sheetBackdrop, { backgroundColor: 'rgba(17,17,15,0.5)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpenFolderId(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom }]}>
            <View style={[styles.grabber, { backgroundColor: theme.inkMuted }]} />
            <View style={[styles.sheetHeader, { borderColor: theme.line }]}>
              <View style={styles.sheetHeaderSpacer} />
              <Text numberOfLines={1} style={[styles.sheetTitle, { color: theme.ink, fontFamily }]}>
                {openFolder?.name ?? '文件夹'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setOpenFolderId(null)} style={styles.sheetDone}>
                <Text style={[styles.sheetDoneText, { color: theme.accent, fontFamily }]}>完成</Text>
              </Pressable>
            </View>
            {openFolder ? (
              <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetBodyInner} showsVerticalScrollIndicator={false}>
                <Text style={[styles.folderSectionLabel, { color: theme.inkMuted, fontFamily }]}>文档</Text>
                {folderDocs(openFolder.id).length === 0 ? (
                  <Text style={[styles.folderEmptyText, { color: theme.inkMuted, fontFamily }]}>这个文件夹还没有文档，导入文档时选择它即可归入。</Text>
                ) : (
                  folderDocs(openFolder.id).map((doc) => (
                    <Pressable
                      key={`folder-doc-${doc.id}`}
                      accessibilityRole="button"
                      onPress={() => openDocContainer(doc)}
                      style={({ pressed }) => [styles.folderRow, pressed && styles.pressed]}
                    >
                      <View style={[styles.docIcon, { backgroundColor: theme.paperSoft }]}>
                        <Ionicons name="document-text-outline" size={17} color={theme.accent} />
                      </View>
                      <View style={styles.docTextWrap}>
                        <Text numberOfLines={1} style={[styles.folderRowTitle, { color: theme.ink, fontFamily }]}>{doc.title}</Text>
                        <Text numberOfLines={1} style={[styles.docMeta, { color: theme.inkMuted, fontFamily }]}>{doc.cardCount} 张卡片</Text>
                      </View>
                      {!isCustomDocument(doc) ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`编辑文档：${doc.title}`}
                          disabled={busy}
                          onPress={() => openDocEditor(doc)}
                          style={({ pressed }) => [styles.docActionButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
                        >
                          <Ionicons name="create-outline" size={16} color={theme.ink} />
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`删除文档：${doc.title}`}
                        disabled={busy}
                        onPress={() => confirmDelete(doc)}
                        style={({ pressed }) => [styles.docActionButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.red} />
                      </Pressable>
                    </Pressable>
                  ))
                )}
                <Text style={[styles.folderSectionLabel, { color: theme.inkMuted, fontFamily }]}>手写分组</Text>
                {folderGroups(openFolder.id).length === 0 ? (
                  <Text style={[styles.folderEmptyText, { color: theme.inkMuted, fontFamily }]}>
                    还没有手写分组，创建手写卡片时选择这个文件夹，卡片会按分组归入这里。
                  </Text>
                ) : (
                  folderGroups(openFolder.id).map((group) => (
                    <Pressable
                      key={`folder-group-${group.id}`}
                      accessibilityRole="button"
                      onPress={() => openGroupContainer(group)}
                      style={({ pressed }) => [styles.folderRow, pressed && styles.pressed]}
                    >
                      <View style={[styles.docIcon, { backgroundColor: theme.paperSoft }]}>
                        <Ionicons name="albums-outline" size={17} color={theme.accent} />
                      </View>
                      <View style={styles.docTextWrap}>
                        <Text numberOfLines={1} style={[styles.folderRowTitle, { color: theme.ink, fontFamily }]}>{group.name}</Text>
                        <Text numberOfLines={1} style={[styles.docMeta, { color: theme.inkMuted, fontFamily }]}>手写分组 · {group.cardCount} 张卡片</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`编辑分组：${group.name}`}
                        disabled={busy}
                        onPress={() => openGroupEditor(group)}
                        style={({ pressed }) => [styles.docActionButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
                      >
                        <Ionicons name="create-outline" size={16} color={theme.ink} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`删除分组：${group.name}`}
                        disabled={busy}
                        onPress={() => confirmDeleteGroup(group)}
                        style={({ pressed }) => [styles.docActionButton, { backgroundColor: theme.paperSoft }, pressed && !busy && styles.pressed, busy && { opacity: 0.55 }]}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.red} />
                      </Pressable>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* 卡片列表页：点击文档 / 手写分组后展示其全部卡片 */}
      <Modal visible={container !== null} transparent animationType="slide" onRequestClose={() => setContainer(null)}>
        <View style={[styles.sheetBackdrop, { backgroundColor: 'rgba(17,17,15,0.5)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setContainer(null)} />
          <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom }]}>
            <View style={[styles.grabber, { backgroundColor: theme.inkMuted }]} />
            <View style={[styles.sheetHeader, { borderColor: theme.line }]}>
              <View style={styles.sheetHeaderSpacer} />
              <Text numberOfLines={1} style={[styles.sheetTitle, { color: theme.ink, fontFamily }]}>
                {container?.title ?? '卡片列表'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setContainer(null)} style={styles.sheetDone}>
                <Text style={[styles.sheetDoneText, { color: theme.accent, fontFamily }]}>完成</Text>
              </Pressable>
            </View>
            {container ? (
              <>
                <Text numberOfLines={1} style={[styles.sheetMeta, { color: theme.inkMuted, fontFamily }]}>
                  {containerCards ? `${containerCards.length} 张卡片 · ${container.subtitle}` : container.subtitle}
                </Text>
                <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetBodyInner} showsVerticalScrollIndicator={false}>
                  {containerCards === null ? (
                    <Text style={[styles.folderEmptyText, { color: theme.inkMuted, fontFamily }]}>正在加载…</Text>
                  ) : containerCards.length === 0 ? (
                    <Text style={[styles.folderEmptyText, { color: theme.inkMuted, fontFamily }]}>
                      {container.kind === 'group' ? '这个分组还没有手写卡片，点上方「手写卡片」创建第一张。' : '这个文档还没有生成卡片。'}
                    </Text>
                  ) : (
                    containerCards.map((card, index) => (
                      <Pressable
                        key={`container-card-${card.id}-${card.documentId}-${card.sortOrder}-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel={`查看卡片：${card.title}`}
                        onPress={() => setSelectedCardId(card.id)}
                        style={({ pressed }) => [styles.cardPreview, pressed && styles.pressed]}
                      >
                        <KnowledgeCard
                          card={card}
                          settings={settings}
                          compact
                          onDelete={() => confirmDeleteCard(card)}
                        />
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* 导入配置弹窗：文件夹 / AI 开关 / 文件选择 + 确定后执行导入流水线 */}
      <ImportConfigModal
        visible={importConfigOpen}
        folders={folders}
        settings={settings}
        defaultFolderId={defaultFolder?.id ?? null}
        onClose={() => setImportConfigOpen(false)}
        onImported={handleImported}
        onOpenAiSettings={onOpenAiSettings}
      />

      {/* 新建文件夹对话框（仅知识库页提供） */}
      <Modal visible={folderCreateOpen} transparent animationType="fade" onRequestClose={() => setFolderCreateOpen(false)}>
        <View style={[styles.dialogBackdrop, { backgroundColor: 'rgba(17,17,15,0.5)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFolderCreateOpen(false)} />
          <View style={[styles.dialog, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
            <Text style={[styles.dialogTitle, { color: theme.ink, fontFamily }]}>新建文件夹</Text>
            <TextInput
              value={folderName}
              onChangeText={setFolderName}
              placeholder="文件夹名称"
              placeholderTextColor={palette.inkMuted}
              autoFocus
              style={[styles.dialogInput, { fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
            />
            <View style={styles.dialogActions}>
              <AppButton label="取消" variant="light" style={styles.dialogButton} onPress={() => setFolderCreateOpen(false)} />
              <AppButton label="创建" icon="folder-open-outline" loading={busy} style={styles.dialogButton} onPress={() => { void submitCreateFolder(); }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* 新建分组对话框：选所属文件夹（下拉）+ 填分组名称 */}
      <Modal visible={groupCreateOpen} transparent animationType="fade" onRequestClose={() => setGroupCreateOpen(false)}>
        <View style={[styles.dialogBackdrop, { backgroundColor: 'rgba(17,17,15,0.5)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGroupCreateOpen(false)} />
          <View style={[styles.dialog, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
            <Text style={[styles.dialogTitle, { color: theme.ink, fontFamily }]}>新建分组</Text>
            <SelectField
              value={groupCreateFolderName}
              placeholder="选择所属文件夹"
              onPress={() => setGroupCreateFolderSelectOpen(true)}
            />
            <TextInput
              value={groupCreateName}
              onChangeText={setGroupCreateName}
              placeholder="分组名称"
              placeholderTextColor={palette.inkMuted}
              style={[styles.dialogInput, { fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
            />
            <View style={styles.dialogActions}>
              <AppButton label="取消" variant="light" style={styles.dialogButton} onPress={() => setGroupCreateOpen(false)} />
              <AppButton label="创建" icon="albums-outline" loading={busy} style={styles.dialogButton} onPress={() => { void submitCreateGroup(); }} />
            </View>
          </View>
        </View>
      </Modal>
      <AppSelectSheet
        visible={groupCreateFolderSelectOpen}
        title="选择所属文件夹"
        options={folderSelectOptions(folders)}
        selectedKey={groupCreateFolderId === null ? null : String(groupCreateFolderId)}
        onSelect={(key) => setGroupCreateFolderId(Number(key))}
        onClose={() => setGroupCreateFolderSelectOpen(false)}
      />
      </ScrollView>

      {/* 操作结果提示：悬浮在页面上方，不占据列表布局 */}
      <View pointerEvents="none" style={styles.toastLayer}>
        {toast ? (
          <Animated.View
            style={[
              styles.toast,
              {
                backgroundColor: theme.paperElevated,
                borderColor: theme.line,
                opacity: toastOpacity,
                transform: [{ translateY: toastOpacity.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={15} color={theme.accent} />
            <Text numberOfLines={2} style={[styles.toastText, { color: theme.ink, fontFamily }]}>{toast}</Text>
          </Animated.View>
        ) : null}
      </View>

      {/* 右下角悬浮操作钮：点开后向上展开导入 / 手写 / GET 三个操作项 */}
      {fabOpen ? <Pressable style={StyleSheet.absoluteFill} onPress={() => toggleFab(false)} /> : null}
      <View pointerEvents="box-none" style={[styles.fabLayer, { bottom: Math.max(insets.bottom, 8) + 108 }]}>
        <Animated.View
          pointerEvents={fabOpen ? 'auto' : 'none'}
          style={[styles.fabMenu, { opacity: fabAnim, transform: [{ translateY: fabAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
        >
          {([
            { icon: 'add-outline' as const, label: '导入文件', onPress: () => { toggleFab(false); beginImport(); } },
            { icon: 'pencil-outline' as const, label: '手写卡片', onPress: () => { toggleFab(false); openCardEditor(null); } },
            { icon: 'flash-outline' as const, label: '开始 GET', onPress: () => { toggleFab(false); onStartSession(); } },
          ]).map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={item.onPress}
              style={({ pressed }) => [styles.fabMenuItem, pressed && styles.pressed]}
            >
              <View style={[styles.fabMenuLabel, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
                <Text style={[styles.fabMenuText, { color: theme.ink, fontFamily }]}>{item.label}</Text>
              </View>
              <View style={[styles.fabMenuIcon, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
                <Ionicons name={item.icon} size={18} color={theme.ink} />
              </View>
            </Pressable>
          ))}
        </Animated.View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fabOpen ? '收起操作' : '添加内容'}
          onPress={() => toggleFab(!fabOpen)}
          style={({ pressed }) => [styles.fabMain, { backgroundColor: theme.accent }, pressed && styles.pressed]}
        >
          <Ionicons name={fabOpen ? 'close' : 'add'} size={26} color={theme.paper} />
        </Pressable>
      </View>
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
  wrap: { padding: 18, paddingBottom: 200, gap: 14 },
  toastLayer: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '86%', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, ...shadow.soft },
  toastText: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  sectionCount: { fontSize: 12, fontWeight: '700' },
  listModeSwitch: { flexDirection: 'row', gap: 4, backgroundColor: 'rgba(17,17,15,0.05)', borderRadius: radius.pill, padding: 3, marginLeft: 'auto' },
  listModeButton: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  listModeText: { fontSize: 12, fontWeight: '800' },
  folderActions: { flexDirection: 'row', gap: 10, marginTop: -4 },
  folderActionButton: { flex: 1, minHeight: 44 },
  fabLayer: { position: 'absolute', right: 18, alignItems: 'flex-end', gap: 12 },
  fabMain: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  fabMenu: { alignItems: 'flex-end', gap: 10 },
  fabMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fabMenuLabel: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  fabMenuText: { fontSize: 13, fontWeight: '700' },
  fabMenuIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  folderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderBadge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  folderBadgeText: { fontSize: 10, fontWeight: '800' },
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
  folderSectionLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 4 },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  folderRowTitle: { fontSize: 15, fontWeight: '700' },
  folderEmptyText: { fontSize: 13, lineHeight: 20, fontWeight: '600', paddingVertical: 10 },
  dialogBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,17,15,0.5)', padding: 28 },
  dialog: { width: '100%', maxWidth: 360, borderRadius: radius.lg, borderWidth: 1, padding: 18, gap: 12 },
  dialogTitle: { fontSize: 18, fontWeight: '900' },
  dialogInput: { minHeight: 46, borderRadius: radius.lg, paddingHorizontal: 14, fontSize: 15 },
  dialogActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  dialogButton: { minWidth: 96, minHeight: 44 },
});
