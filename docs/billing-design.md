# Billing / Entitlements 积分制设计

更新日期：2026-06-14

## 目标与边界

Billing / Entitlements 的正式售卖单位是积分（credits），不再是“次数”。

- 用户购买 `CreditPackage`，支付成功后写入 `purchase` 积分账本。
- AI 请求前执行 `reserve`，成功后执行 `commit`，失败、超时、取消或结果非法时执行 `release`。
- 手动编辑和非 AI 操作不扣积分。
- 动作价格由服务端配置决定，不能写死在页面层。
- 本模块不接真实微信/支付宝，不修改 Journey UI。

代码落点：

- `server/application/billing/index.cjs`
- `server/application/billing/payment-integration.cjs`
- `server/infrastructure/payments/*`

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
- `credit.purchase:order:ord_1001:evt_8`
- `credit.reserve:ai_run:run_9:req_1`
- `credit.commit:ai_run:run_9:req_2`
- `credit.release:ai_run:run_9:req_3`

规则：

- 重试同一动作必须复用原 key。
- `reserve / commit / release` 必须使用不同 key。
- 同一个 key 搭配相同语义 payload 时返回第一次结果。
- 同一个 key 搭配不同账户、reference、积分、动作档位或目标状态时返回 `409` 冲突。

## 服务契约

`createBillingService()` 当前输出：

- 积分商品：`createCreditPackage`、`getCreditPackage`、`listCreditPackages`
- 订单：`createOrder` 与订单状态迁移动作
- 入账：`purchaseCredits`、`grantCredits`
- AI 结算：`reserveCredits`、`commitCredits`、`releaseCredits`
- 账户：`getCreditAccount`

Repository port 当前包括：

- `getCreditPackage`、`insertCreditPackage`、`listCreditPackages`
- 订单与订单动作读写
- reservation 读写与版本更新
- ledger entry 幂等查询、写入与账户维度列表

正式持久化实现需要用数据库事务或等价原子机制保证 reservation、ledger 和订单状态的一致性。

## 当前状态

已完成：

- `CreditPackage / CreditAccount / CreditLedgerEntry / CreditReservation` 正式契约
- `purchase / grant / reserve / commit / release / refund / adjustment / expire` 账本语义
- 支付成功后 purchase 入账
- AI 调用前预占、成功确认、失败释放
- 重复请求幂等与不一致 payload 冲突测试
- manual provider 与支付结果绑定校验

未完成：

- 微信支付 / 支付宝真实适配器
- CloudBase 正式持久化仓储与事务
- 已发放积分在退款后的自动回收策略
- 部分退款与多次退款
- AI orchestration 对本服务的正式调用接线
