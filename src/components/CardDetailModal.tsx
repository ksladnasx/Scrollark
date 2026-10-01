import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CardRecord, Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';
import { KnowledgeCard } from './KnowledgeCard';

type Props = {
  card: CardRecord | null;
  settings: Settings;
  onClose: () => void;
  // 提供时卡片详情显示「编辑批注」入口；编辑器由页面层级渲染，
  // 避免在 Modal 对话框窗口里处理键盘（edge-to-edge 下会被系统平移顶出屏幕）。
  onEditAnnotation?: (card: CardRecord) => void;
  // 提供时右上角显示「分享」按钮。分享海报必须挂在页面/App 层级渲染
  // （整屏截图只能捕获主窗口，Modal 是独立 Dialog 窗口截不到），
  // 因此这里只负责关闭弹窗并把卡片交给调用方。
  onShare?: (card: CardRecord) => void;
};

export function CardDetailModal({ card, settings, onClose, onEditAnnotation, onShare }: Props) {
  const theme = useAppTheme();
  return (
    <Modal visible={Boolean(card)} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.wrap, { backgroundColor: theme.card }]} edges={['top', 'bottom']}>
        {card ? (
          <KnowledgeCard
            card={card}
            settings={settings}
            onClose={onClose}
            titleInHeader
            onEditAnnotation={onEditAnnotation ? () => onEditAnnotation(card) : undefined}
          />
        ) : null}
        {card ? (
          onShare ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="分享卡片"
              onPress={() => { onClose(); onShare(card); }}
              style={({ pressed }) => [styles.cornerButton, pressed && styles.pressed]}
            >
              <Ionicons name="share-social-outline" size={22} color="#FFFFFF" />
            </Pressable>
          ) : (
            <Pressable onPress={onClose} style={({ pressed }) => [styles.cornerButton, pressed && styles.pressed]}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
          )
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFFFF' },
  cornerButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
