const PAYMENT_PROVIDER_METHODS = Object.freeze([
  "createPayment",
  "queryPayment",
  "verifyCallback",
  "createRefund",
  "queryRefund",
]);

const PAYMENT_INTENT_STATUSES = Object.freeze([
  "requires_action",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);

const VERIFIED_PAYMENT_EVENT_TYPES = Object.freeze([
  "payment.succeeded",
  "payment.failed",
  "payment.closed",
  "refund.pending",
  "refund.succeeded",
  "refund.failed",
]);

class PaymentProviderContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "PaymentProviderContractError";
  }
}

function assertPaymentProvider(provider) {
  if (!provider || typeof provider !== "object") {
    throw new PaymentProviderContractError("Payment provider must be an object.");
  }

  for (const method of PAYMENT_PROVIDER_METHODS) {
    if (typeof provider[method] !== "function") {
      throw new PaymentProviderContractError(
        `Payment provider must implement ${method}().`,
      );
    }
  }

  return provider;
}

function createUnimplementedPaymentProvider(name = "unconfigured") {
  return assertPaymentProvider({
    name,
    async createPayment() {
      throw notConfigured(name, "createPayment");
    },
    async queryPayment() {
      throw notConfigured(name, "queryPayment");
    },
    async verifyCallback() {
      throw notConfigured(name, "verifyCallback");
    },
    async createRefund() {
      throw notConfigured(name, "createRefund");
    },
    async queryRefund() {
      throw notConfigured(name, "queryRefund");
    },
  });
}

function notConfigured(name, method) {
  return new PaymentProviderContractError(
    `Payment provider "${name}" does not implement ${method}() yet.`,
  );
}

module.exports = {
  PAYMENT_INTENT_STATUSES,
  PAYMENT_PROVIDER_METHODS,
  VERIFIED_PAYMENT_EVENT_TYPES,
  PaymentProviderContractError,
  assertPaymentProvider,
  createUnimplementedPaymentProvider,
};
