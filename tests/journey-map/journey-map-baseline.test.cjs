const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const {
  loadCurrentJourneyMapBaseline,
} = require("./load-current-baseline.cjs")

const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(
      __dirname,
      "fixtures/representative-journey.json",
    ),
    "utf8",
  ),
)

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test("initial journey keeps the current metadata, five stages, and five analysis rows", () => {
  const { functions } = loadCurrentJourneyMapBaseline({
    randomValues: Array(20).fill(0.125),
  })
  const journey = plain(functions.createJourney(5))

  assert.equal(journey.title, "门店预约服务用户旅程图")
  assert.equal(
    journey.scenario,
    "用户想通过线上渠道预约一次线下门店服务，但需要确认时间、门店、服务内容和到店后的等待情况。",
  )
  assert.equal(journey.persona, "需要快速预约到店服务的用户")
  assert.equal(journey.goal, "顺利预约、到店并完成服务")
  assert.deepEqual(
    journey.stages.map((stage) => stage.name),
    ["发现需求", "了解服务", "完成预约", "到店服务", "服务后跟进"],
  )
  assert.deepEqual(
    journey.rows.map((row) => [row.title, row.type]),
    [
      ["用户行为", "text"],
      ["触点", "text"],
      ["痛点", "text"],
      ["情绪", "emotion"],
      ["机会点", "text"],
    ],
  )

  for (const row of journey.rows) {
    assert.deepEqual(
      Object.keys(row.cells),
      journey.stages.map((stage) => stage.id),
    )
  }
})

test("stage, row, and cell factories preserve current IDs, defaults, and templates", () => {
  const { functions } = loadCurrentJourneyMapBaseline({
    now: 1234,
    randomValues: [0.5, 0.75],
  })
  const firstStage = plain(functions.createStage(0))
  const ninthStage = plain(functions.createStage(8))
  const stages = [
    { id: "stage-a", name: "A" },
    { id: "stage-b", name: "B" },
  ]
  const imageRow = plain(functions.createRow("image", stages, 5))

  assert.deepEqual(firstStage, {
    id: "stage-1234-0-8",
    name: "发现需求",
  })
  assert.equal(ninthStage.name, "阶段 9")
  assert.equal(imageRow.id, "row-1234-5-c")
  assert.equal(imageRow.title, "图片行 6")
  assert.equal(imageRow.type, "image")
  assert.deepEqual(Object.keys(imageRow.cells), ["stage-a", "stage-b"])
  assert.equal(imageRow.cells["stage-a"].text, "")
  assert.equal(imageRow.cells["stage-a"].imageUrl, "")
  assert.equal(imageRow.cells["stage-a"].emotionScore, 3)
  assert.equal(imageRow.cells["stage-b"].emotionNote, "犹豫 / 比较")

  assert.equal(
    functions.createCell("text", 1, "痛点").text,
    "信息分散\n价格和时间规则不透明",
  )
  assert.equal(
    functions.createCell("text", 0, "机会点").text,
    "提供清晰的服务入口和适用说明",
  )
})

test("proposal normalization preserves known IDs, fills cells, and clamps emotion scores", () => {
  const { functions } = loadCurrentJourneyMapBaseline({
    now: 5678,
    randomValues: [0.25, 0.5],
  })
  const current = structuredClone(fixture)
  const proposal = {
    title: "更新后的旅程图",
    persona: "新用户",
    stages: [
      { id: "stage-discover", name: "发现需求" },
      { id: "", name: "到店确认" },
    ],
    rows: [
      {
        id: "row-action",
        title: "用户行为",
        type: "text",
        cells: [
          {
            stageId: "stage-discover",
            text: "保留已知阶段 ID",
          },
          {
            stageId: "到店确认",
            text: "按新增阶段名称匹配",
          },
        ],
      },
      {
        id: "row-emotion",
        title: "情绪",
        type: "emotion",
        cells: [
          {
            stageId: "stage-discover",
            emotionScore: 0,
            emotionNote: "过低",
          },
          {
            stageId: "到店确认",
            emotionScore: 8.7,
            emotionNote: "过高",
          },
        ],
      },
    ],
  }

  const normalized = plain(
    functions.normalizeJourneyProposal(proposal, current),
  )

  assert.equal(normalized.stages[0].id, "stage-discover")
  assert.equal(normalized.stages[1].id, "stage-5678-1-4")
  assert.equal(normalized.rows[0].id, "row-action")
  assert.equal(
    normalized.rows[0].cells["stage-discover"].text,
    "保留已知阶段 ID",
  )
  assert.equal(
    normalized.rows[0].cells["stage-5678-1-4"].text,
    "按新增阶段名称匹配",
  )
  assert.equal(
    normalized.rows[1].cells["stage-discover"].emotionScore,
    1,
  )
  assert.equal(
    normalized.rows[1].cells["stage-5678-1-4"].emotionScore,
    5,
  )
  assert.equal(normalized.scenario, fixture.scenario)
  assert.equal(normalized.goal, fixture.goal)
  assert.deepEqual(current, fixture)
})

test("empty proposal collections fall back to the current stages, rows, and cells", () => {
  const { functions } = loadCurrentJourneyMapBaseline()
  const normalized = plain(
    functions.normalizeJourneyProposal(
      {
        title: "",
        scenario: "",
        stages: [],
        rows: [],
      },
      fixture,
    ),
  )

  assert.equal(normalized.title, fixture.title)
  assert.equal(normalized.scenario, "")
  assert.deepEqual(normalized.stages, fixture.stages)
  assert.deepEqual(normalized.rows, fixture.rows)
})

test("emotion data keeps the current 1-5 display and 32-unit note rules", () => {
  const { functions } = loadCurrentJourneyMapBaseline()

  assert.equal(functions.getEmotionCharUnits("中"), 1)
  assert.equal(functions.getEmotionCharUnits("a"), 0.5)
  assert.equal(functions.getEmotionCharUnits("😀"), 1)
  assert.equal(functions.getEmotionCharUnits("\n"), 16)
  assert.equal(functions.getEmotionNoteUnits("中文ab"), 3)
  assert.equal(functions.getEmotionLongestLineUnits("中文\nabcdef"), 3)
  assert.equal(
    functions.trimEmotionNoteByUnits("一".repeat(40), 32),
    "一".repeat(32),
  )
  assert.equal(
    functions.cellToText(fixture.rows[2], "stage-discover"),
    "2/5 焦虑 / 等待",
  )
})

test("Markdown, CSV, JSON, and SVG exports keep their current data representation", () => {
  const { functions } = loadCurrentJourneyMapBaseline()
  const markdown = functions.toMarkdown(fixture)
  const csv = functions.toCsv(fixture)
  const svg = functions.toSvg(fixture)
  const json = JSON.stringify(fixture, null, 2)

  assert.match(markdown, /^# 预约\|到店服务用户旅程图\n/)
  assert.match(markdown, /\| 用户\\\|行为 \|/)
  assert.match(markdown, /搜索门店<br>比较服务/)
  assert.match(markdown, /2\/5 焦虑 \/ 等待/)

  assert.match(csv, /^"维度","发现需求","完成预约"/)
  assert.match(csv, /"提交""预约""信息"/)
  assert.match(csv, /"https:\/\/example.com\/discover.png"/)
  assert.match(csv, /"5\/5 放心"/)

  assert.equal(JSON.parse(json).rows[1].type, "image")
  assert.match(svg, /width="600" height="572"/)
  assert.match(svg, /预约\|到店服务用户旅程图/)
  assert.match(svg, /https:\/\/example.com\/disc<\/text>/)
  assert.match(svg, />over\.png<\/text>/)
  assert.match(svg, /2\/5 焦虑 \/ 等待/)
  assert.ok(svg.endsWith("</svg>"))
})

test("component-local stage, row, and cell guards remain present after page-layer extraction", () => {
  const { journeyPageSource, journeyToolSource } = loadCurrentJourneyMapBaseline()
  const guardSource = `${journeyPageSource}\n${journeyToolSource}`

  assert.match(
    guardSource,
    /if \(document\.stages\.length <= 1\) return document/,
  )
  assert.match(
    guardSource,
    /if \(document\.rows\.length <= 1\) return document/,
  )
  assert.match(
    guardSource,
    /cells:\s*\{\s*\.\.\.row\.cells,\s*\[stage\.id\]: createCell\(row\.type,\s*document\.stages\.length,\s*row\.title\)/,
  )
  assert.match(
    guardSource,
    /cells:\s*Object\.fromEntries\(\s*document\.stages\.map\(\(stage,\s*index\) => \[\s*stage\.id,\s*createCell\(command\.payload\.updates\.type!,\s*index,\s*row\.title\)/,
  )
  assert.match(
    guardSource,
    /\[command\.payload\.stageId\]:\s*\{/,
  )
  assert.match(
    guardSource,
    /\.\.\.row\.cells\[command\.payload\.stageId\]/,
  )
  assert.match(
    guardSource,
    /\.\.\.command\.payload\.updates/,
  )
  assert.match(
    guardSource,
    /title\.replace\(\/\[\\\\\/:\*\?"<>\|\]\/g,\s*"-"\) \|\| "journey-map"/,
  )
})

test("AI proposal remains confirm-before-apply and clears transient selection after apply", () => {
  const { appSource, assistantSource, journeyPageSource } =
    loadCurrentJourneyMapBaseline()

  assert.match(
    assistantSource,
    /proposal: result\.phase === "proposal" \? result\.proposal : undefined/,
  )
  assert.match(
    assistantSource,
    /onClick=\{\(\) => applyJourneyProposal\(message\.proposal!\)\}/,
  )
  assert.match(appSource, /JourneyMapPage/)
  assert.match(
    journeyPageSource,
    /const nextJourney = normalizeJourneyProposal\(proposal\.journey, journey\);/,
  )
  assert.match(journeyPageSource, /setSelectedCell\(null\);/)
  assert.match(journeyPageSource, /setEditingEmotion\(null\);/)
  assert.match(assistantSource, /修改已应用到左侧用户旅程图。/)
})
