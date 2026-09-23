import React from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { Statistics } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius } from '../theme/tokens';

export function StatisticsScreen({ stats }: { stats: Statistics }) {
  const theme = useAppTheme();
  const max = Math.max(1, ...stats.week.map((d) => d.count));
  const progress = stats.totalCards > 0 ? Math.round((stats.gotCards / stats.totalCards) * 100) : 0;
  const [chartWidth, setChartWidth] = React.useState(0);
  const chartHeight = 128;
  const points = stats.week.map((day, index) => {
    const x = stats.week.length <= 1 || chartWidth <= 0 ? 0 : (chartWidth / (stats.week.length - 1)) * index;
    const y = chartHeight - Math.max(8, (day.count / max) * (chartHeight - 16));
    return { ...day, x, y };
  });
  const onChartLayout = React.useCallback((event: LayoutChangeEvent) => {
    setChartWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>

      <View style={[styles.heroStat, { backgroundColor: theme.accent }] }>
        <Text style={[styles.heroValue, { color: theme.paper }]}>{stats.todayGets}</Text>
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

      <View style={[styles.chartCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }] }>
        <Text style={[styles.sectionTitle, { color: theme.ink }]}>最近 7 天 get 趋势</Text>
        <View style={styles.lineChart} onLayout={onChartLayout}>
          <View style={[styles.linePlot, { height: chartHeight }]}>
            {[0, 1, 2].map((line) => <View key={`grid-${line}`} style={[styles.gridLine, { top: (chartHeight / 2) * line, backgroundColor: theme.line }]} />)}
            {chartWidth > 0 ? points.slice(0, -1).map((point, index) => {
              const next = points[index + 1];
              const dx = next.x - point.x;
              const dy = next.y - point.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = `${Math.atan2(dy, dx)}rad`;
              return (
                <View
                  key={`trend-line-${point.day}-${next.day}`}
                  style={[styles.trendLine, { left: (point.x + next.x) / 2 - length / 2, top: (point.y + next.y) / 2 - 1.5, width: length, backgroundColor: theme.ink, transform: [{ rotate: angle }] }]}
                />
              );
            }) : null}
            {chartWidth > 0 ? points.map((point) => (
              <View key={`trend-point-${point.day}`} style={[styles.trendPoint, { left: point.x - 5, top: point.y - 5, backgroundColor: theme.accentSoft, borderColor: theme.ink }]} />
            )) : null}
          </View>
          <View style={styles.lineLabels}>
            {points.map((day, index) => (
              <View key={`week-label-${day.day}-${index}`} style={styles.lineLabelItem}>
                <Text style={[styles.lineValue, { color: theme.ink }]}>{day.count}</Text>
                <Text style={[styles.lineLabel, { color: theme.inkMuted }]}>{day.day}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.metric, { backgroundColor: theme.paperElevated, borderColor: theme.line }] }>
      <Text style={[styles.metricValue, { color: theme.ink }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.inkMuted }]}>{label}</Text>
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
  lineChart: { gap: 10 },
  linePlot: { position: 'relative', width: '100%' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.72 },
  trendLine: { position: 'absolute', height: 3, borderRadius: 2 },
  trendPoint: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  lineLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabelItem: { flex: 1, alignItems: 'center', gap: 3 },
  lineValue: { color: palette.ink, fontSize: 12, fontWeight: '900' },
  lineLabel: { color: palette.inkMuted, fontSize: 10, fontWeight: '700' },
});
