const assert = require("node:assert/strict")
const test = require("node:test")

const {
  applyToolCommand,
  createToolDocument,
  exportToolDocument,
  migrateToolDocument,
} = require("../tmp/tool-runtime-tests/application/tool-runtime.js")
const {
  defineToolRegistry,
} = require("../tmp/tool-runtime-tests/tools/registry.js")

const NOW = "2026-06-07T00:00:00.000Z"

function expectRuntimeError(code, action) {
  assert.throws(action, (error) => error?.code === code)
}

function createDefinition(overrides = {}) {
  return {
    metadata: {
      id: "note",
      name: "Note",
      description: "Test tool",
      category: "test",
      tags: [],
      inputKinds: ["text"],
      outputKinds: ["text"],
    },
    documentVersion: 1,
    createInitialDocument: (input) => input ?? { text: "" },
    validateDocument: (input) => {
      if (
        typeof input !== "object" ||
        input === null ||
        typeof input.text !== "string"
      ) {
        throw new Error("Invalid note")
      }
      return input
    },
    applyCommand: (_content, command) => ({
      text: command.payload.text,
    }),
    migrations: [],
    exports: [
      {
        format: "json",
        label: "JSON",
        export: (document) => ({
          fileName: "note.json",
          mediaType: "application/json",
          data: JSON.stringify(document.content),
        }),
      },
    ],
    ...overrides,
  }
}

function createDocument(definition = createDefinition(), initialValue) {
  return createToolDocument(definition, {
    id: "document-1",
    projectId: "project-1",
    title: "Test",
    initialValue,
    now: NOW,
  })
}

function renameCommand(expectedRevision, text = "Updated") {
  return {
    id: "command-1",
    type: "rename",
    payload: { text },
    expectedRevision,
    issuedAt: NOW,
    actor: { type: "user", id: "user-1" },
  }
}

test("create produces a versioned revision-zero document", () => {
  const document = createDocument()

  assert.deepEqual(document, {
    id: "document-1",
    projectId: "project-1",
    toolId: "note",
    schemaVersion: 1,
    revision: 0,
    title: "Test",
    content: { text: "" },
    createdAt: NOW,
    updatedAt: NOW,
  })
})

test("command application increments revision exactly once and rejects retry", () => {
  const definition = createDefinition()
  const original = createDocument(definition)
  const command = renameCommand(0)
  const result = applyToolCommand(
    definition,
    original,
    command,
    "2026-06-07T00:01:00.000Z",
  )

  assert.equal(result.previousRevision, 0)
  assert.equal(result.document.revision, 1)
  assert.equal(result.document.content.text, "Updated")
  assert.equal(original.revision, 0)
  expectRuntimeError("REVISION_CONFLICT", () =>
    applyToolCommand(definition, result.document, command, NOW),
  )
})

test("migration upgrades an old document through every adjacent version", () => {
  const definition = createDefinition({
    documentVersion: 3,
    validateDocument: (input) => input,
    migrations: [
      {
        fromVersion: 1,
        toVersion: 2,
        migrate: (content) => ({ ...content, persona: "" }),
      },
      {
        fromVersion: 2,
        toVersion: 3,
        migrate: (content) => ({ ...content, goal: "" }),
      },
    ],
  })
  const oldDocument = {
    id: "document-1",
    projectId: "project-1",
    toolId: "note",
    schemaVersion: 1,
    revision: 7,
    title: "Old",
    content: { text: "kept" },
    createdAt: NOW,
    updatedAt: NOW,
  }

  const migrated = migrateToolDocument(
    definition,
    oldDocument,
    "2026-06-07T00:02:00.000Z",
  )

  assert.equal(migrated.schemaVersion, 3)
  assert.equal(migrated.revision, 7)
  assert.deepEqual(migrated.content, {
    text: "kept",
    persona: "",
    goal: "",
  })
})

test("migration fails when the chain is missing", () => {
  const definition = createDefinition({
    documentVersion: 3,
    migrations: [
      { fromVersion: 1, toVersion: 2, migrate: (content) => content },
    ],
  })
  const oldDocument = { ...createDocument(), schemaVersion: 1 }

  expectRuntimeError("MIGRATION_NOT_FOUND", () =>
    migrateToolDocument(definition, oldDocument, NOW),
  )
})

test("definitions reject cross-version and duplicate migration starts", () => {
  expectRuntimeError("INVALID_DEFINITION", () =>
    createDocument(
      createDefinition({
        documentVersion: 3,
        migrations: [
          { fromVersion: 1, toVersion: 3, migrate: (content) => content },
        ],
      }),
    ),
  )

  expectRuntimeError("INVALID_DEFINITION", () =>
    defineToolRegistry([
      createDefinition({
        documentVersion: 2,
        migrations: [
          { fromVersion: 1, toVersion: 2, migrate: (content) => content },
          { fromVersion: 1, toVersion: 2, migrate: (content) => content },
        ],
      }),
    ]),
  )
})

test("registry rejects invalid, duplicate, and unknown tools", () => {
  expectRuntimeError("INVALID_DEFINITION", () =>
    defineToolRegistry([createDefinition({ documentVersion: 0 })]),
  )
  expectRuntimeError("INVALID_DEFINITION", () =>
    defineToolRegistry([
      createDefinition({
        exports: [
          createDefinition().exports[0],
          createDefinition().exports[0],
        ],
      }),
    ]),
  )
  expectRuntimeError("DUPLICATE_TOOL", () =>
    defineToolRegistry([createDefinition(), createDefinition()]),
  )

  const registry = defineToolRegistry([createDefinition()])
  assert.equal(registry.get("note").metadata.id, "note")
  expectRuntimeError("TOOL_NOT_FOUND", () => registry.get("missing"))
})

test("document content must survive a lossless JSON round trip", () => {
  const definition = createDefinition({
    createInitialDocument: () => ({ text: "bad", optional: undefined }),
  })
  expectRuntimeError("NON_SERIALIZABLE_DOCUMENT", () =>
    createDocument(definition),
  )

  const cyclic = { text: "bad" }
  cyclic.self = cyclic
  const cyclicDefinition = createDefinition({
    applyCommand: () => cyclic,
  })
  expectRuntimeError("NON_SERIALIZABLE_DOCUMENT", () =>
    applyToolCommand(
      cyclicDefinition,
      createDocument(cyclicDefinition),
      renameCommand(0),
      NOW,
    ),
  )

  const hidden = { text: "bad" }
  Object.defineProperty(hidden, "secret", {
    value: "lost by JSON",
    enumerable: false,
  })
  expectRuntimeError("NON_SERIALIZABLE_DOCUMENT", () =>
    createDocument(
      createDefinition({ createInitialDocument: () => hidden }),
    ),
  )

  expectRuntimeError("NON_SERIALIZABLE_DOCUMENT", () =>
    createDocument(
      createDefinition({
        createInitialDocument: () => ({
          text: "bad",
          createdAt: new Date(NOW),
        }),
      }),
    ),
  )
})

test("export selects the adapter and rejects unknown formats", async () => {
  const definition = createDefinition()
  const document = createDocument(definition, { text: "Export me" })
  const artifact = await exportToolDocument(definition, document, {
    format: "json",
  })

  assert.equal(artifact.fileName, "note.json")
  assert.deepEqual(JSON.parse(artifact.data), { text: "Export me" })
  await assert.rejects(
    exportToolDocument(definition, document, { format: "pdf" }),
    (error) => error?.code === "EXPORT_NOT_FOUND",
  )
})

test("Journey Map content, proposal command, and JSON export adapt losslessly", async () => {
  const journey = {
    title: "门店预约服务用户旅程图",
    scenario: "线上预约线下服务",
    persona: "需要快速预约到店服务的用户",
    goal: "顺利预约、到店并完成服务",
    stages: [
      { id: "stage-1", name: "发现需求" },
      { id: "stage-2", name: "完成预约" },
    ],
    rows: [
      {
        id: "row-action",
        title: "用户行为",
        type: "text",
        cells: {
          "stage-1": {
            text: "搜索服务",
            imageUrl: "",
            emotionScore: 3,
            emotionNote: "",
          },
          "stage-2": {
            text: "提交预约",
            imageUrl: "",
            emotionScore: 4,
            emotionNote: "",
          },
        },
      },
      {
        id: "row-emotion",
        title: "情绪",
        type: "emotion",
        cells: {
          "stage-1": {
            text: "",
            imageUrl: "",
            emotionScore: 3,
            emotionNote: "焦虑 / 期待",
          },
          "stage-2": {
            text: "",
            imageUrl: "",
            emotionScore: 4,
            emotionNote: "谨慎 / 希望确认",
          },
        },
      },
    ],
  }
  const proposal = {
    summary: ["补充目标"],
    journey: { ...journey, goal: "收到明确确认后到店" },
  }
  const definition = createDefinition({
    metadata: {
      ...createDefinition().metadata,
      id: "journey-map",
      name: "Journey Map",
    },
    createInitialDocument: (input) => input,
    validateDocument: (input) => input,
    applyCommand: (_content, command) => command.payload.journey,
    exports: [
      {
        format: "json",
        label: "JSON",
        export: (document) => ({
          fileName: "journey-map.json",
          mediaType: "application/json",
          data: JSON.stringify(document.content),
        }),
      },
    ],
  })
  const document = createDocument(definition, journey)
  const result = applyToolCommand(
    definition,
    document,
    {
      id: "proposal-1",
      type: "apply-proposal",
      payload: proposal,
      expectedRevision: 0,
      issuedAt: NOW,
      actor: { type: "assistant" },
    },
    NOW,
  )
  const artifact = await exportToolDocument(definition, result.document, {
    format: "json",
  })

  assert.deepEqual(document.content, journey)
  assert.deepEqual(result.document.content, proposal.journey)
  assert.deepEqual(JSON.parse(artifact.data), proposal.journey)
  assert.equal(
    result.document.content.rows[1].cells["stage-1"].emotionNote,
    "焦虑 / 期待",
  )
})
