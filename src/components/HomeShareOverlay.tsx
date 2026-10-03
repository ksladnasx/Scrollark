import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ImageBackground, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { PosterShareActions, usePosterShare } from './PosterShareKit';
import { softIcon } from '../theme/assets';
import type { Settings, Statistics } from '../domain/types';

type Props = {
  imageSource: ImageSourcePropType;
  settings: Settings;
  stats: Statistics;
  onDone: () => void;
};

// 主数据区几何参数：左侧数字标签与支撑统计（2x2）+ 引导线 + 右侧环形扇形图，同一区排布。
// 扇区以「已吸收占比」为中心对称地锚定在圆的左侧（180°），
// 引导线从扇区中点边缘（圆的最左点）水平连到左侧「总吸收卡片」标签行；
// 圆环中心（HERO_CY）与数值/标签行对齐，支撑统计网格占满区块左下。
const HERO_H = 160;
const HERO_CY = 56;
const DONUT_SIZE = 96;
const DONUT_R = 37;
const DONUT_STROKE = 13;
const LABEL_W = 118;

// 首页数据分享海报：当前壁纸做背景，展示今日 get、阅读统计与打卡状态，
// 截图后弹出操作栏（分享给朋友 / 保存到相册）。截图与分享流程见 PosterShareKit.usePosterShare。
export function HomeShareOverlay({ imageSource, settings, stats, onDone }: Props) {
  const { width } = useWindowDimensions();
  const imageResolveRef = React.useRef<(() => void) | null>(null);
  const settleResolveRef = React.useRef<(() => void) | null>(null);
  const fontFamily = settings.fontFamily;

  // 首次渲染即创建等待的 Promise：布局与壁纸加载可能早于 effect 执行。
  const imageReady = React.useMemo(() => new Promise<void>((resolve) => { imageResolveRef.current = resolve; }), []);
  const layoutDone = React.useMemo(() => new Promise<void>((resolve) => { settleResolveRef.current = resolve; }), []);
  const settle = React.useMemo(() => Promise.all([imageReady, layoutDone]), [imageReady, layoutDone]);

  const share = usePosterShare({ title: '分享我的阅读数据', saveDirectory: settings.homeBackgroundDownloadDirectory, onDone, settle });

  const today = React.useMemo(() => {
    const date = new Date();
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }, []);
  const goalProgress = stats.goal > 0 ? Math.min(100, Math.round((stats.todayGets / stats.goal) * 100)) : 0;
  const goalReached = stats.goal > 0 && stats.todayGets >= stats.goal;

  // 扇形图几何：已吸收/全部卡片为占比，扇区中心对称锚定在圆的最左侧。
  const contentW = width - 48;
  const cx = contentW - DONUT_SIZE / 2;
  const cy = HERO_CY;
  const ratio = stats.totalCards > 0 ? Math.min(1, stats.gotCards / stats.totalCards) : 0;
  const hasSector = ratio > 0;
  const circumference = DONUT_R * 2 * Math.PI;
  const arcLen = circumference * ratio;
  const startAngle = 180 - (ratio * 360) / 2;
  const lineY = cy;
  const lineX1 = LABEL_W + 12;
  const lineX2 = cx - DONUT_R - DONUT_STROKE / 2;
  const pctText = `${(ratio * 100).toFixed(1)}%`;

  const handlePosterLayout = React.useCallback(() => {
    settleResolveRef.current?.();
  }, []);
  const handleImageLoaded = React.useCallback(() => {
    imageResolveRef.current?.();
  }, []);

  return (
    <View style={[styles.overlay, share.kickStyle]}>
      <View ref={share.targetRef} collapsable={false} onLayout={handlePosterLayout} style={[styles.poster, { width }]}>
        <ImageBackground source={imageSource} style={styles.posterBg} imageStyle={styles.posterImage} onLoadEnd={handleImageLoaded}>
          <View style={styles.scrim} />
          <View style={styles.content}>
            <View style={styles.brandRow}>
              <Image source={softIcon} style={styles.brandIcon} />
              <Text style={styles.brandName}>Scrollark · 知识卡片</Text>
            </View>

            {/* 今日已 get：当日数据与打卡状态（合并每日目标进度），不再单独展示日期 */}
            <View style={styles.todayBlock}>
              <View style={styles.todayHead}>
                <View style={styles.todayLabelRow}>
                  <Ionicons name="flame" size={14} color="#F2B737" />
                  <Text style={[styles.todayLabel, { fontFamily }]}>今日已 get</Text>
                </View>
                {goalReached ? (
                  <View style={styles.goalBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#5D4218" />
                    <Text style={styles.goalBadgeText}>已打卡</Text>
                  </View>
                ) : (
                  stats.goal > 0 ? (
                    <Text style={[styles.todayGoalText, { fontFamily }]}>目标 {stats.goal} 张</Text>
                  ) : null
                )}
              </View>
              <Text style={[styles.todayValue, { color: goalReached ? '#F2B737' : '#FFFFFF' }]}>
                {stats.todayGets}
                <Text style={styles.todayUnit}> 张</Text>
              </Text>
              {stats.goal > 0 ? (
                <>
                  <View style={styles.goalTrack}>
                    <View style={[styles.goalFill, { width: `${goalProgress}%`, backgroundColor: goalReached ? '#F2B737' : '#FFF9EE' }]} />
                  </View>
                  <Text style={[styles.goalStreak, { fontFamily }]}>
                    {goalReached ? `已连续打卡 ${stats.streakDays} 天` : `再 get ${stats.goal - stats.todayGets} 张完成打卡`}
                  </Text>
                </>
              ) : null}
            </View>

            {/* 总吸收卡片：左侧数字标签 + 支撑统计（2x2）→ 引导线 → 右侧环形扇形图 */}
            <View style={[styles.heroRow, { width: contentW, height: HERO_H }]}>
              <Svg width={contentW} height={HERO_H}>
                {hasSector ? <Line x1={lineX1} y1={lineY} x2={lineX2} y2={lineY} stroke="#F2B737" strokeWidth={1.5} /> : null}
                <Circle cx={cx} cy={cy} r={DONUT_R} stroke="rgba(255,255,255,0.22)" strokeWidth={DONUT_STROKE} fill="none" />
                {hasSector ? (
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={DONUT_R}
                    stroke="#F2B737"
                    strokeWidth={DONUT_STROKE}
                    fill="none"
                    strokeDasharray={`${arcLen} ${circumference - arcLen}`}
                    transform={`rotate(${startAngle} ${cx} ${cy})`}
                  />
                ) : null}
              </Svg>
              <View style={[styles.heroLabelBox, { width: LABEL_W }]}>
                <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroValue}>{stats.gotCards}</Text>
                <Text style={[styles.heroLabel, { fontFamily }]}>总吸收卡片</Text>
                <View style={styles.heroMiniGrid}>
                  <HeroMiniStat label="知识卡片" value={stats.totalCards} fontFamily={fontFamily} />
                  <HeroMiniStat label="收藏" value={stats.favoriteCards} fontFamily={fontFamily} />
                  <HeroMiniStat label="批注" value={stats.annotatedCards} fontFamily={fontFamily} />
                  <HeroMiniStat label="文档" value={stats.documents} fontFamily={fontFamily} />
                </View>
              </View>
              <View style={[styles.donutCenter, { width: DONUT_SIZE, height: DONUT_SIZE, top: cy - DONUT_SIZE / 2, left: cx - DONUT_SIZE / 2 }]}>
                <Text style={[styles.donutCaption, { fontFamily }]}>已吸收</Text>
                <Text style={styles.donutPct}>{pctText}</Text>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerBrand}>Scrollark</Text>
              <Text style={[styles.footerNote, { fontFamily }]}>让每一次阅读都有收获 · {today}</Text>
            </View>
          </View>
        </ImageBackground>
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

function HeroMiniStat({ label, value, fontFamily }: { label: string; value: number; fontFamily: string }) {
  return (
    <View style={styles.heroMiniTile}>
      <Text style={styles.heroMiniValue}>{value}</Text>
      <Text style={[styles.heroMiniLabel, { fontFamily }]}>{label}</Text>
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
    backgroundColor: 'rgba(17,17,15,0.6)',
    zIndex: 100,
  },
  poster: { backgroundColor: '#11110F' },
  posterBg: { minHeight: 480 },
  posterImage: { resizeMode: 'cover' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,12,10,0.55)' },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, gap: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 22, height: 22, borderRadius: 6 },
  brandName: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  todayBlock: { gap: 6 },
  todayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  todayLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '800' },
  todayGoalText: { color: 'rgba(255,255,255,0.66)', fontSize: 12, fontWeight: '700' },
  todayValue: { fontSize: 48, lineHeight: 54, fontWeight: '900', letterSpacing: -1 },
  todayUnit: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '800' },
  goalBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F2B737', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  goalBadgeText: { color: '#5D4218', fontSize: 11, fontWeight: '900' },
  goalTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  goalFill: { height: 8, borderRadius: 4, backgroundColor: '#FFF9EE' },
  goalStreak: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' },
  heroRow: { position: 'relative' },
  heroLabelBox: { position: 'absolute', left: 0, top: 0, gap: 2 },
  heroValue: { color: '#FFFFFF', fontSize: 44, lineHeight: 50, fontWeight: '900', letterSpacing: -1.5 },
  heroLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '800' },
  heroMiniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, width: LABEL_W },
  heroMiniTile: {
    width: (LABEL_W - 6) / 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  heroMiniValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  heroMiniLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: '700' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 1 },
  donutCaption: { color: 'rgba(255,255,255,0.72)', fontSize: 10, fontWeight: '700' },
  donutPct: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
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
