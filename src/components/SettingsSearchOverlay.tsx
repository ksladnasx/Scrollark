import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Settings, SettingsSection } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';

type Props = {
  settings: Settings;
  onClose: () => void;
  onOpenSection: (section: SettingsSection) => void;
};

type SearchItem = { title: string; hint: string; keywords: string };
type SearchGroup = { section: SettingsSection; icon: keyof typeof Ionicons.glyphMap; title: string; items: SearchItem[] };

// 设置项搜索索引：静态罗列各二级分类里的具体配置项，命中后跳到对应分类页
//（具体取值仍在二级页里调整）。改设置项名称 / 增删配置时同步维护这份索引。
const SEARCH_GROUPS: SearchGroup[] = [
  {
    section: 'reading',
    icon: 'text-outline',
    title: '阅读设置',
    items: [
      { title: '阅读字体', hint: '切换正文使用的字体', keywords: '字体 font lxgw 霞鹜' },
      { title: '正文字号', hint: '调整阅读文字的大小', keywords: '字号 文字大小 font size' },
      { title: '字体间距', hint: '紧凑 / 标准 / 宽松 / 加宽', keywords: '间距 字距 spacing' },
      { title: '显示模式', hint: '跟随系统 / 亮色 / 暗色', keywords: '主题 深色模式 夜间模式 外观 dark light theme' },
      { title: '实时预览', hint: '预览字体、字号与间距的排版效果', keywords: '预览 排版 preview' },
    ],
  },
  {
    section: 'pacing',
    icon: 'speedometer-outline',
    title: '阅读节奏',
    items: [
      { title: '每轮卡片数', hint: '每次刷卡的卡片数量', keywords: '数量 卡片数 刷卡 session' },
      { title: '每日目标', hint: '每日 get 目标与连续打卡', keywords: '目标 打卡 goal 每日' },
    ],
  },
  {
    section: 'wallpaper',
    icon: 'image-outline',
    title: '首页壁纸',
    items: [
      { title: '切换首页背景', hint: '立即更换一张首页壁纸', keywords: '换壁纸 背景 更换 刷新' },
      { title: '壁纸源', hint: '首页壁纸的图片来源', keywords: '来源 图源 source' },
      { title: '保存位置', hint: '壁纸保存到系统相册或自定义目录', keywords: '下载目录 相册 保存 文件夹' },
    ],
  },
  {
    section: 'card',
    icon: 'layers-outline',
    title: '卡片背景',
    items: [
      { title: '显示模式', hint: '本地图库 / 远程壁纸 / 不显示', keywords: '头图 卡面 卡片图' },
      { title: '卡片壁纸源', hint: '卡片头图的图片来源', keywords: '来源 图源 source' },
      { title: '头图图池', hint: '头图复用数量与图池容量', keywords: '图池 复用 容量 pool' },
    ],
  },
  {
    section: 'data',
    icon: 'archive-outline',
    title: '数据管理',
    items: [
      { title: '导出全部数据', hint: '备份文档、卡片、批注与设置', keywords: '备份 导出 export backup' },
      { title: '从备份文件导入', hint: '用备份文件整体恢复数据', keywords: '导入 恢复 还原 import backup' },
      { title: '清空本地数据', hint: '删除全部本地数据，不可恢复', keywords: '删除 重置 清除 清空 reset' },
    ],
  },
  {
    section: 'ai',
    icon: 'sparkles-outline',
    title: 'AI 设置',
    items: [
      { title: 'API Base URL', hint: 'OpenAI 兼容的服务接口地址', keywords: '接口 地址 base url api openai 兼容 服务商' },
      { title: 'API Key', hint: '服务商密钥，仅保存在本地', keywords: '密钥 鉴权 key token 秘钥' },
      { title: '模型', hint: '从 /models 列表选择或手动填写', keywords: '模型 model gpt deepseek qwen 列表' },
      { title: '接口模式', hint: '默认 Responses / Chat / 自动适配', keywords: '接口模式 responses chat completions wire api 兼容' },
      { title: 'AI 解析导入', hint: '导入文件时用 AI 解析整理为标准 Markdown', keywords: '导入 ai 解析 markdown pdf 整理 非标准 转换 文件' },
    ],
  },
  {
    section: 'about',
    icon: 'information-circle-outline',
    title: '基础信息',
    items: [
      { title: '版本', hint: '当前应用的版本号', keywords: '版本号 version' },
      { title: '应用标识', hint: '应用唯一标识 scrollark', keywords: '包名 标识 identifier bundle' },
      { title: 'GitHub 项目地址', hint: '在浏览器打开开源仓库主页', keywords: '仓库 开源 源码 链接 github repo' },
    ],
  },
];

// 设置项搜索：从设置页头部的搜索图标进入，按关键字过滤全部设置项并跳转分类。
// 展示风格与设置一级页一致（分块卡片 + 图标行），空关键字时作为全部设置项的速览列表。
export function SettingsSearchOverlay({ settings, onClose, onOpenSection }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  const [query, setQuery] = React.useState('');
  const keyword = query.trim().toLowerCase();

  const groups = React.useMemo(() => {
    if (!keyword) return SEARCH_GROUPS;
    return SEARCH_GROUPS.map((group) => ({
      ...group,
      // 分类名也参与匹配：搜「阅读设置」能带出该分类下的全部条目。
      items: group.items.filter((item) => `${group.title} ${item.title} ${item.hint} ${item.keywords}`.toLowerCase().includes(keyword)),
    })).filter((group) => group.items.length > 0);
  }, [keyword]);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.paper }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭设置搜索"
            onPress={onClose}
            style={({ pressed }) => [styles.backButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={23} color={theme.ink} />
          </Pressable>
          <View style={[styles.searchBox, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
            <Ionicons name="search-outline" size={17} color={theme.inkMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder="搜索设置项"
              placeholderTextColor={theme.inkMuted}
              style={[styles.searchInput, { color: theme.ink, fontFamily }]}
              returnKeyType="search"
            />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel="清空搜索" onPress={() => setQuery('')} style={styles.clearButton}>
                <Ionicons name="close-circle" size={16} color={theme.inkMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <Text style={[styles.resultMeta, { color: theme.inkMuted, fontFamily }]}>
          {keyword ? (total > 0 ? `${total} 项设置` : '') : '输入关键字快速定位设置项，点击结果进入对应分类页。'}
        </Text>

        <ScrollView style={styles.list} contentContainerStyle={styles.listInner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {groups.map((group) => (
            <View key={group.section} style={styles.group}>
              <Text style={[styles.groupTitle, { color: theme.inkMuted, fontFamily }]}>{group.title}</Text>
              <View style={[styles.card, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
                {group.items.map((item, index) => (
                  <Pressable
                    key={item.title}
                    accessibilityRole="button"
                    accessibilityLabel={`进入${group.title}`}
                    onPress={() => onOpenSection(group.section)}
                    style={({ pressed }) => [styles.row, index > 0 && [styles.dividerTop, { borderTopColor: theme.line }], pressed && styles.pressed]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: theme.paperSoft }]}>
                      <Ionicons name={group.icon} size={18} color={theme.accent} />
                    </View>
                    <View style={styles.rowTexts}>
                      <Text style={[styles.rowTitle, { color: theme.ink, fontFamily }]}>{item.title}</Text>
                      <Text numberOfLines={1} style={[styles.rowHint, { color: theme.inkMuted, fontFamily }]}>{item.hint}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.inkMuted} />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {total === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.paperElevated, borderColor: theme.line }]}>
              <Ionicons name="search-outline" size={26} color={theme.inkMuted} />
              <Text style={[styles.emptyTitle, { color: theme.ink, fontFamily }]}>没有匹配的设置项</Text>
              <Text style={[styles.emptyBody, { color: theme.inkMuted, fontFamily }]}>换个关键字试试，比如「字体」「壁纸」或「备份」。</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 10 },
  clearButton: { padding: 4 },
  resultMeta: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8, fontSize: 12, fontWeight: '700' },
  list: { flex: 1 },
  listInner: { padding: 16, paddingBottom: 40, gap: 14 },
  group: { gap: 8 },
  groupTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginLeft: 4 },
  card: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DED2BE' },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTexts: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowHint: { fontSize: 12, fontWeight: '600' },
  emptyBox: { marginTop: 20, borderRadius: radius.lg, borderWidth: 1, padding: 22, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '900' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  pressed: { opacity: 0.72 },
});
