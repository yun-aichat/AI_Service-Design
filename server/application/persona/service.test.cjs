const assert = require("node:assert/strict");
const test = require("node:test");

const {
  InMemoryToolDocumentRepository,
  createToolDocumentService,
} = require("../tool-documents.cjs");
const { createPersonaService } = require("./service.cjs");

const USER_ID = "user-1";

function createPersonaDocument(overrides = {}) {
  return {
    id: "persona-1",
    skeleton: {
      id: "persona-1",
      segmentName: "价格敏感型用户",
      summary: "优先关注成本控制",
      seedInsightIds: ["insight-1"],
    },
    profile: {
      name: "李敏",
      roleTags: ["到店用户"],
    },
    evidenceItems: [{ id: "evidence-1" }],
    behaviorInsights: [
      {
        id: "behavior-1",
        kind: "behavior",
        summary: "会先比较价格",
        evidenceIds: ["evidence-1"],
        placement: "in_persona",
      },
    ],
    contextInsights: [
      {
        id: "context-1",
        kind: "context",
        summary: "排队久会离开",
        evidenceIds: ["evidence-1"],
        placement: "in_persona",
      },
    ],
    traits: {
      patienceTolerance: {
        suggested: 2,
        confirmed: 2,
        confidence: "medium",
        rationale: "",
        supportingInsightIds: ["context-1"],
      },
      riskTolerance: {
        suggested: 2,
        confirmed: 2,
        confidence: "medium",
        rationale: "",
        supportingInsightIds: ["behavior-1"],
      },
      autonomy: {
        suggested: 3,
        confirmed: 3,
        confidence: "medium",
        rationale: "",
        supportingInsightIds: ["behavior-1"],
      },
      trustTendency: {
        suggested: 3,
        confirmed: 3,
        confidence: "medium",
        rationale: "",
        supportingInsightIds: ["context-1"],
      },
    },
    summaryItems: [
      {
        id: "summary-1",
        kind: "need",
        text: "需要价格透明",
        confirmed: true,
      },
    ],
    meta: {
      updatedAt: "2026-06-24T00:00:00.000Z",
    },
    ...overrides,
  };
}

function createService(seed = {}) {
  const repository = new InMemoryToolDocumentRepository(seed);
  const toolDocumentService = createToolDocumentService({ repository });
  return {
    repository,
    service: createPersonaService({ toolDocumentService }),
  };
}

test("getPersonaInputs reads PersonaDocument through the formal tool-document chain", async () => {
  const { service } = createService({
    documents: {
      "persona-1": {
        id: "persona-1",
        projectId: "project-1",
        ownerId: USER_ID,
        toolId: "persona",
        schemaVersion: 1,
        revision: 0,
        title: "Persona 1",
        content: createPersonaDocument(),
        createdAt: "2026-06-24T00:00:00.000Z",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
    },
  });

  const result = await service.getPersonaInputs({
    userId: USER_ID,
    projectId: "project-1",
    personaIds: ["persona-1"],
  });

  assert.equal(result.personas.length, 1);
  assert.equal(result.personas[0].personaId, "persona-1");
  assert.equal(result.personas[0].projectId, "project-1");
});

test("getPersonaInputs raises PERSONA_NOT_FOUND when the formal document is missing", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.getPersonaInputs({
        userId: USER_ID,
        projectId: "project-1",
        personaIds: ["persona-1"],
      }),
    (error) => error?.code === "PERSONA_NOT_FOUND",
  );
});

test("getPersonaInputs raises PERSONA_PROJECT_MISMATCH for cross-project persona reads", async () => {
  const { service } = createService({
    documents: {
      "persona-1": {
        id: "persona-1",
        projectId: "project-2",
        ownerId: USER_ID,
        toolId: "persona",
        schemaVersion: 1,
        revision: 0,
        title: "Persona 1",
        content: createPersonaDocument(),
        createdAt: "2026-06-24T00:00:00.000Z",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
    },
  });

  await assert.rejects(
    () =>
      service.getPersonaInputs({
        userId: USER_ID,
        projectId: "project-1",
        personaIds: ["persona-1"],
      }),
    (error) => error?.code === "PERSONA_PROJECT_MISMATCH",
  );
});

test("getPersonaInputs raises PERSONA_ACCESS_DENIED when the document belongs to another user", async () => {
  const { service } = createService({
    documents: {
      "persona-1": {
        id: "persona-1",
        projectId: "project-1",
        ownerId: "user-2",
        toolId: "persona",
        schemaVersion: 1,
        revision: 0,
        title: "Persona 1",
        content: createPersonaDocument(),
        createdAt: "2026-06-24T00:00:00.000Z",
        updatedAt: "2026-06-24T00:00:00.000Z",
      },
    },
  });

  await assert.rejects(
    () =>
      service.getPersonaInputs({
        userId: USER_ID,
        projectId: "project-1",
        personaIds: ["persona-1"],
      }),
    (error) => error?.code === "PERSONA_ACCESS_DENIED",
  );
});
