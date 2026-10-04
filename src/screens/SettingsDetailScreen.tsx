import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking as ReactLinking, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showAlert } from '../components/AppAlert';
import { AppButton } from '../components/AppButton';
import { clearResolvedCardImages, pruneUnreferencedCardImages } from '../components/CardHeaderImage';
import { CARD_REMOTE_IMAGE_URLS, HOME_BACKGROUND_IMAGE_URLS, imageSourceLabel } from '../config/imageUrls';
import {
  clearCardHeaderImageUrls,
  exportBackupData,
  getReferencedCardImageUrls,
  readBackupFile,
  resetAllData,
  restoreBackupData,
  updateSetting,
  type BackupPayload,
} from '../data/repository';
import type { Settings, SettingsSection } from '../domain/types';
import { fontOptions } from '../theme/fonts';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, type AppTheme } from '../theme/tokens';
import { getReadableHomeBackgroundDownloadDirectory, pickHomeBackgroundDownloadDirectory, refreshHomeBackgroundImageUri } from '../utils/homeBackground';

type Props = {
  section: SettingsSection;
  settings: Settings;
  onSettingsChanged: (settings: Settings) => void;
  onReset: () => void;
  onCardImagesReset?: () => void;
  onDataChanged?: () => void;
  onBack: () => void;
};

type SourceOption = { url: string; label: string };
type Status = { kind: 'ok' | 'error' | 'busy'; text: string } | null;

export const APP_VERSION = Constants.expoConfig?.version ?? '0.3.0';
export const APP_REPO_URL = 'https://github.com/ksladnasx/Scrollark';

// 应用图标（与 app.json 的 icon / adaptiveIcon 同源），基础信息页直接展示。
const APP_ICON = require('../../img/softicon.png');

const SECTION_TITLES: Record<SettingsSection, string> = {
  reading: '字体设置',
  wallpaper: '首页壁纸',
  card: '卡片背景',
  pacing: '阅读节奏',
  data: '数据管理',
  about: '基础信息',
};

// 设置二级页：只渲染某一个分类的详细配置（入口在设置 Tab 一级页）。
// 全屏页面，无 Tab 栏，左上角返回。
export function SettingsDetailScreen({ section, settings, onSettingsChanged, onReset, onCardImagesReset, onDataChanged, onBack }: Props) {
  const theme = useAppTheme();
  const [homeBusy, setHomeBusy] = React.useState(false);
  const [homeStatus, setHomeStatus] = React.useState<Status>(null);
  const [cardBusy, setCardBusy] = React.useState(false);
  const [cardStatus, setCardStatus] = React.useState<Status>(null);
  const [homeSourceOpen, setHomeSourceOpen] = React.useState(false);
  const [cardSourceOpen, setCardSourceOpen] = React.useState(false);
  const [fontOpen, setFontOpen] = React.useState(false);
  // 导出与导入各自独立 loading：任一进行中只转对应按钮，互不复用。
  const [exportBusy, setExportBusy] = React.useState(false);
  const [importBusy, setImportBusy] = React.useState(false);
  const [backupStatus, setBackupStatus] = React.useState<Status>(null);
  // 只有远程壁纸模式才涉及壁纸源：其它模式下不显示、也不允许切源。
  const cardRemote = settings.cardHeaderImageMode === 'remote';
  const activeFont = fontOptions.find((font) => font.key === settings.fontFamily);
  const fontFamily = settings.fontFamily;

  const toggleFont = () => { setHomeSourceOpen(false); setCardSourceOpen(false); setFontOpen((value) => !value); };
  const toggleHomeSource = () => { setFontOpen(false); setCardSourceOpen(false); setHomeSourceOpen((value) => !value); };
  const toggleCardSource = () => { setFontOpen(false); setHomeSourceOpen(false); setCardSourceOpen((value) => !value); };

  const update = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    await updateSetting(key, value);
    onSettingsChanged({ ...settings, [key]: value });
  };

  const switchHomeBackground = async () => {
    if (homeBusy) return;
    try {
      setHomeBusy(true);
      setHomeStatus({ kind: 'busy', text: '正在获取新壁纸……' });
      await refreshHomeBackgroundImageUri(settings.homeBackgroundImageUrl);
      setHomeStatus({ kind: 'ok', text: '首页背景已切换，回到首页即可看到新图。' });
    } catch (error) {
      setHomeStatus({ kind: 'error', text: error instanceof Error ? error.message : '切换失败，请稍后再试' });
    } finally {
      setHomeBusy(false);
    }
  };

  const changeHomeBackgroundSource = async (url: string) => {
    setHomeSourceOpen(false);
    if (homeBusy || url === settings.homeBackgroundImageUrl) return;
    try {
      setHomeBusy(true);
      setHomeStatus({ kind: 'busy', text: '正在切换壁纸源并刷新首页背景……' });
      await updateSetting('homeBackgroundImageUrl', url);
      onSettingsChanged({ ...settings, homeBackgroundImageUrl: url });
      await refreshHomeBackgroundImageUri(url);
      setHomeStatus({ kind: 'ok', text: '壁纸源已更新，并已为首页切换新背景。' });
    } catch (error) {
      setHomeStatus({ kind: 'error', text: error instanceof Error ? error.message : '壁纸源切换失败，请稍后再试' });
    } finally {
      setHomeBusy(false);
    }
  };

  // 切换卡片壁纸源：清空已解析的头图（数据库、内存与本地文件），
  // 卡片在下次展示时按新源重新解析。仅远程壁纸模式下有意义。
  const changeCardBackgroundSource = async (url: string) => {
    setCardSourceOpen(false);
    if (!cardRemote || cardBusy || url === settings.cardBackgroundImageUrl) return;
    try {
      setCardBusy(true);
      setCardStatus({ kind: 'busy', text: '正在切换卡片壁纸源并清理旧背景……' });
      await updateSetting('cardBackgroundImageUrl', url);
      onSettingsChanged({ ...settings, cardBackgroundImageUrl: url });
      await clearCardHeaderImageUrls();
      clearResolvedCardImages();
      onCardImagesReset?.();
      setCardStatus({ kind: 'ok', text: '卡片壁纸源已更新，卡片背景会按新源重新加载。' });
    } catch (error) {
      setCardStatus({ kind: 'error', text: error instanceof Error ? error.message : '卡片壁纸源切换失败，请稍后再试' });
    } finally {
      setCardBusy(false);
    }
  };

  // 调整图池容量：只影响尚未加载头图的卡片；已持久化的头图保持不变，
  // 缩小容量后顺便清理不再被引用的图池文件。
  const changeCardImagePoolSize = async (size: number) => {
    if (cardBusy || size === settings.cardImagePoolSize) return;
    try {
      setCardBusy(true);
      await updateSetting('cardImagePoolSize', size);
      onSettingsChanged({ ...settings, cardImagePoolSize: size });
      const referenced = await getReferencedCardImageUrls();
      await pruneUnreferencedCardImages(new Set(referenced));
      setCardStatus({ kind: 'ok', text: '图池容量已更新，只对尚未加载头图的卡片生效。' });
    } catch {
      setCardStatus({ kind: 'error', text: '图池容量已更新，但清理旧图文件失败。' });
    } finally {
      setCardBusy(false);
    }
  };

  const changeCardMode = async (mode: Settings['cardHeaderImageMode']) => {
    setCardStatus(null);
    if (mode !== 'remote') setCardSourceOpen(false);
    if (mode === settings.cardHeaderImageMode) return;
    await update('cardHeaderImageMode', mode);
    if (mode === 'remote') setCardStatus({ kind: 'ok', text: '已切换为远程壁纸，卡片背景会按下方所选源自动加载。' });
  };

  const chooseDownloadDirectory = async () => {
    try {
      setHomeStatus(null);
      const uri = await pickHomeBackgroundDownloadDirectory(settings.homeBackgroundDownloadDirectory);
      await update('homeBackgroundDownloadDirectory', uri);
      setHomeStatus({ kind: 'ok', text: '背景图下载目录已更新。' });
    } catch {
      setHomeStatus({ kind: 'error', text: '下载目录未更改。' });
    }
  };

  const confirmReset = () => {
    showAlert({
      title: '清空本地数据',
      message: '会删除导入文档、卡片、收藏、批注和统计事件。此操作不可恢复。',
      buttons: [
        { text: '取消', style: 'cancel' },
        { text: '清空', style: 'destructive', onPress: async () => { await resetAllData(); onReset(); } },
      ],
    });
  };

  // 导出：选目录 → 全量数据（含自定义卡片配图）写成带日期的 JSON 文件。
  const handleExportBackup = async () => {
    if (exportBusy || importBusy) return;
    try {
      setExportBusy(true);
      setBackupStatus({ kind: 'busy', text: '正在导出数据……' });
      const uri = await exportBackupData();
      if (!uri) {
        // 用户取消了目录选择：不提示成功也不提示失败。
        setBackupStatus(null);
        return;
      }
      setBackupStatus({ kind: 'ok', text: `已导出到 ${uri.replace(/^file:\/\//, '')}` });
    } catch (error) {
      setBackupStatus({ kind: 'error', text: error instanceof Error ? error.message : '导出失败，请稍后再试' });
    } finally {
      setExportBusy(false);
    }
  };

  // 导入：选文件并校验 → 二次确认（整体替换）→ 恢复 → 清理头图缓存并刷新。
  // 确认弹窗期间保持 importBusy，避免确认前又触发导出/再次导入。
  const handleImportBackup = async () => {
    if (importBusy || exportBusy) return;
    let payload: BackupPayload;
    setImportBusy(true);
    try {
      setBackupStatus(null);
      const picked = await readBackupFile();
      if (!picked) {
        setImportBusy(false);
        return;
      }
      payload = picked;
    } catch (error) {
      setBackupStatus({ kind: 'error', text: error instanceof Error ? error.message : '导入失败，请稍后再试' });
      setImportBusy(false);
      return;
    }
    const stamped = new Date(payload.exportedAt);
    const when = Number.isNaN(stamped.getTime()) ? '' : `（导出于 ${stamped.toISOString().slice(0, 10)}）`;
    const imagesLabel = payload.customImages.length > 0 ? `、${payload.customImages.length} 张自定义配图` : '';
    showAlert({
      title: '导入备份',
      message: `备份包含 ${payload.documents.length} 份文档、${payload.cards.length} 张卡片${imagesLabel}${when}。导入会用备份整体替换当前数据，此操作不可恢复。`,
      buttons: [
        { text: '取消', style: 'cancel', onPress: () => { setImportBusy(false); setBackupStatus(null); } },
        { text: '导入', style: 'destructive', onPress: () => { void applyImportBackup(payload); } },
      ],
    });
  };

  const applyImportBackup = async (payload: BackupPayload) => {
    try {
      setBackupStatus({ kind: 'busy', text: '正在导入备份……' });
      const result = await restoreBackupData(payload);
      // 备份里的本机头图指向导出设备，恢复后统一重新解析：清内存缓存与磁盘孤儿文件。
      clearResolvedCardImages();
      await pruneUnreferencedCardImages(new Set());
      setBackupStatus({
        kind: 'ok',
        text: `已导入 ${result.documents} 份文档、${result.cards} 张卡片${result.images > 0 ? `（含 ${result.images} 张自定义配图）` : ''}。`,
      });
      onDataChanged?.();
    } catch (error) {
      setBackupStatus({ kind: 'error', text: error instanceof Error ? error.message : '导入失败，请稍后再试' });
    } finally {
      setImportBusy(false);
    }
  };

  const openRepo = async () => {
    try {
      await ReactLinking.openURL(APP_REPO_URL);
    } catch {
      showAlert({ title: '无法打开链接', message: APP_REPO_URL });
    }
  };

  const homeOptions: SourceOption[] = HOME_BACKGROUND_IMAGE_URLS.map((url) => ({ url, label: imageSourceLabel(url) }));
  const cardOptions: SourceOption[] = CARD_REMOTE_IMAGE_URLS.map((url) => ({ url, label: imageSourceLabel(url) }));
  const activeHomeSource = homeOptions.find((option) => option.url === settings.homeBackgroundImageUrl);
  const activeCardSource = cardOptions.find((option) => option.url === settings.cardBackgroundImageUrl);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.paper }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回设置"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={23} color={theme.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.ink, fontFamily }]}>{SECTION_TITLES[section]}</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        {section === 'reading' ? (
          <Section icon="text-outline" title="阅读偏好" theme={theme} settings={settings}>
            <Rows theme={theme}>
              <SelectRow
                label="阅读字体"
                valueLabel={activeFont?.label ?? settings.fontFamily}
                open={fontOpen}
                onToggle={toggleFont}
                theme={theme}
                settings={settings}
              >
                {fontOptions.map((font) => (
                  <OptionRow
                    key={font.key}
                    label={font.label}
                    active={font.key === settings.fontFamily}
                    fontFamily={font.key}
                    theme={theme}
                    onPress={() => { setFontOpen(false); void update('fontFamily', font.key); }}
                  />
                ))}
              </SelectRow>
              <ChipRow
                label="正文字号"
                extra={(
                  <Text style={[styles.fontDemo, { color: theme.ink, fontFamily: settings.fontFamily, fontSize: settings.fontSize + 8 }]}>
                    Aa
                  </Text>
                )}
                theme={theme}
                settings={settings}
              >
                {[16, 18, 20, 22].map((size) => (
                  <Chip key={`size-${size}`} label={`${size}`} active={settings.fontSize === size} theme={theme} onPress={() => { void update('fontSize', size); }} />
                ))}
              </ChipRow>
              <ChipRow label="显示模式" theme={theme} settings={settings}>
                {([
                  ['跟随系统', 'system'],
                  ['亮色', 'light'],
                  ['暗色', 'dark'],
                ] as const).map(([label, mode]) => (
                  <Chip key={`theme-${mode}`} label={label} active={settings.themeMode === mode} theme={theme} onPress={() => { void update('themeMode', mode); }} />
                ))}
              </ChipRow>
            </Rows>
          </Section>
        ) : null}

        {section === 'wallpaper' ? (
          <Section icon="image-outline" title="首页壁纸" theme={theme} settings={settings}>
            <Rows theme={theme}>
              <View style={styles.actionRow}>
                <AppButton label="立即切换首页背景" icon="refresh" variant="dark" loading={homeBusy} onPress={() => { void switchHomeBackground(); }} />
              </View>
              <SelectRow
                label="壁纸源"
                valueLabel={activeHomeSource?.label ?? settings.homeBackgroundImageUrl}
                open={homeSourceOpen}
                disabled={homeBusy}
                onToggle={toggleHomeSource}
                theme={theme}
                settings={settings}
              >
                {homeOptions.map((option) => (
                  <OptionRow
                    key={option.url}
                    label={option.label}
                    subLabel={option.url}
                    active={option.url === settings.homeBackgroundImageUrl}
                    fontFamily={fontFamily}
                    theme={theme}
                    onPress={() => changeHomeBackgroundSource(option.url)}
                  />
                ))}
              </SelectRow>
              <View>
                <View style={styles.selectRowInner}>
                  <Text style={[styles.rowLabel, { color: theme.ink, fontFamily }]}>保存位置</Text>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowValue, { color: theme.inkMuted, fontFamily }]}>
                      {settings.homeBackgroundDownloadDirectory ? '自定义文件夹' : '系统相册'}
                    </Text>
                    <MiniButton label="更改" theme={theme} fontFamily={fontFamily} onPress={() => { void chooseDownloadDirectory(); }} />
                    {settings.homeBackgroundDownloadDirectory ? <MiniButton label="还原" theme={theme} fontFamily={fontFamily} onPress={() => { void update('homeBackgroundDownloadDirectory', ''); }} /> : null}
                  </View>
                </View>
                {settings.homeBackgroundDownloadDirectory ? (
                  <Text numberOfLines={1} ellipsizeMode="middle" style={[styles.pathHint, { color: theme.inkMuted, fontFamily }]}>
                    {getReadableHomeBackgroundDownloadDirectory(settings.homeBackgroundDownloadDirectory)}
                  </Text>
                ) : null}
              </View>
            </Rows>
            {homeStatus ? <StatusLine status={homeStatus} theme={theme} fontFamily={fontFamily} /> : null}
          </Section>
        ) : null}

        {section === 'card' ? (
          <Section icon="layers-outline" title="卡片背景" theme={theme} settings={settings}>
            <Rows theme={theme}>
              <ChipRow label="显示模式" theme={theme} settings={settings}>
                {([
                  ['本地图库', 'local'],
                  ['远程壁纸', 'remote'],
                  ['不显示', 'hidden'],
                ] as const).map(([label, mode]) => (
                  <Chip key={`card-mode-${mode}`} label={label} active={settings.cardHeaderImageMode === mode} theme={theme} onPress={() => { void changeCardMode(mode); }} />
                ))}
              </ChipRow>
              {cardRemote ? (
                <>
                  <SelectRow
                    label="卡片壁纸源"
                    valueLabel={activeCardSource?.label ?? settings.cardBackgroundImageUrl}
                    open={cardSourceOpen}
                    disabled={cardBusy}
                    onToggle={toggleCardSource}
                    theme={theme}
                    settings={settings}
                  >
                    {cardOptions.map((option) => (
                      <OptionRow
                        key={option.url}
                        label={option.label}
                        subLabel={option.url}
                        active={option.url === settings.cardBackgroundImageUrl}
                        fontFamily={fontFamily}
                        theme={theme}
                        onPress={() => changeCardBackgroundSource(option.url)}
                      />
                    ))}
                  </SelectRow>
                  <ChipRow label="头图图池" theme={theme} settings={settings}>
                    {([
                      ['每卡一张', 0],
                      ['4 张复用', 4],
                      ['8 张复用', 8],
                      ['16 张复用', 16],
                      ['20 张复用', 20],
                    ] as const).map(([label, size]) => (
                      <Chip
                        key={`pool-${size}`}
                        label={label}
                        active={settings.cardImagePoolSize === size}
                        theme={theme}
                        onPress={() => { void changeCardImagePoolSize(size); }}
                      />
                    ))}
                  </ChipRow>
                </>
              ) : null}
            </Rows>
            {cardStatus ? <StatusLine status={cardStatus} theme={theme} fontFamily={fontFamily} /> : null}
          </Section>
        ) : null}

        {section === 'pacing' ? (
          <Section icon="speedometer-outline" title="阅读节奏" theme={theme} settings={settings}>
            <Rows theme={theme}>
              <ChipRow label="每轮卡片数" theme={theme} settings={settings}>
                {[10, 20, 30].map((count) => (
                  <Chip key={`count-${count}`} label={`${count}`} active={settings.sessionCardCount === count} theme={theme} onPress={() => { void update('sessionCardCount', count); }} />
                ))}
              </ChipRow>
              <ChipRow label="每日目标" theme={theme} settings={settings}>
                {([
                  ['关闭', 0],
                  ['5 张', 5],
                  ['10 张', 10],
                  ['20 张', 20],
                  ['30 张', 30],
                ] as const).map(([label, goal]) => (
                  <Chip
                    key={`goal-${goal}`}
                    label={label}
                    active={settings.dailyGetGoal === goal}
                    theme={theme}
                    onPress={() => {
                      void update('dailyGetGoal', goal).then(() => onDataChanged?.());
                    }}
                  />
                ))}
              </ChipRow>
            </Rows>
          </Section>
        ) : null}

        {section === 'data' ? (
          <>
            <Section icon="archive-outline" title="数据备份" theme={theme} settings={settings}>
              <Rows theme={theme}>
                <View style={styles.actionRow}>
                  <AppButton label="导出全部数据（JSON）" icon="download-outline" variant="dark" loading={exportBusy} onPress={() => { void handleExportBackup(); }} />
                </View>
                <View style={styles.actionRow}>
                  <AppButton label="从备份文件导入" icon="duplicate-outline" variant="light" loading={importBusy} onPress={() => { void handleImportBackup(); }} />
                </View>
                <Text style={[styles.backupHint, { color: theme.inkMuted, fontFamily }]}>
                  导出内容包含文档、卡片、评级、收藏、批注、行为事件、设置与自定义卡片的配图，可作为换机备份。导入会用备份整体替换当前数据，请谨慎操作。
                </Text>
              </Rows>
              {backupStatus ? <StatusLine status={backupStatus} theme={theme} fontFamily={fontFamily} /> : null}
            </Section>
            <Pressable
              accessibilityRole="button"
              onPress={confirmReset}
              style={({ pressed }) => [styles.dangerButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
            >
              <Ionicons name="trash-outline" size={16} color={theme.red} />
              <Text style={[styles.dangerText, { color: theme.red, fontFamily }]}>清空本地数据</Text>
            </Pressable>
          </>
        ) : null}

        {section === 'about' ? (
          <>
            <View style={[styles.aboutCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
              <View style={styles.aboutHero}>
                <Image source={APP_ICON} style={[styles.aboutIcon, { backgroundColor: theme.paperSoft }]} />
                <View style={styles.aboutHeroTexts}>
                  <Text style={[styles.aboutName, { color: theme.ink, fontFamily }]}>Scrollark</Text>
                  <Text style={[styles.aboutTagline, { color: theme.inkMuted, fontFamily }]}>Markdown 卡片 · 间隔重复记忆</Text>
                </View>
              </View>
              <View style={[styles.aboutDivider, { backgroundColor: theme.line }]} />
              <AboutRow label="版本" value={APP_VERSION} theme={theme} fontFamily={fontFamily} />
              <View style={[styles.aboutDivider, { backgroundColor: theme.line }]} />
              <AboutRow label="应用标识" value="scrollark" theme={theme} fontFamily={fontFamily} />
            </View>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`打开 GitHub 项目地址：${APP_REPO_URL}`}
              onPress={() => { void openRepo(); }}
              style={({ pressed }) => [styles.linkCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
            >
              <View style={[styles.linkIcon, { backgroundColor: theme.paperSoft }]}>
                <Ionicons name="logo-github" size={18} color={theme.accent} />
              </View>
              <View style={styles.linkTexts}>
                <Text style={[styles.linkLabel, { color: theme.ink, fontFamily }]}>GitHub 项目地址</Text>
                <Text numberOfLines={1} style={[styles.linkValue, { color: theme.blue, fontFamily }]}>{APP_REPO_URL}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={theme.inkMuted} />
            </Pressable>
            <Text style={[styles.aboutHint, { color: theme.inkMuted, fontFamily }]}>
              点击项目地址可直接在浏览器中打开仓库主页。
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function AboutRow({ label, value, theme, fontFamily }: { label: string; value: string; theme: AppTheme; fontFamily: string }) {
  return (
    <View style={styles.aboutRow}>
      <Text style={[styles.aboutLabel, { color: theme.inkMuted, fontFamily }]}>{label}</Text>
      <Text style={[styles.aboutValue, { color: theme.ink, fontFamily }]}>{value}</Text>
    </View>
  );
}

function Section({ icon, title, children, theme, settings }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode; theme: AppTheme; settings: Settings }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: theme.paperSoft }]}>
          <Ionicons name={icon} size={14} color={theme.accent} />
        </View>
        <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily: settings.fontFamily }]}>{title}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>{children}</View>
    </View>
  );
}

function Rows({ theme, children }: { theme: AppTheme; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {items.map((child, index) => (
        <View key={index}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.line }]} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

// 手风琴式选择行：收起时只显示「标签 + 当前值 + 箭头」，展开后列出全部选项。
function SelectRow({ label, valueLabel, open, disabled, onToggle, children, theme, settings }: { label: string; valueLabel: string; open: boolean; disabled?: boolean; onToggle?: () => void; children?: React.ReactNode; theme: AppTheme; settings: Settings }) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onToggle}
        style={({ pressed }) => [styles.selectRowInner, pressed && !disabled && styles.pressed, disabled && { opacity: 0.55 }]}
      >
        <Text style={[styles.rowLabel, { color: theme.ink, fontFamily: settings.fontFamily }]}>{label}</Text>
        <View style={styles.rowRight}>
          <Text numberOfLines={1} style={[styles.rowValue, { color: theme.inkMuted, fontFamily: settings.fontFamily }]}>{valueLabel}</Text>
          {onToggle ? <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={theme.inkMuted} /> : null}
        </View>
      </Pressable>
      {open && children ? <View style={styles.optionList}>{children}</View> : null}
    </View>
  );
}

function OptionRow({ label, subLabel, active, fontFamily, theme, onPress }: { label: string; subLabel?: string; active: boolean; fontFamily: string; theme: AppTheme; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}>
      <View style={styles.optionTextWrap}>
        <Text numberOfLines={1} style={[styles.optionLabel, { color: active ? theme.accent : theme.ink, fontFamily }]}>{label}</Text>
        {subLabel ? <Text numberOfLines={1} style={[styles.optionSub, { color: theme.inkMuted, fontFamily }]}>{subLabel}</Text> : null}
      </View>
      {active ? <Ionicons name="checkmark" size={17} color={theme.accent} /> : null}
    </Pressable>
  );
}

function ChipRow({ label, extra, children, theme, settings }: { label: string; extra?: React.ReactNode; children: React.ReactNode; theme: AppTheme; settings: Settings }) {
  return (
    <View style={styles.rowInner}>
      <View style={styles.chipRowHead}>
        <Text style={[styles.rowLabel, { color: theme.ink, fontFamily: settings.fontFamily }]}>{label}</Text>
        {extra}
      </View>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

function Chip({ label, active, onPress, theme, swatch }: { label: string; active: boolean; onPress: () => void; theme: AppTheme; swatch?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: active ? theme.accent : theme.line },
        active && { backgroundColor: theme.accent },
        !active && { backgroundColor: 'transparent' },
        pressed && styles.pressed,
      ]}
    >
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch, borderColor: active ? 'rgba(255,255,255,0.55)' : theme.line }]} /> : null}
      <Text style={[styles.chipText, { color: active ? theme.paper : theme.ink }]}>{label}</Text>
    </Pressable>
  );
}

function MiniButton({ label, onPress, theme, fontFamily }: { label: string; onPress: () => void; theme: AppTheme; fontFamily: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.miniButton, { backgroundColor: theme.paperSoft, borderColor: theme.line }, pressed && styles.pressed]}>
      <Text style={[styles.miniButtonText, { color: theme.ink, fontFamily }]}>{label}</Text>
    </Pressable>
  );
}

function StatusLine({ status, theme, fontFamily }: { status: NonNullable<Status>; theme: AppTheme; fontFamily: string }) {
  const config = status.kind === 'ok'
    ? { icon: 'checkmark-circle' as const, color: theme.accent }
    : status.kind === 'error'
      ? { icon: 'alert-circle' as const, color: theme.red }
      : { icon: 'time-outline' as const, color: theme.inkMuted };
  return (
    <View style={styles.statusWrap}>
      <Ionicons name={config.icon} size={14} color={config.color} />
      <Text style={[styles.statusText, { color: config.color, fontFamily }]}>{status.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '900' },
  headerSide: { width: 44 },
  body: { flex: 1 },
  wrap: { padding: 16, paddingBottom: 40, gap: 20 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  card: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  rowInner: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  chipRowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selectRowInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 14, fontWeight: '700' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end', minWidth: 0 },
  rowValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, maxWidth: '70%', textAlign: 'right' },
  // 字体演示字符：绝不加 fontWeight —— Android 上自定义字体没有粗体变体时
  // 会回退到系统字体，导致演示字符看起来"字体没生效"。
  fontDemo: { letterSpacing: 0.5 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 34, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipText: { fontSize: 13, fontWeight: '700' },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  optionList: { paddingBottom: 6 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 11, paddingHorizontal: 16 },
  optionTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  optionLabel: { fontSize: 14, fontWeight: '700' },
  optionSub: { fontSize: 11, fontWeight: '600' },
  actionRow: { padding: 12 },
  miniButton: { minHeight: 30, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miniButtonText: { fontSize: 12, fontWeight: '800' },
  pathHint: { fontSize: 11, lineHeight: 16, paddingHorizontal: 16, paddingBottom: 12, marginTop: -4 },
  statusWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  statusText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  backupHint: { fontSize: 12, lineHeight: 18, fontWeight: '600', paddingHorizontal: 16, paddingBottom: 14 },
  dangerButton: { minHeight: 48, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  dangerText: { fontSize: 14, fontWeight: '800' },
  aboutCard: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  aboutHero: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  aboutIcon: { width: 54, height: 54, borderRadius: 16 },
  aboutHeroTexts: { flex: 1, minWidth: 0, gap: 3 },
  aboutName: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  aboutTagline: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  aboutDivider: { height: StyleSheet.hairlineWidth, marginLeft: 18 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 18, paddingVertical: 13 },
  aboutLabel: { fontSize: 13, fontWeight: '700' },
  aboutValue: { fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.xl, borderWidth: 1, padding: 16 },
  linkIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  linkTexts: { flex: 1, minWidth: 0, gap: 2 },
  linkLabel: { fontSize: 14, fontWeight: '800' },
  linkValue: { fontSize: 12, fontWeight: '600' },
  aboutHint: { fontSize: 12, lineHeight: 18, fontWeight: '600', paddingHorizontal: 6 },
  pressed: { opacity: 0.7 },
});
