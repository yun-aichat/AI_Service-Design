# Billing / Entitlements 积分制设计

更新日期：2026-06-14

## 目标与边界

Billing / Entitlements 的正式售卖单位是积分（credits），不再是“次数”。

- 用户购买 `CreditPackage`，支付成功后写入 `purchase` 积分账本。
- AI 请求前执行 `reserve`，成功后执行 `commit`，失败、超时、取消或结果非法时执行 `release`。
- 手动编辑和非 AI 操作不扣积分。
- 动作价格由服务端配置决定，不能写死在页面层。
- 本模块不接真实微信/支付宝，不修改 Journey UI。

## 模块承接与验收边界

`billing-entitlements` 正式承接以下能力：

- 积分商品、订单模型与订单支付状态机。
- `CreditAccount`、`CreditLedgerEntry`、`CreditReservation` 及三 bucket 语义。
- `purchase / grant / reserve / commit / release / refund / adjustment / expire` 账本操作。
- `PaymentProvider` 接口、manual provider 骨架与回调签名验证。
- 支付意图、支付查询、回调结算、退款请求与退款查询的 payment integration 主链。

模块验收文件限定为：

- `server/application/billing/index.cjs`
- `server/application/billing/index.test.cjs`
- `server/application/billing/payment-integration.cjs`
- `server/application/billing/payment-integration.test.cjs`
- `server/infrastructure/payments/*`
- `docs/billing-design.md`

以下内容不属于本模块承接范围：

- `server/application/billing-config.cjs`
- `server/infrastructure/cloudbase/billing-config/*`
- billing-config 管理查询、CloudBase 持久化与数据库索引
- AI orchestration 调用接线
- 前端页面、Journey UI 与 design-system

### Git 恢复后的承接关系

2026-06-14 Git 元数据恢复后，billing 主链源码首先出现在恢复基线
`44fe4ad4c48b34a53a5fda1a3b9d3d82952b89b6` 中。该提交是全仓源码重建快照，
不是 `billing-entitlements` 的独立模块提交，也不能据此宣称模块审查通过。

本文件后续的独立模块提交用于固定上述所有权与验收范围。审查 billing 模块时，
应按“模块验收文件限定”检查当前代码和测试，不应把恢复基线中的 persistence、
assistant、前端或设计系统内容计入本模块变更。

## 正式领域对象

### CreditPackage

```ts
type CreditPackage = {
  packageId: string
  displayName: string
  credits: number
  bonusCredits: number
  totalCredits: number
  priceValue: number
  currency: string
  enabled: boolean
  validityDays: number | null
  channelScope: string[]
  description: string | null
  sortOrder: number
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  version: number
}
```

订单只接受已启用且渠道匹配的积分商品。`credits`、`amountValue` 和 `currency` 必须从商品生成订单快照，不能由调用方自由指定。

### CreditAccount

`CreditAccount` 是不可变账本聚合出的账户读模型：

```ts
type CreditAccount = {
  id: string
  accountId: string
  availableCredits: number
  reservedCredits: number
  consumedCredits: number
  totalIssuedCredits: number
  totalExpiredCredits: number
}
```

三个 bucket 的语义：

- `available`：当前可用于新 AI 请求的积分。
- `reserved`：已被进行中的 AI 请求预占、尚未最终结算的积分。
- `consumed`：已经成功结算并消耗的积分。

不得以覆盖写方式直接修改账户余额。账户值必须由账本 entry 聚合，持久化实现可额外维护可重建的快照。

### CreditLedgerEntry

```ts
type CreditLedgerEntry = {
  id: string
  accountId: string
  orderId: string | null
  reservationId: string | null
  referenceType: "order" | "payment" | "refund" | "ai_run" | "admin"
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

账本语义：

| operation | availableDelta | reservedDelta | consumedDelta |
|---|---:|---:|---:|
| `purchase` | `+N` | `0` | `0` |
| `grant` | `+N` | `0` | `0` |
| `reserve` | `-N` | `+N` | `0` |
| `commit` | `0` | `-N` | `+N` |
| `release` | `+N` | `-N` | `0` |
| `refund` | `+N` | `0` | `0` |
| `adjustment` | 按审批结果 | `0` | `0` |
| `expire` | `-N` | `0` | `0` |

### CreditReservation

```ts
type CreditReservation = {
  id: string
  accountId: string
  orderId: string | null
  referenceId: string
  toolKey: string
  actionKey: string
  tierKey: string
  credits: number
  status: "reserved" | "committed" | "released"
  idempotencyKey: string
  metadata: Record<string, unknown> | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  committedAt: string | null
  releasedAt: string | null
  version: number
}
```

状态只能从 `reserved` 进入 `committed` 或 `released`。同一个预占不能同时确认和释放。

## 订单状态机

订单状态保持：

```text
created -> pending | closed
pending -> paid | closed
paid -> fulfilled | closed | refund_pending
fulfilled -> refund_pending
refund_pending -> paid | fulfilled | refunded
closed -> terminal
refunded -> terminal
```

订单使用 `packageId`，并保存支付时商品的 `credits / currency / amountValue` 快照。`fulfilled` 表示对应 `purchase` 账本 entry 已成功入账。

支付成功闭环：

```text
verified callback or verified query
  -> pending
  -> paid
  -> purchase credits
  -> fulfilled
```

重复回调只能命中已有账本 entry，不能重复发积分。

## AI 积分闭环

一次收费 AI 动作必须携带：

- `accountId`
- `referenceId`
- `toolKey`
- `actionKey`
- `tierKey`
- `credits`
- `idempotencyKey`

执行顺序：

1. 服务端读取动作定价，确定 `credits`。
2. `reserveCredits` 检查 `available` 并创建 `CreditReservation`。
3. AI 成功且业务结果合法时调用 `commitCredits`。
4. AI 失败、超时、取消或结果非法时调用 `releaseCredits`。

余额不足时不得创建 reservation 或 reserve ledger entry。

## referenceId 与 idempotencyKey

### referenceId

`referenceId` 表示稳定业务事实，格式固定为：

```text
<scope>:<stable-id>
```

建议 scope：

- `order:<orderId>`
- `payment:<providerEventId>`
- `ai_run:<runId>`
- `refund:<refundRequestId>`
- `admin:<ticketId>`

同一次 AI 运行的 `reserve / commit / release` 必须使用同一个 `referenceId`。

### idempotencyKey

`idempotencyKey` 表示一次有副作用动作的语义执行，格式固定为：

```text
<action-scope>:<reference-scope>:<reference-id>:<request-id>
```

示例：

- `order.create:order:ord_1001:req_1`
- `ledger.purchase:order:ord_1001:settlement`
- `credit.reserve:ai_run:run_9:req_1`
- `credit.commit:ai_run:run_9:req_2`
- `credit.release:ai_run:run_9:req_3`

规则：

- 重试同一动作必须复用原 key。
- `purchase` 属于订单级业务幂等：同一订单固定使用 `ledger.purchase:<order-reference>:settlement`。
- `reserve / commit / release` 必须使用不同 key。
- 同一个 key 搭配相同语义 payload 时返回第一次结果。
- 同一个 key 搭配不同账户、reference、积分、动作档位或目标状态时返回 `409` 冲突。

## 服务契约

`createBillingService()` 当前输出：

- 积分商品：`createCreditPackage`、`getCreditPackage`、`listCreditPackages`
- 订单：`createOrder`、订单状态迁移动作、`settlePaidOrder`
- 入账：`purchaseCredits`、`grantCredits`
- AI 结算：`reserveCredits`、`commitCredits`、`releaseCredits`
- 账户：`getCreditAccount`

Repository port 当前包括：

- `getCreditPackage`、`insertCreditPackage`、`listCreditPackages`
- 订单与订单动作读写
- reservation 读写与版本更新
- ledger entry 幂等查询、写入与账户维度列表
- `runInTransaction(work)`，向 application 层提供同一事务内的 repository 视图

application 层负责声明事务边界，repository 继续保持单集合读写职责。

### CloudBase 集合与约束

CloudBase billing repository 使用以下服务端集合：

| 集合 | 文档主键 | 必需唯一索引 |
|---|---|---|
| `credit_packages` | `packageId` | `_id` |
| `billing_orders` | `order.id` | `_id`, `idempotencyKey` |
| `billing_order_actions` | `action.id` | `_id`, `idempotencyKey` |
| `credit_reservations` | `reservation.id` | `_id`, `idempotencyKey` |
| `credit_ledger` | `entry.id` | `_id`, `idempotencyKey` |

订单与 reservation 的 `version` 从 `0` 开始。更新必须使用
`id + expectedVersion` 条件更新，并且只在恰好更新一条文档时返回成功。

单条 insert 依赖 `_id` 与 `idempotencyKey` 唯一索引避免并发重复写。`credit_ledger`
中的 `purchase` entry 必须把订单级稳定业务键写入 `idempotencyKey`，例如
`ledger.purchase:order:ord_1001:settlement`，由数据库唯一索引保证“一笔订单最多一条
purchase 账本”。repository
会在写前查询并把同一幂等键重试返回为 `null`，同时将数据库唯一索引冲突归一化为
领域重复语义。

余额查询使用完整账本读取，不允许单次 `where({ accountId }).get()` 假设结果完整。
当前正式方案为：按 `accountId` 过滤后，使用 `createdAt asc` + `id asc` 的稳定排序，
以固定页大小循环分页读取到账本结束，再由 application 层的
`calculateCreditAccount()` 计算 `available / reserved / consumed / totalIssued /
totalExpired`。分页读取过程中如果 CloudBase 查询失败，或分页结果出现重复 ledger id，
必须直接抛错，不能返回部分余额。

为支撑上述余额查询，`credit_ledger` 需要以下索引：

- 唯一索引：`idempotencyKey`
- 组合查询索引：`accountId, createdAt, id`

以下多记录流程由 `createBillingService()` 通过 `runInTransaction()` 原子编排：

- 创建 reservation 与写入 `reserve` ledger entry。
- 更新 reservation 与写入 `commit` / `release` ledger entry。
- 订单进入 paid、写入 purchase ledger、订单进入 fulfilled。

`CloudBaseBillingRepository` 优先使用 database client 的 `runTransaction`；
对于暴露 `startTransaction` 的 SDK 版本，则使用 transaction repository 并显式
`commit` / `rollback`。如果 client 不提供任何事务 API，服务会直接失败，不会降级为
非原子多步写。唯一索引和乐观锁继续负责幂等与并发保护，但不替代跨集合事务。

## 当前状态

已完成：

- `CreditPackage / CreditAccount / CreditLedgerEntry / CreditReservation` 正式契约
- `purchase / grant / reserve / commit / release / refund / adjustment / expire` 账本语义
- 支付成功后 purchase 入账
- AI 调用前预占、成功确认、失败释放
- 重复请求幂等与不一致 payload 冲突测试
- manual provider 与支付结果绑定校验
- CloudBase reservation / ledger 与 paid / purchase / fulfilled 跨集合事务编排

未完成：

- 微信支付 / 支付宝真实适配器
- 已发放积分在退款后的自动回收策略
- 部分退款与多次退款
- AI orchestration 对本服务的正式调用接线
