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

test("persona tool fixes meta.version to the current document version", () => {
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
          version: 999,
          createdAt: "2026-06-24T00:00:00.000Z",
          updatedAt: "2026-06-24T00:00:00.000Z",
        },
      }),
    /meta\.version/,
  )
})

test("persona replace-document keeps host-managed identity and meta fields", () => {
  const { runtime, registryModule } = compileToolRuntime()
  const definition = registryModule.toolRegistry.get("persona")
  const document = runtime.createToolDocument(definition, {
    id: "persona-doc-1",
    projectId: "project-1",
    title: "Persona 草稿",
    now: "2026-06-24T00:00:00.000Z",
  })

  const result = runtime.applyToolCommand(
    definition,
    document,
    {
      id: "cmd-1",
      type: "persona.replace-document",
      payload: {
        document: {
          ...plain(document.content),
          id: "persona-doc-hijacked",
          skeleton: {
            id: "persona-doc-hijacked",
            segmentName: "价格敏感型用户",
            summary: "优先关注成本控制",
            seedInsightIds: ["insight-1"],
          },
          profile: {
            name: "李敏",
            roleTags: ["到店用户"],
          },
          meta: {
            version: 999,
            createdAt: "2030-01-01T00:00:00.000Z",
            updatedAt: "2030-01-02T00:00:00.000Z",
          },
        },
      },
      expectedRevision: 0,
      issuedAt: "2026-06-24T01:00:00.000Z",
      actor: { type: "user", id: "user-1" },
    },
    "2026-06-24T01:00:00.000Z",
  )

  assert.equal(result.document.content.id, "persona-doc-1")
  assert.equal(result.document.content.meta.version, 1)
  assert.equal(
    result.document.content.meta.createdAt,
    "2026-06-24T00:00:00.000Z",
  )
  assert.equal(
    result.document.content.meta.updatedAt,
    "2026-06-24T01:00:00.000Z",
  )
  assert.equal(result.document.content.skeleton.id, "persona-doc-1")
  assert.equal(result.document.content.skeleton.segmentName, "价格敏感型用户")
  assert.equal(result.document.content.profile.name, "李敏")
})
