import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { HOME_BACKGROUND_IMAGE_URLS } from '../config/imageUrls';
import { resetAllData, updateSetting } from '../data/repository';
import type { Settings } from '../domain/types';
import { fontOptions } from '../theme/fonts';
import { useAppTheme } from '../theme/ThemeContext';
import { palette, radius, type AppTheme } from '../theme/tokens';
import { getReadableHomeBackgroundDownloadDirectory, pickHomeBackgroundDownloadDirectory, refreshHomeBackgroundImageUri } from '../utils/homeBackground';

type Props = { settings: Settings; onSettingsChanged: (settings: Settings) => void; onReset: () => void };

function readableSettingsColor(theme: AppTheme, color: string) {
  if (!theme.dark) return color;
  return color === '#171611' || color === '#30443A' || color === '#263E4B' || color === '#5B3B28' ? theme.ink : color;
}

function sourceLabel(url: string, index: number) {
  return index === 0 ? '随机壁纸源' : '自然壁纸源';
}

export function SettingsScreen({ settings, onSettingsChanged, onReset }: Props) {
  const theme = useAppTheme();
  const [backgroundBusy, setBackgroundBusy] = React.useState(false);
  const [backgroundMessage, setBackgroundMessage] = React.useState('');
  const [sourceOpen, setSourceOpen] = React.useState(false);
  const previewColor = readableSettingsColor(theme, settings.fontColor);

  const update = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    await updateSetting(key, value);
    onSettingsChanged({ ...settings, [key]: value });
  };

  const switchHomeBackground = async () => {
    try {
      setBackgroundBusy(true);
      setBackgroundMessage('');
      await refreshHomeBackgroundImageUri(settings.homeBackgroundImageUrl);
      setBackgroundMessage('首页背景已切换，回到首页即可看到新图。');
    } catch (error) {
      setBackgroundMessage(error instanceof Error ? error.message : '切换失败，请稍后再试');
    } finally {
      setBackgroundBusy(false);
    }
  };

  const changeHomeBackgroundSource = async (url: string) => {
    setSourceOpen(false);
    if (url === settings.homeBackgroundImageUrl) return;
    try {
      setBackgroundBusy(true);
      setBackgroundMessage('正在切换壁纸源并刷新首页背景……');
      await updateSetting('homeBackgroundImageUrl', url);
      onSettingsChanged({ ...settings, homeBackgroundImageUrl: url });
      await refreshHomeBackgroundImageUri(url);
      setBackgroundMessage('壁纸源已更新，并已为首页切换新背景。');
    } catch (error) {
      setBackgroundMessage(error instanceof Error ? error.message : '壁纸源切换失败，请稍后再试');
    } finally {
      setBackgroundBusy(false);
    }
  };

  const chooseDownloadDirectory = async () => {
    try {
      setBackgroundMessage('');
      const uri = await pickHomeBackgroundDownloadDirectory(settings.homeBackgroundDownloadDirectory);
      await update('homeBackgroundDownloadDirectory', uri);
      setBackgroundMessage('背景图下载目录已更新。');
    } catch {
      setBackgroundMessage('下载目录未更改。');
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

      <SettingBlock title="阅读字体" description="使用 fonts 文件夹里的本地字体，卡片正文和标题会同步切换。" theme={theme} settings={settings}>
        {fontOptions.map((font, index) => (
          <Chip key={`font-${font.key}-${index}`} label={font.label} active={settings.fontFamily === font.key} previewFont={font.key} theme={theme} settings={settings} onPress={() => { void update('fontFamily', font.key); }} />
        ))}
      </SettingBlock>

      <SettingBlock title="显示模式" description="可以固定亮色、固定暗色，也可以跟随手机系统。" theme={theme} settings={settings}>
        {[
          ['跟随系统', 'system'],
          ['亮色', 'light'],
          ['暗色', 'dark'],
        ].map(([label, mode], index) => <Chip key={`theme-${mode}-${index}`} label={label} active={settings.themeMode === mode} theme={theme} settings={settings} onPress={() => { void update('themeMode', mode as Settings['themeMode']); }} />)}
      </SettingBlock>

      <SettingBlock title="壁纸设置" description="可手动切换首页壁纸、选择壁纸源。长按首页背景默认保存到系统相册，也可以改为保存到指定文件夹。" theme={theme} settings={settings}>
        <AppButton label="立即切换首页背景" icon="image-outline" variant="light" loading={backgroundBusy} onPress={switchHomeBackground} />
        <SourceDropdown open={sourceOpen} onToggle={() => setSourceOpen((value) => !value)} value={settings.homeBackgroundImageUrl} onChange={changeHomeBackgroundSource} theme={theme} settings={settings} />
        <AppButton label="改为保存到文件夹" icon="folder-open-outline" variant="light" onPress={() => { void chooseDownloadDirectory(); }} />
        {settings.homeBackgroundDownloadDirectory ? <AppButton label="恢复默认保存到相册" icon="images-outline" variant="light" onPress={() => { void update('homeBackgroundDownloadDirectory', ''); }} /> : null}
        <Text style={[styles.directoryText, { color: previewColor, fontFamily: settings.fontFamily, fontSize: Math.max(12, settings.fontSize - 4), lineHeight: Math.max(18, settings.fontSize + 2) }]}>
          {getReadableHomeBackgroundDownloadDirectory(settings.homeBackgroundDownloadDirectory)}
        </Text>
        {backgroundMessage ? <Text style={[styles.inlineMessage, { color: previewColor, fontFamily: settings.fontFamily, fontSize: Math.max(13, settings.fontSize - 3) }]}>{backgroundMessage}</Text> : null}
      </SettingBlock>

      <SettingBlock title="每轮卡片数" description="决定点击继续阅读后，一次抽取多少张卡片。" theme={theme} settings={settings}>
        {[10, 20, 30].map((count, index) => <Chip key={`count-${count}-${index}`} label={`${count}`} active={settings.sessionCardCount === count} theme={theme} settings={settings} onPress={() => { void update('sessionCardCount', count); }} />)}
      </SettingBlock>

      <SettingBlock title="正文字号" description="影响刷卡页面与卡片预览的 Markdown 正文，设置页文字也会立即跟随变化。" theme={theme} settings={settings}>
        {[16, 18, 20, 22].map((size, index) => <Chip key={`size-${size}-${index}`} label={`${size}`} active={settings.fontSize === size} theme={theme} settings={settings} onPress={() => { void update('fontSize', size); }} />)}
      </SettingBlock>

      <SettingBlock title="文字颜色" description="提供克制的阅读配色；设置页预览文字也会立即跟随变化。" theme={theme} settings={settings}>
        {[
          ['墨黑', '#171611'],
          ['松绿', '#30443A'],
          ['深蓝', '#263E4B'],
          ['暖棕', '#5B3B28'],
        ].map(([label, color], index) => <Chip key={`color-${color}-${index}`} label={label} active={settings.fontColor === color} theme={theme} settings={settings} onPress={() => { void update('fontColor', color); }} />)}
      </SettingBlock>

      {/* Card header image source setting is hidden; setting value and rendering logic are kept. */}

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

function SourceDropdown({ open, value, onToggle, onChange, theme, settings }: { open: boolean; value: string; onToggle: () => void; onChange: (value: string) => void; theme: AppTheme; settings: Settings }) {
  const previewColor = readableSettingsColor(theme, settings.fontColor);
  const selectedIndex = Math.max(0, HOME_BACKGROUND_IMAGE_URLS.findIndex((url) => url === value));
  return (
    <View style={styles.dropdownWrap}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.dropdownButton, { backgroundColor: theme.paperSoft, borderColor: theme.line }, pressed && styles.pressedSmall]}>
        <View style={styles.dropdownTextWrap}>
          <Text style={[styles.dropdownLabel, { color: previewColor, fontFamily: settings.fontFamily }]}>更改首页壁纸源</Text>
          <Text numberOfLines={1} style={[styles.dropdownValue, { color: previewColor, fontFamily: settings.fontFamily }]}>{sourceLabel(value, selectedIndex)}</Text>
          <Text numberOfLines={1} style={[styles.dropdownUrl, { color: theme.inkMuted, fontFamily: settings.fontFamily }]}>{value}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={previewColor} />
      </Pressable>

      {open ? (
        <View style={[styles.dropdownMenu, { backgroundColor: theme.paperSoft, borderColor: theme.line }] }>
          {HOME_BACKGROUND_IMAGE_URLS.map((url, index) => {
            const active = url === value;
            return (
              <Pressable key={url} onPress={() => onChange(url)} style={({ pressed }) => [styles.dropdownOption, active && { backgroundColor: theme.accent }, pressed && styles.pressedSmall]}>
                <View style={styles.dropdownTextWrap}>
                  <Text style={[styles.optionTitle, { color: active ? theme.paper : previewColor, fontFamily: settings.fontFamily }]}>{sourceLabel(url, index)}</Text>
                  <Text numberOfLines={2} style={[styles.optionUrl, { color: active ? theme.paper : theme.inkMuted, fontFamily: settings.fontFamily }]}>{url}</Text>
                </View>
                {active ? <Ionicons name="checkmark-circle" size={20} color={theme.paper} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
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
  directoryText: { width: '100%', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  dropdownWrap: { width: '100%', gap: 6 },
  dropdownButton: { minHeight: 66, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropdownTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  dropdownLabel: { fontSize: 12, fontWeight: '900' },
  dropdownValue: { fontSize: 15, fontWeight: '900' },
  dropdownUrl: { fontSize: 11, fontWeight: '700' },
  dropdownMenu: { width: '100%', borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  dropdownOption: { minHeight: 62, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionTitle: { fontSize: 15, fontWeight: '900' },
  optionUrl: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  pressedSmall: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
