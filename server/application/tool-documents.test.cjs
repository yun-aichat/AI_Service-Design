const assert = require("node:assert/strict");
const test = require("node:test");

const {
  InMemoryToolDocumentRepository,
  createToolDocumentService,
  sanitizeEventMetadata,
} = require("./tool-documents.cjs");

const user = { id: "user-1" };
const baseJourney = {
  title: "门店预约服务用户旅程图",
  scenario: "用户预约门店服务。",
  persona: "预约用户",
  goal: "顺利到店",
  stages: [{ id: "stage-1", name: "发现需求" }],
  rows: [
    {
      id: "row-1",
      title: "用户行为",
      type: "text",
      cells: {
        "stage-1": {
          text: "搜索服务",
          imageUrl: "",
          emotionScore: 3,
          emotionNote: "期待",
        },
      },
    },
  ],
};

function createService(seed) {
  const repository = new InMemoryToolDocumentRepository(seed);
  const service = createToolDocumentService({
    repository,
    now: () => "2026-06-07T00:00:00.000Z",
    createId: (() => {
      let index = 0;
      return (prefix) => `${prefix}-${++index}`;
    })(),
    validateContent(toolId, content) {
      assert.equal(toolId, "journey-map");
      return content;
    },
  });
  return { repository, service };
}

test("saving a new Journey Map writes current document, revision snapshot, and usage events", async () => {
  const { repository, service } = createService();

  const result = await service.saveJourneyMap({
    user,
    documentId: "doc-1",
    projectId: "project-1",
    title: baseJourney.title,
    schemaVersion: 1,
    expectedRevision: null,
    content: baseJourney,
    eventMetadata: {
      stageCount: 1,
      content: baseJourney,
    },
  });

  assert.equal(result.document.revision, 0);
  assert.equal(result.revision.revision, 0);
  assert.deepEqual(result.revision.content, baseJourney);
  assert.equal(repository.documents.get("doc-1").title, baseJourney.title);
  assert.equal(repository.revisions.get("doc-1:rev:0").source, "manual");
  assert.deepEqual(
    [...repository.usageEvents.values()].map((event) => event.eventType),
    ["document_created", "tool_saved"],
  );
  assert.equal(
    [...repository.usageEvents.values()][1].metadata.content,
    "[Omitted]",
  );
});

test("readDocument returns the saved record and rejects missing documents", async () => {
  const { service } = createService();

  await service.saveJourneyMap({
    user,
    documentId: "doc-1",
    projectId: "project-1",
    title: baseJourney.title,
    schemaVersion: 1,
    expectedRevision: null,
    content: baseJourney,
  });

  const document = await service.readDocument({
    user,
    documentId: "doc-1",
  });
  assert.equal(document.id, "doc-1");
  assert.equal(document.revision, 0);

  await assert.rejects(
    () =>
      service.readDocument({
        user,
        documentId: "missing-doc",
      }),
    /Document not found/,
  );
});

test("getJourneyMapContext creates a default project for the signed-in user", async () => {
  const { repository, service } = createService();

  const result = await service.getJourneyMapContext({ user });

  assert.equal(result.project.name, "默认项目");
  assert.equal(result.projects.length, 1);
  assert.equal(result.document, null);
  assert.equal(result.suggestedDocumentId, `${result.project.id}:journey-map`);
  assert.equal(repository.projects.get(result.project.id).ownerId, user.id);
});

test("getJourneyMapContext resolves the selected project and current Journey document", async () => {
  const { service } = createService({
    projects: {
      "project-1": {
        id: "project-1",
        ownerId: user.id,
        name: "旧项目",
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      },
      "project-2": {
        id: "project-2",
        ownerId: user.id,
        name: "当前项目",
        createdAt: "2026-06-07T00:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      },
    },
    documents: {
      "doc-1": {
        id: "doc-1",
        projectId: "project-1",
        ownerId: user.id,
        toolId: "journey-map",
        schemaVersion: 1,
        revision: 0,
        title: "旧项目旅程图",
        content: baseJourney,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
      },
      "doc-2": {
        id: "doc-2",
        projectId: "project-2",
        ownerId: user.id,
        toolId: "journey-map",
        schemaVersion: 1,
        revision: 3,
        title: "当前项目旅程图",
        content: { ...baseJourney, title: "当前项目旅程图" },
        createdAt: "2026-06-07T00:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      },
    },
  });

  const result = await service.getJourneyMapContext({
    user,
    projectId: "project-2",
  });

  assert.equal(result.project.id, "project-2");
  assert.equal(result.document.id, "doc-2");
  assert.deepEqual(
    result.projects.map((project) => project.id),
    ["project-2", "project-1"],
  );
  assert.equal(result.suggestedDocumentId, "project-2:journey-map");
});

test("saving an existing document requires the current expected revision", async () => {
  const { service } = createService();
  await service.saveJourneyMap({
    user,
    documentId: "doc-1",
    projectId: "project-1",
    title: baseJourney.title,
    schemaVersion: 1,
    expectedRevision: null,
    content: baseJourney,
  });

  const saved = await service.saveJourneyMap({
    user,
    documentId: "doc-1",
    projectId: "project-1",
    title: "第二版",
    schemaVersion: 1,
    expectedRevision: 0,
    content: { ...baseJourney, title: "第二版" },
  });

  assert.equal(saved.document.revision, 1);

  await assert.rejects(
    () =>
      service.saveJourneyMap({
        user,
        documentId: "doc-1",
        projectId: "project-1",
        title: "冲突标题",
        schemaVersion: 1,
        expectedRevision: 0,
        content: { ...baseJourney, title: "冲突标题" },
      }),
    /current revision is 1/,
  );
});

test("successful proposal application writes revision and proposal_applied usage event", async () => {
  const { repository, service } = createService();
  await service.saveJourneyMap({
    user,
    documentId: "doc-1",
    projectId: "project-1",
    title: baseJourney.title,
    schemaVersion: 1,
    expectedRevision: null,
    content: baseJourney,
  });

  const result = await service.applyJourneyMapProposal({
    user,
    documentId: "doc-1",
    projectId: "project-1",
    title: "AI 更新版",
    schemaVersion: 1,
    expectedRevision: 0,
    content: { ...baseJourney, title: "AI 更新版" },
    commandId: "proposal-1",
    summary: ["更新标题"],
    eventMetadata: {
      proposal: { journey: { title: "AI 更新版" } },
      currentJourney: baseJourney,
    },
  });

  assert.equal(result.document.revision, 1);
  assert.equal(repository.revisions.get("doc-1:rev:1").source, "ai_proposal");
  const proposalEvent = [...repository.usageEvents.values()].find(
    (event) => event.eventType === "proposal_applied",
  );
  assert.ok(proposalEvent);
  assert.equal(proposalEvent.revision, 1);
  assert.equal(proposalEvent.metadata.proposal, "[Omitted]");
  assert.equal(proposalEvent.metadata.currentJourney, "[Omitted]");
});

test("export event records only lightweight metadata", async () => {
  const { repository, service } = createService();

  await service.recordExportSucceeded({
    user,
    projectId: "project-1",
    documentId: "doc-1",
    toolId: "journey-map",
    revision: 2,
    exportFormat: "svg",
    idempotencyKey: "export-once",
    metadata: {
      exportFormat: "svg",
      rowCount: 1,
      journey: baseJourney,
    },
  });
  await service.recordExportSucceeded({
    user,
    projectId: "project-1",
    documentId: "doc-1",
    toolId: "journey-map",
    revision: 2,
    exportFormat: "svg",
    idempotencyKey: "export-once",
  });

  const events = [...repository.usageEvents.values()];
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "exported");
  assert.equal(events[0].exportFormat, "svg");
  assert.equal(events[0].metadata.journey, "[Omitted]");
});

test("assistant generation event is accepted for later AI analytics wiring", async () => {
  const { repository, service } = createService();

  await service.recordUsageEvent({
    user,
    projectId: "project-1",
    documentId: "doc-1",
    toolId: "journey-map",
    eventType: "ai_generated",
    revision: 2,
    metadata: {
      responsePhase: "proposal",
      model: "glm-4.6v",
      document: baseJourney,
    },
  });

  const [event] = [...repository.usageEvents.values()];
  assert.equal(event.eventType, "ai_generated");
  assert.equal(event.metadata.document, "[Omitted]");
  assert.equal(event.metadata.responsePhase, "proposal");
});

test("metadata sanitizer truncates long strings and nested payloads", () => {
  const metadata = sanitizeEventMetadata({
    note: "x".repeat(600),
    nested: { document: baseJourney },
  });

  assert.equal(metadata.note.length, 503);
  assert.equal(metadata.nested.document, "[Omitted]");
});
