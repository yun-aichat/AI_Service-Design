# 项目进度核验

更新日期：2026-06-14

## 1. 总体结论

项目当前是一个可以构建、测试和本地运行的模块化单体，Journey Map 已经是正式工具模块，账号、AI、文档、积分和支付编排都有清晰的代码边界。

但“有领域代码”不等于“产品闭环已接通”。当前最准确的判断是：

- 工具运行时、Journey 编辑器和导出链路稳定。
- CloudBase 前端认证与服务端 token 校验契约已建立。
- 积分领域模型、账本、预占和支付编排已通过单元测试。
- 积分配置 API 与 CloudBase repository 已实现。
- 正式 CloudBase 文档持久化、AI 积分结算、轻量后台和真实支付仍未接通。

## 2. Git 恢复状态

原 `.git` 元数据在 2026-06-14 丢失，且没有远端对象库可供恢复。源码工作树没有丢失，当前已经从完整源码快照重建仓库。

当前状态：

- 恢复基线提交：`44fe4ad`
- 当前分支：`codex/billing-entitlements-credits`
- 活动分支：
  - `main`
  - `codex/billing-entitlements-credits`
  - `codex/persistence-backend-credit-config`
- 恢复标签：`recovery/source-snapshot-20260614`
- `core.longpaths=true`，用于兼容 Codex 自动生成的长路径内部引用
- 当前没有配置远端仓库

这三条分支目前都指向同一个恢复提交，尚未形成新的独立提交。后续每个模块必须在自己的分支上提交，不能再次混用工作区。

恢复过程和已知历史 commit 列表见 [git-recovery-2026-06-14.md](D:\knowledge\codex\design\docs\git-recovery-2026-06-14.md)。

## 3. 已验证能力

### 平台与 Journey

- 应用壳、组件库和主题基础已拆分。
- Journey Map 已注册到正式工具运行时。
- Journey 文档结构、命令、迁移和导出协议已建立。
- Markdown、JSON、CSV、SVG 和打印导出测试通过。
- `clarify -> proposal -> confirm` 行为保持稳定。

### 账号认证

- `/account` 页面已挂载。
- CloudBase Web SDK 认证适配器已实现。
- 邮箱和手机号 OTP 契约测试通过。
- 服务端 access token 校验测试通过。

### 积分与支付领域

- `CreditPackage`
- `CreditAccount`
- `CreditLedgerEntry`
- `CreditReservation`
- `purchase / grant / reserve / commit / release / refund / adjustment / expire`
- 订单状态机和支付 provider interface
- 支付意图、回调、查单和退款编排
- provider、referenceId、providerPaymentId 绑定校验

### 积分配置

已实现配置服务和 CloudBase repository：

- `credit_packages`
- `ai_action_pricing`
- `ai_model_policies`
- `credit_ledger`
- `ai_usage_events`

已具备配置读取、管理员写入、分页、过滤和审计字段的服务契约。

## 4. 真实缺口

### P0：正式持久化宿主未接通

`api/tool-documents.js` 当前仍使用 `InMemoryToolDocumentRepository`。虽然 CloudBase repository 已经实现并测试，但没有在正式 API 宿主中实例化。

影响：

- 服务实例重启后项目、文档、revision 和 usage event 会丢失。
- 当前不能把 Journey 描述为“已正式持久化到 CloudBase”。

### P0：积分配置 API 缺少 CloudBase 服务端初始化

`api/billing-config.js` 会尝试读取 `globalThis.__cloudbaseDatabase`、`tcb.database()` 或 `cloudbase.database()`，但当前部署入口没有初始化这些对象，也没有服务端 CloudBase SDK 依赖。

影响：

- 默认部署环境下 `/api/billing-config` 会返回 `CLOUDBASE_DATABASE_UNAVAILABLE`。

### P0：AI 尚未接入积分结算

当前 assistant 请求没有正式的 `actionKey / tierKey` 计费上下文，也没有：

- 查询动作积分价格
- `reserveCredits`
- 成功后的 `commitCredits`
- 失败后的 `releaseCredits`
- 余额不足处理

手动编辑目前不会扣积分，这符合产品规则；AI 调用也暂时没有真实扣积分。

### P1：token 成本尚未记录

GLM provider 只返回内容、原始响应和模型名，没有统一提取：

- input tokens
- output tokens
- 模型单价快照
- estimated cost
- charged credits
- estimated margin

因此当前还无法形成可靠的成本和毛利看板。

### P1：轻量后台尚未实现

后端配置服务已经存在，但没有：

- `/admin/billing/packages`
- `/admin/billing/pricing`
- `/admin/billing/model-policies`
- `/admin/billing/ledger`
- `/admin/billing/costs`

也没有前端 API client 和后台路由。

### P1：Billing 存在双配置源风险

正式 billing service 自己维护 `CreditPackage` repository；`billing-config` 又单独维护 `credit_packages` 集合。

在继续开发前必须明确唯一数据源，建议让 billing service 读取同一份正式配置 repository，后台只通过应用服务修改它。

### P2：真实支付与多工具仍未完成

- 微信支付和支付宝正式 provider 尚未实现。
- 第二个工具尚未注册。
- 全局服务设计助手、工具推荐和多工具项目摘要尚未实现。

## 5. 验证结果

2026-06-14 重新执行：

- Billing、配置、支付测试：26/26
- 文档持久化与 assistant 测试：16/16
- Journey 与 tool-runtime 测试：22/22
- CloudBase 浏览器认证测试：7/7
- 服务端 token 校验测试：3/3
- 总计：74/74
- `npm run build`：通过
- `/`、`/components`、`/account`：本地 HTTP 200

现存非阻塞警告：

- Vite CJS Node API 弃用提示
- 主 JS chunk 约 1.28 MB，尚未代码分割

## 6. 推荐推进顺序

1. `persistence-backend`：把 tool documents 正式宿主切到 CloudBase repository。
2. `billing-entitlements`：统一积分商品和账本的正式 repository，消除双配置源。
3. `ai-orchestration`：接入动作定价、模型策略和积分预占/提交/释放。
4. `analytics-cost`：提取 token usage，记录成本、积分收入和毛利快照。
5. `admin-console`：基于正式接口实现轻量后台。
6. `payment-integration`：接微信/支付宝正式 provider。
7. 第二工具和全局助手在上述产品闭环稳定后继续。

## 7. 当前可对外表述

> 项目已完成模块化架构、Journey Map 正式工具、CloudBase 认证契约、AI 提案流程以及积分/支付领域模型。全部现有测试与构建通过。下一阶段重点不是继续扩页面，而是把 CloudBase 正式持久化、AI 积分结算、token 成本记录和轻量后台接成真实产品闭环。
