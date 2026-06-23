# PRD：Persona 导入、资产协议与 Journey 消费

更新日期：2026-06-22

## 文档关系

这份文档是 Persona 板块的总纲 PRD，用于说明：

- 为什么要做
- 用户问题是什么
- 解决方案边界是什么
- 应按哪些实现边界推进

配套文档关系如下：

- [persona-data-protocol.md](./persona-data-protocol.md)
  - 负责 Persona 的数据协议、对象结构、生成流程、编排规则，以及单 Persona run 与 Journey 汇总结构
- [persona-tag-dictionary.md](./persona-tag-dictionary.md)
  - 负责受控标签字典、标签展示规则、trait 映射和轻量打分公式
- [journey-map-tool.md](./journey-map-tool.md)
  - 负责 Journey 工作台的入口、执行模型、三层输出结构和扣费边界

阅读顺序建议：

1. 先读本 PRD，理解产品目标与实现边界
2. 再读 `persona-data-protocol.md`，理解正式协议与流程
3. 最后读 `persona-tag-dictionary.md`，理解标签与 trait 推导细节

## Problem Statement

当前 Persona 板块的设计已经在协议层基本收敛，但仍分散在多份草案文档中，还没有一份正式 PRD 把导入、洞察生成、画像初稿、右侧数据池、性格特征推导和 Journey 消费边界收成单一闭环。

从用户视角看，问题不是“怎么手动写一页用户画像”，而是：

- 调研资料很重，整理和分类成本高
- Persona 必须成为可复用的上游资产，而不是静态展示页
- 系统要自动产出一个能用的 Persona 初稿，同时保留证据追溯能力
- Persona 不能成为互相冲突特征的脏画像
- Journey 必须消费稳定 Persona 资产，而不是临时聊天内容或原始证据

## Solution

实现一个以 Persona 为上游资产的导入式工作流：

1. 用户导入定性或定量调研
2. 系统先生成 `behavior/context` 洞察卡
3. 系统按洞察卡聚合出 `1-n` 个 Persona 骨架
4. 系统生成 Persona 初稿，并把 `fit = high` 的洞察自动编排进入 Persona
5. `fit = medium | low` 的洞察保留在右侧数据池
6. 系统基于已纳入洞察生成基础信息、性格特征，以及 `需求 / 偏好 / 雷点`
7. 用户在正式 Persona 初稿上微调，并按需把右侧池洞察拖入或移出
8. Journey 只消费 Persona 的稳定资产层，不直接以原始证据作为主输入

Persona 本质上不是“统计平均人”，而是“内部一致、特征突出、可用于 Journey 推演的典型模式”。

## User Stories

1. 作为服务设计学生，我希望导入调研资料后能立即得到 Persona 初稿，这样我就不需要从空白页开始。
2. 作为服务设计师，我希望导入证据始终可追溯，这样我能信任 Persona 结论的来源。
3. 作为用户，我希望导入原声不可被直接改写，这样证据层不会在编辑过程中被污染。
4. 作为用户，我希望手动补充内容被清楚标记为手动原声，这样它不会和导入资料混淆。
5. 作为用户，我希望系统先把资料拆成行为洞察和场景洞察，这样稳定模式和具体情境反应不会混在一起。
6. 作为用户，我希望每张洞察卡只表达一个清晰主题，这样它更容易理解和编辑。
7. 作为用户，我希望洞察卡展示样本量、来源和可信度，这样我能判断总结是否可靠。
8. 作为用户，我希望只有高适配卡被自动编排进 Persona，这样我后续清理成本更低。
9. 作为用户，我希望中低适配卡留在右侧池，这样我可以自己决定是否拖入 Persona。
10. 作为用户，我希望低适配卡也仍然可用，这样系统不会直接否定我的判断。
11. 作为用户，我希望右侧池表示“未自动编排的洞察”，而不是“垃圾内容”，这样我能理解它的用途。
12. 作为用户，我希望一次导入可以生成多个 Persona 初稿，这样核心冲突会被拆开，而不是混进一个画像里。
13. 作为用户，我希望当核心模式冲突时系统自动拆分 Persona，这样每个 Persona 都保持内部一致。
14. 作为用户，我希望局部例外保留为补充，而不是污染主画像。
15. 作为用户，我希望每个 Persona 骨架都有分群名和一句话总结，这样我可以快速区分多个 Persona。
16. 作为用户，我希望分群名遵循统一命名规范，这样 Persona 看起来像系统产物，而不是随机文案。
17. 作为用户，我希望最终画像里有一个模拟姓名，而不是直接把分群名当作人物姓名。
18. 作为用户，我希望即使其他人口统计字段留空，系统也会生成可读的模拟姓名，这样 Persona 仍然易读。
19. 作为用户，我希望证据不足的人口统计字段保持空白，而不是被 AI 猜出来，这样结果不会伪精确。
20. 作为用户，我希望系统使用受控标签字典，而不是自由标签，这样 Persona 结构能被稳定复用。
21. 作为用户，我希望标签前端显示中文，但系统内部保持稳定英文 id，这样 UI 可读而协议不乱。
22. 作为用户，我希望性格特征由标签和洞察推导出来，而不是靠随意手填，这样 trait 层有依据。
23. 作为用户，我希望 trait 值由 AI 建议、由我确认，这样我保留最终判断权。
24. 作为用户，我希望系统只提炼少量核心的需求、偏好、雷点，这样 Persona 摘要保持简洁。
25. 作为用户，我希望需求、偏好、雷点来自洞察层，而不是漂浮的自由文案，这样 Persona 保持一致。
26. 作为用户，我希望 `confidence` 表达“这张卡总结稳不稳”，这样我不会把它误解为编排判断。
27. 作为用户，我希望 `fit` 表达“这张卡适不适合进入当前 Persona”，这样自动编排更可解释。
28. 作为用户，我希望 `fit` 只在初稿生成时计算，而不是编辑时不断变化，这样系统更稳定。
29. 作为用户，我希望后续如果需要重算，是我主动触发“重新分析”，而不是系统自己不断跳动。
30. 作为 Journey 用户，我希望 Journey 消费 Persona 的稳定输出，而不是直接吃原始证据，这样下游结果更稳定。
31. 作为产品负责人，我希望 Persona 仍然是免费或低门槛入口，这样用户可以先形成上游资产再进入付费环节。
32. 作为产品负责人，我希望 Persona 初稿生成虽然免费或低门槛，但仍有 AI 使用边界，这样它不会变成无限成本入口。
33. 作为实现 agent，我希望这个需求按清晰边界拆开，这样可以分模块实现和测试。
34. 作为 reviewer，我希望命名、trait、编排等关键规则都有单一真源，这样实现时不会漂移。

## Implementation Decisions

- 本次工作按四个实现边界组织：
  - Persona import result
  - Persona document
  - Insight classification and placement
  - Journey persona consumption
- 单个 Persona 与单次导入结果分开建模：
  - `PersonaDocument` 表示单个正式 Persona 资产
  - `PersonaImportResult` 表示一次导入批次，包括共享证据、多个 Persona 初稿和一个共享右侧池
- PersonaDocument 保留以下稳定结构：
  - Persona 骨架
  - 基础信息
  - 行为洞察
  - 场景洞察
  - 性格特征
  - 需求 / 偏好 / 雷点摘要
- Persona 骨架是聚类和自动编排的锚点，不是完整人物资料页。
- Persona 骨架只保留：
  - `segmentName`
  - `summary`
  - `seedInsightIds`
- 命名真源明确区分：
  - `skeleton.segmentName` 是分群名
  - `skeleton.summary` 是分群一句话描述
  - `profile.name` 是模拟姓名
- `segmentName` 采用固定命名模式：
  - `[主特征][次特征]型用户`
- 基础信息采用保守填充策略：
  - `profile.name` 必生成
  - 其他人口统计字段只有在证据充分时才生成候选值
  - 证据不足时保持空白
- 证据层分为导入原声和手动原声两类：
  - 导入原声不可直接改写
  - 手动原声单独记录，不伪装成导入证据
- 行为洞察和场景洞察共用一套 `InsightCard` 协议，只通过 `kind` 区分。
- `InsightCard` 只保留最终 `semanticTags`，不把候选标签过程作为正式持久化状态。
- `InsightCard` 的正式字段包括：
  - `summary`
  - `semanticTags`
  - `evidenceIds`
  - `sourceLabels`
  - `sampleSize`
  - `confidence`
  - `fit`
  - `placement`
- `confidence` 和 `fit` 明确分离：
  - `confidence` 表示总结可靠性
  - `fit` 表示与当前 Persona 的适配程度
- 只有 `fit = high` 的卡自动进入 Persona。
- `fit = medium | low` 的卡默认留在右侧池，但都允许用户手动拖入 Persona。
- 右侧池不是废弃区，而是“本次导入中未自动编排的洞察集合”。
- 第一版不做实时动态适配度重算。
- Persona 生成不允许把强冲突的核心模式压成一个“平均人”。
- 典型的拆分触发维度包括：
  - 价格敏感 vs 价格不敏感
  - 等待耐受低 vs 等待耐受高
  - 自助倾向高 vs 依赖协助高
  - 愿意尝试新选项 vs 明显回避不确定性
- 局部例外不自动触发 Persona 拆分。
- 性格特征层由受控标签通过固定的轻量映射规则推导，并保留 `suggested` 与 `confirmed` 的区分。
- 需求、偏好、雷点属于派生摘要层，不是数值参数层。
- Journey 只消费稳定 Persona 资产：
  - 基础信息
  - 已确认 traits
  - 需求 / 偏好 / 雷点
  - 必要时补充少量洞察摘要
- Journey 不以原始证据作为主输入。
- Journey 的执行模型固定为：
  - 多 Persona 独立推演
  - 单份 Journey 汇总输出
- Journey 的最终主交付固定为三层：
  - 默认流程层
  - Persona 推演汇总层
  - 汇总分析层
- Persona 仍然是免费或低门槛入口，但 Persona 初稿生成必须受模型、次数或输入规模边界约束。
- 首个明确付费点仍然是 Journey 结果生成。

## Testing Decisions

- 好的测试应验证边界行为和外部结果，而不是 prompt 文案或内部 helper 实现。
- 优先测试以下边界：
  - 导入结果是否能形成 `PersonaImportResult`
  - 是否能从洞察卡生成 Persona 骨架与 PersonaDocument
  - 洞察卡的 `confidence / fit / placement` 是否按规则工作
  - Journey 是否只读取稳定 Persona 资产
- 导入结果测试应覆盖：
  - 一次导入可以产出多个 Persona 初稿
  - 一次导入有一个共享右侧池
  - 高适配卡不会留在右侧池
- PersonaDocument 测试应覆盖：
  - `profile.name` 一定生成
  - 证据不足的人口统计字段保持空白
  - 分群名、分群摘要、模拟姓名不漂移
- InsightCard 测试应覆盖：
  - 行为卡和场景卡共用一套 schema
  - `confidence` 与 `fit` 的意义分离
  - 只有 `fit = high` 自动进入 Persona
- Persona 拆分测试应覆盖：
  - 强核心冲突会拆成多个 Persona 骨架
  - 局部例外不会直接拆分
- Trait 测试应覆盖：
  - 受控标签驱动轻量加权公式
  - `suggested` 与 `confirmed` 保持分离
- Journey 消费测试应覆盖：
  - Journey 读取基础信息、traits 和摘要层
  - Journey 不直接依赖原始证据

## Out of Scope

- 编辑时的实时动态适配度重算
- 无限免费的 Persona 生成
- 用户自由创建标签
- 让 Journey 直接以原始证据作为 Persona 主输入
- Persona 板块的最终视觉润色
- traits 维度扩展到四个以外
- 研究工作台级别的完整研究运营能力

## Further Notes

- Persona 不是静态模板页，而是 Journey 的上游结构化资产系统。
- 右侧池是主动设计，不是降级处理。它的目的就是只自动编排高适配内容，降低用户整理成本。
- 产品应优先生成“内部一致、特征突出”的 Persona，而不是“平均人”。
- 分群名和模拟姓名必须在产品语言和数据协议中保持分离。
- 这份 PRD 只收口 Persona 板块当前已经稳定下来的设计，不额外扩 scope。
