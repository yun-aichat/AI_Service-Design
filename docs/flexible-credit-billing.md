# 积分制灵活计费方案

更新日期：2026-06-14

## 1. 目标

本方案将当前项目的计费口径从“按次数扣减”正式调整为“积分制 + 可配置动作档位 + 可切换模型策略”。

目标不是把 token 价格直接暴露给用户，而是建立两层稳定模型：

- 成本层：系统按真实模型 token 消耗核算成本。
- 售卖层：用户购买积分，AI 动作按固定或分档积分扣费。

这样可以同时满足：

- 不同工具、不同 AI 动作可以有不同价格。
- 模型供应商、模型版本和最大 token 配额可以切换。
- 积分商品售价可以独立调整。
- 后续可以通过真实成本数据持续调价，而不需要重写业务主链。

## 2. 核心产品规则

### 2.1 收费对象

- 用户购买的是 `credits`，不是使用次数。
- 只有 AI 行为消耗积分。
- 用户手动编辑、手动调整工具内容，不消耗积分。
- 不同工具、不同动作、不同档位可以消耗不同积分。

### 2.2 计费动作

建议第一阶段统一把会扣积分的动作限定为：

- `clarify`
- `proposal`
- `analysis`
- `generate`
- `transform`

不同工具可只启用其中一部分。

### 2.3 积分扣减时机

所有 AI 调用统一采用：

1. `reserve`：发起模型请求前预占积分。
2. `commit`：模型成功返回且业务结果合法后确认扣减。
3. `release`：模型失败、超时、取消或结果非法时释放预占。

### 2.4 明确不扣积分的行为

以下行为默认不扣积分：

- 工具页面的本地手动编辑
- 非 AI 的结构化字段修改
- 浏览项目、查看历史 revision、导出已有文档

后续如有“AI 辅助导出增强”之类新能力，应单独定义动作与扣费规则，不能借用现有动作语义。

## 3. 两层定价模型

### 3.1 成本层

服务端真实成本基于模型消耗核算：

```text
RealCost = InputTokens * InputTokenPrice
         + OutputTokens * OutputTokenPrice
         + FixedCost
```

其中 `FixedCost` 用于覆盖：

- 支付通道分摊
- 云函数 / 存储 / 日志 / 网关成本
- 风控和重试缓冲

### 3.2 售卖层

用户侧收入基于积分售卖与动作扣分：

```text
Revenue = ChargedCredits * CreditUnitPrice
```

产品定价必须保证：

```text
Revenue > RealCost
```

更稳妥的目标是：

```text
Revenue >= RealCost * SafetyFactor
```

`SafetyFactor` 建议第一阶段取 `1.5 ~ 3.0`，具体由运营和成本观察结果调整。

### 3.3 设计原则

- 不按实时 token 直接向用户收费。
- 用户看到的是“动作价格”或“档位价格”，不是底层模型账单。
- 系统后台必须记录真实 token 消耗，作为后续调价依据。

## 4. 可配置的三层策略

本项目的计费灵活性必须来自三层配置，而不是代码里的硬编码常量。

### 4.1 AI 动作定价配置

定义“某个工具的某个动作在某个档位扣多少积分”。

```ts
type AiActionPricing = {
  toolKey: string
  actionKey: string
  tierKey: string
  creditCost: number
  enabled: boolean
  displayName: string
  description?: string
}
```

示例：

- `journey-map / clarify / lite / 0`
- `journey-map / proposal / standard / 15`
- `journey-map / proposal / deep / 35`
- `personas / generate / standard / 20`

### 4.2 模型策略配置

定义“某个动作档位实际调用哪个供应商和模型，以及最大 token 预算和回退策略”。

```ts
type AiModelPolicy = {
  toolKey: string
  actionKey: string
  tierKey: string
  provider: string
  model: string
  temperature: number
  maxInputTokens: number
  maxOutputTokens: number
  timeoutMs: number
  fallbackProvider?: string
  fallbackModel?: string
  enabled: boolean
}
```

示例：

- `journey-map / proposal / lite -> glm-4.5-air`
- `journey-map / proposal / standard -> glm-4.5`
- `journey-map / proposal / deep -> openai:gpt-5-mini` 或更高成本模型

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

示例：

- `starter-100 / 100 / 0 / 9.9 / CNY`
- `standard-300 / 300 / 20 / 26.9 / CNY`
- `pro-1000 / 1000 / 200 / 79.9 / CNY`

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
    | "order"
    | "payment"
    | "ai_run"
    | "refund"
    | "admin"
  referenceId: string
  idempotencyKey: string
  operation:
    | "purchase"
    | "grant"
    | "reserve"
    | "commit"
    | "release"
    | "refund"
    | "adjustment"
    | "expire"
  credits: number
  availableDelta: number
  reservedDelta: number
  consumedDelta: number
  metadata: Record<string, unknown> | null
  createdAt: string
}
```

语义建议：

- `purchase` / `grant` / `refund`：增加 `available`
- `reserve`：`available -N`，`reserved +N`
- `commit`：`reserved -N`，`consumed +N`
- `release`：`reserved -N`，`available +N`
- `expire`：减少 `available`

### 5.3 预占对象

```ts
type CreditReservation = {
  id: string
  accountId: string
  referenceId: string
  toolKey: string
  actionKey: string
  tierKey: string
  credits: number
  status: "reserved" | "committed" | "released"
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
  tierKey: string
  provider: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  estimatedCostValue: number | null
  chargedCredits: number
  status: "started" | "succeeded" | "failed" | "cancelled"
  referenceId: string
  createdAt: string
}
```

这张表负责支撑：

- 成本分析
- 利润分析
- 动作热度统计
- 后台审计和异常排查

## 6. 服务端执行时序

一次 AI 请求建议采用如下时序：

1. 前端提交：
   - `toolKey`
   - `actionKey`
   - `tierKey`
   - `projectId`
   - `documentId`
2. 服务端读取动作定价配置与模型策略配置。
3. 校验用户积分余额是否足够。
4. 创建 `ai_run` / `usage event` 记录并执行 `reserve credits`。
5. 调用目标模型。
6. 成功时：
   - 记录实际 token 用量和估算成本
   - 执行 `commit credits`
   - 返回业务结果
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

### 7.2 轻量后台管理页

本项目需要一个轻量级内部后台页面，作为配置管理与成本观察入口。数据库只作为正式数据源，不作为人工操作界面。

第一阶段后台建议覆盖：

- 积分商品管理
- AI 动作定价管理
- 模型策略管理
- 积分账本与 usage event 查询
- 成本与毛利概览

推荐页面：

- `/admin/billing/packages`
- `/admin/billing/pricing`
- `/admin/billing/model-policies`
- `/admin/billing/ledger`
- `/admin/billing/costs`

约束：

- 第一版只做内部使用，不追求复杂运营后台。
- 关键校验必须保留在服务端，不能只依赖前端表单约束。
- 配置变更应记录操作者、变更前后值和时间，便于审计。

### 7.3 前端需要感知的最小信息

前端不需要知道真实 token 单价，但需要知道：

- 当前动作要扣多少积分
- 当前余额是否足够
- 当前选择的是哪个档位
- 执行完成后消耗了多少积分

推荐前端展示：

- 当前积分余额
- 当前动作积分价格
- 操作前确认提示
- 操作后消费记录

## 8. token 与积分的关系

### 8.1 第一阶段原则

第一阶段不按实时 token 直接扣积分，而是：

- 用户侧：按动作档位扣固定积分
- 后台侧：记录真实 token 用量用于核算

### 8.2 后续可扩展方向

若后面发现某些动作的成本波动明显，可以扩展为：

- 固定积分档位
- token 区间映射积分
- 超额 token 附加费

但这些都应作为第二阶段配置策略，不进入 MVP 主链。

## 9. 推荐的第一阶段产品口径

建议先采用以下规则：

- `clarify`：0 ~ 2 credits
- `proposal.standard`：10 ~ 20 credits
- `proposal.deep`：25 ~ 40 credits
- `analysis.deep`：30 ~ 50 credits

建议先用较少档位验证业务：

- `lite`
- `standard`
- `deep`

不要一开始把价格体系设计得过细，否则维护成本会超过实际收益。

## 10. 对当前项目模块的影响

### 10.1 `billing-entitlements`

- 从“次数权益”调整为“积分账户 + 积分账本 + 预占对象”
- 订单 fulfill 后发放的是积分，不是次数
- 所有 reserve / commit / release 语义改为积分

### 10.2 `payment-integration`

- 商品不再表达“次数包”，而是“积分包”
- 支付成功后写入 `purchase` 类积分账本 entry

### 10.3 `ai-orchestration`

- AI 请求必须带 `toolKey / actionKey / tierKey`
- AI 执行前先做积分校验和预占
- usage event 要记录 `chargedCredits + token usage`

### 10.4 `persistence-backend`

- 需要支持查询积分账本、usage event、充值订单
- 项目级和用户级后台都要可审计

### 10.5 `admin-console`

- 增加轻量内部后台页，用于修改计费配置和查看成本情况
- 后台页读取正式配置与账本数据，不引入单独的配置源
- 第一版优先保证边界清晰、可用和可审计

## 11. 当前明确不做的事

本轮方案不包含：

- 实时 token 价格直接面向用户展示
- 不同用户等级的复杂折扣系统
- 企业共享积分池
- 自动月度订阅续费
- 多币种和跨区支付税务处理

这些可以作为后续产品化阶段扩展。

## 12. 建议下一步实施顺序

1. 先更新 `billing-design.md`，把次数权益口径全面切换为积分制。
2. 收口 `billing-entitlements` 领域契约与测试。
3. 在 `ai-orchestration` 中补 `toolKey / actionKey / tierKey` 与积分预占语义。
4. 在 `persistence-backend` 中补余额、账本、usage event 查询接口。
5. 增加轻量后台页，先打通配置管理与成本查看。
6. 最后再接前端余额展示、商品展示和支付入口。
