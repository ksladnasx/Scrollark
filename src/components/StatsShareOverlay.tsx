import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ImageBackground, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { PosterShareActions, usePosterShare } from './PosterShareKit';
import { getDailyHomeBackgroundImageUri } from '../utils/homeBackground';
import { softIcon } from '../theme/assets';
import { masteryColors } from '../theme/tokens';
import type { Settings, Statistics } from '../domain/types';

type Props = {
  settings: Settings;
  stats: Statistics;
  onDone: () => void;
};

// 学习档案分享海报：与首页海报共用 PosterShareKit 的截图/分享管道，
// 背景沿用每日壁纸；内容突出总吸收进度、连续打卡与复习四状态分布。
export function StatsShareOverlay({ settings, stats, onDone }: Props) {
  const { width } = useWindowDimensions();
  const [imageSource, setImageSource] = React.useState<ImageSourcePropType | null>(null);
  const imageResolveRef = React.useRef<(() => void) | null>(null);
  const settleResolveRef = React.useRef<(() => void) | null>(null);
  const fontFamily = settings.fontFamily;

  // 首次渲染即创建等待的 Promise：布局与壁纸解析可能早于 effect 执行。
  const imageReady = React.useMemo(() => new Promise<void>((resolve) => { imageResolveRef.current = resolve; }), []);
  const layoutDone = React.useMemo(() => new Promise<void>((resolve) => { settleResolveRef.current = resolve; }), []);
  const settle = React.useMemo(() => Promise.all([imageReady, layoutDone]), [imageReady, layoutDone]);

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
  const statusTiles = [
    { label: '新近记忆', count: stats.recentCount, color: '#526B78' },
    { label: '需要复习', count: stats.fuzzyCount, color: masteryColors[2] },
    { label: '已掌握', count: stats.clearCount, color: masteryColors[3] },
    { label: '遗忘', count: stats.forgotCount, color: masteryColors[1] },
  ];

  const content = (
    <>
      <View style={styles.brandRow}>
        <Image source={softIcon} style={styles.brandIcon} />
        <Text style={styles.brandName}>Scrollark · 知识卡片</Text>
      </View>

      {/* 学习档案主数字：总吸收 + 总体进度 */}
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
        <Text style={styles.archiveValue}>
          {stats.gotCards}
          <Text style={styles.archiveUnit}> 张已吸收</Text>
        </Text>
        <View style={styles.goalTrack}>
          <View style={[styles.goalFill, { width: `${progress}%` }]} />
        </View>
        <Text style={[styles.archiveMeta, { fontFamily }]}>总体进度 {progress}% · 共 {stats.totalCards} 张卡片</Text>
      </View>

      {/* 复习四状态分布 */}
      <View style={styles.miniGrid}>
        {statusTiles.map((tile) => (
          <View key={tile.label} style={styles.miniTile}>
            <View style={[styles.statusDot, { backgroundColor: tile.color }]} />
            <Text style={styles.miniValue}>{tile.count}</Text>
            <Text style={[styles.miniLabel, { fontFamily }]}>{tile.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.miniGrid}>
        <MiniStat label="知识卡片" value={stats.totalCards} fontFamily={fontFamily} />
        <MiniStat label="收藏" value={stats.favoriteCards} fontFamily={fontFamily} />
        <MiniStat label="批注" value={stats.annotatedCards} fontFamily={fontFamily} />
        <MiniStat label="文档" value={stats.documents} fontFamily={fontFamily} />
      </View>

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

function MiniStat({ label, value, fontFamily }: { label: string; value: number; fontFamily: string }) {
  return (
    <View style={styles.miniTile}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={[styles.miniLabel, { fontFamily }]}>{label}</Text>
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
  archiveBlock: { gap: 6 },
  archiveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  archiveLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  archiveLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '800' },
  archiveStreak: { color: 'rgba(255,255,255,0.66)', fontSize: 12, fontWeight: '700' },
  archiveValue: { color: '#FFFFFF', fontSize: 48, lineHeight: 54, fontWeight: '900', letterSpacing: -1 },
  archiveUnit: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '800' },
  goalTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  goalFill: { height: 8, borderRadius: 4, backgroundColor: '#F2B737' },
  archiveMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' },
  miniGrid: { flexDirection: 'row', gap: 8 },
  miniTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  miniValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  miniLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700' },
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
