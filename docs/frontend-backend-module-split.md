# 当前模块拆分与前后端边界建议

更新日期：2026-06-27

## 1. 这份文档解决什么问题

当前仓库的主拆分方式是按业务模块边界拆，而不是单纯按“前端 / 后端”拆。

这样做的好处是后端主链容易先收口，但副作用也很明显：

- 当产品进入前端重设计阶段时，容易感觉“任务都挤在一起”
- 前端同学会担心改页面时碰到后端 contract
- 后端同学会担心前端需求变化反向污染正式生成链路

因此，从当前阶段开始，建议把 Persona 和 Journey 相关工作进一步明确成：

- 后端模块
- 前端模块
- 共享 contract 模块

目标不是把仓库拆成多仓，而是在单仓内把职责再切细一层，让前端设计迭代可以独立推进。

## 2. 当前实际拆分方式

当前仓库的真实拆分方式仍然是“按业务模块”组织：

- `persona-assets`
- `journey-generation`
- `billing-entitlements`
- `admin-console`
- `ai-orchestration`
- `tool-runtime`
- `persistence-backend`
- `identity-cloudbase`

这套拆分本身没有问题，但它更适合“先把正式链路做通”的阶段，不够适合“前端视觉与交互会持续调整”的阶段。

## 3. 建议采用的第二层拆分

建议后续同时保留两层视角：

### 3.1 第一层：业务模块

继续保留当前模块名，用来管理业务归属：

- Persona 资产
- Journey 正式生成
- Billing 与配置
- Admin 管理后台
- Assistant 对话协作

### 3.2 第二层：实现边界

每个业务模块内，再明确区分：

- `contract`：共享协议、输入输出结构、错误码、字段语义
- `backend`：服务端编排、仓储、API、鉴权、落库、计费
- `frontend`：页面、组件、交互状态、展示层、页面级校验

这样后续任务就不再是一个宽泛的“做 Persona”或“做 Journey”，而是会更准确地写成：

- Persona contract
- Persona backend
- Persona frontend
- Journey contract
- Journey backend
- Journey frontend

## 4. 当前模块按前后端重新落位

### 4.1 Persona

建议正式拆成三块：

- `persona-contract`
  - 位置：`docs/persona-*`、`src/tools/persona/*`、必要共享类型
  - 责任：PersonaDocument、InsightCard、ResolvedPersonaInput、traits 规则、标签字典映射
- `persona-backend`
  - 位置：`server/application/persona/*`
  - 责任：正式 Persona 读取、权限校验、压缩规则、Journey 消费输入
- `persona-frontend`
  - 位置：后续建议独立到 `src/features/persona/*` 或 `src/tools/persona/ui/*`
  - 责任：Persona 页面、卡片编排、右侧结果池、traits 调节与确认交互

当前状态：

- contract：已基本收口
- backend：A 阶段已完成
- frontend：尚未正式启动

### 4.2 Journey

建议正式拆成三块：

- `journey-contract`
  - 位置：`docs/journey-*`、`server/application/journey-generation/protocol.cjs`
  - 责任：JourneyGenerationRequest、JourneySkeleton、PersonaRunResult、JourneySynthesisResult、错误规则
- `journey-backend`
  - 位置：`server/application/journey-generation/*`、`server/journey-generate.cjs`、`api/journey-generate.js`
  - 责任：正式生成编排、Persona 输入解析、模型调用、积分处理、文档落库、run audit
- `journey-frontend`
  - 位置：`src/tools/journey-map/*`、`src/features/assistant/*` 中与 Journey 正式生成直接相关的部分
  - 责任：确认卡片、生成入口、Journey 结果承接、模型展示、错误态与页面刷新承接

当前状态：

- contract：C1 已完成
- backend：C2 待整改，C3 未开始
- frontend：E 阶段未开始

### 4.3 Billing / Model Policy / Audit

建议拆成两块：

- `billing-config-backend`
  - 位置：`server/application/billing-config.cjs`、`server/infrastructure/cloudbase/billing-config/*`
  - 责任：动作积分、模型策略、Journey run audit 查询与写入规则
- `billing-admin-frontend`
  - 位置：`src/features/admin/*`
  - 责任：配置列表、编辑表单、审计表格、筛选、分页、错误态

当前状态：

- backend：B 阶段已完成
- frontend：D 阶段未开始

### 4.4 Assistant

Assistant 建议拆成两类，不要混成一个大模块：

- `assistant-chat-frontend`
  - 位置：`src/features/assistant/*`
  - 责任：聊天 UI、消息流、确认卡片、状态切换、错误提示
- `assistant-runtime-backend`
  - 位置：`server/application/assistant/*`
  - 责任：聊天澄清、提案阶段、usage 记录、与 Journey generation 的边界衔接

关键原则：

- Assistant 负责澄清与确认前交互
- Journey generation 负责正式生成主链
- 两者不能重新混回一个服务里

## 5. 建议的目录边界

如果你后续要让前端设计单独推进，建议逐步收口成这样的目录认知：

```text
src/
  features/
    assistant/        # Assistant 前端
    admin/            # Admin 前端
    persona/          # Persona 前端（建议新增）
  tools/
    persona/          # Persona tool contract / runtime
    journey-map/      # Journey tool contract / page runtime

server/
  application/
    persona/          # Persona 后端
    journey-generation/ # Journey 后端
    assistant/        # Assistant 后端
    billing/          # Billing 账本与支付领域
    billing-config.cjs # Billing 配置与 run audit
```

建议原则：

- `src/features/*` 主要承载页面与交互
- `src/tools/*` 主要承载工具文档协议、运行时契约、导出与工具级状态
- `server/application/*` 主要承载正式业务后端

这样做以后，前端设计改动大多数会落在：

- `src/features/persona/*`
- `src/features/assistant/*`
- `src/features/admin/*`
- `src/tools/journey-map/*` 的页面层

不会直接冲击：

- `server/application/persona/*`
- `server/application/journey-generation/*`
- `server/application/billing-config.cjs`

## 6. 当前阶段任务如何改写得更适合前端独立推进

当前 A-E 的业务顺序仍然成立，但为了适应前端将来大改，建议把后续任务描述改成“前后端分离版”。

### 已完成或进行中的后端链路

- A：Persona backend
- B：Billing config backend
- C1：Journey contract
- C2：Journey backend orchestration
- C3：Journey backend host / persistence

### 后续应独立管理的前端链路

- D：Admin frontend
- E：Journey frontend generation entry
- F：Persona frontend workspace
  - 当前未正式建任务，但建议后续单列
- G：Journey workspace redesign
  - 当前未正式建任务，但如果你确定前端会大改，建议单列

## 7. 推荐的新任务命名方式

后续不建议再用太宽泛的名字，例如：

- “做 Persona”
- “做 Journey”
- “做后台”

建议改成这种格式：

- `persona-contract-*`
- `persona-backend-*`
- `persona-frontend-*`
- `journey-contract-*`
- `journey-backend-*`
- `journey-frontend-*`
- `billing-config-backend-*`
- `admin-frontend-*`
- `assistant-frontend-*`

这样一眼就能看出：

- 是不是前端任务
- 会不会碰后端主链
- 能不能交给视觉或交互重构并行推进

## 8. 当前最适合的执行结论

基于当前项目状态，最合理的做法是：

1. 继续按现有顺序收掉 Journey backend 主链
   - 也就是先完成 C2、C3
2. 不再把后续前端工作混写成“Journey 大任务”
3. 从现在开始把前端任务单独立模块
   - Admin frontend
   - Journey frontend
   - Persona frontend
4. Persona 与 Journey 的前端设计迭代，都尽量只改 `src/features/*` 和工具页面层
5. 任何前端设计改动，不反向修改正式协议与后端字段，除非先改 contract 真源

## 9. 一句话判断

当前仓库主拆分方式仍然是按业务模块拆，这在后端主链收口阶段是合理的。

但如果后续前端设计会持续变化，那么下一阶段必须显式切成“共享 contract / backend / frontend”三层，尤其要把 Persona frontend 和 Journey frontend 单独立出来，否则任务会越来越难并行，也越来越难验收。
