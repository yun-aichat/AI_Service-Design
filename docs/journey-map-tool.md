# 用户旅程图工具规格

更新日期：2026-06-22

## 0. 文档关系

这份文档负责 Journey 的产品结构、生成入口和工作台边界。

如果要继续看技术实现，请配合阅读：

- [journey-orchestration-technical-design.md](./journey-orchestration-technical-design.md)
  - 负责正式生成请求、骨架生成、单 Persona run、汇总编排、接口与持久化策略

## 1. 当前定位

Journey 不再只是一个单点出图工具，而是当前产品的第一个收费工作台。

它的职责是：

> 基于已沉淀的 Persona 资产和当前服务场景，生成一份可编辑的 Journey 初稿，并解释关键落差、差异和机会点。

因此，当前 Journey 的产品定义应建立在 `Persona -> Journey` 连续工作流上，而不是脱离 Persona 单独定义。

## 2. 核心使用场景

1. 用户已经有 Persona 资产，希望快速验证某个服务场景会发生什么。
2. 用户只用一句话描述服务设想，希望系统自动收口成可生成的 Journey 条件。
3. 用户希望比较多个 Persona 在同一流程中的体验差异。
4. 用户希望快速拿到一版可继续编辑、汇报和导出的 Journey 初稿。
5. 用户希望从结果中直接看到机会点和关键落差，而不是自己从零整理。

## 3. 输入结构

Journey 当前的最小生成条件不是“随便聊一句就直接出图”，而是以下两类输入被确认：

- Persona
- 明确场景

在入口阶段，系统还会进一步收口以下结构化信息：

- 使用的 Persona
- 所在场景
- 核心任务
- 分析范围或体验片段
- 其他补充

这里需要明确区分两个层级：

- 生成条件层：场景、核心任务、范围、补充说明、选用 Persona
- 默认流程层：阶段、步骤、触点组成的流程骨架

前者是本次推演的输入条件，后者是系统基于输入条件生成的 Journey 骨架。两者不应混成同一个概念。

建议把本次正式生成请求固定为：

```ts
type JourneyGenerationRequest = {
  projectId: string
  source: 'chat_confirm' | 'form_confirm'
  scenario: string
  coreTask: string
  scope: string
  extraNotes?: string
  personaIds: string[]
}
```

其中真正的稳定上游资产来自 Persona，当前建议直接读取：

- 基础信息层
- 已确认 traits
- 需求 / 偏好 / 雷点
- 已纳入的行为洞察摘要
- 已纳入的场景洞察摘要

默认不直接读取：

- 原始证据
- 用户原声全文
- 右侧池中未纳入的洞察

## 4. 生成入口

Journey 入口应采用“聊天驱动的结构化确认”，而不是纯表单，也不是无限开放式陪聊。

推荐流程如下：

1. 用户用自然语言描述要分析的服务场景
2. AI 提取候选 Persona、场景、核心任务和分析范围
3. 信息不足时，AI 只追问最关键缺口
4. 信息足够后，系统展示确认卡片
5. 用户确认“本次使用的 Persona + 场景 + 补充内容”
6. 系统明确提示会消耗积分
7. 用户点击确认后执行正式推演并完成扣费

澄清阶段不应提前输出看似完整的 Journey 结果，否则收费边界会变糊。

## 5. 执行模型

Journey 的核心执行模型固定为：

> 生成条件确认 -> 默认流程骨架生成 -> 多 Persona 独立推演 -> 单份 Journey 汇总输出

执行规则：

- 用户先确认生成条件层，而不是先手动画完整流程
- 系统先基于生成条件产出默认流程骨架
- 每个 Persona 只沿同一份默认流程骨架独立推演
- Persona 之间不做多 agent 协商
- 系统最终汇总为一份 Journey 成品

建议把默认流程骨架固定为：

```ts
type JourneySkeleton = {
  scenario: string
  coreTask: string
  scope: string
  stages: JourneyStage[]
}

type JourneyStage = {
  id: string
  title: string
  steps: JourneyStep[]
}

type JourneyStep = {
  id: string
  title: string
  touchpoints: string[]
}
```

字数边界按单个 Persona run 计算：

- 软阈值：`3500` 字
- 硬阈值：`5000` 字

当超过阈值时，只压缩行为 / 场景洞察摘要，不压缩基础信息、traits、需求 / 偏好 / 雷点。

## 6. 输出结构

Journey 最终主交付应固定为三层：

1. 默认流程层
2. Persona 推演汇总层
3. 汇总分析层

### 6.1 默认流程层

默认流程层负责定义服务流程本身的骨架，包括：

- 阶段
- 步骤
- 触点

### 6.2 Persona 推演汇总层

这一层承接多个 Persona 独立行走后的合并结果，核心输出包括：

- 用户想法
- 用户感受
- 用户行为
- 痛点
- 痒点
- 爽点

单个 Persona run 的推荐返回结构应先固定，否则后续汇总会失控：

```ts
type PersonaRunResult = {
  personaId: string
  personaName: string
  scenario: string
  coreTask: string
  scope: string
  stageResults: PersonaStageResult[]
  keyFindings: string[]
}

type PersonaStageResult = {
  stageId: string
  stepResults: PersonaStepResult[]
}

type PersonaStepResult = {
  stepId: string
  thoughts: string[]
  feelings: string[]
  behaviors: string[]
  painPoints: string[]
  itchPoints: string[]
  delightPoints: string[]
}
```

汇总器的输入应是同一份 `JourneySkeleton` 加多份 `PersonaRunResult`，输出为：

```ts
type JourneySynthesisResult = {
  skeleton: JourneySkeleton
  mergedRows: JourneyMergedRowSet
  analysis: JourneyAnalysis
}

type JourneyMergedRowSet = {
  thoughts: JourneyRowCell[]
  feelings: JourneyRowCell[]
  behaviors: JourneyRowCell[]
  painPoints: JourneyRowCell[]
  itchPoints: JourneyRowCell[]
  delightPoints: JourneyRowCell[]
}

type JourneyRowCell = {
  stepId: string
  summary: string
  supportingPersonaIds: string[]
  // Optional, but must be non-empty when present.
  contrastingPersonaIds?: string[]
}

type JourneyAnalysis = {
  opportunities: string[]
  differences: string[]
}
```

这里展示的是汇总后的 Journey 主内容，不是把多个 Persona 原样平铺成多张图。

### 6.3 汇总分析层

这一层负责解释前两层结果意味着什么，至少包括：

- 机会点
- 差异分析

如果后续增加风险提示、优先级建议、设计方向，也应挂在这一层。

## 7. 底层数据模型

Journey 当前正式实现仍采用矩阵模型，而不是“每个阶段一组固定字段”的扁平对象。

矩阵模型的价值是：

- 能承接默认流程层
- 能承接 Persona 推演汇总层
- 能继续支持文字行、情绪行、图片行和自定义维度
- 能更稳定地服务导出、编辑和 revision 审计

因此，这份文档定义的是产品输出结构，不要求把所有分析结构原样暴露给最终前端数据对象。

## 8. 技术选型建议

基于当前协议，MVP 阶段不建议先上复杂 agent framework。

更合适的实现方式是：

1. 一个普通的 Journey orchestration service
2. 三段式模型调用
3. 每段都要求结构化输出
4. 用应用侧代码完成汇总、校验和持久化

推荐调用拆分：

1. `generateSkeleton(request)`
2. `runPersonaOnSkeleton(persona, skeleton)`
3. `synthesizeJourney(skeleton, runResults)`

当前这套结构更像稳定工作流编排，不像开放式 agent 系统。除非后面出现以下需求，否则没必要先上 `pi agent` 一类框架：

- 长链多轮记忆
- 中途恢复复杂状态
- 多工具自主调用
- 多 agent 互相协商
- 动态分支决策非常复杂

当前阶段直接用 DeepSeek 模型加应用层 orchestration 就够了。

## 9. AI 行为边界

Journey 入口和 Journey 编辑期的 AI 行为需要分开看。

当前入口阶段的 AI 约束：

1. 默认优先提取结构，而不是继续闲聊。
2. 每次只追问一个最关键缺口。
3. 信息足够后必须主动进入确认卡片。
4. 未确认 Persona 和场景前，不进入正式生成。
5. 确认并生成前，必须明确提示积分消耗。

当前编辑阶段已实现的 AI 行为：

1. 接收 `serviceName`、当前完整 Journey、消息历史与可选截图。
2. `clarify` 只提出问题。
3. `proposal` 只生成候选提案与摘要。
4. 用户点击“确认更新”后才真正写回 Journey。
5. “继续调整”只回填输入框，不修改左侧数据。

MVP 阶段不建议按聊天轮数直接对外收费，正式收费动作仍应绑定到“确认并生成一版新的 Journey 结果”。

## 10. 扣费边界

Journey 当前第一个明确收费点是：

> 基于 Persona + 场景，生成一版新的 Journey 初稿及关键判断。

规则如下：

- 澄清阶段不收费
- 首次完整生成收费
- 手动编辑不收费
- 小幅修改先不直接收费
- 用户确认重新推演后，按新一次生成收费

当小改动累计较多时，系统可以提示用户是否基于最新内容重新推演，但不强制扣费。

## 11. 持久化与审计

Journey 当前已经接入：

- `tool_documents`
- `tool_document_revisions`
- `tool_usage_events`

正式运行上下文依赖：

- `projectId`
- `documentId`
- `revision`

因此后续 Persona、Journey 以及下游工具，都应继续沿用相同的文档信封和 revision 规则。

## 12. 下游工具关系

Journey 仍然是后续服务设计工具的中游结构层，可继续作为以下工具的输入：

- 服务蓝图 Service Blueprint
- 用户故事 User Stories
- 评估矩阵 Evaluation Matrix
- 体验原则 Experience Principles
- 机会地图 Opportunity Map

但在当前阶段，Journey 首先要完成的是：

> 作为 Persona 上游资产的第一个可收费、可编辑、可导出的正式工作台。
