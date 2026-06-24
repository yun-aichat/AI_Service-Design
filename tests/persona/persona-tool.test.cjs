const assert = require("node:assert/strict")
const path = require("node:path")
const test = require("node:test")
const { execFileSync } = require("node:child_process")

const ROOT_PATH = path.resolve(__dirname, "../..")
const TSCONFIG_PATH = path.resolve(ROOT_PATH, "tsconfig.tool-runtime-tests.json")
const TSC_BIN = require.resolve("typescript/bin/tsc")
const COMPILED_RUNTIME_PATH = path.resolve(
  ROOT_PATH,
  "tmp/tool-runtime-tests/application/tool-runtime.js",
)
const COMPILED_REGISTRY_PATH = path.resolve(
  ROOT_PATH,
  "tmp/tool-runtime-tests/tools/registry.js",
)
const COMPILED_PERSONA_TOOL_PATH = path.resolve(
  ROOT_PATH,
  "tmp/tool-runtime-tests/tools/persona/tool.js",
)

function compileToolRuntime() {
  execFileSync(process.execPath, [TSC_BIN, "-p", TSCONFIG_PATH], {
    cwd: ROOT_PATH,
    stdio: "pipe",
  })

  delete require.cache[COMPILED_RUNTIME_PATH]
  delete require.cache[COMPILED_REGISTRY_PATH]
  delete require.cache[COMPILED_PERSONA_TOOL_PATH]

  return {
    runtime: require(COMPILED_RUNTIME_PATH),
    registryModule: require(COMPILED_REGISTRY_PATH),
    personaToolModule: require(COMPILED_PERSONA_TOOL_PATH),
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test("persona tool is registered with the formal ToolDefinition contract", () => {
  const { registryModule, personaToolModule } = compileToolRuntime()
  const definition = registryModule.toolRegistry.get("persona")

  assert.equal(definition.metadata.id, "persona")
  assert.equal(definition.documentVersion, 1)
  assert.equal(definition, personaToolModule.personaToolDefinition)
  assert.deepEqual(definition.exports, [])
})

test("persona tool creates and validates the minimal PersonaDocument host shape", () => {
  const { runtime, registryModule } = compileToolRuntime()
  const definition = registryModule.toolRegistry.get("persona")
  const document = runtime.createToolDocument(definition, {
    id: "persona-doc-1",
    projectId: "project-1",
    title: "Persona 草稿",
    now: "2026-06-24T00:00:00.000Z",
  })

  assert.equal(document.toolId, "persona")
  assert.equal(document.revision, 0)
  assert.deepEqual(plain(definition.validateDocument(document.content)), {
    id: "persona-doc-1",
    skeleton: {
      id: "persona-doc-1",
      segmentName: "",
      summary: "",
      seedInsightIds: [],
    },
    profile: {
      name: "",
      roleTags: [],
    },
    evidenceItems: [],
    behaviorInsights: [],
    contextInsights: [],
    traits: {
      patienceTolerance: {
        suggested: 3,
        confidence: "low",
        rationale: "",
        supportingInsightIds: [],
      },
      riskTolerance: {
        suggested: 3,
        confidence: "low",
        rationale: "",
        supportingInsightIds: [],
      },
      autonomy: {
        suggested: 3,
        confidence: "low",
        rationale: "",
        supportingInsightIds: [],
      },
      trustTendency: {
        suggested: 3,
        confidence: "low",
        rationale: "",
        supportingInsightIds: [],
      },
    },
    summaryItems: [],
    meta: {
      version: 1,
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z",
    },
  })
})

test("persona tool rejects malformed PersonaDocument content", () => {
  const { registryModule } = compileToolRuntime()
  const definition = registryModule.toolRegistry.get("persona")

  assert.throws(
    () =>
      definition.validateDocument({
        id: "persona-doc-1",
        skeleton: {
          id: "persona-doc-1",
          segmentName: "",
          summary: "",
          seedInsightIds: [],
        },
        profile: {
          name: "",
          roleTags: "invalid",
        },
        evidenceItems: [],
        behaviorInsights: [],
        contextInsights: [],
        traits: {},
        summaryItems: [],
        meta: {
          version: 1,
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z",
        },
      }),
    /profile\.roleTags/,
  )
})
