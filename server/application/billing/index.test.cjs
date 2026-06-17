const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BillingError,
  CREDIT_LEDGER_OPERATIONS,
  buildIdempotencyKey,
  buildOrderPurchaseIdempotencyKey,
  buildReferenceId,
  canTransitionOrderStatus,
  createAssistantBillingService,
  createBillingService,
  InMemoryBillingRepository,
} = require("./index.cjs");
const {
  createBillingConfigService,
  InMemoryBillingConfigRepository,
} = require("../billing-config.cjs");

function createService(seed) {
  const repository = new InMemoryBillingRepository(seed);
  const service = createBillingService({
    repository,
    now: (() => {
      let tick = 0;
      return () => `2026-06-14T00:00:0${tick++}.000Z`;
    })(),
    createId: (() => {
      let tick = 0;
      return (prefix) => `${prefix}-${++tick}`;
    })(),
  });
  return { repository, service };
}

function createAssistantBillingHarness({ billingSeed, pricingSeed } = {}) {
  const { service: billingService } = createService(billingSeed);
  const billingConfigService = createBillingConfigService({
    repository: new InMemoryBillingConfigRepository({
      aiActionPricing: pricingSeed || {
        "journey-map:proposal:standard": {
          id: "journey-map:proposal:standard",
          pricingId: "journey-map:proposal:standard",
          toolKey: "journey-map",
          actionKey: "proposal",
          tierKey: "standard",
          displayName: "Journey Proposal Standard",
          creditCost: 15,
          enabled: true,
          createdAt: "2026-06-14T00:00:00.000Z",
          updatedAt: "2026-06-14T00:00:00.000Z",
        },
      },
    }),
    now: () => "2026-06-14T00:00:00.000Z",
  });
  const assistantBilling = createAssistantBillingService({
    billingService,
    billingConfigService,
    createRunId: (() => {
      let tick = 0;
      return () => `assistant-run-${++tick}`;
    })(),
  });
  return { assistantBilling, billingService, billingConfigService };
}

function key(scope, referenceId, requestId) {
  return buildIdempotencyKey({ scope, referenceId, requestId });
}

async function seedPackage(service, packageId = "starter-100") {
  return service.createCreditPackage({
    packageId,
    displayName: "Starter 100",
    credits: 100,
    bonusCredits: 10,
    priceValue: 990,
    currency: "CNY",
    enabled: true,
    validityDays: 365,
    channelScope: ["mockpay"],
  });
}

async function purchase(service, accountId = "acct-1", credits = 100) {
  const referenceId = buildReferenceId({ scope: "order", id: `seed-${accountId}` });
  return service.purchaseCredits({
    accountId,
    orderId: `order-${accountId}`,
    referenceType: "order",
    referenceId,
    credits,
    idempotencyKey: key("credit.purchase", referenceId, "req-purchase"),
  });
}

test("order state machine allows only the designed transitions", () => {
  assert.equal(canTransitionOrderStatus("created", "pending"), true);
  assert.equal(canTransitionOrderStatus("pending", "paid"), true);
  assert.equal(canTransitionOrderStatus("paid", "fulfilled"), true);
  assert.equal(canTransitionOrderStatus("fulfilled", "refund_pending"), true);
  assert.equal(canTransitionOrderStatus("refund_pending", "refunded"), true);
  assert.equal(canTransitionOrderStatus("created", "paid"), false);
  assert.equal(canTransitionOrderStatus("closed", "paid"), false);
});

test("credit ledger exposes the complete operation vocabulary", () => {
  assert.deepEqual(CREDIT_LEDGER_OPERATIONS, [
    "purchase",
    "grant",
    "reserve",
    "commit",
    "release",
    "refund",
    "adjustment",
    "expire",
  ]);
});

test("CreditPackage defines the order credit and price snapshot", async () => {
  const { service } = createService();
  const creditPackage = await seedPackage(service);
  const referenceId = buildReferenceId({ scope: "order", id: "ord-package" });
  const created = await service.createOrder({
    accountId: "acct-1",
    packageId: creditPackage.packageId,
    provider: "mockpay",
    referenceId,
    idempotencyKey: key("order.create", referenceId, "req-create"),
  });

  assert.equal(created.order.credits, 110);
  assert.equal(created.order.amountValue, 990);
  assert.equal(created.order.currency, "CNY");
});

test("purchase records credits in the available bucket", async () => {
  const { repository, service } = createService();
  const result = await purchase(service);

  assert.deepEqual(result.account, {
    id: "acct-1",
    accountId: "acct-1",
    availableCredits: 100,
    reservedCredits: 0,
    consumedCredits: 0,
    totalIssuedCredits: 100,
    totalExpiredCredits: 0,
  });
  assert.equal([...repository.ledgerEntries.values()][0].operation, "purchase");
  assert.equal([...repository.ledgerEntries.values()][0].credits, 100);
});

test("reserve moves credits from available to reserved", async () => {
  const { service } = createService();
  await purchase(service);
  const referenceId = buildReferenceId({ scope: "ai_run", id: "run-reserve" });

  const result = await service.reserveCredits({
    accountId: "acct-1",
    referenceId,
    toolKey: "journey-map",
    actionKey: "proposal",
    tierKey: "standard",
    credits: 15,
    idempotencyKey: key("credit.reserve", referenceId, "req-reserve"),
  });

  assert.equal(result.reservation.status, "reserved");
  assert.equal(result.reservation.credits, 15);
  assert.equal(result.account.availableCredits, 85);
  assert.equal(result.account.reservedCredits, 15);
  assert.equal(result.account.consumedCredits, 0);
});

test("commit moves reserved credits to consumed", async () => {
  const { service } = createService();
  await purchase(service);
  const referenceId = buildReferenceId({ scope: "ai_run", id: "run-commit" });
  const reserved = await service.reserveCredits({
    accountId: "acct-1",
    referenceId,
    toolKey: "journey-map",
    actionKey: "proposal",
    tierKey: "deep",
    credits: 35,
    idempotencyKey: key("credit.reserve", referenceId, "req-reserve"),
  });

  const result = await service.commitCredits({
    reservationId: reserved.reservation.id,
    referenceId,
    idempotencyKey: key("credit.commit", referenceId, "req-commit"),
  });

  assert.equal(result.reservation.status, "committed");
  assert.equal(result.account.availableCredits, 65);
  assert.equal(result.account.reservedCredits, 0);
  assert.equal(result.account.consumedCredits, 35);
});

test("release returns reserved credits to available", async () => {
  const { service } = createService();
  await purchase(service);
  const referenceId = buildReferenceId({ scope: "ai_run", id: "run-release" });
  const reserved = await service.reserveCredits({
    accountId: "acct-1",
    referenceId,
    toolKey: "journey-map",
    actionKey: "analysis",
    tierKey: "deep",
    credits: 40,
    idempotencyKey: key("credit.reserve", referenceId, "req-reserve"),
  });

  const result = await service.releaseCredits({
    reservationId: reserved.reservation.id,
    referenceId,
    idempotencyKey: key("credit.release", referenceId, "req-release"),
  });

  assert.equal(result.reservation.status, "released");
  assert.equal(result.account.availableCredits, 100);
  assert.equal(result.account.reservedCredits, 0);
  assert.equal(result.account.consumedCredits, 0);
});

test("repeated credit requests return the original result without double mutation", async () => {
  const { repository, service } = createService();
  await purchase(service);
  const referenceId = buildReferenceId({ scope: "ai_run", id: "run-idempotent" });
  const input = {
    accountId: "acct-1",
    referenceId,
    toolKey: "journey-map",
    actionKey: "proposal",
    tierKey: "standard",
    credits: 15,
    idempotencyKey: key("credit.reserve", referenceId, "req-same"),
  };

  const first = await service.reserveCredits(input);
  const duplicate = await service.reserveCredits(input);

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reservation.id, first.reservation.id);
  assert.equal(
    [...repository.ledgerEntries.values()].filter((entry) => entry.operation === "reserve")
      .length,
    1,
  );
});

test("reusing an idempotencyKey with inconsistent payload returns conflict", async () => {
  const { service } = createService();
  await purchase(service);
  const referenceId = buildReferenceId({ scope: "ai_run", id: "run-conflict" });
  const idempotencyKey = key("credit.reserve", referenceId, "req-conflict");
  await service.reserveCredits({
    accountId: "acct-1",
    referenceId,
    toolKey: "journey-map",
    actionKey: "proposal",
    tierKey: "standard",
    credits: 15,
    idempotencyKey,
  });

  await assert.rejects(
    () =>
      service.reserveCredits({
        accountId: "acct-1",
        referenceId,
        toolKey: "journey-map",
        actionKey: "proposal",
        tierKey: "standard",
        credits: 20,
        idempotencyKey,
      }),
    (error) =>
      error instanceof BillingError &&
      error.code === "CREDIT_RESERVATION_IDEMPOTENCY_KEY_REUSED" &&
      error.status === 409,
  );
});

test("purchase business key stays stable per order and rejects conflicting payload", async () => {
  const { service } = createService();
  const referenceId = buildReferenceId({ scope: "order", id: "order-stable-purchase" });
  const idempotencyKey = buildOrderPurchaseIdempotencyKey(referenceId);

  const first = await service.purchaseCredits({
    accountId: "acct-1",
    orderId: "order-stable-purchase",
    referenceType: "order",
    referenceId,
    credits: 12,
    idempotencyKey,
  });
  const duplicate = await service.purchaseCredits({
    accountId: "acct-1",
    orderId: "order-stable-purchase",
    referenceType: "order",
    referenceId,
    credits: 12,
    idempotencyKey,
  });

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.entry.id, first.entry.id);

  await assert.rejects(
    () =>
      service.purchaseCredits({
        accountId: "acct-2",
        orderId: "order-stable-purchase",
        referenceType: "order",
        referenceId,
        credits: 15,
        idempotencyKey,
      }),
    (error) =>
      error instanceof BillingError &&
      error.code === "LEDGER_IDEMPOTENCY_KEY_REUSED" &&
      error.status === 409,
  );
});

test("reserve transaction rolls back reservation when ledger insert fails", async () => {
  const repository = new FailingLedgerRepository("reserve");
  const service = createBillingService({ repository });
  await purchase(service);
  const referenceId = buildReferenceId({ scope: "ai_run", id: "run-reserve-failure" });

  await assert.rejects(() =>
    service.reserveCredits({
      accountId: "acct-1",
      referenceId,
      toolKey: "journey-map",
      actionKey: "proposal",
      tierKey: "standard",
      credits: 15,
      idempotencyKey: key("credit.reserve", referenceId, "req-failure"),
    }),
  );

  assert.equal(repository.reservations.size, 0);
  assert.equal(
    [...repository.ledgerEntries.values()].some((entry) => entry.operation === "reserve"),
    false,
  );
});

test("commit transaction restores active reservation when ledger insert fails", async () => {
  const repository = new FailingLedgerRepository();
  const service = createBillingService({ repository });
  await purchase(service);
  const referenceId = buildReferenceId({ scope: "ai_run", id: "run-commit-failure" });
  const reserved = await service.reserveCredits({
    accountId: "acct-1",
    referenceId,
    toolKey: "journey-map",
    actionKey: "proposal",
    tierKey: "standard",
    credits: 15,
    idempotencyKey: key("credit.reserve", referenceId, "req-reserve"),
  });
  repository.failedOperation = "commit";

  await assert.rejects(() =>
    service.commitCredits({
      reservationId: reserved.reservation.id,
      referenceId,
      idempotencyKey: key("credit.commit", referenceId, "req-failure"),
    }),
  );

  assert.equal(repository.reservations.get(reserved.reservation.id).status, "reserved");
  assert.equal(repository.reservations.get(reserved.reservation.id).version, 0);
  assert.equal(
    [...repository.ledgerEntries.values()].some((entry) => entry.operation === "commit"),
    false,
  );
});

test("release transaction restores active reservation when ledger insert fails", async () => {
  const repository = new FailingLedgerRepository();
  const service = createBillingService({ repository });
  await purchase(service);
  const referenceId = buildReferenceId({ scope: "ai_run", id: "run-release-failure" });
  const reserved = await service.reserveCredits({
    accountId: "acct-1",
    referenceId,
    toolKey: "journey-map",
    actionKey: "analysis",
    tierKey: "deep",
    credits: 20,
    idempotencyKey: key("credit.reserve", referenceId, "req-reserve"),
  });
  repository.failedOperation = "release";

  await assert.rejects(() =>
    service.releaseCredits({
      reservationId: reserved.reservation.id,
      referenceId,
      idempotencyKey: key("credit.release", referenceId, "req-failure"),
    }),
  );

  assert.equal(repository.reservations.get(reserved.reservation.id).status, "reserved");
  assert.equal(repository.reservations.get(reserved.reservation.id).version, 0);
  assert.equal(
    [...repository.ledgerEntries.values()].some((entry) => entry.operation === "release"),
    false,
  );
});

test("settlePaidOrder rolls paid and purchase state back when fulfilled transition fails", async () => {
  const repository = new FulfillmentFailingRepository();
  const service = createBillingService({ repository });
  await seedPackage(service);
  const referenceId = buildReferenceId({ scope: "order", id: "ord-fulfill-failure" });
  const created = await service.createOrder({
    orderId: "order-fulfill-failure",
    accountId: "acct-1",
    packageId: "starter-100",
    provider: "mockpay",
    referenceId,
    idempotencyKey: key("order.create", referenceId, "req-create"),
  });
  await service.markOrderPending({
    orderId: created.order.id,
    referenceId,
    providerOrderId: "provider-order-fulfill-failure",
    idempotencyKey: key("order.pending", referenceId, "req-pending"),
  });

  await assert.rejects(() =>
    service.settlePaidOrder({
      orderId: created.order.id,
      referenceId,
      providerOrderId: "provider-order-fulfill-failure",
      requestId: "req-settle",
    }),
  );

  assert.equal(repository.orders.get(created.order.id).status, "pending");
  assert.equal(
    [...repository.ledgerEntries.values()].some((entry) => entry.operation === "purchase"),
    false,
  );
});

test("billing service refuses atomic billing flows when repository lacks transactions", async () => {
  const repository = createNonTransactionalRepository();
  const service = createBillingService({ repository });

  await assert.rejects(
    () =>
      service.purchaseCredits({
        accountId: "acct-1",
        orderId: "order-no-tx",
        referenceType: "order",
        referenceId: buildReferenceId({ scope: "order", id: "order-no-tx" }),
        credits: 10,
        idempotencyKey: "credit.purchase:order:order-no-tx:req-1",
      }),
    (error) =>
      error instanceof BillingError &&
      error.code === "TRANSACTION_SUPPORT_REQUIRED" &&
      error.status === 500,
  );
});

test("assistant billing service resolves action pricing and reserves credits for a journey run", async () => {
  const { assistantBilling, billingService } = createAssistantBillingHarness();
  await purchase(billingService, "user-1", 100);

  const result = await assistantBilling.startRun({
    user: { id: "user-1" },
    request: {
      toolId: "journey-map",
      skillId: "journey-map-editor",
      document: { toolId: "journey-map" },
    },
  });

  assert.equal(result.creditCost, 15);
  assert.equal(result.toolKey, "journey-map");
  assert.equal(result.actionKey, "proposal");
  assert.equal(result.tierKey, "standard");
  assert.equal(result.referenceId, "ai_run:assistant-run-1");
  assert.equal(result.account.availableCredits, 85);
  assert.equal(result.account.reservedCredits, 15);
});

test("assistant billing service commits reserved credits when the assistant returns a proposal", async () => {
  const { assistantBilling, billingService } = createAssistantBillingHarness();
  await purchase(billingService, "user-1", 100);
  const run = await assistantBilling.startRun({
    user: { id: "user-1" },
    request: {
      toolId: "journey-map",
      document: { toolId: "journey-map" },
    },
  });

  const settled = await assistantBilling.finishRun({
    user: { id: "user-1" },
    run,
    response: { phase: "proposal" },
  });

  assert.equal(settled.reservation.status, "committed");
  assert.equal(settled.account.availableCredits, 85);
  assert.equal(settled.account.reservedCredits, 0);
  assert.equal(settled.account.consumedCredits, 15);
  assert.equal(settled.chargedCredits, 15);
});

test("assistant billing service releases reserved credits for clarify and error outcomes", async () => {
  const { assistantBilling, billingService } = createAssistantBillingHarness();
  await purchase(billingService, "user-1", 100);
  const clarifyRun = await assistantBilling.startRun({
    user: { id: "user-1" },
    request: {
      toolId: "journey-map",
      document: { toolId: "journey-map" },
    },
  });

  const clarified = await assistantBilling.finishRun({
    user: { id: "user-1" },
    run: clarifyRun,
    response: { phase: "clarify" },
  });

  assert.equal(clarified.reservation.status, "released");
  assert.equal(clarified.account.availableCredits, 100);
  assert.equal(clarified.account.reservedCredits, 0);
  assert.equal(clarified.chargedCredits, 0);

  const errorRun = await assistantBilling.startRun({
    user: { id: "user-1" },
    request: {
      toolId: "journey-map",
      document: { toolId: "journey-map" },
    },
  });

  const failed = await assistantBilling.finishRun({
    user: { id: "user-1" },
    run: errorRun,
    error: "timeout",
  });

  assert.equal(failed.reservation.status, "released");
  assert.equal(failed.account.availableCredits, 100);
  assert.equal(failed.chargedCredits, 0);
});

class FailingLedgerRepository extends InMemoryBillingRepository {
  constructor(failedOperation = null) {
    super();
    this.failedOperation = failedOperation;
  }

  async insertLedgerEntry(record) {
    if (record.operation === this.failedOperation) {
      throw new Error(`Injected ${record.operation} ledger failure.`);
    }
    return super.insertLedgerEntry(record);
  }
}

class FulfillmentFailingRepository extends InMemoryBillingRepository {
  async updateOrderIfVersion(orderId, expectedVersion, nextRecord) {
    if (nextRecord.status === "fulfilled") {
      throw new Error("Injected fulfilled transition failure.");
    }
    return super.updateOrderIfVersion(orderId, expectedVersion, nextRecord);
  }
}

function createNonTransactionalRepository(seed) {
  const base = new InMemoryBillingRepository(seed);
  const repository = {};

  for (const name of Object.getOwnPropertyNames(InMemoryBillingRepository.prototype)) {
    if (name === "constructor" || name === "runInTransaction") continue;
    repository[name] = base[name].bind(base);
  }

  return repository;
}
