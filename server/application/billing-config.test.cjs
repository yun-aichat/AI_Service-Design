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

test("upsertAiModelPolicy validates fallback provider/model pairs", async () => {
  const { service } = createHarness();

  await assert.rejects(
    () =>
      service.upsertAiModelPolicy({
        user: admin,
        record: {
          toolKey: "journey-map",
          actionKey: "proposal",
          tierKey: "deep",
          provider: "openai",
          model: "gpt-5-mini",
          temperature: 0.4,
          maxInputTokens: 8000,
          maxOutputTokens: 2000,
          timeoutMs: 30000,
          fallbackProvider: "glm",
          enabled: true,
        },
      }),
    /fallbackProvider and fallbackModel must be provided together/,
  );
});

test("upsertAiModelPolicy accepts a consistent id and rejects an inconsistent id", async () => {
  const { service } = createHarness();

  const record = await service.upsertAiModelPolicy({
    user: admin,
    record: {
      policyId: "journey-map:proposal:standard",
      toolKey: "journey-map",
      actionKey: "proposal",
      tierKey: "standard",
      provider: "glm",
      model: "glm-4.5",
      temperature: 0.2,
      maxInputTokens: 8000,
      maxOutputTokens: 2000,
      timeoutMs: 30000,
      enabled: true,
    },
  });

  assert.equal(record.policyId, "journey-map:proposal:standard");

  await assert.rejects(
    () =>
      service.upsertAiModelPolicy({
        user: admin,
        record: {
          policyId: "journey-map:proposal:deep",
          toolKey: "journey-map",
          actionKey: "proposal",
          tierKey: "standard",
          provider: "glm",
          model: "glm-4.5",
          temperature: 0.2,
          maxInputTokens: 8000,
          maxOutputTokens: 2000,
          timeoutMs: 30000,
          enabled: true,
        },
      }),
    /policyId must match toolKey:actionKey:tierKey/,
  );
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
