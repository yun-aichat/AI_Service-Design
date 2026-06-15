const assert = require("node:assert/strict");
const test = require("node:test");

const {
  InMemoryBillingRepository,
  createBillingService,
} = require("./billing/index.cjs");
const {
  BillingPortalError,
  createBillingPortalService,
} = require("./billing-portal.cjs");

function createHarness(seed = {}) {
  const repository = new InMemoryBillingRepository(seed);
  const billingService = createBillingService({
    repository,
    now: () => "2026-06-15T00:00:00.000Z",
  });
  const portal = createBillingPortalService({
    billingRepository: repository,
    billingService,
  });
  return { repository, billingService, portal };
}

const signedInUser = { id: "user-1" };

test("billing portal rejects anonymous requests", async () => {
  const { portal } = createHarness();

  await assert.rejects(
    () => portal.getMyCreditAccount({}),
    (error) => error instanceof BillingPortalError && error.code === "UNAUTHENTICATED",
  );
});

test("billing portal resolves the signed-in user's credit account", async () => {
  const { billingService, portal } = createHarness();
  await billingService.purchaseCredits({
    accountId: signedInUser.id,
    orderId: "order-1",
    referenceType: "order",
    referenceId: "order:order-1",
    credits: 120,
    idempotencyKey: "credit.purchase:order:order-1:req-1",
  });

  const account = await portal.getMyCreditAccount({ user: signedInUser });

  assert.equal(account.accountId, signedInUser.id);
  assert.equal(account.availableCredits, 120);
});

test("billing portal paginates packages by sort order", async () => {
  const { billingService, portal } = createHarness();
  await billingService.createCreditPackage({
    packageId: "pro",
    displayName: "Pro",
    credits: 500,
    bonusCredits: 50,
    priceValue: 4990,
    currency: "CNY",
    enabled: true,
    sortOrder: 20,
  });
  await billingService.createCreditPackage({
    packageId: "starter",
    displayName: "Starter",
    credits: 100,
    bonusCredits: 0,
    priceValue: 990,
    currency: "CNY",
    enabled: true,
    sortOrder: 10,
  });

  const page = await portal.listCreditPackages({
    user: signedInUser,
    limit: 1,
    offset: 0,
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].packageId, "starter");
  assert.equal(page.page.total, 2);
  assert.equal(page.page.hasMore, true);
});

test("billing portal paginates only the signed-in user's ledger entries", async () => {
  const { repository, portal } = createHarness({
    ledgerEntries: {
      "ledger-1": {
        id: "ledger-1",
        accountId: signedInUser.id,
        operation: "purchase",
        referenceType: "order",
        referenceId: "order:1",
        availableDelta: 100,
        reservedDelta: 0,
        consumedDelta: 0,
        credits: 100,
        createdAt: "2026-06-15T10:00:00.000Z",
      },
      "ledger-2": {
        id: "ledger-2",
        accountId: "other-user",
        operation: "purchase",
        referenceType: "order",
        referenceId: "order:2",
        availableDelta: 50,
        reservedDelta: 0,
        consumedDelta: 0,
        credits: 50,
        createdAt: "2026-06-15T11:00:00.000Z",
      },
      "ledger-3": {
        id: "ledger-3",
        accountId: signedInUser.id,
        operation: "commit",
        referenceType: "ai_run",
        referenceId: "run:1",
        availableDelta: 0,
        reservedDelta: -10,
        consumedDelta: 10,
        credits: 10,
        createdAt: "2026-06-15T12:00:00.000Z",
      },
    },
  });
  assert.ok(repository);

  const page = await portal.listMyLedgerEntries({
    user: signedInUser,
    limit: 1,
    offset: 0,
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].id, "ledger-3");
  assert.equal(page.page.total, 2);
  assert.equal(page.page.hasMore, true);
});

test("billing portal filters ledger entries by operation", async () => {
  const { portal } = createHarness({
    ledgerEntries: {
      "ledger-1": {
        id: "ledger-1",
        accountId: signedInUser.id,
        operation: "purchase",
        referenceType: "order",
        referenceId: "order:1",
        availableDelta: 100,
        reservedDelta: 0,
        consumedDelta: 0,
        credits: 100,
        createdAt: "2026-06-15T10:00:00.000Z",
      },
      "ledger-2": {
        id: "ledger-2",
        accountId: signedInUser.id,
        operation: "commit",
        referenceType: "ai_run",
        referenceId: "run:1",
        availableDelta: 0,
        reservedDelta: -10,
        consumedDelta: 10,
        credits: 10,
        createdAt: "2026-06-15T12:00:00.000Z",
      },
    },
  });

  const page = await portal.listMyLedgerEntries({
    user: signedInUser,
    operation: "purchase",
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].operation, "purchase");
});
