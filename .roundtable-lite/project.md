# AI 服务设计工具箱

## Migration
- Source: .roundtable
- Migrated at: 2026-06-07T04:35:49.015Z
- Source project id: rt_mq2bqv8x_9ab054
- Historical workspace: D:\knowledge\codex\design
- Canonical workspace: D:\knowledge\codex\design_02

## Product Goal
多工具、AI 协作、CloudBase 账号与按次付费的服务设计平台

## Imported Roundtable Memory

# Project Memory

## Product

- 服务设计工具箱由多个独立工具组成，AI 协助用户选择、理解和使用工具。
- 当前已完成用户旅程图 DEMO，后续以同一工具契约接入 Personas 等工具。
- 商业模式为邮箱账号登录、微信/支付宝支付、按使用次数扣费。

## Decisions

- 2026-06-06：采用模块化单体和单仓库，MVP 不拆微服务。
- 2026-06-06：工具通过 ToolDefinition 注册；领域规则不依赖 React、CloudBase、模型或支付供应商。
- 2026-06-06：AI 分全局 Skill/记忆与工具 Skill/记忆；修改使用结构化命令，用户确认后执行。
- 2026-06-06：优先使用 CloudBase 的认证、数据库、云函数和对象存储，通过自有端口隔离供应商 SDK。
- 2026-06-06：额度采用不可变账本及预占/提交/释放流程；支付与扣次均要求幂等。
- 2026-06-06：先无行为变化地拆分现有 Journey Map DEMO，再接登录、持久化和支付。

## Interfaces

- ToolDefinition：metadata、documentVersion、createInitialDocument、validateDocument、applyCommand、exports、ai。
- ToolDocument：id、projectId、toolId、schemaVersion、revision、title、content、timestamps。
- AssistantRequest：scope、projectId、documentId、toolId、messages、attachmentRefs。
- AI 响应：message、clarify、commands、recommend_tools。
- 基础设施端口：AuthPort、DocumentRepository、LedgerRepository、PaymentProvider、ModelProvider、ObjectStorage。
- 详细契约和阶段计划见 docs/project-architecture.md。

- 2026-06-06：DEMO 重构保留交互而不复刻旧视觉；设计系统以 Chakra UI v3 的 Token、semantic tokens 和 Recipe 为基础，只做轻量产品定制。详细计划见 docs/demo-refactor-plan.md。

## Delivery Order

1. 架构护栏和测试基线。
2. 拆分 DEMO 并建立工具运行时。
3. CloudBase 登录、项目与文档持久化。
4. 额度账本、微信/支付宝支付。
5. 全局助手和第二个工具。

## Active Workflow

- 2026-06-16：本仓库只使用 `.roundtable-lite/` 作为活跃协作状态；旧 `.roundtable/` 仅作为已迁移历史，不再继续使用。
- 2026-06-16：标准开发流程为“一任务一分支，一分支一 linked worktree”；主工作区用于主持、审查、分诊和低风险文档维护，不作为常规功能开发工作区。
- 2026-06-16：凡是出现 tracked files 异常缺失、跨模块混改或旧路径 `D:\knowledge\codex\design` 与当前工作区混用，先视为基线问题处理，再开始新任务。
- 2026-06-16：任务 agent 在完成实现后，必须自行调用 Roundtable Lite 的 `submit` 或 `complete`。只有代码提交、没有任务状态流转，不算任务完成。

## Open Questions

- 哪些 AI 行为扣次：仅成功生成/修改，还是澄清和全局咨询也扣次。
- 套餐中一次使用的精确定义、退款规则和赠送额度有效期。
- CloudBase 当前已安装 Skill/MCP 的实际工具名与支持范围需在实现时确认。
- 微信支付与支付宝所使用的商户主体、产品类型及回调域名尚未确定。

## Git Delivery Rule

- 完成一个可审查工作单元并通过验证后，必须创建本地 Git commit。
- 只能显式暂存本模块本轮修改的文件；禁止 `git add .` 和 `git add -A`。
- 提交前检查 `git diff --cached`，不得包含用户已有改动、其他模块文件、密钥或构建产物。
- 如果必须修改一个进入任务前已经脏的文件，不能直接整文件暂存；应通过 Roundtable 通知主持人处理基线或安全分块暂存。
- Roundtable Lite 任务在收尾时必须记录 commit hash、验证结果、changed files 和 diff summary。
- `review_required=true` 的任务必须由实现 agent 调用 `submit` 进入 `review`；`review_required=false` 的任务必须由实现 agent 调用 `complete`。
- 不执行远端 `git push`，除非用户或主持人明确要求。
