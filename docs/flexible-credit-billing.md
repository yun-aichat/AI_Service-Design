# 积分制灵活计费方案

更新日期：2026-06-23

## 1. 目标

当前项目的计费口径正式固定为：

- 用户购买积分
- AI 动作按积分扣费
- 后台按动作层维护扣分真源
- 模型供应商和模型版本可切换

当前阶段不把 token 成本写入正式业务主链，也不在系统内先做精细成本核算。

这套方案的目标是：

- 不同工具、不同 AI 动作可以有不同积分价格
- 管理员可以直接调动作积分
- 可以接入多个 AI API 接口方便测试
- 前端可以展示本次结果使用的是哪个模型
- 等系统真实运行后，再根据平台账单和业务数据调整价格

## 2. 核心产品规则

### 2.1 收费对象

- 用户购买的是 `credits`
- 只有 AI 行为消耗积分
- 用户手动编辑、手动调整工具内容，不消耗积分
- 积分扣减真源在后台动作层，不在前端页面

### 2.2 计费动作

当前阶段建议所有收费动作都走动作层配置，不再维护另一套结果层价格真源。

Journey 第一阶段建议动作包括：

- `skeleton_generate`
- `persona_run`
- `journey_synthesis`
- `journey_regenerate`

是否启用某个动作、每个动作扣多少积分，都由后台配置决定。

### 2.3 积分扣减时机

所有 AI 调用统一采用：

1. `reserve`：发起模型请求前预占积分
2. `commit`：模型成功返回且业务结果合法后确认扣减
3. `release`：模型失败、超时、取消或结果非法时释放预占

### 2.4 明确不扣积分的行为

以下行为默认不扣积分：

- 工具页面的本地手动编辑
- 非 AI 的结构化字段修改
- 浏览项目、查看历史 revision、导出已有文档

## 3. 当前定价真源

当前阶段只固定一个真源：

- 动作层积分定价

也就是说，管理员真正配置的是：

- 某个工具的某个动作扣多少积分

当前阶段不做：

- 默认按几个 Persona 自动推导展示价
- 用户生成前的动态积分预估
- 实时 token 成本换算积分

### 3.1 设计原则

- 不按实时 token 直接向用户收费
- 不把 token 成本写入正式业务规则
- 用户界面不必提前展示本次预计消耗多少积分
- 用户侧价格说明放在产品介绍和购买说明中
- 后台按动作层维护积分扣减真源

### 3.2 运营现实

当前阶段如果要核对模型成本，直接去对应 AI 平台查看账单即可。

因此 MVP 先把下面两件事跑通就够：

- 系统内积分扣减和 usage 审计
- 后台动作配置和 run 明细查询

## 4. 可配置策略

### 4.1 AI 动作定价配置

定义“某个工具的某个动作扣多少积分”。

```ts
type AiActionPricing = {
  toolKey: string
  actionKey: string
  creditCost: number
  enabled: boolean
  displayName: string
  description?: string
}
```

示例：

- `journey-map / skeleton_generate / 5`
- `journey-map / persona_run / 10`
- `journey-map / journey_synthesis / 8`
- `journey-map / journey_regenerate / 20`

### 4.2 模型策略配置

定义“某个动作实际调用哪个供应商和模型”，重点是支持多 AI API 接口接入和切换测试。

```ts
type AiModelPolicy = {
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
}
```

`apiKeyRef` 当前建议只引用服务端已存在的密钥标识，不在后台页面直接编辑原始 API Key。

推荐边界：

- 后台页面只选择 `apiKeyRef`
- 真正的密钥值继续放在服务端环境变量或密钥存储中
- provider 切换不能要求前端持有任何第三方模型密钥
当前阶段的目标不是先做复杂成本策略，而是：

- 能同时接入多个 AI provider
- 能在后台切换动作使用的 provider 和 model
- 能方便测试不同模型效果
- 前端能看到本次结果使用的是哪个模型

示例：

- `journey-map / skeleton_generate -> zhipu / glm-4.6`
- `journey-map / persona_run -> deepseek / deepseek-reasoner`
- `journey-map / journey_synthesis -> openai / gpt-5-mini`

### 4.3 积分商品配置

定义“积分怎么卖给用户”。

```ts
type CreditPackage = {
  packageId: string
  credits: number
  bonusCredits: number
  priceValue: number
  currency: string
  enabled: boolean
  validityDays: number | null
  channelScope?: string[]
}
```

## 5. 推荐领域模型

### 5.1 积分账户

```ts
type CreditAccount = {
  id: string
  userId: string
  availableCredits: number
  reservedCredits: number
  consumedCredits: number
  createdAt: string
  updatedAt: string
  version: number
}
```

### 5.2 积分账本

```ts
type CreditLedgerEntry = {
  id: string
  accountId: string
  orderId: string | null
  reservationId: string | null
  referenceType:
    | 'order'
    | 'payment'
    | 'ai_run'
    | 'refund'
    | 'admin'
  referenceId: string
  idempotencyKey: string
  operation:
    | 'purchase'
    | 'grant'
    | 'reserve'
    | 'commit'
    | 'release'
    | 'refund'
    | 'adjustment'
    | 'expire'
  credits: number
  availableDelta: number
  reservedDelta: number
  consumedDelta: number
  metadata: Record<string, unknown> | null
  createdAt: string
}
```

### 5.3 预占对象

```ts
type CreditReservation = {
  id: string
  accountId: string
  referenceId: string
  toolKey: string
  actionKey: string
  credits: number
  status: 'reserved' | 'committed' | 'released'
  idempotencyKey: string
  expiresAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  committedAt: string | null
  releasedAt: string | null
  version: number
}
```

### 5.4 AI 使用事件

```ts
type AiUsageEvent = {
  id: string
  userId: string
  projectId: string | null
  documentId: string | null
  toolKey: string
  actionKey: string
  providerKey: string
  modelKey: string
  endpoint: string | null
  conversationId: string | null
  chargedCredits: number
  status: 'started' | 'succeeded' | 'failed' | 'cancelled'
  referenceId: string
  createdAt: string
}
```

这张表当前主要负责支撑：

- run 审计
- 动作热度统计
- 后台异常排查
- 模型使用对比

当前不要求它先承担精细 token 成本台账。

## 6. 服务端执行时序

一次 AI 请求建议采用如下时序：

1. 前端提交 `toolKey / actionKey / projectId / documentId`
2. 服务端读取动作定价配置与模型策略配置
3. 校验用户积分余额是否足够
4. 创建 `ai_run` / `usage event` 并执行 `reserve credits`
5. 调用目标模型
6. 成功时：
   - 执行 `commit credits`
   - 返回业务结果与模型标识
7. 失败时：
   - 记录失败状态
   - 执行 `release credits`
   - 返回错误

## 7. 配置与接口边界

### 7.1 服务端必须提供的能力

- 查询用户积分余额
- 查询积分账本
- 查询积分商品
- 创建充值订单
- 支付成功后发放积分
- AI 请求前进行积分预占
- AI 请求完成后确认或释放积分
- 查询 AI usage event
- 查询 Journey run 动作明细

### 7.1.1 Journey run 明细表字段

这张表默认用于管理员查看每一次 AI run 的审计明细。

### 7.1.2 Journey run 明细接口协议

后台查询 Journey run 明细时，建议先固定以下查询参数：

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

默认值：

- `sortBy = 'createdAt'`
- `sortDirection = 'desc'`

返回对象建议固定为：

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

分页响应建议沿用现有后台分页风格：

```ts
type BillingPage<T> = {
  items: T[]
  page: {
    limit: number
    offset: number
    total: number
    hasMore: boolean
  }
}
```

管理员查看 Journey run 明细时，表单字段先固定为：

- 时间 `createdAt`
- 动作 `actionKey`
- 消耗积分 `chargedCredits`
- 模型 `modelKey`
- API 信息 `providerKey / endpoint`
- Run ID `referenceId`
- 对话 ID `conversationId`

推荐补充字段：

- 用户 ID
- 项目 ID
- 文档 ID
- 状态 `status`

默认排序规则：

- 按时间从近到远排序
- 也就是 `createdAt desc`

### 7.1.3 后台配置写入接口协议

为了让 admin-console 与后端边界稳定，建议先固定两类写入命令：

```ts
type UpdateActionPricingCommand = {
  toolKey: string
  actionKey: string
  creditCost: number
  enabled: boolean
}

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
}
```

要求：

- 只允许管理员调用
- 每次修改必须记录操作者、修改前值、修改后值、时间
- 写入成功后，后台列表读取结果必须立即反映新值

### 7.2 轻量后台管理页

本项目需要一个轻量级内部后台页面，作为配置管理与 run 审计入口。数据库只作为正式数据源，不作为人工操作界面。

第一阶段后台建议覆盖：

- 动作积分定价管理
- 模型策略管理
- 积分账本与 usage event 查询
- Journey run 明细查询

推荐页面：

- `/admin/billing/pricing`
- `/admin/billing/model-policies`
- `/admin/billing/ledger`
- `/admin/billing/usage`

约束：

- 第一版只做内部使用，不追求复杂运营后台
- 当前不做系统内 token 成本与毛利总览页
- 管理员要能直接看到每次 run 触发了哪些动作、每个动作扣了多少积分
- 配置变更应记录操作者、变更前后值和时间，便于审计

### 7.3 前端需要感知的最小信息

前端不需要知道真实 token 单价，但需要知道：

- 当前余额是否足够
- 执行完成后消耗了多少积分
- 当前结果使用的是哪个 provider / model

推荐前端展示：

- 当前积分余额
- 操作后消费记录
- 当前结果使用模型

## 8. token 与积分的关系

第一阶段不按实时 token 直接扣积分。

当前规则是：

- 用户侧：按动作扣积分
- 系统内：先不把 token 成本写入正式业务链路
- 管理侧：需要核对成本时，直接去对应 AI 平台查看账单

若后面真实运行后发现有必要，再考虑是否把 token 用量或成本回写进系统。

## 9. 对当前项目模块的影响

### 9.1 `billing-entitlements`

- 从“次数权益”调整为“积分账户 + 积分账本 + 预占对象”
- 所有 reserve / commit / release 语义改为积分
- 动作定价去掉对展示套餐价的依赖

### 9.2 `ai-orchestration`

- AI 请求必须带 `toolKey / actionKey`
- AI 执行前先做积分校验和预占
- usage event 至少记录 `chargedCredits + providerKey + modelKey`

### 9.3 `admin-console`

- 增加轻量内部后台页，用于修改动作积分和模型策略
- 后台页可以查看 Journey run 动作明细
- 第一版优先保证边界清晰、可用和可审计

## 10. 当前明确不做的事

本轮方案不包含：

- 实时 token 价格直接面向用户展示
- 系统内精细 token 成本核算
- 生成前按 Persona 数量动态展示预计扣分
- 不同用户等级的复杂折扣系统
- 企业共享积分池

## 11. 建议下一步实施顺序

1. 先更新 `billing-design.md`，确保账本主链继续以积分为中心
2. 收口动作定价配置与模型策略配置
3. 在 Journey generation 链路中补 `toolKey / actionKey` 与积分预占语义
4. 增加后台动作定价、模型策略和 usage 查询接口
5. 前端补“当前结果使用模型”展示

一句话总结：

> 当前 MVP 的计费重点不是先做复杂成本系统，而是把“动作积分配置 + run 审计 + 多模型切换”这三件事跑稳。
