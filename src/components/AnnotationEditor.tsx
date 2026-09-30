import React from 'react';
import { Alert, BackHandler, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from './AppButton';
import { saveAnnotation } from '../data/repository';
import type { CardRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';

type Props = {
  card: CardRecord;
  settings: Settings;
  onClose: () => void;
  onSaved: (note: string | null) => void;
};

// 批注编辑浮层（非原生 Modal，主动做键盘避让，规避 edge-to-edge 下 adjustResize 失效问题）。
// 内部自带：草稿状态、未保存丢弃确认、Android 返回键处理、保存后回调。
export function AnnotationEditor({ card, settings, onClose, onSaved }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const fontFamily = settings.fontFamily;
  const [draft, setDraft] = React.useState(card.annotation ?? '');
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

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

  // 有未保存的修改时先确认，避免误触遮罩或返回键丢稿。
  const attemptClose = React.useCallback(() => {
    if (draft.trim() === (card.annotation ?? '').trim()) {
      closeEditor();
      return;
    }
    Alert.alert('放弃批注？', '当前输入的批注内容还未保存。', [
      { text: '继续编辑', style: 'cancel' },
      { text: '放弃', style: 'destructive', onPress: () => closeEditor() },
    ]);
  }, [card.annotation, closeEditor, draft]);

  const persist = React.useCallback(async () => {
    if (saving) return;
    try {
      setSaving(true);
      await saveAnnotation(card.id, draft);
      Keyboard.dismiss();
      onSaved(draft.trim() || null);
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后再试');
    } finally {
      setSaving(false);
    }
  }, [card.id, draft, onSaved, saving]);

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

  return (
    <View style={styles.editorLayer}>
      <Pressable style={styles.editorBackdrop} onPress={attemptClose} />
      <View style={[styles.editorSheet, { backgroundColor: theme.paperElevated, paddingBottom: sheetBottomInset }]}>
        <Text style={[styles.editorTitle, { color: theme.ink, fontFamily }]}>卡片批注</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          placeholder="写下你的理解、疑问或行动点"
          placeholderTextColor={palette.inkMuted}
          style={[styles.editorInput, { fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
          textAlignVertical="top"
        />
        <View style={styles.editorActions}>
          <AppButton label="取消" variant="light" onPress={attemptClose} />
          <AppButton label="保存批注" icon="checkmark-outline" loading={saving} onPress={() => { void persist(); }} />
        </View>
      </View>
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
    gap: 12,
  },
  editorTitle: { fontSize: 22, fontWeight: '900' },
  editorInput: { minHeight: 150, borderRadius: radius.lg, padding: 14, fontSize: 16, lineHeight: 23 },
  editorActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
});
