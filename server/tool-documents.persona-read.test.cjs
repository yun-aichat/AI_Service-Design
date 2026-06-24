const assert = require("node:assert/strict");
const test = require("node:test");
const { Readable } = require("node:stream");

function createRequest(body, headers = {}) {
  const request = Readable.from([JSON.stringify(body)]);
  request.method = "POST";
  request.headers = headers;
  return request;
}

test("handleToolDocuments reads PersonaDocument through the formal host action", async () => {
  const previousDb = globalThis.__cloudbaseDatabase;
  const previousAnonymous = process.env.PERSISTENCE_ALLOW_ANONYMOUS;
  const modulePath = require.resolve("./tool-documents.cjs");
  delete require.cache[modulePath];

  const database = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              if (name !== "tool_documents") return { data: null };
              if (id !== "persona-1") return { data: null };
              return {
                data: {
                  id: "persona-1",
                  projectId: "project-1",
                  ownerId: "anonymous-demo",
                  toolId: "persona",
                  schemaVersion: 1,
                  revision: 0,
                  title: "Persona 1",
                  content: {
                    id: "persona-1",
                    skeleton: {
                      id: "persona-1",
                      segmentName: "价格敏感型用户",
                      summary: "优先关注成本控制",
                      seedInsightIds: [],
                    },
                    profile: { name: "李敏", roleTags: [] },
                    evidenceItems: [],
                    behaviorInsights: [],
                    contextInsights: [],
                    traits: {
                      patienceTolerance: { suggested: 3, confirmed: 3, confidence: "medium", rationale: "", supportingInsightIds: [] },
                      riskTolerance: { suggested: 3, confirmed: 3, confidence: "medium", rationale: "", supportingInsightIds: [] },
                      autonomy: { suggested: 3, confirmed: 3, confidence: "medium", rationale: "", supportingInsightIds: [] },
                      trustTendency: { suggested: 3, confirmed: 3, confidence: "medium", rationale: "", supportingInsightIds: [] },
                    },
                    summaryItems: [],
                    meta: { updatedAt: "2026-06-24T00:00:00.000Z" },
                  },
                  createdAt: "2026-06-24T00:00:00.000Z",
                  updatedAt: "2026-06-24T00:00:00.000Z",
                },
              };
            },
            async set() {
              return {};
            },
          };
        },
        where() {
          return {
            async get() {
              return { data: [] };
            },
            async update() {
              return { updated: 0 };
            },
            limit() {
              return {
                async get() {
                  return { data: [] };
                },
              };
            },
          };
        },
      };
    },
  };

  globalThis.__cloudbaseDatabase = database;
  process.env.PERSISTENCE_ALLOW_ANONYMOUS = "1";

  try {
    const { handleToolDocuments } = require("./tool-documents.cjs");
    const result = await handleToolDocuments(
      createRequest({
        action: "readPersonaDocument",
        projectId: "project-1",
        personaId: "persona-1",
      }),
    );

    assert.equal(result.id, "persona-1");
    assert.equal(result.profile.name, "李敏");
  } finally {
    delete require.cache[modulePath];
    if (previousDb === undefined) delete globalThis.__cloudbaseDatabase;
    else globalThis.__cloudbaseDatabase = previousDb;

    if (previousAnonymous === undefined) delete process.env.PERSISTENCE_ALLOW_ANONYMOUS;
    else process.env.PERSISTENCE_ALLOW_ANONYMOUS = previousAnonymous;
  }
});

test("handleToolDocuments returns persona read errors for project mismatch", async () => {
  const previousDb = globalThis.__cloudbaseDatabase;
  const previousAnonymous = process.env.PERSISTENCE_ALLOW_ANONYMOUS;
  const modulePath = require.resolve("./tool-documents.cjs");
  delete require.cache[modulePath];

  const database = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              if (name !== "tool_documents") return { data: null };
              if (id !== "persona-1") return { data: null };
              return {
                data: {
                  id: "persona-1",
                  projectId: "project-2",
                  ownerId: "anonymous-demo",
                  toolId: "persona",
                  schemaVersion: 1,
                  revision: 0,
                  title: "Persona 1",
                  content: {
                    id: "persona-1",
                    skeleton: { id: "persona-1", segmentName: "", summary: "", seedInsightIds: [] },
                    profile: { name: "李敏", roleTags: [] },
                    evidenceItems: [],
                    behaviorInsights: [],
                    contextInsights: [],
                    traits: {
                      patienceTolerance: { suggested: 3, confirmed: 3, confidence: "medium", rationale: "", supportingInsightIds: [] },
                      riskTolerance: { suggested: 3, confirmed: 3, confidence: "medium", rationale: "", supportingInsightIds: [] },
                      autonomy: { suggested: 3, confirmed: 3, confidence: "medium", rationale: "", supportingInsightIds: [] },
                      trustTendency: { suggested: 3, confirmed: 3, confidence: "medium", rationale: "", supportingInsightIds: [] },
                    },
                    summaryItems: [],
                    meta: { updatedAt: "2026-06-24T00:00:00.000Z" },
                  },
                  createdAt: "2026-06-24T00:00:00.000Z",
                  updatedAt: "2026-06-24T00:00:00.000Z",
                },
              };
            },
            async set() {
              return {};
            },
          };
        },
        where() {
          return {
            async get() {
              return { data: [] };
            },
            async update() {
              return { updated: 0 };
            },
            limit() {
              return {
                async get() {
                  return { data: [] };
                },
              };
            },
          };
        },
      };
    },
  };

  globalThis.__cloudbaseDatabase = database;
  process.env.PERSISTENCE_ALLOW_ANONYMOUS = "1";

  try {
    const { handleToolDocuments } = require("./tool-documents.cjs");
    await assert.rejects(
      () =>
        handleToolDocuments(
          createRequest({
            action: "readPersonaDocument",
            projectId: "project-1",
            personaId: "persona-1",
          }),
        ),
      (error) => error?.code === "PERSONA_PROJECT_MISMATCH",
    );
  } finally {
    delete require.cache[modulePath];
    if (previousDb === undefined) delete globalThis.__cloudbaseDatabase;
    else globalThis.__cloudbaseDatabase = previousDb;

    if (previousAnonymous === undefined) delete process.env.PERSISTENCE_ALLOW_ANONYMOUS;
    else process.env.PERSISTENCE_ALLOW_ANONYMOUS = previousAnonymous;
  }
});
