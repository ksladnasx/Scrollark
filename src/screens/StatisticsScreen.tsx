import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Statistics } from '../domain/types';
import { palette, radius } from '../theme/tokens';

export function StatisticsScreen({ stats }: { stats: Statistics }) {
  const max = Math.max(1, ...stats.week.map((d) => d.count));
  const progress = stats.totalCards > 0 ? Math.round((stats.gotCards / stats.totalCards) * 100) : 0;

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Statistics</Text>
        <Text style={styles.title}>统计</Text>
        <Text style={styles.subtitle}>统计来自真实 get 事件，不使用写死数据。</Text>
      </View>

      <View style={styles.heroStat}>
        <Text style={styles.heroValue}>{stats.todayGets}</Text>
        <Text style={styles.heroLabel}>今日吸收卡片</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
        <Text style={styles.progressText}>总体进度 {progress}% · {stats.gotCards}/{stats.totalCards}</Text>
      </View>

      <View style={styles.grid}>
        <Metric label="文档" value={stats.documents} />
        <Metric label="卡片" value={stats.totalCards} />
        <Metric label="收藏" value={stats.favoriteCards} />
        <Metric label="批注" value={stats.annotatedCards} />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>最近 7 天 get 趋势</Text>
        <View style={styles.chart}>
          {stats.week.map((day, index) => (
            <View key={`week-${day.day}-${index}`} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: `${Math.max(7, (day.count / max) * 100)}%` }]} />
              </View>
              <Text style={styles.barValue}>{day.count}</Text>
              <Text style={styles.barLabel}>{day.day}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 120, gap: 14 },
  header: { gap: 7 },
  eyebrow: { color: palette.inkMuted, textTransform: 'uppercase', fontWeight: '900', letterSpacing: 1.2, fontSize: 12 },
  title: { color: palette.ink, fontSize: 38, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { color: palette.inkMuted, fontSize: 15, lineHeight: 23 },
  heroStat: { borderRadius: radius.xl, backgroundColor: palette.accent, padding: 22, gap: 8 },
  heroValue: { color: palette.paper, fontSize: 64, fontWeight: '900', letterSpacing: -2.2 },
  heroLabel: { color: 'rgba(255,249,238,0.82)', fontSize: 16, fontWeight: '800' },
  progressTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: palette.accentSoft, borderRadius: 4 },
  progressText: { color: 'rgba(255,249,238,0.72)', fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', borderRadius: radius.lg, backgroundColor: palette.paperElevated, borderWidth: 1, borderColor: palette.line, padding: 16 },
  metricValue: { color: palette.ink, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  metricLabel: { color: palette.inkMuted, fontSize: 12, fontWeight: '800' },
  chartCard: { borderRadius: radius.xl, backgroundColor: palette.paperElevated, borderWidth: 1, borderColor: palette.line, padding: 18, gap: 14 },
  sectionTitle: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  chart: { height: 190, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barColumn: { flex: 1, alignItems: 'center', gap: 5 },
  barTrack: { height: 124, width: 16, borderRadius: 8, backgroundColor: palette.paperSoft, justifyContent: 'flex-end', overflow: 'hidden' },
  bar: { width: 16, borderRadius: 8, backgroundColor: palette.ink },
  barValue: { color: palette.ink, fontSize: 12, fontWeight: '900' },
  barLabel: { color: palette.inkMuted, fontSize: 10, fontWeight: '700' },
});
