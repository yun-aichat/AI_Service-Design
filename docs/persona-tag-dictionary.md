# Persona v0.1 受控标签字典与性格映射

更新日期：2026-06-19

## 1. 目标

这份文档用于固定 Persona 第一版的：

1. 受控标签字典
2. 标签展示规则
3. 标签生成方式
4. 标签到性格特征层的映射关系

当前原则：

> 标签不是让 AI 自己自由生成，而是由系统维护字典，AI 只负责从字典中匹配候选标签。

## 2. 基本规则

### 2.1 标签生成规则

标签的生成链路固定为：

1. 产品预先定义一套受控标签字典
2. AI 读取 `InsightCard.summary`、关联原声、来源和 `kind`
3. AI 从字典中选择 `0-3` 个最匹配标签
4. 系统写入候选标签
5. 用户只允许确认、删除或替换为字典中的其他标签

MVP 阶段不允许：

- AI 自由发明新标签
- 用户自由输入新标签

### 2.2 展示规则

每个标签都应同时具有：

- 稳定英文 `id`
- 前端显示中文 `label`
- 简短说明 `description`

推荐结构：

```ts
type PersonaTag = {
  id: string
  label: string
  description: string
  kind: "behavior" | "context"
}
```

说明：

- 英文 `id` 供系统、AI、映射规则和存储使用
- 中文 `label` 供前端展示
- 前端默认展示中文，不直接暴露英文 `id`

## 3. Persona v0.1 最小标签字典

### 3.1 行为标签

| id | 中文显示 | 说明 |
|---|---|---|
| `price_sensitivity_high` | 价格敏感高 | 对价格变化、优惠和成本较敏感 |
| `price_sensitivity_low` | 价格敏感低 | 不容易因价格小幅变化改变选择 |
| `research_depth_high` | 信息研究深入 | 决策前会主动查资料、比较与验证 |
| `research_depth_low` | 信息研究较少 | 决策前不倾向做大量资料收集 |
| `decision_speed_fast` | 决策速度快 | 倾向较快做决定，不长时间比较 |
| `decision_speed_slow` | 决策速度慢 | 倾向反复比较后再决定 |
| `self_service_preference_high` | 自助倾向高 | 更愿意自己完成操作和解决问题 |
| `assisted_service_preference_high` | 依赖协助高 | 更愿意找人帮助或依赖人工服务 |
| `official_channel_preference_high` | 官方渠道偏好高 | 更相信官方入口、官方信息和官方流程 |
| `peer_recommendation_reliance_high` | 熟人推荐依赖高 | 容易受朋友、同事、熟人推荐影响 |

### 3.2 情境标签

| id | 中文显示 | 说明 |
|---|---|---|
| `waiting_tolerance_low` | 等待耐受低 | 等待稍久就容易不耐烦或烦躁 |
| `waiting_tolerance_high` | 等待耐受高 | 能接受较长等待时间 |
| `time_pressure_high` | 时间压力高 | 当前场景下对时间非常敏感 |
| `queue_anxiety_high` | 排队焦虑高 | 在排队、拥挤、延迟时容易焦虑 |
| `uncertainty_avoidance_high` | 回避不确定性高 | 面对未知选项更倾向规避风险 |
| `novelty_seeking_high` | 愿意尝试新选项 | 面对新方式、新品牌、新体验更愿意尝试 |
| `on_site_help_seeking_high` | 现场求助倾向高 | 到现场遇到问题时更倾向找人求助 |
| `promotion_response_high` | 对促销反应高 | 在折扣、优惠、赠品等刺激下更容易行动 |
| `social_influence_high` | 社交影响强 | 容易受周围人行为或意见带动 |
| `plan_ahead_high` | 提前规划倾向高 | 倾向提前准备、预约、比较和规划 |

## 4. AI 标注输入与输出

### 4.1 AI 标注输入

AI 给 `InsightCard` 标注时，至少读取：

- `kind`
- `summary`
- `sourceLabels`
- 关联 `EvidenceItem.quote`

### 4.2 AI 标注输出

AI 对每张卡片的输出不应是自由标签文本，而应是：

```ts
type TagSuggestion = {
  tagId: string
  reason: string
  confidence: "low" | "medium" | "high"
}
```

推荐要求：

- 每张卡片最多推荐 `3` 个标签
- 如果没有足够把握，可以推荐 `0` 个
- 优先少而准，不追求一张卡片贴很多标签

## 5. 标签到性格特征层的映射规则

当前 Persona 第一版性格特征层包含：

- `patienceTolerance`
- `riskTolerance`
- `autonomy`
- `trustTendency`

映射原则：

1. 不是每个标签都必须映射到性格特征
2. 同一个标签可以是“强信号”或“弱信号”
3. trait 候选值由多个标签综合判断，不做单标签机械定分
4. 当标签间冲突时，应降低置信度，而不是直接平均

## 6. v0.1 映射表

### 6.1 映射到 `patienceTolerance`

| 标签 id | 影响方向 | 强度 | 说明 |
|---|---|---|---|
| `waiting_tolerance_low` | 降低 | 强 | 明确指向耐心较低 |
| `queue_anxiety_high` | 降低 | 中 | 排队焦虑通常伴随较低等待耐受 |
| `time_pressure_high` | 降低 | 弱 | 可能是情境压力，不一定是稳定性格 |
| `waiting_tolerance_high` | 提高 | 强 | 明确指向耐心较高 |
| `plan_ahead_high` | 提高 | 弱 | 提前规划可能提升对等待的容忍度，但不是直接证据 |

### 6.2 映射到 `riskTolerance`

| 标签 id | 影响方向 | 强度 | 说明 |
|---|---|---|---|
| `uncertainty_avoidance_high` | 降低 | 强 | 明确偏向规避风险 |
| `research_depth_high` | 降低 | 中 | 深入研究常与谨慎决策相关，但不是绝对 |
| `decision_speed_slow` | 降低 | 弱 | 决策慢可能意味着更谨慎 |
| `novelty_seeking_high` | 提高 | 强 | 明确更愿意尝试未知选项 |
| `decision_speed_fast` | 提高 | 弱 | 决策快有时更敢尝试，但证据较弱 |

### 6.3 映射到 `autonomy`

| 标签 id | 影响方向 | 强度 | 说明 |
|---|---|---|---|
| `self_service_preference_high` | 提高 | 强 | 明确偏向自助处理 |
| `plan_ahead_high` | 提高 | 弱 | 提前准备常与较强自主性相关 |
| `research_depth_high` | 提高 | 弱 | 主动研究往往意味着更愿意自己解决 |
| `assisted_service_preference_high` | 降低 | 强 | 明确偏向依赖协助 |
| `on_site_help_seeking_high` | 降低 | 中 | 现场遇事更倾向求助 |

### 6.4 映射到 `trustTendency`

| 标签 id | 影响方向 | 强度 | 说明 |
|---|---|---|---|
| `official_channel_preference_high` | 提高 | 中 | 更信官方路径，但不等于无条件信任 |
| `peer_recommendation_reliance_high` | 降低 | 弱 | 更依赖熟人而非服务方自身，可能意味着对官方承诺保留 |
| `uncertainty_avoidance_high` | 降低 | 弱 | 对未知更谨慎，可能伴随较低基础信任 |

说明：

- `trustTendency` 最容易被误判，第一版应保守处理
- 没有足够证据时，应给低置信度，而不是强行打高低分

## 7. 建议的 trait 推导方式

MVP 阶段不建议使用“平均分公式”。

更建议采用：

1. AI 先识别候选标签
2. 系统按映射表找出相关 trait 信号
3. AI 基于信号组合给出：
   - `suggested`
   - `confidence`
   - `rationale`
4. 用户确认后写入 `confirmed`

这意味着：

- 映射表负责提供“哪些标签影响哪个 trait”
- 最终 trait 值仍是“自动建议 + 人工确认”
- 不是机械加总后直接写死

### 7.1 Trait Suggested Score v0.1

为了让 `suggested` 值可执行，第一版采用轻量固定算法。

#### 基本规则

1. 每个 trait 的基线分数为 `3`
2. 每个命中的标签根据映射表贡献一个信号值
3. 所有信号值累加后得到 `rawScore`
4. `rawScore` 经过截断和取整后得到 `suggested`
5. `confidence` 根据信号数量、一致性和冲突程度计算

推荐结构：

```ts
type TraitId =
  | "patienceTolerance"
  | "riskTolerance"
  | "autonomy"
  | "trustTendency"

type TraitSignal = {
  trait: TraitId
  direction: -1 | 1
  weight: 0.25 | 0.5 | 1
}
```

#### 权重约定

- 强信号 = `1`
- 中信号 = `0.5`
- 弱信号 = `0.25`

对应到映射表中的“强度”：

- `强` -> `1`
- `中` -> `0.5`
- `弱` -> `0.25`

#### 计算公式

```ts
rawScore = 3 + sum(direction * weight)
suggested = clamp(Math.round(rawScore), 1, 5)
```

说明：

- `clamp` 表示把结果限制在 `1-5`
- 默认基线从中间值 `3` 开始
- 标签只负责把分数往高或低推动，不直接决定最终值

#### 示例

如果某个 Persona 命中了这些标签：

- `waiting_tolerance_low` -> `patienceTolerance -1`
- `queue_anxiety_high` -> `patienceTolerance -0.5`
- `plan_ahead_high` -> `patienceTolerance +0.25`

则：

```ts
rawScore = 3 - 1 - 0.5 + 0.25
rawScore = 1.75
suggested = 2
```

#### confidence 规则建议

第一版 `confidence` 不需要复杂概率模型，先按以下逻辑：

- 命中有效标签少于 `2` 个 -> `low`
- 命中标签大多同向，且总绝对权重较高 -> `high`
- 命中标签较少但方向一致 -> `medium`
- 正负信号明显冲突 -> 降一级置信度

可执行建议：

```ts
if (signalCount < 2) confidence = "low"
else if (hasStrongConflict) confidence = "low"
else if (totalAbsWeight >= 1.5 && sameDirectionRatio >= 0.75) confidence = "high"
else confidence = "medium"
```

#### 用户权限边界

这套公式属于系统规则，不交给用户编辑。

- 用户不能修改标签到 trait 的映射关系
- 用户不能修改标签权重
- 用户不能修改 `suggested` 的计算公式
- 用户只能确认或调整最终 `confirmed` 值

这样可以保证：

- 同类 Persona 的推导逻辑一致
- 标签与 trait 层不会因为用户随意改规则而失配
- 用户仍然保有最终画像确认权

## 8. 前端展示建议

前端标签展示建议：

- 默认展示中文标签
- 支持 hover 或详情查看标签说明
- 不向普通用户展示英文 `id`
- 用户只能：
  - 接受候选标签
  - 删除候选标签
  - 从系统字典中替换为其他标签

不支持：

- 自由输入新标签
- 修改标签英文 `id`

## 9. 当前结论

当前 Persona v0.1 标签体系的核心规则可以固定为：

- 标签字典由系统维护
- 前端显示中文，系统使用稳定英文 `id`
- AI 不负责创造标签，只负责从字典中匹配候选标签
- 用户不输入新标签，只确认或调整系统已有标签
- 性格特征层由标签信号间接支持，但不做简单平均

一句话总结：

> 先有受控标签字典，再让 AI 做标签匹配，最后再用映射关系支撑性格特征层推导。
