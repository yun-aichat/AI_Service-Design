# 产品组件契约

更新日期：2026-06-13

## 通用规则

- 键盘焦点必须使用清晰的 `focus-visible`。
- 点击目标不小于 32px；高频主操作默认 40px。
- 图标统一使用 `lucide-react`，不得混用其他图标库；常规尺寸 14 / 16 / 18px。
- 所有颜色通过 semantic token 获取，不在组件中写品牌固定色值。
- 实色品牌和状态表面必须使用对应的 `onPrimary` 或 `onSolid` 前景。
- disabled 必须不可交互，且不产生 hover 位移或阴影。
- 组件状态应由边界、文字、图标或形态共同表达，不能只依赖颜色。

## 基础 Recipe

### WorkbenchButton

- 变体：`primary`, `secondary`, `outline`, `danger`。
- 密度：`compact`, `comfortable`。
- 状态：default、hover、active、focus-visible、disabled。
- 所有变体默认保留可见边界。
- hover 最多上移 1px；active 回到原位。
- secondary hover 保留背景轻微加深，只允许很弱的品牌色描边变化与 `shadow.interactive`；深色模式下该阴影为低透明度珊瑚亮色。
- 一组操作只允许一个 `primary`。
- `outline` 用于返回、取消、查看明细等低优先级操作。
- `danger` 只用于删除、撤销支付等明确风险操作。

### WorkbenchInput / WorkbenchTextarea

- 密度：`compact`, `comfortable`。
- 状态：default、hover、focus-visible、disabled、invalid。
- 默认描边使用与次要按钮一致的 `border.default`；focus 边界和外环统一使用 `brand.primary`。
- 错误信息必须与 `aria-invalid` 同步。
- 矩阵单元格内部不得叠加输入框和单元格两层焦点描边。

### Badge / FilterChip

- Badge 使用 `radii.sm`，不默认使用胶囊形。
- 状态 Badge 使用浅色背景和对应状态前景。
- Badge / FilterChip 激活态统一使用 `bg.accent + brand.primary + brand.primary border`。
- 不使用实色主色填充普通筛选项，避免与主要 CTA 竞争。

### Alert

- 信息、成功、警告、错误使用各自状态 Token。
- 状态图标使用状态色圆形底和 16px 白色 Lucide 图标，不增加图标自身的额外装饰描边。
- 正文容器使用低饱和浅色背景；描边直接使用对应的状态实色，不额外加深。
- Alert 不承担页面级主要操作。

### Checkbox

- 必须可点击和键盘操作，并暴露 `role="checkbox"` 与 `aria-checked`。
- 未选中使用 `border.default`；选中后保留比填充色略深的品牌描边，不能让边界与背景融为一体。
- 勾选图标统一使用 14px Lucide `Check`。

### Login

- 使用正式 Input 与 Button Recipe，不单独创造登录页颜色。
- 字段必须有可关联的 Label、浏览器自动填充属性和原生表单校验。
- 登录、验证码登录等不同方式必须保持明确的主次关系。

### ConfirmationDialog

- 删除、退款、覆盖等不可逆操作必须经过二次确认。
- 使用 `bg.overlay` 遮罩和 `bg.elevated` 浮层，层级使用 `zIndex.modal`。
- 必须使用 `role="alertdialog"`、`aria-modal`、标题和说明关联。
- 标题区不使用装饰图标，依靠文案和危险确认按钮表达风险。
- 默认焦点放在取消操作，确认按钮使用对应危险语义。

### Card

- 页面级大卡片保持静止。
- 只有可点击的小卡片或列表项允许 hover 抬升。
- 层级主要通过背景、细边界和弱阴影建立，不堆叠重阴影。

## 产品组件

| 组件 | 职责 | 关键状态与键盘行为 |
|---|---|---|
| `AppShell` | 工作台布局、响应式区域和滚动边界 | 不持有业务状态；主内容应可跳转 |
| `TopBar` | 产品身份、页面级操作、主题与导航 | Tab 顺序与视觉顺序一致 |
| `ChatMessage` | 展示用户或助手消息及反馈操作 | 操作在键盘聚焦时可见 |
| `ChatComposer` | 文本、附件、发送状态 | Enter 发送、Shift+Enter 换行；加载时禁用重复发送 |
| `Proposal` | 展示 AI 结构化修改及确认入口 | pending、accepted、rejected、error |
| `MatrixHeader` | 阶段或维度标题 | default、selected、关联单元格提示 |
| `MatrixCell` | 文本、图片或情绪编辑容器 | hover、focus-visible、selected、error、disabled |
| `Scrollbar` | 低噪声滚动反馈 | hover 提高对比，不遮挡内容 |
| `Splitter` | 调整工作台或矩阵区域尺寸 | 方向键调整；具有可辨识 hover/focus 状态 |

## 验收

`/components` 必须同时验证：

- 浅色和深色主题。
- 语义色、圆角、间距和动效。
- Button、Badge、FilterChip、Input、Textarea、Checkbox、Alert。
- 真实内容卡片，而不是纯占位符。
- AppShell、Chat、Proposal、Matrix 等产品组件。

未进入验收页的可复用组件不得直接进入业务页面。
