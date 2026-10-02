import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RingProgress } from '../components/RingProgress';
import type { Settings, Statistics } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { masteryColors, radius } from '../theme/tokens';

type Props = {
  stats: Statistics;
  settings: Settings;
  onStartReview: () => void;
  onStartAheadReview: () => void;
  onStartGet: () => void;
};

// 复习三状态小环的配色：与全局状态色一致（蓝 = 新近、琥珀 = 巩固、红 = 遗忘）。
const recentColor = '#526B78';

export function ReviewHubScreen({ stats, settings, onStartReview, onStartAheadReview, onStartGet }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  // 今日复习进度：已评级次数 /（已评级 + 当前仍到期），评过的都算进度。
  const done = stats.todayReviews;
  const total = done + stats.dueCount;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const gotTotal = Math.max(1, stats.gotCards);
  // 仪表盘配色：进行中用主题蓝，今日全部完成切换为打卡金色，避免使用墨色。
  const ringColor = total > 0 && done >= total ? '#F2B737' : theme.blue;

  // 四个状态按「最近一次反馈」划分，互斥且加总等于已 GET 数：
  // 记得 → 已掌握；模糊记得 → 需要复习；不记得 → 遗忘；GET 后还没评过级 → 新近记忆。
  const stateRings = [
    { key: 'recent', label: '新近记忆', count: stats.recentCount, color: recentColor },
    { key: 'fuzzy', label: '需要复习', count: stats.fuzzyCount, color: masteryColors[2] },
    { key: 'clear', label: '已掌握', count: stats.clearCount, color: masteryColors[3] },
    { key: 'forgot', label: '遗忘', count: stats.forgotCount, color: masteryColors[1] },
  ];

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>

      <View style={[styles.heroCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
        <Text style={[styles.heroLabel, { color: theme.inkMuted, fontFamily }]}>今日复习进度</Text>
        <RingProgress size={150} strokeWidth={13} progress={total > 0 ? done / total : 0} color={ringColor} trackColor={theme.paperSoft}>
          <View style={styles.ringCenter}>
            <Text style={[styles.ringValue, { color: theme.ink, fontFamily }]}>{done}</Text>
            <Text style={[styles.ringTotal, { color: theme.inkMuted, fontFamily }]}>/ {total}</Text>
          </View>
        </RingProgress>
        <Text style={[styles.heroCaption, { color: theme.ink, fontFamily }]}>
          {total > 0 ? `已完成 ${pct}%` : '今天还没有复习记录'}
        </Text>
        <Text style={[styles.heroMeta, { color: theme.inkMuted, fontFamily }]}>
          {stats.dueCount > 0
            ? `今日待复习 ${stats.dueCount} 张 · 到期的评过都算进度`
            : total > 0
              ? '今日到期卡片已全部复习完'
              : '到期后这里会显示今日进度'}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
        <View style={styles.cardHead}>
          <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>复习状态</Text>
          <Text style={[styles.cardHeadMeta, { color: theme.inkMuted, fontFamily }]}>占已 GET {stats.gotCards} 张</Text>
        </View>
        <View style={styles.stateRow}>
          {stateRings.map((ring) => (
            <View key={ring.key} style={styles.stateItem}>
              <RingProgress size={64} strokeWidth={6} progress={ring.count / gotTotal} color={ring.color} trackColor={theme.paperSoft}>
                <Text style={[styles.stateValue, { color: theme.ink, fontFamily }]}>{ring.count}</Text>
              </RingProgress>
              <Text style={[styles.stateLabel, { color: theme.inkMuted, fontFamily }]}>{ring.label}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.stateHint, { color: theme.inkMuted, fontFamily }]}>
          状态按最近一次反馈划分：记得 → 已掌握 · 模糊记得 → 需要复习 · 不记得 → 遗忘；刚 GET 还没评过级的为新近记忆。
        </Text>
        {stats.weakCount > 0 ? (
          <Text style={[styles.weakNote, { color: theme.inkMuted, fontFamily }]}>遗忘过的卡片在到期复习时排最前面，直到重新记住。</Text>
        ) : null}
      </View>

      <View style={[styles.card, styles.actionCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="提前复习"
          onPress={onStartAheadReview}
          style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
        >
          <View style={[styles.actionIcon, { backgroundColor: theme.paperSoft }]}>
            <Ionicons name="time-outline" size={16} color={theme.accent} />
          </View>
          <View style={styles.actionTextWrap}>
            <Text style={[styles.actionTitle, { color: theme.ink, fontFamily }]}>提前复习</Text>
            <Text style={[styles.actionMeta, { color: theme.inkMuted, fontFamily }]}>主动复习还未到期的知识</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={theme.inkMuted} />
        </Pressable>
        <View style={[styles.actionDivider, { backgroundColor: theme.line }]} />
        {stats.dueCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="继续复习"
            onPress={onStartReview}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
          >
            <View style={[styles.actionIcon, { backgroundColor: theme.paperSoft }]}>
              <Ionicons name="repeat" size={16} color={theme.accent} />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={[styles.actionTitle, { color: theme.ink, fontFamily }]}>继续复习</Text>
              <Text style={[styles.actionMeta, { color: theme.inkMuted, fontFamily }]}>还有 {stats.dueCount} 张到期卡片</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={theme.inkMuted} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="去 GET 新卡"
            onPress={onStartGet}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
          >
            <View style={[styles.actionIcon, { backgroundColor: theme.paperSoft }]}>
              <Ionicons name="flash-outline" size={16} color={theme.accent} />
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={[styles.actionTitle, { color: theme.ink, fontFamily }]}>去 GET 新卡</Text>
              <Text style={[styles.actionMeta, { color: theme.inkMuted, fontFamily }]}>继续获取新的知识</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={theme.inkMuted} />
          </Pressable>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
        <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>复习是怎么安排的？</Text>
        <Text style={[styles.bodyText, { color: theme.inkMuted, fontFamily }]}>
          系统按遗忘曲线自动调度：GET 的卡片第二天进入第一次复习；评「记得」把间隔逐步拉长（1 / 3 / 7 / 16 / 35 天），评「模糊记得」缩短间隔，评「不记得」明天再来。复习按到期卡片进行，复习完成后可以继续去 GET 新卡。
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 140, gap: 14 },
  heroCard: { borderRadius: radius.xl, borderWidth: 1, padding: 22, alignItems: 'center', gap: 8 },
  heroLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  ringCenter: { alignItems: 'center' },
  ringValue: { fontSize: 38, lineHeight: 42, fontWeight: '900', letterSpacing: -1 },
  ringTotal: { fontSize: 14, fontWeight: '800' },
  heroCaption: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  heroMeta: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: 18, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeadMeta: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  stateRow: { flexDirection: 'row', gap: 10 },
  stateItem: { flex: 1, alignItems: 'center', gap: 7 },
  stateValue: { fontSize: 17, fontWeight: '900' },
  stateLabel: { fontSize: 11, fontWeight: '800' },
  stateHint: { fontSize: 11, lineHeight: 18, fontWeight: '600' },
  weakNote: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  actionCard: { paddingVertical: 6, paddingHorizontal: 16, gap: 0 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  actionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionTextWrap: { flex: 1, gap: 2 },
  actionTitle: { fontSize: 15, fontWeight: '900' },
  actionMeta: { fontSize: 12, fontWeight: '600' },
  actionDivider: { height: StyleSheet.hairlineWidth },
  bodyText: { fontSize: 13, lineHeight: 22 },
  pressed: { opacity: 0.72 },
});
