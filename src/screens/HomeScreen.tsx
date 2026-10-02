import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import React from 'react';
import { Alert, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CardRecord, Settings, Statistics, TabKey } from '../domain/types';
import { heroImages } from '../theme/assets';
import { getDailyHomeBackgroundImageUri, getCachedHomeBackgroundImageUri, saveHomeBackgroundImageToDirectory } from '../utils/homeBackground';
import { getRecommendedCards } from '../data/repository';
import { KnowledgeCard } from '../components/KnowledgeCard';
import { AppButton } from '../components/AppButton';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, type AppTheme } from '../theme/tokens';

type Props = {
  stats: Statistics;
  settings: Settings;
  onStartSession: () => void;
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
  // 「今天推荐」：从全部卡片中随机挑几张做内容展示；点击进入随机 GET。
  const [recommendedCards, setRecommendedCards] = React.useState<CardRecord[]>([]);

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

  // 随着卡片被 GET / 导入，推荐位自动换下一批。
  React.useEffect(() => {
    let alive = true;
    getRecommendedCards(3)
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

  const downloadBackground = React.useCallback(async () => {
    if (downloadBusy) return;
    try {
      setDownloadBusy(true);
      const sourceUri = homeImageUri ?? await getDailyHomeBackgroundImageUri(settings.homeBackgroundImageUrl);
      const savedUri = await saveHomeBackgroundImageToDirectory(sourceUri, settings.homeBackgroundDownloadDirectory);
      Alert.alert('下载完成', `背景图已保存到：\n${savedUri}`);
    } catch (error) {
      Alert.alert('下载失败', error instanceof Error ? error.message : '背景图保存失败，请稍后再试。');
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, homeImageUri, settings.homeBackgroundDownloadDirectory, settings.homeBackgroundImageUrl]);

  const confirmDownloadBackground = React.useCallback(() => {
    if (downloadBusy) return;
    Alert.alert('下载背景图', '是否下载当前首页背景图？', [
      { text: '取消', style: 'cancel' },
      { text: '下载', onPress: () => { void downloadBackground(); } },
    ]);
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
  const todayCta = goalOn && goalReached
    ? { label: '去复习', icon: 'repeat' as const, onPress: onStartAheadReview }
    : { label: '去 GET 新卡', icon: 'flash-outline' as const, onPress: onStartSession };

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
                <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
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
                <Text style={styles.sectionLabel}>今天推荐</Text>
                <Text style={styles.sectionMeta}>从全部卡片中随机抽取 · 点击进入随机 GET</Text>
              </View>
              {recommendedCards.map((card) => (
                <Pressable
                  key={card.id}
                  accessibilityRole="button"
                  accessibilityLabel="进入随机 GET"
                  onPress={onStartSession}
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
  sectionHead: { paddingHorizontal: 4, gap: 2 },
  sectionLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.4, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  sectionMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  progressRow: { flexDirection: 'row' },
  progressNum: { flex: 1, alignItems: 'center', gap: 3 },
  progressValue: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  progressLabel: { fontSize: 11, fontWeight: '700' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
