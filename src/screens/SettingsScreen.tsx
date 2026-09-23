import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { resetAllData, updateSetting } from '../data/repository';
import type { Settings } from '../domain/types';
import { fontOptions } from '../theme/fonts';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius, type AppTheme } from '../theme/tokens';

type Props = { settings: Settings; onSettingsChanged: (settings: Settings) => void; onReset: () => void };

export function SettingsScreen({ settings, onSettingsChanged, onReset }: Props) {
  const theme = useAppTheme();
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
    <ScrollView style={{ backgroundColor: theme.paper }} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.inkMuted }]}>Settings</Text>
        <Text style={[styles.title, { color: theme.ink }]}>设置</Text>
        <Text style={[styles.subtitle, { color: theme.inkMuted }]}>字体、图片、主题和阅读偏好会立即写入本地数据库，重新打开应用后仍会生效。</Text>
      </View>

      <SettingBlock title="阅读字体" description="使用 fonts 文件夹里的本地字体，卡片正文和标题会同步切换。" theme={theme}>
        {fontOptions.map((font, index) => (
          <Chip key={`font-${font.key}-${index}`} label={font.label} active={settings.fontFamily === font.key} previewFont={font.key} theme={theme} onPress={() => update('fontFamily', font.key)} />
        ))}
      </SettingBlock>

      <SettingBlock title="显示模式" description="可以固定亮色、固定暗色，也可以跟随手机系统。" theme={theme}>
        {[
          ['跟随系统', 'system'],
          ['亮色', 'light'],
          ['暗色', 'dark'],
        ].map(([label, mode], index) => <Chip key={`theme-${mode}-${index}`} label={label} active={settings.themeMode === mode} theme={theme} onPress={() => update('themeMode', mode as Settings['themeMode'])} />)}
      </SettingBlock>

      <SettingBlock title="首页壁纸" description="选择首页背景使用固定本地壁纸，或每次加载网络图片。" theme={theme}>
        {[
          ['网络图片', 'remote'],
          ['固定壁纸', 'local'],
        ].map(([label, mode], index) => <Chip key={`home-bg-${mode}-${index}`} label={label} active={settings.homeBackgroundImageMode === mode} theme={theme} onPress={() => update('homeBackgroundImageMode', mode as Settings['homeBackgroundImageMode'])} />)}
      </SettingBlock>

      <SettingBlock title="每轮卡片数" description="决定点击继续阅读后，一次抽取多少张卡片。" theme={theme}>
        {[10, 20, 30].map((count, index) => <Chip key={`count-${count}-${index}`} label={`${count}`} active={settings.sessionCardCount === count} theme={theme} onPress={() => update('sessionCardCount', count)} />)}
      </SettingBlock>

      <SettingBlock title="正文字号" description="影响刷卡页面与卡片预览的 Markdown 正文。" theme={theme}>
        {[16, 18, 20, 22].map((size, index) => <Chip key={`size-${size}-${index}`} label={`${size}`} active={settings.fontSize === size} theme={theme} onPress={() => update('fontSize', size)} />)}
      </SettingBlock>

      <SettingBlock title="文字颜色" description="提供克制的阅读配色；暗色模式下会自动保证默认文字可读。" theme={theme}>
        {[
          ['墨黑', '#171611'],
          ['松绿', '#30443A'],
          ['深蓝', '#263E4B'],
          ['暖棕', '#5B3B28'],
        ].map(([label, color], index) => <Chip key={`color-${color}-${index}`} label={label} active={settings.fontColor === color} theme={theme} onPress={() => update('fontColor', color)} />)}
      </SettingBlock>

      <SettingBlock title="卡片头图" description="控制刷卡页面与卡片详情顶部图片的来源；关闭后会显示轻量文字头部。" theme={theme}>
        {[
          ['本地随机', 'local'],
          ['网络图片', 'remote'],
          ['关闭图片', 'hidden'],
        ].map(([label, mode], index) => <Chip key={`card-header-${mode}-${index}`} label={label} active={settings.cardHeaderImageMode === mode} theme={theme} onPress={() => update('cardHeaderImageMode', mode as Settings['cardHeaderImageMode'])} />)}
      </SettingBlock>

      <AppButton label="清空本地数据" icon="trash-outline" variant="light" onPress={confirmReset} />
    </ScrollView>
  );
}

function SettingBlock({ title, description, children, theme }: { title: string; description: string; children: React.ReactNode; theme: AppTheme }) {
  return (
    <View style={[styles.block, { backgroundColor: theme.paperElevated, borderColor: theme.line }] }>
      <Text style={[styles.blockTitle, { color: theme.ink }]}>{title}</Text>
      <Text style={[styles.blockDesc, { color: theme.inkMuted }]}>{description}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ label, active, onPress, previewFont, theme }: { label: string; active: boolean; onPress: () => void; previewFont?: string; theme: AppTheme }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, { backgroundColor: theme.paperSoft }, active && { backgroundColor: theme.accent }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Text style={[styles.chipText, { color: active ? theme.paper : theme.ink }, previewFont ? { fontFamily: previewFont } : null]}>{label}</Text>
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
  chipText: { color: palette.ink, fontWeight: '800' },
});
