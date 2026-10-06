import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { BackHandler, Linking as ReactLinking, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showAlert } from '../components/AppAlert';
import { AppButton } from '../components/AppButton';
import { AppSelectSheet, SelectField } from '../components/AppSelectSheet';
import { clearResolvedCardImages, pruneUnreferencedCardImages } from '../components/CardHeaderImage';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { CARD_REMOTE_IMAGE_URLS, HOME_BACKGROUND_IMAGE_URLS, imageSourceLabel } from '../config/imageUrls';
import {
  clearCardHeaderImageUrls,
  deleteAiProfile,
  exportBackupData,
  getAiModelCatalog,
  getReferencedCardImageUrls,
  listAiProfiles,
  readBackupFile,
  resetAllData,
  restoreBackupData,
  saveAiModelCatalog,
  saveAiProfile,
  updateSetting,
  type AiModelMapping,
  type BackupPayload,
} from '../data/repository';
import type { AiProfileRecord, Settings, SettingsSection } from '../domain/types';
import { fontOptions } from '../theme/fonts';
import { useAppTheme } from '../theme/ThemeContext';
import { radius, palette, type AppTheme } from '../theme/tokens';
import { AI_FEATURE_HINT, fetchAiModels } from '../utils/ai';
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

export const APP_VERSION = Constants.expoConfig?.version ?? '0.4.0';
export const APP_REPO_URL = 'https://github.com/ksladnasx/Scrollark';

// 阅读偏好实时预览的演示文段：刻意覆盖标题、加粗、行内代码、高亮、代码块与引用，
// 让用户切换字体时能直接看到各类特殊格式的字体生效效果（与阅读页同一渲染路径）。
const FONT_PREVIEW_MARKDOWN = [
  '## 间隔重复记忆法',
  '',
  '**遗忘曲线**告诉我们：分段复习比一次长时间的背诵更有效。The quick brown fox jumps over the lazy dog, 0123456789。',
  '',
  '==预览即所得==：切换字体后，**加粗**、`行内代码` 与代码块都会实时跟随当前字体。',
  '',
  '```js',
  '// 代码块同样使用所选字体渲染',
  'const nextReview = card.reviewedAt + interval * card.ease;',
  '```',
  '',
  '> 批注与摘要会跟随字号与间距实时变化。',
].join('\n');

// 应用图标（与 app.json 的 icon / adaptiveIcon 同源），基础信息页直接展示。
const APP_ICON = require('../../img/softicon.png');

const SECTION_TITLES: Record<SettingsSection, string> = {
  reading: '阅读设置',
  wallpaper: '首页壁纸',
  card: '卡片背景',
  pacing: '阅读节奏',
  data: '数据管理',
  ai: 'AI 设置',
  about: '基础信息',
};

// 字体间距档位（与 domain/types 的取值一致）。
const SPACING_LABELS: Record<number, string> = { [-1]: '紧凑', 0: '标准', 1: '宽松', 2: '加宽' };

// 浮动下拉菜单：紧凑宽度、右对齐挂在触发行下方；最大可视高度防超长列表。
const DROPDOWN_MENU_WIDTH = 168;
const DROPDOWN_MAX_HEIGHT = 236;

// 同页多个下拉互斥：记录当前展开项的关闭器，展开新下拉时自动收起上一个。
let activeDropdownCloser: (() => void) | null = null;

// 设置二级页：只渲染某一个分类的详细配置（入口在设置 Tab 一级页）。
// 全屏页面，无 Tab 栏，左上角返回。
export function SettingsDetailScreen({ section, settings, onSettingsChanged, onReset, onCardImagesReset, onDataChanged, onBack }: Props) {
  const theme = useAppTheme();
  const [homeBusy, setHomeBusy] = React.useState(false);
  const [homeStatus, setHomeStatus] = React.useState<Status>(null);
  const [cardBusy, setCardBusy] = React.useState(false);
  const [cardStatus, setCardStatus] = React.useState<Status>(null);
  // 导出与导入各自独立 loading：任一进行中只转对应按钮，互不复用。
  const [exportBusy, setExportBusy] = React.useState(false);
  const [importBusy, setImportBusy] = React.useState(false);
  const [backupStatus, setBackupStatus] = React.useState<Status>(null);
  // 只有远程壁纸模式才涉及壁纸源：其它模式下不显示、也不允许切源。
  const cardRemote = settings.cardHeaderImageMode === 'remote';
  const activeFont = fontOptions.find((font) => font.key === settings.fontFamily);
  const fontFamily = settings.fontFamily;

  const update = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    await updateSetting(key, value);
    onSettingsChanged({ ...settings, [key]: value });
  };

  // ===== AI 配置草稿：编辑期间不落库，点「保存配置」才写入；退出未保存会提示 =====
  // 输入框完全受控（键入即更新草稿），避免「改完直接点保存」时失焦提交丢失修改。
  const [aiDraft, setAiDraft] = React.useState({ baseUrl: '', apiKey: '', model: '', apiStyle: 'responses' as Settings['aiApiStyle'] });
  const [aiSaving, setAiSaving] = React.useState(false);
  const [aiStatus, setAiStatus] = React.useState<Status>(null);
  // 配置方案：命名的整组配置，保存后可一键切换；进入分区时加载列表。
  const [aiProfiles, setAiProfiles] = React.useState<AiProfileRecord[]>([]);
  const [aiProfileDialogOpen, setAiProfileDialogOpen] = React.useState(false);
  const [aiProfileNameDraft, setAiProfileNameDraft] = React.useState('');
  const [aiProfileSaving, setAiProfileSaving] = React.useState(false);
  const [aiProfileDialogConfig, setAiProfileDialogConfig] = React.useState<{ baseUrl: string; apiKey: string; model: string; apiStyle: Settings['aiApiStyle'] } | null>(null);
  // 进入 AI 分区时把草稿同步为已保存的配置，并加载方案列表；切换到其他分区即视为放弃未保存修改。
  React.useEffect(() => {
    if (section === 'ai') {
      setAiDraft({ baseUrl: settings.aiBaseUrl, apiKey: settings.aiApiKey, model: settings.aiModel, apiStyle: settings.aiApiStyle });
      setAiStatus(null);
      listAiProfiles()
        .then(setAiProfiles)
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  const aiDirty =
    aiDraft.baseUrl !== settings.aiBaseUrl ||
    aiDraft.apiKey !== settings.aiApiKey ||
    aiDraft.model !== settings.aiModel ||
    aiDraft.apiStyle !== settings.aiApiStyle;

  const persistAiProfile = React.useCallback(async (name: string, config: { baseUrl: string; apiKey: string; model: string; apiStyle: Settings['aiApiStyle'] }) => {
    try {
      await saveAiProfile(name, config);
      setAiProfiles(await listAiProfiles());
      setAiStatus({ kind: 'ok', text: `已保存方案「${name.trim()}」。` });
    } catch (error) {
      setAiStatus({ kind: 'error', text: error instanceof Error ? error.message : '方案保存失败' });
    }
  }, []);

  const saveAiDraft = React.useCallback(async () => {
    const next = { aiBaseUrl: aiDraft.baseUrl.trim(), aiApiKey: aiDraft.apiKey.trim(), aiModel: aiDraft.model.trim(), aiApiStyle: aiDraft.apiStyle };
    try {
      setAiSaving(true);
      await Promise.all([updateSetting('aiBaseUrl', next.aiBaseUrl), updateSetting('aiApiKey', next.aiApiKey), updateSetting('aiModel', next.aiModel), updateSetting('aiApiStyle', next.aiApiStyle)]);
      onSettingsChanged({ ...settings, ...next });
      setAiDraft({ baseUrl: next.aiBaseUrl, apiKey: next.aiApiKey, model: next.aiModel, apiStyle: next.aiApiStyle });
      setAiStatus({ kind: 'ok', text: 'AI 配置已保存。' });
      // 保存成功后询问是否存为配置方案：与现有方案完全一致时提供「更新」，否则只能另存。
      const saved = { baseUrl: next.aiBaseUrl, apiKey: next.aiApiKey, model: next.aiModel, apiStyle: next.aiApiStyle };
      const matched = aiProfiles.find((profile) => profile.baseUrl === saved.baseUrl && profile.apiKey === saved.apiKey && profile.model === saved.model && profile.apiStyle === saved.apiStyle);
      const buttons: { text: string; style?: 'cancel' | 'default' | 'destructive'; onPress?: () => void }[] = [{ text: '不保存', style: 'cancel' }];
      if (matched) {
        buttons.push({ text: `更新「${matched.name}」`, onPress: () => { void persistAiProfile(matched.name, saved); } });
      }
      buttons.push({
        text: '存为新方案',
        onPress: () => {
          setAiProfileDialogConfig(saved);
          setAiProfileNameDraft(matched?.name || next.aiModel.trim() || 'AI 方案');
          setAiProfileDialogOpen(true);
        },
      });
      showAlert({ title: '已保存', message: '是否把这套配置保存为方案？保存后可在「配置方案」里一键切换。', buttons });
    } catch {
      setAiStatus({ kind: 'error', text: '保存失败，请重试。' });
    } finally {
      setAiSaving(false);
    }
  }, [aiDraft, aiProfiles, onSettingsChanged, persistAiProfile, settings]);

  const confirmSaveAiProfile = React.useCallback(async () => {
    if (aiProfileSaving || !aiProfileDialogConfig) return;
    const name = aiProfileNameDraft.trim();
    if (!name) return;
    try {
      setAiProfileSaving(true);
      await saveAiProfile(name, aiProfileDialogConfig);
      setAiProfiles(await listAiProfiles());
      setAiProfileDialogOpen(false);
      setAiStatus({ kind: 'ok', text: `已保存方案「${name}」。` });
    } catch (error) {
      setAiStatus({ kind: 'error', text: error instanceof Error ? error.message : '方案保存失败' });
    } finally {
      setAiProfileSaving(false);
    }
  }, [aiProfileDialogConfig, aiProfileNameDraft, aiProfileSaving]);

  const removeAiProfile = React.useCallback(async (profile: AiProfileRecord) => {
    try {
      await deleteAiProfile(profile.id);
      setAiProfiles(await listAiProfiles());
      setAiStatus({ kind: 'ok', text: `已删除方案「${profile.name}」。` });
    } catch {
      setAiStatus({ kind: 'error', text: '方案删除失败，请重试。' });
    }
  }, []);

  // 返回拦截：AI 配置有未保存修改时先询问（保存并退出 / 不保存 / 继续编辑）。
  const requestBack = React.useCallback(() => {
    if (section === 'ai' && aiDirty) {
      showAlert({
        title: '有未保存的修改',
        message: 'AI 配置已修改但尚未保存，直接退出将丢失这些修改。',
        buttons: [
          { text: '继续编辑', style: 'cancel' },
          { text: '不保存', style: 'destructive', onPress: onBack },
          { text: '保存并退出', onPress: () => { void saveAiDraft().then(onBack); } },
        ],
      });
      return;
    }
    onBack();
  }, [aiDirty, onBack, saveAiDraft, section]);

  // AI 配置未保存时拦截系统返回键（无修改时交给 App 层的全局返回处理）。
  React.useEffect(() => {
    if (section !== 'ai' || !aiDirty) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestBack();
      return true;
    });
    return () => subscription.remove();
  }, [aiDirty, requestBack, section]);

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
          onPress={requestBack}
          style={({ pressed }) => [styles.backButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={23} color={theme.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.ink, fontFamily }]}>{SECTION_TITLES[section]}</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        {section === 'reading' ? (
          <>
            <Section icon="text-outline" title="阅读偏好" theme={theme} settings={settings}>
            <Rows theme={theme}>
              <SelectRow
                label="阅读字体"
                valueLabel={activeFont?.label ?? settings.fontFamily}
                options={fontOptions.map((font) => ({ key: font.key, label: font.label, fontFamily: font.key }))}
                selectedKey={settings.fontFamily}
                onSelect={(key) => { void update('fontFamily', key as Settings['fontFamily']); }}
                theme={theme}
                settings={settings}
              />
              <ChipRow label="正文字号" theme={theme} settings={settings}>
                {[16, 18, 20, 22].map((size) => (
                  <Chip key={`size-${size}`} label={`${size}`} active={settings.fontSize === size} theme={theme} onPress={() => { void update('fontSize', size); }} />
                ))}
              </ChipRow>
              <ChipRow label="字体间距" theme={theme} settings={settings}>
                {([-1, 0, 1, 2] as const).map((spacing) => (
                  <Chip
                    key={`spacing-${spacing}`}
                    label={SPACING_LABELS[spacing]}
                    active={settings.fontLetterSpacing === spacing}
                    theme={theme}
                    onPress={() => { void update('fontLetterSpacing', spacing); }}
                  />
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
          {/* 实时预览：与阅读页同一 MarkdownRenderer，字体 / 字号 / 间距改动即时反映在演示文段上 */}
          <Section icon="eye-outline" title="实时预览" theme={theme} settings={settings}>
            <View style={styles.previewWrap}>
              <MarkdownRenderer
                markdown={FONT_PREVIEW_MARKDOWN}
                color={theme.ink}
                fontSize={settings.fontSize}
                fontFamily={fontFamily}
                letterSpacing={settings.fontLetterSpacing}
              />
            </View>
          </Section>
          </>
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
                disabled={homeBusy}
                options={homeOptions.map((option) => ({ key: option.url, label: option.label, hint: option.url }))}
                selectedKey={settings.homeBackgroundImageUrl}
                onSelect={(key) => changeHomeBackgroundSource(key)}
                theme={theme}
                settings={settings}
              />
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
                    disabled={cardBusy}
                    options={cardOptions.map((option) => ({ key: option.url, label: option.label, hint: option.url }))}
                    selectedKey={settings.cardBackgroundImageUrl}
                    onSelect={(key) => changeCardBackgroundSource(key)}
                    theme={theme}
                    settings={settings}
                  />
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
                  <AppButton label="导出全部数据" icon="download-outline" variant="dark" loading={exportBusy} onPress={() => { void handleExportBackup(); }} />
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

        {section === 'ai' ? (
          <AiSettingsSection
            settings={settings}
            draft={aiDraft}
            saving={aiSaving}
            status={aiStatus}
            profiles={aiProfiles}
            onDraftChange={setAiDraft}
            onSave={() => { void saveAiDraft(); }}
            onPickProfile={(profile) =>
              setAiDraft({ baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model, apiStyle: profile.apiStyle })
            }
            onDeleteProfile={(profile) => {
              void removeAiProfile(profile);
            }}
          />
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
          </>
        ) : null}
      </ScrollView>

      {/* 方案命名弹窗：保存成功后选择「存为新方案」时输入名称（同名覆盖更新） */}
      {section === 'ai' ? (
        <Modal visible={aiProfileDialogOpen} transparent animationType="fade" onRequestClose={() => setAiProfileDialogOpen(false)}>
          <View style={styles.aiDialogBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setAiProfileDialogOpen(false)} />
            <View style={[styles.aiDialog, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
              <Text style={[styles.aiDialogTitle, { color: theme.ink, fontFamily }]}>保存配置方案</Text>
              <TextInput
                value={aiProfileNameDraft}
                onChangeText={setAiProfileNameDraft}
                placeholder="方案名称"
                placeholderTextColor={palette.inkMuted}
                autoFocus
                style={[styles.aiDialogInput, { fontFamily, backgroundColor: theme.paperSoft, color: theme.ink }]}
              />
              <View style={styles.aiDialogActions}>
                <AppButton label="取消" variant="light" style={styles.aiDialogButton} onPress={() => setAiProfileDialogOpen(false)} />
                <AppButton
                  label="保存方案"
                  icon="save-outline"
                  style={styles.aiDialogButton}
                  loading={aiProfileSaving}
                  disabled={!aiProfileNameDraft.trim() || !aiProfileDialogConfig}
                  onPress={() => { void confirmSaveAiProfile(); }}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
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

// AI 设置分区：用户自带 API Key（OpenAI Compatible）。各项配置在草稿里编辑，
// 点「保存配置」才写入本地 settings 表；接口模式支持 Chat Completions / Responses
// （wire_api = "responses" 的中转站）或自动适配；支持 /models 的服务可拉取模型列表。
// 找出映射表里重复的显示名称（忽略空白名与首尾空格差异）。
function duplicateMappingNames(items: AiModelMapping[]): Set<string> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = item.name.trim();
    if (name !== '') counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
}

function hasDuplicateMappingNames(items: AiModelMapping[]): boolean {
  return duplicateMappingNames(items).size > 0;
}

function AiSettingsSection({ settings, draft, saving, status, profiles, onDraftChange, onSave, onPickProfile, onDeleteProfile }: {
  settings: Settings;
  draft: { baseUrl: string; apiKey: string; model: string; apiStyle: Settings['aiApiStyle'] };
  saving: boolean;
  status: Status;
  profiles: AiProfileRecord[];
  onDraftChange: (next: { baseUrl: string; apiKey: string; model: string; apiStyle: Settings['aiApiStyle'] }) => void;
  onSave: () => void;
  onPickProfile: (profile: AiProfileRecord) => void;
  onDeleteProfile: (profile: AiProfileRecord) => void;
}) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  // 模型映射缓存（菜单显示名 → 实际请求模型）：与获取时的 Base URL + API Key 绑定，
  // 端点或 Key 修改后自动失效，重新获取即重建。
  const [catalog, setCatalog] = React.useState<AiModelMapping[]>([]);
  const [modelsBusy, setModelsBusy] = React.useState(false);
  const [modelsStatus, setModelsStatus] = React.useState<Status>(null);
  const [modelSheetOpen, setModelSheetOpen] = React.useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = React.useState(false);
  // 使用说明折叠态：默认收起，点标题行展开。
  const [guideOpen, setGuideOpen] = React.useState(false);
  // 模型映射折叠态：默认收起（列表可能很长），点标题行展开编辑。
  const [mappingsOpen, setMappingsOpen] = React.useState(false);
  const draftEndpoint = { baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''), apiKey: draft.apiKey.trim() };
  const canFetchModels = draftEndpoint.baseUrl !== '' && draftEndpoint.apiKey !== '';
  // 草稿与某个已保存方案完全一致时，配置方案字段直接显示该方案名。
  const draftProfile = profiles.find(
    (profile) =>
      profile.baseUrl === draft.baseUrl.trim() &&
      profile.apiKey === draft.apiKey.trim() &&
      profile.model === draft.model.trim() &&
      profile.apiStyle === draft.apiStyle,
  );
  const draftDirty =
    draft.baseUrl !== settings.aiBaseUrl || draft.apiKey !== settings.aiApiKey || draft.model !== settings.aiModel || draft.apiStyle !== settings.aiApiStyle;
  // 重名的显示名称标红提示（重名条目不会写入缓存）。
  const duplicateNames = duplicateMappingNames(catalog);
  const catalogHasDuplicates = duplicateNames.size > 0;

  const fetchCatalog = async (silent: boolean) => {
    if (modelsBusy) return;
    if (!canFetchModels) {
      setModelsStatus({ kind: 'error', text: '请先填写 API Base URL 与 API Key，再获取模型列表。' });
      return;
    }
    try {
      setModelsBusy(true);
      if (!silent) setModelsStatus({ kind: 'busy', text: '正在获取模型列表……' });
      const models = await fetchAiModels({ baseUrl: draftEndpoint.baseUrl, apiKey: draftEndpoint.apiKey, model: draft.model.trim(), apiStyle: draft.apiStyle });
      // 同端点同 Key：仅追加新增的模型；端点或 Key 变更后旧缓存已失效，整表替换。
      const existing = await getAiModelCatalog(draftEndpoint.baseUrl, draftEndpoint.apiKey);
      const known = new Set(existing.map((item) => item.model));
      const merged = [...existing, ...models.filter((id) => !known.has(id)).map((id) => ({ name: id, model: id }))];
      await saveAiModelCatalog(draftEndpoint.baseUrl, draftEndpoint.apiKey, merged);
      setCatalog(merged);
      setModelsStatus({ kind: 'ok', text: `已获取模型列表（共 ${merged.length} 项）。` });
    } catch (error) {
      setModelsStatus({ kind: 'error', text: error instanceof Error ? error.message : '获取模型列表失败，可手动添加模型。' });
    } finally {
      setModelsBusy(false);
    }
  };

  // 显示名称重名时阻断写入（导入下拉继续使用上一份有效列表），弹窗提示一次；
  // 改掉重名后恢复写入。
  const mappingDuplicateAlertedRef = React.useRef(false);
  const commitMapping = (items: AiModelMapping[]) => {
    setCatalog(items);
    if (hasDuplicateMappingNames(items)) {
      if (!mappingDuplicateAlertedRef.current) {
        mappingDuplicateAlertedRef.current = true;
        showAlert({ title: '显示名称重复', message: '存在相同的显示名称，重名的映射不会被保存。请修改为不同的名称后再试。' });
      }
      return;
    }
    mappingDuplicateAlertedRef.current = false;
    void saveAiModelCatalog(draftEndpoint.baseUrl, draftEndpoint.apiKey, items).catch(() => undefined);
  };

  const updateMapping = (index: number, patch: Partial<AiModelMapping>) => {
    // 键入即落库，但显示名称重名时阻断写入并弹窗提示（重名条目不会进入导入下拉）。
    commitMapping(catalog.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const addMapping = () => {
    commitMapping([...catalog, { name: '', model: '' }]);
  };

  const removeMapping = (index: number) => {
    // 删除是明确意图：即使列表仍有重名也照常落库。
    const next = catalog.filter((_, itemIndex) => itemIndex !== index);
    setCatalog(next);
    if (!hasDuplicateMappingNames(next)) mappingDuplicateAlertedRef.current = false;
    void saveAiModelCatalog(draftEndpoint.baseUrl, draftEndpoint.apiKey, next).catch(() => undefined);
  };

  // 模型映射跟随「草稿端点 + Key」的指纹加载本地缓存：端点或 Key 变更后自动失效；
  // 缓存为空且连接信息完整时自动静默拉取一次模型列表。草稿由父级在进入分区时同步，
  // 因此以指纹（而非挂载时机）为依赖，保证拿到的是同步后的真实值。
  const catalogKey = `${draftEndpoint.baseUrl}::${draftEndpoint.apiKey}`;
  React.useEffect(() => {
    if (!canFetchModels) {
      setCatalog([]);
      return;
    }
    let alive = true;
    // 轻微防抖：避免逐字输入端点时列表反复闪空。
    const timer = setTimeout(() => {
      getAiModelCatalog(draftEndpoint.baseUrl, draftEndpoint.apiKey)
        .then((items) => {
          if (!alive) return;
          setCatalog(items);
          if (items.length === 0) void fetchCatalog(true);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogKey]);

  return (
    <>
      <Section icon="sparkles-outline" title="AI 连接" theme={theme} settings={settings}>
        <Rows theme={theme}>
          <View style={styles.rowInner}>
            <Text style={[styles.rowLabel, { color: theme.ink, fontFamily: settings.fontFamily }]}>配置方案</Text>
            <SelectField
              icon="layers-outline"
              value={draftProfile?.name ?? (draftDirty ? '未保存的修改' : '自定义')}
              placeholder="选择已保存的方案"
              onPress={() => setProfileSheetOpen(true)}
            />
          </View>
          <AiInputRow
            label="API Base URL"
            value={draft.baseUrl}
            placeholder="https://api.openai.com/v1"
            hint="API 根地址即可，如 https://sub.sailapi.top"
            theme={theme}
            settings={settings}
            onChangeText={(value) => onDraftChange({ ...draft, baseUrl: value })}
          />
          <AiInputRow
            label="API Key"
            value={draft.apiKey}
            placeholder="sk-..."
            secure
            theme={theme}
            settings={settings}
            onChangeText={(value) => onDraftChange({ ...draft, apiKey: value })}
          />
          <ChipRow label="接口模式" theme={theme} settings={settings}>
            {([
              ['Responses（原生）', 'responses'],
              ['Chat Completions（需开启路由）', 'chat'],
              ['Anthropic Messages（需开启路由）', 'anthropic'],
            ] as const).map(([label, value]) => (
              <Chip
                key={value}
                label={label}
                active={draft.apiStyle === value}
                theme={theme}
                onPress={() => onDraftChange({ ...draft, apiStyle: value })}
              />
            ))}
          </ChipRow>
          <View style={styles.rowInner}>
            <Text style={[styles.aiHintText, { color: theme.inkMuted }]}>默认 Responses；Chat / Anthropic 需中转站支持对应路由。</Text>
          </View>
          <View style={styles.rowInner}>
            <Text style={[styles.rowLabel, { color: theme.ink, fontFamily: settings.fontFamily }]}>默认模型</Text>
            <SelectField
              icon="cube-outline"
              value={draft.model || '未选择'}
              placeholder="从模型映射中选择"
              onPress={() => setModelSheetOpen(true)}
            />
          </View>
        </Rows>
      </Section>
      {/* 模型映射：默认折叠（列表可能很长），点标题行展开编辑 */}
      <View style={styles.section}>
        <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line, overflow: 'hidden' }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: mappingsOpen }}
            onPress={() => setMappingsOpen((current) => !current)}
            style={({ pressed }) => [styles.guideHead, pressed && styles.pressed]}
          >
            <View style={[styles.sectionIcon, { backgroundColor: theme.paperSoft }]}>
              <Ionicons name="swap-horizontal-outline" size={14} color={theme.accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily, flex: 1 }]}>模型映射</Text>
            {catalog.length > 0 ? (
              <Text style={[styles.aiHintText, { color: theme.inkMuted }]}>{catalog.length} 项</Text>
            ) : null}
            <Ionicons name={mappingsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.inkMuted} />
          </Pressable>
          {mappingsOpen ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.line }]} />
              <View style={[styles.actionRow, styles.aiActionsRow]}>
                <AppButton label="获取模型列表" icon="refresh-outline" variant="light" style={styles.aiActionButton} loading={modelsBusy} disabled={!canFetchModels} onPress={() => { void fetchCatalog(false); }} />
                <AppButton label="添加模型" icon="add-outline" variant="light" style={styles.aiActionButton} onPress={addMapping} />
              </View>
              {catalog.length === 0 ? (
                <View style={styles.rowInner}>
                  <Text style={[styles.aiHintText, { color: theme.inkMuted }]}>暂无映射：获取模型列表或手动添加。</Text>
                </View>
              ) : (
                [
                  <View key="mapping-header" style={styles.mappingHeader}>
                    <Text style={[styles.mappingHeaderText, { color: theme.inkMuted }]}>显示名称</Text>
                    <Text style={[styles.mappingHeaderText, styles.mappingHeaderModel, { color: theme.inkMuted }]}>实际模型</Text>
                    <View style={styles.mappingDelete} />
                  </View>,
                  ...catalog.map((item, index) => (
                    <View key={`mapping-${index}`} style={styles.mappingRow}>
                <TextInput
                  value={item.name}
                  onChangeText={(value) => updateMapping(index, { name: value })}
                  placeholder="显示名称"
                  placeholderTextColor={palette.inkMuted}
                  style={[styles.mappingInput, { backgroundColor: theme.paperSoft, borderColor: duplicateNames.has(item.name.trim()) ? theme.red : theme.line, color: theme.ink, fontFamily }]}
                />
                      <TextInput
                        value={item.model}
                        onChangeText={(value) => updateMapping(index, { model: value })}
                        placeholder="实际模型"
                        placeholderTextColor={palette.inkMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={[styles.mappingInput, styles.mappingModelInput, { backgroundColor: theme.paperSoft, borderColor: theme.line, color: theme.ink, fontFamily }]}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`删除映射 ${item.name || item.model || index + 1}`}
                        onPress={() => removeMapping(index)}
                        style={({ pressed }) => [styles.mappingDelete, pressed && styles.pressed]}
                      >
                        <Ionicons name="trash-outline" size={15} color={theme.red} />
                      </Pressable>
                    </View>
                  )),
                ]
              )}
              {catalogHasDuplicates ? (
                <View style={styles.rowInner}>
                  <Text style={[styles.aiHintText, { color: theme.red }]}>存在重复的显示名称，重名的映射不会被保存。</Text>
                </View>
              ) : null}
              {modelsStatus ? <View style={styles.rowInner}><StatusLine status={modelsStatus} theme={theme} fontFamily={fontFamily} /></View> : null}
            </>
          ) : null}
        </View>
      </View>
      {/* 保存配置：置于页面最后（使用说明之前），保存结果在按钮下方展示 */}
      <View style={styles.section}>
        <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          <View style={styles.actionRow}>
            <AppButton label="保存配置" icon="save-outline" loading={saving} onPress={onSave} />
          </View>
          {status ? <View style={styles.rowInner}><StatusLine status={status} theme={theme} fontFamily={fontFamily} /></View> : null}
        </View>
      </View>
      {/* 使用说明默认折叠：点击标题行（含图标）展开详情，保持设置页整洁 */}
      <View style={styles.section}>
        <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line, overflow: 'hidden' }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: guideOpen }}
            onPress={() => setGuideOpen((current) => !current)}
            style={({ pressed }) => [styles.guideHead, pressed && styles.pressed]}
          >
            <View style={[styles.sectionIcon, { backgroundColor: theme.paperSoft }]}>
              <Ionicons name="information-circle-outline" size={14} color={theme.accent} />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily, flex: 1 }]}>使用说明</Text>
            <Ionicons name={guideOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.inkMuted} />
          </Pressable>
          {guideOpen ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.line }]} />
              <View style={styles.rowInner}>
                <Text style={[styles.aiHintText, { color: theme.inkMuted, fontFamily }]}>{AI_FEATURE_HINT}</Text>
                <Text style={[styles.aiHintText, { color: theme.inkMuted, fontFamily }]}>
                  采用「用户自带 API Key」模式：请求由设备直接发往你配置的服务商，Key 与文档内容不会经过任何第三方服务器。修改配置后记得点「保存配置」。
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
      {/* 配置方案选择：确认模式下点选高亮、按「完成」载入整组配置；底部动作删除当前方案 */}
      <AppSelectSheet
        visible={profileSheetOpen}
        title="选择配置方案"
        options={profiles.map((profile) => ({ key: String(profile.id), label: profile.name, hint: profile.model || undefined }))}
        selectedKey={draftProfile ? String(draftProfile.id) : null}
        onConfirm={(key) => {
          const profile = profiles.find((item) => String(item.id) === key);
          if (profile) onPickProfile(profile);
        }}
        onClose={() => setProfileSheetOpen(false)}
        actionLabel="删除当前方案"
        onAction={() => {
          if (!draftProfile) {
            showAlert({ title: '未选择方案', message: '请先在列表中选择并确认一个方案，再进行删除。' });
            return;
          }
          showAlert({
            title: '删除方案',
            message: `将删除方案「${draftProfile.name}」，当前已保存的 AI 配置不受影响。此操作无法撤销。`,
            buttons: [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: () => onDeleteProfile(draftProfile) },
            ],
          });
        }}
      />
      {/* 默认模型选择：选项来自模型映射的菜单显示名，选中项的实际模型写入草稿 */}
      <AppSelectSheet
        visible={modelSheetOpen}
        title="选择默认模型"
        options={catalog.map((item) => ({ key: item.model, label: item.name }))}
        selectedKey={draft.model}
        onSelect={(key) => onDraftChange({ ...draft, model: key })}
        onClose={() => setModelSheetOpen(false)}
      />
    </>
  );
}

// 文本输入行：完全受控（键入即回调上层更新草稿），统一由「保存配置」落库；
// 不依赖失焦提交，避免「改完直接点保存」丢修改。
function AiInputRow({ label, value, placeholder, hint, secure, theme, settings, onChangeText }: {
  label: string;
  value: string;
  placeholder: string;
  hint?: string;
  secure?: boolean;
  theme: AppTheme;
  settings: Settings;
  onChangeText: (value: string) => void;
}) {
  const [reveal, setReveal] = React.useState(false);
  return (
    <View style={styles.rowInner}>
      <Text style={[styles.rowLabel, { color: theme.ink, fontFamily: settings.fontFamily }]}>{label}</Text>
      <View style={[styles.aiInputWrap, { backgroundColor: theme.paperSoft, borderColor: theme.line }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={Boolean(secure) && !reveal}
          style={[styles.aiInput, { color: theme.ink, fontFamily: settings.fontFamily }]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reveal ? '隐藏 API Key' : '显示 API Key'}
            onPress={() => setReveal((current) => !current)}
            style={({ pressed }) => [styles.aiReveal, pressed && styles.pressed]}
          >
            <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={16} color={palette.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={[styles.aiHintText, { color: theme.inkMuted }]}>{hint}</Text> : null}
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

// 选择行：收起时只显示「标签 + 当前值 + 箭头」，点按在行下方弹出紧凑的浮动小菜单
// （绝对定位锚定在行底部 +8，右对齐，绝不遮挡触发行；展开项互斥，返回键收起）。
// 菜单是行内绝对定位元素：依赖 Section 卡片不裁剪溢出（card 无 overflow hidden）。
function SelectRow({ label, valueLabel, options, selectedKey, disabled, onSelect, theme, settings }: {
  label: string;
  valueLabel: string;
  options: { key: string; label: string; hint?: string; fontFamily?: string }[];
  selectedKey: string;
  disabled?: boolean;
  onSelect: (key: string) => void;
  theme: AppTheme;
  settings: Settings;
}) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);

  // 展开期间：收起其他已展开的下拉（互斥），返回键优先收起当前下拉。
  React.useEffect(() => {
    if (!open) return;
    activeDropdownCloser?.();
    activeDropdownCloser = close;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => {
      if (activeDropdownCloser === close) activeDropdownCloser = null;
      subscription.remove();
    };
  }, [open, close]);

  return (
    <View style={open ? styles.dropdownHostOpen : undefined}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.selectRowInner, pressed && !disabled && styles.pressed, disabled && { opacity: 0.55 }]}
      >
        <Text style={[styles.rowLabel, { color: theme.ink, fontFamily: settings.fontFamily }]}>{label}</Text>
        <View style={styles.rowRight}>
          <Text numberOfLines={1} style={[styles.rowValue, { color: theme.inkMuted, fontFamily: settings.fontFamily }]}>{valueLabel}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={theme.inkMuted} />
        </View>
      </Pressable>
      {open ? (
        <View style={[styles.dropdownCard, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
          <ScrollView style={{ maxHeight: DROPDOWN_MAX_HEIGHT }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const selected = option.key === selectedKey;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => { close(); onSelect(option.key); }}
                  style={({ pressed }) => [styles.dropdownOption, pressed && styles.dropdownOptionPressed]}
                >
                  <View style={styles.dropdownTexts}>
                    <Text numberOfLines={1} style={[styles.dropdownLabel, { color: selected ? theme.accent : theme.ink, fontFamily: option.fontFamily ?? settings.fontFamily }]}>
                      {option.label}
                    </Text>
                    {option.hint ? <Text numberOfLines={1} style={[styles.dropdownHint, { color: theme.inkMuted }]}>{option.hint}</Text> : null}
                  </View>
                  {selected ? <Ionicons name="checkmark" size={15} color={theme.accent} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
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
  // 卡片不裁剪溢出：SelectRow 的浮动下拉要伸出卡片边界（内部子项均为透明背景，无圆角溢出问题）。
  card: { borderRadius: radius.xl, borderWidth: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  rowInner: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  chipRowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selectRowInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  // 展开时提升所在行的绘制层级，保证菜单盖住卡片内后续内容。
  dropdownHostOpen: { zIndex: 40 },
  // 紧凑浮动菜单：挂在行底 +8，右对齐（当前值所在侧），固定窄宽度。
  dropdownCard: {
    position: 'absolute',
    top: '100%',
    right: 10,
    width: DROPDOWN_MENU_WIDTH,
    marginTop: 8,
    borderRadius: 13,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 41,
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 8, paddingHorizontal: 12 },
  dropdownOptionPressed: { backgroundColor: 'rgba(120,110,90,0.14)' },
  dropdownTexts: { flex: 1, minWidth: 0, gap: 1 },
  dropdownLabel: { fontSize: 13.5, lineHeight: 20, fontWeight: '600' },
  dropdownHint: { fontSize: 10.5, lineHeight: 14, fontWeight: '500' },
  // 行内文字固定行高：标签与当前值都用当前字体渲染，不同字体默认行高不同，
  // 不锁行高会导致切换字体时行高跳动。
  rowLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end', minWidth: 0 },
  rowValue: { fontSize: 13, lineHeight: 18, fontWeight: '600', flexShrink: 1, maxWidth: '70%', textAlign: 'right' },
  // 实时预览区：排版参数与阅读页一致（字号 + 1.66 行高 + 间距）。
  previewWrap: { paddingHorizontal: 16, paddingVertical: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 34, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipText: { fontSize: 13, fontWeight: '700' },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  actionRow: { padding: 12 },
  miniButton: { minHeight: 30, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miniButtonText: { fontSize: 12, fontWeight: '800' },
  pathHint: { fontSize: 11, lineHeight: 16, paddingHorizontal: 16, paddingBottom: 12, marginTop: -4 },
  statusWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  statusText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  backupHint: { fontSize: 12, lineHeight: 18, fontWeight: '600', paddingHorizontal: 16, paddingBottom: 14 },
  dangerButton: { minHeight: 48, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  dangerText: { fontSize: 14, fontWeight: '800' },
  aiInputWrap: { minHeight: 46, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 6 },
  aiInput: { flex: 1, minHeight: 44, paddingHorizontal: 14, fontSize: 14, fontWeight: '600' },
  aiReveal: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  aiHintText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  aiActionsRow: { flexDirection: 'row', gap: 10 },
  aiActionButton: { flex: 1 },
  guideHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  mappingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  mappingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  mappingHeaderText: { flex: 1, fontSize: 11, fontWeight: '800' },
  mappingHeaderModel: { flex: 1.2 },
  mappingInput: { flex: 1, minHeight: 42, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 10, fontSize: 13, fontWeight: '600' },
  mappingModelInput: { flex: 1.2 },
  mappingDelete: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  aiDialogBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,17,15,0.5)' },
  aiDialog: { width: '86%', maxWidth: 400, borderRadius: radius.xl, borderWidth: 1, padding: 18, gap: 12 },
  aiDialogTitle: { fontSize: 16, fontWeight: '900' },
  aiDialogInput: { minHeight: 46, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontWeight: '600' },
  aiDialogActions: { flexDirection: 'row', gap: 10 },
  aiDialogButton: { flex: 1 },
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
