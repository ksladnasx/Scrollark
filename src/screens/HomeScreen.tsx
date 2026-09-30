import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, ImageBackground, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import type { Settings, Statistics, TabKey } from '../domain/types';
import { heroImages } from '../theme/assets';
import { getDailyHomeBackgroundImageUri, getCachedHomeBackgroundImageUri, saveHomeBackgroundImageToDirectory } from '../utils/homeBackground';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, shadow, type AppTheme } from '../theme/tokens';

type Props = {
  stats: Statistics;
  settings: Settings;
  onStartSession: () => void;
  onNavigate: (tab: TabKey) => void;
  onSearch: () => void;
};

const menu: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap; tab: TabKey }[] = [
  { id: 'stats', label: '统计', icon: 'bar-chart-outline', tab: 'stats' },
  { id: 'library', label: '知识库', icon: 'library-outline', tab: 'knowledge' },
  { id: 'favorites', label: '收藏', icon: 'heart-outline', tab: 'favorites' },
  { id: 'settings', label: '设置', icon: 'settings-outline', tab: 'settings' },
];

const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const heroImageKeys = Object.keys(heroImages);

function pickLocalHomeImage(): ImageSourcePropType {
  const key = heroImageKeys[Math.floor(Math.random() * heroImageKeys.length)] ?? 'warm0';
  return heroImages[key] ?? heroImages.warm0;
}

export function HomeScreen({ stats, settings, onStartSession, onNavigate, onSearch }: Props) {
  const theme = useAppTheme();
  const fallbackHomeImage = React.useMemo<ImageSourcePropType>(() => pickLocalHomeImage(), []);
  // 初始化时同步读本地缓存的壁纸，跨天下载新图期间也先显示旧图，避免闪变。
  const [homeImageUri, setHomeImageUri] = React.useState<string | null>(() => getCachedHomeBackgroundImageUri());
  const [homeImage, setHomeImage] = React.useState<ImageSourcePropType>(homeImageUri ? { uri: homeImageUri } : fallbackHomeImage);
  const [downloadBusy, setDownloadBusy] = React.useState(false);

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
      meta: `${week} · ${date.getFullYear()}年${date.getMonth() + 1}月`,
    };
  }, []);

  const goalProgress = stats.goal > 0 ? Math.min(100, Math.round((stats.todayGets / stats.goal) * 100)) : 0;
  const goalReached = stats.goal > 0 && stats.todayGets >= stats.goal;

  return (
    <ImageBackground source={homeImage} resizeMode="cover" style={styles.screen} imageStyle={styles.backgroundImage}>
      <Pressable style={styles.backgroundPressArea} delayLongPress={600} onLongPress={confirmDownloadBackground}>
        <View style={styles.scrim} />
      </Pressable>

      <View style={styles.topArea} pointerEvents="box-none">
        <View style={styles.topMenu}>
          {menu.map((item) => (
            <Pressable key={`home-menu-${item.id}`} onPress={() => onNavigate(item.tab)} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}>
              <Ionicons name={item.icon} size={18} color="#FFFFFF" />
              <Text style={styles.menuText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.dateCard}>
          <View>
            <View ><Text style={styles.dateNumber}>{today.day}</Text></View>
            <Text style={styles.dateMeta}>{today.meta}</Text>
          </View>
          <Pressable onPress={() => onNavigate('stats')} style={({ pressed }) => [styles.signButton, pressed && styles.pressed]}>
            <Text style={styles.signText}>查看统计</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.bottomArea}>
        <View style={[styles.panel, { backgroundColor: theme.dark ? 'rgba(27,26,23,0.95)' : 'rgba(255,255,255,0.94)' }] }>
            <View style={styles.continueRow}>
              <View style={styles.continueBox}>
                <Pressable onPress={onStartSession} style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}>
                  <Text style={[styles.continueText, { fontFamily: settings.fontFamily }]}>{goalReached ? '继续打卡' : '继续阅读'}</Text>
                </Pressable>
              </View>
            <Pressable onPress={onSearch} style={({ pressed }) => [styles.libraryBox, pressed && styles.pressed]}>
              <Ionicons name="search-outline" size={30} color={theme.ink} />
              <Text style={[styles.libraryText, { color: theme.ink }]}>搜索</Text>
            </Pressable>
          </View>

          {stats.goal > 0 ? (
            <View style={styles.goalRow}>
              <View style={styles.goalHead}>
                <Text style={[styles.goalLabel, { color: theme.inkMuted }]}>今日目标 · {stats.todayGets}/{stats.goal}</Text>
                <Text style={[styles.goalStatus, { color: goalReached ? theme.accent : theme.inkMuted }]}>
                  {goalReached ? `已打卡 · 连续 ${stats.streakDays} 天` : `再 get ${stats.goal - stats.todayGets} 张`}
                </Text>
              </View>
              <View style={[styles.goalTrack, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(23,22,17,0.08)' }]}>
                <View style={[styles.goalFill, { width: `${goalProgress}%`, backgroundColor: goalReached ? '#F2B737' : theme.accent }]} />
              </View>
            </View>
          ) : null}

          <View style={styles.quickGrid}>
            <Quick icon="albums-outline" label="卡片" value={`${stats.totalCards}`} onPress={() => onNavigate('knowledge')} theme={theme} />
            <Quick icon="checkmark-circle-outline" label="已 Get" value={`${stats.gotCards}`} onPress={() => onNavigate('stats')} theme={theme} />
            <Quick icon="heart-outline" label="收藏" value={`${stats.favoriteCards}`} onPress={() => onNavigate('favorites')} theme={theme} />
            <Quick icon="chatbubble-ellipses-outline" label="批注" value={`${stats.annotatedCards}`} onPress={() => onNavigate('favorites')} theme={theme} />
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

function Quick({ icon, label, value, onPress, theme }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress: () => void; theme: AppTheme }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
      <Ionicons name={icon} size={28} color={theme.ink} />
      <Text style={[styles.quickValue, { color: theme.inkMuted }]}>{value}</Text>
      <Text style={[styles.quickLabel, { color: theme.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#11110F', justifyContent: 'space-between' },
  backgroundImage: { width: '100%', height: '100%' },
  backgroundPressArea: { ...StyleSheet.absoluteFillObject },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  topArea: { flex: 1, paddingTop: 44, paddingHorizontal: 16, paddingBottom: 10 },
  topMenu: { alignSelf: 'flex-end', flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(20,20,20,0.22)' },
  menuItem: { alignItems: 'center', minWidth: 44, gap: 3 },
  menuText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  dateCard: { alignSelf: 'flex-end', marginTop: 'auto', width: 164, borderRadius: 10, padding: 14, backgroundColor: 'rgba(111,105,72,0.72)', gap: 12 },
  dateNumber: { color: '#FFFFFF', fontSize: 56, lineHeight: 60, fontWeight: '300', textAlign: 'center' },
  dateMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 16 },
  signButton: { height: 43, borderRadius: 7, backgroundColor: '#F2B737', alignItems: 'center', justifyContent: 'center' },
  signText: { color: '#5D4218', fontSize: 18, fontWeight: '700' },
  bottomArea: { paddingHorizontal: 0, paddingBottom: 0 },
  panel: { minHeight: 226, paddingHorizontal: 32, paddingTop: 26, paddingBottom: 32, backgroundColor: 'rgba(255,255,255,0.94)', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  continueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  continueBox: { flex: 1, alignItems: 'center', gap: 14 },
  continueButton: { width: '100%', maxWidth: 282, height: 62, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#405991', ...shadow.soft },
  continueText: { color: '#FFFFFF', fontSize: 26, letterSpacing: 7, fontWeight: '400' },
  libraryBox: { width: 64, alignItems: 'center', gap: 5 },
  libraryText: { color: '#222222', fontSize: 16 },
  message: { marginTop: 10, color: palette.blue, textAlign: 'center', fontSize: 13 },
  goalRow: { marginTop: 20, gap: 8 },
  goalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  goalStatus: { fontSize: 12, fontWeight: '800' },
  goalTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  goalFill: { height: 8, borderRadius: 4 },
  quickGrid: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between' },
  quick: { width: 64, alignItems: 'center', gap: 4 },
  quickValue: { color: '#777777', fontSize: 12 },
  quickLabel: { color: '#333333', fontSize: 16 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
