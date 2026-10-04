import React from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from './AppButton';
import { AppSelectSheet, SelectField, folderSelectOptions } from './AppSelectSheet';
import { showAlert } from './AppAlert';
import { updateCardGroup } from '../data/repository';
import type { CardGroupRecord, FolderRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';

type Props = {
  settings: Settings;
  // 文件夹候选列表（含默认文件夹），下拉选择用。
  folders: FolderRecord[];
  group: CardGroupRecord;
  onClose: () => void;
  onSaved: () => void;
};

// 手写分组编辑浮层（与文档编辑同一套信息编辑口径）：
// 改分组名 / 移动到其他文件夹；名称改动会同步组内卡片的分组展示。
export function GroupEditor({ settings, folders, group, onClose, onSaved }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const fontFamily = settings.fontFamily;
  const [name, setName] = React.useState(group.name);
  const [folderId, setFolderId] = React.useState<number | null>(group.folderId);
  const [folderSelectOpen, setFolderSelectOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
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

  const defaultFolder = folders.find((folder) => folder.isDefault === 1) ?? folders[0] ?? null;
  const activeFolderId = folderId ?? defaultFolder?.id ?? null;
  const activeFolderName = folders.find((folder) => folder.id === activeFolderId)?.name ?? '';

  const nameChanged = name.trim() !== group.name.trim();
  const folderChanged = activeFolderId !== group.folderId;

  const closeEditor = React.useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  // 有任何改动时先确认再放弃。
  const attemptClose = React.useCallback(() => {
    if (!nameChanged && !folderChanged) {
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
  }, [closeEditor, folderChanged, nameChanged]);

  const persist = React.useCallback(async () => {
    if (saving) return;
    if (!name.trim()) {
      showAlert({ title: '缺少名称', message: '给分组起一个名称再保存。' });
      return;
    }
    try {
      setSaving(true);
      await updateCardGroup(group.id, { name, folderId: activeFolderId });
      Keyboard.dismiss();
      onSaved();
    } catch (error) {
      showAlert({ title: '保存失败', message: error instanceof Error ? error.message : '请稍后再试' });
    } finally {
      setSaving(false);
    }
  }, [activeFolderId, group.id, name, onSaved, saving]);

  const sheetBottomInset = keyboardHeight > 0 ? keyboardHeight + 12 : Math.max(insets.bottom, 12) + 12;

  return (
    <View style={styles.editorLayer}>
      <Pressable style={styles.editorBackdrop} onPress={attemptClose} />
      <View style={[styles.editorSheet, { backgroundColor: theme.paperElevated, paddingBottom: sheetBottomInset }]}>
        <View style={styles.editorHead}>
          <Text style={[styles.editorTitle, { color: theme.ink, fontFamily }]}>编辑分组</Text>
          <Text style={[styles.editorSubtitle, { color: theme.inkMuted, fontFamily }]} numberOfLines={1}>{group.name}</Text>
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="分组名称（必填）"
          placeholderTextColor={palette.inkMuted}
          style={[styles.fieldInput, { fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
        />
        {/* 所属文件夹：下拉选择（不做自由输入），未选择时归入默认文件夹 */}
        <SelectField
          value={activeFolderName}
          placeholder="选择文件夹（默认归入默认文件夹）"
          onPress={() => setFolderSelectOpen(true)}
        />
        <Text style={[styles.hint, { color: theme.inkMuted, fontFamily }]}>提示：改名会同步组内卡片的分组显示，移动文件夹不会影响卡片内容。</Text>
        <View style={styles.editorActions}>
          <AppButton label="取消" variant="light" onPress={attemptClose} />
          <AppButton label="保存" icon="checkmark-outline" loading={saving} onPress={() => { void persist(); }} />
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
  hint: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  editorActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  pressed: { opacity: 0.72 },
});
