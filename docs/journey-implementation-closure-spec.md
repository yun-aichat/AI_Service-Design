# Persona / Journey 实施闭环总装配方案

更新日期：2026-06-23

## 1. 文档目的

这份文档不替代已有真源文档，而是把当前分散在 Persona、Journey、Billing、Admin 文档中的规则重新装配成一条可直接进入开发的正式链路。

当前需要收口的，是下面 5 个实现闭环：

1. Persona 资产读取闭环
2. Journey generation 正式后端闭环
3. 计费配置与 run audit 后端闭环
4. 管理后台页面闭环
5. 前端正式生成入口闭环

一句话说：

> 这份文档负责把 `Persona 资产 -> Journey 生成 -> Billing / Audit 后端 -> Admin UI -> Front-end 生成入口` 串成一条可以直接实施的主链。

## 2. 与现有真源文档的关系

各子领域真源仍然保持在原文档中：

- Persona 数据真源：`docs/persona-data-protocol.md`
- Journey 编排真源：`docs/journey-orchestration-technical-design.md`
- 计费真源：`docs/flexible-credit-billing.md`
- 阶段与任务边界真源：`docs/journey-delivery-task-breakdown.md`

这份文档只额外负责 3 件事：

1. 把跨文档关系写明
2. 把之前隐含的接口边界显式写明
3. 把“后面开发到底按什么顺序和 contract 去做”写成单条链路

## 3. 总体闭环结论

当前正式链路固定为：

1. 用户在 assistant / Journey 页面完成生成前澄清
2. 前端形成 `JourneyGenerationRequest`
3. 服务端按 `personaIds` 读取 Persona 正式稳定输入
4. 服务端执行 Journey 三段式生成
5. 服务端完成积分预占、提交或释放
6. 服务端把最终 Journey 写入正式文档与 revision
7. 服务端记录 `usage event` 与 `Journey run audit`
8. 管理后台读取动作定价、模型策略与 run audit
9. 用户前台只消费最终 Journey 结果与本次使用模型

这条链路的边界固定为：

- Persona 工具只提供稳定资产，不负责 Journey 编排
- Journey generation 只负责编排，不承担后台页面逻辑
- Billing / Audit 后端只提供动作配置和审计读写
- Admin UI 只消费正式后台 contract，不反向定义领域规则
- Front-end generation entry 只负责澄清、确认、触发和结果承接

## 4. 闭环 A：Persona 资产读取方案

### 4.1 目标

Journey generation 不应直接读取 Persona 全文，更不应把原始证据层直接喂进模型。

Persona 读取闭环的目标是：

- 按 `personaIds` 读取正式 Persona 文档
- 做权限校验
- 把 Persona 正式文档映射成 Journey 可稳定消费的输入对象
- 在证据不足、权限不足、文档损坏时返回明确错误

### 4.2 读取真源

Persona 读取的正式真源固定为：

- `PersonaDocument`

Journey generation 不能从以下来源直接读取 Persona：

- 前端页面临时状态
- assistant 对话历史
- `poolInsights`
- 原始调研导入结果全文

### 4.3 正式服务接口

```ts
type GetPersonaInputsParams = {
  userId: string
  projectId: string
  personaIds: string[]
}

type GetPersonaInputsResult = {
  personas: ResolvedPersonaInput[]
}

type ResolvedPersonaInput = {
  personaId: string
  projectId: string
  segmentName: string
  profileName: string
  oneLineSummary: string
  roleTags: string[]
  baseProfile: {
    age?: number
    occupation?: string
    city?: string
    incomeBand?: string
    familyBackground?: string
    educationBackground?: string
  }
  traits: {
    patienceTolerance: 1 | 2 | 3 | 4 | 5
    riskTolerance: 1 | 2 | 3 | 4 | 5
    autonomy: 1 | 2 | 3 | 4 | 5
    trustTendency: 1 | 2 | 3 | 4 | 5
  }
  needs: string[]
  preferences: string[]
  avoidances: string[]
  behaviorSummaries: string[]
  contextSummaries: string[]
  sourceMeta: {
    behaviorInsightCount: number
    contextInsightCount: number
    evidenceCount: number
    updatedAt: string
  }
}
```

### 4.4 字段映射规则

- `segmentName` <- `PersonaDocument.skeleton.segmentName`
- `profileName` <- `PersonaDocument.profile.name`
- `oneLineSummary` <- `PersonaDocument.skeleton.summary`
- `roleTags` <- `PersonaDocument.profile.roleTags`
- `baseProfile` <- `PersonaDocument.profile` 中除 `name / roleTags / avatarUrl` 外的稳定字段
- `traits` <- `PersonaDocument.traits`
- `needs / preferences / avoidances` <- `PersonaDocument.summaryItems` 中对应类别
- `behaviorSummaries` <- `behaviorInsights` 中 `placement = in_persona` 的 `summary`
- `contextSummaries` <- `contextInsights` 中 `placement = in_persona` 的 `summary`
- `sourceMeta.*` <- Persona 当前纳入的洞察与证据计数

明确不进入 `ResolvedPersonaInput` 的内容：

- 原始 `quote`
- `EvidenceItem` 全文
- `poolInsights`
- `confidence / fit / placement` 这类只服务 Persona 编排过程的字段
- 中间标签推理过程

### 4.5 读取流程

1. 校验 `personaIds` 非空且无重复
2. 根据 `projectId + personaIds` 读取 Persona 正式文档
3. 校验请求用户是否拥有对应项目访问权限
4. 校验 Persona 文档结构完整性
5. 映射出 `ResolvedPersonaInput`
6. 对结果做字数与字段完整度检查
7. 返回给 Journey generation

### 4.6 权限与错误码

权限规则固定如下：

- 普通用户只能读取自己有权访问的项目下 Persona
- 不允许跨项目拿 Persona
- 不允许只传 `personaId` 而省略 `projectId`

推荐错误码：

```ts
type PersonaReadErrorCode =
  | 'PERSONA_IDS_EMPTY'
  | 'PERSONA_DUPLICATED_IDS'
  | 'PERSONA_NOT_FOUND'
  | 'PERSONA_PROJECT_MISMATCH'
  | 'PERSONA_ACCESS_DENIED'
  | 'PERSONA_DOCUMENT_INVALID'
  | 'PERSONA_INPUT_TOO_LARGE'
```

### 4.7 输入长度规则

按单个 Persona run 计算：

- 软阈值：`3500` 字
- 硬阈值：`5000` 字

处理方式固定为：

- `<= 3500`：完整直喂
- `3500 - 5000`：先压缩 `behaviorSummaries / contextSummaries`
- `> 5000`：返回 `PERSONA_INPUT_TOO_LARGE`

## 5. 闭环 B：Journey generation 正式后端方案

### 5.1 目标

Journey generation 后端必须把现有技术方案变成正式编排主链：

- 接收一次正式生成请求
- 读取 Persona 正式输入
- 完成三段式生成
- 处理计费预占、提交、释放
- 把最终结果写入正式 Journey 文档
- 记录 usage event 与 run audit

### 5.2 正式 API

- `POST /api/journey-generate`

请求体：

- `JourneyGenerationRequest`

响应体：

```ts
type JourneyGenerationResponse = {
  runId: string
  documentId: string
  revision: number
  result: JourneySynthesisResult
  billing: {
    chargedCredits: number
    actionBreakdown: {
      actionKey: string
      credits: number
    }[]
  }
  modelSummary: {
    providerKey: string
    modelKey: string
  }[]
}
```

### 5.3 编排时序

正式编排时序固定如下：

1. 创建 `runId`
2. 校验 `JourneyGenerationRequest`
3. 读取 Persona 稳定输入
4. 检查动作定价与模型策略可用性
5. 预占本次 run 所需积分
6. 调用 `generateSkeleton`
7. 对每个 Persona 执行 `persona_run`
8. 调用 `journey_synthesis`
9. 校验 `JourneySynthesisResult`
10. 映射为正式 Journey 文档内容
11. 保存文档与 revision
12. 提交积分扣减
13. 记录 `usage event`
14. 记录 `Journey run audit`
15. 返回前端结果

JourneySynthesisResult 校验至少包含：

- 每个 row 集合都要覆盖骨架中的全部 `stepId`
- `supportingPersonaIds` 必须为非空数组
- `contrastingPersonaIds` 只在确有差异时返回，且一旦返回必须为非空数组
- `analysis.opportunities` 与 `analysis.differences` 允许为空数组，但字段必须存在

### 5.4 动作层与计费关系

Journey generation 的动作层正式固定为：

- `skeleton_generate`
- `persona_run`
- `journey_synthesis`
- `journey_regenerate`

首次生成按前三个动作累加。

如果是对既有 Journey 的正式再推演，额外记录 `journey_regenerate`。

### 5.5 失败处理规则

失败路径固定区分为：

- 请求非法
- Persona 输入不可用
- 动作配置不可用
- 模型策略不可用
- 模型调用失败
- 模型返回结构非法
- 正式落库失败

处理原则：

- 请求非法：不预占
- 预占后模型失败：释放预占
- 文档写入失败：释放未提交预占，并记录失败 audit
- 不允许出现“扣了积分但无正式结果且无失败记录”

推荐错误码：

```ts
type JourneyGenerateErrorCode =
  | 'JOURNEY_REQUEST_INVALID'
  | 'JOURNEY_ACCESS_DENIED'
  | 'JOURNEY_PERSONA_UNAVAILABLE'
  | 'JOURNEY_BILLING_ACTION_UNAVAILABLE'
  | 'JOURNEY_MODEL_POLICY_UNAVAILABLE'
  | 'JOURNEY_MODEL_CALL_FAILED'
  | 'JOURNEY_MODEL_OUTPUT_INVALID'
  | 'JOURNEY_DOCUMENT_SAVE_FAILED'
```

### 5.6 usage event 与 run audit 分工

- `usage event`：偏账务和用量
- `Journey run audit`：偏业务审计

`Journey run audit` 最小字段固定包括：

- `runId`
- `userId`
- `projectId`
- `documentId`
- `actionKey`
- `chargedCredits`
- `providerKey`
- `modelKey`
- `endpoint`
- `conversationId`
- `referenceId`
- `status`
- `createdAt`

## 6. 闭环 C：计费配置与 run audit 后端方案

### 6.1 目标

这一层的目标，是把已经确定的动作层定价、模型策略和 run audit 读写变成正式后台接口。

### 6.2 后台正式对象

后台读写对象固定为：

1. `AiActionPricing`
2. `AiModelPolicy`
3. `JourneyRunAuditRecord`

### 6.3 正式接口范围

MVP 阶段后台接口只做以下 5 类：

- `GET /api/admin/billing/action-pricing`
- `POST /api/admin/billing/action-pricing/update`
- `GET /api/admin/billing/model-policies`
- `POST /api/admin/billing/model-policies/update`
- `GET /api/admin/journey-run-audit`

### 6.4 管理权限规则

这些接口统一要求：

- 用户已登录
- 用户具备 `admin` 或 `billing-admin` 权限
- 服务端鉴权为最终真源

### 6.5 写入规则

动作积分修改命令固定为：

```ts
type UpdateActionPricingCommand = {
  toolKey: string
  actionKey: string
  creditCost: number
  enabled: boolean
  expectedVersion: number
}
```

模型策略修改命令固定为：

```ts
type UpdateModelPolicyCommand = {
  toolKey: string
  actionKey: string
  providerKey: string
  modelKey: string
  endpoint?: string | null
  apiKeyRef: string
  temperature: number
  maxInputTokens: number
  maxOutputTokens: number
  timeoutMs: number
  enabled: boolean
  expectedVersion: number
}
```

固定规则：

- 不允许负积分
- 使用 `expectedVersion` 做并发保护
- `apiKeyRef` 只能引用服务端已有密钥标识
- 后台不直接保存原始密钥

### 6.6 run audit 查询 contract

```ts
type JourneyRunAuditQuery = {
  page: number
  pageSize: number
  actionKey?: string
  providerKey?: string
  modelKey?: string
  status?: string
  referenceId?: string
  conversationId?: string
}
```

固定规则：

- 默认排序：`createdAt desc`
- page 最小值：`1`
- pageSize 由服务端上限保护

## 7. 闭环 D：管理后台页面方案

### 7.1 目标

管理后台页面只负责把已经固定的后台 contract 做成可读可改的内部工具页。

### 7.2 页面结构

管理后台固定为 3 个主要区块：

1. 动作积分配置
2. 模型策略配置
3. Journey run audit

### 7.3 固定字段

动作积分配置页字段：

- 工具
- 动作
- 展示名
- 当前积分
- 是否启用
- 版本号
- 最后更新时间

模型策略页字段：

- 工具
- 动作
- provider
- model
- endpoint
- apiKeyRef
- timeout
- enabled
- version

Journey run audit 页字段：

- 时间
- 动作
- 消耗积分
- provider
- model
- API 信息
- 对话 ID
- referenceId
- 状态

### 7.4 错误态与权限态

必须明确展示：

- 未登录
- 无管理员权限
- 接口请求失败
- 空数据
- 保存失败
- 并发冲突

Admin UI 不允许直接操作数据库，也不允许自己推导审计字段。

## 8. 闭环 E：前端正式生成入口方案

### 8.1 目标

前端正式生成入口必须把 assistant 的“澄清对话”与 Journey generation 的“正式生成主链”分开。

前端只负责：

1. 帮用户收口必要信息
2. 展示确认卡片
3. 用户确认后触发正式生成
4. 成功后承接结果
5. 失败后给出明确反馈

### 8.2 最小确认条件

正式生成前最小条件固定为：

- 已确认 `personaIds`
- 已确认 `scenario`
- 已确认 `coreTask`
- 已确认 `scope`

### 8.3 确认卡片 contract

```ts
type JourneyConfirmCard = {
  personaIds: string[]
  scenario: string
  coreTask: string
  scope: string
  // Optional supplemental constraints, max length 1000 characters.
  extraNotes?: string
  chargeHint: string
}
```

推荐按钮：

- `继续补充`
- `确认并生成`

### 8.4 前端触发时机

只有在以下条件同时满足时，前端才可调用 `journey-generate`：

1. 用户点击 `确认并生成`
2. 确认卡片校验通过
3. 当前没有进行中的正式 run

确认卡片校验至少包含：

- `scenario`、`coreTask`、`scope` 非空
- `personaIds` 至少 1 个，且不能重复
- `extraNotes` 去除首尾空白后最大 1000 个字符

前端不允许在对话过程中自动后台生成。

### 8.5 成功态与失败态

成功后前端必须完成：

1. 更新当前 Journey 文档上下文
2. 使用返回的 `documentId / revision / result` 刷新页面
3. 显示本次结果使用的 `provider / model`
4. 清空当前一次性确认态

失败时前端必须区分：

- 表单缺项
- 权限失败
- Persona 不可用
- 积分不足或动作不可用
- 模型失败
- 保存失败

失败时固定规则：

- 不覆盖当前文档
- 不把失败中间态写进 Journey 页面
- 保留确认卡片内容，便于用户调整后重试

## 9. 五个闭环之间的依赖关系

正式依赖顺序固定为：

1. Persona 读取闭环
2. Billing / Audit 后端闭环
3. Journey generation 后端闭环
4. Admin UI 闭环
5. Front-end generation entry 闭环

## 10. 当前结论

按方案层面，当前已经可以认为这 5 个问题从“没有明确设计闭环”进入“已完成设计闭环、待进入实现”。

当前还欠的已经不是“再讨论概念”，而是：

- 把 Persona read contract 变成代码
- 把 Journey generation service 变成代码
- 把 admin / billing backend contract 变成代码
- 把 admin UI 与 front-end generation entry 接上线

进入开发时仍然要坚持：

1. 一个阶段只改一个主模块边界
2. contract 先于实现
3. UI 不反向定义领域规则
4. 原始证据不直接进入 Journey 主输入
5. 任何扣分行为都必须可审计
6. 失败路径必须和成功路径一样明确

一句话结论：

> 现在这 5 个问题已经不是“要不要做”，而是“按哪份写死的 contract 去做”；这份总装配文档就是后续开发前的主索引。
