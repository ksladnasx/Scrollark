import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { Statistics } from '../domain/types';
import { getDailyActivity, getWeeklyComparison, type WeeklyComparison } from '../data/repository';
import { useAppTheme } from '../theme/ThemeContext';
import { masteryColors, palette, radius, type AppTheme } from '../theme/tokens';

// 趋势图气泡宽度与判定高度：气泡显示在点的上方，点太靠上时改到下方。
const TOOLTIP_WIDTH = 80;
const TOOLTIP_ABOVE_MIN_Y = 50;

// 热力图格子尺寸：13px 格子 + 3px 间距，7 行一共 109px 高。
const CELL = 13;
const CELL_GAP = 3;
const WEEKDAY_LABELS = ['一', '', '三', '', '五', '', '日'];

// 打卡强度映射为颜色深浅：次数越多越实。
function activityOpacity(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 0.28;
  if (count <= 5) return 0.5;
  if (count <= 9) return 0.72;
  return 1;
}

function HeatmapCard() {
  const theme = useAppTheme();
  const [activity, setActivity] = React.useState<{ date: string; count: number }[]>([]);

  React.useEffect(() => {
    let alive = true;
    getDailyActivity(364)
      .then((rows) => {
        if (alive) setActivity(rows);
      })
      .catch(() => {
        // 统计失败时热力图保持为空，不影响页面其它部分。
      });
    return () => {
      alive = false;
    };
  }, []);

  // 周一为每周第一行：把第一天的星期对齐成首列顶部的空格。
  const columns = React.useMemo(() => {
    if (activity.length === 0) return [];
    const first = new Date(`${activity[0].date}T00:00:00`);
    const lead = Number.isNaN(first.getTime()) ? 0 : (first.getDay() + 6) % 7;
    const cells: ({ date: string; count: number } | null)[] = [...Array.from({ length: lead }, () => null), ...activity];
    const weeks = Math.ceil(cells.length / 7);
    return Array.from({ length: weeks }, (_, week) => cells.slice(week * 7, week * 7 + 7));
  }, [activity]);

  const total = activity.reduce((sum, day) => sum + day.count, 0);
  const activeDays = activity.filter((day) => day.count > 0).length;

  return (
    <View style={[styles.chartCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }] }>
      <Text style={[styles.sectionTitle, { color: theme.ink }]}>近一年打卡热力图</Text>
      {columns.length === 0 ? (
        <Text style={[styles.heatmapMeta, { color: theme.inkMuted }]}>正在统计…</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.heatmapBody}>
            <View style={styles.weekdayColumn}>
              {WEEKDAY_LABELS.map((label, row) => (
                <View key={`weekday-${row}`} style={[styles.weekdaySlot, { height: CELL }]}>
                  {label ? <Text style={[styles.weekdayText, { color: theme.inkMuted }]}>{label}</Text> : null}
                </View>
              ))}
            </View>
            <View style={styles.heatmapGrid}>
              {columns.map((column, columnIndex) => (
                <View key={`week-${columnIndex}`} style={styles.heatmapColumn}>
                  {column.map((day, dayIndex) => (
                    <View
                      key={day ? `day-${day.date}` : `empty-${columnIndex}-${dayIndex}`}
                      style={[
                        styles.heatmapCell,
                        {
                          height: CELL,
                          width: CELL,
                          backgroundColor: day && day.count > 0 ? theme.accent : theme.paperSoft,
                          opacity: day && day.count > 0 ? activityOpacity(day.count) : 1,
                        },
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
      <View style={styles.heatmapLegend}>
        <Text style={[styles.heatmapMeta, { color: theme.inkMuted }]}>近一年 {total} 次 · {activeDays} 天有记录</Text>
        <View style={styles.legendScale}>
          <Text style={[styles.heatmapMeta, { color: theme.inkMuted }]}>少</Text>
          {[0, 2, 5, 9, 12].map((count) => (
            <View
              key={`legend-${count}`}
              style={[styles.heatmapCell, { height: CELL, width: CELL, backgroundColor: count > 0 ? theme.accent : theme.paperSoft, opacity: count > 0 ? activityOpacity(count) : 1 }]}
            />
          ))}
          <Text style={[styles.heatmapMeta, { color: theme.inkMuted }]}>多</Text>
        </View>
      </View>
    </View>
  );
}

// 掌握程度分布的四段配色：未读为中性色，其余对应复习状态色。
const newRecentColor = '#526B78';

// 学习对比：近 7 天 vs 上一个 7 天的 GET / 复习 / 打卡天数（数据源与热力图一致）。
function WeeklyCard({ goal }: { goal: number }) {
  const theme = useAppTheme();
  const [comparison, setComparison] = React.useState<WeeklyComparison | null>(null);

  React.useEffect(() => {
    let alive = true;
    getWeeklyComparison(goal)
      .then((next) => {
        if (alive) setComparison(next);
      })
      .catch(() => {
        if (alive) setComparison(null);
      });
    return () => {
      alive = false;
    };
  }, [goal]);

  const rows: { label: string; unit: string; current: number; previous: number }[] = comparison
    ? [
        { label: 'GET 卡片', unit: '张', current: comparison.thisGets, previous: comparison.lastGets },
        { label: '复习评级', unit: '次', current: comparison.thisReviews, previous: comparison.lastReviews },
        ...(goal > 0 ? [{ label: '目标打卡', unit: '天', current: comparison.thisHits, previous: comparison.lastHits }] : []),
      ]
    : [];

  return (
    <View style={[styles.goalCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
      <View style={styles.goalHead}>
        <Text style={[styles.goalTitle, { color: theme.ink }]}>学习对比</Text>
        <Text style={[styles.weekHeadMeta, { color: theme.inkMuted }]}>近 7 天 vs 上一个 7 天</Text>
      </View>
      {comparison === null ? (
        <Text style={[styles.goalMeta, { color: theme.inkMuted }]}>正在统计…</Text>
      ) : (
        rows.map((row, index) => {
          const diff = row.current - row.previous;
          const deltaColor = diff > 0 ? masteryColors[3] : diff < 0 ? theme.red : theme.inkMuted;
          return (
            <View
              key={row.label}
              style={[
                styles.weekRow,
                index < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line, paddingBottom: 12 },
              ]}
            >
              <Text style={[styles.weekLabel, { color: theme.inkMuted }]}>{row.label}</Text>
              <View style={styles.weekValueWrap}>
                <Text style={[styles.weekValue, { color: theme.ink }]}>{row.current}</Text>
                <Text style={[styles.weekUnit, { color: theme.inkMuted }]}> {row.unit}</Text>
              </View>
              <View style={styles.weekDeltaWrap}>
                {diff !== 0 ? (
                  <View style={styles.weekDeltaRow}>
                    <Ionicons name={diff > 0 ? 'arrow-up' : 'arrow-down'} size={12} color={deltaColor} />
                    <Text style={[styles.weekDeltaText, { color: deltaColor }]}>{Math.abs(diff)}</Text>
                  </View>
                ) : (
                  <Text style={[styles.weekDeltaText, { color: theme.inkMuted }]}>持平</Text>
                )}
                <Text style={[styles.weekLast, { color: theme.inkMuted }]}>上周 {row.previous}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

export function StatisticsScreen({ stats, onOpenFavorites, onShareStats }: { stats: Statistics; onOpenFavorites: () => void; onShareStats: () => void }) {
  const theme = useAppTheme();
  const max = Math.max(1, ...stats.week.map((d) => d.count));
  const progress = stats.totalCards > 0 ? Math.round((stats.gotCards / stats.totalCards) * 100) : 0;
  const goalOn = stats.goal > 0;
  const goalProgress = goalOn ? Math.min(100, Math.round((stats.todayGets / stats.goal) * 100)) : 0;
  const goalReached = goalOn && stats.todayGets >= stats.goal;
  const weekHits = goalOn ? stats.week.filter((day) => day.count >= stats.goal).length : 0;
  const [chartWidth, setChartWidth] = React.useState(0);
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const chartHeight = 128;
  const points = stats.week.map((day, index) => {
    const x = stats.week.length <= 1 || chartWidth <= 0 ? 0 : (chartWidth / (stats.week.length - 1)) * index;
    const y = chartHeight - Math.max(8, (day.count / max) * (chartHeight - 16));
    return { ...day, x, y };
  });
  const onChartLayout = React.useCallback((event: LayoutChangeEvent) => {
    setChartWidth(event.nativeEvent.layout.width);
  }, []);
  const selectedPoint = selectedDay === null ? null : points.find((point) => point.day === selectedDay) ?? null;
  // 掌握程度分布：全部卡片按「最近一次反馈」分成五段（互斥、加总等于总卡片数），
  // 与复习 Tab 的状态仪表同一口径。
  const unreadCount = Math.max(0, stats.totalCards - stats.gotCards);
  const masterySegments = [
    { label: '未读', count: unreadCount, color: theme.paperSoft },
    { label: '新近记忆', count: stats.recentCount, color: newRecentColor },
    { label: '需要复习', count: stats.fuzzyCount, color: masteryColors[2] },
    { label: '已掌握', count: stats.clearCount, color: masteryColors[3] },
    { label: '遗忘', count: stats.forgotCount, color: masteryColors[1] },
  ];

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>

      {/* 吸收概览：背景与文字随明暗模式取同向色（浅色模式浅卡片、深色模式深卡片） */}
      <View style={[styles.heroStat, { backgroundColor: theme.accentSoft }] }>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="分享学习档案"
          onPress={onShareStats}
          style={({ pressed }) => [styles.heroShareButton, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.16)' : 'rgba(23,22,17,0.08)' }, pressed && styles.pressed]}
        >
          <Ionicons name="share-social-outline" size={16} color={theme.ink} />
        </Pressable>
        <Text style={[styles.heroValue, { color: theme.ink }]}>{stats.gotCards}</Text>
        <Text style={[styles.heroLabel, { color: theme.ink }]}>总吸收卡片</Text>
        <View style={[styles.progressTrack, { backgroundColor: theme.dark ? 'rgba(247,241,230,0.24)' : 'rgba(23,22,17,0.18)' }]}>
          <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.ink }]} />
        </View>
        <Text style={[styles.progressText, { color: theme.ink }]}>总体进度 {progress}% · {stats.gotCards}/{stats.totalCards}</Text>
        <Text style={[styles.progressText, { color: theme.ink }]}>今日 GET {stats.todayGets} · 今日复习 {stats.todayReviews} · 已连续 {stats.streakDays} 天</Text>
        <View style={[styles.heroDivider, { backgroundColor: theme.dark ? 'rgba(247,241,230,0.24)' : 'rgba(23,22,17,0.18)' }]} />
        <View style={styles.heroMiniGrid}>
          <HeroMiniStat label="文档" value={stats.documents} theme={theme} />
          <HeroMiniStat label="卡片" value={stats.totalCards} theme={theme} />
          <HeroMiniStat label="收藏" value={stats.favoriteCards} theme={theme} />
          <HeroMiniStat label="批注" value={stats.annotatedCards} theme={theme} />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="打开收藏与批注"
        onPress={onOpenFavorites}
        style={({ pressed }) => [styles.favRow, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
      >
        <View style={[styles.favIcon, { backgroundColor: theme.paperSoft }]}>
          <Ionicons name="heart-outline" size={15} color={theme.red} />
        </View>
        <View style={styles.favTextWrap}>
          <Text style={[styles.favTitle, { color: theme.ink }]}>收藏与批注</Text>
          <Text style={[styles.favMeta, { color: theme.inkMuted }]}>我标记过的重要卡片</Text>
        </View>
        <Text style={[styles.favCount, { color: theme.inkMuted }]}>{stats.favoriteCards}</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.inkMuted} />
      </Pressable>

      <View style={[styles.goalCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
        <View style={styles.goalHead}>
          <Text style={[styles.goalTitle, { color: theme.ink }]}>每日目标</Text>
          {goalOn ? (
            goalReached ? (
              <View style={styles.goalBadge}>
                <Ionicons name="checkmark-circle" size={13} color="#5D4218" />
                <Text style={styles.goalBadgeText}>已打卡 {stats.todayGets}/{stats.goal}</Text>
              </View>
            ) : (
              <Text style={[styles.goalValue, { color: theme.inkMuted }]}>
                {stats.todayGets}/{stats.goal}
              </Text>
            )
          ) : null}
        </View>
        {goalOn ? (
          <>
            <View style={[styles.goalTrack, { backgroundColor: theme.paperSoft }]}>
              <View style={[styles.goalFill, { width: `${goalProgress}%`, backgroundColor: goalReached ? '#F2B737' : theme.accent }]} />
            </View>
            <Text style={[styles.goalMeta, { color: theme.inkMuted }]}>
              {goalReached ? `今日已打卡 · 已连续 ${stats.streakDays} 天` : `再 get ${stats.goal - stats.todayGets} 张即完成打卡 · 已连续 ${stats.streakDays} 天`}
            </Text>
            <Text style={[styles.goalMeta, { color: theme.inkMuted }]}>本周达成 {weekHits}/7 天</Text>
          </>
        ) : (
          <Text style={[styles.goalMeta, { color: theme.inkMuted }]}>未设置每日目标，可在 设置 → 阅读节奏 中开启。</Text>
        )}
      </View>

      <View style={[styles.goalCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
        <View style={styles.goalHead}>
          <Text style={[styles.goalTitle, { color: theme.ink }]}>掌握程度</Text>
          {stats.dueCount > 0 ? <Text style={[styles.goalValue, { color: theme.inkMuted }]}>待复习 {stats.dueCount} 张</Text> : null}
        </View>
        <View style={[styles.masteryBar, { backgroundColor: theme.paperSoft }]}>
          {masterySegments.map((segment) => (
            segment.count > 0 ? (
              <View key={`mastery-${segment.label}`} style={{ flex: segment.count, backgroundColor: segment.color }} />
            ) : null
          ))}
        </View>
        <View style={styles.masteryLegend}>
          {masterySegments.map((segment) => (
            <View key={`mastery-legend-${segment.label}`} style={styles.masteryLegendItem}>
              <View style={[styles.masteryDot, { backgroundColor: segment.color, borderColor: theme.line }]} />
              <Text style={[styles.masteryLegendLabel, { color: theme.inkMuted }]}>{segment.label}</Text>
              <Text style={[styles.masteryLegendValue, { color: theme.ink }]}>{segment.count}</Text>
            </View>
          ))}
        </View>
        {stats.weakCount > 0 ? (
          <Text style={[styles.goalMeta, { color: theme.inkMuted }]}>有 {stats.weakCount} 张卡片忘记过，复习时会优先安排。</Text>
        ) : null}
      </View>

      <WeeklyCard goal={stats.goal} />

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
            {chartWidth > 0 ? points.map((point) => {
              const selected = selectedDay === point.day;
              return (
                <Pressable
                  key={`trend-point-${point.day}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${point.day} get ${point.count} 张`}
                  onPress={() => setSelectedDay((current) => (current === point.day ? null : point.day))}
                  style={[styles.trendPointHit, { left: point.x - 16, top: point.y - 16 }]}
                >
                  <View
                    style={[
                      styles.trendPoint,
                      selected
                        ? [styles.trendPointSelected, { backgroundColor: theme.accent, borderColor: theme.accent }]
                        : { backgroundColor: theme.accentSoft, borderColor: theme.ink },
                    ]}
                  />
                </Pressable>
              );
            }) : null}
            {chartWidth > 0 && selectedPoint ? (
              <View
                pointerEvents="none"
                style={[
                  styles.trendTooltip,
                  {
                    left: Math.max(0, Math.min(chartWidth - TOOLTIP_WIDTH, selectedPoint.x - TOOLTIP_WIDTH / 2)),
                    top: selectedPoint.y >= TOOLTIP_ABOVE_MIN_Y ? selectedPoint.y - 46 : selectedPoint.y + 18,
                    backgroundColor: theme.ink,
                  },
                ]}
              >
                <Text style={[styles.trendTooltipValue, { color: theme.paper }]}>{selectedPoint.count} 张</Text>
                <Text style={[styles.trendTooltipDay, { color: theme.paper }]}>{selectedPoint.day}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.lineLabels}>
            {points.map((day, index) => {
              const selected = selectedDay === day.day;
              return (
                <View key={`week-label-${day.day}-${index}`} style={styles.lineLabelItem}>
                  <Text style={[styles.lineValue, { color: selected ? theme.accent : theme.ink }]}>{day.count}</Text>
                  <Text style={[styles.lineLabel, { color: theme.inkMuted }]}>{day.day}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <HeatmapCard />
    </ScrollView>
  );
}

// 总吸收卡片内的四项支撑统计：半透明小卡浮在 accentSoft 底色上，明暗模式取同向色。
function HeroMiniStat({ label, value, theme }: { label: string; value: number; theme: AppTheme }) {
  return (
    <View
      style={[
        styles.heroMiniTile,
        {
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.45)',
          borderColor: theme.dark ? 'rgba(255,255,255,0.16)' : 'rgba(23,22,17,0.10)',
        },
      ]}
    >
      <Text style={[styles.heroMiniValue, { color: theme.ink }]}>{value}</Text>
      <Text style={[styles.heroMiniLabel, { color: theme.ink, opacity: 0.72 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 140, gap: 14 },
  header: { gap: 7 },
  eyebrow: { color: palette.inkMuted, textTransform: 'uppercase', fontWeight: '900', letterSpacing: 1.2, fontSize: 12 },
  title: { color: palette.ink, fontSize: 38, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { color: palette.inkMuted, fontSize: 15, lineHeight: 23 },
  heroStat: { borderRadius: radius.xl, backgroundColor: palette.accentSoft, padding: 22, gap: 8 },
  heroValue: { color: palette.ink, fontSize: 64, fontWeight: '900', letterSpacing: -2.2 },
  heroLabel: { color: palette.ink, opacity: 0.78, fontSize: 16, fontWeight: '800' },
  progressTrack: { height: 8, backgroundColor: 'rgba(23,22,17,0.18)', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: palette.ink, borderRadius: 4 },
  progressText: { color: palette.ink, opacity: 0.72, fontSize: 12, fontWeight: '700' },
  heroDivider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginTop: 4 },
  heroMiniGrid: { flexDirection: 'row', gap: 8 },
  heroMiniTile: { flex: 1, borderRadius: radius.md, borderWidth: 1, paddingVertical: 10, alignItems: 'center', gap: 2 },
  heroMiniValue: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  heroMiniLabel: { fontSize: 11, fontWeight: '700' },
  chartCard: { borderRadius: radius.xl, backgroundColor: palette.paperElevated, borderWidth: 1, borderColor: palette.line, padding: 18, gap: 14 },
  goalCard: { borderRadius: radius.xl, backgroundColor: palette.paperElevated, borderWidth: 1, borderColor: palette.line, padding: 18, gap: 10 },
  goalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalTitle: { fontSize: 17, fontWeight: '900' },
  goalValue: { fontSize: 16, fontWeight: '900' },
  goalTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  goalFill: { height: 8, borderRadius: 4 },
  goalBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F2B737', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  goalBadgeText: { color: '#5D4218', fontSize: 12, fontWeight: '900' },
  goalMeta: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
  heroShareButton: { position: 'absolute', top: 16, right: 16, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  weekHeadMeta: { fontSize: 11, fontWeight: '700' },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 },
  weekLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
  weekValueWrap: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', minWidth: 62 },
  weekValue: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  weekUnit: { fontSize: 12, fontWeight: '700' },
  weekDeltaWrap: { width: 84, alignItems: 'flex-end', gap: 2 },
  weekDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  weekDeltaText: { fontSize: 12, fontWeight: '800' },
  weekLast: { fontSize: 10, fontWeight: '700' },
  sectionTitle: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  lineChart: { gap: 10 },
  linePlot: { position: 'relative', width: '100%' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.72 },
  trendLine: { position: 'absolute', height: 3, borderRadius: 2 },
  trendPointHit: { position: 'absolute', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  trendPoint: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  trendPointSelected: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  trendTooltip: {
    position: 'absolute',
    width: TOOLTIP_WIDTH,
    borderRadius: radius.md,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 1,
  },
  trendTooltipValue: { fontSize: 14, fontWeight: '900' },
  trendTooltipDay: { fontSize: 10, fontWeight: '700', opacity: 0.72 },
  lineLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabelItem: { flex: 1, alignItems: 'center', gap: 3 },
  lineValue: { color: palette.ink, fontSize: 12, fontWeight: '900' },
  lineLabel: { color: palette.inkMuted, fontSize: 10, fontWeight: '700' },
  heatmapBody: { flexDirection: 'row', gap: 5 },
  weekdayColumn: { gap: CELL_GAP },
  weekdaySlot: { alignItems: 'center', justifyContent: 'center' },
  weekdayText: { fontSize: 9, fontWeight: '700' },
  heatmapGrid: { flexDirection: 'row', gap: CELL_GAP },
  heatmapColumn: { gap: CELL_GAP },
  heatmapCell: { borderRadius: 3 },
  heatmapLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  legendScale: { flexDirection: 'row', alignItems: 'center', gap: CELL_GAP },
  heatmapMeta: { fontSize: 11, fontWeight: '700' },
  masteryBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  masteryLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  masteryLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: '44%' },
  masteryDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: palette.line },
  masteryLegendLabel: { fontSize: 11, fontWeight: '700' },
  masteryLegendValue: { fontSize: 12, fontWeight: '900' },
  favRow: { borderRadius: radius.xl, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  favIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  favTextWrap: { flex: 1, gap: 2 },
  favTitle: { fontSize: 15, fontWeight: '900' },
  favMeta: { fontSize: 12, fontWeight: '600' },
  favCount: { fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
