# 设计 Token

更新日期：2026-06-16

## 原则

- Chakra UI v3 提供组件、响应式、可访问状态和基础刻度。
- `coss` 提供视觉语言，不复制其组件实现或 CSS 变量体系。
- Token 真源文件是 `src/design-system/design-tokens.json`，`src/design-system/theme.ts` 只负责把它映射到 Chakra 主题。
- 固定色值只允许出现在 token 真源或专门的静态导出 token 分组中，业务组件和工具实现不得直接写值。
- 业务组件必须使用 semantic token，禁止新增平行颜色体系。
- 浅色与深色共享相同语义角色，通过 Chakra `_dark` 映射。

## 真源结构

- `theme.tokens`：基础刻度，如品牌色、字体、字号、圆角、动效、层级。
- `theme.semanticTokens`：业务组件直接消费的语义 token。
- `layout`：壳层与工作区尺寸，例如顶栏高度、侧栏宽度、区块间距。
- `export`：静态导出物专用 token，例如 Journey Map SVG 的背景、边框和文字色。

## 核心颜色

| Token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `brand.primary` | `#fc7260` | `#ff8d73` | 主操作表面、品牌强调 |
| `brand.onPrimary` | `#fffefb` | `#181715` | 品牌主按钮前景 |
| `bg.canvas` | `#fffefb` | `#161210` | 页面画布 |
| `bg.surface` | `rgba(255,255,255,.94)` | `rgba(29,24,21,.92)` | 卡片与主要表面 |
| `bg.panel` | `#f6f1ea` | `rgba(255,255,255,.06)` | 弱化分组与侧栏 |
| `bg.secondary` | `#f6efe7` | `#3f3631` | 次级控件 |
| `bg.accent` | `#ffede8` | `rgba(255,119,89,.18)` | 选中与轻强调 |
| `bg.elevated` | `#ffffff` | `#241d19` | Popover、Modal 等浮层 |
| `bg.overlay` | `rgba(20,17,16,.36)` | `rgba(0,0,0,.62)` | 模态遮罩 |
| `fg.default` | `#141110` | `#f6efe7` | 主要文字 |
| `fg.muted` | `#6f6b64` | `#b5aea4` | 辅助正文 |
| `fg.subtle` | `#8e8b82` | `#8f887f` | 非关键说明和装饰信息 |
| `fg.disabled` | `#8e8b82` | `#77716a` | 禁用内容 |
| `fg.link` | `#a63a2d` | `#ff9e88` | 文本链接 |
| `fg.accent` | `#252320` | `#ffe7e0` | 轻强调表面的文字 |

## 边界与交互

| Token | 用途 |
|---|---|
| `border.subtle` | 装饰分割线 |
| `border.default` | 卡片、列表和普通边界 |
| `border.input` | 输入和可交互控件边界，满足 3:1 |
| `border.strong` | 矩阵和强调分割 |
| `border.focus` | 聚焦控件边界 |
| `border.error` | 错误控件边界 |
| `interaction.selected` | 普通选中背景 |
| `interaction.focusRing` | 全局 focus-visible 外环 |

`brand.primary` 是品牌表面色，不兼任浅色主题的焦点环。

## 状态语义

每种 `info / success / warning / error` 状态都由五个角色组成：

- `status.{name}`：实心图标和状态指示。
- `status.{name}Surface`：低饱和容器背景。
- `status.{name}Border`：状态容器边界。
- `status.{name}Fg`：状态正文和标题。
- `status.onSolid`：实心状态色上的高对比前景。

状态色只表达状态，不替代品牌主色。

## 圆角

| Token | 值 | 用途 |
|---|---:|---|
| `radii.xs` | 6px | Checkbox、小图标容器 |
| `radii.sm` | 8px | Badge、紧凑标签 |
| `radii.md` | 10px | Button、Input、筛选项 |
| `radii.lg` | 12px | 卡片、提示框 |
| `radii.xl` | 14px | 页面级展示容器 |
| `radii.full` | 999px | 进度条和状态点 |

## 排版、阴影与层级

- 字号：`micro / caption / body / section / title / display`。
- 字重：`regular = 400 / medium = 450 / semibold = 550`，避免工具界面出现过重标题。
- 行高：`tight / title / body / relaxed`。
- 阴影：`xs / sm / md / lg / interactive`，均提供浅色与深色独立映射。
- 深色静态阴影使用黑色透明层；`interactive` hover 阴影例外使用低透明度珊瑚亮色，强化交互反馈。
- 层级：`sticky / popover / modal / toast / drag`。
- 间距沿用 Chakra 4px 刻度。
- 动效：`fast = 120ms`，`normal = 180ms`，使用 `standard` easing。

## 动效

- 可点击小卡片 hover 最多上移 1px。
- 大页面卡片和静态容器不使用 hover 位移。
- disabled 不产生位移或阴影。
- 系统启用 `prefers-reduced-motion: reduce` 时，取消位移和持续动画。

## 字体

```css
font-family: -apple-system, "MiSans VF", "MiSans", "PingFang SC", "Microsoft YaHei", sans-serif;
```

正文默认 400，标题默认 600，不使用浏览器伪粗体。

## 无障碍约束

- 普通文字与背景对比度至少 `4.5:1`。
- 大文字、控件边界、焦点指示和关键图形至少 `3:1`。
- `brand.primary` 不默认作为浅色主题的小字号文字。
- 品牌主按钮按视觉规范使用 `brand.onPrimary`；状态实色必须使用 `status.onSolid`。
- 浅色 `brand.primary + brand.onPrimary` 是品牌视觉例外，不扩展到正文、状态按钮或小尺寸标签。
- 业务代码禁止直接使用 `red.600`、`green.600` 等原始色阶表达产品语义。
