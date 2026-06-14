# 用户旅程图工具规格

更新日期：2026-06-08

## 目标

用户旅程图 Journey Map 用于帮助用户理解一个服务体验在不同阶段中的用户行为、触点、痛点、情绪和机会点。

它适合作为第一个优先实现的工具，因为很多服务设计流程都可以从用户旅程图开始。

## 核心使用场景

1. 分析一个已有服务体验。
2. 识别用户痛点和体验摩擦。
3. 发现服务优化机会。
4. 为服务蓝图、用户故事和评估矩阵提供输入。
5. 将用户旅程图导出到文档、工作坊材料和设计工具中。

## 输入信息

- 服务或产品名称
- 场景描述
- 目标用户
- 用户目标
- 可选的阶段数量

## 输出结构

```ts
type JourneyMap = {
  title: string
  scenario: string
  persona: string
  goal: string
  stages: JourneyStage[]
  rows: JourneyRow[]
}
```

当前正式实现不是“每个阶段一组固定字段”的扁平结构，而是“阶段 + 行 + cell”的矩阵模型，支持：

- 文字行
- 图片行
- 情绪行

这也是 Journey 之所以能支持插入自定义维度、拖拽情绪、图片 URL 和更稳定导出的原因。

## 用户界面

当前正式页面应包含：

1. 场景输入面板
2. 项目选择
2. 生成初稿按钮
3. 可编辑的用户旅程图表格
4. 阶段添加/删除控件
5. 保存与恢复
6. 导出控件
7. AI 对话面板

## 导出格式

必须支持：

- Markdown
- JSON
- CSV
- SVG
- Print/PDF

## AI 行为

当前已实现的 AI 行为：

1. 接收 `serviceName`、当前完整 Journey、消息历史与可选截图。
2. `clarify` 只提出问题。
3. `proposal` 只生成候选提案与摘要。
4. 用户点击“确认更新”后才真正写回 Journey。
5. “继续调整”只回填输入框，不修改左侧数据。

后续还应继续增强：

1. 分析用户输入的场景。
2. 建议合理的旅程阶段。
3. 生成贴近真实服务体验的用户行为和触点。
4. 识别可能出现的痛点。
5. 提出可行动的机会点。
6. 推荐下一步可以使用的工具。

当前仍然保留确定性的初稿生成逻辑，因此即使 AI 服务不可用，Journey 工具也可以独立运行。

## 当前持久化与审计

Journey 当前已经接入：

- `tool_documents`
- `tool_document_revisions`
- `tool_usage_events`

正式运行上下文依赖：

- `projectId`
- `documentId`
- `revision`

因此后续接第二个工具时，应继续沿用相同的文档信封和 revision 规则。

## 下游工具

用户旅程图的输出可以作为以下工具的输入：

- 服务蓝图 Service Blueprint
- 用户故事 User Stories
- 评估矩阵 Evaluation Matrix
- 体验原则 Experience Principles
- 机会地图 Opportunity Map
