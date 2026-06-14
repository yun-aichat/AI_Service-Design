# 视觉风格与设计规范

更新日期：2026-06-13

## 当前基线

设计系统以 Chakra UI v3 为技术基础，并吸收 `D:\knowledge\codex\coss\Design.md` 的视觉语言。

- 主题实现：`src/design-system/theme.ts`
- 基础 Recipe：`src/design-system/recipes.ts`
- 基础控件：`src/design-system/controls.tsx`
- 产品组件契约：`docs/component-contracts.md`
- Token 清单：`docs/design-tokens.md`
- 视觉验收入口：`/components`

`coss` 是设计参考，不是运行时依赖。项目不复制其组件库实现，不新增与 Chakra 重叠的通用组件库。

## 风格定位

关键词：

- 暖
- 清晰
- 克制
- 内容优先
- 轻量层次
- 专业工具感

界面不是营销页，也不是冷灰后台模板。暖白画布与珊瑚主色提供亲和感，低饱和表面、细边界和有限阴影维持工具效率。

## 色彩

### 浅色

- 页面背景：`bg.canvas / #fffefb`
- 卡片表面：`bg.surface / rgba(255,255,255,.94)`
- 次级表面：`bg.secondary / #f6efe7`
- 弱化分组：`bg.panel / #f6f1ea`
- 轻强调：`bg.accent / #ffede8`
- 主文字：`fg.default / #141110`
- 次级文字：`fg.muted / #8e8b82`
- 主色：`brand.primary / #fc7260`
- 主色上的文字：`brand.onPrimary / #fffefb`

### 深色

- 页面背景：`bg.canvas / #161210`
- 卡片表面：`bg.surface / rgba(29,24,21,.92)`
- 主文字：`fg.default / #f6efe7`
- 次级文字：`fg.muted / #b5aea4`
- 主色：`brand.primary / #ff8d73`
- 主色上的文字：`brand.onPrimary / #181715`

信息、成功、警告和错误分别使用 `status.info / success / warning / error`，不得用品牌色代替状态语义。

每种状态必须同时使用 `Surface / Border / Fg / onSolid` 配对 Token，禁止假设白色可以放在任意状态实色上。

## 字体

```css
font-family: -apple-system, "MiSans VF", "MiSans", "PingFang SC", "Microsoft YaHei", sans-serif;
```

- 正文：400，行高 1.5。
- 控件和次级标题：450。
- 页面标题与关键标签：550。
- 不使用 700 以上字重。
- 不依赖外部字体 CDN；本机有 MiSans 时自动使用。
- 需要自托管时优先使用 WOFF2 可变字体和中文子集。

## 圆角、间距与阴影

- 圆角：6 / 8 / 10 / 12 / 14px。
- 间距：4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48px。
- 卡片阴影保持弱对比；主要层级仍由背景和边界建立。
- 阴影按浅色和深色分别映射；深色模式使用纯黑透明阴影，不使用发白投影。
- 可点击小卡片 hover 可上移 1px，并增加轻阴影。
- 页面级大卡片和静态内容容器不使用 hover 位移。
- 用户开启减少动态效果时，取消位移、长动画和非必要过渡。

## 基础组件规则

### Button

- 变体：`primary / secondary / outline / danger`。
- 所有按钮保留可见边界。
- 一组操作只允许一个 primary。
- 普通导航和低优先级操作使用 outline，不使用无边界 ghost 作为默认方案。
- hover 180ms、上移 1px；active 回到原位；disabled 不移动。
- Button、Badge、FilterChip、Input、Textarea 与 Checkbox 的选中和 focus-visible 统一使用 `brand.primary`。

### Badge 与筛选

- Badge 使用小圆角，不默认使用胶囊形。
- 激活筛选使用浅主色背景、主色文字和可见边界。
- 状态 Badge 使用状态色的低饱和背景。

### Input 与 Textarea

- 默认使用 `border.input`。
- hover 提升边界对比，focus-visible 使用 `brand.primary` 边界与外环。
- invalid 使用 `status.error`，并与错误文本和 `aria-invalid` 同步。

### Alert

- 状态反馈图标使用状态色圆形底和 16px 白色 Lucide 图标。
- 正文区域使用轻状态色背景和细边界。
- 不使用大面积高饱和状态底色。

### Card

- 页面大卡片静止。
- 可点击列表项、小卡片允许轻抬升。
- 卡片不堆叠重阴影，不使用装饰性大渐变；页面背景可使用极弱径向色晕。

## 工作台与 Journey Map

保留当前工具交互：

- 顶部工具操作与主题切换。
- 左内容、右 AI 对话的工作台结构。
- 矩阵冻结标题、单元格选中、行高调整和独立滚动。
- 文字、图片、情绪三类行。
- AI 澄清、结构化提案、用户确认后应用。
- Markdown、JSON、CSV、SVG 与打印导出。

Journey Matrix 继续由 Chakra Splitter、CSS Grid、输入控件和 lucide 图标组成。本轮设计迁移不得改变 Journey 领域规则、AI 协议、持久化和导出语义。

## 图标

- 所有界面功能图标统一使用 `lucide-react`，不得混用其他图标库。
- 常规尺寸为 14 / 16 / 18px。
- 不使用 Emoji 作为功能或状态图标。
- 图标按钮必须有 `aria-label`。
- 优先使用 1.75–2px 描边的线性图标；同一操作在不同页面必须使用同一个 Lucide 图标。

## 组件库维护

组件库入口：

```text
/components
```

维护要求：

1. 新增可复用组件时同步加入组件库。
2. 修改 Token、Recipe 或组件样式时同步更新真实示例。
3. 示例优先使用项目、活动、额度、上传和 AI 提案等真实内容。
4. 同时验收浅色、深色、hover、focus-visible、disabled、selected 和 error。
5. 外部设计规范必须先翻译为本项目 semantic token 和组件契约，不能直接复制实现。
6. 普通文字满足 4.5:1，对象边界和焦点指示满足 3:1。
7. 后续页面设计必须使用本规范，不得新增平行颜色、字号、阴影或动效变量。

## 当前实现状态

- 已完成 coss 视觉语言到 Chakra semantic token 的映射。
- 已更新按钮、输入控件和交互动效 Recipe。
- 已补充 Badge、FilterChip、Alert、Checkbox、真实内容卡片和产品组件示例。
- 已更新组件规范、Token 和设计基础文档。
- Journey Map 业务页面尚未进行逐区域视觉重排，后续应单独拆分任务并回归现有交互。
