import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { Settings } from '../domain/types';
import { useAppTheme } from '../theme/ThemeContext';

type Props = {
  settings: Settings;
  onClose: () => void;
};

// 说明文档本身就用应用的 Markdown 渲染器呈现：用户看到的排版 = 卡片正文的实际效果。
// 内容必须与 utils/markdown.ts 的解析规则保持一致（# 文档名 / ## 分组 / ### 切卡，
// 代码块内不解析标题，无 ### 时整篇一张卡）。
const GUIDE_MARKDOWN = `导入的 Markdown 文档按标题层级自动切成知识卡片：\`##\` 负责分组，\`###\` 负责切卡。

## 标题层级

| 记法 | 作用 | 生成卡片 |
| --- | --- | --- |
| # 一级标题 | 文档名称 | 否 |
| ## 二级标题 | 卡片分组 | 否 |
| ### 三级标题 | 一张卡片的开头 | 是 |

- 每写一个 \`###\`，就开始一张新卡片，标题文字就是卡片名
- 卡片正文一直延续到下一个 \`#\` / \`##\` / \`###\` 出现为止
- 卡片会带着所在分组展示；没有 \`##\` 分组时归入「未分组」

## 示例

\`\`\`md
# 前端面试手册

## React

### useEffect 的执行时机

依赖数组变化时才会重新执行。

### 闭包陷阱

定时器回调里读到的是旧 props。

## 浏览器

### 从输入 URL 到渲染

DNS 解析，TCP 握手，构建渲染树。
\`\`\`

这篇文档会切成 **3 张卡片**：\`useEffect 的执行时机\` 与 \`闭包陷阱\` 归入「React」分组，\`从输入 URL 到渲染\` 归入「浏览器」分组；知识库里的文档名显示为「前端面试手册」。

## 规则细节

- 没有 \`###\` 的文档会整篇变成一张卡片，不会导入失败
- 代码块（三个反引号包裹）里出现的 \`#\` 不会被当作标题，可以放心写注释
- \`####\` 及更深的标题视作普通正文，不会切出新卡

## 卡片正文支持的写法

- **加粗**：两侧各两个星号
- ==高亮标记==：两侧各两个等号
- 行内代码：两侧各一个反引号
- 无序 / 有序列表：短横线或数字点开头
- 引用：大于号开头
- 表格与代码块：管道表格、三反引号代码块
`;

export function MarkdownGuideModal({ settings, onClose }: Props) {
  const theme = useAppTheme();
  const fontFamily = settings.fontFamily;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.wrap, { backgroundColor: theme.paper }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.line }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭格式说明"
            onPress={onClose}
            style={({ pressed }) => [styles.backButton, { backgroundColor: theme.paperElevated, borderColor: theme.line }, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={24} color={theme.ink} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={[styles.eyebrow, { color: theme.inkMuted, fontFamily }]}>Knowledge Base</Text>
            <Text style={[styles.title, { color: theme.ink, fontFamily }]}>Markdown 格式说明</Text>
          </View>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          <MarkdownRenderer markdown={GUIDE_MARKDOWN} color={theme.ink} fontSize={15} fontFamily={fontFamily} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { height: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  titleWrap: { flex: 1, gap: 1 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.6 },
  body: { flex: 1 },
  bodyContent: { padding: 18, paddingBottom: 60 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
