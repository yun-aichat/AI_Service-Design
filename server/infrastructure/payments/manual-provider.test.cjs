const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ManualPaymentProvider,
  signManualPaymentCallback,
} = require("./manual-provider.cjs");

test("ManualPaymentProvider verifies signed callbacks", async () => {
  const provider = new ManualPaymentProvider({
    callbackSecret: "test-secret",
    now: () => "2026-06-07T00:20:00.000Z",
  });

  const rawBody = JSON.stringify({
    eventType: "payment.succeeded",
    providerEventId: "evt-1",
    providerPaymentId: "manualpay_order-1",
    orderId: "order-1",
    referenceId: "order:order-1",
    providerStatus: "SUCCESS",
    amountValue: 1200,
    currency: "CNY",
  });
  const signature = signManualPaymentCallback({
    callbackSecret: "test-secret",
    rawBody,
  });

  const event = await provider.verifyCallback({
    headers: { "x-manualpay-signature": signature },
    rawBody,
  });

  assert.equal(event.provider, "manualpay");
  assert.equal(event.eventType, "payment.succeeded");
  assert.equal(event.providerEventId, "evt-1");
});
