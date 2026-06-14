const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildIdempotencyKey,
  buildOrderPurchaseIdempotencyKey,
  buildReferenceId,
  createBillingService,
  InMemoryBillingRepository,
} = require("./index.cjs");
const {
  createBillingIntegrationService,
} = require("./payment-integration.cjs");

function createHarness({ providers, seed, repository = new InMemoryBillingRepository(seed) } = {}) {
  const now = (() => {
    let tick = 0;
    return () => `2026-06-07T00:10:0${tick++}.000Z`;
  })();
  const createId = (() => {
    let tick = 0;
    return (prefix) => `${prefix}-${++tick}`;
  })();
  const billingService = createBillingService({ repository, now, createId });
  const integration = createBillingIntegrationService({
    repository,
    paymentProviders: providers,
    now,
    createId,
  });

  return { repository, billingService, integration };
}

async function createOrder(billingService, orderId = "order-1", accountId = "acct-1") {
  const packageId = `pkg-${orderId}`;
  await billingService.createCreditPackage({
    packageId,
    displayName: `Package ${orderId}`,
    credits: 12,
    bonusCredits: 0,
    priceValue: 1200,
    currency: "CNY",
    enabled: true,
    validityDays: null,
    channelScope: ["mockpay"],
  });
  const referenceId = buildReferenceId({ scope: "order", id: orderId });
  const created = await billingService.createOrder({
    orderId,
    accountId,
    packageId,
    provider: "mockpay",
    referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "order.create",
      referenceId,
      requestId: "req-create",
    }),
  });

  return created.order;
}

function listPurchaseEntries(repository, referenceId) {
  return [...repository.ledgerEntries.values()].filter(
    (entry) => entry.referenceId === referenceId && entry.operation === "purchase",
  );
}

test("createPaymentIntent transitions order from created to pending and returns provider intent", async () => {
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
        clientAction: {
          type: "redirect",
          url: "https://payments.example/checkout/provider-order-1",
        },
      };
    },
    async queryPayment() {
      throw new Error("not needed");
    },
    async verifyCallback() {
      throw new Error("not needed");
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };
  const { billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService);

  const result = await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-1",
    }),
    callbackUrl: "https://example.com/api/payments/callback",
    returnUrl: "https://example.com/orders/complete",
  });

  assert.equal(result.order.status, "pending");
  assert.equal(result.order.providerOrderId, "provider-order-1");
  assert.equal(result.paymentIntent.status, "requires_action");
});

test("createPaymentIntent fails when provider returns mismatched referenceId", async () => {
  const provider = {
    async createPayment({ order }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId: buildReferenceId({ scope: "order", id: "other-order" }),
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment() {
      throw new Error("not needed");
    },
    async verifyCallback() {
      throw new Error("not needed");
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };
  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService, "order-bad-ref");

  await assert.rejects(
    () =>
      integration.createPaymentIntent({
        orderId: order.id,
        referenceId: order.referenceId,
        idempotencyKey: buildIdempotencyKey({
          scope: "payment.intent",
          referenceId: order.referenceId,
          requestId: "req-bad-ref",
        }),
        callbackUrl: "https://example.com/api/payments/callback",
      }),
    (error) => error.code === "ORDER_REFERENCE_MISMATCH",
  );
  assert.equal(repository.orders.get(order.id).status, "created");
});

test("createPaymentIntent fails when provider returns mismatched provider name", async () => {
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "otherpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment() {
      throw new Error("not needed");
    },
    async verifyCallback() {
      throw new Error("not needed");
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };
  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService, "order-bad-provider");

  await assert.rejects(
    () =>
      integration.createPaymentIntent({
        orderId: order.id,
        referenceId: order.referenceId,
        idempotencyKey: buildIdempotencyKey({
          scope: "payment.intent",
          referenceId: order.referenceId,
          requestId: "req-bad-provider",
        }),
        callbackUrl: "https://example.com/api/payments/callback",
      }),
    (error) => error.code === "PAYMENT_PROVIDER_MISMATCH",
  );
  assert.equal(repository.orders.get(order.id).status, "created");
});

test("verified success callback settles order and duplicate callback does not double grant credits", async () => {
  const verifiedEvent = {
    provider: "mockpay",
    eventType: "payment.succeeded",
    providerEventId: "evt-100",
    providerPaymentId: "provider-order-1",
    orderId: "order-1",
    referenceId: buildReferenceId({ scope: "order", id: "order-1" }),
    providerStatus: "SUCCESS",
    amountValue: 1200,
    currency: "CNY",
    occurredAt: "2026-06-07T00:11:00.000Z",
  };

  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment() {
      throw new Error("not needed");
    },
    async verifyCallback() {
      return verifiedEvent;
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };

  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService);
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    callbackUrl: "https://example.com/api/payments/callback",
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-1",
    }),
    callbackUrl: "https://example.com/api/payments/callback",
    returnUrl: "https://example.com/orders/complete",
  });

  const settled = await integration.handlePaymentCallback({
    provider: "mockpay",
    headers: { "x-signature": "ignored-in-test" },
    rawBody: JSON.stringify({ ok: true }),
  });
  const duplicate = await integration.handlePaymentCallback({
    provider: "mockpay",
    headers: { "x-signature": "ignored-in-test" },
    rawBody: JSON.stringify({ ok: true }),
  });

  assert.equal(settled.order.status, "fulfilled");
  assert.equal(duplicate.order.status, "fulfilled");
  assert.deepEqual(settled.account, {
    id: "acct-1",
    accountId: "acct-1",
    availableCredits: 12,
    reservedCredits: 0,
    consumedCredits: 0,
    totalIssuedCredits: 12,
    totalExpiredCredits: 0,
  });

  const purchaseEntries = [...repository.ledgerEntries.values()].filter(
    (entry) => entry.referenceId === order.referenceId && entry.operation === "purchase",
  );
  assert.equal(purchaseEntries.length, 1);
});

test("payment callback fails when success event points to a different providerPaymentId than the bound order", async () => {
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment() {
      throw new Error("not needed");
    },
    async verifyCallback() {
      return {
        provider: "mockpay",
        eventType: "payment.succeeded",
        providerEventId: "evt-wrong-binding",
        providerPaymentId: "provider-other-order",
        orderId: "order-4",
        referenceId: buildReferenceId({ scope: "order", id: "order-4" }),
        providerStatus: "SUCCESS",
        amountValue: 1200,
        currency: "CNY",
        occurredAt: "2026-06-07T00:15:00.000Z",
      };
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };

  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService, "order-4", "acct-4");
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-intent",
    }),
    callbackUrl: "https://example.com/api/payments/callback",
  });

  await assert.rejects(
    () =>
      integration.handlePaymentCallback({
        provider: "mockpay",
        headers: { "x-signature": "ignored-in-test" },
        rawBody: JSON.stringify({ ok: true }),
      }),
    (error) => error.code === "PROVIDER_PAYMENT_MISMATCH",
  );
  assert.equal(repository.orders.get(order.id).status, "pending");
  assert.equal(
    [...repository.ledgerEntries.values()].filter(
      (entry) => entry.referenceId === order.referenceId && entry.operation === "purchase",
    ).length,
    0,
  );
});

test("queryPaymentStatus settles succeeded payment once and keeps ledger consistent", async () => {
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment({ order, providerPaymentId }) {
      return {
        provider: "mockpay",
        providerPaymentId,
        providerEventId: "query-snapshot-1",
        referenceId: order.referenceId,
        status: "succeeded",
        providerStatus: "SUCCESS",
        amountValue: order.amountValue,
        currency: order.currency,
        checkedAt: "2026-06-07T00:12:00.000Z",
      };
    },
    async verifyCallback() {
      throw new Error("not needed");
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };

  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService, "order-2", "acct-2");
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-1",
    }),
    callbackUrl: "https://example.com/api/payments/callback",
  });

  const result = await integration.queryPaymentStatus({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.query",
      referenceId: order.referenceId,
      requestId: "req-2",
    }),
  });
  const entries = [...repository.ledgerEntries.values()].filter(
    (entry) => entry.referenceId === order.referenceId,
  );

  assert.equal(result.order.status, "fulfilled");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].operation, "purchase");
  assert.deepEqual(result.account, {
    id: "acct-2",
    accountId: "acct-2",
    availableCredits: 12,
    reservedCredits: 0,
    consumedCredits: 0,
    totalIssuedCredits: 12,
    totalExpiredCredits: 0,
  });
});

test("query settlement followed by a different success callback does not double grant purchase credits", async () => {
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment({ order, providerPaymentId }) {
      return {
        provider: "mockpay",
        providerPaymentId,
        providerEventId: "query-settled-1",
        referenceId: order.referenceId,
        status: "succeeded",
        providerStatus: "SUCCESS",
        amountValue: order.amountValue,
        currency: order.currency,
        checkedAt: "2026-06-07T00:12:00.000Z",
      };
    },
    async verifyCallback() {
      return {
        provider: "mockpay",
        eventType: "payment.succeeded",
        providerEventId: "evt-after-query",
        providerPaymentId: "provider-order-query-then-callback",
        orderId: "order-query-then-callback",
        referenceId: buildReferenceId({ scope: "order", id: "order-query-then-callback" }),
        providerStatus: "SUCCESS",
        amountValue: 1200,
        currency: "CNY",
        occurredAt: "2026-06-07T00:13:00.000Z",
      };
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };

  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(
    billingService,
    "order-query-then-callback",
    "acct-query-then-callback",
  );
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-intent",
    }),
    callbackUrl: "https://example.com/api/payments/callback",
  });

  const queried = await integration.queryPaymentStatus({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.query",
      referenceId: order.referenceId,
      requestId: "req-query",
    }),
  });
  const callback = await integration.handlePaymentCallback({
    provider: "mockpay",
    headers: { "x-signature": "ignored-in-test" },
    rawBody: JSON.stringify({ ok: true }),
  });

  const purchaseEntries = listPurchaseEntries(repository, order.referenceId);
  assert.equal(queried.order.status, "fulfilled");
  assert.equal(callback.order.status, "fulfilled");
  assert.equal(purchaseEntries.length, 1);
  assert.equal(
    purchaseEntries[0].idempotencyKey,
    buildOrderPurchaseIdempotencyKey(order.referenceId),
  );
});

test("two different success events for the same order still produce one purchase ledger", async () => {
  const callbackEvents = ["evt-success-1", "evt-success-2"];
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment() {
      throw new Error("not needed");
    },
    async verifyCallback() {
      const providerEventId = callbackEvents.shift() || "evt-success-3";
      return {
        provider: "mockpay",
        eventType: "payment.succeeded",
        providerEventId,
        providerPaymentId: "provider-order-multi-success",
        orderId: "order-multi-success",
        referenceId: buildReferenceId({ scope: "order", id: "order-multi-success" }),
        providerStatus: "SUCCESS",
        amountValue: 1200,
        currency: "CNY",
        occurredAt: "2026-06-07T00:11:00.000Z",
      };
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };

  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService, "order-multi-success", "acct-multi-success");
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    callbackUrl: "https://example.com/api/payments/callback",
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-intent",
    }),
  });

  const first = await integration.handlePaymentCallback({
    provider: "mockpay",
    headers: { "x-signature": "ignored-in-test" },
    rawBody: JSON.stringify({ ok: true }),
  });
  const second = await integration.handlePaymentCallback({
    provider: "mockpay",
    headers: { "x-signature": "ignored-in-test" },
    rawBody: JSON.stringify({ ok: true }),
  });

  const purchaseEntries = listPurchaseEntries(repository, order.referenceId);
  assert.equal(first.order.status, "fulfilled");
  assert.equal(second.order.status, "fulfilled");
  assert.equal(purchaseEntries.length, 1);
});

test("fulfilled order settles again by returning the original purchase ledger", async () => {
  let queryEventId = "query-fulfilled-1";
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment({ order, providerPaymentId }) {
      return {
        provider: "mockpay",
        providerPaymentId,
        providerEventId: queryEventId,
        referenceId: order.referenceId,
        status: "succeeded",
        providerStatus: "SUCCESS",
        amountValue: order.amountValue,
        currency: order.currency,
        checkedAt: "2026-06-07T00:12:00.000Z",
      };
    },
    async verifyCallback() {
      throw new Error("not needed");
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };

  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(
    billingService,
    "order-fulfilled-repeat",
    "acct-fulfilled-repeat",
  );
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-intent",
    }),
    callbackUrl: "https://example.com/api/payments/callback",
  });

  const first = await integration.queryPaymentStatus({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.query",
      referenceId: order.referenceId,
      requestId: "req-query-1",
    }),
  });
  queryEventId = "query-fulfilled-2";
  const second = await integration.queryPaymentStatus({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.query",
      referenceId: order.referenceId,
      requestId: "req-query-2",
    }),
  });

  const purchaseEntries = listPurchaseEntries(repository, order.referenceId);
  assert.equal(first.order.status, "fulfilled");
  assert.equal(second.order.status, "fulfilled");
  assert.equal(first.ledgerEntry.id, second.ledgerEntry.id);
  assert.equal(purchaseEntries.length, 1);
});

test("queryPaymentStatus fails when success result points to a different providerPaymentId than the bound order", async () => {
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment({ order }) {
      return {
        provider: "mockpay",
        providerPaymentId: "provider-other-order",
        providerEventId: "query-mismatch",
        referenceId: order.referenceId,
        status: "succeeded",
        providerStatus: "SUCCESS",
        amountValue: order.amountValue,
        currency: order.currency,
        checkedAt: "2026-06-07T00:16:00.000Z",
      };
    },
    async verifyCallback() {
      throw new Error("not needed");
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };

  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService, "order-5", "acct-5");
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-intent",
    }),
    callbackUrl: "https://example.com/api/payments/callback",
  });

  await assert.rejects(
    () =>
      integration.queryPaymentStatus({
        orderId: order.id,
        referenceId: order.referenceId,
        idempotencyKey: buildIdempotencyKey({
          scope: "payment.query",
          referenceId: order.referenceId,
          requestId: "req-query",
        }),
      }),
    (error) => error.code === "PROVIDER_PAYMENT_MISMATCH",
  );
  assert.equal(repository.orders.get(order.id).status, "pending");
  assert.equal(
    [...repository.ledgerEntries.values()].filter(
      (entry) => entry.referenceId === order.referenceId && entry.operation === "purchase",
    ).length,
    0,
  );
});

test("createRefundRequest starts refund flow and queryRefundStatus can finish status transition", async () => {
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment() {
      return {
        provider: "mockpay",
        providerPaymentId: "provider-order-3",
        providerEventId: "evt-pay-1",
        referenceId: buildReferenceId({ scope: "order", id: "order-3" }),
        status: "succeeded",
        providerStatus: "SUCCESS",
        amountValue: 1200,
        currency: "CNY",
        checkedAt: "2026-06-07T00:13:00.000Z",
      };
    },
    async verifyCallback() {
      throw new Error("not needed");
    },
    async createRefund({ order }) {
      return {
        provider: "mockpay",
        providerRefundId: `refund-${order.id}`,
        referenceId: order.referenceId,
        status: "pending",
        providerStatus: "REFUND_PENDING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryRefund({ order, providerRefundId }) {
      return {
        provider: "mockpay",
        providerRefundId,
        referenceId: order.referenceId,
        status: "succeeded",
        providerStatus: "REFUND_SUCCESS",
        amountValue: order.amountValue,
        currency: order.currency,
        checkedAt: "2026-06-07T00:14:00.000Z",
      };
    },
  };

  const { billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService, "order-3", "acct-3");
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-1",
    }),
    callbackUrl: "https://example.com/api/payments/callback",
  });
  await integration.queryPaymentStatus({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.query",
      referenceId: order.referenceId,
      requestId: "req-2",
    }),
  });

  const refund = await integration.createRefundRequest({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "refund.create",
      referenceId: order.referenceId,
      requestId: "req-3",
    }),
    reason: "user-request",
  });
  const refunded = await integration.queryRefundStatus({
    orderId: order.id,
    referenceId: order.referenceId,
    providerRefundId: refund.refund.providerRefundId,
  });

  assert.equal(refund.order.status, "refund_pending");
  assert.equal(refunded.order.status, "refunded");
});

test("queryRefundStatus fails when refund result referenceId does not match the order", async () => {
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment() {
      return {
        provider: "mockpay",
        providerPaymentId: "provider-order-6",
        providerEventId: "evt-pay-6",
        referenceId: buildReferenceId({ scope: "order", id: "order-6" }),
        status: "succeeded",
        providerStatus: "SUCCESS",
        amountValue: 1200,
        currency: "CNY",
        checkedAt: "2026-06-07T00:17:00.000Z",
      };
    },
    async verifyCallback() {
      throw new Error("not needed");
    },
    async createRefund({ order }) {
      return {
        provider: "mockpay",
        providerRefundId: `refund-${order.id}`,
        referenceId: order.referenceId,
        status: "pending",
        providerStatus: "REFUND_PENDING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryRefund({ providerRefundId }) {
      return {
        provider: "mockpay",
        providerRefundId,
        referenceId: buildReferenceId({ scope: "order", id: "other-order" }),
        status: "succeeded",
        providerStatus: "REFUND_SUCCESS",
        amountValue: 1200,
        currency: "CNY",
        checkedAt: "2026-06-07T00:18:00.000Z",
      };
    },
  };

  const { repository, billingService, integration } = createHarness({
    providers: { mockpay: provider },
  });
  const order = await createOrder(billingService, "order-6", "acct-6");
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-intent",
    }),
    callbackUrl: "https://example.com/api/payments/callback",
  });
  await integration.queryPaymentStatus({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.query",
      referenceId: order.referenceId,
      requestId: "req-query",
    }),
  });
  const refund = await integration.createRefundRequest({
    orderId: order.id,
    referenceId: order.referenceId,
    idempotencyKey: buildIdempotencyKey({
      scope: "refund.create",
      referenceId: order.referenceId,
      requestId: "req-refund",
    }),
  });

  await assert.rejects(
    () =>
      integration.queryRefundStatus({
        orderId: order.id,
        referenceId: order.referenceId,
        providerRefundId: refund.refund.providerRefundId,
      }),
    (error) => error.code === "ORDER_REFERENCE_MISMATCH",
  );
  assert.equal(repository.orders.get(order.id).status, "refund_pending");
});

test("payment settlement rolls paid state back when purchase ledger insert fails", async () => {
  const provider = {
    async createPayment({ order, referenceId }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        referenceId,
        status: "requires_action",
        providerStatus: "WAITING",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async queryPayment({ order }) {
      return {
        provider: "mockpay",
        providerPaymentId: `provider-${order.id}`,
        providerEventId: "evt-purchase-failure",
        referenceId: order.referenceId,
        status: "succeeded",
        providerStatus: "SUCCESS",
        amountValue: order.amountValue,
        currency: order.currency,
      };
    },
    async verifyCallback() {
      throw new Error("not needed");
    },
    async createRefund() {
      throw new Error("not needed");
    },
    async queryRefund() {
      throw new Error("not needed");
    },
  };
  const repository = new PurchaseFailingRepository();
  const { billingService, integration } = createHarness({
    providers: { mockpay: provider },
    repository,
  });
  const order = await createOrder(billingService, "order-purchase-failure");
  await integration.createPaymentIntent({
    orderId: order.id,
    referenceId: order.referenceId,
    callbackUrl: "https://example.com/api/payments/callback",
    idempotencyKey: buildIdempotencyKey({
      scope: "payment.intent",
      referenceId: order.referenceId,
      requestId: "req-intent",
    }),
  });

  await assert.rejects(() =>
    integration.queryPaymentStatus({
      orderId: order.id,
      referenceId: order.referenceId,
      idempotencyKey: buildIdempotencyKey({
        scope: "payment.query",
        referenceId: order.referenceId,
        requestId: "req-query-failure",
      }),
    }),
  );

  assert.equal(repository.orders.get(order.id).status, "pending");
  assert.equal(
    [...repository.ledgerEntries.values()].some((entry) => entry.operation === "purchase"),
    false,
  );
});

class PurchaseFailingRepository extends InMemoryBillingRepository {
  async insertLedgerEntry(record) {
    if (record.operation === "purchase") {
      throw new Error("Injected purchase ledger failure.");
    }
    return super.insertLedgerEntry(record);
  }
}
