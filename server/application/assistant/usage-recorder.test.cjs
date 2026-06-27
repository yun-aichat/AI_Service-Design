const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BILLING_STATUS,
  createToolDocumentAssistantUsageRecorder,
  resolveBillingEventStatus,
  resolveBillingResult,
} = require("./usage-recorder.cjs");
const {
  createBillingConfigService,
  InMemoryBillingConfigRepository,
} = require("../billing-config.cjs");

const adminUser = { id: "user-admin", roles: ["admin"] };
const regularUser = { id: "user-1", roles: ["member"] };

function createTestRecorder({
  seed = {},
  toolWriteCount = null,
} = {}) {
  const tracker = { writeCount: 0 };
  const repository = new InMemoryBillingConfigRepository(seed);
  const billingConfigService = createBillingConfigService({
    repository,
    now: () => "2026-06-16T00:00:00.000Z",
  });
  const recorder = createToolDocumentAssistantUsageRecorder({
    toolDocumentService: {
      async recordUsageEvent() {
        tracker.writeCount += 1;
        return {};
      },
    },
    billingConfigService,
  });
  return { recorder, billingConfigService, tracker };
}

const standardPolicy = {
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
};

const baseRequest = {
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
};

// ---------------------------------------------------------------------------
// Status resolution unit tests
// ---------------------------------------------------------------------------

test("resolveBillingEventStatus: error -> failed", () => {
  assert.equal(resolveBillingEventStatus("timeout", null), "failed");
  assert.equal(resolveBillingEventStatus("timeout", "proposal"), "failed");
  assert.equal(resolveBillingEventStatus("timeout", "clarify"), "failed");
});

test("resolveBillingEventStatus: clarify -> cancelled", () => {
  assert.equal(resolveBillingEventStatus(null, "clarify"), "cancelled");
  assert.equal(resolveBillingEventStatus(undefined, "clarify"), "cancelled");
});

test("resolveBillingEventStatus: proposal -> succeeded", () => {
  assert.equal(resolveBillingEventStatus(null, "proposal"), "succeeded");
});

test("resolveBillingEventStatus: message -> succeeded", () => {
  assert.equal(resolveBillingEventStatus(null, "message"), "succeeded");
});

test("resolveBillingEventStatus: null response with no error -> failed", () => {
  assert.equal(resolveBillingEventStatus(null, null), "failed");
  assert.equal(resolveBillingEventStatus(undefined, undefined), "failed");
});

// ---------------------------------------------------------------------------
// Billing result resolution unit tests
// ---------------------------------------------------------------------------

test("resolveBillingResult: succeeded with positive credits -> charged", () => {
  assert.equal(resolveBillingResult("succeeded", 15), BILLING_STATUS.CHARGED);
});

test("resolveBillingResult: succeeded with zero credits -> not_charged", () => {
  assert.equal(resolveBillingResult("succeeded", 0), BILLING_STATUS.NOT_CHARGED);
});

test("resolveBillingResult: failed -> not_charged (credits ignored)", () => {
  assert.equal(resolveBillingResult("failed", 15), BILLING_STATUS.NOT_CHARGED);
  assert.equal(resolveBillingResult("failed", 0), BILLING_STATUS.NOT_CHARGED);
});

test("resolveBillingResult: cancelled -> not_charged (credits ignored)", () => {
  assert.equal(resolveBillingResult("cancelled", 15), BILLING_STATUS.NOT_CHARGED);
  assert.equal(resolveBillingResult("cancelled", 0), BILLING_STATUS.NOT_CHARGED);
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

test("assistant usage recorder writes structured billing usage events", async () => {
  const { recorder, billingConfigService } = createTestRecorder({
    seed: { aiModelPolicies: standardPolicy },
  });

  await recorder.recordGenerated({
    request: baseRequest,
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
    runId: "run-1",
    toolKey: "journey-map",
    actionKey: "proposal",
    tierKey: "standard",
    providerKey: "openai",
    modelKey: "gpt-5-mini",
    provider: "openai",
    model: "gpt-5-mini",
    endpoint: null,
    conversationId: null,
    inputTokens: 1200,
    outputTokens: 300,
    totalTokens: 1500,
    estimatedCostValue: null,
    chargedCredits: 15,
    status: "succeeded",
    billingStatus: "charged",
    referenceId: "run-1",
    createdAt: "2026-06-16T00:00:00.000Z",
  });
});

test("assistant usage recorder derives billing usage keys from the real journey request shape", async () => {
  const { recorder, billingConfigService } = createTestRecorder({
    seed: { aiModelPolicies: standardPolicy },
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

test("assistant usage recorder prefers the formal model policy when legacy and formal keys coexist", async () => {
  const { recorder, billingConfigService } = createTestRecorder({
    seed: {
      aiModelPolicies: {
        "journey-map:proposal:standard": {
          id: "journey-map:proposal:standard",
          policyId: "journey-map:proposal:standard",
          toolKey: "journey-map",
          actionKey: "proposal",
          tierKey: "standard",
          provider: "glm",
          model: "glm-4.5",
          temperature: 0.4,
          maxInputTokens: 8000,
          maxOutputTokens: 2000,
          timeoutMs: 30000,
          enabled: true,
          createdAt: "2026-06-16T00:00:00.000Z",
          updatedAt: "2026-06-16T00:00:00.000Z",
        },
        "journey-map:proposal": {
          id: "journey-map:proposal",
          policyId: "journey-map:proposal",
          toolKey: "journey-map",
          actionKey: "proposal",
          providerKey: "openai",
          modelKey: "gpt-5-mini",
          provider: "openai",
          model: "gpt-5-mini",
          endpoint: "https://api.openai.com/v1",
          apiKeyRef: "secrets/openai/default",
          temperature: 0.1,
          maxInputTokens: 12000,
          maxOutputTokens: 4000,
          timeoutMs: 45000,
          enabled: true,
          version: 3,
          createdAt: "2026-06-17T00:00:00.000Z",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      },
    },
  });

  await recorder.recordGenerated({
    request: baseRequest,
    response: { phase: "proposal" },
    user: regularUser,
    model: "gpt-5-mini",
    usage: { inputTokens: 150, outputTokens: 30 },
    chargedCredits: 15,
    runId: "run-prefer-formal",
  });

  const result = await billingConfigService.listAiUsageEvents({ user: adminUser });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].provider, "openai");
  assert.equal(result.items[0].referenceId, "run-prefer-formal");
});

test("assistant usage recorder marks failed generations without blocking tool usage writes", async () => {
  const { recorder, billingConfigService, tracker } = createTestRecorder();

  await recorder.recordGenerated({
    request: baseRequest,
    response: null,
    user: regularUser,
    model: null,
    usage: null,
    runId: "run-2",
    error: "timeout",
  });

  const result = await billingConfigService.listAiUsageEvents({ user: adminUser });
  assert.equal(tracker.writeCount, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, "failed");
  assert.equal(result.items[0].billingStatus, "not_charged");
  assert.equal(result.items[0].chargedCredits, 0);
  assert.equal(result.items[0].provider, "unknown");
  assert.equal(result.items[0].referenceId, "run-2");
});

test("clarify responses are marked cancelled with zero credits", async () => {
  const { recorder, billingConfigService } = createTestRecorder({
    seed: { aiModelPolicies: standardPolicy },
  });

  await recorder.recordGenerated({
    request: baseRequest,
    response: { phase: "clarify" },
    user: regularUser,
    model: "gpt-5-mini",
    usage: { inputTokens: 500, outputTokens: 80 },
    chargedCredits: 15,
    runId: "run-clarify",
  });

  const result = await billingConfigService.listAiUsageEvents({ user: adminUser });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, "cancelled");
  assert.equal(result.items[0].billingStatus, "not_charged");
  assert.equal(result.items[0].chargedCredits, 0);
  assert.equal(result.items[0].referenceId, "run-clarify");
  assert.equal(result.items[0].id, "run-clarify:cancelled");
});

test("null response without error is marked failed with zero credits", async () => {
  const { recorder, billingConfigService, tracker } = createTestRecorder();

  await recorder.recordGenerated({
    request: baseRequest,
    response: null,
    user: regularUser,
    model: "gpt-5-mini",
    usage: { inputTokens: 100, outputTokens: 20 },
    chargedCredits: 10,
    runId: "run-null-response",
  });

  const result = await billingConfigService.listAiUsageEvents({ user: adminUser });
  assert.equal(tracker.writeCount, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].status, "failed");
  assert.equal(result.items[0].billingStatus, "not_charged");
  assert.equal(result.items[0].chargedCredits, 0);
});

test("chargedCredits forced to zero when status is not succeeded", async () => {
  const { recorder, billingConfigService } = createTestRecorder({
    seed: { aiModelPolicies: standardPolicy },
  });

  await recorder.recordGenerated({
    request: baseRequest,
    response: { phase: "clarify" },
    user: regularUser,
    model: "gpt-5-mini",
    usage: { inputTokens: 200, outputTokens: 40 },
    chargedCredits: 999,
    runId: "run-force-zero",
  });

  const result = await billingConfigService.listAiUsageEvents({ user: adminUser });
  assert.equal(result.items[0].chargedCredits, 0);
  assert.equal(result.items[0].status, "cancelled");

  // Verify that succeeded events keep their chargedCredits
  await recorder.recordGenerated({
    request: baseRequest,
    response: { phase: "proposal" },
    user: regularUser,
    model: "gpt-5-mini",
    usage: { inputTokens: 200, outputTokens: 40 },
    chargedCredits: 20,
    runId: "run-charged",
  });

  const allEvents = await billingConfigService.listAiUsageEvents({ user: adminUser });
  const chargedEvent = allEvents.items.find((e) => e.referenceId === "run-charged");
  assert.equal(chargedEvent.chargedCredits, 20);
  assert.equal(chargedEvent.billingStatus, "charged");

  const cancelledEvent = allEvents.items.find((e) => e.referenceId === "run-force-zero");
  assert.equal(cancelledEvent.chargedCredits, 0);
  assert.equal(cancelledEvent.billingStatus, "not_charged");
});

test("billingStatus can be used as a filter in listAiUsageEvents", async () => {
  const { recorder, billingConfigService } = createTestRecorder({
    seed: { aiModelPolicies: standardPolicy },
  });

  await recorder.recordGenerated({
    request: baseRequest,
    response: { phase: "proposal" },
    user: regularUser,
    model: "gpt-5-mini",
    usage: { inputTokens: 100, outputTokens: 20 },
    chargedCredits: 10,
    runId: "run-filter-1",
  });

  await recorder.recordGenerated({
    request: baseRequest,
    response: { phase: "clarify" },
    user: regularUser,
    model: "gpt-5-mini",
    usage: { inputTokens: 50, outputTokens: 10 },
    chargedCredits: 10,
    runId: "run-filter-2",
  });

  const charged = await billingConfigService.listAiUsageEvents({
    user: adminUser,
    billingStatus: "charged",
  });
  assert.equal(charged.items.length, 1);
  assert.equal(charged.items[0].referenceId, "run-filter-1");

  const notCharged = await billingConfigService.listAiUsageEvents({
    user: adminUser,
    billingStatus: "not_charged",
  });
  assert.equal(notCharged.items.length, 1);
  assert.equal(notCharged.items[0].referenceId, "run-filter-2");
});
