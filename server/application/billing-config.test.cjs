const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BillingConfigError,
  InMemoryBillingConfigRepository,
  createBillingConfigService,
} = require("./billing-config.cjs");

function createHarness(seed) {
  const repository = new InMemoryBillingConfigRepository(seed);
  const service = createBillingConfigService({
    repository,
    now: () => "2026-06-14T00:00:00.000Z",
  });
  return { repository, service };
}

const reader = { id: "user-reader", roles: ["member"] };
const admin = { id: "user-admin", roles: ["admin"] };
const billingAdmin = { id: "user-billing-admin", roles: ["billing-admin"] };

function buildModelPolicyTimestamp(index) {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function buildModelPolicyRecord(index, overrides = {}) {
  const toolKey = overrides.toolKey ?? `tool-${index}`;
  const actionKey = overrides.actionKey ?? `action-${index}`;
  const policyId = overrides.policyId ?? `${toolKey}:${actionKey}`;
  const providerKey = overrides.providerKey ?? "openai";
  const modelKey = overrides.modelKey ?? `model-${index}`;
  const timestamp = overrides.updatedAt ?? buildModelPolicyTimestamp(index);
  return {
    id: policyId,
    policyId,
    toolKey,
    actionKey,
    providerKey,
    modelKey,
    provider: providerKey,
    model: modelKey,
    endpoint: null,
    apiKeyRef: `secrets/${toolKey}/${actionKey}`,
    temperature: 0.1,
    maxInputTokens: 8000,
    maxOutputTokens: 2000,
    timeoutMs: 30000,
    enabled: true,
    version: 1,
    createdAt: timestamp,
    createdBy: "seed-admin",
    updatedAt: timestamp,
    updatedBy: "seed-admin",
    ...overrides,
  };
}

function buildFormalModelPolicySeed(count, overridesByIndex = {}) {
  const entries = Array.from({ length: count }, (_, index) => {
    const record = buildModelPolicyRecord(index, overridesByIndex[index] || {});
    return [record.id, record];
  });
  return Object.fromEntries(entries);
}

test("listCreditPackages paginates and filters package records", async () => {
  const { service } = createHarness({
    creditPackages: {
      "starter-100": {
        id: "starter-100",
        packageId: "starter-100",
        displayName: "Starter",
        enabled: true,
        currency: "CNY",
        updatedAt: "2026-06-14T00:00:00.000Z",
      },
      "pro-1000": {
        id: "pro-1000",
        packageId: "pro-1000",
        displayName: "Pro",
        enabled: true,
        currency: "CNY",
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    },
  });

  const result = await service.listCreditPackages({
    user: reader,
    enabled: true,
    limit: 1,
    offset: 0,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].packageId, "starter-100");
  assert.equal(result.page.total, 2);
  assert.equal(result.page.hasMore, true);
});

test("upsertCreditPackage requires admin and stores audit fields", async () => {
  const { service } = createHarness();

  await assert.rejects(
    () =>
      service.upsertCreditPackage({
        user: reader,
        record: {
          packageId: "starter-100",
          displayName: "Starter",
          credits: 100,
          bonusCredits: 0,
          priceValue: 990,
          currency: "CNY",
          enabled: true,
        },
      }),
    (error) => error instanceof BillingConfigError && error.code === "FORBIDDEN",
  );

  const record = await service.upsertCreditPackage({
    user: admin,
    record: {
      packageId: "starter-100",
      displayName: "Starter",
      credits: 100,
      bonusCredits: 10,
      priceValue: 990,
      currency: "CNY",
      enabled: true,
      channelScope: ["wechat", "alipay"],
    },
  });

  assert.equal(record.createdBy, "user-admin");
  assert.equal(record.updatedBy, "user-admin");
  assert.deepEqual(record.channelScope, ["wechat", "alipay"]);
});

test("upsertAiActionPricing creates a composite pricing id when one is not supplied", async () => {
  const { service } = createHarness();

  const record = await service.upsertAiActionPricing({
    user: admin,
    record: {
      toolKey: "journey-map",
      actionKey: "proposal",
      tierKey: "standard",
      displayName: "Journey Proposal Standard",
      creditCost: 15,
      enabled: true,
    },
  });

  assert.equal(record.pricingId, "journey-map:proposal:standard");
});

test("upsertAiActionPricing accepts a consistent id, rejects an inconsistent id, and updates duplicates by composite id", async () => {
  const { service } = createHarness({
    aiActionPricing: {
      "journey-map:proposal:standard": {
        id: "journey-map:proposal:standard",
        pricingId: "journey-map:proposal:standard",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        displayName: "Old",
        creditCost: 10,
        enabled: true,
        createdAt: "2026-06-13T00:00:00.000Z",
        createdBy: "seed-admin",
        updatedAt: "2026-06-13T00:00:00.000Z",
        updatedBy: "seed-admin",
      },
    },
  });

  const updated = await service.upsertAiActionPricing({
    user: admin,
    record: {
      pricingId: "journey-map:proposal:standard",
      toolKey: "journey-map",
      actionKey: "proposal",
      tierKey: "standard",
      displayName: "Journey Proposal Standard",
      creditCost: 20,
      enabled: true,
    },
  });

  assert.equal(updated.pricingId, "journey-map:proposal:standard");
  assert.equal(updated.creditCost, 20);
  assert.equal(updated.createdBy, "seed-admin");
  assert.equal(updated.updatedBy, "user-admin");

  await assert.rejects(
    () =>
      service.upsertAiActionPricing({
        user: admin,
        record: {
          pricingId: "journey-map:proposal:deep",
          toolKey: "journey-map",
          actionKey: "proposal",
          tierKey: "standard",
          displayName: "Journey Proposal Standard",
          creditCost: 15,
          enabled: true,
        },
      }),
    /pricingId must match toolKey:actionKey:tierKey/,
  );
});

test("updateModelPolicy creates a versioned model policy and only stores apiKeyRef", async () => {
  const { service, repository } = createHarness();

  const record = await service.updateModelPolicy({
    user: billingAdmin,
    command: {
      toolKey: "journey-map",
      actionKey: "proposal",
      providerKey: "glm",
      modelKey: "glm-4.6",
      endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      apiKeyRef: "secrets/glm/default",
      temperature: 0.2,
      maxInputTokens: 8000,
      maxOutputTokens: 2000,
      timeoutMs: 30000,
      enabled: true,
      expectedVersion: 0,
    },
  });

  assert.equal(record.policyId, "journey-map:proposal");
  assert.equal(record.providerKey, "glm");
  assert.equal(record.modelKey, "glm-4.6");
  assert.equal(record.provider, "glm");
  assert.equal(record.model, "glm-4.6");
  assert.equal(record.apiKeyRef, "secrets/glm/default");
  assert.equal(record.version, 1);
  assert.equal(record.createdBy, "user-billing-admin");
  assert.equal(record.updatedBy, "user-billing-admin");
  assert.equal(record.apiKey, undefined);

  const stored = await repository.getRecord("ai_model_policies", "journey-map:proposal");
  assert.equal(stored.apiKeyRef, "secrets/glm/default");
  assert.equal(stored.apiKey, undefined);
});

test("updateModelPolicy requires admin or billing-admin", async () => {
  const { service } = createHarness();

  await assert.rejects(
    () =>
      service.updateModelPolicy({
        user: reader,
        command: {
          toolKey: "journey-map",
          actionKey: "proposal",
          providerKey: "glm",
          modelKey: "glm-4.6",
          endpoint: null,
          apiKeyRef: "secrets/glm/default",
          temperature: 0.2,
          maxInputTokens: 8000,
          maxOutputTokens: 2000,
          timeoutMs: 30000,
          enabled: true,
          expectedVersion: 0,
        },
      }),
    (error) => error instanceof BillingConfigError && error.code === "FORBIDDEN",
  );
});

test("updateModelPolicy enforces expectedVersion and increments version on update", async () => {
  const { service } = createHarness({
    aiModelPolicies: {
      "journey-map:proposal": {
        id: "journey-map:proposal",
        policyId: "journey-map:proposal",
        toolKey: "journey-map",
        actionKey: "proposal",
        providerKey: "glm",
        modelKey: "glm-4.5",
        provider: "glm",
        model: "glm-4.5",
        endpoint: null,
        apiKeyRef: "secrets/glm/old",
        temperature: 0.3,
        maxInputTokens: 6000,
        maxOutputTokens: 1500,
        timeoutMs: 25000,
        enabled: true,
        version: 2,
        createdAt: "2026-06-13T00:00:00.000Z",
        createdBy: "seed-admin",
        updatedAt: "2026-06-13T00:00:00.000Z",
        updatedBy: "seed-admin",
      },
    },
  });

  await assert.rejects(
    () =>
      service.updateModelPolicy({
        user: admin,
        command: {
          toolKey: "journey-map",
          actionKey: "proposal",
          providerKey: "glm",
          modelKey: "glm-4.6",
          endpoint: null,
          apiKeyRef: "secrets/glm/default",
          temperature: 0.2,
          maxInputTokens: 8000,
          maxOutputTokens: 2000,
          timeoutMs: 30000,
          enabled: true,
          expectedVersion: 1,
        },
      }),
    (error) =>
      error instanceof BillingConfigError &&
      error.code === "VERSION_CONFLICT" &&
      error.status === 409,
  );

  const updated = await service.updateModelPolicy({
    user: admin,
    command: {
      toolKey: "journey-map",
      actionKey: "proposal",
      providerKey: "openai",
      modelKey: "gpt-5-mini",
      endpoint: "https://api.openai.com/v1",
      apiKeyRef: "secrets/openai/default",
      temperature: 0.1,
      maxInputTokens: 12000,
      maxOutputTokens: 4000,
      timeoutMs: 45000,
      enabled: false,
      expectedVersion: 2,
    },
  });

  assert.equal(updated.version, 3);
  assert.equal(updated.createdBy, "seed-admin");
  assert.equal(updated.updatedBy, "user-admin");
  assert.equal(updated.providerKey, "openai");
  assert.equal(updated.modelKey, "gpt-5-mini");
});

test("updateModelPolicy rejects illegal fields and missing apiKeyRef-only contract", async () => {
  const { service } = createHarness();

  await assert.rejects(
    () =>
      service.updateModelPolicy({
        user: admin,
        command: {
          toolKey: "journey-map",
          actionKey: "proposal",
          providerKey: "glm",
          modelKey: "glm-4.6",
          endpoint: null,
          apiKeyRef: "secrets/glm/default",
          apiKey: "sk-live-raw-secret",
          temperature: 0.2,
          maxInputTokens: 8000,
          maxOutputTokens: 2000,
          timeoutMs: 30000,
          enabled: true,
          expectedVersion: 0,
        },
      }),
    (error) =>
      error instanceof BillingConfigError &&
      error.code === "INVALID_INPUT" &&
      /Unsupported model policy fields: apiKey/.test(error.message),
  );
});

test("updateModelPolicy migrates a legacy standard-tier record without leaving dual records", async () => {
  const { service, repository } = createHarness({
    aiModelPolicies: {
      "journey-map:proposal:standard": {
        id: "journey-map:proposal:standard",
        policyId: "journey-map:proposal:standard",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        provider: "glm",
        model: "glm-4.5",
        endpoint: null,
        apiKeyRef: "secrets/glm/legacy",
        temperature: 0.3,
        maxInputTokens: 6000,
        maxOutputTokens: 1500,
        timeoutMs: 25000,
        enabled: true,
        version: 2,
        createdAt: "2026-06-13T00:00:00.000Z",
        createdBy: "seed-admin",
        updatedAt: "2026-06-13T00:00:00.000Z",
        updatedBy: "seed-admin",
      },
    },
  });

  const updated = await service.updateModelPolicy({
    user: admin,
    command: {
      toolKey: "journey-map",
      actionKey: "proposal",
      providerKey: "openai",
      modelKey: "gpt-5-mini",
      endpoint: "https://api.openai.com/v1",
      apiKeyRef: "secrets/openai/default",
      temperature: 0.1,
      maxInputTokens: 12000,
      maxOutputTokens: 4000,
      timeoutMs: 45000,
      enabled: true,
      expectedVersion: 2,
    },
  });

  assert.equal(updated.policyId, "journey-map:proposal");
  assert.equal(updated.version, 3);
  assert.equal(await repository.getRecord("ai_model_policies", "journey-map:proposal:standard"), null);

  const page = await service.listAiModelPolicies({
    user: admin,
    toolKey: "journey-map",
    actionKey: "proposal",
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].policyId, "journey-map:proposal");
  assert.equal(page.items[0].providerKey, "openai");
});

test("listAiModelPolicies collapses legacy and formal keys to one formal policy", async () => {
  const { service } = createHarness({
    aiModelPolicies: {
      "journey-map:proposal:standard": {
        id: "journey-map:proposal:standard",
        policyId: "journey-map:proposal:standard",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        provider: "glm",
        model: "glm-4.5",
        endpoint: null,
        apiKeyRef: "secrets/glm/legacy",
        temperature: 0.3,
        maxInputTokens: 6000,
        maxOutputTokens: 1500,
        timeoutMs: 25000,
        enabled: true,
        version: 2,
        createdAt: "2026-06-13T00:00:00.000Z",
        updatedAt: "2026-06-13T00:00:00.000Z",
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
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
      },
    },
  });

  const page = await service.listAiModelPolicies({
    user: admin,
    toolKey: "journey-map",
    actionKey: "proposal",
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].policyId, "journey-map:proposal");
  assert.equal(page.items[0].providerKey, "openai");
  assert.equal(page.items[0].modelKey, "gpt-5-mini");
});

test("listAiModelPolicies paginates correctly beyond 200 formal policies", async () => {
  const { service } = createHarness({
    aiModelPolicies: buildFormalModelPolicySeed(201),
  });

  const page = await service.listAiModelPolicies({
    user: admin,
    limit: 50,
    offset: 200,
  });

  assert.equal(page.page.total, 201);
  assert.equal(page.page.offset, 200);
  assert.equal(page.page.hasMore, false);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].policyId, "tool-0:action-0");
});

test("listAiModelPolicies finds post-collapse filters beyond the old 200-record boundary", async () => {
  const { service } = createHarness({
    aiModelPolicies: buildFormalModelPolicySeed(201, {
      0: {
        providerKey: "target-provider",
        provider: "target-provider",
      },
    }),
  });

  const byPolicyId = await service.listAiModelPolicies({
    user: admin,
    policyId: "tool-0:action-0",
  });
  assert.equal(byPolicyId.page.total, 1);
  assert.equal(byPolicyId.items.length, 1);
  assert.equal(byPolicyId.items[0].policyId, "tool-0:action-0");

  const byProvider = await service.listAiModelPolicies({
    user: admin,
    providerKey: "target-provider",
  });
  assert.equal(byProvider.page.total, 1);
  assert.equal(byProvider.items.length, 1);
  assert.equal(byProvider.items[0].providerKey, "target-provider");
  assert.equal(byProvider.items[0].policyId, "tool-0:action-0");
});

test("listAiModelPolicies paginates canonical results when legacy and formal records coexist", async () => {
  const formalSeed = buildFormalModelPolicySeed(200);
  const duplicateFormal = buildModelPolicyRecord(200, {
    toolKey: "journey-map",
    actionKey: "proposal",
    policyId: "journey-map:proposal",
    id: "journey-map:proposal",
    providerKey: "openai",
    provider: "openai",
    modelKey: "gpt-5-mini",
    model: "gpt-5-mini",
    createdAt: "2025-12-31T23:59:58.000Z",
    updatedAt: "2025-12-31T23:59:58.000Z",
  });

  const { service } = createHarness({
    aiModelPolicies: {
      ...formalSeed,
      "journey-map:proposal:standard": {
        id: "journey-map:proposal:standard",
        policyId: "journey-map:proposal:standard",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        provider: "glm",
        model: "glm-4.5",
        endpoint: null,
        apiKeyRef: "secrets/glm/legacy",
        temperature: 0.3,
        maxInputTokens: 6000,
        maxOutputTokens: 1500,
        timeoutMs: 25000,
        enabled: true,
        version: 2,
        createdAt: "2025-12-31T23:59:57.000Z",
        updatedAt: "2025-12-31T23:59:57.000Z",
      },
      [duplicateFormal.id]: duplicateFormal,
    },
  });

  const page = await service.listAiModelPolicies({
    user: admin,
    limit: 10,
    offset: 200,
  });

  assert.equal(page.page.total, 201);
  assert.equal(page.page.hasMore, false);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].policyId, "journey-map:proposal");
  assert.equal(page.items[0].providerKey, "openai");
});
test("listCreditLedger and listAiUsageEvents require admin access", async () => {
  const { service } = createHarness({
    creditLedger: {
      "ledger-1": {
        id: "ledger-1",
        accountId: "acct-1",
        userId: "user-1",
        operation: "purchase",
        referenceType: "order",
        referenceId: "order:1",
        createdAt: "2026-06-14T00:00:00.000Z",
      },
    },
    aiUsageEvents: {
      "usage-1": {
        id: "usage-1",
        userId: "user-1",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        provider: "glm",
        model: "glm-4.5",
        status: "succeeded",
        referenceId: "run:1",
        createdAt: "2026-06-14T00:00:00.000Z",
      },
    },
  });

  await assert.rejects(
    () => service.listCreditLedger({ user: reader }),
    (error) => error instanceof BillingConfigError && error.code === "FORBIDDEN",
  );

  const ledger = await service.listCreditLedger({ user: admin });
  const usage = await service.listAiUsageEvents({ user: admin });

  assert.equal(ledger.items.length, 1);
  assert.equal(usage.items.length, 1);
});
