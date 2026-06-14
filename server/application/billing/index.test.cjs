const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BillingError,
  CREDIT_LEDGER_OPERATIONS,
  buildIdempotencyKey,
  buildReferenceId,
  canTransitionOrderStatus,
  createBillingService,
  InMemoryBillingRepository,
} = require("./index.cjs");

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
