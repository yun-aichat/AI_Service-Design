# 工具内容与使用数据方案

更新日期：2026-06-08

## 目标

本方案定义两类数据的统一存储与采集方式：

- 用户生成的工具内容；
- 工具被用户使用的次数与关键行为。

目标不是做一套独立的大数据平台，而是在现阶段直接基于 CloudBase 建立稳定、可审计、可扩展的数据基础，满足以下场景：

- 用户自己的项目与工具内容存取；
- 按用户、项目、工具统计使用次数；
- 后续接入扣次、支付、后台报表和运营分析；
- 为 AI 修改、导出和确认操作提供可追踪记录。

## 设计原则

1. 工具内容属于正式业务数据，不属于普通埋点日志。
2. 行为埋点记录“发生了什么”，不复制完整文档内容。
3. 同一业务动作只保留一个事实来源，避免多处重复写入。
4. 统计口径以服务端事件为准，不以前端点击数为准。
5. 内容版本、使用事件、额度扣减和支付记录必须可以对账。
6. 后续如需做内容分析，优先基于 revision 或摘要，不直接把原文塞进 event。

## 推荐存储位置

当前阶段统一放在 CloudBase。

- 正式文档和版本历史：CloudBase 业务数据库
- 使用事件：CloudBase 业务数据库
- 聚合统计：先放 CloudBase，同库异表
- 导出文件或大附件：CloudBase 对象存储

这样做的原因：

- 账号、项目、文档、支付和扣次最终都在同一个平台里，权限与审计边界清楚；
- 当前体量不需要额外引入独立分析系统；
- 后续管理后台、对账、报表和用户自助查询都可以直接复用现有身份体系。

## 数据分层

### 1. 当前文档

集合：`tool_documents`

职责：

- 保存每个工具文档的当前最新版本；
- 作为用户打开、继续编辑、导出时的主读取来源。

建议字段：

```ts
type ToolDocumentRecord = {
  id: string
  projectId: string
  ownerId: string
  toolId: string
  title: string
  schemaVersion: number
  revision: number
  content: unknown
  createdAt: string
  updatedAt: string
}
```

说明：

- `content` 保存完整工具内容；
- `revision` 用于乐观锁；
- 这是“当前状态表”，不是历史表。

当前状态：

- Journey Map 已经实际通过这张表保存和恢复
- 页面侧不再依赖固定 DEMO `documentId`

### 2. 文档版本历史

集合：`tool_document_revisions`

职责：

- 保存每次确认后产生的文档快照；
- 支持“用户生成过什么内容”的查询；
- 为 AI 修改审计、回滚和内容分析提供来源。

建议字段：

```ts
type ToolDocumentRevisionRecord = {
  id: string
  documentId: string
  projectId: string
  ownerId: string
  toolId: string
  revision: number
  source: "manual" | "ai_proposal" | "import" | "migration" | "system"
  actorId: string | null
  commandId: string | null
  content: unknown
  summary: string | null
  createdAt: string
}
```

说明：

- `content` 仍然保存完整快照；
- `summary` 是可选字段，后续需要后台快速预览时再填，不作为主数据源；
- 版本历史不应被事件埋点替代。

当前状态：

- Journey proposal 应用与保存后会生成 revision 快照

### 3. 使用事件

集合：`tool_usage_events`

职责：

- 记录用户是否使用了某个工具，以及使用到了什么程度；
- 提供次数统计、漏斗、活跃度、导出量和 AI 使用量等分析基础。

建议字段：

```ts
type ToolUsageEvent = {
  id: string
  userId: string
  projectId: string | null
  documentId: string | null
  toolId: string
  eventType:
    | "tool_opened"
    | "tool_saved"
    | "tool_edited"
    | "proposal_applied"
    | "ai_generated"
    | "exported"
    | "document_created"
  eventSource: "web" | "server" | "system"
  revision: number | null
  exportFormat: "md" | "json" | "csv" | "svg" | "pdf" | null
  sessionId: string | null
  idempotencyKey: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
```

说明：

- 事件里不保存完整 `content`；
- `metadata` 只放轻量上下文，例如导出格式、AI 模型、是否有附件、行列规模等；
- `idempotencyKey` 用于防重复记数。

当前状态：

- `proposal_applied`
- `exported`
- `tool_saved`
- `ai_generated`

这几类事件已经具备第一版接入点，其中 metadata 仍坚持轻量脱敏，不保存完整长文本。

### 4. 日聚合统计

集合：`tool_usage_daily`

职责：

- 为管理后台和报表提供便宜查询；
- 避免每次统计都扫全量事件。

建议字段：

```ts
type ToolUsageDaily = {
  id: string
  date: string
  toolId: string
  userId: string | null
  openedCount: number
  savedCount: number
  editedCount: number
  proposalAppliedCount: number
  aiGeneratedCount: number
  exportCount: number
  createdAt: string
  updatedAt: string
}
```

说明：

- 这张表不是第一阶段必须实现；
- 可以先只落原始 `events`，后续再由定时任务或服务端聚合生成。

## 事件采集口径

建议最小事件集合：

- `document_created`
  新建文档成功
- `tool_opened`
  用户打开并进入工具工作台
- `tool_saved`
  文档成功持久化
- `tool_edited`
  用户确认一次有效编辑并成功保存
- `ai_generated`
  AI 返回合法提案或生成结果
- `proposal_applied`
  用户点击确认并成功应用 AI 提案
- `exported`
  成功导出一次文件

口径说明：

- “工具被使用的次数”建议默认以 `tool_opened` 和 `tool_saved` 为基础看两个口径：
  - 访问口径：打开过多少次；
  - 有效使用口径：成功保存或确认修改过多少次。
- 如果后面涉及扣次，真正的计费口径仍然应由 `billing-entitlements` 的账本决定，不能直接拿埋点次数扣费。

## 接入点设计

### 前端

前端只负责触发轻量事件，不负责决定最终统计结果。

建议触发点：

- 进入某工具页面后上报 `tool_opened`
- 用户点击导出并成功生成导出内容后上报 `exported`
- 用户点击确认应用 AI 提案后请求服务端记录 `proposal_applied`

前端不应该：

- 直接写入聚合表；
- 直接把完整工具内容作为埋点 payload 发出去；
- 自己维护次数统计。

### 服务端 / 持久化层

服务端负责：

- 保存 `tool_documents`
- 生成 `tool_document_revisions`
- 记录 `tool_usage_events`
- 保证事件与业务写入的顺序一致

推荐原则：

- 文档保存成功后再写 `tool_saved`
- AI proposal 应用成功并产生新 revision 后，同时写 revision 和 `proposal_applied`
- 导出成功后写 `exported`
- 如涉及计费，账本写入与业务事件应能通过 `referenceId` 或 `idempotencyKey` 对齐

## 权限与隐私边界

1. 普通用户只能读取自己的项目、文档和与自己相关的聚合数据。
2. `tool_document_revisions` 属于业务敏感数据，默认不对后台分析侧开放全文遍历。
3. `tool_usage_events` 允许后台按权限查询，但默认只包含轻量上下文。
4. 如后续需要内容分析、推荐或训练用途，必须额外定义脱敏、授权和保留策略。

## 与现有模块的关系

- `tool-runtime`
  定义文档结构、命令、revision 和导出协议，不负责埋点存储。
- `persistence-backend`
  负责文档、revision、usage event 的写入与查询，是本方案的主落点。
- `identity-cloudbase`
  提供 `userId`、权限边界和会话身份。
- `billing-entitlements`
  负责真正的扣次账本；埋点次数只做分析，不做计费事实来源。

## MVP 实现顺序

### 第一批

- 建立 `tool_documents`
- 建立 `tool_document_revisions`
- 建立 `tool_usage_events`
- 接入 `document_created`、`tool_saved`、`proposal_applied`、`exported`

状态：已完成大部分，Journey 已进入正式链路

### 第二批

- 增加 `tool_opened`
- 增加 `ai_generated`
- 为 usage event 增加基础查询接口

### 第三批

- 建立 `tool_usage_daily`
- 增加后台统计视图
- 增加内容摘要或脱敏分析能力

## 验收标准

- 用户每次成功保存文档后，都能在 `tool_document_revisions` 找到对应快照。
- 同一文档 revision 不会重复生成多条冲突快照。
- 成功导出、成功应用 proposal、成功保存都能在 `tool_usage_events` 找到对应事件。
- 事件记录不包含完整大文本内容。
- 按 `userId + toolId` 可以统计工具使用次数。
- 按 `documentId + revision` 可以关联文档快照、操作事件和后续账本记录。

## 不做的事

当前阶段不做：

- 独立数据仓库
- 前端本地离线埋点队列
- 实时流式分析
- 自动把所有用户内容复制到专门的 analytics 表
- 直接用 usage event 作为扣费依据
