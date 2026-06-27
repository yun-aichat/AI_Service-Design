const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BillingConfigError,
  InMemoryBillingConfigRepository,
  createBillingConfigService,
} = require("./billing-config.cjs");
const {
  CloudBaseBillingConfigRepository,
} = require("../infrastructure/cloudbase/billing-config/repository.cjs");

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

test("updateActionPricing requires billing admin roles", async () => {
  const { service } = createHarness({
    aiActionPricing: {
      "journey-map:skeleton_generate:standard": {
        id: "journey-map:skeleton_generate:standard",
        pricingId: "journey-map:skeleton_generate:standard",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "standard",
        displayName: "Journey Skeleton",
        creditCost: 5,
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
      service.updateActionPricing({
        user: reader,
        command: {
          toolKey: "journey-map",
          actionKey: "skeleton_generate",
          tierKey: "standard",
          creditCost: 8,
          enabled: false,
          expectedVersion: 2,
        },
      }),
    (error) => error instanceof BillingConfigError && error.code === "FORBIDDEN",
  );
});

test("updateActionPricing rejects negative credit cost", async () => {
  const { service } = createHarness({
    aiActionPricing: {
      "journey-map:skeleton_generate:standard": {
        id: "journey-map:skeleton_generate:standard",
        pricingId: "journey-map:skeleton_generate:standard",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "standard",
        displayName: "Journey Skeleton",
        creditCost: 5,
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
      service.updateActionPricing({
        user: admin,
        command: {
          toolKey: "journey-map",
          actionKey: "skeleton_generate",
          tierKey: "standard",
          creditCost: -1,
          enabled: true,
          expectedVersion: 2,
        },
      }),
    (error) => error instanceof BillingConfigError && error.code === "INVALID_INPUT",
  );
});

test("updateActionPricing updates only the requested tier and preserves other tiers", async () => {
  const { service, repository } = createHarness({
    aiActionPricing: {
      "journey-map:skeleton_generate:standard": {
        id: "journey-map:skeleton_generate:standard",
        pricingId: "journey-map:skeleton_generate:standard",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "standard",
        displayName: "Journey Skeleton",
        description: "seed description",
        creditCost: 5,
        enabled: true,
        metadata: { lockedBy: "seed" },
        version: 2,
        createdAt: "2026-06-13T00:00:00.000Z",
        createdBy: "seed-admin",
        updatedAt: "2026-06-13T00:00:00.000Z",
        updatedBy: "seed-admin",
      },
      "journey-map:skeleton_generate:deep": {
        id: "journey-map:skeleton_generate:deep",
        pricingId: "journey-map:skeleton_generate:deep",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "deep",
        displayName: "Journey Skeleton Deep",
        description: "deep seed description",
        creditCost: 12,
        enabled: true,
        metadata: { lockedBy: "seed-deep" },
        version: 4,
        createdAt: "2026-06-12T00:00:00.000Z",
        createdBy: "seed-admin",
        updatedAt: "2026-06-12T00:00:00.000Z",
        updatedBy: "seed-admin",
      },
    },
  });

  const record = await service.updateActionPricing({
    user: billingAdmin,
    command: {
      toolKey: "journey-map",
      actionKey: "skeleton_generate",
      tierKey: "standard",
      creditCost: 8,
      enabled: false,
      expectedVersion: 2,
    },
  });

  assert.equal(record.creditCost, 8);
  assert.equal(record.enabled, false);
  assert.equal(record.version, 3);
  assert.equal(record.tierKey, "standard");
  assert.equal(record.displayName, "Journey Skeleton");
  assert.equal(record.description, "seed description");
  assert.deepEqual(record.metadata, { lockedBy: "seed" });
  assert.equal(record.updatedBy, "user-billing-admin");
  assert.equal(record.createdBy, "seed-admin");

  const stored = await repository.getRecord(
    "ai_action_pricing",
    "journey-map:skeleton_generate:standard",
  );
  assert.equal(stored.creditCost, 8);
  assert.equal(stored.enabled, false);
  assert.equal(stored.version, 3);

  const untouched = await repository.getRecord(
    "ai_action_pricing",
    "journey-map:skeleton_generate:deep",
  );
  assert.equal(untouched.creditCost, 12);
  assert.equal(untouched.enabled, true);
  assert.equal(untouched.version, 4);
});

test("updateActionPricing can precisely update one tier when the same action has standard and deep pricing", async () => {
  const { service, repository } = createHarness({
    aiActionPricing: {
      "journey-map:persona_run:standard": {
        id: "journey-map:persona_run:standard",
        pricingId: "journey-map:persona_run:standard",
        toolKey: "journey-map",
        actionKey: "persona_run",
        tierKey: "standard",
        displayName: "Persona Run Standard",
        creditCost: 10,
        enabled: true,
        version: 1,
        createdAt: "2026-06-13T00:00:00.000Z",
        createdBy: "seed-admin",
        updatedAt: "2026-06-13T00:00:00.000Z",
        updatedBy: "seed-admin",
      },
      "journey-map:persona_run:deep": {
        id: "journey-map:persona_run:deep",
        pricingId: "journey-map:persona_run:deep",
        toolKey: "journey-map",
        actionKey: "persona_run",
        tierKey: "deep",
        displayName: "Persona Run Deep",
        creditCost: 20,
        enabled: true,
        version: 7,
        createdAt: "2026-06-12T00:00:00.000Z",
        createdBy: "seed-admin",
        updatedAt: "2026-06-12T00:00:00.000Z",
        updatedBy: "seed-admin",
      },
    },
  });

  const record = await service.updateActionPricing({
    user: admin,
    command: {
      toolKey: "journey-map",
      actionKey: "persona_run",
      tierKey: "deep",
      creditCost: 25,
      enabled: false,
      expectedVersion: 7,
    },
  });

  assert.equal(record.pricingId, "journey-map:persona_run:deep");
  assert.equal(record.tierKey, "deep");
  assert.equal(record.creditCost, 25);
  assert.equal(record.enabled, false);
  assert.equal(record.version, 8);

  const deepRecord = await repository.getRecord(
    "ai_action_pricing",
    "journey-map:persona_run:deep",
  );
  const standardRecord = await repository.getRecord(
    "ai_action_pricing",
    "journey-map:persona_run:standard",
  );
  assert.equal(deepRecord.creditCost, 25);
  assert.equal(deepRecord.enabled, false);
  assert.equal(deepRecord.version, 8);
  assert.equal(standardRecord.creditCost, 10);
  assert.equal(standardRecord.enabled, true);
  assert.equal(standardRecord.version, 1);
});

test("updateActionPricing returns a version conflict when expectedVersion is stale", async () => {
  const { service } = createHarness({
    aiActionPricing: {
      "journey-map:skeleton_generate:standard": {
        id: "journey-map:skeleton_generate:standard",
        pricingId: "journey-map:skeleton_generate:standard",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "standard",
        displayName: "Journey Skeleton",
        creditCost: 5,
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
      service.updateActionPricing({
        user: admin,
        command: {
          toolKey: "journey-map",
          actionKey: "skeleton_generate",
          tierKey: "standard",
          creditCost: 8,
          enabled: false,
          expectedVersion: 1,
        },
      }),
    (error) =>
      error instanceof BillingConfigError &&
      error.code === "ACTION_PRICING_VERSION_CONFLICT" &&
      error.status === 409,
  );
});

test("updateActionPricing returns not found when the requested tier has no pricing record", async () => {
  const { service } = createHarness({
    aiActionPricing: {
      "journey-map:skeleton_generate:standard": {
        id: "journey-map:skeleton_generate:standard",
        pricingId: "journey-map:skeleton_generate:standard",
        toolKey: "journey-map",
        actionKey: "skeleton_generate",
        tierKey: "standard",
        displayName: "Journey Skeleton",
        creditCost: 5,
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
      service.updateActionPricing({
        user: admin,
        command: {
          toolKey: "journey-map",
          actionKey: "skeleton_generate",
          tierKey: "deep",
          creditCost: 8,
          enabled: false,
          expectedVersion: 0,
        },
      }),
    (error) =>
      error instanceof BillingConfigError &&
      error.code === "ACTION_PRICING_NOT_FOUND" &&
      error.status === 404,
  );
});

test("updateActionPricing returns ACTION_PRICING_AMBIGUOUS 409 for CloudBase duplicate matches on the same tier", async () => {
  const repository = new CloudBaseBillingConfigRepository(
    createCloudBaseDatabase({
      ai_action_pricing: {
        "pricing-1": {
          id: "pricing-1",
          pricingId: "journey-map:skeleton_generate:standard",
          toolKey: "journey-map",
          actionKey: "skeleton_generate",
          tierKey: "standard",
          displayName: "Journey Skeleton Standard",
          creditCost: 5,
          enabled: true,
          version: 2,
        },
        "pricing-2": {
          id: "pricing-2",
          pricingId: "journey-map:skeleton_generate:standard:duplicate",
          toolKey: "journey-map",
          actionKey: "skeleton_generate",
          tierKey: "standard",
          displayName: "Journey Skeleton Standard Duplicate",
          creditCost: 7,
          enabled: true,
          version: 3,
        },
      },
    }),
  );
  const service = createBillingConfigService({
    repository,
    now: () => "2026-06-14T00:00:00.000Z",
  });

  await assert.rejects(
    () =>
      service.updateActionPricing({
        user: admin,
        command: {
          toolKey: "journey-map",
          actionKey: "skeleton_generate",
          tierKey: "standard",
          creditCost: 9,
          enabled: false,
          expectedVersion: 2,
        },
      }),
    (error) =>
      error instanceof BillingConfigError &&
      error.code === "ACTION_PRICING_AMBIGUOUS" &&
      error.status === 409,
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


test("listJourneyRunAuditRecords returns a formal audit page with filters and pagination", async () => {
  const { service } = createHarness({
    aiUsageEvents: {
      "audit-1": {
        id: "audit-1",
        runId: "journey-run-1",
        userId: "user-1",
        projectId: "project-1",
        documentId: "doc-1",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        providerKey: "openai",
        modelKey: "gpt-5-mini",
        provider: "openai",
        model: "gpt-5-mini",
        endpoint: "https://api.openai.com/v1",
        conversationId: "conversation-1",
        chargedCredits: 15,
        status: "succeeded",
        referenceId: "ai_run:journey-run-1",
        createdAt: "2026-06-14T00:00:02.000Z",
      },
      "audit-2": {
        id: "audit-2",
        runId: "journey-run-2",
        userId: "user-2",
        projectId: "project-2",
        documentId: "doc-2",
        toolKey: "journey-map",
        actionKey: "clarify",
        tierKey: "standard",
        providerKey: "glm",
        modelKey: "glm-4.6",
        provider: "glm",
        model: "glm-4.6",
        endpoint: null,
        conversationId: "conversation-2",
        chargedCredits: 0,
        status: "cancelled",
        referenceId: "ai_run:journey-run-2",
        createdAt: "2026-06-14T00:00:01.000Z",
      },
      "audit-3": {
        id: "audit-3",
        runId: "assistant-run-1",
        toolKey: "assistant-tool",
        actionKey: "proposal",
        tierKey: "standard",
        providerKey: "openai",
        modelKey: "gpt-5-mini",
        provider: "openai",
        model: "gpt-5-mini",
        conversationId: "conversation-1",
        chargedCredits: 9,
        status: "succeeded",
        referenceId: "ai_run:assistant-run-1",
        createdAt: "2026-06-14T00:00:03.000Z",
      },
    },
  });

  const filtered = await service.listJourneyRunAuditRecords({
    user: admin,
    providerKey: "openai",
    conversationId: "conversation-1",
    limit: 1,
    offset: 0,
  });

  assert.equal(filtered.page.total, 1);
  assert.equal(filtered.page.hasMore, false);
  assert.deepEqual(filtered.items[0], {
    id: "audit-1",
    runId: "journey-run-1",
    userId: "user-1",
    projectId: "project-1",
    documentId: "doc-1",
    actionKey: "proposal",
    chargedCredits: 15,
    providerKey: "openai",
    modelKey: "gpt-5-mini",
    endpoint: "https://api.openai.com/v1",
    conversationId: "conversation-1",
    referenceId: "ai_run:journey-run-1",
    status: "succeeded",
    createdAt: "2026-06-14T00:00:02.000Z",
  });

  const paged = await service.listJourneyRunAuditRecords({
    user: billingAdmin,
    limit: 1,
    offset: 1,
  });

  assert.equal(paged.page.total, 2);
  assert.equal(paged.page.hasMore, false);
  assert.equal(paged.items[0].runId, "journey-run-2");
});

test("listJourneyRunAuditRecords keeps provider/model fallback filters aligned for legacy records", async () => {
  const { service } = createHarness({
    aiUsageEvents: {
      "legacy-audit": {
        id: "legacy-audit",
        runId: "journey-run-legacy",
        userId: "user-legacy",
        projectId: "project-legacy",
        documentId: "doc-legacy",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        provider: "openai",
        model: "gpt-5-mini",
        chargedCredits: 12,
        status: "succeeded",
        referenceId: "ai_run:journey-run-legacy",
        createdAt: "2026-06-14T00:00:03.000Z",
      },
      "new-audit": {
        id: "new-audit",
        runId: "journey-run-new",
        userId: "user-new",
        projectId: "project-new",
        documentId: "doc-new",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        providerKey: "glm",
        modelKey: "glm-4.6",
        provider: "glm",
        model: "glm-4.6",
        chargedCredits: 9,
        status: "succeeded",
        referenceId: "ai_run:journey-run-new",
        createdAt: "2026-06-14T00:00:02.000Z",
      },
      "assistant-audit": {
        id: "assistant-audit",
        runId: "assistant-run-1",
        toolKey: "assistant-tool",
        actionKey: "proposal",
        tierKey: "standard",
        provider: "openai",
        model: "gpt-5-mini",
        chargedCredits: 5,
        status: "succeeded",
        referenceId: "ai_run:assistant-run-1",
        createdAt: "2026-06-14T00:00:04.000Z",
      },
    },
  });

  const all = await service.listJourneyRunAuditRecords({
    user: admin,
    limit: 10,
    offset: 0,
  });
  assert.equal(all.page.total, 2);
  assert.equal(all.items[0].runId, "journey-run-legacy");
  assert.equal(all.items[0].providerKey, "openai");
  assert.equal(all.items[0].modelKey, "gpt-5-mini");

  const byProvider = await service.listJourneyRunAuditRecords({
    user: admin,
    providerKey: "openai",
    limit: 10,
    offset: 0,
  });
  assert.equal(byProvider.page.total, 1);
  assert.equal(byProvider.items[0].runId, "journey-run-legacy");

  const byModel = await service.listJourneyRunAuditRecords({
    user: admin,
    modelKey: "gpt-5-mini",
    limit: 10,
    offset: 0,
  });
  assert.equal(byModel.page.total, 1);
  assert.equal(byModel.items[0].runId, "journey-run-legacy");

  const pagedByProvider = await service.listJourneyRunAuditRecords({
    user: admin,
    providerKey: "glm",
    limit: 1,
    offset: 0,
  });
  assert.equal(pagedByProvider.page.total, 1);
  assert.equal(pagedByProvider.page.hasMore, false);
  assert.equal(pagedByProvider.items[0].runId, "journey-run-new");
});

test("listJourneyRunAuditRecords requires admin access and only supports createdAt sorting", async () => {
  const { service } = createHarness({
    aiUsageEvents: {
      "audit-1": {
        id: "audit-1",
        runId: "journey-run-1",
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        providerKey: "openai",
        modelKey: "gpt-5-mini",
        provider: "openai",
        model: "gpt-5-mini",
        chargedCredits: 15,
        status: "succeeded",
        referenceId: "ai_run:journey-run-1",
        createdAt: "2026-06-14T00:00:02.000Z",
      },
    },
  });

  await assert.rejects(
    () => service.listJourneyRunAuditRecords({ user: reader }),
    (error) => error instanceof BillingConfigError && error.code === "FORBIDDEN",
  );

  await assert.rejects(
    () => service.listJourneyRunAuditRecords({ user: admin, sortBy: "status" }),
    (error) =>
      error instanceof BillingConfigError &&
      error.code === "INVALID_INPUT" &&
      /sortBy=createdAt/.test(error.message),
  );
});
function createCloudBaseDatabase(seed = {}) {
  const stores = {
    credit_packages: new Map(),
    ai_action_pricing: new Map(
      Object.entries(seed.ai_action_pricing || {}).map(([id, value]) => [id, cloneJson(value)]),
    ),
    ai_model_policies: new Map(),
    credit_ledger: new Map(),
    ai_usage_events: new Map(),
  };

  return {
    collection(name) {
      const store = stores[name];
      return {
        doc(id) {
          return {
            async get() {
              return { data: store.has(id) ? cloneJson(store.get(id)) : null };
            },
            async set(record) {
              store.set(id, cloneJson(record));
              return { id };
            },
          };
        },
        where(query) {
          const matched = [...store.values()].filter((entry) =>
            Object.entries(query).every(([key, value]) => entry?.[key] === value),
          );
          return {
            limit(limitValue) {
              return {
                async get() {
                  return { data: matched.slice(0, limitValue).map((entry) => cloneJson(entry)) };
                },
              };
            },
            async update(record) {
              if (matched.length !== 1) return { updated: 0 };
              store.set(matched[0].id, cloneJson(record));
              return { updated: 1 };
            },
          };
        },
      };
    },
  };
}

function cloneJson(value) {
  return value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
}
