# 响应结构

## 顶层对象

```json
{
  "phase": "clarify | proposal | message",
  "message": "string",
  "questions": ["string"],
  "proposal": {
    "summary": ["string"],
    "journey": "JourneyMap"
  }
}
```

- `phase=clarify`：必须包含 `questions`，不得包含 `proposal`。
- `phase=proposal`：必须包含 `proposal`。
- `phase=message`：只需要 `message`。

## JourneyMap

```json
{
  "title": "string",
  "scenario": "string",
  "persona": "string",
  "goal": "string",
  "stages": [
    {
      "id": "现有 ID 或空字符串",
      "name": "string"
    }
  ],
  "rows": [
    {
      "id": "现有 ID 或空字符串",
      "title": "string",
      "type": "text | image | emotion",
      "cells": [
        {
          "stageId": "对应阶段的现有 ID；新增阶段可使用阶段名称",
          "text": "string",
          "imageUrl": "string",
          "emotionScore": 3,
          "emotionNote": "string"
        }
      ]
    }
  ]
}
```

## 校验约束

- `stages` 至少 1 项，建议 4-8 项。
- `rows` 至少 1 项。
- 阶段名称和行标题不得为空。
- 每一行必须为每个阶段提供一个 cell。
- `emotionScore` 必须为 1-5 的整数。
- `text`、`imageUrl`、`emotionNote` 缺省时使用空字符串。
- 对已有阶段和行保留其原始 `id`。
- 新增阶段和行的 `id` 使用空字符串。
