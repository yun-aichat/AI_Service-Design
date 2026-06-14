# 服务设计工具箱：现状与总体架构

更新日期：2026-06-13

## 1. 当前项目情况

当前仓库已经不再是“单个 Journey DEMO”，而是进入了第一阶段模块化形态。Journey Map 仍然是唯一正式工具，但应用壳、AI 面板、认证、文档持久化和账本契约都已经有独立目录。

### 已完成的主线

- 平台壳与组件库已从原始 DEMO 中拆出，壳层代码位于 `src/app/*`。
- Journey Map 已形成正式工具模块，位于 `src/tools/journey-map/*`。
- 工具注册表已启用，当前注册 `journey-map`。
- AI 对话区已拆到 `src/features/assistant/*`，保持 `clarify -> proposal -> confirm` 语义。
- 账号页与 CloudBase Web 认证接线已进入 `src/features/account/*` 与 `src/infrastructure/cloudbase/auth/*`。
- 文档持久化已进入 `server/application/tool-documents.cjs`、`server/infrastructure/cloudbase/tool-documents/*` 和 `api/tool-documents.js`。
- Journey 已从 DEMO 常量上下文切换到正式的 `projectId / documentId / revision` 运行方式。
- `tool_documents`、`tool_document_revisions`、`tool_usage_events` 设计与第一批实现已经存在。
- `billing-entitlements` 契约与 `payment-integration` 第一版实现已经进入 `server/application/billing/*`。

### 当前仍在进行中的主线

- 真正与产品操作挂钩的积分扣减
- 第二个工具的接入
- 全局服务设计助手与多工具推荐
- 前端设计 DEMO 的独立探索与后续回接

### 当前主要风险

- `src/styles.css` 仍然偏大，样式边界还没有完全收进 design-system。
- Billing 集成虽然已完成第一轮绑定加固，但离真实微信/支付宝接入仍有距离。
- CloudBase 认证、文档、AI、支付四条链路都已成形，但还没有统一的端到端产品闭环。

## 2. 架构原则

1. 采用模块化单体，不在 MVP 阶段拆微服务。
2. 按技术与数据所有权拆模块，不按页面拆模块。
3. 工具是插件式领域模块，共享运行时，不复制一套应用。
4. 领域模型不依赖 React、CloudBase、模型供应商或支付供应商。
5. AI 只能通过应用层命令读取和修改工具文档，不直接操作 UI 或数据库。
6. 余额与用量使用不可变积分账本，不能只维护一个可直接覆盖的积分余额。
7. 支付成功以服务端验签回调为准，前端跳转结果不作为入账依据。
8. 所有外部副作用必须支持幂等、重试和审计。
9. 计费配置与成本查看通过轻量后台页管理，数据库只作为正式数据源，不作为人工操作界面。

## 3. 当前代码结构

```text
src/
  app/                  # 应用壳、页面切换、顶部栏、组件库装配
  application/          # 前端工具运行时用例
  design-system/        # 主题、Recipe、FieldLabel、组件库页
  domain/               # 纯 TypeScript 领域契约
  features/
    account/            # 账号页与用户态认证边界
    admin/              # 轻量后台页与内部配置管理
    assistant/          # Journey Assistant 面板与协议
    billing/            # 前端计费展示预留
  infrastructure/
    cloudbase/
      auth/             # CloudBase Web auth 适配器
      tool-documents/   # 文档 API 客户端
  tools/
    registry.ts         # 工具注册表
    journey-map/        # Journey 工具模块与页面层

server/
  application/
    assistant/          # Journey Assistant 服务编排
    billing/            # 订单、账本、支付编排
    tool-documents.cjs  # 文档、项目、revision、usage event 服务
  infrastructure/
    cloudbase/
      auth/
      tool-documents/
    payments/

api/
  journey-chat.js
  tool-documents.js

skills/
  journey-map-editor/   # 当前已接入的工具级 Skill
```

前后端仍然作为一个仓库内的模块化单体维护，这个选择目前仍然成立。

## 4. 核心跨模块契约

### 4.1 工具定义

每个工具只通过统一契约接入平台：

```ts
type ToolDefinition<TDocument, TCommand> = {
  metadata: ToolMetadata
  documentVersion: number
  createInitialDocument(input: unknown): TDocument
  validateDocument(input: unknown): TDocument
  applyCommand(document: TDocument, command: TCommand): TDocument
  exports: ExportAdapter<TDocument>[]
  ai: {
    skillId: string
    context(document: TDocument): unknown
    parseProposal(input: unknown): TCommand[]
  }
}
```

UI 编辑器是工具模块的可选展示层，但文档校验、命令执行、迁移和导出不能依赖 UI。

### 4.2 项目与工具文档

```ts
type Project = {
  id: string
  ownerId: string
  name: string
  createdAt: string
  updatedAt: string
}

type ToolDocument<T = unknown> = {
  id: string
  projectId: string
  toolId: string
  schemaVersion: number
  revision: number
  title: string
  content: T
  createdAt: string
  updatedAt: string
}
```

保存时使用 `revision` 做乐观锁，避免多窗口和 AI 更新覆盖用户修改。

当前实现补充：

- `Project` 已进入正式运行链路，不再依赖固定 DEMO `projectId`
- Journey 页面会优先恢复当前项目下的正式文档
- 当项目存在但工具文档不存在时，由服务端创建默认文档

### 4.3 AI 上下文与动作

AI 分两层：

- 全局 Skill/记忆：服务设计概念、工具目录、工具选择、项目摘要和跨工具关系。
- 工具 Skill/记忆：单个工具的字段语义、编辑规则、澄清策略和结构化命令协议。

统一请求：

```ts
type AssistantRequest = {
  scope: "global" | "tool"
  projectId?: string
  documentId?: string
  toolId?: string
  messages: AssistantMessage[]
  attachmentRefs?: string[]
}
```

统一响应只允许：

- `message`：解释或指导。
- `clarify`：询问必要信息。
- `commands`：结构化修改提案，用户确认后执行。
- `recommend_tools`：推荐工具或工具链。

Skill 必须有 `id`、`version` 和兼容的响应 Schema。数据库只保存 Skill 引用、对话摘要和必要业务记忆，不把未经筛选的全部聊天永久塞进提示词。

### 4.4 积分与账本

不要直接使用 `user.availableCredits -= amount` 这种可变余额覆盖写法。建议模型：

```ts
type CreditLedgerEntry = {
  id: string
  accountId: string
  delta: number
  operation:
    | "purchase"
    | "grant"
    | "reserve"
    | "commit"
    | "release"
    | "refund"
    | "adjustment"
    | "expire"
  referenceType: "order" | "ai_run" | "admin"
  referenceId: string
  idempotencyKey: string
  credits: number
  availableDelta: number
  reservedDelta: number
  consumedDelta: number
  createdAt: string
}
```

一次 AI 付费动作采用：

1. 服务端鉴权并检查额度。
2. 创建 `ai_run` 和积分预占。
3. 调用模型。
4. 成功且返回合法结果后提交扣减。
5. 超时或失败时释放预占。

同一个 `idempotencyKey` 只能产生一次积分变更。是否对“仅澄清”扣积分需要作为明确产品规则配置，不能散落在代码条件中。底层模型、动作扣分和积分售价都必须保持配置化，而不是写死在页面或服务中。

### 4.5 支付

统一支付端口：

```ts
interface PaymentProvider {
  createPayment(order: Order): Promise<PaymentIntent>
  verifyCallback(request: RawCallback): Promise<VerifiedPaymentEvent>
  queryPayment(providerOrderId: string): Promise<PaymentStatus>
  refundPayment(input: RefundRequest): Promise<RefundResult>
}
```

微信支付和支付宝分别实现适配器。当前仓库里已经有：

- `server/application/billing/index.cjs`：订单、reservation、ledger 契约
- `server/application/billing/payment-integration.cjs`：支付意图、回调、查单、退款编排
- `server/infrastructure/payments/provider-interface.cjs`
- `server/infrastructure/payments/manual-provider.cjs`

订单状态只能按允许的状态机迁移：

`created -> pending -> paid -> fulfilled`

并支持 `closed`、`refund_pending`、`refunded`。支付回调、订单入账和额度发放必须在事务或等价原子流程中幂等完成。

## 5. CloudBase 使用边界

当前项目已经实装或明确落位到 CloudBase 的能力包括：

- 邮箱 / 手机号 OTP 登录与用户态会话
- Journey 文档、revision、usage event 的正式 API
- 浏览器端 CloudBase Web SDK 适配
- 服务端验证 access token 的适配器

后续仍计划优先复用 CloudBase：

- 项目、文档、订单与账本数据
- 支付回调承载环境
- 对象存储附件
- 数据库事务
- 轻量后台页所需的配置与统计数据

约束：

- 前端只能使用用户态 SDK 和最小权限规则。
- 支付密钥、模型密钥和 Admin 能力只存在服务端。
- 业务代码依赖自有 `AuthPort`、`DocumentRepository`、`LedgerRepository` 等端口，不在领域和 UI 中散布 CloudBase SDK 调用。
- 工具内容作为正式业务数据进入文档与 revision 集合；行为埋点单独进入 usage event 集合，不复制完整内容到 event。
- 具体能力盘点与已验证事实见 [cloudbase-capabilities.md](D:\knowledge\codex\design\docs\cloudbase-capabilities.md)。

## 6. 模块边界

模块数量控制为 6 个：

| 模块 | 责任边界 | 主要依赖 |
|---|---|---|
| `platform-shell` | 应用壳、路由、设计系统、通用交互组件 | 无 |
| `tool-runtime` | 领域模型、工具注册、文档命令、版本迁移、导出协议 | 无 |
| `ai-orchestration` | 工具级 AI 协议、上下文构建、Journey Assistant 服务 | `tool-runtime` |
| `identity-cloudbase` | 登录、会话、用户态认证边界、服务端 token 校验 | 无 |
| `billing-entitlements` | 商品、订单、微信/支付宝适配、额度预占与账本 | `identity-cloudbase` |
| `persistence-backend` | 项目/文档仓储、API/BFF、revision、usage event | `tool-runtime`, `identity-cloudbase` |

`platform-shell` 不持有业务数据规则；`billing-entitlements` 不调用前端状态；`ai-orchestration` 不直接写数据库。

## 7. 阶段进度

### Phase 0：设计基线与架构护栏

- 保留当前 DEMO 的信息结构与关键交互，但不把现有视觉作为新规范。
- 以 Chakra UI v3 的默认设计体系、Token 和 Recipe 为基础，少量定制品牌与工作台组件。
- 在 `/components` 完成明暗主题和组件状态验收。
- 固化上述契约和架构决策记录。
- 建立 lint、format、单元测试和最小端到端测试。
- 为现有 JourneyMap 数据补运行时 Schema 和样例测试。
- 状态：已完成

### Phase 1：无行为变化地拆 DEMO

- 从 `App.tsx` 提取领域类型、Journey Map 工具模块、AI feature、导出适配器和设计系统。
- 保留现有 UI 和 GLM 行为，不同时重写交互。
- 建立工具注册表，让当前用户旅程图成为第一个正式工具。

- 状态：已完成

### Phase 2：账号与持久化

- 接入 CloudBase 邮箱登录。
- 增加项目、工具文档、自动保存、revision 乐观锁和文档版本。
- 增加工具内容快照 `tool_document_revisions` 和基础使用事件 `tool_usage_events`。
- 上传截图改为对象存储引用，避免长期保存 base64。

- 状态：大部分已完成，仍缺完整端到端产品闭环与附件存储正式接线

### Phase 3：积分与支付

- 先实现商品、订单、额度账本、预占/提交/释放流程和后台补偿任务。
- 再接微信支付与支付宝，完成回调验签、幂等入账、查单和退款。
- 建立用户可见的订单与用量明细。

- 状态：进行中。积分领域契约、payment integration 与第一轮绑定加固已落地，真实支付接入、正式持久化仓储与 AI 积分联动未完成。

### Phase 4：全局助手与第二个工具

- 实现全局服务设计 Skill、工具推荐和项目级摘要记忆。
- 使用同一 ToolDefinition 契约接入 Personas，验证架构确实支持多工具。
- 支持 Journey Map 结构化产物作为下游工具输入。

- 状态：未开始

### 前端 DEMO 探索

- 已新增独立交接文档 `docs/frontend-demo-handoff.md`
- 约束外部前端设计工作必须先在独立分支上进行探索
- 后续回接原则不是整分支合并，而是按提交与模块边界筛选吸收

- 状态：进行中

## 8. MVP 验收线

- 新增工具不需要修改平台核心状态结构。
- 工具文档可创建、保存、恢复、迁移和导出。
- AI 的每次修改都有结构化提案、用户确认和审计记录。
- 用户生成内容可按 document revision 追溯，工具使用次数可按 usage event 统计。
- 登录态和数据权限由服务端验证。
- 同一支付回调重复到达不会重复发放积分。
- 同一 AI 请求重试不会重复扣积分。
- 订单、额度和用量可以对账。
- Journey Map 和第二个工具至少共享项目上下文，但保持各自 Skill 与领域模型独立。

## 9. 模块 Git 交付规范

- 模块完成一个可审查工作单元后，必须先执行构建、测试或适用的静态检查。
- 开始任务前先创建独立分支，禁止多个模块直接在同一条开发分支上混做。
- 验证通过后，只暂存该模块本轮实际修改的文件，并创建本地 Git commit。
- 禁止使用 `git add .`、`git add -A` 等可能混入其他模块或用户改动的命令。
- 提交前检查 `git diff --cached`，确认没有无关文件、密钥、构建产物或其他模块改动。
- commit message 使用模块前缀，例如 `feat(platform-shell): establish chakra theme`。
- `roundtable_submit` 必须记录 commit hash 和验证结果。
- “提交本地 Git”不代表推送远端；只有项目主持人或用户明确要求时才执行 `git push`。
- 模块不得回滚、覆盖或顺带整理其他模块及用户已有的未提交改动。
