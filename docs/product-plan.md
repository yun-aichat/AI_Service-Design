# AI 服务设计工具箱产品计划

更新日期：2026-06-08

## 产品定位

构建一个由 AI 辅助的服务设计与思维工具网站。

这个产品不只是模板库。核心工作流是：

1. 用户描述业务场景、问题、目标或服务背景。
2. AI 分析当前设计挑战。
3. AI 推荐合适的工具或工具链。
4. 用户打开对应的交互式工具，生成结构化内容，继续编辑并导出。
5. 后续版本中，多个工具产物可以被聚合到同一个项目中。

第一阶段重点是让每个工具都能独立作为网页工具使用，并具备正式的项目、文档、AI 与导出链路。

## 产品原则

- 每个工具必须可以独立使用。
- 每个工具的输出应该是结构化数据，而不是只保存静态文本或图片。
- AI 应该参与工具选择、内容生成和内容优化。
- 导出结果要方便用于 PPT、Figma、FigJam、白板和文档工作流。
- 第一阶段不需要直接集成设计软件，先做好通用导出格式。

## MVP 工具集

第一批工具需要覆盖基础服务设计闭环：

1. 用户旅程图 Journey Map
2. 服务蓝图 Service Blueprint
3. 人物画像 Personas
4. 利益相关者地图 Stakeholder Map
5. 评估矩阵 Evaluation Matrix

建议实现顺序：

1. 用户旅程图 Journey Map
2. 人物画像 Personas
3. 利益相关者地图 Stakeholder Map
4. 服务蓝图 Service Blueprint
5. 评估矩阵 Evaluation Matrix

## 当前里程碑状态

当前已经完成到这里：

1. 用户旅程图成为第一个正式工具。
2. Journey 具备保存、恢复、revision 和导出。
3. AI 修改流程已经固定为“澄清 -> 提案 -> 用户确认 -> 应用”。
4. 账号页、CloudBase 文档 API、usage event 与 billing 契约已进入代码库。

下一个产品里程碑是把 Journey 做成“可登录、可保存、可记账、可追溯”的完整业务闭环：

1. 输入服务场景。
2. 生成用户旅程图初稿。
3. 编辑阶段、用户行为、触点、痛点、情绪和机会点。
4. 正式保存到项目与文档体系。
5. 导出 Markdown、JSON、CSV、SVG，并支持打印/PDF。
6. 接入后续按积分计费能力。

## 后续项目工作流

项目分组能力已经作为正式方向成立，Journey 也已开始使用 `projectId` 作为运行上下文。后续继续扩展：

1. 创建项目。
2. 将多个工具产物加入项目。
3. 在工具之间共享上下文。
4. 基于已有工具产物生成下游内容。
5. 导出项目级报告。

示例链路：

用户旅程图 Journey Map -> 服务蓝图 Service Blueprint -> 用户故事 User Stories -> 评估矩阵 Evaluation Matrix

## 工具元数据模型

每个工具都应该有一个注册信息：

```ts
type ToolMetadata = {
  id: string
  name: string
  description: string
  stages: string[]
  audiences: string[]
  representations: string[]
  inputs: string[]
  outputs: string[]
  upstreamTools: string[]
  downstreamTools: string[]
}
```

这个模型可以让 AI 根据用户意图推荐合适的工具链。

当前状态：

- 工具注册表已经存在于 `src/tools/registry.ts`
- `journey-map` 已成为第一条正式注册项
- 第二个工具应继续沿用同一套 `ToolDefinition` 契约

## 导出策略

早期必须支持的导出格式：

- Markdown：用于文档沉淀和 AI 复用。
- JSON：用于结构化保存和后续项目关联。
- CSV：用于表格、运营和分析工作流。
- SVG：用于 Figma、FigJam、Miro、PPT 和视觉编辑。
- 打印/PDF：用于快速展示和分享。

后续可增加的导出格式：

- PPTX
- Mermaid
- 面向 FigJam/Figma 的结构化 SVG
- 项目报告打包导出

## 近期优先级

接下来按这个顺序推进：

1. 收口支付编排与积分体系
2. 完成 Journey 的正式业务闭环
3. 接入第二个工具
4. 增加全局服务设计助手与工具推荐
