# Journey 后续开发拆分与验收清单

更新日期：2026-06-23

## 1. 当前方案核验结论

当前方案已经把产品口径、Journey 工作流、计费动作层、后台 run 审计字段和技术编排主线基本收口。

在本轮补文档之后，这 5 个问题已经从“方案未闭环”进入“方案已闭环、实现未开始”状态。

总装配闭环文档位于：

- `docs/journey-implementation-closure-spec.md`

当前剩余待做的，不再是继续讨论概念，而是把下面 5 个闭环按既定 contract 实现出来：

1. Persona 资产读取闭环实现
- 已有 Persona 协议文档与总装配读取 contract
- 下一步是把正式服务端读取路径实现出来

2. Journey generation 正式后端实现
- 已有对象协议、编排步骤、错误码和落库边界
- 下一步是把 `JourneyGenerationRequest / JourneySkeleton / PersonaRunResult / JourneySynthesisResult` 对应服务与 API 落代码

3. 后台计费配置和审计查询后端实现
- 已有动作积分配置、模型策略和 run audit query contract
- 下一步是把正式后台读写 API 落代码

4. 管理后台页面实现
- 已有页面结构、表格字段、筛选与错误态规则
- 下一步是按 contract 接通 admin UI

5. 前端正式生成入口实现
- 已有确认卡片、调用时机、成功失败承接规则
- 下一步是把“确认并生成”正式接到 Journey generation 主链

## 2. 拆分原则

后续任务按“模块边界互不重叠”拆分，避免并行开发时互相踩文件。

原则如下：

- 一个阶段只改一个主模块边界
- 阶段之间只通过已写死的 contract 对接
- 不允许两个任务同时改同一组主文件
- 前端页面任务不反向改后端领域规则
- 后端编排任务不顺手改后台 UI

## 3. 建议阶段拆分

### 阶段 A：Persona 资产读取闭环

- Roundtable Lite Task ID: task_mqqp0c9y_90eba6c7

- 模块：`persona-assets`
- 目标：把 Persona 正式资产读取路径补齐，给 Journey generation 提供稳定输入
- 主要边界：`server/application/persona/*`、`src/tools/persona/*`、`docs/persona-*`
- 不碰：Journey generation、admin UI、billing config

验收清单：

- 能根据 `personaIds` 读到正式 Persona 资产
- 返回字段只包含 Journey generation 需要的稳定层数据
- 不直接把原始证据全文喂给下游
- 缺失 Persona、无权限 Persona、有损坏 Persona 时返回明确错误
- 有最小读取测试覆盖正常与异常路径

### 阶段 B：后台计费配置与审计查询后端

- Roundtable Lite Task ID: task_mqqp0gnh_9e85a7d8

- 模块：`billing-entitlements`
- 目标：实现动作积分配置、模型策略配置、Journey run audit 查询接口
- 主要边界：`server/application/billing*`、`server/infrastructure/cloudbase/billing*`、`server/infrastructure/cloudbase/billing-config*`
- 不碰：Journey generation 编排、admin 页面渲染、assistant UI

验收清单：

- 管理员可读取动作积分配置列表
- 管理员可修改单个动作的积分价格
- 管理员可读取模型策略列表
- 管理员可修改动作对应的 provider / model
- 管理员可查询 `JourneyRunAuditRecord` 分页结果
- 默认排序为 `createdAt desc`
- 支持按 `actionKey / providerKey / modelKey / status / referenceId` 过滤
- 所有写入接口都有鉴权与审计记录

### 阶段 C：Journey generation 正式后端

- Roundtable Lite Task ID: task_mqqp0lla_12fcb608

- 模块：`journey-generation`
- 目标：把三段式正式生成链路实现成独立服务和 API
- 主要边界：`server/application/journey-generation/*`、`server/journey-generate.cjs`、`api/journey-generate.js`
- 不碰：admin 页面、billing 配置页面、persona 编辑 UI

验收清单：

- `JourneyGenerationRequest` 有运行时校验
- 服务端能生成 `JourneySkeleton`
- 服务端能对每个 Persona 跑出 `PersonaRunResult`
- 服务端能汇总成 `JourneySynthesisResult`
- 生成成功会写入正式 Journey 文档和 revision
- 生成失败会释放预占积分
- usage event / run audit 能记录动作、积分、模型、referenceId
- 有协议测试、编排测试和 API 测试

### 阶段 D：管理后台页面落地

- Roundtable Lite Task ID: task_mqqp0ozo_031a7b90

- 模块：`admin-console`
- 目标：把动作积分、模型策略、Journey run audit 三块后台页面按 contract 接起来
- 主要边界：`src/features/admin/*`
- 不碰：服务端领域规则、Journey generation 编排、Persona 读取逻辑

验收清单：

- 动作积分页能查看和修改动作积分
- 模型策略页能查看和修改 provider / model
- run audit 表格字段完整
- 表格列包含：时间、动作、消耗积分、模型、API 信息、对话 ID、状态
- 默认排序为时间从近到远
- 支持基本筛选与分页
- 错误态、空状态、未授权状态明确可见

### 阶段 E：前端正式生成接线

- Roundtable Lite Task ID: task_mqqp0tj9_069ae626

- 模块：`ai-orchestration`
- 目标：把现有 assistant / Journey 页面接到正式 generation API，并展示本次使用模型
- 主要边界：`src/features/assistant/*`、`src/tools/journey-map/*`
- 不碰：billing 配置后端、admin 页面、Persona 读取服务端

验收清单：

- 用户能从确认卡片触发正式生成
- 正式生成请求发送到 `journey-generate` API
- 成功后页面能加载新的 Journey 结果
- 失败时展示明确错误，不污染现有文档
- 页面能展示当前结果使用的 `provider / model`
- 不把中间态 run 细节直接暴露给普通用户

## 4. 推荐开发顺序

推荐顺序：

1. 阶段 A：Persona 资产读取闭环
2. 阶段 B：后台计费配置与审计查询后端
3. 阶段 C：Journey generation 正式后端
4. 阶段 D：管理后台页面落地
5. 阶段 E：前端正式生成接线

原因：

- A 先解决 Journey generation 的上游输入来源
- B 先把计费和审计底座做稳
- C 再实现正式生成主链
- D、E 最后分别接管理端和用户端界面

## 5. 并行开发边界

如果后面要并行做，建议只允许以下并行组合：

- A 与 B 可并行
- D 必须等 B 的 contract 稳定后再做
- E 必须等 C 的 contract 稳定后再做

不建议并行：

- C 与 E 同时启动
- B 与 D 同时改接口字段
- A 与 C 同时改 Persona 输入 contract

## 6. 任务完成后的统一验收模板

每个任务完成后，你都可以按这张统一清单验收：

1. 这次任务是否只改了自己声明的模块边界
2. 是否没有顺手改其他阶段的主文件
3. 是否有最小可运行结果，而不是只停留在类型定义
4. 是否补了对应测试或最小验证命令
5. 是否把异常路径也走通了
6. 是否把新 contract 写回文档或保持和真源一致
7. 是否没有破坏现有 Journey / Billing / Auth 主链

一句话结论：

> 这批后续开发最重要的不是“快做完”，而是每个阶段只解决一个清晰问题，并且不互相污染边界。
