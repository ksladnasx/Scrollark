import React from 'react';
import { BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from './AppButton';
import { AppSelectSheet, SelectField, folderSelectOptions } from './AppSelectSheet';
import { MarkdownRenderer } from './MarkdownRenderer';
import { showAlert } from './AppAlert';
import { isCustomDocument, updateDocument } from '../data/repository';
import type { DocumentRecord, FolderRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';

type Props = {
  settings: Settings;
  // 文件夹候选列表（含默认文件夹），下拉选择用。
  folders: FolderRecord[];
  document: DocumentRecord;
  onClose: () => void;
  onSaved: (result: { regenerated: boolean; cards: number }) => void;
};

const normalizeBreaks = (value: string) => value.replace(/\r\n/g, '\n');

// 文档编辑浮层（第一级）：编辑文档信息（标题 / 所属文件夹）；
// 「编辑内容」进入二级全屏内容编辑页。内容有修改时保存会按新内容重新生成卡片
// （原卡片的收藏与批注会被清除），保存前二次确认；只改信息时不动已有卡片。
export function DocumentEditor({ settings, folders, document: doc, onClose, onSaved }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  const [title, setTitle] = React.useState(doc.title);
  const [folderId, setFolderId] = React.useState<number | null>(doc.folderId);
  // 内容草稿由二级全屏编辑页带回；未进入内容页时与原文一致。
  const [text, setText] = React.useState(doc.content);
  const [contentEditorOpen, setContentEditorOpen] = React.useState(false);
  const [folderSelectOpen, setFolderSelectOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const insets = useSafeAreaInsets();

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

  const defaultFolder = folders.find((folder) => folder.isDefault === 1) ?? folders[0] ?? null;
  const activeFolderId = folderId ?? defaultFolder?.id ?? null;
  const activeFolderName = folders.find((folder) => folder.id === activeFolderId)?.name ?? '';
  // 分组文档（手写卡集）：卡片在「手写卡片」编辑器里维护，这里不提供内容编辑（避免误重切卡片）。
  const groupDocument = isCustomDocument(doc);

  const titleChanged = title.trim() !== doc.title.trim();
  const folderChanged = activeFolderId !== doc.folderId;
  const contentChanged = normalizeBreaks(text) !== normalizeBreaks(doc.content);

  const closeEditor = React.useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  // 有任何改动时先确认再放弃。
  const attemptClose = React.useCallback(() => {
    if (!titleChanged && !folderChanged && !contentChanged) {
      closeEditor();
      return;
    }
    showAlert({
      title: '放弃这次修改？',
      message: '当前编辑的内容还未保存。',
      buttons: [
        { text: '继续编辑', style: 'cancel' },
        { text: '放弃', style: 'destructive', onPress: closeEditor },
      ],
    });
  }, [closeEditor, contentChanged, folderChanged, titleChanged]);

  const doSave = React.useCallback(async () => {
    if (saving) return;
    try {
      setSaving(true);
      const result = await updateDocument(doc.id, {
        title,
        folderId: activeFolderId,
        content: contentChanged ? text : undefined,
      });
      Keyboard.dismiss();
      onSaved({ regenerated: result.regenerated, cards: result.cards });
    } catch (error) {
      showAlert({ title: '保存失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setSaving(false);
    }
  }, [activeFolderId, contentChanged, doc.id, onSaved, saving, text, title]);

  const persist = React.useCallback(() => {
    if (saving) return;
    if (!title.trim()) {
      showAlert({ title: '缺少标题', message: '给文档起一个标题再保存。' });
      return;
    }
    if (contentChanged && !text.trim()) {
      showAlert({ title: '内容为空', message: '文档内容不能为空，请填写 Markdown 内容。' });
      return;
    }
    if (contentChanged) {
      showAlert({
        title: '重新生成卡片',
        message: '文档内容已修改，保存后将按新内容重新生成卡片，原卡片的收藏、批注与学习进度会被清除。',
        buttons: [
          { text: '取消', style: 'cancel' },
          { text: '保存并重新生成', style: 'destructive', onPress: () => { void doSave(); } },
        ],
      });
      return;
    }
    void doSave();
  }, [contentChanged, doSave, saving, text, title]);

  return (
    <View style={styles.editorLayer}>
      <Pressable style={styles.editorBackdrop} onPress={attemptClose} />
      <View style={[styles.editorSheet, { backgroundColor: theme.paperElevated, paddingBottom: keyboardHeight > 0 ? keyboardHeight + 12 : Math.max(insets.bottom, 12) + 12 }]}>
        <View style={styles.editorHead}>
          <Text style={[styles.editorTitle, { color: theme.ink, fontFamily }]}>编辑文档</Text>
          <Text style={[styles.editorSubtitle, { color: theme.inkMuted, fontFamily }]} numberOfLines={1}>{doc.title}</Text>
        </View>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="文档标题（必填）"
          placeholderTextColor={palette.inkMuted}
          style={[styles.fieldInput, { fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
        />
        {/* 所属文件夹：下拉选择（不做自由输入），未选择时归入默认文件夹 */}
        <SelectField
          value={activeFolderName}
          placeholder="选择文件夹（默认归入默认文件夹）"
          onPress={() => setFolderSelectOpen(true)}
        />
        {/* 内容修改进入二级全屏编辑页；分组文档的卡片由手写卡编辑器维护，不提供内容编辑 */}
        {groupDocument ? null : (
          <AppButton label="编辑内容" icon="document-text-outline" variant="light" style={styles.contentEntry} onPress={() => setContentEditorOpen(true)} />
        )}
        <Text style={[styles.hint, { color: theme.inkMuted, fontFamily }]}>
          {groupDocument
            ? '提示：这是手写卡片的分组文档，卡片在「手写卡片」编辑器中维护；这里可修改名称与所属文件夹。'
            : contentChanged
              ? '内容已修改：保存后将重新生成这张文档的全部卡片。'
              : '提示：只改标题或文件夹不会影响已生成的卡片。'}
        </Text>
        <View style={styles.editorActions}>
          <AppButton label="取消" variant="light" onPress={attemptClose} />
          <AppButton label="保存" icon="checkmark-outline" loading={saving} onPress={persist} />
        </View>
      </View>
      <AppSelectSheet
        visible={folderSelectOpen}
        title="选择所属文件夹"
        options={folderSelectOptions(folders)}
        selectedKey={activeFolderId === null ? null : String(activeFolderId)}
        onSelect={(key) => setFolderId(Number(key))}
        onClose={() => setFolderSelectOpen(false)}
      />
      {contentEditorOpen ? (
        <DocumentContentEditor
          settings={settings}
          initialText={text}
          onApply={(next) => {
            setText(next);
            setContentEditorOpen(false);
          }}
          onClose={() => setContentEditorOpen(false)}
        />
      ) : null}
    </View>
  );
}

// 第二级：全屏内容编辑页。编辑完成后带回草稿（第一级保存时才落库）。
function DocumentContentEditor({
  settings,
  initialText,
  onApply,
  onClose,
}: {
  settings: Settings;
  initialText: string;
  onApply: (text: string) => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const fontFamily = settings.fontFamily;
  const [draft, setDraft] = React.useState(initialText);
  const [mode, setMode] = React.useState<'edit' | 'preview'>('edit');
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);

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

  const changed = normalizeBreaks(draft) !== normalizeBreaks(initialText);

  // 返回 / Android 返回键：草稿有改动时先确认放弃。
  const attemptClose = React.useCallback(() => {
    if (!changed) {
      onClose();
      return;
    }
    showAlert({
      title: '放弃内容修改？',
      message: '本次进入内容编辑后的改动还未带回。',
      buttons: [
        { text: '继续编辑', style: 'cancel' },
        { text: '放弃', style: 'destructive', onPress: onClose },
      ],
    });
  }, [changed, onClose]);

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (keyboardHeight > 0) Keyboard.dismiss();
      else attemptClose();
      return true;
    });
    return () => subscription.remove();
  }, [attemptClose, keyboardHeight]);

  const bottomInset = keyboardHeight > 0 ? keyboardHeight : Math.max(insets.bottom, 12);

  return (
    <View style={[styles.fullScreen, { backgroundColor: theme.paper, paddingBottom: bottomInset }]}>
      <View style={[styles.fullHeader, { borderColor: theme.line, paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <Pressable accessibilityRole="button" onPress={attemptClose} style={({ pressed }) => [styles.fullBackButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}>
          <Text style={[styles.fullBackText, { color: theme.ink, fontFamily }]}>返回</Text>
        </Pressable>
        <Text style={[styles.fullTitle, { color: theme.ink, fontFamily }]}>编辑内容</Text>
        <Pressable accessibilityRole="button" onPress={() => onApply(draft)} style={({ pressed }) => [styles.fullDoneButton, pressed && styles.pressed]}>
          <Text style={[styles.fullDoneText, { color: theme.blue, fontFamily }]}>完成</Text>
        </Pressable>
      </View>
      <View style={styles.fullToolbar}>
        <View style={styles.modeSwitch}>
          {(['edit', 'preview'] as const).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityLabel={item === 'edit' ? '切换到编辑' : '切换到预览'}
              onPress={() => {
                setMode(item);
                if (item === 'preview') Keyboard.dismiss();
              }}
              style={[styles.modeButton, { backgroundColor: mode === item ? theme.accent : theme.paperSoft }]}
            >
              <Text style={[styles.modeText, { color: mode === item ? theme.paper : theme.inkMuted, fontFamily }]}>
                {item === 'edit' ? '编辑' : '预览'}
              </Text>
            </Pressable>
          ))}
        </View>
        {changed ? (
          <View style={[styles.dirtyBadge, { backgroundColor: theme.paperSoft }]}>
            <Text style={[styles.dirtyText, { color: theme.inkMuted, fontFamily }]}>未保存</Text>
          </View>
        ) : null}
      </View>
      {mode === 'edit' ? (
        <TextInput
          // 非受控输入：长 Markdown 每次按键都把全文回传原生侧会明显卡顿，
          // 这里只监听 onChangeText 跟踪草稿（「未保存」徽标），不回传 value。
          defaultValue={draft}
          onChangeText={setDraft}
          multiline
          textAlignVertical="top"
          placeholder="Markdown 内容：# 一级标题、## 二级标题（分组）、### 三级标题（切卡）……保存后按标题重新生成卡片"
          placeholderTextColor={palette.inkMuted}
          style={[styles.fullInput, { fontFamily, backgroundColor: theme.paperElevated, color: theme.ink, borderColor: theme.line }]}
        />
      ) : (
        <ScrollView style={[styles.fullPreview, { backgroundColor: theme.paperElevated, borderColor: theme.line }]} contentContainerStyle={styles.fullPreviewInner} showsVerticalScrollIndicator={false}>
          {draft.trim() ? (
            <MarkdownRenderer markdown={draft} color={theme.ink} fontSize={settings.fontSize} fontFamily={fontFamily} />
          ) : (
            <Text style={[styles.previewEmpty, { color: theme.inkMuted, fontFamily }]}>暂无内容</Text>
          )}
        </ScrollView>
      )}
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
  editorHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  editorTitle: { fontSize: 22, fontWeight: '900' },
  editorSubtitle: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  fieldInput: { minHeight: 44, borderRadius: radius.lg, paddingHorizontal: 14, fontSize: 15 },
  contentEntry: { minHeight: 44 },
  hint: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  editorActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  pressed: { opacity: 0.72 },
  fullScreen: { ...StyleSheet.absoluteFillObject },
  fullHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  fullBackButton: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  fullBackText: { fontSize: 14, fontWeight: '700' },
  fullTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  fullDoneButton: { paddingHorizontal: 6, paddingVertical: 8 },
  fullDoneText: { fontSize: 15, fontWeight: '700' },
  fullToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  modeSwitch: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(17,17,15,0.05)', borderRadius: radius.pill, padding: 3 },
  modeButton: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5 },
  modeText: { fontSize: 12, fontWeight: '800' },
  dirtyBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  dirtyText: { fontSize: 11, fontWeight: '800' },
  fullInput: { flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: radius.lg, borderWidth: 1, padding: 16, fontSize: 15, lineHeight: 23, textAlignVertical: 'top' },
  fullPreview: { flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: radius.lg, borderWidth: 1 },
  fullPreviewInner: { padding: 16, paddingBottom: 30 },
  previewEmpty: { fontSize: 14, fontWeight: '600' },
});
