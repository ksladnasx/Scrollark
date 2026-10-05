import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ImageBackground, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { PosterShareActions, usePosterShare } from './PosterShareKit';
import { getDailyActivity } from '../data/repository';
import { getDailyHomeBackgroundImageUri } from '../utils/homeBackground';
import { softIcon } from '../theme/assets';
import { masteryColors } from '../theme/tokens';
import type { Settings, Statistics } from '../domain/types';

type Props = {
  settings: Settings;
  stats: Statistics;
  onDone: () => void;
};

// 热力图几何：格子沿用「我的」页热力图的观感，列数按海报内容宽自适应（12–26 周）。
const HEATMAP_CELL = 12;
const HEATMAP_GAP = 3;
const WEEKDAY_COL_W = 10;
const WEEKDAY_LABELS = ['一', '', '三', '', '五', '', '日'];
// 打卡趋势折线图几何：折线区高度 + 两端留白（保证端点标签不出内容区）+ 标签列宽。
const TREND_CHART_H = 64;
const TREND_PAD_X = 18;
const TREND_LABEL_W = 36;

// 打卡强度映射为颜色深浅：与「我的」页热力图同一档位。
function activityOpacity(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 0.28;
  if (count <= 5) return 0.5;
  if (count <= 9) return 0.72;
  return 1;
}

// 海报内容宽（宽 - 左右 24 边距）下放得下的周列数，已预留左侧星期标签列。
function heatWeeks(contentW: number) {
  const weeks = Math.floor((contentW - WEEKDAY_COL_W - HEATMAP_GAP) / (HEATMAP_CELL + HEATMAP_GAP));
  return Math.max(12, Math.min(26, weeks));
}

// 学习档案分享海报：与首页海报共用 PosterShareKit 的截图/分享管道，背景沿用每日壁纸；
// 内容与首页海报错开——不重复展示卡片 / 收藏 / 批注 / 文档四项，主打吸收进度、
// 复习四状态（2x2）、近 7 天打卡趋势与打卡热力图。
export function StatsShareOverlay({ settings, stats, onDone }: Props) {
  const { width } = useWindowDimensions();
  const [imageSource, setImageSource] = React.useState<ImageSourcePropType | null>(null);
  const imageResolveRef = React.useRef<(() => void) | null>(null);
  const settleResolveRef = React.useRef<(() => void) | null>(null);
  const fontFamily = settings.fontFamily;

  // 首次渲染即创建等待的 Promise：布局与壁纸解析可能早于 effect 执行。
  const imageReady = React.useMemo(() => new Promise<void>((resolve) => { imageResolveRef.current = resolve; }), []);
  const layoutDone = React.useMemo(() => new Promise<void>((resolve) => { settleResolveRef.current = resolve; }), []);
  const [activity, setActivity] = React.useState<{ date: string; count: number }[] | null>(null);
  const activityResolveRef = React.useRef<(() => void) | null>(null);
  const activityReady = React.useMemo(() => new Promise<void>((resolve) => { activityResolveRef.current = resolve; }), []);
  const settle = React.useMemo(() => Promise.all([imageReady, layoutDone, activityReady]), [imageReady, layoutDone, activityReady]);

  const share = usePosterShare({ title: '分享我的学习档案', saveDirectory: settings.homeBackgroundDownloadDirectory, onDone, settle });

  // 「我的」页没有已解析的壁纸：这里按首页同源规则解析；失败时退回纯色海报底，不阻塞截图。
  React.useEffect(() => {
    let alive = true;
    getDailyHomeBackgroundImageUri(settings.homeBackgroundImageUrl)
      .then((uri) => {
        if (!alive) return;
        if (uri) setImageSource({ uri });
        else imageResolveRef.current?.();
      })
      .catch(() => {
        imageResolveRef.current?.();
      });
    return () => {
      alive = false;
    };
  }, [settings.homeBackgroundImageUrl]);

  // 热力图数据：截图 settle 必须等它完成（或确认失败），否则海报里会缺一块。
  const contentW = width - 48;
  const weeks = heatWeeks(contentW);
  React.useEffect(() => {
    let alive = true;
    getDailyActivity(weeks * 7 - 1)
      .then((rows) => {
        if (alive) setActivity(rows);
      })
      .catch(() => {
        // 拉取失败就不渲染热力图区块，其余内容照常截图。
      })
      .finally(() => {
        activityResolveRef.current?.();
      });
    return () => {
      alive = false;
    };
  }, [weeks]);

  const handlePosterLayout = React.useCallback(() => {
    settleResolveRef.current?.();
  }, []);
  const handleImageLoaded = React.useCallback(() => {
    imageResolveRef.current?.();
  }, []);

  const today = React.useMemo(() => {
    const date = new Date();
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }, []);

  const progress = stats.totalCards > 0 ? Math.min(100, Math.round((stats.gotCards / stats.totalCards) * 100)) : 0;
  // 复习四状态（与复习仪表同一口径），2x2 排在已吸收数右侧。
  const statusTiles = [
    { label: '新近记忆', count: stats.recentCount, color: '#526B78' },
    { label: '需要复习', count: stats.fuzzyCount, color: masteryColors[2] },
    { label: '已掌握', count: stats.clearCount, color: masteryColors[3] },
    { label: '遗忘', count: stats.forgotCount, color: masteryColors[1] },
  ];

  // 热力图列：截取最近 weeks*7 天，再把首列对齐到周一（周一为每列第一行）。
  const heatColumns = React.useMemo(() => {
    if (!activity || activity.length === 0) return [];
    const base = activity.slice(-(weeks * 7));
    const first = new Date(`${base[0].date}T00:00:00`);
    const lead = Number.isNaN(first.getTime()) ? 0 : (first.getDay() + 6) % 7;
    const days = base.slice(lead);
    const cells: ({ date: string; count: number } | null)[] = [...Array.from({ length: lead }, () => null), ...days];
    return Array.from({ length: weeks }, (_, week) => cells.slice(week * 7, week * 7 + 7));
  }, [activity, weeks]);
  const heatCells = heatColumns.flat();
  const heatTotal = heatCells.reduce((sum, day) => sum + (day?.count ?? 0), 0);
  const heatActiveDays = heatCells.filter((day) => day && day.count > 0).length;

  // 近 7 天打卡趋势：以 7 天内峰值为满高，折线两端留出标签宽度。
  const trendMax = Math.max(1, ...stats.week.map((day) => day.count));
  const trendPoints = React.useMemo(
    () => stats.week.map((day, index) => ({
      day: day.day,
      count: day.count,
      x: TREND_PAD_X + ((contentW - TREND_PAD_X * 2) / Math.max(1, stats.week.length - 1)) * index,
      y: TREND_CHART_H - Math.max(8, (day.count / trendMax) * (TREND_CHART_H - 16)),
    })),
    [stats.week, contentW, trendMax],
  );

  const content = (
    <>
      <View style={styles.brandRow}>
        <Image source={softIcon} style={styles.brandIcon} />
        <Text style={styles.brandName}>Scrollark · 知识卡片</Text>
      </View>

      {/* 吸收概览：左侧已吸收大数字，右侧 2x2 复习四状态，下接总体进度条 */}
      <View style={styles.archiveBlock}>
        <View style={styles.archiveHead}>
          <View style={styles.archiveLabelRow}>
            <Ionicons name="library-outline" size={14} color="#F2B737" />
            <Text style={[styles.archiveLabel, { fontFamily }]}>学习档案</Text>
          </View>
          {stats.streakDays > 0 ? (
            <Text style={[styles.archiveStreak, { fontFamily }]}>已连续打卡 {stats.streakDays} 天</Text>
          ) : null}
        </View>
        <View style={styles.heroRow}>
          <View style={styles.heroValueCol}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroValue}>{stats.gotCards}</Text>
            <Text style={styles.heroUnit}>张已吸收</Text>
          </View>
          <View style={styles.statusCol}>
            <View style={styles.statusRow}>
              <StatusTile tile={statusTiles[0]} fontFamily={fontFamily} />
              <StatusTile tile={statusTiles[1]} fontFamily={fontFamily} />
            </View>
            <View style={styles.statusRow}>
              <StatusTile tile={statusTiles[2]} fontFamily={fontFamily} />
              <StatusTile tile={statusTiles[3]} fontFamily={fontFamily} />
            </View>
          </View>
        </View>
        <View style={styles.goalTrack}>
          <View style={[styles.goalFill, { width: `${progress}%` }]} />
        </View>
        <Text style={[styles.archiveMeta, { fontFamily }]}>总体进度 {progress}% · 共 {stats.totalCards} 张卡片</Text>
      </View>

      {/* 打卡趋势：近 7 天 GET 折线图（Svg 折线 + 圆点，数值与日期标在点正下方） */}
      <View style={styles.chartBlock}>
        <View style={styles.chartHead}>
          <View style={styles.chartLabelRow}>
            <Ionicons name="trending-up-outline" size={13} color="#F2B737" />
            <Text style={[styles.chartTitle, { fontFamily }]}>打卡趋势</Text>
          </View>
          <Text style={styles.chartSub}>近 7 天 GET</Text>
        </View>
        <View style={[styles.trendPlot, { width: contentW }]}>
          <Svg width={contentW} height={TREND_CHART_H}>
            <Polyline
              points={trendPoints.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="#F2B737"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {trendPoints.map((point, index) => (
              <Circle
                key={`trend-dot-${point.day}-${index}`}
                cx={point.x}
                cy={point.y}
                r={3.5}
                fill="#F2B737"
                stroke="rgba(17,17,15,0.9)"
                strokeWidth={1.5}
              />
            ))}
          </Svg>
          {trendPoints.map((point, index) => (
            <View
              key={`trend-label-${point.day}-${index}`}
              style={[styles.trendLabelCol, { left: point.x - TREND_LABEL_W / 2, width: TREND_LABEL_W }]}
            >
              <Text style={styles.trendValue}>{point.count}</Text>
              <Text style={styles.trendLabel}>{point.day}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 打卡热力图：近数周逐日强度（数据加载失败时整块隐藏，不影响其余内容） */}
      {heatColumns.length > 0 ? (
        <View style={styles.chartBlock}>
          <View style={styles.chartHead}>
            <View style={styles.chartLabelRow}>
              <Ionicons name="flame-outline" size={13} color="#F2B737" />
              <Text style={[styles.chartTitle, { fontFamily }]}>打卡热力图</Text>
            </View>
            <Text style={styles.chartSub}>近 {weeks} 周</Text>
          </View>
          <View style={styles.heatBody}>
            <View style={styles.weekdayCol}>
              {WEEKDAY_LABELS.map((label, row) => (
                <View key={`weekday-${row}`} style={[styles.weekdaySlot, { height: HEATMAP_CELL }]}>
                  {label ? <Text style={styles.weekdayText}>{label}</Text> : null}
                </View>
              ))}
            </View>
            <View style={styles.heatGrid}>
              {heatColumns.map((column, columnIndex) => (
                <View key={`week-${columnIndex}`} style={styles.heatColumn}>
                  {column.map((day, dayIndex) => (
                    <View
                      key={day ? `day-${day.date}` : `empty-${columnIndex}-${dayIndex}`}
                      style={[
                        styles.heatCell,
                        {
                          height: HEATMAP_CELL,
                          width: HEATMAP_CELL,
                          backgroundColor: day && day.count > 0 ? '#F2B737' : 'rgba(255,255,255,0.14)',
                          opacity: day && day.count > 0 ? activityOpacity(day.count) : 1,
                        },
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
          <View style={styles.heatLegend}>
            <Text style={[styles.heatMeta, { fontFamily }]}>共 {heatTotal} 次记录 · {heatActiveDays} 天有记录</Text>
            <View style={styles.legendScale}>
              <Text style={styles.legendText}>少</Text>
              {[0, 2, 5, 9, 12].map((count) => (
                <View
                  key={`legend-${count}`}
                  style={[styles.heatCell, { height: HEATMAP_CELL, width: HEATMAP_CELL, backgroundColor: count > 0 ? '#F2B737' : 'rgba(255,255,255,0.14)', opacity: count > 0 ? activityOpacity(count) : 1 }]}
                />
              ))}
              <Text style={styles.legendText}>多</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerBrand}>Scrollark</Text>
        <Text style={[styles.footerNote, { fontFamily }]}>让每一次阅读都有收获 · {today}</Text>
      </View>
    </>
  );

  return (
    <View style={[styles.overlay, share.kickStyle]}>
      <View ref={share.targetRef} collapsable={false} onLayout={handlePosterLayout} style={[styles.poster, { width }]}>
        {imageSource ? (
          <ImageBackground source={imageSource} style={styles.posterBg} imageStyle={styles.posterImage} onLoadEnd={handleImageLoaded}>
            <View style={styles.scrim} />
            <View style={styles.content}>{content}</View>
          </ImageBackground>
        ) : (
          <View style={styles.posterBg}>
            <View style={styles.content}>{content}</View>
          </View>
        )}
      </View>

      {share.capturedUri ? (
        <PosterShareActions
          busy={share.actionBusy}
          onShare={() => { void share.handleShare(); }}
          onSave={() => { void share.handleSave(); }}
          onClose={share.handleClose}
        />
      ) : null}
    </View>
  );
}

// 复习四状态小卡：状态色圆点 + 数量 + 名称，两张一行共两行。
function StatusTile({ tile, fontFamily }: { tile: { label: string; count: number; color: string }; fontFamily: string }) {
  return (
    <View style={styles.statusTile}>
      <View style={[styles.statusDot, { backgroundColor: tile.color }]} />
      <Text style={styles.statusValue}>{tile.count}</Text>
      <Text style={[styles.statusLabel, { fontFamily }]}>{tile.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // 预览垂直居中（海报含趋势图与热力图，比首页海报高）：底部预留操作栏高度，
    // 在可用的居中区间内居中，避免小屏上与操作栏重叠。
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 80,
    backgroundColor: 'rgba(17,17,15,0.6)',
    zIndex: 100,
  },
  poster: { backgroundColor: '#11110F' },
  posterBg: { minHeight: 480 },
  posterImage: { resizeMode: 'cover' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,12,10,0.55)' },
  content: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 22, gap: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 22, height: 22, borderRadius: 6 },
  brandName: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  archiveBlock: { gap: 10 },
  archiveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  archiveLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  archiveLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '800' },
  archiveStreak: { color: 'rgba(255,255,255,0.66)', fontSize: 12, fontWeight: '700' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroValueCol: { gap: 2 },
  heroValue: { color: '#FFFFFF', fontSize: 46, lineHeight: 52, fontWeight: '900', letterSpacing: -1.5 },
  heroUnit: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '800' },
  statusCol: { flex: 1, gap: 6 },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusTile: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: -0.2 },
  statusLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: '700' },
  goalTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  goalFill: { height: 8, borderRadius: 4, backgroundColor: '#F2B737' },
  archiveMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' },
  chartBlock: { gap: 10 },
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chartTitle: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  chartSub: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700' },
  trendPlot: { position: 'relative', height: TREND_CHART_H + 34 },
  trendLabelCol: { position: 'absolute', top: TREND_CHART_H + 4, alignItems: 'center', gap: 1 },
  trendValue: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  trendLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 9.5, fontWeight: '700' },
  heatBody: { flexDirection: 'row', gap: HEATMAP_GAP },
  weekdayCol: { gap: HEATMAP_GAP, width: WEEKDAY_COL_W },
  weekdaySlot: { alignItems: 'center', justifyContent: 'center' },
  weekdayText: { color: 'rgba(255,255,255,0.55)', fontSize: 8, fontWeight: '700' },
  heatGrid: { flexDirection: 'row', gap: HEATMAP_GAP },
  heatColumn: { gap: HEATMAP_GAP },
  heatCell: { borderRadius: 3 },
  heatLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  legendScale: { flexDirection: 'row', alignItems: 'center', gap: HEATMAP_GAP },
  legendText: { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '700' },
  heatMeta: { color: 'rgba(255,255,255,0.66)', fontSize: 10.5, fontWeight: '700' },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.28)',
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerBrand: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  footerNote: { color: 'rgba(255,255,255,0.66)', fontSize: 10, fontWeight: '700' },
});
