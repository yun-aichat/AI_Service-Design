const assert = require("node:assert/strict");
const test = require("node:test");

const { createToolDocumentAssistantUsageRecorder } = require("./usage-recorder.cjs");
const {
  createBillingConfigService,
  InMemoryBillingConfigRepository,
} = require("../billing-config.cjs");

const adminUser = { id: "user-admin", roles: ["admin"] };
const regularUser = { id: "user-1", roles: ["member"] };

test("assistant usage recorder writes structured billing usage events", async () => {
  const repository = new InMemoryBillingConfigRepository({
    aiModelPolicies: {
      "journey-map:proposal:standard": {
        id: "journey-map:proposal:standard",
        policyId: "journey-map:proposal:standard",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        provider: "openai",
        model: "gpt-5-mini",
        temperature: 0.4,
        maxInputTokens: 8000,
        maxOutputTokens: 2000,
        timeoutMs: 30000,
        enabled: true,
        createdAt: "2026-06-16T00:00:00.000Z",
        updatedAt: "2026-06-16T00:00:00.000Z",
      },
    },
  });
  const billingConfigService = createBillingConfigService({
    repository,
    now: () => "2026-06-16T00:00:00.000Z",
  });
  const recorder = createToolDocumentAssistantUsageRecorder({
    toolDocumentService: {
      async recordUsageEvent() {
        return {};
      },
    },
    billingConfigService,
  });

  await recorder.recordGenerated({
    request: {
      toolId: "journey-map",
      toolKey: "journey-map",
      actionKey: "proposal",
      tierKey: "standard",
      skillId: "journey-map-editor",
      skillVersion: "1.0.0",
      document: {
        projectId: "project-1",
        documentId: "doc-1",
        revision: 3,
      },
      messages: [],
      context: {},
    },
    response: { phase: "proposal" },
    user: regularUser,
    model: "gpt-5-mini",
    usage: {
      inputTokens: 1200,
      outputTokens: 300,
    },
    chargedCredits: 15,
    runId: "run-1",
  });

  const result = await billingConfigService.listAiUsageEvents({ user: adminUser });
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    id: "run-1:succeeded",
    userId: "user-1",
    projectId: "project-1",
    documentId: "doc-1",
    toolKey: "journey-map",
    actionKey: "proposal",
    tierKey: "standard",
    provider: "openai",
    model: "gpt-5-mini",
    inputTokens: 1200,
    outputTokens: 300,
    totalTokens: 1500,
    estimatedCostValue: null,
    chargedCredits: 15,
    status: "succeeded",
    referenceId: "run-1",
    createdAt: "2026-06-16T00:00:00.000Z",
  });
});

test("assistant usage recorder derives billing usage keys from the real journey request shape", async () => {
  const repository = new InMemoryBillingConfigRepository({
    aiModelPolicies: {
      "journey-map:proposal:standard": {
        id: "journey-map:proposal:standard",
        policyId: "journey-map:proposal:standard",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        provider: "openai",
        model: "gpt-5-mini",
        temperature: 0.4,
        maxInputTokens: 8000,
        maxOutputTokens: 2000,
        timeoutMs: 30000,
        enabled: true,
        createdAt: "2026-06-16T00:00:00.000Z",
        updatedAt: "2026-06-16T00:00:00.000Z",
      },
    },
  });
  const billingConfigService = createBillingConfigService({
    repository,
    now: () => "2026-06-16T00:00:00.000Z",
  });
  const recorder = createToolDocumentAssistantUsageRecorder({
    toolDocumentService: {
      async recordUsageEvent() {
        return {};
      },
    },
    billingConfigService,
  });

  await recorder.recordGenerated({
    request: {
      scope: "tool",
      toolId: "journey-map",
      skillId: "journey-map-editor",
      skillVersion: "1.0.0",
      document: {
        toolId: "journey-map",
        projectId: "project-1",
        documentId: "doc-1",
        revision: 3,
      },
      context: {
        serviceName: "门店预约服务",
        toolName: "Journey Map",
        toolContext: { title: "门店预约服务用户旅程图" },
        usageEventCandidate: "ai_generated",
      },
      messages: [{ id: "message-1", role: "user", content: "请先确认目标用户。" }],
    },
    response: { phase: "proposal" },
    user: regularUser,
    model: "gpt-5-mini",
    usage: { inputTokens: 200, outputTokens: 50 },
    runId: "run-real-shape",
  });

  const result = await billingConfigService.listAiUsageEvents({ user: adminUser });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].toolKey, "journey-map");
  assert.equal(result.items[0].actionKey, "proposal");
  assert.equal(result.items[0].tierKey, "standard");
  assert.equal(result.items[0].provider, "openai");
});

test("assistant usage recorder marks failed generations without blocking tool usage writes", async () => {
  const repository = new InMemoryBillingConfigRepository();
  const billingConfigService = createBillingConfigService({
    repository,
    now: () => "2026-06-16T00:00:00.000Z",
  });
  let toolWriteCount = 0;
  const recorder = createToolDocumentAssistantUsageRecorder({
    toolDocumentService: {
      async recordUsageEvent() {
        toolWriteCount += 1;
        return {};
      },
    },
    billingConfigService,
  });

  await recorder.recordGenerated({
    request: {
      toolId: "journey-map",
      toolKey: "journey-map",
      actionKey: "proposal",
      tierKey: "standard",
      skillId: "journey-map-editor",
      skillVersion: "1.0.0",
      document: {
        projectId: "project-1",
        documentId: "doc-1",
        revision: 3,
      },
      messages: [],
      context: {},
    },
    response: null,
    user: regularUser,
    model: null,
    usage: null,
    runId: "run-2",
    error: "timeout",
  });

  const result = await billingConfigService.listAiUsageEvents({ user: adminUser });
  assert.equal(toolWriteCount, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, "failed");
  assert.equal(result.items[0].provider, "unknown");
  assert.equal(result.items[0].referenceId, "run-2");
});
