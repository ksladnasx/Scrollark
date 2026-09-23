import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { resetAllData, updateSetting } from '../data/repository';
import type { Settings } from '../domain/types';
import { fontOptions } from '../theme/fonts';
import { palette, radius } from '../theme/tokens';

type Props = { settings: Settings; onSettingsChanged: (settings: Settings) => void; onReset: () => void };

export function SettingsScreen({ settings, onSettingsChanged, onReset }: Props) {
  const update = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    await updateSetting(key, value);
    onSettingsChanged({ ...settings, [key]: value });
  };

  const confirmReset = () => {
    Alert.alert('清空本地数据', '会删除导入文档、卡片、收藏、批注和统计事件。此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: async () => { await resetAllData(); onReset(); } },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Settings</Text>
        <Text style={styles.title}>我的</Text>
        <Text style={styles.subtitle}>字体、字号、颜色和封面会立即写入本地数据库，重新打开应用后仍会生效。</Text>
      </View>

      <SettingBlock title="阅读字体" description="使用 fonts 文件夹里的本地字体，卡片正文和标题会同步切换。">
        {fontOptions.map((font, index) => (
          <Chip key={`font-${font.key}-${index}`} label={font.label} active={settings.fontFamily === font.key} previewFont={font.key} onPress={() => update('fontFamily', font.key)} />
        ))}
      </SettingBlock>

      <SettingBlock title="每轮卡片数" description="决定点击继续阅读后，一次抽取多少张卡片。">
        {[10, 20, 30].map((count, index) => <Chip key={`count-${count}-${index}`} label={`${count}`} active={settings.sessionCardCount === count} onPress={() => update('sessionCardCount', count)} />)}
      </SettingBlock>

      <SettingBlock title="正文字号" description="影响刷卡页面与卡片预览的 Markdown 正文。">
        {[16, 18, 20, 22].map((size, index) => <Chip key={`size-${size}-${index}`} label={`${size}`} active={settings.fontSize === size} onPress={() => update('fontSize', size)} />)}
      </SettingBlock>

      <SettingBlock title="文字颜色" description="提供克制的阅读配色。">
        {[
          ['墨黑', '#171611'],
          ['松绿', '#30443A'],
          ['深蓝', '#263E4B'],
          ['暖棕', '#5B3B28'],
        ].map(([label, color], index) => <Chip key={`color-${color}-${index}`} label={label} active={settings.fontColor === color} onPress={() => update('fontColor', color)} />)}
      </SettingBlock>

      <SettingBlock title="首页头图" description="选择应用进入时的沉浸式头图，同时会作为卡片 Header 的风格参考。">
        {[
          ['暖纸 1', 'warm0'],
          ['暖纸 2', 'warm1'],
          ['夜色 1', 'dark0'],
          ['夜色 2', 'dark1'],
        ].map(([label, key], index) => <Chip key={`header-${key}-${index}`} label={label} active={settings.headerImage === key} onPress={() => update('headerImage', key)} />)}
      </SettingBlock>

      <AppButton label="清空本地数据" icon="trash-outline" variant="light" onPress={confirmReset} />
    </ScrollView>
  );
}

function SettingBlock({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={styles.blockDesc}>{description}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ label, active, onPress, previewFont }: { label: string; active: boolean; onPress: () => void; previewFont?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Text style={[styles.chipText, previewFont ? { fontFamily: previewFont } : null, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, paddingBottom: 38, gap: 14 },
  header: { gap: 7 },
  eyebrow: { color: palette.inkMuted, textTransform: 'uppercase', fontWeight: '900', letterSpacing: 1.2, fontSize: 12 },
  title: { color: palette.ink, fontSize: 38, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { color: palette.inkMuted, fontSize: 15, lineHeight: 23 },
  block: { borderRadius: radius.xl, backgroundColor: palette.paperElevated, padding: 18, borderWidth: 1, borderColor: palette.line, gap: 8 },
  blockTitle: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  blockDesc: { color: palette.inkMuted, fontSize: 13, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 6 },
  chip: { minHeight: 40, borderRadius: radius.pill, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paperSoft },
  chipActive: { backgroundColor: palette.accent },
  chipText: { color: palette.ink, fontWeight: '800' },
  chipTextActive: { color: palette.paper },
});
