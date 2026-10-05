import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import React from 'react';
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { showAlert } from '../components/AppAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CardRecord, Settings, Statistics, TabKey } from '../domain/types';
import { heroImages } from '../theme/assets';
import { getDailyHomeBackgroundImageUri, getCachedHomeBackgroundImageUri, saveHomeBackgroundImageToDirectory } from '../utils/homeBackground';
import { getDailyRecommendedCards, refreshDailyRecommendedCards } from '../data/repository';
import { KnowledgeCard } from '../components/KnowledgeCard';
import { AppButton } from '../components/AppButton';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, type AppTheme } from '../theme/tokens';

type Props = {
  stats: Statistics;
  settings: Settings;
  // 传卡片 id：以该推荐卡为起点进入 GET 流；不传（今日学习 CTA 等）则纯随机抽卡。
  onStartSession: (startCardId?: number) => void;
  onStartAheadReview: () => void;
  onNavigate: (tab: TabKey) => void;
  onSearch: () => void;
  // 分享首页数据海报：交给 App 层渲染浮层，保证盖在底部 Tab 栏之上。
  onShareHome: (imageSource: ImageSourcePropType) => void;
};

const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const heroImageKeys = Object.keys(heroImages);

function pickLocalHomeImage(): ImageSourcePropType {
  const key = heroImageKeys[Math.floor(Math.random() * heroImageKeys.length)] ?? 'warm0';
  return heroImages[key] ?? heroImages.warm0;
}

export function HomeScreen({ stats, settings, onStartSession, onStartAheadReview, onNavigate, onSearch, onShareHome }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  // 毛玻璃的模糊目标：整个首页背景（壁纸 + 蒙版）。
  const backgroundRef = React.useRef<View | null>(null);
  const fallbackHomeImage = React.useMemo<ImageSourcePropType>(() => pickLocalHomeImage(), []);
  const [homeImageUri, setHomeImageUri] = React.useState<string | null>(() => getCachedHomeBackgroundImageUri());
  const [homeImage, setHomeImage] = React.useState<ImageSourcePropType>(homeImageUri ? { uri: homeImageUri } : fallbackHomeImage);
  const [downloadBusy, setDownloadBusy] = React.useState(false);
  // 「今天推荐」一天一批：当天首次进入随机抽取并记录在库，切页返回 / 重开应用都不换，
  // 点推荐区标题旁的刷新按钮才手动换一批。点击推荐卡以该卡为起点进入 GET 流。
  const [recommendedCards, setRecommendedCards] = React.useState<CardRecord[]>([]);
  const [recoRefreshing, setRecoRefreshing] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    getDailyHomeBackgroundImageUri(settings.homeBackgroundImageUrl)
      .then((uri) => {
        if (alive) {
          setHomeImage({ uri });
          setHomeImageUri(uri);
        }
      })
      .catch(() => {
        if (alive) {
          setHomeImage(fallbackHomeImage);
          setHomeImageUri(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [fallbackHomeImage, settings.homeBackgroundImageUrl]);

  // 推荐位按天持久化：这里重复拉取只是自愈（记录的卡全被删光时库层会重抽），返回的仍是当天那批。
  React.useEffect(() => {
    let alive = true;
    getDailyRecommendedCards(3)
      .then((cards) => {
        if (alive) setRecommendedCards(cards);
      })
      .catch(() => {
        if (alive) setRecommendedCards([]);
      });
    return () => {
      alive = false;
    };
  }, [stats.gotCards, stats.totalCards]);

  // 刷新按钮：立刻重抽一批并覆盖今天的推荐记录。
  const refreshRecommendations = React.useCallback(async () => {
    if (recoRefreshing) return;
    try {
      setRecoRefreshing(true);
      const cards = await refreshDailyRecommendedCards(3);
      setRecommendedCards(cards);
    } catch {
      // 刷新失败时保留当前推荐，不打断浏览。
    } finally {
      setRecoRefreshing(false);
    }
  }, [recoRefreshing]);

  const downloadBackground = React.useCallback(async () => {
    if (downloadBusy) return;
    try {
      setDownloadBusy(true);
      const sourceUri = homeImageUri ?? await getDailyHomeBackgroundImageUri(settings.homeBackgroundImageUrl);
      const savedUri = await saveHomeBackgroundImageToDirectory(sourceUri, settings.homeBackgroundDownloadDirectory);
      showAlert({ title: '下载完成', message: `背景图已保存到：\n${savedUri}` });
    } catch (error) {
      showAlert({ title: '下载失败', message: error instanceof Error ? error.message : '背景图保存失败，请稍后再试。' });
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, homeImageUri, settings.homeBackgroundDownloadDirectory, settings.homeBackgroundImageUrl]);

  const confirmDownloadBackground = React.useCallback(() => {
    if (downloadBusy) return;
    showAlert({
      title: '下载背景图',
      message: '是否下载当前首页背景图？',
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '下载', onPress: () => { void downloadBackground(); } },
      ],
    });
  }, [downloadBackground, downloadBusy]);

  const today = React.useMemo(() => {
    const date = new Date();
    const week = weekDays[date.getDay()];
    return {
      day: String(date.getDate()).padStart(2, '0'),
      week,
      month: `${date.getFullYear()}年${date.getMonth() + 1}月`,
    };
  }, []);

  const goalOn = stats.goal > 0;
  const goalProgress = goalOn ? Math.min(100, Math.round((stats.todayGets / stats.goal) * 100)) : 0;
  const goalReached = goalOn && stats.todayGets >= stats.goal;
  // 今日学习 CTA：未达标 → 去 GET 新卡；达标 → 去复习（提前复习）。
  // AppButton 会把点击事件传给 onPress，必须包一层，避免事件对象被当成 startCardId。
  const todayCta = goalOn && goalReached
    ? { label: '去复习', icon: 'repeat' as const, onPress: () => onStartSession() }
    : { label: '去 GET 新卡', icon: 'flash-outline' as const, onPress: () => onStartSession() };

  return (
    <BlurTargetView ref={backgroundRef} style={styles.screen}>
      <ImageBackground source={homeImage} resizeMode="cover" style={styles.screenInner} imageStyle={styles.backgroundImage}>
        <View style={styles.scrim} />
        {/* 壁纸长按下载手势区：只覆盖不滚动的顶部区域，不与下方滚动内容抢手势 */}
        <Pressable style={styles.wallpaperPressArea} delayLongPress={600} onLongPress={confirmDownloadBackground} />

        {/* 固定头部：品牌 + 日期 + 快捷图标 + 搜索 */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 36) + 8 }]}>
          <View style={styles.headerRow}>
            <View style={styles.dateBlock}>
              <Text style={styles.brand}>Scrollark</Text>
              <View style={styles.dateRow}>
                <Text style={styles.dateNumber}>{today.day}</Text>
                <View style={styles.dateMetaWrap}>
                  <Text style={styles.dateWeek}>{today.week}</Text>
                  <Text style={styles.dateMonth}>{today.month}</Text>
                </View>
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="分享首页数据"
                onPress={() => onShareHome(homeImage)}
                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              >
                <ShareGlyph size={18} />
              </Pressable>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="搜索知识卡片"
            onPress={onSearch}
            style={({ pressed }) => [styles.searchPill, pressed && styles.pressed]}
          >
            <Ionicons name="search" size={17} color="rgba(255,255,255,0.85)" />
            <Text style={styles.searchPillText}>搜索你的知识卡片</Text>
          </Pressable>
        </View>

        {/* 滚动内容：今日学习 → 复习提醒 → 今天推荐 → 学习进度 */}
        <ScrollView style={styles.content} contentContainerStyle={[styles.contentInner, { paddingBottom: 150 }]} showsVerticalScrollIndicator={false}>
          <FrostPanel backgroundRef={backgroundRef} theme={theme}>
            <View style={styles.todayPanel}>
              <View style={styles.todayHead}>
                <Text style={[styles.panelLabel, { color: theme.inkMuted }]}>今日学习</Text>
                {goalReached ? (
                  <View style={styles.goalBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#5D4218" />
                    <Text style={styles.goalBadgeText}>已打卡</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.todayMainRow}>
                <View style={styles.todayValueCol}>
                  <View style={styles.todayValueRow}>
                    <Text style={[styles.todayValue, { color: theme.ink }]}>{goalOn ? `${goalProgress}%` : stats.todayGets}</Text>
                    {!goalOn ? <Text style={[styles.todayUnit, { color: theme.inkMuted }]}>张已 GET</Text> : null}
                  </View>
                  {goalOn ? (
                    <View style={[styles.goalTrack, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.14)' : 'rgba(23,22,17,0.08)' }]}>
                      <View style={[styles.goalFill, { width: `${goalProgress}%`, backgroundColor: goalReached ? '#F2B737' : theme.accent }]} />
                    </View>
                  ) : null}
                  <Text style={[styles.todayMeta, { color: theme.inkMuted }]}>
                    {goalOn
                      ? goalReached ? '今日目标已完成' : `已完成 ${stats.todayGets}/${stats.goal}`
                      : '可在设置中开启每日目标'}
                  </Text>
                </View>
                <AppButton label={todayCta.label} icon={todayCta.icon} onPress={todayCta.onPress} style={styles.todayCta} />
              </View>
              <Text style={[styles.todayMeta, { color: theme.inkMuted }]}>
                今日 GET {stats.todayGets} · 今日复习 {stats.todayReviews}
              </Text>
            </View>
            <View style={[styles.panelDivider, { backgroundColor: theme.line }]} />
            <View style={styles.progressRow}>
              <ProgressNum value={`${stats.gotCards}`} label="已 GET" theme={theme} />
              <ProgressNum value={`${stats.clearCount}`} label="已掌握" theme={theme} />
              <ProgressNum value={`${stats.dueCount}`} label="待复习" theme={theme} />
              <ProgressNum value={`${stats.streakDays}`} label="连续天数" theme={theme} />
            </View>
          </FrostPanel>

          {stats.dueCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="进入复习"
              onPress={() => onNavigate('review')}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <FrostPanel backgroundRef={backgroundRef} theme={theme}>
                <View style={styles.reminderRow}>
                  <View style={[styles.reminderIcon, { backgroundColor: '#405991' }]}>
                    <Ionicons name="repeat" size={15} color="#FFFFFF" />
                  </View>
                  <View style={styles.reminderTextWrap}>
                    <Text style={[styles.reminderTitle, { color: theme.ink }]}>{stats.dueCount} 张卡片需要复习</Text>
                    <Text style={[styles.reminderMeta, { color: theme.inkMuted }]}>
                      {stats.dueWeakCount > 0 ? `其中 ${stats.dueWeakCount} 张已进入遗忘阶段 · ` : ''}轻触进入复习
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={theme.inkMuted} />
                </View>
              </FrostPanel>
            </Pressable>
          ) : null}

          {recommendedCards.length > 0 ? (
            <View style={styles.recommendWrap}>
              <View style={styles.sectionHead}>
                <View style={styles.sectionHeadRow}>
                  <View style={styles.sectionHeadText}>
                    <Text style={styles.sectionLabel}>今天推荐</Text>
                    <Text style={styles.sectionMeta}>每天更新一次 · 点击卡片从它开始 GET</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="换一批推荐"
                    onPress={() => { void refreshRecommendations(); }}
                    disabled={recoRefreshing}
                    style={({ pressed }) => [styles.recoRefreshButton, pressed && styles.pressed]}
                  >
                    {recoRefreshing
                      ? <ActivityIndicator size={16} color="rgba(255,255,255,0.85)" />
                      : <Ionicons name="refresh" size={17} color="rgba(255,255,255,0.85)" />}
                  </Pressable>
                </View>
              </View>
              {recommendedCards.map((card) => (
                <Pressable
                  key={card.id}
                  accessibilityRole="button"
                  accessibilityLabel="从这张卡片开始 GET"
                  onPress={() => onStartSession(card.id)}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
                  <KnowledgeCard compact card={card} settings={settings} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </ImageBackground>
    </BlurTargetView>
  );
}

// 首页毛玻璃卡片：blurTarget 指向整个壁纸背景 + 半透明纸色叠加。
function FrostPanel({ backgroundRef, theme, children }: { backgroundRef: React.RefObject<View | null>; theme: AppTheme; children: React.ReactNode }) {
  return (
    <BlurView
      intensity={theme.dark ? 45 : 60}
      tint={theme.dark ? 'dark' : 'light'}
      blurMethod="dimezisBlurViewSdk31Plus"
      blurTarget={backgroundRef}
      style={styles.frostPanel}
    >
      <View style={[styles.frostInner, { backgroundColor: theme.dark ? 'rgba(20,19,16,0.55)' : 'rgba(255,255,255,0.24)' }]}>{children}</View>
    </BlurView>
  );
}

function ProgressNum({ value, label, theme }: { value: string; label: string; theme: AppTheme }) {
  return (
    <View style={styles.progressNum}>
      <Text style={[styles.progressValue, { color: theme.ink }]}>{value}</Text>
      <Text style={[styles.progressLabel, { color: theme.inkMuted }]}>{label}</Text>
    </View>
  );
}

// 首页分享按钮的矢量图标（导出-分享样式）：白色固定，与旧 Ionicons 一致浮在壁纸上。
function ShareGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        d="M814.50688 1024H209.493547A210.133333 210.133333 0 0 1 0.000213 813.653333V295.68A210.133333 210.133333 0 0 1 209.493547 85.333333H298.66688a42.666667 42.666667 0 0 1 0 85.333334H209.493547A124.8 124.8 0 0 0 85.333547 295.68v517.973333A124.8 124.8 0 0 0 209.493547 938.666667h605.013333A124.8 124.8 0 0 0 938.66688 813.653333V469.333333a42.666667 42.666667 0 0 1 85.333333 0v344.32A210.133333 210.133333 0 0 1 814.50688 1024z"
        fill="#FFFFFF"
      />
      <Path
        d="M384.000213 768a42.666667 42.666667 0 0 1-42.666666-42.666667V384A213.333333 213.333333 0 0 1 554.66688 170.666667h426.666667a42.666667 42.666667 0 0 1 0 85.333333H554.66688a128 128 0 0 0-128 128v341.333333a42.666667 42.666667 0 0 1-42.666667 42.666667z"
        fill="#FFFFFF"
      />
      <Path
        d="M981.333547 256a42.666667 42.666667 0 0 1-30.08-12.586667l-170.666667-170.666666a42.666667 42.666667 0 0 1 0-60.16 42.666667 42.666667 0 0 1 60.16 0l170.666667 170.666666A42.666667 42.666667 0 0 1 981.333547 256z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#11110F' },
  screenInner: { flex: 1 },
  backgroundImage: { width: '100%', height: '100%' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  wallpaperPressArea: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  header: { paddingHorizontal: 16, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  dateBlock: { gap: 2 },
  brand: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '900', letterSpacing: 2.4, textTransform: 'uppercase', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dateNumber: { color: '#FFFFFF', fontSize: 46, lineHeight: 52, fontWeight: '300', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  dateMetaWrap: { paddingBottom: 7, gap: 1 },
  dateWeek: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  dateMonth: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,20,20,0.28)' },
  searchPill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: 'rgba(20,20,20,0.28)' },
  searchPillText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  content: { flex: 1 },
  contentInner: { paddingTop: 16, paddingHorizontal: 16, gap: 12 },
  frostPanel: { borderRadius: 24, overflow: 'hidden' },
  frostInner: { borderRadius: 24, paddingHorizontal: 20, paddingVertical: 16 },
  todayPanel: { gap: 8 },
  todayMainRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  todayValueCol: { flex: 1, gap: 8 },
  todayCta: { minHeight: 42, paddingHorizontal: 14 },
  todayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  todayValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  todayValue: { fontSize: 46, lineHeight: 52, fontWeight: '900', letterSpacing: -1.4 },
  todayUnit: { fontSize: 14, fontWeight: '800' },
  goalTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  goalFill: { height: 7, borderRadius: 4 },
  goalBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F2B737', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  goalBadgeText: { color: '#5D4218', fontSize: 11, fontWeight: '900' },
  todayMeta: { fontSize: 12, fontWeight: '700' },
  panelDivider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: -20, marginTop: 12, marginBottom: 14 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  reminderTextWrap: { flex: 1, gap: 2 },
  reminderTitle: { fontSize: 15, fontWeight: '900' },
  reminderMeta: { fontSize: 12, fontWeight: '600' },
  recommendWrap: { gap: 12 },
  sectionHead: { paddingHorizontal: 4 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionHeadText: { flex: 1, gap: 2 },
  recoRefreshButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,20,20,0.28)' },
  sectionLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.4, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  sectionMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  progressRow: { flexDirection: 'row' },
  progressNum: { flex: 1, alignItems: 'center', gap: 3 },
  progressValue: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  progressLabel: { fontSize: 11, fontWeight: '700' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
