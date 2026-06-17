import type {
  ToolCommand,
  ToolDefinition,
  ToolDocument,
  ToolExportArtifact,
} from "../../domain/tool-runtime"
import designTokens from "../../design-system/design-tokens.json"

export type RowType = "text" | "image" | "emotion"

export type JourneyStage = {
  id: string
  name: string
}

export type JourneyCell = {
  text: string
  imageUrl: string
  emotionScore: number
  emotionNote: string
}

export type JourneyRow = {
  id: string
  title: string
  type: RowType
  cells: Record<string, JourneyCell>
}

export type JourneyMap = {
  title: string
  scenario: string
  persona: string
  goal: string
  stages: JourneyStage[]
  rows: JourneyRow[]
}

export type JourneyProposal = {
  summary: string[]
  journey: {
    title?: string
    scenario?: string
    persona?: string
    goal?: string
    stages?: Array<{ id?: string; name?: string }>
    rows?: Array<{
      id?: string
      title?: string
      type?: RowType
      cells?: Array<Partial<JourneyCell> & { stageId?: string }>
    }>
  }
}

export const defaultStages = [
  "发现需求",
  "了解服务",
  "完成预约",
  "到店服务",
  "服务后跟进",
  "再次使用",
  "问题处理",
  "推荐分享",
]

export const EMOTION_NOTE_MAX_UNITS = 32
export const EMOTION_NOTE_UNITS_PER_LINE = 16
export const EMOTION_NOTE_MAX_WIDTH = 220
export const EMOTION_NOTE_MAX_HEIGHT = 46

const textTemplates = {
  userActions: [
    "意识到需要服务\n搜索可用门店或服务入口",
    "查看服务内容\n比较时间、价格和评价",
    "选择门店与时间\n填写预约信息",
    "按预约时间到店\n确认排队和服务流程",
    "查看服务结果\n接收后续提醒或反馈邀请",
  ],
  touchpoints: [
    "搜索引擎\n朋友推荐",
    "官网\n小程序\n客服",
    "预约表单\n短信通知",
    "门店前台\n叫号系统",
    "短信\nApp 消息",
  ],
  painPoints: [
    "不知道哪个入口最可靠\n服务说明不清晰",
    "信息分散\n价格和时间规则不透明",
    "可预约时间少\n确认信息不充分",
    "等待时间不确定\n现场流程不一致",
    "服务结果缺少解释\n反馈响应不明确",
  ],
  opportunities: [
    "提供清晰的服务入口和适用说明",
    "整合服务详情、价格、评价和可用时间",
    "简化预约表单并强化确认反馈",
    "同步现场等待状态和下一步提示",
    "提供结果说明、问题追踪和复购提醒",
  ],
}

const emotionTemplates = [
  { score: 3, note: "焦虑 / 期待" },
  { score: 3, note: "犹豫 / 比较" },
  { score: 4, note: "谨慎 / 希望确认" },
  { score: 2, note: "不确定 / 等待" },
  { score: 4, note: "放松 / 评价" },
]

export type JourneyMapCommand =
  | ToolCommand<
      "journey-map.update-meta",
      Partial<Pick<JourneyMap, "title" | "scenario" | "persona" | "goal">>
    >
  | ToolCommand<"journey-map.add-stage", Record<string, never>>
  | ToolCommand<"journey-map.delete-stage", { stageId: string }>
  | ToolCommand<"journey-map.update-stage", { stageId: string; name: string }>
  | ToolCommand<"journey-map.add-row", { type: RowType }>
  | ToolCommand<
      "journey-map.delete-row",
      {
        rowId: string
      }
    >
  | ToolCommand<
      "journey-map.update-row",
      {
        rowId: string
        updates: Partial<Pick<JourneyRow, "title" | "type">>
      }
    >
  | ToolCommand<
      "journey-map.update-cell",
      {
        rowId: string
        stageId: string
        updates: Partial<JourneyCell>
      }
    >
  | ToolCommand<
      "journey-map.apply-proposal",
      {
        proposal: JourneyProposal["journey"]
      }
    >

type JourneyProposalCommandInput = {
  id: string
  expectedRevision: number
  issuedAt: string
  actor?: ToolCommand["actor"]
  proposal: JourneyProposal["journey"]
}

export function getEmotionCharUnits(char: string) {
  if (char === "\n") return EMOTION_NOTE_UNITS_PER_LINE
  if (
    /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af\u1100-\u11ff]/u.test(
      char,
    )
  ) {
    return 1
  }
  if (/[\uff01-\uff60\uffe0-\uffe6]/u.test(char)) return 1
  if (char.codePointAt(0)! > 0xffff) return 1
  return 0.5
}

export function trimEmotionNoteByUnits(value: string, maxUnits: number) {
  let units = 0
  let result = ""
  for (const char of value) {
    const nextUnits = units + getEmotionCharUnits(char)
    if (nextUnits > maxUnits) break
    units = nextUnits
    result += char
  }
  return result
}

export function getEmotionNoteUnits(value: string) {
  let units = 0
  for (const char of value) units += getEmotionCharUnits(char)
  return units
}

export function getEmotionLongestLineUnits(value: string) {
  return value
    .split("\n")
    .reduce(
      (maxUnits, line) => Math.max(maxUnits, getEmotionNoteUnits(line)),
      0,
    )
}

export function createJourney(stageCount = 5): JourneyMap {
  const stages = Array.from({ length: stageCount }, (_, index) =>
    createStage(index),
  )
  return {
    title: "门店预约服务用户旅程图",
    scenario:
      "用户想通过线上渠道预约一次线下门店服务，但需要确认时间、门店、服务内容和到店后的等待情况。",
    persona: "需要快速预约到店服务的用户",
    goal: "顺利预约、到店并完成服务",
    stages,
    rows: [
      createRow("text", stages, 0, "用户行为"),
      createRow("text", stages, 1, "触点"),
      createRow("text", stages, 2, "痛点"),
      createRow("emotion", stages, 3, "情绪"),
      createRow("text", stages, 4, "机会点"),
    ],
  }
}

export function createStage(index: number): JourneyStage {
  return {
    id: `stage-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    name: defaultStages[index] || `阶段 ${index + 1}`,
  }
}

export function createRow(
  type: RowType,
  stages: JourneyStage[],
  rowIndex: number,
  title?: string,
): JourneyRow {
  const rowTitle =
    title ||
    (type === "text"
      ? `文字行 ${rowIndex + 1}`
      : type === "image"
        ? `图片行 ${rowIndex + 1}`
        : `情绪行 ${rowIndex + 1}`)

  return {
    id: `row-${Date.now()}-${rowIndex}-${Math.random().toString(16).slice(2)}`,
    title: rowTitle,
    type,
    cells: Object.fromEntries(
      stages.map((stage, index) => [stage.id, createCell(type, index, rowTitle)]),
    ),
  }
}

export function createCell(
  type: RowType,
  index: number,
  rowTitle: string,
): JourneyCell {
  const templateKey: keyof typeof textTemplates = rowTitle.includes("触点")
    ? "touchpoints"
    : rowTitle.includes("痛点")
      ? "painPoints"
      : rowTitle.includes("机会")
        ? "opportunities"
        : "userActions"
  const emotion = emotionTemplates[index % emotionTemplates.length]

  return {
    text:
      type === "text"
        ? textTemplates[templateKey][index % textTemplates[templateKey].length]
        : "",
    imageUrl: "",
    emotionScore: emotion.score,
    emotionNote: emotion.note,
  }
}

export function normalizeJourneyProposal(
  proposal: JourneyProposal["journey"],
  current: JourneyMap,
): JourneyMap {
  const existingStageIds = new Set(current.stages.map((stage) => stage.id))
  const proposedStages =
    Array.isArray(proposal.stages) && proposal.stages.length > 0
      ? proposal.stages
      : current.stages
  const stageAliases = new Map<string, string>()

  const stages = proposedStages.map((stage, index) => {
    const name = String(
      stage.name || current.stages[index]?.name || `阶段 ${index + 1}`,
    ).trim()
    const id =
      stage.id && existingStageIds.has(stage.id)
        ? stage.id
        : createStage(index).id
    if (stage.id) stageAliases.set(stage.id, id)
    stageAliases.set(name, id)
    return { id, name }
  })

  const existingRowIds = new Set(current.rows.map((row) => row.id))
  const proposedRows =
    Array.isArray(proposal.rows) && proposal.rows.length > 0
      ? proposal.rows
      : current.rows

  const rows = proposedRows.map((row, rowIndex) => {
    const type: RowType =
      row.type === "image" || row.type === "emotion" ? row.type : "text"
    const title = String(
      row.title || current.rows[rowIndex]?.title || `内容行 ${rowIndex + 1}`,
    ).trim()
    const id =
      row.id && existingRowIds.has(row.id)
        ? row.id
        : `row-${Date.now()}-${rowIndex}-${Math.random().toString(16).slice(2)}`
    const sourceCells = Array.isArray(row.cells) ? row.cells : []

    const cells = Object.fromEntries(
      stages.map((stage, stageIndex) => {
        const proposedStage = proposedStages[stageIndex]
        const source =
          sourceCells.find((cell) => {
            const resolved = cell.stageId
              ? stageAliases.get(cell.stageId) || cell.stageId
              : ""
            return resolved === stage.id || cell.stageId === proposedStage?.name
          }) || sourceCells[stageIndex]
        const fallback =
          current.rows.find((currentRow) => currentRow.id === row.id)?.cells[
            stage.id
          ] || createCell(type, stageIndex, title)

        return [
          stage.id,
          {
            text: String(source?.text ?? fallback.text ?? ""),
            imageUrl: String(source?.imageUrl ?? fallback.imageUrl ?? ""),
            emotionScore: Math.max(
              1,
              Math.min(
                5,
                Math.round(
                  Number(source?.emotionScore ?? fallback.emotionScore ?? 3),
                ),
              ),
            ),
            emotionNote: String(source?.emotionNote ?? fallback.emotionNote ?? ""),
          },
        ]
      }),
    )

    return { id, title, type, cells }
  })

  return {
    title: String(proposal.title || current.title),
    scenario: String(proposal.scenario ?? current.scenario),
    persona: String(proposal.persona ?? current.persona),
    goal: String(proposal.goal ?? current.goal),
    stages,
    rows,
  }
}

export function validateJourneyMap(input: unknown): JourneyMap {
  if (typeof input !== "object" || input === null) {
    return createJourney(5)
  }

  const candidate = input as Partial<JourneyMap>
  const fallback = createJourney(5)
  const stagesSource =
    Array.isArray(candidate.stages) && candidate.stages.length > 0
      ? candidate.stages
      : fallback.stages
  const stages = stagesSource.map((stage, index) => ({
    id:
      typeof stage?.id === "string" && stage.id.trim()
        ? stage.id
        : createStage(index).id,
    name: String(stage?.name || fallback.stages[index]?.name || `阶段 ${index + 1}`),
  }))

  const rowsSource =
    Array.isArray(candidate.rows) && candidate.rows.length > 0
      ? candidate.rows
      : fallback.rows
  const rows = rowsSource.map((row, rowIndex) => {
    const type: RowType =
      row?.type === "image" || row?.type === "emotion" ? row.type : "text"
    const title = String(
      row?.title ||
        fallback.rows[rowIndex]?.title ||
        (type === "text"
          ? `文字行 ${rowIndex + 1}`
          : type === "image"
            ? `图片行 ${rowIndex + 1}`
            : `情绪行 ${rowIndex + 1}`),
    )
    const cellsSource =
      typeof row?.cells === "object" && row.cells !== null ? row.cells : {}

    const cells = Object.fromEntries(
      stages.map((stage, stageIndex) => {
        const source = (cellsSource as Record<string, Partial<JourneyCell>>)[
          stage.id
        ]
        const fallbackCell = createCell(type, stageIndex, title)
        return [
          stage.id,
          {
            text: String(source?.text ?? fallbackCell.text ?? ""),
            imageUrl: String(source?.imageUrl ?? fallbackCell.imageUrl ?? ""),
            emotionScore: Math.max(
              1,
              Math.min(
                5,
                Math.round(
                  Number(source?.emotionScore ?? fallbackCell.emotionScore ?? 3),
                ),
              ),
            ),
            emotionNote: String(source?.emotionNote ?? fallbackCell.emotionNote ?? ""),
          },
        ]
      }),
    )

    return {
      id:
        typeof row?.id === "string" && row.id.trim()
          ? row.id
          : `row-${Date.now()}-${rowIndex}-${Math.random().toString(16).slice(2)}`,
      title,
      type,
      cells,
    }
  })

  return {
    title: String(candidate.title || fallback.title),
    scenario: String(candidate.scenario ?? fallback.scenario),
    persona: String(candidate.persona ?? fallback.persona),
    goal: String(candidate.goal ?? fallback.goal),
    stages,
    rows,
  }
}

export function applyJourneyMapCommand(
  document: Readonly<JourneyMap>,
  command: JourneyMapCommand,
): JourneyMap {
  switch (command.type) {
    case "journey-map.update-meta":
      return {
        ...document,
        ...command.payload,
      }
    case "journey-map.add-stage": {
      const stage = createStage(document.stages.length)
      return {
        ...document,
        stages: [...document.stages, stage],
        rows: document.rows.map((row) => ({
          ...row,
          cells: {
            ...row.cells,
            [stage.id]: createCell(row.type, document.stages.length, row.title),
          },
        })),
      }
    }
    case "journey-map.delete-stage": {
      if (document.stages.length <= 1) return document
      const nextStages = document.stages.filter(
        (stage) => stage.id !== command.payload.stageId,
      )
      return {
        ...document,
        stages: nextStages,
        rows: document.rows.map((row) => ({
          ...row,
          cells: Object.fromEntries(
            nextStages.map((stage, index) => [
              stage.id,
              row.cells[stage.id] ?? createCell(row.type, index, row.title),
            ]),
          ),
        })),
      }
    }
    case "journey-map.update-stage":
      return {
        ...document,
        stages: document.stages.map((stage) =>
          stage.id === command.payload.stageId
            ? { ...stage, name: command.payload.name }
            : stage,
        ),
      }
    case "journey-map.add-row":
      return {
        ...document,
        rows: [
          ...document.rows,
          createRow(
            command.payload.type,
            document.stages,
            document.rows.length,
          ),
        ],
      }
    case "journey-map.delete-row":
      if (document.rows.length <= 1) return document
      return {
        ...document,
        rows: document.rows.filter((row) => row.id !== command.payload.rowId),
      }
    case "journey-map.update-row":
      return {
        ...document,
        rows: document.rows.map((row) => {
          if (row.id !== command.payload.rowId) return row
          if (
            !command.payload.updates.type ||
            command.payload.updates.type === row.type
          ) {
            return {
              ...row,
              ...command.payload.updates,
            }
          }
          return {
            ...row,
            ...command.payload.updates,
            cells: Object.fromEntries(
              document.stages.map((stage, index) => [
                stage.id,
                createCell(command.payload.updates.type!, index, row.title),
              ]),
            ),
          }
        }),
      }
    case "journey-map.update-cell":
      return {
        ...document,
        rows: document.rows.map((row) =>
          row.id === command.payload.rowId
            ? {
                ...row,
                cells: {
                  ...row.cells,
                  [command.payload.stageId]: {
                    ...row.cells[command.payload.stageId],
                    ...command.payload.updates,
                  },
                },
              }
            : row,
        ),
      }
    case "journey-map.apply-proposal":
      return normalizeJourneyProposal(command.payload.proposal, document)
    default:
      return document
  }
}

export function createJourneyProposalCommand(
  input: JourneyProposalCommandInput,
): JourneyMapCommand {
  return {
    id: input.id,
    type: "journey-map.apply-proposal",
    payload: { proposal: input.proposal },
    expectedRevision: input.expectedRevision,
    issuedAt: input.issuedAt,
    actor: input.actor ?? { type: "assistant" },
  }
}

export function getJourneyExportBaseName(title: string) {
  return title.replace(/[\\/:*?"<>|]/g, "-") || "journey-map"
}

export function cellToText(row: JourneyRow, stageId: string) {
  const value = row.cells[stageId]
  if (!value) return ""
  if (row.type === "image") return value.imageUrl
  if (row.type === "emotion") return `${value.emotionScore}/5 ${value.emotionNote}`
  return value.text
}

export function cell(value: string) {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, "<br>")
}

export function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export function toMarkdown(journey: JourneyMap) {
  const lines = [
    `# ${journey.title}`,
    "",
    "## 场景",
    "",
    journey.scenario || "未填写",
    "",
    "## 用户旅程",
    "",
  ]
  lines.push(["| 维度 |", ...journey.stages.map((stage) => `${stage.name} |`)].join(" "))
  lines.push(["| --- |", ...journey.stages.map(() => "--- |")].join(" "))
  journey.rows.forEach((row) => {
    lines.push(
      `| ${cell(row.title)} | ${journey.stages
        .map((stage) => cell(cellToText(row, stage.id)))
        .join(" | ")} |`,
    )
  })
  return `${lines.join("\n")}\n`
}

export function toCsv(journey: JourneyMap) {
  const headers = ["维度", ...journey.stages.map((stage) => stage.name)]
  const records = journey.rows.map((row) => [
    row.title,
    ...journey.stages.map((stage) => cellToText(row, stage.id)),
  ])
  return [headers, ...records]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")
}

export function toSvg(journey: JourneyMap) {
  const exportTokens = designTokens.export.journeyMap
  const columnWidth = 240
  const labelWidth = 120
  const rowHeight = 132
  const headerHeight = 86
  const width = labelWidth + columnWidth * Math.max(journey.stages.length, 1)
  const height = headerHeight + rowHeight * journey.rows.length + 90
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
  const textLines = (value: string, x: number, y: number, maxChars = 24) => {
    const parts = value
      .split(/\n+/)
      .flatMap(
        (line) => line.match(new RegExp(`.{1,${maxChars}}`, "g")) || [""],
      )
    return parts
      .slice(0, 5)
      .map(
        (line, index) =>
          `<text x="${x}" y="${y + index * 18}" font-size="13" fill="${exportTokens.cellFg}">${escape(line)}</text>`,
      )
      .join("")
  }
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  svg += `<rect width="100%" height="100%" fill="${exportTokens.canvasBg}"/>`
  svg += `<text x="24" y="34" font-size="22" font-weight="700" fill="${exportTokens.titleFg}">${escape(journey.title)}</text>`
  journey.stages.forEach((stage, index) => {
    const x = labelWidth + index * columnWidth
    svg += `<rect x="${x}" y="${headerHeight}" width="${columnWidth}" height="44" fill="${exportTokens.stageHeaderBg}" stroke="${exportTokens.stageHeaderBorder}"/>`
    svg += `<text x="${x + 14}" y="${headerHeight + 28}" font-size="15" font-weight="700" fill="${exportTokens.stageHeaderFg}">${escape(stage.name)}</text>`
  })
  journey.rows.forEach((row, rowIndex) => {
    const y = headerHeight + 44 + rowIndex * rowHeight
    svg += `<rect x="0" y="${y}" width="${labelWidth}" height="${rowHeight}" fill="${exportTokens.rowLabelBg}" stroke="${exportTokens.rowLabelBorder}"/>`
    svg += `<text x="18" y="${y + 30}" font-size="14" font-weight="700" fill="${exportTokens.rowLabelFg}">${escape(row.title)}</text>`
    journey.stages.forEach((stage, index) => {
      const x = labelWidth + index * columnWidth
      svg += `<rect x="${x}" y="${y}" width="${columnWidth}" height="${rowHeight}" fill="${exportTokens.cellBg}" stroke="${exportTokens.cellBorder}"/>`
      svg += textLines(cellToText(row, stage.id), x + 14, y + 28)
    })
  })
  svg += "</svg>"
  return svg
}

function exportTextArtifact(
  document: Readonly<ToolDocument<JourneyMap>>,
  format: "md" | "json" | "csv" | "svg",
  mediaType: string,
  data: string,
): ToolExportArtifact {
  return {
    fileName: `${getJourneyExportBaseName(document.title)}.${format}`,
    mediaType,
    data,
  }
}

export const journeyMapToolDefinition: ToolDefinition<
  JourneyMap,
  JourneyMapCommand
> = {
  metadata: {
    id: "journey-map",
    name: "Journey Map",
    description: "用户旅程图工具，支持阶段、维度、情绪与导出。",
    category: "service-design",
    tags: ["journey-map", "service-design", "export"],
    inputKinds: ["text", "image"],
    outputKinds: ["markdown", "json", "csv", "svg"],
  },
  documentVersion: 1,
  createInitialDocument(input: unknown) {
    if (typeof input === "number" && Number.isFinite(input) && input > 0) {
      return createJourney(Math.max(1, Math.floor(input)))
    }
    return validateJourneyMap(input)
  },
  validateDocument(input: unknown) {
    return validateJourneyMap(input)
  },
  applyCommand(document: Readonly<JourneyMap>, command: JourneyMapCommand) {
    return applyJourneyMapCommand(document, command)
  },
  migrations: [],
  exports: [
    {
      format: "md",
      label: "Markdown",
      export(document) {
        return exportTextArtifact(
          document,
          "md",
          "text/markdown;charset=utf-8",
          toMarkdown(document.content),
        )
      },
    },
    {
      format: "json",
      label: "JSON",
      export(document) {
        return exportTextArtifact(
          document,
          "json",
          "application/json;charset=utf-8",
          JSON.stringify(document.content, null, 2),
        )
      },
    },
    {
      format: "csv",
      label: "CSV",
      export(document) {
        return exportTextArtifact(
          document,
          "csv",
          "text/csv;charset=utf-8",
          toCsv(document.content),
        )
      },
    },
    {
      format: "svg",
      label: "SVG",
      export(document) {
        return exportTextArtifact(
          document,
          "svg",
          "image/svg+xml;charset=utf-8",
          toSvg(document.content),
        )
      },
    },
  ],
  ai: {
    skillId: "tools/journey-map",
    skillVersion: "1.0.0",
    buildContext(document) {
      return document.content
    },
    parseProposal(input: unknown) {
      if (typeof input !== "object" || input === null) return []
      const candidate = input as Partial<JourneyProposalCommandInput>
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.expectedRevision !== "number" ||
        typeof candidate.issuedAt !== "string" ||
        typeof candidate.proposal !== "object" ||
        candidate.proposal === null
      ) {
        return []
      }
      return [createJourneyProposalCommand(candidate as JourneyProposalCommandInput)]
    },
  },
}
