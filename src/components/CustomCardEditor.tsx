import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React from 'react';
import { BackHandler, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from './AppButton';
import { AppSelectSheet, SelectField, folderSelectOptions } from './AppSelectSheet';
import { showAlert } from './AppAlert';
import { MarkdownRenderer } from './MarkdownRenderer';
import { createCardGroup, createCustomCard, deleteCustomCardImages, storeCustomCardImages, updateCustomCard } from '../data/repository';
import type { CardGroupWithCount, CardRecord, FolderRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';

type Props = {
  settings: Settings;
  // 文件夹候选列表（含默认文件夹），下拉选择用。
  folders: FolderRecord[];
  // 手写分组候选（按所选文件夹过滤）；在编辑器内新建分组后会通过 onDataChanged 请求刷新。
  cardGroups: CardGroupWithCount[];
  onDataChanged?: () => void;
  // 传入时进入编辑模式：预填标题/分组/正文/配图，保存走 updateCustomCard。
  card?: CardRecord | null;
  // 编辑模式下这张卡片当前所在文件夹（由卡片的分组推导）。
  initialFolderId?: number | null;
  onClose: () => void;
  onCreated: () => void;
};

// 独立成行的配图行（编辑模式从已保存正文里拆出来回填）。
const storedImageLinePattern = /^!\[[^\]]*\]\((file:\/\/[^)]+)\)$/;

function splitContentImages(content: string) {
  const images: string[] = [];
  const rest: string[] = [];
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const match = line.trim().match(storedImageLinePattern);
    if (match) {
      images.push(match[1]);
      continue;
    }
    rest.push(line);
  }
  return { images, text: rest.join('\n').trim() };
}

// 手写卡片编辑浮层（非原生 Modal，主动做键盘避让，与批注编辑器同一套模式）。
// 标题必填；文件夹与分组都是下拉选择：分组列表随所选文件夹过滤，
// 没有合适分组时可走「新建分组…」（填写名称，归属当前所选文件夹）。
// 未选择分组时兜底归入默认文件夹的「手写」分组。
// 正文支持 Markdown；配图以独立成行的图片语法写进卡片正文。
export function CustomCardEditor({ settings, folders, cardGroups, onDataChanged, card, initialFolderId, onClose, onCreated }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const fontFamily = settings.fontFamily;
  const editing = Boolean(card);
  const initial = React.useRef(splitContentImages(card?.content ?? ''));
  const [title, setTitle] = React.useState(card?.title ?? '');
  const [groupId, setGroupId] = React.useState<number | null>(card?.groupId ?? null);
  const [text, setText] = React.useState(initial.current.text);
  const [images, setImages] = React.useState<string[]>(initial.current.images);
  const [folderId, setFolderId] = React.useState<number | null>(initialFolderId ?? null);
  const [folderSelectOpen, setFolderSelectOpen] = React.useState(false);
  const [groupSelectOpen, setGroupSelectOpen] = React.useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = React.useState(false);
  const [groupCreateName, setGroupCreateName] = React.useState('');
  const [mode, setMode] = React.useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);

  const defaultFolder = folders.find((folder) => folder.isDefault === 1) ?? folders[0] ?? null;
  const activeFolderId = folderId ?? defaultFolder?.id ?? null;
  const activeFolderName = folders.find((folder) => folder.id === activeFolderId)?.name ?? '';

  // 分组候选 = App 下发的全量分组 + 本会话内新建的分组（App 刷新落库前保证可选）。
  const [freshGroups, setFreshGroups] = React.useState<CardGroupWithCount[]>([]);
  const allGroups = React.useMemo(() => {
    const known = new Set(cardGroups.map((group) => group.id));
    return [...cardGroups, ...freshGroups.filter((group) => !known.has(group.id))];
  }, [cardGroups, freshGroups]);
  const folderGroupOptions = allGroups
    .filter((group) => group.folderId === activeFolderId)
    .map((group) => ({ key: String(group.id), label: group.name, hint: `${group.cardCount} 张卡片` }));
  const activeGroupName = allGroups.find((group) => group.id === groupId)?.name ?? '';

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const closeEditor = React.useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const discardImages = React.useCallback((uris: string[]) => {
    void deleteCustomCardImages(uris);
  }, []);

  // 有任何改动时先确认；放弃时只清掉本次新增、尚未保存的配图（原配图仍被已保存卡片引用）。
  const attemptClose = React.useCallback(() => {
    const dirty =
      title.trim() !== '' ||
      text.trim() !== '' ||
      images.length !== initial.current.images.length ||
      images.some((uri) => !initial.current.images.includes(uri)) ||
      (editing && groupId !== (card?.groupId ?? null));
    if (!dirty) {
      closeEditor();
      return;
    }
    showAlert({
      title: editing ? '放弃这次修改？' : '放弃这张卡片？',
      message: '当前填写的内容还未保存。',
      buttons: [
        { text: '继续编辑', style: 'cancel' },
        {
          text: '放弃',
          style: 'destructive',
          onPress: () => {
            discardImages(images.filter((uri) => !initial.current.images.includes(uri)));
            closeEditor();
          },
        },
      ],
    });
  }, [card, closeEditor, discardImages, editing, groupId, images, text, title]);

  const pickImages = React.useCallback(async () => {
    if (picking || saving) return;
    try {
      setPicking(true);
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true, multiple: true });
      if (result.canceled || !result.assets?.length) return;
      const stored = await storeCustomCardImages(result.assets.map((asset) => asset.uri));
      if (stored.length > 0) setImages((prev) => [...prev, ...stored]);
    } catch (error) {
      showAlert({ title: '添加图片失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setPicking(false);
    }
  }, [picking, saving]);

  const removeImage = React.useCallback((uri: string) => {
    setImages((prev) => prev.filter((item) => item !== uri));
    // 只立即删除本次新增的图片；原图仍被已保存的卡片引用，
    // 真正保存后由 updateCustomCard 按内容差异统一清理，取消编辑则保留。
    if (!initial.current.images.includes(uri)) discardImages([uri]);
  }, [discardImages]);

  // 保存的正文 = 文本 + 独立成行的配图；预览与落库使用同一份组合结果。
  const composedContent = React.useMemo(() => {
    const body = text.trim();
    const imageLines = images.map((uri) => `![配图](${uri})`).join('\n\n');
    if (!body) return imageLines;
    return imageLines ? `${body}\n\n${imageLines}` : body;
  }, [images, text]);

  const switchMode = React.useCallback((next: 'edit' | 'preview') => {
    setMode(next);
    if (next === 'preview') Keyboard.dismiss();
  }, []);

  const persist = React.useCallback(async () => {
    if (saving) return;
    if (!title.trim()) {
      showAlert({ title: '缺少标题', message: '给卡片起一个标题再保存。' });
      return;
    }
    try {
      setSaving(true);
      if (card) {
        await updateCustomCard(card.id, { title, content: composedContent, groupId });
      } else {
        await createCustomCard({ title, content: composedContent, groupId });
      }
      Keyboard.dismiss();
      onCreated();
    } catch (error) {
      showAlert({ title: '保存失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setSaving(false);
    }
  }, [card, composedContent, groupId, onCreated, saving, title]);

  // Android 返回键：先收键盘，再走丢弃确认，最后关闭。
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (keyboardHeight > 0) Keyboard.dismiss();
      else attemptClose();
      return true;
    });
    return () => subscription.remove();
  }, [attemptClose, keyboardHeight]);

  const sheetBottomInset = keyboardHeight > 0 ? keyboardHeight + 12 : Math.max(insets.bottom, 12) + 12;

  // 在编辑器内新建分组：归属当前所选文件夹，成功后立即选中并请求刷新分组列表。
  const submitCreateGroup = React.useCallback(async () => {
    if (saving) return;
    try {
      setSaving(true);
      const group = await createCardGroup(activeFolderId, groupCreateName);
      setGroupCreateOpen(false);
      setGroupCreateName('');
      setGroupId(group.id);
      setFreshGroups((prev) => [...prev, { ...group, cardCount: 0 }]);
      onDataChanged?.();
    } catch (error) {
      showAlert({ title: '创建失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setSaving(false);
    }
  }, [activeFolderId, groupCreateName, onDataChanged, saving]);

  return (
    <View style={styles.editorLayer}>
      <Pressable style={styles.editorBackdrop} onPress={attemptClose} />
      <View style={[styles.editorSheet, { backgroundColor: theme.paperElevated, paddingBottom: sheetBottomInset }]}>
        <View style={styles.editorHead}>
          <Text style={[styles.editorTitle, { color: theme.ink, fontFamily }]}>{editing ? '编辑手写卡片' : '手写卡片'}</Text>
          <View style={styles.modeSwitch}>
            {(['edit', 'preview'] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityLabel={item === 'edit' ? '切换到编辑' : '切换到预览'}
                onPress={() => switchMode(item)}
                style={[styles.modeButton, { backgroundColor: mode === item ? theme.accent : theme.paperSoft }]}
              >
                <Text style={[styles.modeText, { color: mode === item ? theme.paper : theme.inkMuted, fontFamily }]}>
                  {item === 'edit' ? '编辑' : '预览'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="标题（必填）"
          placeholderTextColor={palette.inkMuted}
          style={[styles.fieldInput, { fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
        />
        {/* 所在文件夹：下拉选择（不做自由输入），未选择时归入默认文件夹 */}
        <SelectField
          value={activeFolderName}
          placeholder="选择文件夹（默认归入默认文件夹）"
          onPress={() => setFolderSelectOpen(true)}
        />
        {/* 所属分组：下拉选择（不做自由输入）；列表随文件夹过滤，可现场新建 */}
        <SelectField
          icon="albums-outline"
          value={activeGroupName}
          placeholder="选择分组（默认「手写」）"
          onPress={() => setGroupSelectOpen(true)}
        />
        {mode === 'edit' ? (
          <TextInput
            // 非受控输入：只监听 onChangeText 跟踪草稿，不回传 value，长正文不卡顿。
            defaultValue={text}
            onChangeText={setText}
            multiline
            placeholder="正文支持 Markdown：**加粗**、==高亮==、列表、引用……图片用下方按钮添加"
            placeholderTextColor={palette.inkMuted}
            style={[styles.contentInput, { fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
            textAlignVertical="top"
          />
        ) : (
          <ScrollView style={[styles.previewBox, { backgroundColor: theme.paperSoft }]} showsVerticalScrollIndicator={false}>
            {composedContent.trim() ? (
              <MarkdownRenderer markdown={composedContent} color={theme.ink} fontSize={15} fontFamily={fontFamily} />
            ) : (
              <Text style={[styles.previewEmpty, { color: theme.inkMuted, fontFamily }]}>暂无内容</Text>
            )}
          </ScrollView>
        )}
        <View style={styles.imageRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="添加图片"
            onPress={() => { void pickImages(); }}
            disabled={picking}
            style={({ pressed }) => [styles.addImageButton, { backgroundColor: theme.paperSoft, borderColor: theme.line }, pressed && !picking && styles.pressed, picking && { opacity: 0.55 }]}
          >
            <Ionicons name="image-outline" size={16} color={theme.ink} />
            <Text style={[styles.addImageText, { color: theme.ink, fontFamily }]}>{picking ? '选择中…' : '添加图片'}</Text>
          </Pressable>
          {images.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageStrip}>
              {images.map((uri) => (
                <View key={uri} style={[styles.imageChip, { borderColor: theme.line }]}>
                  <Image accessible source={{ uri }} style={styles.imageThumb} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="移除图片"
                    onPress={() => removeImage(uri)}
                    style={[styles.imageRemove, { backgroundColor: theme.ink }]}
                  >
                    <Ionicons name="close" size={11} color={theme.paper} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>
        <View style={styles.editorActions}>
          <AppButton label="取消" variant="light" onPress={attemptClose} />
          <AppButton label={editing ? '保存修改' : '保存卡片'} icon="checkmark-outline" loading={saving} onPress={() => { void persist(); }} />
        </View>
      </View>
      <AppSelectSheet
        visible={folderSelectOpen}
        title="选择文件夹"
        options={folderSelectOptions(folders)}
        selectedKey={activeFolderId === null ? null : String(activeFolderId)}
        onSelect={(key) => {
          const nextFolderId = Number(key);
          setFolderId(nextFolderId);
          // 切换文件夹后原分组不在新文件夹里时清空选择，避免归属错乱。
          const currentGroup = allGroups.find((group) => group.id === groupId);
          if (currentGroup && currentGroup.folderId !== nextFolderId) setGroupId(null);
        }}
        onClose={() => setFolderSelectOpen(false)}
      />
      <AppSelectSheet
        visible={groupSelectOpen}
        title="选择分组"
        options={folderGroupOptions}
        selectedKey={groupId === null ? null : String(groupId)}
        onSelect={(key) => setGroupId(Number(key))}
        onClose={() => setGroupSelectOpen(false)}
        actionLabel="新建分组…"
        onAction={() => { setGroupCreateName(''); setGroupCreateOpen(true); }}
      />
      {/* 编辑器内新建分组：填写名称，归属当前所选文件夹 */}
      <Modal visible={groupCreateOpen} transparent animationType="fade" onRequestClose={() => setGroupCreateOpen(false)}>
        <View style={styles.dialogBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGroupCreateOpen(false)} />
          <View style={[styles.dialog, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
            <Text style={[styles.dialogTitle, { color: theme.ink, fontFamily }]}>新建分组</Text>
            <Text style={[styles.dialogMeta, { color: theme.inkMuted, fontFamily }]}>归属文件夹：{activeFolderName || '默认文件夹'}</Text>
            <TextInput
              value={groupCreateName}
              onChangeText={setGroupCreateName}
              placeholder="分组名称"
              placeholderTextColor={palette.inkMuted}
              autoFocus
              style={[styles.dialogInput, { fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
            />
            <View style={styles.editorActions}>
              <AppButton label="取消" variant="light" style={styles.dialogButton} onPress={() => setGroupCreateOpen(false)} />
              <AppButton label="创建" icon="albums-outline" loading={saving} style={styles.dialogButton} onPress={() => { void submitCreateGroup(); }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  editorLayer: { ...StyleSheet.absoluteFillObject },
  editorBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,17,15,0.55)' },
  editorSheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 18,
    paddingHorizontal: 18,
    gap: 10,
  },
  editorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorTitle: { fontSize: 22, fontWeight: '900' },
  modeSwitch: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(17,17,15,0.05)', borderRadius: radius.pill, padding: 3 },
  modeButton: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5 },
  modeText: { fontSize: 12, fontWeight: '800' },
  fieldInput: { minHeight: 44, borderRadius: radius.lg, paddingHorizontal: 14, fontSize: 15 },
  contentInput: { minHeight: 130, maxHeight: 200, borderRadius: radius.lg, padding: 14, fontSize: 15, lineHeight: 22 },
  previewBox: { minHeight: 130, maxHeight: 220, borderRadius: radius.lg, padding: 14 },
  previewEmpty: { fontSize: 14, fontWeight: '600' },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addImageButton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1 },
  addImageText: { fontSize: 13, fontWeight: '700' },
  imageStrip: { flexGrow: 0 },
  imageChip: { width: 56, height: 56, borderRadius: 10, borderWidth: 1, marginRight: 8, overflow: 'hidden' },
  imageThumb: { width: '100%', height: '100%' },
  imageRemove: { position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  editorActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  dialogBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,17,15,0.5)', padding: 28 },
  dialog: { width: '100%', maxWidth: 360, borderRadius: radius.lg, borderWidth: 1, padding: 18, gap: 12 },
  dialogTitle: { fontSize: 18, fontWeight: '900' },
  dialogMeta: { fontSize: 12, fontWeight: '600', marginTop: -6 },
  dialogInput: { minHeight: 46, borderRadius: radius.lg, paddingHorizontal: 14, fontSize: 15 },
  dialogButton: { minWidth: 96, minHeight: 44 },
  pressed: { opacity: 0.72 },
});
