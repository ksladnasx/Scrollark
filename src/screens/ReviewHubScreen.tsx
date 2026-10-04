import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Animated, Easing, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnnotationEditor } from '../components/AnnotationEditor';
import { AppButton } from '../components/AppButton';
import { CardDetailModal } from '../components/CardDetailModal';
import { KnowledgeCard } from '../components/KnowledgeCard';
import { RingProgress } from '../components/RingProgress';
import type { CardRecord, Settings, Statistics } from '../domain/types';
import { getLastReviewSession, getUpcomingReviewCounts, listCardsByStatus, resetCardReviewProgress, deleteCard, type LastReviewSession, type ReviewStatusFilter } from '../data/repository';
import { setOverlaySlot } from '../components/AppOverlay';
import { formatRelativeDayLabel } from '../utils/date';
import { useAppTheme } from '../theme/ThemeContext';
import { masteryColors, radius } from '../theme/tokens';
import { Empty } from './KnowledgeScreen';

type Props = {
  stats: Statistics;
  settings: Settings;
  onStartReview: () => void;
  onStartAheadReview: () => void;
  onStartGet: () => void;
  // 提供时详情弹窗右上角显示分享入口（分享海报浮层由 App 层渲染）。
  onShare?: (card: CardRecord) => void;
  // 下钻列表里的批注保存后通知 App 层刷新统计。
  onDataChanged?: () => void;
};

// 复习四状态的展示口径：与状态仪表、我的页掌握程度分布一致（按最近一次反馈划分）。
const STATUS_META: { key: ReviewStatusFilter; label: string; color: string }[] = [
  { key: 'recent', label: '新近记忆', color: '#526B78' },
  { key: 'fuzzy', label: '需要复习', color: masteryColors[2] },
  { key: 'clear', label: '已掌握', color: masteryColors[3] },
  { key: 'forgot', label: '遗忘', color: masteryColors[1] },
];

const WEEKDAY_LETTERS = ['日', '一', '二', '三', '四', '五', '六'];
const CARD_ITEM_HEIGHT = 360;
const CARD_ITEM_GAP = 10;

export function ReviewHubScreen({ stats, settings, onStartReview, onStartAheadReview, onStartGet, onShare, onDataChanged }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  // 今日复习进度：已评级次数 /（已评级 + 当前仍到期），评过的都算进度。
  const done = stats.todayReviews;
  const total = done + stats.dueCount;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const gotTotal = Math.max(1, stats.gotCards);
  // 仪表盘配色：进行中用主题蓝，今日全部完成切换为打卡金色，避免使用墨色。
  const ringColor = total > 0 && done >= total ? '#F2B737' : theme.blue;

  const statusCounts: Record<ReviewStatusFilter, number> = {
    recent: stats.recentCount,
    fuzzy: stats.fuzzyCount,
    clear: stats.clearCount,
    forgot: stats.forgotCount,
  };

  // 上次复习小结：从 rate-* 事件聚合最近一轮（评级发生/今天有新评级时刷新）。
  const [lastReview, setLastReview] = React.useState<LastReviewSession | null>(null);
  React.useEffect(() => {
    let alive = true;
    getLastReviewSession()
      .then((session) => {
        if (alive) setLastReview(session);
      })
      .catch(() => {
        if (alive) setLastReview(null);
      });
    return () => {
      alive = false;
    };
  }, [stats.todayReviews]);

  // 状态下钻：点状态环拉取该状态的卡片列表。详情弹窗与批注编辑器都渲染在页面层级——
  // 批注编辑器不做原生 Modal（键盘避让要求它留在页面树里，见 AnnotationEditor 的说明），
  // 编辑期间临时隐藏列表弹窗，结束后回到列表再叠开详情，与收藏页的流程一致。
  const [statusOpen, setStatusOpen] = React.useState<ReviewStatusFilter | null>(null);
  const [statusCards, setStatusCards] = React.useState<CardRecord[] | null>(null);
  const [selectedCardId, setSelectedCardId] = React.useState<number | null>(null);
  const [editingCardId, setEditingCardId] = React.useState<number | null>(null);

  const openStatus = React.useCallback(async (status: ReviewStatusFilter) => {
    setStatusOpen(status);
    setStatusCards(null);
    setSelectedCardId(null);
    setEditingCardId(null);
    try {
      setStatusCards(await listCardsByStatus(status, 200));
    } catch {
      setStatusCards([]);
    }
  }, []);

  const reloadStatus = React.useCallback(async () => {
    if (!statusOpen) return;
    try {
      setStatusCards(await listCardsByStatus(statusOpen, 200));
    } catch {
      // 刷新失败时保留现有列表内容。
    }
  }, [statusOpen]);

  const closeStatus = React.useCallback(() => {
    setStatusOpen(null);
    setStatusCards(null);
    setSelectedCardId(null);
    setEditingCardId(null);
  }, []);

  // 重置进度：写库 → 刷新下钻列表 → 通知 App 层刷新统计与状态环。
  const handleResetProgress = React.useCallback(async (card: CardRecord) => {
    await resetCardReviewProgress(card.id);
    await reloadStatus();
    onDataChanged?.();
  }, [onDataChanged, reloadStatus]);

  // 删除单张卡片（手写卡与文档生成的卡通用）：写库 → 刷新下钻列表 → 通知 App 层刷新统计。
  const handleDeleteCard = React.useCallback(async (card: CardRecord) => {
    await deleteCard(card.id);
    await reloadStatus();
    onDataChanged?.();
  }, [onDataChanged, reloadStatus]);

  const selectedCard = selectedCardId === null ? null : statusCards?.find((card) => card.id === selectedCardId) ?? null;
  const editingCard = editingCardId === null ? null : statusCards?.find((card) => card.id === editingCardId) ?? null;

  // 编辑流程与收藏页一致：详情收起 → 屏幕层级编辑器弹出 → 结束后回到详情。
  const handleEditorClose = React.useCallback(() => {
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId]);

  const handleEditorSaved = React.useCallback(() => {
    void reloadStatus();
    onDataChanged?.();
    if (editingCardId !== null) setSelectedCardId(editingCardId);
    setEditingCardId(null);
  }, [editingCardId, onDataChanged, reloadStatus]);

  // 批注编辑浮层经传送门渲染到 App 根部（盖住悬浮 Tab 栏），本页每次渲染同步最新节点。
  React.useEffect(() => {
    setOverlaySlot('reviewhub-annotation', () => (
      editingCard ? (
        <AnnotationEditor card={editingCard} settings={settings} onClose={handleEditorClose} onSaved={handleEditorSaved} />
      ) : null
    ));
    return () => setOverlaySlot('reviewhub-annotation', null);
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper }}>
      <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>

        <View style={[styles.heroCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          {/* 上排：进度环 → 虚指示线 → 百分比（小号弱化）→ 操作按钮；底部为待复习说明 */}
          <View style={styles.heroTop}>
            <RingProgress size={100} strokeWidth={10} progress={total > 0 ? done / total : 0} color={ringColor} trackColor={theme.paperSoft}>
              <View style={styles.ringCenter}>
                <Text style={[styles.ringValue, { color: theme.ink, fontFamily }]}>{done}</Text>
                <Text style={[styles.ringTotal, { color: theme.inkMuted, fontFamily }]}>/ {total}</Text>
              </View>
            </RingProgress>
            <View style={[styles.heroLeader, { borderTopColor: theme.line }]} />
            <Text style={[styles.heroPct, { color: theme.inkMuted, fontFamily }]}>{total > 0 ? `${pct}%` : '0%'}</Text>
            <View style={styles.heroActions}>
              <AppButton label="提前复习" icon="time-outline" variant="light" compact onPress={onStartAheadReview} style={styles.heroActionButton} />
              {stats.dueCount > 0 ? (
                <AppButton label="继续复习" icon="repeat" compact onPress={onStartReview} style={styles.heroActionButton} />
              ) : (
                <AppButton label="去 GET 新卡" icon="flash-outline" compact onPress={onStartGet} style={styles.heroActionButton} />
              )}
            </View>
          </View>
          <Text style={[styles.heroMeta, { color: theme.inkMuted, fontFamily }]}>
            {stats.dueCount > 0
              ? `今日待复习 ${stats.dueCount} 张`
              : total > 0
                ? '今日到期卡片已全部复习完'
                : '到期后这里会显示今日进度'}
          </Text>
        </View>

        {lastReview ? (
          <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>上次复习</Text>
              <Text style={[styles.cardHeadMeta, { color: theme.inkMuted, fontFamily }]}>
                {formatRelativeDayLabel(lastReview.lastAt)} · 共 {lastReview.total} 张
              </Text>
            </View>
            {/* 评级占比条：记得 / 模糊 / 不记得 三段颜色与下方统计一一对应 */}
            <LastReviewBar clear={lastReview.clear} fuzzy={lastReview.fuzzy} forgot={lastReview.forgot} trackColor={theme.paperSoft} />
            <View style={styles.lastReviewRow}>
              {([
                { label: '记得', count: lastReview.clear, color: masteryColors[3] },
                { label: '模糊', count: lastReview.fuzzy, color: masteryColors[2] },
                { label: '不记得', count: lastReview.forgot, color: masteryColors[1] },
              ]).map((item) => (
                <View key={item.label} style={styles.lastReviewStat}>
                  <Text style={[styles.lastReviewValue, { color: item.color, fontFamily }]}>{item.count}</Text>
                  <Text style={[styles.lastReviewLabel, { color: theme.inkMuted, fontFamily }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <UpcomingCard fontFamily={fontFamily} />

        <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>复习状态</Text>
            <Text style={[styles.cardHeadMeta, { color: theme.inkMuted, fontFamily }]}>占已 GET {stats.gotCards} 张</Text>
          </View>
          <View style={styles.stateRow}>
            {STATUS_META.map((meta) => (
              <Pressable
                key={meta.key}
                accessibilityRole="button"
                accessibilityLabel={`查看${meta.label}卡片`}
                onPress={() => { void openStatus(meta.key); }}
                style={({ pressed }) => [styles.stateItem, pressed && styles.pressed]}
              >
                <RingProgress size={64} strokeWidth={6} progress={statusCounts[meta.key] / gotTotal} color={meta.color} trackColor={theme.paperSoft}>
                  <Text style={[styles.stateValue, { color: theme.ink, fontFamily }]}>{statusCounts[meta.key]}</Text>
                </RingProgress>
                <Text style={[styles.stateLabel, { color: theme.inkMuted, fontFamily }]}>{meta.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.stateHint, { color: theme.inkMuted, fontFamily }]}>
            状态按最近一次反馈划分：记得 → 已掌握 · 模糊记得 → 需要复习 · 不记得 → 遗忘；刚 GET 还没评过级的为新近记忆。点状态环可查看对应卡片。
          </Text>
          {stats.weakCount > 0 ? (
            <Text style={[styles.weakNote, { color: theme.inkMuted, fontFamily }]}>遗忘过的卡片在到期复习时排最前面，直到重新记住。</Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>复习是怎么安排的？</Text>
          <Text style={[styles.bodyText, { color: theme.inkMuted, fontFamily }]}>
            系统按遗忘曲线自动调度：GET 的卡片第二天进入第一次复习；评「记得」把间隔逐步拉长（1 / 3 / 7 / 16 / 35 天），评「模糊记得」缩短间隔，评「不记得」明天再来。复习按到期卡片进行，复习完成后可以继续去 GET 新卡。
          </Text>
        </View>
      </ScrollView>

      {/* 编辑批注时隐藏列表弹窗：编辑器是页面层级的普通浮层，压不过原生 Modal 窗口 */}
      {statusOpen && editingCardId === null ? (
        <StatusCardsModal
          status={statusOpen}
          cards={statusCards}
          settings={settings}
          onClose={closeStatus}
          onCardPress={(card) => setSelectedCardId(card.id)}
        />
      ) : null}
      <CardDetailModal
        card={selectedCard}
        settings={settings}
        onClose={() => setSelectedCardId(null)}
        onEditAnnotation={(card) => { setSelectedCardId(null); setEditingCardId(card.id); }}
        onShare={onShare}
        onResetProgress={handleResetProgress}
        onDelete={handleDeleteCard}
      />
    </View>
  );
}

// 上次复习的评级占比条：记得 / 模糊 / 不记得 三段按张数比例展开，
// 挂载与数据变化时播放一次生长动画（宽度动画不支持原生驱动，走 JS 驱动即可）。
function LastReviewBar({ clear, fuzzy, forgot, trackColor }: { clear: number; fuzzy: number; forgot: number; trackColor: string }) {
  const progress = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [clear, forgot, fuzzy, progress]);

  const total = clear + fuzzy + forgot;
  const segments = [
    { key: 'clear', value: clear, color: masteryColors[3] },
    { key: 'fuzzy', value: fuzzy, color: masteryColors[2] },
    { key: 'forgot', value: forgot, color: masteryColors[1] },
  ];

  return (
    <View style={[styles.lastReviewBarTrack, { backgroundColor: trackColor }]}>
      {segments.map((segment) => {
        if (segment.value <= 0) return null;
        return (
          <Animated.View
            key={segment.key}
            style={[
              styles.lastReviewBarSegment,
              { backgroundColor: segment.color, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${(segment.value / total) * 100}%`] }) },
            ]}
          />
        );
      })}
    </View>
  );
}

// 未来 7 天到期预览：七根小柱按本地日展示到期量，帮助预期之后几天的复习量。
function UpcomingCard({ fontFamily }: { fontFamily: string }) {
  const theme = useAppTheme();
  const [days, setDays] = React.useState<{ date: string; count: number }[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    getUpcomingReviewCounts(7)
      .then((rows) => {
        if (alive) setDays(rows);
      })
      .catch(() => {
        if (alive) setDays([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const total = days?.reduce((sum, day) => sum + day.count, 0) ?? 0;
  const max = Math.max(1, ...(days ?? []).map((day) => day.count));

  return (
    <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>未来 7 天到期</Text>
        <Text style={[styles.cardHeadMeta, { color: theme.inkMuted, fontFamily }]}>{days ? `共 ${total} 张` : '统计中…'}</Text>
      </View>
      {days === null ? (
        <ActivityIndicator style={styles.upcomingLoading} color={theme.ink} />
      ) : total === 0 ? (
        <Text style={[styles.upcomingEmpty, { color: theme.inkMuted, fontFamily }]}>未来 7 天没有卡片到期，安心巩固已有的知识。</Text>
      ) : (
        <View style={styles.upcomingRow}>
          {days.map((day, index) => {
            const date = new Date(`${day.date}T00:00:00`);
            const label = index === 0 ? '明天' : `周${WEEKDAY_LETTERS[date.getDay()] ?? ''}`;
            const barHeight = day.count > 0 ? Math.max(10, Math.round((day.count / max) * 72)) : 3;
            return (
              <View key={day.date} style={styles.upcomingItem}>
                <Text style={[styles.upcomingValue, { color: theme.ink, fontFamily }]}>{day.count > 0 ? day.count : ''}</Text>
                <View style={styles.upcomingBarTrack}>
                  <View style={[styles.upcomingBar, { height: barHeight, backgroundColor: day.count > 0 ? theme.accent : theme.paperSoft }]} />
                </View>
                <Text style={[styles.upcomingLabel, { color: theme.inkMuted, fontFamily }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// 状态下钻列表：只负责展示与转发点击；详情与批注编辑由页面层级渲染。
function StatusCardsModal({ status, cards, settings, onClose, onCardPress }: {
  status: ReviewStatusFilter;
  cards: CardRecord[] | null;
  settings: Settings;
  onClose: () => void;
  onCardPress: (card: CardRecord) => void;
}) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  const meta = STATUS_META.find((item) => item.key === status) ?? STATUS_META[0];

  const renderItem = React.useCallback(({ item }: { item: CardRecord }) => (
    <Pressable onPress={() => onCardPress(item)} style={({ pressed }) => [styles.cardWrap, pressed && styles.pressed]}>
      <KnowledgeCard card={item} settings={settings} compact />
    </Pressable>
  ), [onCardPress, settings]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalWrap, { backgroundColor: theme.paper }]} edges={['top', 'bottom']}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.line }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回复习页"
            onPress={onClose}
            style={({ pressed }) => [styles.backButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={24} color={theme.ink} />
          </Pressable>
          <View style={styles.modalTitleWrap}>
            <Text style={[styles.modalEyebrow, { color: theme.inkMuted, fontFamily }]}>复习状态</Text>
            <View style={styles.modalTitleRow}>
              <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
              <Text style={[styles.modalTitle, { color: theme.ink, fontFamily }]}>{meta.label}</Text>
            </View>
          </View>
          <Text style={[styles.modalCount, { color: theme.inkMuted, fontFamily }]}>{cards ? `${cards.length} 张` : ''}</Text>
        </View>
        {cards === null ? (
          <View style={styles.modalLoading}>
            <ActivityIndicator color={theme.ink} />
          </View>
        ) : (
          <FlatList
            style={styles.modalList}
            contentContainerStyle={styles.modalListContent}
            showsVerticalScrollIndicator={false}
            data={cards}
            keyExtractor={(card, index) => `status-card-${card.id}-${card.documentId}-${card.sortOrder}-${index}`}
            renderItem={renderItem}
            getItemLayout={(_, index) => ({ length: CARD_ITEM_HEIGHT, offset: (CARD_ITEM_HEIGHT + CARD_ITEM_GAP) * index, index })}
            ListEmptyComponent={<Empty title="这个状态还没有卡片" body="继续学习和复习，卡片会按最近一次反馈归到对应状态。" />}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 140, gap: 14 },
  heroCard: { borderRadius: radius.xl, borderWidth: 1, padding: 16, gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroLeader: { flex: 1, minWidth: 12, borderTopWidth: 2, borderStyle: 'dashed' },
  heroPct: { fontSize: 13, lineHeight: 17, fontWeight: '800' },
  heroActions: { gap: 8, alignItems: 'stretch' },
  heroActionButton: { minHeight: 42 },
  ringCenter: { flexDirection: 'row', alignItems: 'flex-end' },
  ringValue: { fontSize: 17, lineHeight: 20, fontWeight: '900', letterSpacing: -0.3 },
  ringTotal: { fontSize: 11, lineHeight: 13, fontWeight: '800', marginBottom: 1 },
  heroMeta: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: 18, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeadMeta: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  stateRow: { flexDirection: 'row', gap: 10 },
  stateItem: { flex: 1, alignItems: 'center', gap: 7, paddingVertical: 4 },
  stateValue: { fontSize: 17, fontWeight: '900' },
  stateLabel: { fontSize: 11, fontWeight: '800' },
  stateHint: { fontSize: 11, lineHeight: 18, fontWeight: '600' },
  weakNote: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  bodyText: { fontSize: 13, lineHeight: 22 },
  pressed: { opacity: 0.72 },
  upcomingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  upcomingItem: { flex: 1, alignItems: 'center', gap: 5 },
  upcomingValue: { fontSize: 12, fontWeight: '900', height: 15, lineHeight: 15 },
  upcomingBarTrack: { height: 72, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
  upcomingBar: { width: 16, borderRadius: 4 },
  upcomingLabel: { fontSize: 10, fontWeight: '700' },
  upcomingEmpty: { fontSize: 12, lineHeight: 19, fontWeight: '600' },
  upcomingLoading: { paddingVertical: 24 },
  lastReviewBarTrack: { height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden' },
  lastReviewBarSegment: { height: '100%' },
  lastReviewRow: { flexDirection: 'row', marginTop: 2 },
  lastReviewStat: { flex: 1, alignItems: 'center', gap: 2 },
  lastReviewValue: { fontSize: 17, lineHeight: 21, fontWeight: '900' },
  lastReviewLabel: { fontSize: 11, fontWeight: '700' },
  modalWrap: { flex: 1 },
  modalHeader: { height: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  modalTitleWrap: { flex: 1, gap: 1 },
  modalEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 9, height: 9, borderRadius: 4.5 },
  modalTitle: { fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.6 },
  modalCount: { fontSize: 13, fontWeight: '800' },
  modalLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalList: { flex: 1 },
  modalListContent: { padding: 18, paddingBottom: 40 },
  cardWrap: { height: CARD_ITEM_HEIGHT, marginBottom: CARD_ITEM_GAP },
});
