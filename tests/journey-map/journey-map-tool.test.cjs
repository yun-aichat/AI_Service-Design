const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const {
  loadCurrentJourneyMapBaseline,
} = require("./load-current-baseline.cjs")

const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "fixtures/representative-journey.json"),
    "utf8",
  ),
)

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function runtimeModules(options) {
  const loaded = loadCurrentJourneyMapBaseline(options)
  const toolRuntime = require("../../tmp/tool-runtime-tests/application/tool-runtime.js")
  return {
    ...loaded,
    ...toolRuntime,
  }
}

test("journey-map tool is registered with the formal ToolDefinition contract", () => {
  const { registry, functions } = runtimeModules()
  const definition = registry.get("journey-map")

  assert.equal(definition.metadata.id, "journey-map")
  assert.equal(definition.documentVersion, 1)
  assert.equal(definition.ai.skillId, "tools/journey-map")
  assert.deepEqual(
    definition.exports.map((entry) => entry.format),
    ["md", "json", "csv", "svg"],
  )
  assert.equal(definition, functions.journeyMapToolDefinition)
})

test("createInitialDocument and validateDocument keep the current Journey Map content shape", () => {
  const { createToolDocument, registry } = runtimeModules({
    randomValues: Array(20).fill(0.125),
  })
  const definition = registry.get("journey-map")
  const document = createToolDocument(definition, {
    id: "journey-1",
    projectId: "project-1",
    title: "预约|到店服务用户旅程图",
    now: "2026-06-07T00:00:00.000Z",
  })
  const validated = plain(definition.validateDocument(fixture))

  assert.equal(document.toolId, "journey-map")
  assert.equal(document.revision, 0)
  assert.equal(document.content.stages.length, 5)
  assert.equal(document.content.rows.length, 5)
  assert.deepEqual(validated, fixture)
})

test("document commands preserve current stage, row, cell, and proposal behaviors", () => {
  const { createToolDocument, applyToolCommand, registry } = runtimeModules({
    now: 5678,
    randomValues: [0.25, 0.5, 0.75, 0.875],
  })
  const definition = registry.get("journey-map")
  const document = createToolDocument(definition, {
    id: "journey-1",
    projectId: "project-1",
    title: fixture.title,
    initialValue: fixture,
    now: "2026-06-07T00:00:00.000Z",
  })

  const addedStage = applyToolCommand(
    definition,
    document,
    {
      id: "cmd-1",
      type: "journey-map.add-stage",
      payload: {},
      expectedRevision: 0,
      issuedAt: "2026-06-07T00:01:00.000Z",
      actor: { type: "user" },
    },
    "2026-06-07T00:01:00.000Z",
  ).document

  const addedStageId = addedStage.content.stages.at(-1).id
  assert.match(addedStageId, /^stage-/)
  assert.notEqual(addedStageId, "stage-book")
  assert.equal(
    addedStage.content.rows[0].cells[addedStageId].text,
    "选择门店与时间\n填写预约信息",
  )

  const changedRowType = applyToolCommand(
    definition,
    document,
    {
      id: "cmd-2",
      type: "journey-map.update-row",
      payload: {
        rowId: "row-image",
        updates: { type: "emotion", title: "已忽略的新标题" },
      },
      expectedRevision: 0,
      issuedAt: "2026-06-07T00:01:00.000Z",
      actor: { type: "user" },
    },
    "2026-06-07T00:01:00.000Z",
  ).document

  assert.equal(changedRowType.content.rows[1].title, "已忽略的新标题")
  assert.equal(changedRowType.content.rows[1].type, "emotion")
  assert.equal(
    changedRowType.content.rows[1].cells["stage-discover"].emotionNote,
    "焦虑 / 期待",
  )

  const changedCell = applyToolCommand(
    definition,
    document,
    {
      id: "cmd-3",
      type: "journey-map.update-cell",
      payload: {
        rowId: "row-action",
        stageId: "stage-discover",
        updates: { text: "新的行为", emotionScore: 5 },
      },
      expectedRevision: 0,
      issuedAt: "2026-06-07T00:01:00.000Z",
      actor: { type: "user" },
    },
    "2026-06-07T00:01:00.000Z",
  ).document

  assert.equal(
    changedCell.content.rows[0].cells["stage-discover"].text,
    "新的行为",
  )
  assert.equal(
    changedCell.content.rows[0].cells["stage-discover"].emotionNote,
    fixture.rows[0].cells["stage-discover"].emotionNote,
  )

  const appliedProposal = applyToolCommand(
    definition,
    document,
    {
      id: "cmd-4",
      type: "journey-map.apply-proposal",
      payload: {
        proposal: {
          title: "更新后的旅程图",
          stages: [
            { id: "stage-discover", name: "发现需求" },
            { name: "到店确认" },
          ],
          rows: [
            {
              id: "row-emotion",
              title: "情绪",
              type: "emotion",
              cells: [
                { stageId: "stage-discover", emotionScore: 0, emotionNote: "过低" },
                { stageId: "到店确认", emotionScore: 8.7, emotionNote: "过高" },
              ],
            },
          ],
        },
      },
      expectedRevision: 0,
      issuedAt: "2026-06-07T00:01:00.000Z",
      actor: { type: "assistant" },
    },
    "2026-06-07T00:01:00.000Z",
  ).document

  assert.equal(appliedProposal.content.title, "更新后的旅程图")
  const proposalStageId = appliedProposal.content.stages[1].id
  assert.equal(appliedProposal.content.stages[0].id, "stage-discover")
  assert.match(proposalStageId, /^stage-/)
  assert.notEqual(proposalStageId, "stage-book")
  assert.equal(
    appliedProposal.content.rows[0].cells["stage-discover"].emotionScore,
    1,
  )
  assert.equal(
    appliedProposal.content.rows[0].cells[proposalStageId].emotionScore,
    5,
  )
})

test("exports keep current markdown/json/csv/svg compatibility and sanitized file names", async () => {
  const { createToolDocument, exportToolDocument, registry, functions } =
    runtimeModules()
  const definition = registry.get("journey-map")
  const document = createToolDocument(definition, {
    id: "journey-1",
    projectId: "project-1",
    title: fixture.title,
    initialValue: fixture,
    now: "2026-06-07T00:00:00.000Z",
  })

  const markdown = await exportToolDocument(definition, document, {
    format: "md",
  })
  const json = await exportToolDocument(definition, document, { format: "json" })
  const csv = await exportToolDocument(definition, document, { format: "csv" })
  const svg = await exportToolDocument(definition, document, { format: "svg" })

  assert.equal(
    functions.getJourneyExportBaseName("预约/到店:服务"),
    "预约-到店-服务",
  )
  assert.equal(markdown.fileName, "预约-到店服务用户旅程图.md")
  assert.equal(json.fileName, "预约-到店服务用户旅程图.json")
  assert.equal(csv.fileName, "预约-到店服务用户旅程图.csv")
  assert.equal(svg.fileName, "预约-到店服务用户旅程图.svg")
  assert.match(markdown.data, /^# 预约\|到店服务用户旅程图\n/)
  assert.equal(JSON.parse(json.data).rows[1].type, "image")
  assert.match(csv.data, /^"维度","发现需求","完成预约"/)
  assert.match(svg.data, /width="600" height="572"/)
})

test("AI proposal parsing maps current proposal payloads into apply-proposal commands", () => {
  const { registry } = runtimeModules()
  const definition = registry.get("journey-map")
  const commands = definition.ai.parseProposal({
    id: "proposal-1",
    expectedRevision: 3,
    issuedAt: "2026-06-07T00:00:00.000Z",
    proposal: {
      title: "新的旅程图",
      rows: [],
    },
  })

  assert.equal(commands.length, 1)
  assert.equal(commands[0].type, "journey-map.apply-proposal")
  assert.equal(commands[0].expectedRevision, 3)
  assert.equal(commands[0].payload.proposal.title, "新的旅程图")
})
