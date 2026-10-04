import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CARD_REMOTE_IMAGE_URLS, imageSourceLabel } from '../config/imageUrls';
import type { Settings, SettingsSection } from '../domain/types';
import { fontOptions } from '../theme/fonts';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';
import { APP_VERSION } from './SettingsDetailScreen';

type Props = { settings: Settings; onOpenSection: (section: SettingsSection) => void };

type Entry = {
  key: SettingsSection;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: (settings: Settings) => string;
};

const themeLabels = { system: '跟随系统', light: '亮色', dark: '暗色' } as const;
const cardModeLabels = { local: '本地图库', remote: '远程壁纸', hidden: '不显示' } as const;
const spacingLabels: Record<number, string> = { [-1]: '紧凑', 0: '标准', 1: '宽松', 2: '加宽' };

// 设置一级页：只展示各分类的入口，具体配置在对应的二级页面里（经 settingsDetail 路由进入）。
export function SettingsScreen({ settings, onOpenSection }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  const activeFont = fontOptions.find((font) => font.key === settings.fontFamily);
  const goalLabel = settings.dailyGetGoal > 0 ? `每日目标 ${settings.dailyGetGoal} 张` : '每日目标关闭';

  const entries: Entry[] = [
    {
      key: 'reading',
      icon: 'text-outline',
      title: '阅读设置',
      summary: () => `${activeFont?.label ?? settings.fontFamily} · 字号 ${settings.fontSize} · 间距 ${spacingLabels[settings.fontLetterSpacing] ?? '标准'} · ${themeLabels[settings.themeMode]}`,
    },
    {
      key: 'pacing',
      icon: 'speedometer-outline',
      title: '阅读节奏',
      summary: () => `每轮 ${settings.sessionCardCount} 张 · ${goalLabel}`,
    },
    {
      key: 'wallpaper',
      icon: 'image-outline',
      title: '首页壁纸',
      summary: () => `壁纸源：${imageSourceLabel(settings.homeBackgroundImageUrl)}`,
    },
    {
      key: 'card',
      icon: 'layers-outline',
      title: '卡片背景',
      summary: () => `显示模式：${cardModeLabels[settings.cardHeaderImageMode]}${(CARD_REMOTE_IMAGE_URLS as readonly string[]).includes(settings.cardBackgroundImageUrl) ? ` · ${imageSourceLabel(settings.cardBackgroundImageUrl)}` : ''}`,
    },
    {
      key: 'data',
      icon: 'archive-outline',
      title: '数据管理',
      summary: () => '备份导出与导入 · 清空本地数据',
    },
    {
      key: 'about',
      icon: 'information-circle-outline',
      title: '基础信息',
      summary: () => `版本 ${Constants.expoConfig?.version ?? APP_VERSION}`,
    },
  ];

  // 与系统设置一致的分块：学习相关一块、壁纸相关一块、数据与基础信息各自单独一块。
  const groups: Entry[][] = [
    [entries[0], entries[1]],
    [entries[2], entries[3]],
    [entries[4]],
    [entries[5]],
  ];

  return (
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      {groups.map((group, groupIndex) => (
        <View key={`settings-group-${groupIndex}`} style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          {group.map((entry, index) => (
            <Pressable
              key={entry.key}
              accessibilityRole="button"
              accessibilityLabel={`进入${entry.title}`}
              onPress={() => onOpenSection(entry.key)}
              style={({ pressed }) => [styles.row, index > 0 && [styles.dividerTop, { borderTopColor: theme.line }], pressed && styles.pressed]}
            >
              <View style={[styles.rowIcon, { backgroundColor: theme.paperSoft }]}>
                <Ionicons name={entry.icon} size={18} color={theme.accent} />
              </View>
              <View style={styles.rowTexts}>
                <Text style={[styles.rowTitle, { color: theme.ink, fontFamily }]}>{entry.title}</Text>
                <Text numberOfLines={1} style={[styles.rowSummary, { color: theme.inkMuted, fontFamily }]}>{entry.summary(settings)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.inkMuted} />
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 140, gap: 14 },
  hint: { fontSize: 12, lineHeight: 18, fontWeight: '600', marginTop: 2 },
  card: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DED2BE' },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTexts: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowSummary: { fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});
