# 服务设计工具箱

这是一个面向服务设计场景的多工具工作台。当前仓库已经从单文件 DEMO 进入模块化阶段，第一批正式落地的工具是用户旅程图 `journey-map`。

项目当前目标不是再继续堆 DEMO 页面，而是稳定三条主线：

- 工具运行时与工具注册；
- CloudBase 账号与文档持久化；
- AI 协助、使用事件与积分计费能力。

## 当前状态

截至 `2026-06-14`，仓库里已经存在这些能力：

- `journey-map` 已作为正式工具注册到 `src/tools/registry.ts`
- Journey 页面已经拆出 `src/tools/journey-map/*`
- AI 对话区已经拆出 `src/features/assistant/*`
- CloudBase 账号页已经落到 `/account`
- Journey 文档已经使用 `projectId / documentId / revision` 服务契约
- 已落地 `tool_documents`、`tool_document_revisions`、`tool_usage_events`
- 已有积分账本、预占、订单与 payment integration 第一版实现
- 已有积分商品、动作定价、模型策略与成本事件的配置服务

当前仍在进行中的事项：

- 把文档正式 API 宿主切换到 CloudBase repository
- AI 请求接入积分预占、提交和释放
- token 成本与毛利记录
- 轻量计费后台
- 真实微信/支付宝 provider
- 第二个工具接入
- 全局服务设计助手

## 本地运行

先复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

前端与 Journey Assistant 相关的最小环境变量：

```text
ZHIPU_API_KEY=your-zhipu-api-key
GLM_MODEL=glm-4.6v-flash
```

如果要联调 CloudBase 账号与文档接口，还需要补齐对应的 CloudBase Web SDK 配置。

启动开发环境：

```powershell
npm run dev
```

构建：

```powershell
npm run build
```

## 当前路由

- `/`：Journey Map 工具工作台
- `/components`：设计系统与组件验收页
- `/account`：CloudBase 账号认证页

## 当前能力

- 编辑 Journey 阶段、文字行、图片行、情绪行与单元格
- 保存与恢复 Journey 文档
- 基于 AI 的 `clarify -> proposal -> confirm` 修改流程
- Markdown、JSON、CSV、SVG、打印/PDF 导出
- CloudBase 邮箱/手机号认证接线
- 工具文档版本快照与基础使用事件服务契约
- 积分账户、账本、预占与支付编排

注意：当前正式 API 宿主仍有两处部署接线缺口：

- `tool-documents` 仍使用进程内 repository，尚未切换到 CloudBase
- `billing-config` 已有 CloudBase repository，但部署入口尚未初始化服务端数据库客户端

## 核心文档

- [docs/project-architecture.md](D:\knowledge\codex\design\docs\project-architecture.md)：当前架构、阶段进度与模块边界
- [docs/product-plan.md](D:\knowledge\codex\design\docs\product-plan.md)：产品路线与工具优先级
- [docs/design-system.md](D:\knowledge\codex\design\docs\design-system.md)：设计系统规范
- [docs/journey-map-tool.md](D:\knowledge\codex\design\docs\journey-map-tool.md)：Journey Map 工具规格
- [docs/tool-runtime-contracts.md](D:\knowledge\codex\design\docs\tool-runtime-contracts.md)：工具运行时契约
- [docs/cloudbase-capabilities.md](D:\knowledge\codex\design\docs\cloudbase-capabilities.md)：CloudBase 能力与接入边界
- [docs/analytics-design.md](D:\knowledge\codex\design\docs\analytics-design.md)：内容与使用数据方案
- [docs/billing-design.md](D:\knowledge\codex\design\docs\billing-design.md)：积分账本与支付编排设计
- [docs/flexible-credit-billing.md](D:\knowledge\codex\design\docs\flexible-credit-billing.md)：灵活积分、模型与商品定价方案
- [docs/progress-report-2026-06-14.md](D:\knowledge\codex\design\docs\progress-report-2026-06-14.md)：最新项目核验结果
- [docs/git-recovery-2026-06-14.md](D:\knowledge\codex\design\docs\git-recovery-2026-06-14.md)：Git 恢复记录

## 协作约定

- 完成模块任务后，先本地验证，再提交本地 Git
- 新任务开始前先创建独立分支，避免多个模块把提交混在一起
- 一次性提示词、拆分计划和临时验收说明不再长期留在 `docs/`
- 新增或调整可复用组件时，需要同步更新 `/components` 与 [docs/design-system.md](D:\knowledge\codex\design\docs\design-system.md)
