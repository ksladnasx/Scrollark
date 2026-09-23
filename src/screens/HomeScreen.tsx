import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Settings, Statistics, TabKey } from '../domain/types';
import { HOME_BACKGROUND_IMAGE_URL, withImageCacheBuster } from '../config/imageUrls';
import { palette, shadow } from '../theme/tokens';

type Props = {
  stats: Statistics;
  settings: Settings;
  onStartSession: () => void;
  onNavigate: (tab: TabKey) => void;
};

const menu: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap; tab: TabKey }[] = [
  { id: 'stats', label: '统计', icon: 'bar-chart-outline', tab: 'stats' },
  { id: 'library', label: '知识库', icon: 'library-outline', tab: 'knowledge' },
  { id: 'favorites', label: '收藏', icon: 'heart-outline', tab: 'favorites' },
  { id: 'settings', label: '设置', icon: 'settings-outline', tab: 'settings' },
];

const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function HomeScreen({ stats, settings, onStartSession, onNavigate }: Props) {
  const homeImage = React.useMemo(() => ({ uri: withImageCacheBuster(HOME_BACKGROUND_IMAGE_URL, `home-${Date.now()}-${Math.random().toString(36).slice(2)}`) }), []);

  const today = React.useMemo(() => {
    const date = new Date();
    const week = weekDays[date.getDay()];
    return {
      day: String(date.getDate()).padStart(2, '0'),
      meta: `${week} · ${date.getFullYear()}年${date.getMonth() + 1}月`,
    };
  }, []);


  return (
    <ImageBackground source={homeImage} resizeMode="cover" style={styles.screen} imageStyle={styles.backgroundImage}>
      <View style={styles.scrim} />

      <View style={styles.topArea}>
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
            <Text style={styles.dateNumber}>{today.day}</Text>
            <Text style={styles.dateMeta}>{today.meta}</Text>
          </View>
          <Pressable onPress={() => onNavigate('stats')} style={({ pressed }) => [styles.signButton, pressed && styles.pressed]}>
            <Text style={styles.signText}>查看统计</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.bottomArea}>
        <View style={styles.panel}>
          <View style={styles.continueRow}>
            <View style={styles.continueBox}>
              <Pressable onPress={onStartSession} style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}>
                <Text style={[styles.continueText, { fontFamily: settings.fontFamily }]}>继续阅读</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => onNavigate('knowledge')} style={styles.libraryBox}>
              <Ionicons name="library-outline" size={30} color={palette.ink} />
              <Text style={styles.libraryText}>知识库</Text>
            </Pressable>
          </View>

          <View style={styles.quickGrid}>
            <Quick icon="albums-outline" label="卡片" value={`${stats.totalCards}`} onPress={() => onNavigate('knowledge')} />
            <Quick icon="checkmark-circle-outline" label="已 Get" value={`${stats.gotCards}`} onPress={() => onNavigate('stats')} />
            <Quick icon="heart-outline" label="收藏" value={`${stats.favoriteCards}`} onPress={() => onNavigate('favorites')} />
            <Quick icon="chatbubble-ellipses-outline" label="批注" value={`${stats.annotatedCards}`} onPress={() => onNavigate('favorites')} />
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

function Quick({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
      <Ionicons name={icon} size={28} color={palette.ink} />
      <Text style={styles.quickValue}>{value}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#11110F', justifyContent: 'space-between' },
  backgroundImage: { width: '100%', height: '100%' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  topArea: { flex: 1, paddingTop: 44, paddingHorizontal: 16, paddingBottom: 10 },
  topMenu: { alignSelf: 'flex-end', flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(20,20,20,0.22)' },
  menuItem: { alignItems: 'center', minWidth: 44, gap: 3 },
  menuText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  dateCard: { alignSelf: 'flex-end', marginTop: 'auto', width: 164, borderRadius: 10, padding: 14, backgroundColor: 'rgba(111,105,72,0.72)', gap: 12 },
  dateNumber: { color: '#FFFFFF', fontSize: 56, lineHeight: 60, fontWeight: '300' },
  dateMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 16 },
  signButton: { height: 43, borderRadius: 7, backgroundColor: '#F2B737', alignItems: 'center', justifyContent: 'center' },
  signText: { color: '#5D4218', fontSize: 18, fontWeight: '700' },
  bottomArea: { paddingHorizontal: 0, paddingBottom: 0 },
  dots: { height: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.9)' },
  panel: { minHeight: 226, paddingHorizontal: 32, paddingTop: 26, paddingBottom: 32, backgroundColor: 'rgba(255,255,255,0.94)', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  continueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  continueBox: { flex: 1, alignItems: 'center', gap: 14 },
  continueButton: { width: '100%', maxWidth: 282, height: 62, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#405991', ...shadow.soft },
  continueText: { color: '#FFFFFF', fontSize: 26, letterSpacing: 7, fontWeight: '400' },
  importLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  importText: { color: '#555555', fontSize: 15 },
  unlockPill: { borderRadius: 18, backgroundColor: '#D4554D', paddingHorizontal: 13, paddingVertical: 7 },
  unlockText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  libraryBox: { width: 64, alignItems: 'center', gap: 5 },
  libraryText: { color: '#222222', fontSize: 16 },
  message: { marginTop: 10, color: palette.blue, textAlign: 'center', fontSize: 13 },
  quickGrid: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-between' },
  quick: { width: 64, alignItems: 'center', gap: 4 },
  quickValue: { color: '#777777', fontSize: 12 },
  quickLabel: { color: '#333333', fontSize: 16 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
