import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CardRecord, Settings } from '../domain/types';
import { isCustomCard } from '../data/repository';
import { showAlert } from './AppAlert';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';
import { formatNextReview, cardReviewStatus } from '../utils/review';
import { KnowledgeCard } from './KnowledgeCard';

type Props = {
  card: CardRecord | null;
  settings: Settings;
  onClose: () => void;
  // 提供时卡片详情显示「编辑批注」入口；编辑器由页面层级渲染，
  // 避免在 Modal 对话框窗口里处理键盘（edge-to-edge 下会被系统平移顶出屏幕）。
  onEditAnnotation?: (card: CardRecord) => void;
  // 提供时手写卡片显示「编辑卡片」入口（正文/标题/分组编辑器由页面层级渲染）。
  onEdit?: (card: CardRecord) => void;
  // 提供时右上角显示「分享」按钮。分享海报必须挂在页面/App 层级渲染
  // （整屏截图只能捕获主窗口，Modal 是独立 Dialog 窗口截不到），
  // 因此这里只负责关闭弹窗并把卡片交给调用方。
  onShare?: (card: CardRecord) => void;
  // 提供且卡片已 GET 时显示「重置进度」：清评级与间隔档位（持久化与列表刷新由调用方负责）。
  onResetProgress?: (card: CardRecord) => void;
  // 提供时右上角显示「删除」按钮（所有卡片通用），位于分享按钮左侧；
  // 删除的持久化与列表刷新由调用方负责。
  onDelete?: (card: CardRecord) => void;
};

export function CardDetailModal({ card, settings, onClose, onEditAnnotation, onEdit, onShare, onResetProgress, onDelete }: Props) {
  const theme = useAppTheme();
  const status = card ? cardReviewStatus(card) : null;

  const confirmReset = React.useCallback((target: CardRecord) => {
    showAlert({
      title: '重置复习进度',
      message: '清空这张卡的评级与复习间隔，并把它放回今天的到期复习，马上重新评级？',
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '重置', style: 'destructive', onPress: () => { onClose(); onResetProgress?.(target); } },
      ],
    });
  }, [onClose, onResetProgress]);

  const confirmDelete = React.useCallback((target: CardRecord) => {
    showAlert({
      title: '删除这张卡片？',
      message: '卡片正文、配图与批注会一并删除，无法恢复。',
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => { onClose(); onDelete?.(target); } },
      ],
    });
  }, [onClose, onDelete]);

  const editable = Boolean(card && onEdit && isCustomCard(card));

  return (
    <Modal visible={Boolean(card)} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.wrap, { backgroundColor: theme.card }]} edges={['top', 'bottom']}>
        {card && status ? (
          <KnowledgeCard
            card={card}
            settings={settings}
            onClose={onClose}
            titleInHeader
            onEditAnnotation={onEditAnnotation ? () => onEditAnnotation(card) : undefined}
            footer={
              <View style={styles.statusFooter}>
                <View style={styles.statusMain}>
                  <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                  <Text style={[styles.statusText, { color: theme.inkMuted }]} numberOfLines={1}>复习状态 · {status.label}</Text>
                </View>
                <Text style={[styles.statusText, { color: theme.inkMuted }]} numberOfLines={1}>下次复习 {formatNextReview(card.nextReviewAt)}</Text>
                {onResetProgress && card.isGot ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="重置复习进度"
                    onPress={() => confirmReset(card)}
                    hitSlop={6}
                    style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="refresh-circle-outline" size={15} color={theme.inkMuted} />
                    <Text style={[styles.resetText, { color: theme.inkMuted }]}>重置</Text>
                  </Pressable>
                ) : null}
              </View>
            }
          />
        ) : null}
        {card ? (
          // 卡片操作区（统一布局）：[编辑（手写卡）] [删除（红色危险）] [分享]，
          // 删除固定在分享左侧；没有分享按钮时末位回退为关闭。
          <View style={styles.cornerCluster}>
            {editable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="编辑这张卡片"
                onPress={() => { onClose(); onEdit?.(card); }}
                style={({ pressed }) => [styles.cornerButton, pressed && styles.pressed]}
              >
                <Ionicons name="create-outline" size={20} color="#FFFFFF" />
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="删除这张卡片"
                onPress={() => confirmDelete(card)}
                style={({ pressed }) => [styles.cornerButton, styles.deleteButton, { backgroundColor: theme.red }, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              </Pressable>
            ) : null}
            {onShare ? (
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
            )}
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFFFF' },
  statusFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 12 },
  statusMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  resetText: { fontSize: 12, fontWeight: '800' },
  cornerCluster: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cornerButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  deleteButton: {
    borderColor: 'rgba(255,255,255,0.42)',
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
