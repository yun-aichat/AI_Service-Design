# Journey 编排技术方案

更新日期：2026-06-23

## 1. 目标

这份文档用于把已经确认的产品逻辑翻译成正式技术方案。

当前要解决的不是“Journey 是什么产品”，而是：

- Journey 正式生成时前后端交换什么对象
- 哪些对象是外部接口契约
- 哪些对象只是服务端中间态
- 模型调用如何拆分
- 中间结果如何校验
- 哪些结果需要持久化，哪些不需要

这份方案默认服务端继续沿用当前项目的正式文档信封、revision 和 usage event 机制。

## 2. 技术结论先行

当前阶段不建议先引入复杂 agent framework。

推荐方案是：

1. 应用层编排服务负责 Journey 生成流程
2. 模型调用拆成三段
3. 每段输出都要求结构化结果
4. 服务端负责校验、纠偏、汇总和持久化
5. 前端只消费正式请求对象和最终交付对象

一句话说，当前更像“稳定工作流编排”，而不是“开放式 agent 自主运行”。

## 2.5 当前仓库约束

技术方案必须服从当前仓库事实，而不是按理想状态重写一遍。

当前已确认的约束包括：

- 前端主代码在 `src/*`，使用 TypeScript
- 服务端主代码在 `server/*`，当前以 `.cjs` 为主
- API 入口当前采用 `api/*.js -> server/*.cjs` 转发模式
- 现有 assistant 协议已经采用手写 normalize / parse 方式做运行时校验
- 当前依赖里没有现成运行时 schema 库
- 文档持久化、revision、usage event 已经接入 `tool-documents` 主链

这意味着当前 MVP 最稳的策略不是先引入一套新框架，而是：

- 沿用现有 `protocol.cjs + service.cjs + api/*.js` 风格
- 运行时校验先用手写 normalizer
- 等 Journey 编排跑稳后，再评估是否引入统一 schema 工具

## 2.6 当前建议不新增的基础设施

MVP 阶段先不建议引入：

- `pi agent` 或复杂 agent framework
- 新的后端框架迁移
- 新的运行时 schema 依赖，只为这一条链路单独接入
- 独立任务队列或消息总线
- 单独微服务

原因不是这些东西永远不需要，而是当前问题还没有复杂到需要它们。

## 2.7 现有链路的承接关系

Journey 编排不应另起一套平行平台，而应直接承接现有 3 条链路：

1. `assistant` 链路
   - 已有聊天面板、消息协议、模型 provider、积分预占与 usage record
2. `tool-documents` 链路
   - 已有文档读取、保存、revision、usage event
3. `billing` 链路
   - 已有正式积分扣减、释放和配置读取能力

新的 Journey 正式生成能力，应该复用这些链路，而不是重做：

- 输入澄清继续由现有 assistant 面板承接
- 正式生成请求进入新的 Journey generation API
- 最终结果继续写回正式 tool document
- 扣费继续沿用 billing settlement 主链

## 3. 对象分层

当前建议把 Journey 相关对象分成三层：

1. 前后端共享契约
2. 服务端运行时对象
3. 持久化对象

### 3.1 前后端共享契约

这层对象应保持稳定，直接影响接口和前端页面联动。

- `JourneyGenerationRequest`
- `JourneySynthesisResult`

### 3.2 服务端运行时对象

这层对象主要用于服务编排和模型调用，不一定需要完整暴露给前端。

- `JourneySkeleton`
- `PersonaRunResult`
- `JourneyModelTask`
- `JourneyValidationIssue`

### 3.3 持久化对象

这层对象要考虑 revision、编辑和导出，而不必与模型中间态一一对应。

- `JourneyDocument`
- `JourneyRevisionPayload`
- `JourneyUsageRecord`

## 4. 正式对象协议

### 4.1 JourneyGenerationRequest

这是前端向服务端提交的一次正式生成请求。

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

字段说明：

- `projectId`：正式运行上下文
- `source`：记录本次请求来自聊天确认还是结构化确认
- `scenario`：本次服务场景说明
- `coreTask`：用户当前要完成的核心任务
- `scope`：本次分析范围或体验片段
- `extraNotes`：补充约束或额外说明
- `personaIds`：本次选用的 Persona 列表

校验规则：

- `scenario`、`coreTask`、`scope` 不能为空
- `personaIds` 至少包含 1 个 Persona
- `personaIds` 不能重复
- `extraNotes` 可选，但要做长度限制

### 4.2 JourneySkeleton

这是服务端根据生成条件产出的默认流程骨架。

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

职责边界：

- 定义 Journey 的流程骨架
- 不负责表达某个 Persona 的具体体验
- 作为后续所有 Persona run 的统一轨道

校验规则：

- `stages` 至少 1 个
- 每个 `stage` 至少 1 个 `step`
- `title` 不能为空
- `id` 必须稳定且唯一
- `touchpoints` 可以为空数组，但字段要存在

### 4.3 PersonaRunResult

这是单个 Persona 沿同一份骨架完成推演后的结构化结果。

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

职责边界：

- 只表达“这个 Persona 怎么经历这份流程”
- 不改写流程骨架
- 不直接输出最终汇总结论

校验规则：

- `stageResults` 必须和 `JourneySkeleton.stages` 对齐
- `stepResults` 必须和对应 `stage.steps` 对齐
- 每个 `stepId` 都必须存在于骨架中
- 各数组允许为空，但字段必须存在

### 4.4 JourneySynthesisResult

这是服务端汇总多份 Persona run 后返回给前端的正式主结果。

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
  contrastingPersonaIds?: string[]
}

type JourneyAnalysis = {
  opportunities: string[]
  differences: string[]
}
```

职责边界：

- `skeleton` 负责默认流程层
- `mergedRows` 负责 Persona 推演汇总层
- `analysis` 负责汇总分析层

校验规则：

- 每个 row 集合都要覆盖骨架中的全部 `stepId`
- `supportingPersonaIds` 不能为空
- `contrastingPersonaIds` 只在确有差异时返回
- `opportunities`、`differences` 允许为空数组，但字段必须存在

## 4.4.1 Persona 正式输入对象

Journey generation 不应直接读取原始 Persona 文档全文，而应先收口成正式输入对象：

```ts
type ResolvedPersonaInput = {
  personaId: string
  name: string
  traits: Record<string, unknown>
  needs: string[]
  preferences: string[]
  avoidances: string[]
  behaviorSummaries: string[]
  contextSummaries: string[]
}
```

服务端建议先做一个明确步骤：

```ts
getPersonaInputs(personaIds: string[]): Promise<ResolvedPersonaInput[]>
```

职责：

- 从正式 Persona 资产读取稳定层数据
- 过滤掉原始证据和无关字段
- 保证 Journey generation 后续只消费稳定输入

## 4.5 契约真源策略

当前仓库下，前端是 TypeScript，服务端是 `.cjs`，两边不能像单一 TS 工程那样天然共享同一个类型真源。

因此当前建议分两层处理：

1. 文档真源
   - 以本技术方案文档中的对象协议作为当前阶段的正式真源
2. 实现真源
   - 前端保留 TypeScript 类型
   - 服务端保留 `.cjs` normalizer / parser
   - 两边字段命名必须严格一致

MVP 阶段不建议为了“类型共享”而先发起一次服务端语言迁移。

更稳的方式是：

- 前端维护编译期类型
- 服务端维护运行时校验
- 用测试保证两边一致

## 5. 接口边界

当前建议先固定一个正式生成接口，不急着提前拆太多外部 API。

### 5.1 正式生成接口

当前仓库更适合采用与现有 `journey-chat.js` 一致的入口方式：

- `api/journey-generate.js`
- `server/journey-generate.cjs`

对应 HTTP 入口建议为：

```ts
POST /api/journey-generate
```

请求体：

- `JourneyGenerationRequest`

响应体：

- `JourneySynthesisResult`

服务端内部流程：

1. 调用 `getPersonaInputs(personaIds)` 读取 Persona 稳定输入
2. 生成 `JourneySkeleton`
3. 对每个 Persona 执行 `PersonaRunResult`
4. 汇总为 `JourneySynthesisResult`
5. 写入文档与 revision
6. 记录 usage event

### 5.2 与现有 tool-documents API 的关系

当前不建议把正式生成动作塞进 `tool-documents` 的 `action` 分发里。

原因：

- `tool-documents` 当前职责是文档读写与 revision
- Journey 正式生成属于模型编排和计费动作
- 把两类职责强塞进同一个 `action` switch 会让边界变脏

更合理的边界是：

- `tool-documents` 继续负责读写正式文档
- `journey-generate` 负责编排、计费、汇总、落库
- `journey-generate` 内部再调用 `toolDocumentService`

### 5.3 非正式中间态接口

MVP 阶段不建议把以下对象独立暴露成公共接口：

- `JourneySkeleton`
- `PersonaRunResult`

原因：

- 它们主要是服务端中间态
- 太早暴露会锁死后续内部编排
- 当前前端真正关心的是最终可编辑结果，不是中间 run 细节

如果后续要支持“先看骨架再确认重新跑”，再单独增加骨架预览接口更合适。

## 5.4 鉴权与计费入口策略

当前建议沿用现有 `journey-chat.cjs` 的处理方式：

- API 层读取请求体
- 服务端通过 CloudBase access token 鉴权
- 匿名是否允许继续受现有环境变量策略控制
- 进入正式编排前先做计费预占
- 成功完成后再提交扣减
- 失败则释放预占

Journey 正式生成不应绕过当前 billing settlement 主链。

## 6. 服务端编排

推荐把 Journey 生成编排拆成三个明确方法：

```ts
generateSkeleton(request)
runPersonaOnSkeleton(persona, skeleton)
synthesizeJourney(skeleton, runResults)
```

### 6.1 generateSkeleton(request)

输入：

- `JourneyGenerationRequest`

输出：

- `JourneySkeleton`

职责：

- 根据场景、核心任务和范围生成默认流程层
- 不掺入具体 Persona 体验差异

### 6.2 runPersonaOnSkeleton(persona, skeleton)

输入：

- 正式 Persona 资产
- `JourneySkeleton`

输出：

- `PersonaRunResult`

职责：

- 让单个 Persona 沿既定骨架完成体验推演
- 产出 thoughts / feelings / behaviors / painPoints / itchPoints / delightPoints

### 6.3 synthesizeJourney(skeleton, runResults)

输入：

- `JourneySkeleton`
- `PersonaRunResult[]`

输出：

- `JourneySynthesisResult`

职责：

- 按 step 汇总多 Persona 结果
- 保留共性与差异
- 产出机会点与差异分析

## 6.4 建议的服务端模块划分

基于当前目录结构，建议新增以下服务端模块：

- `server/application/journey-generation/protocol.cjs`
  - 生成请求、骨架、run result、汇总结果的运行时校验
- `server/application/journey-generation/service.cjs`
  - 顶层正式生成编排
- `server/application/journey-generation/skeleton-generator.cjs`
  - 第一段骨架生成
- `server/application/journey-generation/persona-runner.cjs`
  - 第二段单 Persona 推演
- `server/application/journey-generation/synthesizer.cjs`
  - 第三段汇总
- `server/application/journey-generation/usage-recorder.cjs`
  - Journey 正式生成的 usage event 记录

入口层建议新增：

- `server/journey-generate.cjs`
- `api/journey-generate.js`

这条链路的风格应尽量和现有：

- `server/application/assistant/*`
- `server/journey-chat.cjs`
- `server/tool-documents.cjs`

保持一致。

## 7. 模型调用策略

当前建议一共三段模型调用，不建议一口气让单次调用完成所有事情。

### 7.1 第一段：骨架生成

每一段模型调用都应明确记录当前使用的 `providerKey / modelKey`，供后台查看与前端展示。

输入：

- `JourneyGenerationRequest`

输出：

- `JourneySkeleton`

要求：

- 强结构化输出
- 不讨论 Persona 差异
- 只产流程骨架

### 7.2 第二段：单 Persona 推演

输入：

- Persona 稳定资产
- `JourneySkeleton`

输出：

- `PersonaRunResult`

要求：

- 强结构化输出
- 所有结果都必须挂到既有 `stageId/stepId`
- 不允许新增骨架外步骤

### 7.3 第三段：汇总分析

输入：

- `JourneySkeleton`
- `PersonaRunResult[]`

输出：

- `JourneySynthesisResult`

要求：

- 结构化输出
- 保留差异，不要强行平均化
- 分析层不能脱离 run 结果乱生故事

## 7.4 模型 provider 策略

当前仓库已有 `server/application/assistant/glm-provider.cjs`，但 Journey 正式生成阶段不能被单一 provider 绑定死。

MVP 阶段建议：

- Journey 正式生成沿用现有 provider 封装风格
- 但把 provider 入口做成可切换
- 后台维护“动作 -> provider / model”映射
- 前端最终结果能显示当前使用的 provider / model

也就是说：

- provider 的调用风格可以复用现有实现
- Journey generation 服务要保留 provider 注入能力
- protocol 和 orchestration 不能写死在某个模型响应格式里
- 当前阶段要支持接入多个 AI API 接口，方便测试和切换

## 8. 校验与兜底

当前阶段不能把模型输出当真源直接写入。

服务端至少要做三层校验：

1. 结构校验
2. 骨架对齐校验
3. 业务边界校验

### 8.1 结构校验

检查对象字段是否齐全、类型是否正确。

推荐做法：

- TypeScript 类型配合运行时 schema 校验
- 失败则触发模型重试或服务端兜底错误

### 8.2 骨架对齐校验

重点检查：

- `stageId` 是否存在
- `stepId` 是否存在
- 是否缺步骤
- 是否多步骤

如果 run 结果和骨架不对齐，不能直接进入汇总。

### 8.3 业务边界校验

重点检查：

- 是否把 Persona 原始证据带进 Journey 主结果
- 是否在分析层生成与 run 结果明显无关的结论
- 是否把多 Persona 差异粗暴抹平

## 8.4 重试策略

当前建议只在服务端内部做有限重试，不把重试权交给前端。

推荐策略：

- 骨架生成失败：最多重试 1 次
- 单 Persona run 结构不合法：单 Persona 最多重试 1 次
- 汇总结果不合法：最多重试 1 次
- 若仍失败：整次正式生成失败，释放预占并返回可理解错误

不要做的事：

- 无限重试
- 前端自己重复发起整次扣费请求
- 失败后先保存半成品正式文档

## 8.5 可观测性与审计

Journey 正式生成链路至少应记录：

- `projectId`
- `documentId`
- `personaIds`
- 使用的 `providerKey / modelKey`
- 每段调用是否成功
- 失败发生在哪一段
- 本次 run 触发了哪些动作
- 每个动作扣了多少积分
- 预占积分与最终扣减积分
- 最终写入的 revision

这里的目标不是日志堆积，而是以后能回答：

- 这次为什么扣费了
- 这次到底触发了哪些收费动作
- 这次为什么失败了
- 这次 Journey 是由哪些 Persona 跑出来的
- 这次用了哪个模型

## 9. 持久化边界

不是所有对象都要长期保存。

### 9.1 应持久化

- `JourneyGenerationRequest` 的关键快照
- 最终 `JourneySynthesisResult`
- 可编辑后的正式 Journey 文档结构
- usage event 和扣费记录
- run 级动作明细与使用模型标识

### 9.2 可选持久化

- `JourneySkeleton`
- `PersonaRunResult[]`

建议：

- MVP 阶段可以先作为 revision meta 或调试信息保留
- 但不必先把它们做成正式公开文档结构

### 9.3 不建议直接持久化为正式用户资产

- 模型原始 prompt
- 未校验的模型输出
- 原始 Persona 证据拼接文本

## 9.4 与现有文档结构的关系

最终正式文档不必直接保存 `JourneySynthesisResult` 原样。

更合理的方式是：

- `JourneySynthesisResult` 作为服务端汇总结果
- 再由应用层把它映射进当前 Journey 矩阵文档结构
- 正式文档继续走现有 `tool_documents` / `tool_document_revisions` 主链

这样可以避免：

- 直接推翻当前 Journey 编辑器的数据结构
- 把模型中间态误当正式用户文档真源

如果后续要保留 `JourneySkeleton` 或 `PersonaRunResult[]`，更适合放进 revision meta 或调试快照，而不是主 content。

## 9.5 管理员后台最小读取口径

### 9.5.1 推荐后台接口对象

管理员后台读取这张表时，建议服务端返回统一记录结构：

```ts
type JourneyRunAuditRecord = {
  createdAt: string
  actionKey: string
  chargedCredits: number
  modelKey: string
  providerKey: string
  endpoint: string | null
  conversationId: string | null
  referenceId: string
  userId: string | null
  projectId: string | null
  documentId: string | null
  status: 'started' | 'succeeded' | 'failed' | 'cancelled'
}
```

查询参数建议固定为：

```ts
type JourneyRunAuditQuery = {
  limit?: number
  offset?: number
  sortBy?: 'createdAt'
  sortDirection?: 'desc' | 'asc'
  actionKey?: string
  providerKey?: string
  modelKey?: string
  status?: 'started' | 'succeeded' | 'failed' | 'cancelled'
  userId?: string
  projectId?: string
  documentId?: string
  referenceId?: string
}
```

默认排序：

- `sortBy = 'createdAt'`
- `sortDirection = 'desc'`

这意味着后台页面第一版只要做：

- 时间列
- 动作列
- 积分列
- 模型列
- API 信息列
- 对话 ID 列
- 状态列

就可以稳定落地。

管理员后台当前最小需要看见的不是精细 token 成本，而是 run 明细。

至少应能看到：

- 时间 `createdAt`
- 动作 `actionKey`
- 消耗积分 `chargedCredits`
- 模型 `modelKey`
- API 信息 `providerKey / endpoint`
- Run ID `referenceId`
- 对话 ID `conversationId`
- 用户、项目、文档
- 最终成功还是失败

列表默认排序规则：

- 按时间从近到远排序
- 即 `createdAt desc`

这部分是当前 MVP 的主要后台审计价值。

## 10. 前端消费建议

前端当前更适合消费最终结构，而不是直接消费全部中间态。

推荐方式：

- 生成前：前端维护 `JourneyGenerationRequest` 草稿
- 生成后：前端读取 `JourneySynthesisResult`
- 渲染时：把 `skeleton + mergedRows + analysis` 映射到现有矩阵视图

这样做的原因：

- 中间态变化不会频繁冲击前端
- 更容易保持当前 Journey 编辑器的稳定性
- 未来仍可逐步开放骨架编辑能力

## 11. 与当前代码结构的映射建议

结合当前仓库结构，前端建议优先放在：

- `src/features/assistant/*`
  - 承接聊天确认与生成触发
- `src/tools/journey-map/*`
  - 承接最终结果渲染与编辑
- `src/features/assistant/protocol.ts`
  - 后续可补 Journey 正式生成请求相关前端类型，或拆到新的 `types.ts`

服务端建议优先放在：

- `server/application/journey-generation/*`
  - 新的 Journey 编排服务
- `server/journey-generate.cjs`
  - Node 入口
- `api/journey-generate.js`
  - API 转发入口

这里不建议直接把 Journey 正式生成逻辑塞进：

- `server/application/assistant/service.cjs`
  - 它当前更适合承接澄清 / proposal 风格的对话助手
- `server/tool-documents.cjs`
  - 它当前更适合承接文档读写与 revision 操作

更合理的关系是：

- assistant 负责澄清与确认前交互
- journey-generation 负责正式生成
- tool-documents 负责正式保存

## 11.5 测试策略

基于当前仓库已有 `.test.cjs` 风格，Journey 正式生成建议至少补 4 类测试：

1. `protocol.cjs` 单元测试
   - 校验请求、骨架、run result、汇总结果的 normalize 行为
2. `service.cjs` 编排测试
   - 验证三段调用顺序、失败释放预占、成功记录 usage
3. `journey-generate.cjs` 接口测试
   - 验证鉴权、请求解析、错误响应
4. 汇总映射测试
   - 验证 `JourneySynthesisResult` 到正式 Journey 文档结构的映射

MVP 阶段先把协议和编排测稳，比先追求端到端浏览器测试更重要。

## 12. 当前不建议做的事

- 先上 `pi agent` 或复杂 agent framework
- 让前端直接依赖 `PersonaRunResult` 全量结构
- 一次模型调用完成骨架、推演、汇总全部步骤
- 把原始 Persona 证据直接塞进 Journey 主输出
- 在没有运行时校验的情况下直接信任模型 JSON

## 13. 下一步实施顺序

推荐顺序：

1. 把 4 个正式对象写成 TypeScript 协议
2. 给 4 个对象补运行时 schema 校验
3. 搭正式生成接口
4. 实现三段式 orchestration service
5. 把最终结果映射到当前 Journey 矩阵文档结构
6. 再补 usage event、revision meta 和重试策略

一句话总结：

> 当前 Journey 的技术方案核心，不是先选框架，而是先把“生成条件 -> 流程骨架 -> 单 Persona run -> 汇总结果”做成可校验、可持久化、可前后端共享的正式数据契约。
