# Scrollark

Scrollark 是一款面向 Markdown 知识文档的移动端卡片阅读应用。应用会将本地 Markdown 文档导入到本机数据库，并按照约定的标题层级拆分为可刷读、可收藏、可批注、可统计的知识卡片，适合把长篇笔记、课程资料、读书摘录等内容转化为轻量复习流。

> 当前项目基于 Expo / React Native / TypeScript 开发，主要面向移动端竖屏阅读场景。

## 目录

- [功能概览](#功能概览)
- [界面预览](#界面预览)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [Markdown 文档切分策略](#markdown-文档切分策略)
- [数据存储与运行机制](#数据存储与运行机制)
- [配置说明](#配置说明)
- [常用脚本](#常用脚本)
- [开发规范建议](#开发规范建议)

## 功能概览

- **Markdown 导入**：从手机本地选择 `.md` 或文本文件，导入后自动解析为知识卡片。
- **标题层级切分**：以 Markdown 三级标题作为最小卡片单位，一级、二级标题分别作为文档与分组上下文。
- **刷卡式阅读**：按设置的每轮卡片数生成阅读会话，优先展示未读卡片，并兼顾历史阅读顺序。
- **Get 标记**：阅读时可将卡片标记为「已 get」，应用会记录次数与最近阅读时间。
- **收藏与批注**：支持对重要卡片收藏、添加批注，并在独立页面集中查看。
- **阅读统计**：展示总卡片数、已 get 数、收藏数、批注数、今日 get 数以及近 7 天趋势。
- **阅读偏好**：支持字体、字号、文字颜色、主题模式、卡片头图与首页壁纸等个性化设置。
- **本地优先**：文档、卡片、收藏、批注、统计事件和设置均保存在本机 SQLite 数据库中。

## 界面预览

| 首页 | 知识库 | 刷知识 |
| --- | --- | --- |
| <img src="./img/readme/首页.jpg" alt="首页" width="220" /> | <img src="./img/readme/知识库页.jpg" alt="知识库页" width="220" /> | <img src="./img/readme/刷知识页.jpg" alt="刷知识页" width="220" /> |

| 收藏与批注 | 统计 |
| --- | --- |
| <img src="./img/readme/收藏与批注页.jpg" alt="收藏与批注页" width="220" /> | <img src="./img/readme/统计页.jpg" alt="统计页" width="220" /> |

## 技术栈

| 类型 | 选型 |
| --- | --- |
| 应用框架 | Expo `~55.0.31` |
| UI 运行时 | React `19.2.0`、React Native `0.83.10` |
| 语言 | TypeScript `~5.9.2` |
| 本地数据库 | `expo-sqlite` |
| 文件选择 | `expo-document-picker` |
| 文件系统 | `expo-file-system` |
| 字体加载 | `expo-font` |
| 图标 | `@expo/vector-icons` |
| 相册保存 | `expo-media-library` |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务

```bash
npm run start
```

随后可以根据 Expo 提示选择真机、模拟器或开发构建运行。

### 3. Android 本地运行

```bash
npm run android
```

### 4. Web 预览（用于基础调试）

```bash
npm run web
```

> 说明：项目包含文档选择、本地文件、SQLite、相册保存等移动端能力，Web 预览只适合进行部分界面和逻辑调试，最终行为应以 Android / iOS 设备为准。

## 项目结构

```text
Scrollark/
├── android/                    # Expo 生成的 Android 原生工程
├── fonts/                      # 应用内置字体资源
│   ├── LXGWWENKAI-REGULAR.ttf
│   ├── KaiXinJiuXiaoLinYuJiuZou-2.ttf
│   ├── FZSTK.ttf
│   ├── SIMKAI.ttf
│   └── STFANGSO.ttf
├── img/                        # 应用图片资源
│   ├── softicon.png            # 应用图标与 Android adaptive icon 前景图
│   ├── cardimg/                # 卡片头图本地资源
│   ├── heroimg/                # 首页背景本地兜底资源
│   └── readme/                 # README 展示截图
├── src/
│   ├── App.tsx                 # 应用入口、路由状态、全局数据刷新与底部导航
│   ├── components/             # 可复用组件
│   │   ├── AppButton.tsx       # 通用按钮
│   │   ├── CardDetailModal.tsx # 卡片详情弹窗
│   │   ├── CardHeaderImage.tsx # 卡片头图
│   │   ├── IconPill.tsx        # 图标标签组件
│   │   ├── KnowledgeCard.tsx   # 知识卡片主体
│   │   └── MarkdownRenderer.tsx# Markdown 渲染组件
│   ├── config/
│   │   └── imageUrls.ts        # 远程壁纸 / 卡片图地址配置
│   ├── data/
│   │   └── repository.ts       # SQLite 建表、迁移、导入、查询与写入逻辑
│   ├── domain/
│   │   └── types.ts            # 路由、文档、卡片、设置、统计等类型定义
│   ├── screens/                # 页面级组件
│   │   ├── HomeScreen.tsx      # 首页
│   │   ├── KnowledgeScreen.tsx # 知识库
│   │   ├── SessionScreen.tsx   # 刷知识阅读会话
│   │   ├── SessionEndScreen.tsx# 单轮阅读总结
│   │   ├── FavoritesScreen.tsx # 收藏与批注
│   │   ├── StatisticsScreen.tsx# 统计页
│   │   └── SettingsScreen.tsx  # 设置页
│   ├── theme/                  # 主题、字体、设计 token 与图片资源映射
│   └── utils/                  # Markdown、日期、首页背景等工具函数
├── app.json                    # Expo 应用配置
├── eas.json                    # EAS 构建配置
├── package.json                # 依赖与脚本
├── tsconfig.json               # TypeScript 配置
└── README.md                   # 项目说明文档
```

### 关键目录职责

- `src/data/repository.ts` 是数据访问层，集中处理数据库初始化、表结构迁移、Markdown 导入、卡片状态更新、统计查询与数据清空。
- `src/utils/markdown.ts` 是 Markdown 解析核心，负责将原始文档切分为卡片，并将卡片正文进一步解析为可渲染块。
- `src/components/MarkdownRenderer.tsx` 是轻量 Markdown 渲染器，支持标题、段落、引用、列表、代码块、表格以及部分行内样式。
- `src/theme/` 统一维护字体、图片、主题 token 和明暗色模式，避免页面内硬编码视觉规则。
- `img/readme/` 仅用于项目文档展示，不参与核心业务逻辑。

## Markdown 文档切分策略

Scrollark 的核心导入规则位于 `src/utils/markdown.ts` 的 `parseMarkdownToCards` 函数中。当前采用「按三级标题生成卡片」的策略。

### 标题层级语义

| Markdown 层级 | 在 Scrollark 中的作用 | 是否直接生成卡片 |
| --- | --- | --- |
| `# 一级标题` | 文档主标题 / 大主题，对应卡片的 `h1` 上下文 | 否 |
| `## 二级标题` | 分组标题，对应卡片的 `h2` 上下文 | 否 |
| `### 三级标题` | 卡片标题，对应卡片的 `h3` 和 `title` | 是 |
| `####` 至 `######` | 作为卡片正文内容保留 | 否 |

### 切分流程

1. **统一换行符**：导入时会将 `CRLF`、`CR` 统一为 `LF`，降低不同系统编辑文档造成的解析差异。
2. **读取一级标题**：遇到 `#` 标题时，更新当前文档主题 `h1`，并将二级分组重置为 `未分组`。
3. **读取二级标题**：遇到 `##` 标题时，更新当前分组 `h2`。
4. **生成卡片起点**：遇到 `###` 标题时，结束上一张卡片，并以该三级标题开启一张新卡片。
5. **写入卡片正文**：三级标题之后、下一个同级或更高级标题之前的内容，会作为当前卡片正文。
6. **保护代码块**：在三个反引号包裹的代码块内，形如 `#`、`##`、`###` 的内容不会触发切分。
7. **兜底策略**：如果整篇文档没有任何三级标题，则整篇文档会作为一张卡片导入，分组记为 `全文`。

### 边界规则

- 当文档存在至少一个三级标题时，只有归属到三级标题下的内容会进入卡片；位于第一个 `###` 之前的普通正文不会生成独立卡片，建议不要在该区域放置必须复习的正文。
- 当文档存在多个一级标题时，后续卡片会使用解析时最近的一级标题作为 `h1` 上下文；文档记录的展示标题以解析结束时的当前一级标题为准。因此更推荐一份文档只使用一个一级标题。
- 当遇到新的 `#`、`##` 或 `###` 标题时，上一张正在收集的卡片会立即收束入库。
- 四级至六级标题不会触发切分，会原样进入当前卡片正文。
- 代码块围栏未闭合时，后续内容会持续按代码块内容处理，可能影响标题识别；导入前应确保 Markdown 语法完整。

### 推荐 Markdown 写法

```markdown
# 产品知识库

## 用户体系

### 登录态如何维护

这里是第一张卡片的正文。

- 可以写列表
- 可以写重点

### Token 刷新策略

这里是第二张卡片的正文。

## 支付体系

### 订单状态流转

这里是第三张卡片的正文。
```

导入后将得到三张卡片：

| 卡片标题 | h1 | h2 |
| --- | --- | --- |
| 登录态如何维护 | 产品知识库 | 用户体系 |
| Token 刷新策略 | 产品知识库 | 用户体系 |
| 订单状态流转 | 产品知识库 | 支付体系 |

### 编写建议

- 建议每份文档只保留一个稳定的一级标题，便于知识库中展示清晰的文档主题。
- 建议将可独立复习的最小知识点写成三级标题；三级标题不宜过长。
- 三级标题下方应包含正文。如果正文为空，应用会以该标题生成最小占位内容。
- 四级及以下标题不会继续拆卡，适合用来组织单张卡片内部的小节。
- 代码示例请放入 fenced code block（即三个反引号代码块）中，避免示例里的 `#` 被误判为标题。

### 当前 Markdown 渲染能力

卡片正文会经过轻量解析后渲染，当前支持：

- 标题：`#` 至 `######`
- 段落
- 引用：`> quote`
- 无序列表：`- item`、`* item`、`+ item`
- 有序列表：`1. item`
- 代码块：<code>```language</code>
- 表格：标准 Markdown 表格分隔行
- 行内加粗：`**bold**`
- 行内高亮：`==highlight==`
- 行内代码：`` `code` ``

> 注意：当前渲染器以移动端阅读体验为目标，不等同于完整 CommonMark 实现。复杂嵌套列表、HTML 标签、脚注、任务列表等高级语法不建议作为核心内容依赖。

## 数据存储与运行机制

### 本地数据库

应用使用 `expo-sqlite` 创建本地数据库 `scrollark.db`。主要表结构如下：

| 表名 | 作用 |
| --- | --- |
| `documents` | 保存导入文档的标题、文件名、原始 URI、应用内存储路径、正文和卡片数量 |
| `cards` | 保存拆分后的卡片、层级标题、正文、排序、阅读状态、收藏状态和头图地址 |
| `annotations` | 保存卡片批注，一张卡片最多一条批注 |
| `events` | 保存导入、get、取消 get、收藏、取消收藏、批注等行为事件 |
| `settings` | 保存阅读偏好与界面配置 |

### 导入与保存

- 用户选择文档后，应用会读取文件内容并执行 Markdown 切分。
- 原始 Markdown 内容会复制到应用文档目录下的 `scrollark-documents` 文件夹。
- 文档元信息、原始内容和拆分卡片会写入 SQLite。
- 导入行为会写入 `events` 表，便于后续统计扩展。

### 阅读会话排序

点击「继续阅读」后，应用会按设置中的 `sessionCardCount` 获取一轮卡片。排序策略为：

1. 未 get 的卡片优先；
2. 已 get 的卡片按 `lastGotAt` 从早到晚回流；
3. 同等条件下使用随机顺序；
4. 最终按设置数量截取。

该策略兼顾新卡片推进与旧卡片复习，避免长期只展示新导入内容。

### 隐私说明

- Markdown 文档内容、卡片、收藏、批注和统计数据默认保存在本机。
- 首页壁纸和远程卡片图模式会请求配置的远程图片接口。
- 如需完全离线使用，可在代码配置中改用本地图片模式或移除远程图片源。

## 配置说明

### Expo 应用配置

主要配置位于 `app.json`：

- `expo.name` / `expo.slug`：应用名称与 Expo 标识。
- `expo.scheme`：应用 URL scheme，当前为 `scrollark`。
- `expo.android.package`：Android 包名，当前为 `com.scrollark.app`。
- `expo.android.permissions`：读取图片与保存图片相关权限。
- `expo.plugins`：SQLite、文档选择、资源、字体与媒体库插件。
- `expo.icon` / `expo.android.adaptiveIcon`：应用图标配置。

### 图片源配置

远程图片源位于 `src/config/imageUrls.ts`：

- `HOME_BACKGROUND_IMAGE_URLS`：首页壁纸候选接口。
- `HOME_BACKGROUND_IMAGE_URL`：默认首页壁纸接口。
- `CARD_REMOTE_IMAGE_URL`：远程卡片头图接口。
- `withImageCacheBuster`：为图片 URL 添加缓存规避参数，降低重复图片概率。

### 字体配置

字体资源位于 `fonts/`，映射关系位于 `src/theme/fonts.ts`。新增字体时需要：

1. 将字体文件放入 `fonts/`；
2. 在 `appFonts` 中增加 `require` 映射；
3. 在 `fontOptions` 中增加面向用户的选项名称；
4. 确认设置页和卡片页能正确加载该字体。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run start` | 启动 Expo 开发服务 |
| `npm run android` | 在 Android 设备或模拟器上运行 |
| `npm run web` | 启动 Web 预览 |
| `npm run typecheck` | 执行 TypeScript 类型检查 |
| `npm run lint` | 执行 Expo ESLint 检查 |
| `npm run doctor` | 执行 Expo 项目健康检查 |

## 开发规范建议

- **数据逻辑集中管理**：数据库读写应优先放在 `src/data/repository.ts`，页面层只负责触发动作与展示状态。
- **类型先行**：新增实体或页面状态时，先补充 `src/domain/types.ts`，再实现页面与数据层逻辑。
- **组件职责单一**：页面级组件放在 `src/screens/`，可复用 UI 放在 `src/components/`。
- **主题统一出口**：颜色、圆角、阴影、字体等视觉规则应从 `src/theme/` 获取，避免散落在页面中。
- **Markdown 兼容性谨慎扩展**：调整切分策略前，应重点验证含代码块、表格、多级标题和无三级标题文档的导入结果。
- **移动端优先验证**：涉及文件、SQLite、相册和权限的功能，应以真机或模拟器测试结果为准。

## 版本信息

当前项目版本：`1.0.0`

详见 `package.json` 与 `app.json`。


