---
name: journey-map-editor
description: Guide AI conversations that clarify requirements and produce safe, structured updates for a user journey map. Use when users describe a service scenario, ask to create or revise journey stages, rows, cells, target users, user goals, text/image/emotion rows, or provide screenshots that should inform a journey map.
---

# 用户旅程图编辑

## 工作流

调用方会提供正式的工具 document、工具上下文和完整对话，而不只是页面临时状态。

1. 读取当前旅程图和完整对话。
2. 判断信息是否足以形成可靠修改。
3. 信息不足时返回 `clarify`，一次只问 1-3 个最关键问题。
4. 信息充分时返回 `proposal`，说明修改摘要并给出完整候选旅程图。
5. 用户明确确认前，不得声称修改已经生效。
6. 用户确认后由应用程序执行候选版本；模型不直接操作界面。

## 判断是否需要澄清

遇到以下情况优先澄清：

- 服务对象、使用场景或用户目标不明确。
- 用户要求“优化”“完善”，但未说明问题或期望结果。
- 新增阶段会明显改变旅程边界，但开始和结束范围不明确。
- 截图包含多种可能的业务流程，无法判断哪一种属于当前旅程。

以下情况可以直接提案：

- 用户明确指定要修改的阶段、行、单元格或元数据。
- 用户提供了足够完整的服务流程，可据此生成初稿。
- 修改是局部、可逆且不会改变旅程范围。

## 内容规则

- 阶段按时间顺序排列，名称使用简洁的动宾或状态短语。
- 一般保持 4-8 个阶段；超出时应说明原因。
- 行标题描述同一分析维度，例如用户行为、触点、痛点、情绪、机会点。
- 文字行使用具体、可观察的描述，避免空泛评价。
- 情绪值限定为 1-5，备注说明原因而不只写“开心”“不满”。
- 图片行只在图片有分析价值时使用，不得编造图片 URL。
- 保留用户未要求修改的已有内容。
- 可以自主增加行或阶段，但必须在摘要中明确列出。
- 不要删除已有行或阶段，除非用户明确要求，或先在澄清中获得同意。
- 目标用户描述具体人群和关键情境；用户目标描述用户希望达成的结果。

## 输出协议

只输出一个 JSON 对象，不添加 Markdown 代码块或额外文本。

读取并严格遵守 [response-schema.md](references/response-schema.md)。

### 澄清

```json
{
  "phase": "clarify",
  "message": "为了准确更新旅程图，我需要确认……",
  "questions": ["问题 1"]
}
```

### 修改提案

```json
{
  "phase": "proposal",
  "message": "我已整理出修改方案。",
  "proposal": {
    "summary": ["更新目标用户", "增加“确认结果”阶段"],
    "journey": {}
  }
}
```

候选旅程图必须完整，可由应用程序独立渲染。保留已有对象的 `id`；新增对象的 `id` 使用空字符串，由应用程序生成。

### 普通说明

```json
{
  "phase": "message",
  "message": "说明内容"
}
```
