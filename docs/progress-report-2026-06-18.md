# 项目进度核验

更新日期：2026-06-18

## 1. 总体结论

当前仓库已经完成第一阶段核心业务闭环的大部分主链路，不再只是“模块化后待接通”的中间态。

截至当前 `main` 分支，最准确的判断是：

- Journey Map 已经是正式工具，并具备保存、恢复、revision、导出和 AI 提案流程。
- CloudBase 账号与服务端 token 校验链路已接通。
- Journey 的项目、文档、revision、usage event 已切到正式 CloudBase 宿主。
- 用户侧 Billing 页面已接上正式 API 链路。
- 管理侧 usage / cost / ledger 读取链路已接通。
- Journey assistant 已接入正式 AI 积分预占、提交和释放。
- AI usage event 已补齐 `status / billingStatus / chargedCredits` 语义。

当前阶段已经不再缺“正式持久化宿主”和“AI 积分结算主链”，剩余重点转向：

- token 成本与毛利记录
- 更完整的计费后台写入与配置管理
- 真实微信/支付宝 provider
- 第二个工具
- 全局服务设计助手

## 2. 当前 Git 与协作状态

- 当前主线分支：`main`
- 远端主线：`origin/main`
- 当前仓库使用 Roundtable Lite 作为唯一活跃协作状态
- 当前 Roundtable Lite 统计：
  - `completed=22`
  - `cancelled=22`
  - `queued=0`
  - `in_progress=0`
  - `review=0`
  - `changes_requested=0`

最近完成的关键任务包括：

1. `切换 Tool Documents 正式宿主到 CloudBase`
2. `Resume Frontend Billing from archive snapshot`
3. `Admin Console access and usage data fixes`
4. `Formal AI billing settlement for Journey assistant`
5. `Record assistant usage billing settlement fields`
6. `Add Roundtable Lite dashboard route and generated project snapshot`

## 3. 已完成能力

### 平台与工具运行时

- Journey Map 已注册为正式工具。
- Journey 页面、AI 面板、账号页、Billing 页与 Roundtable Lite 页都已具备独立入口。
- 组件系统、设计 Token 单一真源、`/components` 验收页已经建立。

### 账号认证

- `/account` 已挂载。
- CloudBase Web SDK 认证适配器可用。
- 服务端 access token 校验命中正式 CloudBase 网关链路。

### 正式持久化

- `tool-documents` 正式宿主已切到 CloudBase repository。
- Journey 的项目、文档、revision、usage event 不再停留在进程内 repository。
- `journey-chat` 已通过正式 `toolDocumentService` 取持久化服务。

补充备注：

- 当前“正式持久化已接通”只代表服务端正式宿主、仓储与 API 边界已经建立，不代表本地验收宿主与刷新恢复体验已经完全收口。
- 近期本地验收暴露出两个仍需后续开发重点核对的问题：
  - Journey 首页在 `127.0.0.1:4173` 等验收宿主下仍可能出现“持久化请求失败”，说明本地宿主接线、匿名验收模式或假 CloudBase 数据准备仍不稳定。
  - Journey 编辑内容当前主要保存在前端内存 state；若未成功点击“保存”并完成远端写入，刷新后会回到默认内容或上次成功保存内容。当前未提供 `localStorage` / IndexedDB 级别的本地草稿恢复兜底。
- 因此，现阶段不能把 Journey 编辑体验表述为“刷新后天然稳态恢复”或“本地验收宿主已完全等价正式环境”。后续开发时需要继续补：
  - 首页初始化上下文稳定读取
  - 点击保存后的刷新恢复验收
  - 失败场景下的本地草稿缓存与恢复策略

### Billing 与后台读链路

- 用户侧 `/billing` 可读取余额、套餐与账本分页。
- 管理侧 usage / cost / ledger 读取链路已恢复。
- `billing-config` 已支持积分商品、动作定价、模型策略和 usage event 查询。

### AI 积分结算

- Journey assistant 已接上正式动作定价读取。
- 每次 AI 生成会先创建新的 `ai_run` 和积分预占。
- `proposal` 成功时提交扣减。
- `clarify`、error、timeout 时释放预占。
- 重试按新的 AI 生成处理，不复用旧 run。

### AI usage 事件

- usage event 已记录：
  - `status`
  - `billingStatus`
  - `chargedCredits`
  - `toolKey / actionKey / tierKey`
- 已支持 `billingStatus` 过滤。
- 已避免“失败/取消但仍记账”的矛盾状态。

## 4. 仍然存在的缺口

### P1：token 成本与毛利快照未完成

当前已具备积分扣减和 usage event，但仍缺更完整的：

- input/output token 统一成本快照
- 模型单价快照
- estimated cost
- estimated margin / gross margin

### P1：轻量后台仍偏读取侧

当前后台主要是读取与核对链路恢复，仍缺：

- 更完整的配置写入能力
- 更稳定的管理工作流
- 套餐、动作定价、模型策略的后台管理收口

### P1：Journey 持久化体验仍未完全产品化

当前已经具备正式 `tool-documents` 宿主与 revision / usage event 能力，但用户侧编辑体验仍有未完成项：

- 首页上下文读取在本地验收宿主中仍存在不稳定情况
- 编辑后刷新恢复依赖“已成功远端保存”，没有本地草稿兜底
- 未保存改动在刷新、服务异常或本地宿主接线不稳时容易丢失

这部分应归类为后续产品化开发项，而不是视为“已有正式持久化宿主”即可自动完成。

### P2：真实支付 provider 未接入

- 微信支付正式适配器未完成
- 支付宝正式适配器未完成
- 对账与退款完整产品闭环未完成

### P2：多工具阶段未恢复

- 第二个工具尚未正式接入
- 全局服务设计助手与工具推荐未恢复推进

## 5. 当前可对外表述

> 项目当前已经完成 Journey Map 正式工具化、CloudBase 账号与正式文档持久化、用户侧 Billing 页面、轻量后台读链路，以及 Journey assistant 的正式 AI 积分结算闭环。当前主线重点已从“是否接通基础链路”转向“成本统计、支付 provider、多工具扩展与全局助手”。

## 6. 推荐下一阶段顺序

1. 补齐 token 成本、估算成本和毛利记录
2. 完成轻量后台的配置写入与管理收口
3. 接入真实微信/支付宝 provider
4. 恢复第二个工具接入
5. 恢复全局服务设计助手与工具推荐
