# Chakra 设计基础

更新日期：2026-06-13

## 方向

产品采用“暖、清晰、克制”的专业工具视觉。`D:\knowledge\codex\coss\Design.md` 提供新的视觉语言参考；当前项目继续使用 Chakra UI v3，不迁移到 coss 使用的组件库。

迁移关系：

- Chakra：组件基础、可访问性、响应式、Recipe 和 color mode。
- coss：语义色角色、暖白画布、珊瑚主色、圆角节奏、轻阴影与交互手感。
- 项目产品层：AppShell、AI 对话、Proposal、Journey Matrix 等业务组件契约。

## 视觉基线

- 浅色画布为暖白 `#fffefb`，深色画布为暖黑 `#161210`。
- 主色为珊瑚色，浅色 `#fc7260`，深色 `#ff8d73`。
- 卡片依靠半透明表面、细边界和弱阴影建立层级。
- 圆角范围为 6–14px，普通标签不默认使用胶囊形。
- 主标题使用 600，正文使用 400；不使用 700 以上粗体。
- 可点击小组件使用 180ms 轻交互，大容器不漂浮。

## 使用边界

直接使用 Chakra UI v3：

- 布局、排版、响应式属性和可访问状态。
- 基础交互语义与键盘行为。
- semantic token、Recipe 与 color mode 条件。

通过项目 Recipe 定制：

- 工作台按钮 `primary / secondary / outline / danger`。
- 工作台输入控件的密度、边界、焦点和错误状态。
- 品牌色、状态色、圆角与交互动效。

产品专用组件：

- AppShell、TopBar、ChatMessage、ChatComposer、Proposal。
- MatrixCell、MatrixHeader、Scrollbar、Splitter。
- 产品组件只负责展示和交互契约，不持有 Journey Map 领域规则。

## 当前迁移范围

- 已更新主题 Token、基础 Recipe、组件规范文档和 `/components` 示例。
- Journey Map 页面会继承新的全局语义 Token。
- 本轮不重排 Journey Map 信息架构，不修改 AI 协议、持久化、计费或领域规则。
- 业务页面的细节视觉迁移应按区域单独验收，避免一次性覆盖现有交互。
