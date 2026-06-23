# Persona 四层数据协议与编辑规则草案

更新日期：2026-06-22

## 1. 目标

这份协议用于固定 Persona 工具的第一版数据骨架和编辑边界。

当前 Persona 的职责不是生成一张静态画像页，而是：

> 把调研证据整理成可复用的 Persona 资产，供 Journey 等下游工具稳定读取。

因此，本协议重点解决四件事：

1. Persona 分成哪四层
2. 每层存什么数据
3. 每层数据从哪里来
4. 每层哪些字段可编辑，哪些字段不可直接改写

## 2. 总体结构

当前 Persona 采用四层结构：

1. 基础信息层
2. 行为洞察层
3. 场景洞察层
4. 性格特征层

它们的关系是：

- `基础信息`：描述这个人是谁
- `行为洞察`：描述这个人跨情境下相对稳定的行为模式
- `场景洞察`：描述这个人在具体情境里的行为表现
- `性格特征`：对行为洞察和场景洞察做进一步抽象后的稳定倾向总结

除了四层核心结构外，Persona 页面还可以提供一个轻量的派生摘要区，用于展示：

- 需求
- 偏好
- 雷点

在导入调研并首次生成 Persona 时，还需要一个位于“洞察卡”和“正式基础信息”之间的中间层：

- Persona 骨架

重要规则：

> 性格特征不直接从原声列表做算术平均，而是由行为洞察和场景洞察综合推导。

## 3. 核心对象

为避免“证据、卡片、正式画像”混在一起，当前协议把 Persona 拆成 8 个对象：

1. `PersonaDocument`
2. `EvidenceItem`
3. `InsightCard`
4. `PersonaTrait`
5. `PersonaProfile`
6. `PersonaSummaryItem`
7. `PersonaSkeleton`
8. `PersonaImportResult`

### 3.1 PersonaDocument

Persona 工具保存的正式文档。

```ts
type PersonaDocument = {
  id: string
  skeleton: PersonaSkeleton
  profile: PersonaProfile
  evidenceItems: EvidenceItem[]
  behaviorInsights: InsightCard[]
  contextInsights: InsightCard[]
  traits: PersonaTraitSet
  summaryItems: PersonaSummaryItem[]
  meta: {
    version: number
    createdAt: string
    updatedAt: string
  }
}
```

说明：

- `skeleton` 用于承接“由洞察卡聚成 Persona 草稿”的中间结果
- `behaviorInsights` 和 `contextInsights` 分开存，是为了表达“跨情境稳定行为”和“具体情境表现”的差异
- `traits` 单独存，是为了让 Journey 直接读取稳定参数，不必重新遍历所有卡片
- `summaryItems` 用于承载需求、偏好、雷点等高频阅读摘要，但它不属于四层核心之一

### 3.1.1 PersonaImportResult

PersonaImportResult 用于承接“一次导入调研后”的整体结果。

它的职责不是描述单个 Persona，而是描述：

- 本次导入用了哪些来源
- 生成了几个 Persona 初稿
- 哪些洞察没有被自动编排，留在右侧数据池

推荐结构：

```ts
type PersonaImportResult = {
  id: string
  sourceLabels: string[]
  evidenceItems: EvidenceItem[]
  draftPersonas: PersonaDocument[]
  poolInsights: InsightCard[]
  createdAt: string
}
```

说明：

- `draftPersonas`：本次导入后生成的 `1-n` 个 Persona 初稿
- `poolInsights`：本次导入后未被自动编排进 Persona 的洞察集合
- `poolInsights` 不是废弃内容，而是待用户判断和拖拽纳入的内容

### 3.2 EvidenceItem

证据真相层对象。只负责记录原始材料或手动补充原声，不承载最终结论。

```ts
type EvidenceSourceKind = "imported_file" | "manual_note"

type EvidenceItem = {
  id: string
  sourceKind: EvidenceSourceKind
  sourceLabel: string
  quote: string
  speakerLabel?: string
  importedAt?: string
  createdAt: string
  tags: string[]
  linkedInsightIds: string[]
}
```

编辑规则：

- `imported_file` 类型的 `quote` 不允许直接改写
- 用户只能删除关联、增加关联，不能把导入原声改成别的话
- 如果用户想补充新内容，必须新增一条 `manual_note`
- `manual_note` 可以编辑，但要保留其来源类型，不能伪装成文件导入证据

### 3.3 InsightCard

InsightCard 是 AI 整理后的总结卡片协议，行为洞察和场景洞察共用一套结构，只通过 `kind` 区分。

```ts
type InsightKind = "behavior" | "context"

type InsightCard = {
  id: string
  kind: InsightKind
  summary: string
  semanticTags: string[]
  evidenceIds: string[]
  sourceLabels: string[]
  sampleSize: number
  confidence: "low" | "medium" | "high"
  fit: "high" | "medium" | "low"
  placement: "in_persona" | "pool"
}
```

字段说明：

- `summary`：给人看的自然语言总结
- `semanticTags`：最终确认后的结构化标签结果
- `evidenceIds`：支撑该洞察卡的原始证据引用
- `sourceLabels`：该卡关联的来源文件或来源组
- `sampleSize`：这张卡片背后覆盖了多少条样本或原声
- `confidence`：AI 对当前总结可靠性的判断
- `fit`：该卡片对当前 Persona 骨架或 Persona 初稿的适配度
- `placement`：该卡片当前位于 Persona 内，还是位于右侧数据池

编辑规则：

- `summary` 允许编辑
- `semanticTags` 允许通过结构化方式调整，不建议自由长文本乱改
- `evidenceIds` 由系统维护，用于追溯支撑原声
- 原声摘要不重复保存在卡片里，前端按 `evidenceIds` 拉取展示
- `sampleSize` 由系统根据关联证据自动计算，不能人工随意填写
- `sourceLabels` 与 `evidenceIds` 通过关联关系生成，不应手工伪造
- `fit` 由系统计算，不由用户直接编辑
- `placement` 可通过用户拖拽或移出操作改变

展示规则：

- 前端默认展示 `summary`、`semanticTags`、`sampleSize`、`confidence`
- `fit` 可作为编排提示或右侧池排序依据
- 证据详情、来源和原声内容按需展开，不在卡片主结构中重复存储原声摘要

判定规则：

- `confidence` 只回答“这张卡本身稳不稳”
- `fit` 只回答“这张卡适不适合先进入当前 Persona”
- `fit` 和 `confidence` 必须分开计算，不能混为一个字段

## 4. 四层详细协议

### 4.1 基础信息层

基础信息层用于快速识别“这个人是谁”。

```ts
type PersonaProfile = {
  name: string
  age?: number
  avatarUrl?: string
  occupation?: string
  city?: string
  incomeBand?: string
  familyBackground?: string
  educationBackground?: string
  roleTags: string[]
}
```

字段说明：

- `name`：模拟姓名，用于阅读和辨别，不等同于 Persona 骨架中的分群名
- `roleTags`：补充该 Persona 的角色、身份或类型标签

数据来源：

- 用户人工录入
- AI 从资料中抽取建议值后，由用户确认写入

自动填充边界：

- `name`：应生成，作为模拟姓名，便于阅读和辨别
- `roleTags`：可生成
- `age`、`occupation`、`city`、`incomeBand`、`familyBackground`、`educationBackground`：
  - 有明确证据时可生成候选值
  - 证据不足时应留空，不做伪精确补全

第一版原则：

- Persona 骨架内容一定要生成
- 基础信息中的 `name` 一定要生成
- 其余基础字段按证据充分性决定是否生成
- 不为了“看起来完整”而编造人口统计信息

命名真源规则：

- Persona 分群名的真源是 `skeleton.segmentName`
- Persona 分群描述的真源是 `skeleton.summary`
- Persona 模拟姓名的真源是 `profile.name`
- 不再额外维护与 `segmentName` 或 `summary` 重复的人设标题字段

编辑规则：

- 本层允许人工直接编辑
- AI 抽取的建议值不能无提示直接覆盖用户已有值
- `roleTags` 应限制为标签数组，不使用自由长段文字

### 4.1.1 Persona 骨架

Persona 骨架是“正式基础信息生成前”的中间层，用于承接初次导入后的自动聚合结果。

它不是完整 Persona，也不是完整基础信息页。它的职责是：

- 表达这个 Persona 草稿的核心模式
- 作为洞察卡自动编排的锚点
- 为后续基础信息补全提供候选上下文

推荐结构：

```ts
type PersonaSkeleton = {
  id: string
  segmentName: string
  summary: string
  seedInsightIds: string[]
}
```

字段说明：

- `segmentName`：分群名，用于表达这类 Persona 的核心模式，不等同于基础信息层的模拟姓名
- `summary`：一句话概括这个 Persona 的核心特征
- `seedInsightIds`：作为该 Persona 成形锚点的核心洞察卡

生成规则：

- 由 AI 基于 `behavior/context` 洞察卡聚合生成
- 不要求在这一步生成完整的年龄、城市、收入等字段
- 先形成“这个 Persona 是谁”的模式骨架，再进入基础信息补全
- 命名格式默认采用：`[主特征][次特征]型用户`

编辑规则：

- `segmentName` 和 `summary` 允许用户编辑
- `seedInsightIds` 由系统维护，不建议用户直接手工编辑

命名规则：

- `segmentName` 默认使用 `[主特征][次特征]型用户`
- `主特征` 必填，表示最核心的区分特征
- `次特征` 选填，只在确实有助于区分时补充
- 最多两个特征，不写完整句子
- 不写互相冲突的特征
- 不优先使用年龄、城市、收入等人口统计特征，除非它们本身就是分群核心

重要规则：

> 洞察卡回填与自动编排的主要锚点是 Persona 骨架，而不是完整基础信息。

原因：

- 很多基础信息在导入阶段证据不足
- 如果用年龄、城市、收入等字段做主锚点，容易产生伪精确
- Persona 真正稳定的核心是“行为模式和群组特征”，不是简历字段

### 4.2 行为洞察层

行为洞察层用于描述用户跨情境相对稳定的行为模式。

典型内容：

- 价格敏感度
- 信息获取偏好
- 决策风格
- 渠道偏好
- 服务选择偏好

协议：

- 使用 `InsightCard`
- `kind` 固定为 `"behavior"`

数据来源：

- 调研原声聚合
- 研究资料导入后由 AI 初步整理生成
- 用户对候选卡片进行确认、编辑或归档

编辑规则：

- 用户可以修改 `summary`
- 用户可以查看证据并调整哪些证据与该洞察相关
- 用户不能直接改写导入原声本身
- 候选卡片进入正式 Persona 前，建议先由用户确认

### 4.3 场景洞察层

场景洞察层用于描述用户在具体情境里的行为表现。

典型内容：

- 下班购买
- 排队等待
- 朋友推荐
- 周末消费
- 紧急处理

协议：

- 使用 `InsightCard`
- `kind` 固定为 `"context"`

命名说明：

- 这里使用 `context`，而不是 `scenario`
- 原因是避免与 Journey 工具里的服务场景 `scenario` 概念冲突

数据来源：

- 具体情境片段聚合
- 导入资料后由 AI 先拆分出情境相关卡片
- 用户确认哪些卡片正式纳入 Persona

编辑规则：

- 与行为洞察层一致
- 允许编辑总结，不允许改写证据原文
- 用户可把有争议或不适配的候选卡片留在候选池，而不强制纳入 Persona

### 4.4 性格特征层

性格特征层不是证据层，而是从行为洞察与场景洞察进一步抽象出来的解释层。

第一版先采用 4 个维度：

```ts
type TraitLevel = 1 | 2 | 3 | 4 | 5

type PersonaTrait = {
  suggested: TraitLevel
  confirmed?: TraitLevel
  confidence: "low" | "medium" | "high"
  rationale: string
  supportingInsightIds: string[]
}

type PersonaTraitSet = {
  patienceTolerance: PersonaTrait
  riskTolerance: PersonaTrait
  autonomy: PersonaTrait
  trustTendency: PersonaTrait
}
```

维度说明：

- `patienceTolerance`：等待时的耐受程度
- `riskTolerance`：面对未知选项时的冒险倾向
- `autonomy`：遇到问题时的自我解决倾向
- `trustTendency`：对服务方承诺的基础信任倾向

生成规则：

- 不直接从原声列表算术平均
- 主要依据行为洞察与场景洞察综合推导
- AI 先给出 `suggested`、`confidence` 和 `rationale`
- 用户确认后，才写入 `confirmed`

编辑规则：

- 用户不应直接把性格特征当成长文本自由描述区
- 用户修改时，应通过 1–5 的结构化控件完成
- `suggested` 由 AI 维护
- `confirmed` 由用户确认或调整
- `supportingInsightIds` 用于追踪当前性格特征背后依赖了哪些洞察

### 4.5 派生摘要区：需求 / 偏好 / 雷点

需求、偏好、雷点不建议作为新的证据层或新的参数层，而应定义为：

> 从行为洞察和场景洞察中提炼出来的轻量摘要层。

它与性格特征层相似的地方在于：

- 都不是原始证据
- 都由洞察层派生
- 都应采用“AI 建议 + 用户确认”

但它和性格特征层的关键区别是：

- 性格特征层是参数化推导层
- 需求 / 偏好 / 雷点是语义摘要层

因此，不应把需求、偏好、雷点做成分值或公式化参数。

推荐结构：

```ts
type PersonaSummaryKind = "need" | "preference" | "avoidance"

type PersonaSummaryItem = {
  id: string
  kind: PersonaSummaryKind
  text: string
  confidence: "low" | "medium" | "high"
  supportingInsightIds: string[]
  confirmed: boolean
}
```

字段说明：

- `need`：跨场景可复用的核心诉求
- `preference`：跨场景较稳定的选择偏好
- `avoidance`：跨场景容易触发反感或流失的因素，即“雷点”

生成规则：

- 主要由行为洞察和场景洞察提炼
- AI 先给出候选摘要项
- 用户确认后再纳入正式 Persona

编辑规则：

- 用户可以修改 `text`
- 用户不能把它当成自由发散写作区无限扩写
- 每条摘要都应尽量能追溯到 `supportingInsightIds`
- 不做分数，不做标签到数值的固定映射

MVP 建议：

- `need` 最多保留 `3` 条
- `preference` 最多保留 `3` 条
- `avoidance` 最多保留 `3` 条

原因：

- 这层的职责是提炼最突出的核心点
- 不是把全部洞察再抄写一遍
- 也不是替代具体 Journey 场景里的目标和痛点描述

## 5. 右侧结果池规则

Persona 工具右侧区域不只是证据区，而应定义为“导入后分析结果池”。

推荐流程：

1. 导入市场调研或用户调研资料
2. 后台先拆成多个行为洞察候选卡片与场景洞察候选卡片
3. AI 按共同点聚合出一个或多个初步 Persona
4. 高适配卡默认编排进入 Persona
5. 中低适配、未分配或有争议的卡片保留在结果池

重要规则：

- `fit = high` 的卡片默认进入 Persona
- `fit = medium | low` 的卡片默认留在右侧数据池
- 用户始终可以把右侧池中的卡片拖入 Persona
- 用户也可以把已纳入 Persona 的卡片移回右侧数据池
- `low` 不代表禁用，只代表系统不自动纳入
- 右侧数据池承载的是“本次导入后未自动编排的洞察集合”，不是永久废弃区

## 6. Persona 洞察漏斗生成规则

Persona 第一版不建议采用完全开放式的自由聚类方式来生成洞察卡。

更适合当前产品的方式是：

> 原始证据 -> `behavior/context` 初筛 -> trait 主干或普通洞察支路 -> 标签 -> 洞察卡

这样做的原因是：

- 能直接对齐 Persona 四层结构
- 能让部分洞察稳定进入性格特征层
- 能保留不适合进入 trait 的普通洞察，供 Journey 读取上下文

### 6.1 漏斗主流程

推荐主流程如下：

1. 输入原始证据或原声
2. 判断内容更适合归类为 `behavior` 还是 `context`
3. 判断它是否主要回答四个 trait 核心问题之一
4. 如果属于 trait 主干，则进入对应 trait 问题路径
5. 如果不属于 trait 主干，则进入普通洞察支路
6. AI 从受控标签字典中匹配候选标签
7. 多条同类证据聚合成 `InsightCard`
8. 相关标签再参与 trait suggested 值推导

### 6.1.1 初次导入的生成顺序

Persona 第一版在导入调研后，推荐采用以下顺序：

1. 导入定性/定量调研数据
2. 先生成 `behavior/context` 洞察卡
3. 按洞察卡聚成 `1-n` 个 Persona 骨架
4. 为每个骨架生成：
   - `segmentName`
   - `summary`
   - `seedInsightIds`
5. 基于骨架模式计算每张卡与该骨架的 `fit`
6. `fit = high` 的卡默认编排进入 Persona
7. 其余卡片留在右侧数据池
8. 再基于已纳入洞察补基础信息、生成 traits 与需求/偏好/雷点

重要说明：

- 初次导入时，系统先形成 Persona 骨架，再补正式基础信息
- 不建议在骨架尚未形成前，直接生成完整 Persona 简历式资料

### 6.2 第一层：`behavior` / `context` 初筛

第一层只回答一个问题：

> 这条内容是在描述跨情境稳定行为，还是在描述某个具体情境里的表现？

判断原则：

- 更像稳定偏好、长期倾向、反复出现的决策模式 -> `behavior`
- 更像特定场景、特定触发条件、具体时刻反应 -> `context`

示例：

- “我一般会先比较几家价格再决定” -> `behavior`
- “排队超过 5 分钟我就想走” -> `context`

### 6.3 第二层：trait 主干判断

第二层判断该内容是否主要回答以下四类问题：

1. 遇到等待时会怎么反应 -> `patienceTolerance`
2. 遇到未知选项时会怎么选 -> `riskTolerance`
3. 遇到问题卡住时会怎么处理 -> `autonomy`
4. 面对服务方承诺或说明时会怎么判断 -> `trustTendency`

如果某条内容主要回答这四类问题之一，则进入 trait 主干路径。

如果不主要回答这四类问题，则保留为普通洞察，不强行进入性格特征层。

### 6.4 trait 主干路径

trait 主干路径的推荐顺序：

1. 判定 `behavior` 或 `context`
2. 识别对应 trait 问题
3. 生成候选标签
4. 与同类证据聚合
5. 形成 `InsightCard`
6. 通过标签映射支持 trait suggested 值计算

示例：

- 原声：“排队超过 5 分钟我就会很烦”
- 初筛：`context`
- trait 问题：等待反应
- 候选标签：`waiting_tolerance_low`
- 聚合后形成场景洞察卡
- 后续参与 `patienceTolerance` 推导

### 6.5 普通洞察支路

不是所有洞察都必须进入 trait 主干。

以下内容常常更适合作为普通洞察保留：

- 价格敏感
- 促销响应
- 渠道偏好
- 朋友推荐影响
- 提前规划习惯

这类内容仍然应：

- 归入 `behavior` 或 `context`
- 打上受控标签
- 形成 `InsightCard`
- 在 Journey 中作为解释性上下文被读取

但它们不一定直接映射到四个 trait，或只作为弱信号参与推导。

### 6.6 一张 `InsightCard` 的最小成立条件

MVP 阶段建议一张洞察卡至少满足以下条件：

1. 能表达一个相对单一的洞察主题
2. 关联的证据在语义上足够接近
3. 能匹配 `0-3` 个受控标签
4. 能写出一句清晰、可读的总结

不建议把以下内容做成一张卡：

- 同时混合价格、等待、信任等多个主题
- 只有一句非常模糊、无法抽象出稳定意义的原声
- 证据间明显冲突但被硬压成一个结论
- 同时保留相互冲突的核心特征作为主画像结论

### 6.7 多条原声何时聚成一张卡

建议聚合成一张卡的条件：

- 它们属于同一 `kind`
- 它们回答的是同一个核心问题
- 它们能共享相近标签
- 它们的总结可以写成一句统一结论

如果满足以上条件，可以聚合为一张卡，并把 `sampleSize` 与 `evidenceIds` 累积起来。

建议拆成多张卡的情况：

- 同一主题下出现明显分群
- 正反信号都很强，无法写成一个诚实总结
- 虽然都在同一大类里，但实际回答的是不同问题

### 6.8 冲突处理

当证据之间存在明显冲突时，优先顺序应为：

1. 先判断是否应该拆成两张卡
2. 如果仍保留为一张卡，则降低 `confidence`
3. trait 推导时把冲突体现在较低置信度上
4. 如果冲突已经形成稳定分群，应拆成多个 Persona 骨架而不是污染同一个 Persona

不推荐的处理方式：

- 强行平均
- 强行给出单一明确结论
- 因为想得到 trait 分值而压平分歧

### 6.8.1 适配度的当前范围

当前阶段不建议做实时动态适配度重算。

MVP 建议：

- 适配判断只在 Persona 初稿生成时计算一次
- 用户后续手动拖拽、微调，不实时触发全量重算
- 如需重新分析，由用户主动触发一次新的重算流程

这样做的原因是：

- 降低状态依赖与连锁更新复杂度
- 避免用户因为分值频繁变化而失去理解
- 先把“初次自动编排 + 人工微调”跑通

### 6.8.2 `confidence` 判定规则

`confidence` 用于表示：

> 这张洞察卡的总结本身是否可靠。

它不用于判断该卡是否应进入当前 Persona。

MVP 阶段建议只看三个维度：

1. 证据一致性
2. 样本支撑
3. 标签清晰度

判定原则：

- `high`
  - 证据大体一致
  - 样本量不低
  - 标签清晰
  - 没有明显冲突

- `medium`
  - 证据基本一致
  - 样本量一般
  - 标签基本清晰
  - 存在少量模糊点

- `low`
  - 证据冲突明显
  - 样本量很少
  - 标签不稳定
  - 总结更像猜测而不是稳定结论

轻量可执行规则：

```ts
if evidenceConflictHigh then confidence = "low"
else if sampleSize <= 1 then confidence = "low"
else if sampleSize >= 3 && tagsAreClear && evidenceConsistencyHigh then confidence = "high"
else confidence = "medium"
```

### 6.8.3 `fit` 判定规则

`fit` 用于表示：

> 这张洞察卡是否适合先进入当前 Persona 骨架或 Persona 初稿。

它不回答这张卡有没有价值，只回答它是否适合作为当前 Persona 的组成部分。

MVP 阶段建议只看三个维度：

1. 主模式一致性
2. 与已纳入洞察的兼容性
3. 代表性

判定原则：

- `high`
  - 与 Persona 骨架主模式明显一致
  - 与已纳入洞察兼容
  - 更像该 Persona 的典型特征
  - 这类卡自动进入 Persona

- `medium`
  - 有一定相关性
  - 但不够核心，或与现有画像存在轻微张力
  - 默认留在右侧池，供用户判断

- `low`
  - 更像边缘情况、局部例外或另一类用户
  - 默认留在右侧池
  - 不禁止用户手动拖入 Persona

轻量可执行规则：

```ts
if stronglyMatchesSkeleton && compatibleWithCurrentPersona && representative
  fit = "high"
else if somewhatRelatedButNotCore
  fit = "medium"
else
  fit = "low"
```

重要限制：

- 如果某张卡会与当前 Persona 的核心主特征形成明显冲突，则不能判为 `high`
- `fit = high` 是自动编排阈值
- `fit = medium | low` 只是“不自动进入”，不是“不可进入”

### 6.8.4 Persona 骨架的拆分原则

Persona 不是统计平均人，而是内部尽量一致、特征突出的典型模式。

因此：

- 一个 Persona 不应同时保留互相冲突的核心特征
- 如果在同一关键维度上出现明显对立，且两边都有足够证据支撑，应拆成多个 Persona
- 局部例外不应污染主画像，只作为补充说明或次级偏好存在

第一版拆分触发条件：

- 在同一关键维度上出现稳定且明确的对立信号
- 这些对立信号都各自有足够证据支撑
- 对立内容已经不是局部例外，而是能形成独立模式

典型触发维度包括：

- 价格敏感 vs 价格不敏感
- 等待耐受低 vs 等待耐受高
- 自助倾向高 vs 依赖协助高
- 愿意尝试新选项 vs 明显回避不确定性

不建议拆分的情况：

- 只是局部品类、局部场景下的例外
- 总体主模式稳定，但存在少量可解释偏离
- 差异不足以形成另一类清晰 Persona

示例：

- 不应生成“又价格敏感又价格不敏感”的 Persona
- 更合理的做法是保留“整体价格敏感”，同时在摘要或洞察中说明“对高兴趣品类支付意愿更高”

### 6.9 产品判断

这套漏斗的本质不是“先随便聚类再想办法解释”，而是：

> 先用 `behavior/context` 和 trait 问题把洞察放进正确轨道，再决定它是 trait 信号还是普通洞察。

这样做的结果是：

- Persona 更容易形成稳定协议
- 标签更容易服务于 Journey 与 trait
- 洞察不会为了喂性格层而被错误压缩

## 7. 层间依赖规则

四层之间的依赖关系如下：

- 基础信息层可以独立存在
- 行为洞察层和场景洞察层依赖证据与分析
- 性格特征层依赖行为洞察层与场景洞察层
- Journey 读取 Persona 时，应优先读取基础信息和性格特征，并按需引用洞察摘要

派生摘要区的依赖关系：

- 需求 / 偏好 / 雷点依赖行为洞察层与场景洞察层
- 它们不直接从原始证据层生成正式结果
- 它们不属于 traits 的参数推导公式部分

Persona 骨架的依赖关系：

- Persona 骨架依赖已生成的洞察卡
- 基础信息层可参考 Persona 骨架补全，但不反过来主导骨架
- 洞察卡自动编排优先依据 Persona 骨架，而不是完整基础信息

不推荐的方向：

- Journey 直接读取全部原声
- Journey 运行时重新从证据层临时拼 Persona
- 在没有确认洞察的前提下直接生产正式性格参数

## 8. Journey 消费边界

Journey 对 Persona 的消费边界建议如下：

- 基础信息：直接可读
- 性格特征：作为稳定参数直接可读
- 需求 / 偏好 / 雷点：作为高频摘要上下文直接可读
- 行为洞察：作为解释性补充上下文可读
- 场景洞察：作为情境补充上下文可读
- 原始证据：默认不直接进入 Journey 推演主输入

这样做的目的是：

- 保持 Journey 输入稳定
- 避免把原始噪音直接带入推演
- 保留 Persona 作为上游资产的价值

### 8.1 单 Persona run 输出边界

Journey 在单个 Persona 视角下的推演结果，不建议直接产出一份完整成品图，而应产出可被汇总层消费的结构化结果。

单 Persona run 至少应返回：

- `personaId`
- `scenario`
- 针对默认流程骨架各阶段 / 步骤的判断结果
- 用户想法
- 用户感受
- 用户行为
- 痛点
- 痒点
- 爽点
- 关键发现摘要

这里的重点是为汇总层提供稳定输入，而不是让前端展示多份并列成品。

### 8.2 Journey 最终汇总结构

Journey 最终主交付建议固定为三层：

1. 默认流程层
2. Persona 推演汇总层
3. 汇总分析层

默认流程层负责定义：

- 阶段
- 步骤
- 触点

Persona 推演汇总层负责承接多个 Persona 独立推演后的合并结果，核心字段包括：

- 用户想法
- 用户感受
- 用户行为
- 痛点
- 痒点
- 爽点

汇总分析层负责解释结果意味着什么，至少包括：

- 机会点
- 差异分析

### 8.3 汇总约束

- 最终对外主成品只有一份 Journey
- Persona 间差异需要保留，但进入汇总展示和分析层
- 汇总层不能脱离各 Persona run 结果重新发明故事
- 原始证据不直接进入汇总层

## 9. MVP 范围建议

MVP 阶段不建议把所有内容都做成复杂工作台。

优先级建议：

1. 先把四层结构和对象协议固定
2. 先支持导入证据、生成候选洞察卡片、确认 Persona traits
3. 先让 Journey 能读取基础信息、traits 和部分洞察摘要
4. 后续再扩展更复杂的研究编排、批量聚类和多 Persona 管理

一句话总结：

> Persona 第一版不是“完整研究系统”，而是“把证据整理成可被 Journey 消费的 Persona 资产协议”。
