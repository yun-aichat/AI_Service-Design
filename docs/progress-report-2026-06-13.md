# 项目进度汇报

更新日期：2026-06-13

## 一、当前总体结论

项目已经完成从单个 Journey DEMO 向“可扩展的模块化工具平台”转型的第一阶段。

现在的状态不是“只有一个页面原型”，而是已经具备：

- 正式工具运行时
- 第一个正式工具 Journey Map
- AI 协作链路
- CloudBase 账号与文档持久化基础
- revision / usage event 基础审计链路
- billing / entitlements 领域契约与支付编排第一版

当前最适合的判断是：

- **基础架构已经站住**
- **核心后端主链已基本串通**
- **产品级完整闭环还差支付、积分闭环、轻量后台和第二个工具**
- **前端体验可以继续独立探索，但需要按当前架构回接**

## 二、已完成进度

### 1. 平台与工具架构

已完成：

- `src/app/*` 应用壳拆分完成
- `src/design-system/*` 设计系统基础已建立
- `src/domain/*`、`src/application/*` 的工具运行时契约已建立
- `src/tools/registry.ts` 已启用正式工具注册
- `journey-map` 已成为第一条正式工具注册项

结果：

- 项目不再依赖单文件 `App.tsx` 承载全部逻辑
- 后续第二个工具接入已经有明确边界

### 2. Journey Map 工具

已完成：

- Journey 编辑器拆分到 `src/tools/journey-map/*`
- 正式工具文档、命令、导出逻辑已独立
- Markdown / JSON / CSV / SVG / 打印导出可用
- Journey baseline / tool-runtime / journey tool 测试已建立

结果：

- Journey 已经从 DEMO 页面升级为正式工具模块
- 后续可作为多工具平台的第一个基线

### 3. AI 协作链路

已完成：

- `src/features/assistant/*` 已拆分
- `server/application/assistant/*` 已建立服务端编排
- Journey assistant 已改为正式 document / project / revision 协议
- 当前行为已经固定：
  - `clarify` 只提问
  - `proposal` 只给候选修改
  - 用户确认后才应用
  - “继续调整”只回填输入框

结果：

- AI 已不再是 demo 级临时交互，而是正式产品链路的一部分

### 4. 账号与 CloudBase

已完成：

- `/account` 页面已存在
- CloudBase Web 认证适配已接入前端
- CloudBase 能力盘点文档已形成
- 服务端 access token 校验适配已存在

结果：

- 账号体系已经有正式落点
- 后续用户态与服务端权限边界可以继续沿现结构推进

### 5. 文档持久化与数据链路

已完成：

- `tool_documents`
- `tool_document_revisions`
- `tool_usage_events`
- Journey 已切换到正式的 `projectId / documentId / revision` 运行方式
- `api/tool-documents.js` 已进入正式宿主入口

结果：

- 当前工具内容不再只是内存态
- 已具备后续项目管理、版本追溯、使用统计的基础

### 6. Billing / Entitlements

已完成：

- 订单状态机、ledger、reservation 契约已建立
- provider interface 已建立
- manual provider 骨架已建立
- `payment-integration.cjs` 已建立支付编排第一版
- 最新 `8ab6f45` 已通过审核，完成第一轮绑定加固：
  - payment intent 必须属于当前订单
  - callback / query 不会重绑 `providerOrderId`
  - refund query 不会串单

结果：

- 计费体系已经从“概念设计”进入“可验证的服务端实现”
- 但仍未接通真实支付、真实积分闭环和轻量后台管理

## 三、当前未完成项

### 1. 支付与计费闭环

还未完成：

- 真实微信支付 / 支付宝适配器
- 积分扣减与真实产品动作挂钩
- 订单 / 用量前端展示页
- 更完整的退款与对账模型

### 2. 轻量后台

还未完成：

- 积分商品管理页
- 动作定价管理页
- 模型策略管理页
- 成本 / 毛利查看页

### 3. 第二个工具

还未完成：

- Personas / Stakeholder Map / Service Blueprint 等第二工具的正式接入

### 4. 全局助手

还未完成：

- 全局服务设计 Skill
- 工具推荐
- 多工具项目级摘要

### 5. 前端产品化体验

还未完成：

- 更成熟的工作台级页面体验
- 项目列表 / 项目概览页
- 工具入口页
- 账号 / 订阅 / 用量页的正式产品层

## 四、当前风险

### 1. 前端仍有样式与设计系统收口压力

当前 `src/styles.css` 仍然偏大，说明样式边界还没有完全沉入 design-system。

影响：

- 后续多人并行改前端时，仍可能出现样式冲突或全局改动风险

### 2. 支付是“已成形但未实战”

当前 billing 代码已经通过本地测试，但还没有真实支付网关接入。

影响：

- 现在可以说“支付编排结构正确”
- 还不能说“支付功能已完成”

### 3. 目前仓库工作区处于前端探索分支，并且存在未提交改动

当前分支是：

- `feat/coss-native-lab`

并且工作区存在一批前端设计与文档相关未提交改动。

影响：

- 后续继续推进前端设计时，必须维持“独立探索分支 -> 回来后筛选吸收”的策略
- 不能直接把当前探索态当作主项目稳定基线

## 五、接下来建议顺序

建议按这个顺序继续推进：

### P1. 收口支付与积分体系

目标：

- 把 billing 从“通过测试的服务端模块”推进到“可接真实产品动作”

优先项：

- 积分扣减规则
- 计费触发点
- 订单 / 用量展示页
- 轻量后台配置页

### P2. 完成 Journey 的产品闭环

目标：

- Journey 真正达到“登录后可用、可保存、可追溯、可记账”

### P3. 推进前端 DEMO 独立探索

目标：

- 在独立分支上继续深化工作台、项目页、工具入口、账号/订阅页体验

约束：

- 只做探索与沉淀
- 等后续按模块边界筛选回接

### P4. 接第二个工具

目标：

- 验证当前架构不是只适配 Journey

## 六、当前建议对外汇报口径

如果你要对外或对团队汇报，建议直接这样说：

> 当前项目已完成第一阶段架构化改造。Journey Map 已经成为第一个正式工具，并且具备 AI 协作、正式文档持久化、revision 和 usage event 基础链路。账号体系和 billing / entitlements 也已经进入正式代码结构，支付编排第一版及绑定校验已通过审核。下一阶段重点是把 Journey 做成完整产品闭环，并继续推进真实计费、第二个工具和前端产品化体验。

## 七、相关文档

- [README.md](D:\knowledge\codex\design\README.md)
- [docs/project-architecture.md](D:\knowledge\codex\design\docs\project-architecture.md)
- [docs/product-plan.md](D:\knowledge\codex\design\docs\product-plan.md)
- [docs/journey-map-tool.md](D:\knowledge\codex\design\docs\journey-map-tool.md)
- [docs/tool-runtime-contracts.md](D:\knowledge\codex\design\docs\tool-runtime-contracts.md)
- [docs/analytics-design.md](D:\knowledge\codex\design\docs\analytics-design.md)
- [docs/billing-design.md](D:\knowledge\codex\design\docs\billing-design.md)
- [docs/frontend-demo-handoff.md](D:\knowledge\codex\design\docs\frontend-demo-handoff.md)
