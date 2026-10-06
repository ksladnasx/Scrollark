import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FolderRecord } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';

export type AppSelectOption = { key: string; label: string; hint?: string };

type Props = {
  visible: boolean;
  title: string;
  options: AppSelectOption[];
  selectedKey: string | null;
  // 普通模式：点中选项立即回传并收起（表单内的快捷下拉）。
  onSelect?: (key: string) => void;
  onClose: () => void;
  // 可选的底部动作项（如「新建分组…」）：点按不关闭弹层，由调用方接管后续流程。
  actionLabel?: string;
  onAction?: () => void;
  // 确认模式：点选项只更新高亮，按「完成」才回传并收起（选择会触发后续流程时使用，如导入文档）。
  onConfirm?: (key: string) => void;
};

// 下拉选择弹层：所有「选择文件夹」一类位置选择统一走这里（不做自由输入）。
// 样式沿用知识库页的底部弹层。
export function AppSelectSheet({ visible, title, options, selectedKey, onSelect, onClose, actionLabel, onAction, onConfirm }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  // 确认模式下跟踪待确认的选择；每次打开时与外部选中值同步。
  const [pendingKey, setPendingKey] = React.useState<string | null>(selectedKey);
  React.useEffect(() => {
    if (visible) setPendingKey(selectedKey);
  }, [visible, selectedKey]);
  const activeKey = onConfirm ? pendingKey : selectedKey;

  const handleSelect = (key: string) => {
    if (onConfirm) {
      setPendingKey(key);
      return;
    }
    onSelect?.(key);
    onClose();
  };

  const handleDone = () => {
    if (onConfirm) {
      const key = pendingKey ?? selectedKey;
      onClose();
      if (key) onConfirm(key);
      return;
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* 点击遮罩关闭：放在弹层之下，触摸不会传给内容区 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.grabber, { backgroundColor: theme.inkMuted }]} />
          <View style={[styles.header, { borderColor: theme.line }]}>
            <Text numberOfLines={1} style={[styles.title, { color: theme.ink }]}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={handleDone} style={styles.done}>
              <Text style={[styles.doneText, { color: theme.accent }]}>完成</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner} showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const selected = option.key === activeKey;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => handleSelect(option.key)}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                >
                  <View style={styles.optionIcon}>
                    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={selected ? theme.accent : theme.inkMuted} />
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text numberOfLines={1} style={[styles.optionLabel, { color: theme.ink }]}>{option.label}</Text>
                    {option.hint ? <Text numberOfLines={1} style={[styles.optionHint, { color: theme.inkMuted }]}>{option.hint}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
            {options.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.inkMuted }]}>暂无可选项，请获取模型列表后继续</Text>
            ) : null}
            {actionLabel && onAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
                onPress={onAction}
                style={({ pressed }) => [styles.actionRow, { borderColor: theme.line }, pressed && styles.pressed]}
              >
                <Ionicons name="add-circle-outline" size={18} color={theme.blue} />
                <Text style={[styles.actionText, { color: theme.blue }]}>{actionLabel}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// 表单里的下拉框字段：显示当前值 + 下拉箭头，点按后弹出 AppSelectSheet。
export function SelectField({
  value,
  placeholder,
  onPress,
  icon = 'folder-outline',
}: {
  value: string;
  placeholder: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={placeholder}
      onPress={onPress}
      style={({ pressed }) => [styles.field, { backgroundColor: theme.paperSoft, borderColor: theme.line }, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={16} color={theme.inkMuted} />
      <Text numberOfLines={1} style={[styles.fieldValue, { color: theme.ink }]}>{value || placeholder}</Text>
      <Ionicons name="chevron-down" size={16} color={theme.inkMuted} />
    </Pressable>
  );
}

// 文件夹选项的通用拼装：默认文件夹排在最前并带「默认」提示。
export function folderSelectOptions(folders: FolderRecord[]): AppSelectOption[] {
  return folders.map((folder) => ({
    key: String(folder.id),
    label: folder.name,
    hint: folder.isDefault === 1 ? '默认 · 未选择文件夹时的兜底归属' : undefined,
  }));
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,17,15,0.5)' },
  sheet: { height: '72%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, opacity: 0.28, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 16, fontWeight: '800' },
  done: { minWidth: 40, alignItems: 'flex-end' },
  doneText: { fontSize: 15, fontWeight: '700' },
  body: { flex: 1 },
  bodyInner: { paddingVertical: 8, paddingBottom: 24 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13 },
  optionIcon: { width: 24, alignItems: 'center' },
  optionTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  optionLabel: { fontSize: 15, fontWeight: '700' },
  optionHint: { fontSize: 12, fontWeight: '600' },
  emptyText: { textAlign: 'center', fontSize: 13, fontWeight: '600', paddingVertical: 24 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 6, marginHorizontal: 16, marginBottom: 10, paddingVertical: 11, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed' },
  actionText: { fontSize: 14, fontWeight: '700' },
  field: { minHeight: 46, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldValue: { flex: 1, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});
