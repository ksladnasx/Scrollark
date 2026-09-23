你现在需要完成一个**面向 Android 手机的纯单机知识卡片 App**，使用 **Expo + React Native + TypeScript** 开发。

这是一个完整的长任务，请不要只生成 Demo 页面，也不要停留在架构设计阶段。你的目标是：**从项目分析、技术选型、页面设计、核心功能实现、本地持久化、交互动画，到最终运行检查和问题修复，完整把这个 App 做出来。**

------

# 一、项目目标

我要做一个类似“刷短内容”的知识卡片 App。

用户可以：

1. 从 Android 手机本地选择并导入 Markdown（`.md`）文档。
2. App 自动解析 Markdown。
3. 按照 Markdown 的标题层级拆分知识卡片。
4. 每个三级标题对应一张知识卡片。
5. 用户进入首页后点击底部中心的 `get` 按钮，进入知识卡片刷取模式。
6. 卡片采用类似短视频的全屏沉浸式交互，通过上下滑动切换卡片。
7. 默认一次刷 10 张卡片，可在设置中修改为 10 / 20 等数量。
8. 每张卡片支持：
   - get
   - unget
   - 收藏
   - 批注
9. 所有用户数据，包括：
   - 原始 Markdown 文件
   - Markdown 解析结果
   - 知识卡片
   - get 状态
   - 收藏状态
   - 批注
   - 统计数据
     都必须**持久化存储在本地**。
10. 整个 App **不依赖后端服务，不需要登录，不需要联网才能正常工作**。
11. 请确保Markdown 文件解析成的知识卡片能正确展示原文中的代码块，高亮，加粗

------

# 二、最重要的开发原则

## 1. 这是纯单机 App

严禁设计后端 API。

整个应用的数据流应该是：

Android 本地文件
→ 导入 Markdown
→ 本地解析
→ 本地数据库 / 本地文件
→ React Native UI
→ 本地状态更新
→ 持久化

不要为了“架构完整”而额外引入 FastAPI、Node.js、远程数据库、Firebase、Supabase 等服务。

------

## 2. 不要假设 Expo API

开始编码之前，先检查当前项目中的：

- Expo 版本
- React Native 版本
- TypeScript 配置
- package.json
- 已安装依赖
- 项目目录结构

对于：

- 文件选择
- 文件系统
- SQLite
- 本地存储
- 手势
- 动画
- 安全区域
- 图标

优先使用当前 Expo 生态成熟、官方支持或者项目已经存在的方案。

不要凭旧版本 Expo API 直接写代码。

如果某个 API 在当前 Expo 版本发生过变化，以当前项目实际版本为准。

------

## 3. 开发前先阅读项目中的相关 Skills

先检查当前环境中可用的 Skills。

重点寻找并使用与：

- frontend design
- frontend development
- React Native
- Expo
- UI / UX
- mobile design
- animation

相关的 Skills。

如果存在类似 `frontend-design`、`fronted-design` 或其他前端设计 Skill，优先参考其设计规范。

但最终生成的页面必须真正落实这些设计原则，而不是只在代码中简单声明“使用现代化设计”。

------

# 三、整体视觉方向

整个 App 的 UI 必须采用：

**现代移动端 App + 沉浸式内容流 + 极简知识产品**

视觉上可以参考：

- 简讯类信息流 App
- 短视频 App 的沉浸式卡片交互
- Notion / Readwise / Reader 类知识产品
- 现代 iOS / Android 原生设计语言

但：

**不要直接复制任何已有 App 的 UI。**

可以参考“简讯”的整体交互逻辑和产品结构，但最终需要有自己的视觉系统。

------

# 四、UI 核心原则

必须遵守以下要求：

### 1. 严格现代前端风格

避免：

- 老式后台管理系统风格
- 大面积渐变
- 花里胡哨的装饰
- 廉价的卡片阴影
- 过多边框
- 默认 React Native Demo 风格
- 大量 Button 组件堆砌

整体应该：

- 留白充足
- 层级清晰
- 字体尺寸合理
- 圆角克制
- 阴影自然
- 动画细腻
- 信息密度适中
- 手机单手操作友好

------

### 2. 禁止 Emoji 作为 UI 图标

任何：

- 首页功能图标
- 收藏
- 设置
- 统计
- 知识库
- 返回
- 添加
- get
- unget
- 批注

都**不要使用 Emoji**。

使用：

- Expo 自带图标
- `@expo/vector-icons`
- Lucide / Material / Ionicons 等成熟图标库

具体选择以当前项目已有依赖和 Expo 兼容性为准。

------

### 3. 动画必须自然

整个 App 的动画不能是简单的：

```text
opacity: 0 → 1
```

然后到处乱套。

重点优化：

- 页面切换
- 卡片上下滑动
- 卡片进入 / 离开
- 收藏按钮反馈
- get / unget 状态切换
- 底部栏交互
- 提示页进入
- 返回首页
- Modal
- 批注面板

动画要：

- 时间自然
- 位移合理
- easing 合适
- 不产生明显顿挫
- 不抢用户注意力

优先使用 Expo / React Native 当前成熟的动画方案。

------

# 五、App 页面结构

整体页面至少包含以下几个核心页面：

```text
Home
├── Statistics
├── Favorites
├── Knowledge Base
├── Settings
└── Get Session
      ├── Knowledge Card
      └── Session End
```

建议目录结构采用清晰的模块化方式，例如：

```text
src/
├── components/
├── screens/
├── features/
│   ├── home/
│   ├── cards/
│   ├── knowledge/
│   ├── statistics/
│   ├── favorites/
│   └── settings/
├── services/
│   ├── storage/
│   ├── markdown/
│   └── card/
├── hooks/
├── store/
├── types/
├── constants/
├── utils/
└── assets/
```

实际目录可以根据项目情况调整，但必须保持职责清晰。

------

# 六、首页 Home

首页是整个 App 的入口。

整体视觉：

```text
┌──────────────────────────────┐
│         右上角功能按钮的icon  │ 
│         
│                          ↗   │
│                              │
│          壁纸 / 背景          │
│                              │
│                              │
│                              │
│                              │
│              GET             │
│                              │

└──────────────────────────────┘
```

实际 UI 不需要照着 ASCII 图做，重点理解结构。

------

## 首页背景

用户打开 App 后首先看到：

**一张全屏手机壁纸。**

要求：

- 全屏
- 沉浸式
- 可以有轻微遮罩保证文字可读性
- 不要让背景干扰操作
- 可以提供若干内置本地壁纸随机切换

因为这是纯单机 App：

**壁纸资源优先使用项目内部 assets。**

不要依赖在线图片 API。

------

## 首页顶部

顶部右侧依次有：

```text
统计
收藏
知识库
设置
```

使用图标按钮。

每一个按钮：

- 有点击反馈
- 有合理 hitSlop
- 考虑 Android 安全区域
- 使用统一 IconButton 组件

------

## 首页底部

底部中心放置核心：

```text
GET
```

这是整个 App 最重要的操作入口。

设计要求：

- 明显
- 简洁
- 有轻微按压反馈
- 可以带轻微 scale 动画
- 不要做成传统后台系统 Button
- 更像现代 App 的主操作按钮

点击 GET 后：

进入知识卡片刷取页面。

------

# 七、知识卡片刷取页面

这是整个 App 的核心。

进入之后：

**一张知识卡片几乎占满整个手机屏幕。**

用户通过上下滑动：

```text
当前卡片
    ↓
下一张
    ↓
下一张
    ↓
...
```

交互体验应该接近：

- Shorts
- TikTok
- Reels
- 短视频信息流

但这里展示的是知识卡片，而不是视频。

------

# 八、卡片结构

每张卡片由上下两个主要区域组成：

```text
┌───────────────────────────────┐
│                               │
│                               │
│         16:9 图片区域          │
│                               │
│                               │
├───────────────────────────────┤
│ 标题                          │
│                               │
│ 来源                          │
│                               │
│ Markdown 内容                 │
│                               │
│ 可滚动                        │
│                               │
├───────────────────────────────┤
│ get    unget   收藏   批注     │
└───────────────────────────────┘
```

------

# 九、卡片顶部图片

卡片顶部约占整个卡片高度的：

**30%**

顶部展示一张随机图片。

要求：

- 图片来源于本地 assets
- 随机选择
- 图片按照 16:9 比例展示
- `cover` 模式
- 不因为图片比例不同导致整个页面布局跳动

设置中允许用户关闭：

```text
显示卡片 Header 背景图
```

关闭后：

顶部区域可以：

- 保留纯色背景
- 或进行更紧凑布局

但不能导致下面内容布局异常。

------

# 十、卡片标题

标题：

```text
三级 Markdown 标题
```

例如：

```md
# React
## Hooks
### useEffect 的执行机制
```

卡片标题：

```text
useEffect 的执行机制
```

要求：

- 字体明显
- 支持多行
- 不因为长标题导致底部操作栏被挤压
- 使用合理的 lineHeight

------

# 十一、卡片来源

来源格式严格按照：

```text
“所属二级标题”《所属一级标题》
```

例如：

```md
# React
## Hooks
### useEffect
```

来源显示：

```text
Hooks《React》
```

如果某张卡片存在三级标题，但缺少一级或者二级标题，需要采用健壮的 fallback 逻辑，不允许整个 App 崩溃。

------

# 十二、Markdown 内容

三级标题下面的内容作为卡片正文。

例如：

```md
# React

## Hooks

### useEffect

useEffect 用于处理副作用。

例如：

- 网络请求
- 事件监听
- DOM 操作
```

那么：

标题：

```text
useEffect
```

来源：

```text
Hooks《React》
```

正文：

```text
useEffect 用于处理副作用。

例如：

- 网络请求
- 事件监听
- DOM 操作
```

------

# 十三、Markdown 解析要求

必须真正实现 Markdown 解析，不允许简单地：

```ts
markdown.split("###")
```

就结束。

需要至少正确处理：

- `#`
- `##`
- `###`
- 普通文本
- 列表
- 加粗
- 代码块
- 行内代码
- 链接
- 换行

特别注意：

**代码块中的 `#`、`##`、`###` 不能被当作标题。**

需要采用可靠的 Markdown parser，或者实现合理的解析逻辑。

------

# 十四、知识卡片切分规则

严格采用：

**每个三级标题产生一张知识卡片。**

例如：

```md
# 一级 A

## 二级 A

### 三级 A
内容 A

### 三级 B
内容 B

## 二级 B

### 三级 C
内容 C

# 一级 B

## 二级 C

### 三级 D
内容 D
```

应该生成：

```text
Card A
title = 三级 A
source = 二级 A《一级 A》

Card B
title = 三级 B
source = 二级 A《一级 A》

Card C
title = 三级 C
source = 二级 B《一级 A》

Card D
title = 三级 D
source = 二级 C《一级 B》
```

卡片正文：

从当前三级标题开始，到：

- 下一个三级标题
- 或者更高等级标题

之前的内容。

------

# 十五、卡片刷取逻辑

默认：

```text
一次 GET = 10 张卡片
```

但数量必须来自 Settings：

```text
10
20
```

未来代码结构应该方便扩展：

```text
10
20
30
50
```

------

## 卡片顺序

默认可以采用：

**随机卡片顺序。**

但是必须：

- 避免一次 session 中重复同一张卡片
- 如果卡片数量不足，则使用合理 fallback
- 数据量很大时不要一次性创建巨大 UI
- 不要因为随机逻辑导致重复 render

------

# 十六、刷卡体验

整个刷卡页面：

- 竖屏优先
- 全屏
- 手势切换
- 一次只展示一张主要卡片
- 需要平滑的上下滑动动画

建议采用：

```text
Gesture Handler
+
Reanimated
```

或者当前 Expo 最稳定的等价方案。

------

## 手势要求

用户：

```text
向上滑
```

进入下一张。

用户：

```text
向下滑
```

根据产品语义决定上一张 / 下一张，但必须保证整个逻辑统一、自然。

重点不是简单监听：

```text
onTouchEnd
```

而是让卡片随手指产生跟手移动效果。

例如：

```text
手指拖动
↓
卡片跟随移动
↓
达到阈值
↓
切换卡片
↓
未达到阈值
↓
回弹
```

------

# 十七、卡片顶部右侧返回按钮

每张卡片右上角有一个小图标。

点击：

```text
返回首页
```

需要：

- 图标小巧
- 不遮挡标题
- 有半透明背景或者合适对比度
- 点击区域不能太小
- 支持 Safe Area

------

# 十八、卡片底部操作栏

每张卡片底部固定：

```text
GET
UNGET
收藏
批注
```

建议结构：

```text
[ Get ] [ Unget ] [ 收藏 ] [ 批注 ]
```

操作栏必须：

- 固定在底部
- 不跟随正文滚动
- 适配小屏幕
- 适配 Safe Area
- 不影响正文阅读

------

# 十九、Get / Unget

这里需要明确区分两个概念：

### 首页 GET

表示：

```text
开始一次刷卡 Session
```

### 卡片 GET

表示：

```text
对当前知识卡片执行 get 操作 / 标记状态
```

### Unget

表示：

```text
撤销当前卡片的 get 状态
```

状态必须持久化。

例如：

```ts
card.isGot = true
```

退出 App 再重新进入后状态仍然存在。

------

# 二十、收藏

每张卡片可以点击收藏。

状态：

```text
未收藏
已收藏
```

点击后应该产生轻微动画反馈。

收藏的数据必须持久化。

------

# 二十一、批注

点击批注：

打开一个现代移动端 Bottom Sheet / Modal。

例如：

```text
┌────────────────────────────┐
│ 添加批注                   │
│                            │
│ [ 输入你的笔记... ]        │
│                            │
│              保存          │
└────────────────────────────┘
```

要求：

- 支持新增批注
- 支持修改
- 支持删除
- 持久化
- 与对应卡片关联

如果一张卡片已经存在批注，重新进入时能够看到。

------

# 二十二、十张卡片结束后的提示页

例如当前设置为：

```text
10
```

完成 10 张之后：

进入提示页。

背景：

**一张手机壁纸。**

整体风格：

极简、沉浸。

中间显示类似：

```text
这一轮刷完了

已完成 10 张知识卡片
```

底部提供：

```text
继续刷
返回首页
```

两个操作。

------

## 继续刷

点击：

```text
继续刷
```

重新进入新的 Session。

不能直接重复上一轮的卡片。

------

## 返回首页

回到 Home。

------

# 二十三、统计页面

首页右上角的统计按钮进入 Statistics。

统计页面至少包含：

## 1. 七日 get 趋势

展示：

```text
过去 7 天每天 get 的知识卡片数量
```

例如：

```text
Mon  ███
Tue  █████
Wed  ██
Thu  ██████
Fri  ████
Sat  ███████
Sun  █████
```

使用真正的图表，而不是简单堆文字。

可以使用适合 React Native / Expo 的图表方案。

------

## 2. 收藏数量

例如：

```text
收藏
128
```

------

## 3. 知识卡片数量

例如：

```text
知识卡片
1,245
```

------

## 4. 知识卡片数量趋势

记录每天知识库中的卡片数量。

例如：

```text
过去 7 天：

860
920
920
1030
1100
1180
1245
```

使用折线图或者其他现代化趋势图展示。

------

# 二十四、统计数据来源

不要每次打开统计页面再临时扫描所有数据。

可以设计统计事件：

```text
GET_CARD
ADD_CARD
DELETE_CARD
IMPORT_DOCUMENT
```

本地持久化。

然后按日期聚合。

如果当前项目数据量比较小，也可以在本地数据库层进行聚合查询。

重点：

**统计数据必须准确，并且 App 重启后不能丢失。**

------

# 二十五、收藏页面

点击首页：

```text
收藏
```

进入收藏列表。

显示用户收藏的知识卡片。

每条卡片可以展示：

```text
标题
来源
摘要 / 部分正文
收藏时间
```

点击可以进入知识卡片详情。

建议支持：

- 下拉刷新不是必须
- 收藏状态切换
- 空状态
- 长文本
- 删除收藏

------

# 二十六、知识库页面

首页：

```text
知识库
```

点击进入 Knowledge Base。

页面显示：

```text
我的知识库

React.md
JavaScript.md
网络.md
数据库.md
...
```

每个文档可以展示：

```text
文件名
导入时间
卡片数量
```

------

# 二十七、知识库右下角 + 按钮

右下角必须有：

```text
+
```

浮动按钮。

点击：

打开 Android 文件选择器。

用户可以选择：

```text
.md
```

文件。

------

# 二十八、Markdown 文件导入

整个流程：

```text
点击 +
↓
打开 Android 文件选择器
↓
选择 .md 文件
↓
读取文件内容
↓
解析 Markdown
↓
根据 ### 拆分知识卡片
↓
保存原始文件
↓
保存解析结果
↓
更新数据库
↓
刷新知识库
↓
显示导入成功
```

------

# 二十九、文件权限问题

重点处理 Android 文件访问权限。

优先使用 Android 系统文件选择器 / Storage Access Framework 对用户主动选择的文件进行访问。

不要无意义地申请：

```text
MANAGE_EXTERNAL_STORAGE
```

这种高权限。

如果当前 Expo 方案下：

```text
DocumentPicker
```

已经可以让用户选择文件，则优先使用用户主动授权文件的方式。

导入成功后：

**将用户选中的 Markdown 文件复制 / 保存到 App 自己可持久访问的本地目录。**

这样以后：

即使原始文件被删除、移动，App 内的知识库仍然存在。

------

# 三十、本地持久化方案

需要给这个项目设计一个合理的本地数据层。

优先考虑：

```text
SQLite
+
FileSystem
```

或者当前 Expo 版本下更成熟的同类组合。

推荐思路：

### 文件系统

保存原始 Markdown：

```text
documents/
  xxx.md
  xxx.md
```

### SQLite

保存：

```text
documents
cards
favorites
annotations
get_events
settings
```

------

# 三十一、建议数据模型

不要求严格照搬，但至少要解决这些问题。

## documents

```text
id
name
filePath
importedAt
updatedAt
cardCount
```

## cards

```text
id
documentId
title
source
content
level1Title
level2Title
level3Title
isGot
isFavorite
createdAt
updatedAt
```

## annotations

```text
id
cardId
content
createdAt
updatedAt
```

## get_events

```text
id
cardId
createdAt
```

## settings

```text
key
value
```

------

# 三十二、数据关系

一个 Markdown 文档：

```text
documents
     │
     ├── card 1
     ├── card 2
     ├── card 3
     └── card N
```

一张 card：

```text
card
 ├── favorite
 ├── get history
 └── annotations
```

删除 Markdown 文档时，需要考虑对应知识卡片及其关联数据的级联删除。

不要留下大量孤儿数据。

------

# 三十三、设置页面

设置页面采用现代 Mobile Settings UI。

至少包含：

## 每次 GET 数量

例如：

```text
每次刷取
○ 10
○ 20
```

------

## 字体选择

可选择的字体我放在根目录的fonts文件夹下了

可选字体：

- `system`：系统字体。
- `lxgw`：霞鹜文楷，使用 `/LXGWWENKAI-REGULAR.woff2`。
- `simkai`：楷体，使用 `/SIMKAI.woff2`。
- `fangsong`：仿宋，使用 `/STFANGSO.woff2`。
- `fzstk`：方舒，使用 `/FZSTK.woff2`。
- `qingfeng`：清风手体，使用 `/KaiXinJiuXiaoLinYuJiuZou-2.woff2`。



## 字体大小

例如：

```text
小
标准
大
超大
```

------

## 字体颜色

至少提供几种合理的主题颜色 / 阅读颜色方案。

------

## 是否显示 Header 背景图

```text
显示卡片背景图
[ ON ]
```

关闭后所有卡片统一取消顶部图片区域。

------

## 其他合理设置

可以根据 UI / UX 需要补充：

- 动画开关
- 自动记忆上次阅读位置
- 深色模式
- 壁纸随机方式

但：

**不要为了凑功能而无意义增加设置项。**

------

# 三十四、状态管理

根据项目规模选择合适的状态管理方式。

不要为了小项目上特别复杂的状态系统。

需要合理区分：

### Server State

这个 App 没有服务器。

### Local Persistent State

例如：

- Settings
- Cards
- Favorites
- Annotations
- Get events

这些必须来自本地持久化层。

### UI State

例如：

- Modal 是否打开
- 当前动画状态
- 当前页面
- 手势状态
- 当前选中的卡片

这些可以使用 React 状态 / Hooks。

------

# 三十五、重要性能要求

这个项目未来可能导入：

```text
1000+
5000+
10000+
```

张知识卡片。

所以不要一开始就：

```ts
cards.map(...)
```

渲染全部卡片。

刷卡页面应该只维护：

```text
当前
前一张
后一张
```

或者少量预加载数据。

------

# 三十六、大量 Markdown 的处理

导入大文件时：

不要阻塞主线程太久。

至少考虑：

- 异步读取
- 异步解析
- 导入 Loading
- 导入成功反馈
- 导入失败处理

如果当前 Expo 环境适合，可以进一步考虑合理的后台 / 分批处理策略。

------

# 三十七、Markdown 导入异常

必须处理：

```text
空文件
损坏文件
不是 md
没有三级标题
三级标题为空
只有一级标题
只有二级标题
超大 Markdown
特殊字符
中文文件名
重复导入
```

不能让 App 崩溃。

------

# 三十八、重复导入

如果用户再次导入同一个文件：

需要有明确策略。

推荐：

检测文件名 + 文件内容 hash。

如果是同一份文件：

可以提示：

```text
该文档已经存在，是否重新导入？
```

如果重新导入：

必须保证旧卡片不会残留成孤儿数据。

------

# 三十九、空知识库

没有 Markdown 文件时：

知识库页面应该设计漂亮的空状态。

例如：

```text
还没有知识文档

导入你的第一份 Markdown
开始构建知识库
```

下面有：

```text
导入 Markdown
```

按钮。

------

# 四十、没有知识卡片时点击 GET

如果知识库中：

```text
cardCount = 0
```

用户点击首页 GET：

不要进入空白刷卡页面。

应该提示：

```text
还没有知识卡片

请先导入 Markdown 文档
```

并提供：

```text
去知识库
```

------

# 四十一、错误处理

所有重要操作都需要有用户反馈：

例如：

```text
文件读取失败
解析失败
数据库写入失败
删除失败
```

不要：

```ts
catch (e) {
  console.log(e)
}
```

然后 UI 什么都不告诉用户。

------

# 四十二、导航

根据项目规模选择：

```text
Expo Router
```

或者项目当前已经使用的导航体系。

推荐结构：

```text
/
├── home
├── statistics
├── favorites
├── knowledge
├── settings
└── get
```

但刷卡页面应该保持沉浸式，不应该出现传统导航栏。

------

# 四十三、主题系统

不要在组件里面到处出现：

```ts
color="#fff"
fontSize={18}
borderRadius={20}
```

建议统一：

```text
theme/
colors
spacing
radius
typography
shadows
```

组件使用设计 token。

这样以后方便统一调整视觉风格。

------

# 四十四、组件设计

抽离通用组件，例如：

```text
IconButton
PrimaryActionButton
BottomActionBar
KnowledgeCard
CardImage
CardContent
SourceLabel
AnnotationSheet
EmptyState
StatCard
ChartCard
FloatingAddButton
SettingsRow
```

不要把整个 App 写进：

```text
App.tsx
```

------

# 四十五、图片系统

因为是纯单机：

我在根目录的img文件夹下存放了你可以使用的图片，cardimg图片主要是用作卡片的图像，heroimg主要是用于首页的图像，你可以缩小和裁剪图片来适当适应样式。

随机算法可以：

```text
Random
```

但需要避免连续两张卡片出现相同图片。

可以：

```text
previousImageId
```

避免重复。

------

# 四十六、字体与阅读体验

知识卡片是核心内容，所以阅读体验必须优先。

正文要求：

- 适当行高
- 合理字号
- 中文阅读友好
- 长文本可滚动
- 标题和正文层级明显
- 不要让内容贴边
- 底部操作栏不能挡住正文

------

# 四十七、长正文滚动问题

卡片本身负责：

```text
上下刷卡
```

卡片内部同时存在：

```text
正文垂直滚动
```

这是这个项目非常重要的交互问题。

需要设计合理的手势冲突解决策略。

例如：

- 正文区域允许内部滚动
- 用户滑动卡片边缘 / 非正文区域时进行卡片切换
- 或者通过手势阈值协调两种行为

不能出现：

“我想滚正文，结果切换了下一张卡片”

或者：

“我想刷下一张，但正文一直滚动”

必须实际测试并优化。

------

# 四十八、安卓适配

至少考虑：

- Android Safe Area
- 不同屏幕尺寸
- 小屏手机
- 大屏手机
- 状态栏
- 导航栏
- Android Back
- 键盘弹出
- Bottom Sheet
- 长文本
- 中文字体

尤其需要处理：

```text
Keyboard Avoiding
SafeArea
StatusBar
Navigation Bar
```

------

# 四十九、Android 返回键

例如：

在：

```text
Settings
Statistics
Favorites
Knowledge Base
```

点击 Android 返回键：

应该返回上一页面。

在：

```text
Card Session
```

点击 Android 返回键：

可以返回 Home，但最好有适当的退出逻辑，不要误操作直接丢失状态。

如果当前存在批注输入：

应该优先关闭输入框 / Bottom Sheet。

------

# 五十、性能与渲染优化

重点关注 React Native 中：

- 不必要的 render
- 大量卡片状态变化
- Bottom Action Bar 重绘
- 图片重复加载
- 列表渲染
- SQLite 查询频率
- Settings 改动导致全局重绘

合理使用：

```text
memo
useMemo
useCallback
selector
```

但是：

**不要为了“看起来像优化”而滥用 memo。**

必须针对真实 render 问题使用。

------

# 五十一、工程质量

代码必须：

- TypeScript
- 类型完整
- 少用 any
- 模块职责清晰
- 错误处理完整
- 避免魔法数字
- 避免巨型组件
- 避免重复代码
- 不保留明显 Demo 代码

------

# 五十二、不要生成假功能

以下情况不允许：

```text
// TODO: 后面接数据库
// TODO: 后面实现手势
// TODO: 后面做统计
```

对于核心功能：

**必须真正实现。**

尤其是：

- Markdown 导入
- Markdown 解析
- 卡片拆分
- 本地持久化
- get
- unget
- 收藏
- 批注
- 统计
- 设置
- 卡片上下刷取

这些都必须真实可用。

------

# 五十三、不要只做视觉 Demo

最终运行起来之后，我应该能够完成：

```text
启动 App
↓
看到首页壁纸
↓
点击知识库
↓
点击 +
↓
选择 md 文件
↓
导入
↓
生成知识卡片
↓
回到首页
↓
点击 GET
↓
开始刷卡
↓
上下滑动
↓
点击收藏
↓
点击批注
↓
点击 GET / UNGET
↓
刷完 10 张
↓
进入结束页
↓
继续刷 / 返回首页
↓
打开统计
↓
看到过去 7 天统计
↓
打开收藏
↓
看到收藏卡片
↓
打开设置
↓
修改每次刷取数量
↓
重新 GET
↓
验证设置生效
```

这个流程必须完整打通。

------

# 五十四、持久化验收

必须实际验证：

### 场景 1

导入 Markdown：

```text
A.md
```

杀掉 App。

重新打开。

应该仍然存在：

```text
A.md
+
对应知识卡片
```

------

### 场景 2

收藏一张卡片。

杀掉 App。

重新打开。

收藏仍然存在。

------

### 场景 3

添加批注。

杀掉 App。

重新打开。

批注仍然存在。

------

### 场景 4

修改：

```text
每次刷取 = 20
```

重新启动 App。

仍然应该是：

```text
20
```

------

# 五十五、最终验收标准

完成之后逐条检查：

## 首页

-  全屏壁纸
-  顶部统计
-  收藏
-  知识库
-  设置
-  中央 GET
-  UI 现代化
-  无 Emoji

## 知识库

-  Markdown 导入
-  文件持久化
-  自动解析
-  每个三级标题一个 Card
-  正确获取一级 / 二级标题
-  正确生成 source

## Card

-  上部 30% 图片
-  16:9
-  随机本地图片
-  标题
-  source
-  正文
-  可滚动
-  GET
-  UNGET
-  收藏
-  批注
-  右上角返回 Home

## Session

-  默认 10 张
-  可设置
-  上下滑动
-  无重复
-  自然动画
-  Session 结束页
-  继续刷
-  返回首页

## Statistics

-  7 天趋势
-  Get 数量
-  收藏数量
-  Card 数量
-  Card 数量趋势

## Settings

-  每次刷卡数量
-  字体大小
-  字体颜色
-  Header 图片开关
-  设置持久化

## Persistence

-  Markdown 本地持久化
-  Card 本地持久化
-  收藏持久化
-  Get 持久化
-  Annotation 持久化
-  Settings 持久化

------

# 五十六、执行方式

这是一个长任务，请严格按以下顺序执行。

## Phase 1：项目分析

先检查：

```text
项目目录
package.json
Expo 版本
React Native 版本
已有依赖
已有 Skills
已有 UI 组件
```

同时确认：

```text
当前项目是否已经可以直接运行 Android
```

不要未经分析直接大面积重构项目。

------

## Phase 2：制定技术方案

在真正修改代码前：

确定：

```text
导航方案
本地数据库方案
文件存储方案
Markdown 解析方案
手势方案
动画方案
图表方案
Icon 方案
主题方案
```

并保证这些方案与当前 Expo 版本兼容。

------

## Phase 3：先搭建 UI 框架

先完成：

```text
Home
Statistics
Favorites
Knowledge
Settings
Card Session
Session End
```

确保：

- 页面可以导航
- UI 骨架完整
- 视觉风格统一

------

## Phase 4：实现本地数据层

然后实现：

```text
SQLite
FileSystem
Repository / Service
```

把数据访问封装起来。

UI 不应该到处直接写 SQLite SQL。

例如：

```text
cardRepository
documentRepository
annotationRepository
statisticsRepository
settingsRepository
```

------

## Phase 5：实现 Markdown 导入

完整实现：

```text
DocumentPicker
↓
FileSystem
↓
Markdown Parser
↓
Card Generator
↓
SQLite
```

------

## Phase 6：实现核心刷卡功能

实现：

```text
Get Session
↓
Card
↓
Gesture
↓
Animation
↓
Next Card
↓
Session End
```

------

## Phase 7：实现 Get / Favorite / Annotation

确保所有状态与数据库真正联动。

------

## Phase 8：实现 Statistics

基于真实数据，而不是写死的数据。

开发阶段可以暂时使用 Seed Data 验证 UI，但最终必须改成真实数据库数据。

------

## Phase 9：实现 Settings

确保修改：

```text
session card count
font size
font color
header image
```

后立即影响 App，并重新启动后仍然生效。

------

## Phase 10：完整测试

实际执行：

```text
npm / pnpm / yarn
```

项目当前使用什么包管理器就用什么。

至少进行：

```text
TypeScript 检查
Lint
Build
Android 启动检查
```

并修复发现的问题。

------

# 五十七、非常重要的开发约束

不要：

- 因为代码复杂就删减核心需求
- 因为实现麻烦就用假数据替代
- 因为手势难处理就改成点击下一张
- 因为 SQLite 麻烦就全部塞 AsyncStorage
- 因为文件权限复杂就要求用户手动复制文件
- 因为图表麻烦就只显示数字
- 因为动画复杂就完全不做动画
- 使用 Emoji 代替 icon
- 大量复制代码
- 将所有逻辑写在一个页面

------

# 五十八、允许合理调整

你可以根据实际工程情况对：

- 文件结构
- 组件拆分
- 数据表字段
- 状态管理方案
- 具体图表库
- 图标库
- 动画实现
- UI 细节

进行合理调整。

但是：

**不得改变核心产品逻辑。**

如果为了技术实现必须调整某个细节，优先选择：

```text
不影响用户体验
不增加后端依赖
不破坏纯单机结构
不破坏数据持久化
```

的方案。

------

# 五十九、完成后的最终输出

任务完成后，不要只告诉我：

```text
Done
```

需要给出：

### 1. 最终项目结构

说明主要目录和职责。

### 2. 技术栈

例如：

```text
Expo
React Native
TypeScript
SQLite
FileSystem
DocumentPicker
Gesture Handler
Reanimated
...
```

### 3. 核心数据流

说明：

```text
Markdown
→ Parser
→ Cards
→ SQLite
→ UI
```

以及：

```text
Get
→ Event
→ Statistics
```

### 4. 已实现功能

逐项确认。

### 5. 测试结果

告诉我：

```text
TypeScript
Lint
Build
Android
```

分别是否通过。

### 6. 已知问题

如果还有问题，必须明确写出来。

不要为了让我觉得“全部完成”而隐藏问题。

------

# 六十、最终产品目标

最终做出来的 App 应该让用户产生这样的体验：

```text
打开 App
↓
看到一张舒服的壁纸
↓
点击 GET
↓
马上进入知识卡片
↓
手指向上滑
↓
下一张知识卡片自然出现
↓
像刷短视频一样快速吸收知识
↓
看到感兴趣的内容可以收藏
↓
可以留下批注
↓
一轮刷完十张
↓
看到今天自己的学习量
↓
可选择返回首页或者继续向下刷继续下一轮
```

核心目标不是“做一个功能很多的 Expo Demo”，而是：

**做一个真正可以长期使用的、本地知识 Markdown → 知识卡片 → 沉浸式刷卡学习的软件。**

从现在开始，直接按照上述要求执行整个工程任务。先检查现有项目和 Skills，再逐步实现，不要停留在方案讨论阶段。