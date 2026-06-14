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
