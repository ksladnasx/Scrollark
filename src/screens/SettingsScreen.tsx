import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { resetAllData, updateSetting } from '../data/repository';
import type { Settings } from '../domain/types';
import { fontOptions } from '../theme/fonts';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius, type AppTheme } from '../theme/tokens';
import { refreshHomeBackgroundImageUri } from '../utils/homeBackground';

type Props = { settings: Settings; onSettingsChanged: (settings: Settings) => void; onReset: () => void };

function readableSettingsColor(theme: AppTheme, color: string) {
  if (!theme.dark) return color;
  return color === '#171611' || color === '#30443A' || color === '#263E4B' || color === '#5B3B28' ? theme.ink : color;
}

export function SettingsScreen({ settings, onSettingsChanged, onReset }: Props) {
  const theme = useAppTheme();
  const [backgroundBusy, setBackgroundBusy] = React.useState(false);
  const [backgroundMessage, setBackgroundMessage] = React.useState('');
  const previewColor = readableSettingsColor(theme, settings.fontColor);

  const update = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    await updateSetting(key, value);
    onSettingsChanged({ ...settings, [key]: value });
  };

  const switchHomeBackground = async () => {
    try {
      setBackgroundBusy(true);
      setBackgroundMessage('');
      await refreshHomeBackgroundImageUri();
      setBackgroundMessage('首页背景已切换，回到首页即可看到新图。');
    } catch (error) {
      setBackgroundMessage(error instanceof Error ? error.message : '切换失败，请稍后再试');
    } finally {
      setBackgroundBusy(false);
    }
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
        <Text style={[styles.eyebrow, { color: theme.inkMuted, fontFamily: settings.fontFamily }]}>Settings</Text>
        <Text style={[styles.title, { color: previewColor, fontFamily: settings.fontFamily }]}>设置</Text>
        <Text style={[styles.subtitle, { color: previewColor, fontFamily: settings.fontFamily, fontSize: Math.max(15, settings.fontSize - 2), lineHeight: Math.max(23, settings.fontSize + 5) }]}>字体、图片、主题和阅读偏好会立即写入本地数据库，重新打开应用后仍会生效。</Text>
      </View>

      <SettingBlock title="阅读字体" description="使用 fonts 文件夹里的本地字体，卡片正文和标题会同步切换。" theme={theme} settings={settings}>
        {fontOptions.map((font, index) => (
          <Chip key={`font-${font.key}-${index}`} label={font.label} active={settings.fontFamily === font.key} previewFont={font.key} theme={theme} settings={settings} onPress={() => update('fontFamily', font.key)} />
        ))}
      </SettingBlock>

      <SettingBlock title="显示模式" description="可以固定亮色、固定暗色，也可以跟随手机系统。" theme={theme} settings={settings}>
        {[
          ['跟随系统', 'system'],
          ['亮色', 'light'],
          ['暗色', 'dark'],
        ].map(([label, mode], index) => <Chip key={`theme-${mode}-${index}`} label={label} active={settings.themeMode === mode} theme={theme} settings={settings} onPress={() => update('themeMode', mode as Settings['themeMode'])} />)}
      </SettingBlock>

      <SettingBlock title="首页壁纸" description="首页每天会自动请求并缓存一张新图，第二天会覆盖旧图；也可以在这里手动立即切换。" theme={theme} settings={settings}>
        <AppButton label="立即切换首页背景" icon="image-outline" variant="light" loading={backgroundBusy} onPress={switchHomeBackground} />
        {backgroundMessage ? <Text style={[styles.inlineMessage, { color: previewColor, fontFamily: settings.fontFamily, fontSize: Math.max(13, settings.fontSize - 3) }]}>{backgroundMessage}</Text> : null}
      </SettingBlock>

      <SettingBlock title="每轮卡片数" description="决定点击继续阅读后，一次抽取多少张卡片。" theme={theme} settings={settings}>
        {[10, 20, 30].map((count, index) => <Chip key={`count-${count}-${index}`} label={`${count}`} active={settings.sessionCardCount === count} theme={theme} settings={settings} onPress={() => update('sessionCardCount', count)} />)}
      </SettingBlock>

      <SettingBlock title="正文字号" description="影响刷卡页面与卡片预览的 Markdown 正文，设置页文字也会立即跟随变化。" theme={theme} settings={settings}>
        {[16, 18, 20, 22].map((size, index) => <Chip key={`size-${size}-${index}`} label={`${size}`} active={settings.fontSize === size} theme={theme} settings={settings} onPress={() => update('fontSize', size)} />)}
      </SettingBlock>

      <SettingBlock title="文字颜色" description="提供克制的阅读配色；设置页预览文字也会立即跟随变化。" theme={theme} settings={settings}>
        {[
          ['墨黑', '#171611'],
          ['松绿', '#30443A'],
          ['深蓝', '#263E4B'],
          ['暖棕', '#5B3B28'],
        ].map(([label, color], index) => <Chip key={`color-${color}-${index}`} label={label} active={settings.fontColor === color} theme={theme} settings={settings} onPress={() => update('fontColor', color)} />)}
      </SettingBlock>

      <SettingBlock title="卡片头图" description="控制刷卡页面与卡片详情顶部图片的来源；关闭后会显示轻量文字头部。" theme={theme} settings={settings}>
        {[
          ['本地随机', 'local'],
          ['网络图片', 'remote'],
          ['关闭图片', 'hidden'],
        ].map(([label, mode], index) => <Chip key={`card-header-${mode}-${index}`} label={label} active={settings.cardHeaderImageMode === mode} theme={theme} settings={settings} onPress={() => update('cardHeaderImageMode', mode as Settings['cardHeaderImageMode'])} />)}
      </SettingBlock>

      <AppButton label="清空本地数据" icon="trash-outline" variant="light" onPress={confirmReset} />
    </ScrollView>
  );
}

function SettingBlock({ title, description, children, theme, settings }: { title: string; description: string; children: React.ReactNode; theme: AppTheme; settings: Settings }) {
  const previewColor = readableSettingsColor(theme, settings.fontColor);
  return (
    <View style={[styles.block, { backgroundColor: theme.paperElevated, borderColor: theme.line }] }>
      <Text style={[styles.blockTitle, { color: previewColor, fontFamily: settings.fontFamily, fontSize: Math.max(18, settings.fontSize) }]}>{title}</Text>
      <Text style={[styles.blockDesc, { color: previewColor, fontFamily: settings.fontFamily, fontSize: Math.max(13, settings.fontSize - 3), lineHeight: Math.max(20, settings.fontSize + 4) }]}>{description}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ label, active, onPress, previewFont, theme, settings }: { label: string; active: boolean; onPress: () => void; previewFont?: string; theme: AppTheme; settings: Settings }) {
  const previewColor = readableSettingsColor(theme, settings.fontColor);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, { backgroundColor: theme.paperSoft }, active && { backgroundColor: theme.accent }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <Text style={[styles.chipText, { color: active ? theme.paper : previewColor, fontFamily: previewFont ?? settings.fontFamily, fontSize: Math.max(14, settings.fontSize - 2) }]}>{label}</Text>
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
  inlineMessage: { width: '100%', fontSize: 13, lineHeight: 20, fontWeight: '700' },
});