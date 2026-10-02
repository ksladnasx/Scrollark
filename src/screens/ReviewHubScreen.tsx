import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
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

// 复习状态的三个阶段：随评级与间隔在三条状态间流转，而不是固定分类。
const reviewStates: { label: string; countKey: keyof Statistics; color: string; hint: string }[] = [
  { label: '新近记忆', countKey: 'recentCount', color: '#526B78', hint: '刚 GET，等待第一次复习' },
  { label: '巩固中', countKey: 'strengtheningCount', color: masteryColors[2], hint: '间隔 1-7 天，反复巩固' },
  { label: '已掌握', countKey: 'masteredCount', color: masteryColors[3], hint: '间隔 16 天以上' },
];

export function ReviewHubScreen({ stats, settings, onStartReview, onStartAheadReview, onStartGet }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  const hasDue = stats.dueCount > 0;

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>

      <View style={[styles.heroCard, { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.heroLabel, { color: theme.ink, fontFamily }]}>今日待复习</Text>
        <View style={styles.heroValueRow}>
          <Text style={[styles.heroValue, { color: theme.ink, fontFamily }]}>{stats.dueCount}</Text>
          <Text style={[styles.heroUnit, { color: theme.ink, fontFamily }]}>张</Text>
        </View>
        {hasDue ? (
          <>
            <AppButton label="开始复习" icon="repeat" variant="dark" onPress={onStartReview} style={styles.heroButton} />
            {stats.dueWeakCount > 0 ? (
              <Text style={[styles.heroMeta, { color: theme.ink, fontFamily }]}>其中 {stats.dueWeakCount} 张曾忘记过，会优先出现。</Text>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.doneRow}>
              <Ionicons name="checkmark-done-circle" size={18} color={masteryColors[3]} />
              <Text style={[styles.doneText, { color: theme.ink, fontFamily }]}>今天的复习已经完成</Text>
            </View>
            {stats.tomorrowCount > 0 ? (
              <Text style={[styles.heroMeta, { color: theme.ink, fontFamily }]}>明天预计 {stats.tomorrowCount} 张到期，记得回来。</Text>
            ) : null}
            <AppButton label="去 GET 新卡" icon="flash-outline" variant="light" onPress={onStartGet} style={styles.heroButton} />
          </>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
        <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>复习状态</Text>
        <View style={styles.stateRow}>
          {reviewStates.map((state) => (
            <View key={state.label} style={styles.stateItem}>
              <View style={[styles.stateDot, { backgroundColor: state.color }]} />
              <Text style={[styles.stateValue, { color: theme.ink, fontFamily }]}>{stats[state.countKey] as number}</Text>
              <Text style={[styles.stateLabel, { color: theme.inkMuted, fontFamily }]}>{state.label}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.stateHint, { color: theme.inkMuted, fontFamily }]}>
          {reviewStates.map((state) => `${state.label}：${state.hint}`).join('；')}。
        </Text>
        {stats.weakCount > 0 ? (
          <Text style={[styles.weakNote, { color: theme.inkMuted, fontFamily }]}>有 {stats.weakCount} 张卡片忘记过，复习时会排在最前面。</Text>
        ) : null}
        <View style={[styles.aheadBox, { backgroundColor: theme.paperSoft }]}>
          <View style={styles.aheadTextWrap}>
            <Text style={[styles.aheadTitle, { color: theme.ink, fontFamily }]}>提前复习</Text>
            <Text style={[styles.aheadMeta, { color: theme.inkMuted, fontFamily }]}>不用等到期，新近记忆和巩固中的卡片现在就能过一遍。</Text>
          </View>
          <AppButton label="去复习" icon="time-outline" variant="dark" onPress={onStartAheadReview} style={styles.aheadButton} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
        <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily }]}>复习是怎么安排的？</Text>
        <Text style={[styles.bodyText, { color: theme.inkMuted, fontFamily }]}>
          系统按遗忘曲线自动调度，你不需要自己安排复习内容：GET 的卡片第二天进入第一次复习；评「记得」会把间隔逐步拉长（1 / 3 / 7 / 16 / 35 天），评「模糊记得」缩短间隔，评「不记得」则明天再来。到期的卡片会自动出现在下一轮复习里，也可以随时用「提前复习」过一遍新近记忆和巩固中的卡片。
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 140, gap: 14 },
  heroCard: { borderRadius: radius.xl, backgroundColor: '#D6C2A0', padding: 22, gap: 10 },
  heroLabel: { fontSize: 14, fontWeight: '800', opacity: 0.78 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroValue: { fontSize: 64, lineHeight: 70, fontWeight: '900', letterSpacing: -2 },
  heroUnit: { fontSize: 18, fontWeight: '800', opacity: 0.7 },
  heroButton: { alignSelf: 'stretch', marginTop: 4 },
  heroMeta: { fontSize: 12, fontWeight: '700', opacity: 0.78 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneText: { fontSize: 15, fontWeight: '800' },
  card: { borderRadius: radius.xl, backgroundColor: '#FFF9EE', borderWidth: 1, borderColor: '#DED2BE', padding: 18, gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '900' },
  stateRow: { flexDirection: 'row', gap: 10 },
  stateItem: { flex: 1, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.03)', paddingVertical: 14, alignItems: 'center', gap: 3 },
  stateDot: { width: 9, height: 9, borderRadius: 5, marginBottom: 3 },
  stateValue: { fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  stateLabel: { fontSize: 12, fontWeight: '800' },
  stateHint: { fontSize: 11, lineHeight: 18, fontWeight: '600' },
  weakNote: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  aheadBox: { borderRadius: radius.lg, padding: 14, gap: 10 },
  aheadTextWrap: { gap: 3 },
  aheadTitle: { fontSize: 14, fontWeight: '900' },
  aheadMeta: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  aheadButton: { alignSelf: 'flex-start' },
  bodyText: { fontSize: 13, lineHeight: 22 },
});
